// 데이터 절약 모드: 학생 기기 ↔ 선생님 기기 연결
//  ① 직접 연결(WebRTC): 같은 와이파이·학교망에서 기기끼리 바로 주고받음. 연결되면 학생은 Firebase 연결을 끊음
//  ② 우편함 연결: 직접 연결이 막힌 학교망이면 Firebase를 우편함처럼 거쳐 선생님 기기와 주고받음 (게임은 그대로 됨)
// Firebase에는 "연결 정보 한 번 교환(sig)"과 "우편함(relay)"만 씀. 게임 데이터는 선생님 기기 메모리에 있음
import { serve } from './p2pdb.js?v=202611180144';

const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
// 주고받은 양 (점검용, 화면에는 안 보임): window.__p2pStats
const STATS = { up: 0, down: 0 }; try { globalThis.__p2pStats = STATS; } catch {}
const nonce = () => Math.random().toString(36).slice(2, 10);
export const DIRECT_MS = 5000;     // 직접 연결을 기다리는 시간. 넘으면 Firebase 우편함으로 자동 전환 (교육청 와이파이 AP 격리 대비)
const IDLE_MS = 12000;             // 이 시간 동안 아무 소식이 없으면 연결이 끊긴 것으로 봄 (학생은 4초마다 신호를 보냄)
// 연결 정보를 다 모을 때까지(또는 ms까지) 기다림 → 한 번에 주고받음 (Firebase 쓰기 횟수 최소)
function iceDone(pc, ms) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => { const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
}
// DataChannel을 연결(conn) 모양으로
function dcConn(dc, pc, kind = 'p2p') {
  const h = [], c = []; let closed = false;
  const fireClose = () => { if (closed) return; closed = true; c.forEach(f => { try { f(); } catch {} }); };
  dc.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } h.forEach(f => f(m)); };
  dc.onclose = fireClose;
  // 창이 갑자기 닫히면 브라우저가 늦게(수십 초) 알아채므로: 끊김 상태 6초, 또는 12초 동안 소식이 없으면 닫음
  let last = Date.now(), dTimer = null;
  const prevMsg = dc.onmessage; dc.onmessage = e => { last = Date.now(); prevMsg(e); };
  const idle = setInterval(() => { if (Date.now() - last > IDLE_MS) { clearInterval(idle); conn.close(); } }, 3000);
  pc.addEventListener('connectionstatechange', () => {
    const st = pc.connectionState;
    if (['failed', 'closed'].includes(st)) conn.close();
    else if (st === 'disconnected') { clearTimeout(dTimer); dTimer = setTimeout(() => { if (pc.connectionState !== 'connected') conn.close(); }, 6000); }
    else if (st === 'connected') clearTimeout(dTimer);
  });
  c.push(() => { clearInterval(idle); clearTimeout(dTimer); });
  const conn = { kind, send: m => { if (dc.readyState === 'open') dc.send(JSON.stringify(m)); else throw new Error('연결이 닫혔어요.'); }, onMessage: f => h.push(f), onClose: f => c.push(f), close: () => { try { dc.close(); } catch {} try { pc.close(); } catch {} fireClose(); } };
  return conn;
}

