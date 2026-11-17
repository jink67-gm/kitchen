// 데이터 절약 모드: 선생님 기기가 게임 서버
// Firebase 실시간 데이터베이스와 같은 모양(ref·get·set·update·remove·onValue·runTransaction·onDisconnect)으로
// 쓰는 작은 메모리 데이터베이스. cloud.js는 this.ops만 바꿔 끼우면 그대로 동작함.
//  - localOps: 선생님 기기(호스트) 자신이 쓰는 것
//  - serve: 학생 연결 하나를 맡아 요청을 처리 (권한 검사 포함)
//  - remoteOps: 학생 기기가 쓰는 것 (요청을 선생님 기기로 보냄)

const split = p => String(p || '').split('/').filter(Boolean);
const join = ks => ks.join('/');
export const clone = v => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
// 키 순서와 상관없이 같은 값이면 같은 글자 (트랜잭션 비교용)
export const canon = v => JSON.stringify(v === undefined ? null : v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => ((o[key] = x[key]), o), {}) : x));
// Firebase처럼 null·빈 객체는 지움
function clean(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) { const a = v.map(clean); return a.every(x => x === null) ? null : a; }
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const c = clean(v[k]); if (c !== null) o[k] = c; } return Object.keys(o).length ? o : null; }
  return v;
}
const TS = { '.sv': 'timestamp' };
// 서버 시각 표시를 선생님 기기의 현재 시각으로 바꿈
function resolve(v, now) {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return now;
    if (Array.isArray(v)) return v.map(x => resolve(x, now));
    const o = {}; for (const k of Object.keys(v)) o[k] = resolve(v[k], now); return o;
  }
  return v;
}
const snap = v => { const c = clone(v); return { val: () => clone(c), exists: () => c !== null }; };
// 두 값의 차이: [[하위 경로, 새 값], ...] (바뀐 부분만 보내 데이터 절약. 우편함 연결에서 특히 중요)
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function diff(a, b, pre = '', out = []) {
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[k] === undefined ? null : a[k], y = b[k] === undefined ? null : b[k];
      if (x === y || canon(x) === canon(y)) continue;
      if (isObj(x) && isObj(y)) diff(x, y, pre + k + '/', out); else out.push([pre + k, y]);
    }
  } else if (canon(a) !== canon(b)) out.push([pre.replace(/\/$/, ''), b]);
  return out;
}
export function patch(v, d) {
  for (const [p, x] of d) {
    const ks = split(p); if (!ks.length) { v = clone(x); continue; }
    if (!isObj(v)) v = {};
    let o = v; for (let i = 0; i < ks.length - 1; i++) { if (!isObj(o[ks[i]])) o[ks[i]] = {}; o = o[ks[i]]; }
    if (x === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clone(x);
  }
  return clean(v);
}
const related = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/') || a === '' || b === '';

export class MemDB {
  constructor(root = null) { this.root = clean(root); this.subs = new Set(); this.version = 0; }
  read(path) { let v = this.root; for (const k of split(path)) { if (v === null || typeof v !== 'object') return null; v = v[k]; if (v === undefined) return null; } return v; }
  // 한 경로에 값 쓰기 (값은 이미 정리된 것). 빈 부모는 위로 올라가며 지움
  put(path, val) {
    const ks = split(path);
    if (!ks.length) { this.root = val; return; }
    if (val === null) {
      const chain = []; let o = this.root;
      for (let i = 0; i < ks.length - 1; i++) { if (o === null || typeof o !== 'object' || o[ks[i]] == null) return; chain.push([o, ks[i]]); o = o[ks[i]]; }
      if (o === null || typeof o !== 'object') return;
      if (Array.isArray(o)) o[ks[ks.length - 1]] = null; else delete o[ks[ks.length - 1]];
      let child = o;
      for (let i = chain.length - 1; i >= 0; i--) { const [p, k] = chain[i]; if (child && typeof child === 'object' && Object.keys(child).length === 0) delete p[k]; else break; child = p; }
      if (this.root && typeof this.root === 'object' && Object.keys(this.root).length === 0) this.root = null;
      return;
    }
    if (this.root === null || typeof this.root !== 'object') this.root = {};
    let o = this.root;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] === null || o[ks[i]] === undefined || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  // 바뀐 경로들과 관계있는 구독에만 새 값을 알림 (값이 그대로면 알리지 않음)
  notify(paths) {
    this.version++;
    for (const s of this.subs) {
      if (!paths.some(p => related(p, s.path))) continue;
      const v = this.read(s.path), c = canon(v);
      if (c !== s.last) { s.last = c; try { s.cb(v); } catch (e) { console.warn('[선생님 기기 서버] 구독 처리 오류', e); } }
    }
  }
  set(path, v, now = Date.now()) { path = join(split(path)); this.put(path, clean(resolve(v, now))); this.notify([path]); }
  update(path, obj, now = Date.now()) {
    const base = split(path), changed = [];
    for (const k of Object.keys(obj || {})) { const p = join([...base, ...split(k)]); this.put(p, clean(resolve(obj[k], now))); changed.push(p); }
    if (changed.length) this.notify(changed);
  }
  subscribe(path, cb) {
    const s = { path: join(split(path)), cb, last: undefined };
    this.subs.add(s);
    const v = this.read(s.path); s.last = canon(v);
    queueMicrotask(() => { if (this.subs.has(s)) cb(v); });
    return () => this.subs.delete(s);
  }
}

const refOf = (db, path) => ({ path: join(split(path)) });
const INFO_CONN = '.info/connected', INFO_OFFSET = '.info/serverTimeOffset';

// ── 선생님 기기 자신이 쓰는 ops ──
export function localOps(mem) {
  return {
    ref: refOf,
    get: async r => snap(mem.read(r.path)),
    set: async (r, v) => mem.set(r.path, v),
    update: async (r, v) => mem.update(r.path, v),
    remove: async r => mem.set(r.path, null),
    onValue(r, cb) {
      if (r.path === INFO_CONN) { queueMicrotask(() => cb(snap(true))); return () => {}; }
      if (r.path === INFO_OFFSET) { queueMicrotask(() => cb(snap(0))); return () => {}; }
      return mem.subscribe(r.path, v => cb(snap(v)));
    },
    async runTransaction(r, fn) {
      const cur = clone(mem.read(r.path)), next = fn(cur);
      if (next === undefined) return { committed: false, snapshot: snap(cur) };
      mem.set(r.path, next);
      return { committed: true, snapshot: snap(mem.read(r.path)) };
    },
    onDisconnect: () => ({ set: async () => {}, remove: async () => {}, cancel: async () => {} }),
    serverTimestamp: () => ({ ...TS }),
    goOnline() {}, goOffline() {},
  };
}

// ── 학생 연결 하나 처리 (선생님 기기) ──
// conn: { send(obj), onMessage(fn), onClose(fn) }. uid는 연결할 때 Firebase 로그인으로 확인된 학생 계정
// 권한은 Firebase 보안 규칙과 같은 생각으로: 내 것만 쓰고, 방 설정(meta)·핀·내보내기 목록은 못 씀
export function permit(mem, code, uid, path, val) {
  const ks = split(path);
  if (ks[0] !== 'rooms' || ks[1] !== code) return false;
  const [, , top, a, b, c] = ks, room = 'rooms/' + code;
  if (mem.read(room + '/banned/' + uid) === true) return false;
  const me = mem.read(room + '/members/' + uid), meta = mem.read(room + '/meta') || {};
  switch (top) {
    case 'nextSeat': return ks.length === 3 && typeof val === 'number' && val <= (meta.count || 0) && val === (Number(mem.read(room + '/nextSeat')) || 0) + 1;
    case 'members': {
      if (a !== uid) return false;
      if (!me) return ks.length === 4 && val && typeof val.name === 'string' && val.name.length <= 12 && Number.isInteger(val.seat) && val.seat >= 0 && val.seat < (meta.count || 0) && typeof val.team === 'string';
      const next = ks.length === 4 ? val : { ...me, ...(ks.length === 5 ? { [b]: val } : {}) };
      if (!next || next.seat !== me.seat) return false;
      if (String(next.team) !== String(me.team) && !(meta.phase === 'lobby' && meta.teamLock !== true)) return false;
      return true;
    }
    case 'results': return a === uid;
    case 'teams': return !!me && (b === 'players' ? c === uid : String(a) === String(me.team) && b === 'data');   // 요리사 위치는 내 것만, 주방 데이터는 내 모둠만
    case 'scores': return !!me && String(a) === String(me.team);
    default: return false;   // meta·pin·banned 등은 선생님만
  }
}
const readable = (code, path) => { const ks = split(path); return ks[0] === 'rooms' && ks[1] === code && ks[2] !== 'pin'; };

export function serve(mem, conn, { code, uid, now = () => Date.now(), isCurrent = () => true, onClose } = {}) {
  const subs = new Map(), od = [];
  const reply = (id, extra) => conn.send({ t: 'r', id, ...extra });
  const deny = id => reply(id, { err: 'PERMISSION_DENIED' });
  conn.onMessage(m => {
    try {
      const p = m.p;
      switch (m.t) {
        case 'ping': return reply(m.id, { h: now() });
        case 'get': return readable(code, p) ? reply(m.id, { v: mem.read(p) }) : deny(m.id);
        case 'set': case 'rm': {
          const v = m.t === 'rm' ? null : m.v;
          if (!permit(mem, code, uid, p, v)) return deny(m.id);
          mem.set(p, v, now()); return reply(m.id, {});
        }
        case 'upd': {
          const base = split(p);
          for (const k of Object.keys(m.v || {})) if (!permit(mem, code, uid, join([...base, ...split(k)]), m.v[k])) return deny(m.id);
          mem.update(p, m.v, now()); return reply(m.id, {});
        }
        case 'cas': {   // 트랜잭션: 학생이 본 값(e)이 지금 값과 같을 때만 저장, 아니면 지금 값을 돌려줘 다시 계산하게 함
          const cur = mem.read(p);
          if (canon(cur) !== m.e) return reply(m.id, { ok: 0, v: cur });
          if (!permit(mem, code, uid, p, m.v)) return deny(m.id);
          mem.set(p, m.v, now()); return reply(m.id, { ok: 1, v: mem.read(p) });
        }
        case 'sub': {
          if (!readable(code, p)) return conn.send({ t: 'v', s: m.s, err: 'PERMISSION_DENIED' });
          subs.get(m.s)?.(); let last;
          subs.set(m.s, mem.subscribe(p, v => {   // 처음엔 전체, 그 뒤로는 바뀐 부분이 작으면 그것만
            const d = last === undefined ? null : diff(last, v), full = JSON.stringify(v ?? null);
            if (d && JSON.stringify(d).length < full.length) conn.send({ t: 'v', s: m.s, d }); else conn.send({ t: 'v', s: m.s, v });
            last = clone(v);
          })); return;
        }
        case 'unsub': subs.get(m.s)?.(); subs.delete(m.s); return;
        case 'od': {    // 연결이 끊기면 할 일 (접속 끊김 표시, 요리사 지우기)
          if (!permit(mem, code, uid, p, m.v)) return deny(m.id);
          od.push([p, m.v]); return reply(m.id, {});
        }
      }
    } catch (e) { console.warn('[선생님 기기 서버] 요청 처리 오류', e); if (m && m.id) reply(m.id, { err: String(e.message || e) }); }
  });
  conn.onClose(() => {
    subs.forEach(u => u()); subs.clear();
    if (isCurrent()) for (const [p, v] of od) { try { if (permit(mem, code, uid, p, v)) mem.set(p, v, now()); } catch {} }   // 끊긴 순간의 권한으로 다시 확인 (내보낸 학생의 자리를 되살리지 않음)   // 같은 학생이 이미 다시 연결했으면 끊김 처리를 하지 않음
    onClose?.();
  });
}

// ── 학생 기기가 쓰는 ops: 요청을 선생님 기기로 보냄. 연결(link)이 바뀌면 구독·끊김 처리를 다시 걸음 ──
export function remoteOps() {
  let link = null, seq = 0, connected = false;
  const pending = new Map(), subs = new Map(), conns = new Set(), ods = [], offset = { v: 0 };
  let bestRtt = Infinity, pingTimer = null;
  const setConnected = on => { if (connected === on) return; connected = on; conns.forEach(cb => cb(snap(on))); };
  function send(msg) { if (!link) throw new Error('선생님 기기와 연결되지 않았어요.'); link.send(msg); }
  function request(msg, ms = 12000) {
    const id = ++seq;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { pending.delete(id); rej(new Error('선생님 기기의 응답이 없어요.')); }, ms); timer?.unref?.();
      pending.set(id, { res: v => { clearTimeout(timer); res(v); }, rej: e => { clearTimeout(timer); rej(e); } });
      try { send({ ...msg, id }); } catch (e) { pending.delete(id); clearTimeout(timer); rej(e); }
    });
  }
  const ok = r => { if (r.err) { const e = new Error(r.err); e.code = r.err; throw e; } return r; };
  function onMsg(m) {
    if (m.t === 'r') { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.res(m); } return; }
    if (m.t === 'v') { const s = subs.get(m.s); if (!s) return; if (m.err) { s.err?.(new Error(m.err)); return; } s.cache = m.d ? patch(s.cache, m.d) : (m.v === undefined ? null : m.v); s.have = true; s.cb(snap(s.cache)); }
  }
  async function ping() {
    const t0 = Date.now();
    try { const r = await request({ t: 'ping' }, 5000), t1 = Date.now(), rtt = t1 - t0; if (rtt <= bestRtt * 1.5 || rtt < 60) { bestRtt = Math.min(bestRtt, rtt); offset.v = Math.round(r.h + rtt / 2 - t1); } } catch {}
  }
  // 이미 구독 중인 값이 있으면 트랜잭션을 그 값에서 시작 (왕복 한 번 절약)
  function cached(path) {
    for (const s of subs.values()) {
      if (!s.have) continue;
      if (path === s.path) return { v: s.cache };
      if (path.startsWith(s.path + '/')) { let v = s.cache; for (const k of split(path.slice(s.path.length))) { if (v === null || typeof v !== 'object') { v = null; break; } v = v[k] === undefined ? null : v[k]; } return { v }; }
    }
    return null;
  }
  const ops = {
    offset,
    get connected() { return connected; },
    get kind() { return link?.kind || ''; },
    // 새 연결로 바꿈: 진행 중이던 요청은 실패시키고, 구독·끊김 처리를 다시 보냄
    setLink(l) {
      if (link) { try { link.close(); } catch {} }
      link = l; for (const p of pending.values()) p.rej(new Error('연결이 바뀌었어요.')); pending.clear();
      if (!l) { setConnected(false); clearInterval(pingTimer); return; }
      l.onMessage(onMsg);
      l.onClose(() => { if (link === l) { link = null; setConnected(false); clearInterval(pingTimer); ops.onLost?.(); } });
      for (const [sid, s] of subs) send({ t: 'sub', s: sid, p: s.path });
      for (const [p, v] of ods) send({ t: 'od', id: ++seq, p, v });
      setConnected(true);
      bestRtt = Infinity; ping(); setTimeout(ping, 800); setTimeout(ping, 2500);
      // 4초마다 신호: 선생님 기기가 끊긴 연결을 빨리 알아채고 시계도 맞춤 (unref: 테스트용 Node가 끝날 수 있게)
      clearInterval(pingTimer); pingTimer = setInterval(ping, 4000); pingTimer?.unref?.();
    },
    drop() { link?.close(); },   // 시험용: 연결이 갑자기 끊긴 것처럼 (다시 연결 과정을 탐)
    close() { const l = link; link = null; clearInterval(pingTimer); if (l) try { l.close(); } catch {} setConnected(false); },
    ref: refOf,
    get: async r => snap(ok(await request({ t: 'get', p: r.path })).v),
    set: async (r, v) => { ok(await request({ t: 'set', p: r.path, v })); },
    update: async (r, v) => { ok(await request({ t: 'upd', p: r.path, v })); },
    remove: async r => { ok(await request({ t: 'rm', p: r.path })); },
    onValue(r, cb, err) {
      if (r.path === INFO_CONN) { conns.add(cb); queueMicrotask(() => conns.has(cb) && cb(snap(connected))); return () => conns.delete(cb); }
      if (r.path === INFO_OFFSET) { queueMicrotask(() => cb(snap(offset.v))); return () => {}; }
      const sid = 's' + ++seq; subs.set(sid, { path: r.path, cb, err, cache: null, have: false });
      try { if (link) send({ t: 'sub', s: sid, p: r.path }); } catch {}
      return () => { subs.delete(sid); try { if (link) send({ t: 'unsub', s: sid }); } catch {} };
    },
    async runTransaction(r, fn) {
      const c = cached(r.path); let cur = c ? c.v : ok(await request({ t: 'get', p: r.path })).v;
      for (let i = 0; i < 25; i++) {
        const next = fn(clone(cur));
        if (next === undefined) return { committed: false, snapshot: snap(cur) };
        const res = ok(await request({ t: 'cas', p: r.path, e: canon(cur), v: next }));
        if (res.ok) return { committed: true, snapshot: snap(res.v) };
        cur = res.v === undefined ? null : res.v;
      }
      throw new Error('다른 친구와 동시에 바꾸느라 저장하지 못했어요. 다시 해 보세요.');
    },
    onDisconnect: r => ({
      set: async v => { ods.push([r.path, v]); if (link) ok(await request({ t: 'od', p: r.path, v })); },
      remove: async () => { ods.push([r.path, null]); if (link) ok(await request({ t: 'od', p: r.path, v: null })); },
      cancel: async () => {},
    }),
    serverTimestamp: () => ({ ...TS }),
    goOnline() {}, goOffline() {},
  };
  return ops;
}