// ── 선생님 기기: 학생 연결 받기 ──
export function startHost({ fb, db, code, mem, onChange }) {
  const room = 'rooms/' + code, peers = new Map(), offs = [];
  const R = p => fb.ref(db, room + '/' + p);
  let stopped = false;
  const changed = () => onChange?.(Object.fromEntries([...peers].map(([uid, e]) => [uid, e.kind])));
  function attach(uid, entry, conn) {
    entry.conn = conn;
    serve(mem, conn, { code, uid, isCurrent: () => peers.get(uid) === entry, onClose: () => { if (peers.get(uid) === entry) { peers.delete(uid); changed(); } } });
    changed();
  }
  const replace = (uid, entry) => { const old = peers.get(uid); peers.set(uid, entry); if (old) try { old.close(); } catch {} };
  // 선생님 기기가 켜져 있음을 표시 (창을 닫으면 Firebase가 자동으로 false로 바꿈)
  // 선생님 창이 갑자기 닫혀도 Firebase가 알아서 연결 정보(sig·relay·relayCtl)를 지우고 '꺼짐'으로 표시
  const armCleanup = () => { fb.set(R('hostOn'), true).catch(() => {}); fb.onDisconnect(R('hostOn')).set(false).catch(() => {}); for (const p of ['sig', 'relay', 'relayCtl']) fb.onDisconnect(R(p)).remove().catch(() => {}); };
  armCleanup();
  offs.push(fb.onValue(fb.ref(db, '.info/connected'), s => { if (s.val() === true && !stopped) armCleanup(); }));

  // ① 직접 연결: 학생이 sig/학생계정 에 연결 정보(offer)를 쓰면 답(answer)을 씀
  async function onOffer(uid, v) {
    if (stopped || !v || !v.offer || v.an === v.n || peers.get(uid)?.n === v.n) return;
    if (typeof RTCPeerConnection === 'undefined') return;
    const pc = new RTCPeerConnection(ICE), entry = { n: v.n, kind: 'p2p', close: () => { try { entry.conn ? entry.conn.close() : pc.close(); } catch {} } };
    replace(uid, entry);
    pc.ondatachannel = e => { const dc = e.channel; dc.onopen = () => { if (peers.get(uid) === entry) { attach(uid, entry, dcConn(dc, pc)); fb.remove(R('sig/' + uid)).catch(() => {}); } }; };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: v.offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc, 1200);
      await fb.update(R('sig/' + uid), { answer: pc.localDescription.sdp, an: v.n });
    } catch (e) { console.warn('[선생님 기기] 직접 연결 준비 실패', e); }
  }
  offs.push(fb.onChildAdded(R('sig'), s => onOffer(s.key, s.val())), fb.onChildChanged(R('sig'), s => onOffer(s.key, s.val())));

  // ② 우편함: 학생이 relayCtl/학생계정 에 신호를 쓰면 relay/학생계정 우편함을 열어 둠 (신호와 메시지 칸을 나눠 메시지마다 신호를 다시 받지 않음)
  function onRelay(uid, v) {
    if (stopped || !v || !v.n) return;
    const cur = peers.get(uid);
    if (v.gone) { if (cur && cur.kind === 'relay' && cur.n === v.n) cur.close(); return; }
    if (cur && cur.kind === 'relay' && cur.n === v.n) return;
    const h = [], c = [], u = []; let closed = false;
    const entry = { n: v.n, kind: 'relay' };
    const conn = { kind: 'relay', send: m => { fb.push(R('relay/' + uid + '/down'), { m: JSON.stringify(m) }).catch(() => {}); }, onMessage: f => h.push(f), onClose: f => c.push(f), close: () => { if (closed) return; closed = true; u.forEach(f => f()); c.forEach(f => { try { f(); } catch {} }); } };
    entry.close = conn.close;
    replace(uid, entry);
    let last = Date.now();
    u.push(fb.onChildAdded(R('relay/' + uid + '/up'), s => { let m; try { m = JSON.parse(s.val().m); } catch { return; } last = Date.now(); fb.remove(s.ref).catch(() => {}); if (!closed) h.forEach(f => f(m)); }));
    // 우편함 학생도 4초마다 신호를 보냄. 25초 넘게 소식이 없으면 끊긴 것으로 보고, 신호(ack)를 지워 학생 기기가 다시 연결하게 함
    const idle = setInterval(() => { if (Date.now() - last > 25000) { conn.close(); fb.update(R('relayCtl/' + uid), { ack: null }).catch(() => {}); } }, 5000);
    u.push(() => clearInterval(idle));
    attach(uid, entry, conn);
    fb.update(R('relayCtl/' + uid), { ack: v.n }).catch(() => {});
  }
  offs.push(fb.onChildAdded(R('relayCtl'), s => onRelay(s.key, s.val())), fb.onChildChanged(R('relayCtl'), s => onRelay(s.key, s.val())));

  return {
    peers: () => Object.fromEntries([...peers].map(([uid, e]) => [uid, e.kind])),
    kick(uid) { const e = peers.get(uid); if (e) setTimeout(() => { if (peers.get(uid) === e) { peers.delete(uid); e.close(); changed(); } }, 2000); },   // '내보내짐' 소식이 먼저 도착하도록 2초 뒤 끊음
    async stop() {
      stopped = true; offs.forEach(f => { try { f(); } catch {} });
      for (const e of peers.values()) try { e.close(); } catch {}
      peers.clear();
      await Promise.all(['sig', 'relay', 'relayCtl'].map(p => fb.remove(R(p)).catch(() => {})));   // 남은 연결 정보 지우기
      await fb.set(R('hostOn'), false).catch(() => {});
      for (const p of ['hostOn', 'sig', 'relay', 'relayCtl']) fb.onDisconnect(R(p)).cancel().catch(() => {});
    },
  };
}

// ── 학생 기기: 선생님 기기와 연결. 직접 연결을 먼저 해 보고, 안 되면 우편함 ──
// mode: 'auto' | 'relay'(우편함만, 시험용) | 'block'(직접 연결이 막힌 학교망 흉내, 시험용)
export async function connectStudent({ fb, db, code, uid, mode = 'auto', log = () => {} }) {
  const room = 'rooms/' + code, R = p => fb.ref(db, room + '/' + p);
  const on = (await fb.get(R('hostOn'))).val();
  if (on === false) throw Object.assign(new Error('선생님 화면이 꺼져 있어요. 선생님 컴퓨터의 게임 화면이 열려 있는지 확인해 주세요.'), { kind: 'host' });
  if (mode !== 'relay' && typeof RTCPeerConnection !== 'undefined') {
    try { const l = await direct(); log('직접 연결'); return l; } catch (e) { log('직접 연결 실패 → 우편함 연결: ' + (e.message || e)); }
  }
  return relay();

  async function direct() {
    const pc = new RTCPeerConnection(ICE), dc = pc.createDataChannel('db', { ordered: true }), n = nonce(), t0 = Date.now();
    const left = () => Math.max(0, DIRECT_MS - (Date.now() - t0));      // 5초 안에서 남은 시간
    let unsub = null;
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc, 1200);
      const sdp = mode === 'block' ? pc.localDescription.sdp.split('\r\n').filter(l => !l.startsWith('a=candidate')).join('\r\n') : pc.localDescription.sdp;   // 시험용: 연결 경로를 빼서 직접 연결 실패를 흉내
      await fb.set(R('sig/' + uid), { offer: sdp, n });
      const answer = await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('선생님 기기의 답이 없어요')), left());
        unsub = fb.onValue(R('sig/' + uid), s => { const v = s.val(); if (v && v.an === n && v.answer) { clearTimeout(t); res(v.answer); } });
      });
      unsub?.(); unsub = null;
      await pc.setRemoteDescription({ type: 'answer', sdp: mode === 'block' ? answer.split('\r\n').filter(l => !l.startsWith('a=candidate')).join('\r\n') : answer });
      await new Promise((res, rej) => {
        if (dc.readyState === 'open') return res();
        const t = setTimeout(() => rej(new Error('5초 안에 직접 연결이 안 됨 (학교 와이파이가 기기끼리 연결을 막는 것 같아요)')), left());
        dc.onopen = () => { clearTimeout(t); res(); };
        pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed') { clearTimeout(t); rej(new Error('직접 연결 실패')); } });
      });
      return dcConn(dc, pc, 'p2p');
    } catch (e) { unsub?.(); try { pc.close(); } catch {} fb.remove(R('sig/' + uid)).catch(() => {}); throw e; }   // 실패하면 연결 정보 바로 지움
  }

  async function relay() {
    const n = nonce(), base = 'relay/' + uid, ctl = 'relayCtl/' + uid;
    await fb.remove(R(base)).catch(() => {});
    await fb.set(R(ctl), { n, gone: false });
    fb.onDisconnect(R(ctl + '/gone')).set(true).catch(() => {});
    await new Promise((res, rej) => {
      const t = setTimeout(() => { off(); rej(Object.assign(new Error('선생님 기기가 응답하지 않아요. 선생님 컴퓨터의 게임 화면이 열려 있는지 확인해 주세요.'), { kind: 'host' })); }, 12000);
      const off = fb.onValue(R(ctl + '/ack'), s => { if (s.val() === n) { clearTimeout(t); setTimeout(() => off(), 0); res(); } });
    });
    const h = [], c = []; let closed = false;
    const off = fb.onChildAdded(R(base + '/down'), s => { let m; try { STATS.down += s.val().m.length; m = JSON.parse(s.val().m); } catch { return; } fb.remove(s.ref).catch(() => {}); if (!closed) h.forEach(f => f(m)); });
    // Firebase 연결이 끊기면 우편함도 끊긴 것으로 봄 (다시 연결하면 새 우편함)
    const offConn = fb.onValue(fb.ref(db, '.info/connected'), s => { if (s.val() === false) close(); });
    const offAck = fb.onValue(R(ctl + '/ack'), s => { if (s.val() !== n) close(true); });   // 선생님 기기가 우편함을 닫았거나(창 닫힘 포함) 지웠으면 다시 연결
    function close(hostGone = false) { if (closed) return; closed = true; off(); offConn(); offAck(); fb.onDisconnect(R(ctl + '/gone')).cancel().catch(() => {});
      // 선생님 기기가 없으면 연결 정보를 다시 만들지 않고 지움
      if (hostGone) fb.remove(R(ctl)).catch(() => {}); else fb.update(R(ctl), { gone: true }).catch(() => {});
      c.forEach(f => { try { f(); } catch {} }); }
    return { kind: 'relay', send: m => { if (closed) throw new Error('연결이 닫혔어요.'); const j = JSON.stringify(m); STATS.up += j.length; fb.push(R(base + '/up'), { m: j }).catch(() => {}); }, onMessage: f => h.push(f), onClose: f => c.push(f), close: () => close(false) };
  }
}
