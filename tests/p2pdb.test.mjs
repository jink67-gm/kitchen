// 데이터 절약 모드(선생님 기기 서버)의 메모리 데이터베이스와 학생 연결
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemDB, localOps, remoteOps, serve, canon } from '../p2pdb.js';

// 메모리 안에서 두 끝을 잇는 가짜 연결 (실제로는 WebRTC 또는 Firebase 우편함)
function pipe() {
  const a = { h: [], c: [] }, b = { h: [], c: [] };
  let open = true;
  const end = (me, other) => ({ kind: 'test', send: m => { if (open) setTimeout(() => other.h.forEach(f => f(JSON.parse(JSON.stringify(m)))), 1); }, onMessage: f => me.h.push(f), onClose: f => me.c.push(f), close: () => { if (!open) return; open = false; [...a.c, ...b.c].forEach(f => f()); } });
  return [end(a, b), end(b, a)];
}
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
const CODE = '123456', R = 'rooms/' + CODE;
function room() {
  const mem = new MemDB({ rooms: { [CODE]: { meta: { hostUid: 'T', phase: 'lobby', count: 6, max: 4, sizes: [2, 2] }, pin: '9999' } } });
  return { mem, host: localOps(mem) };
}
function student(mem, uid) {
  const [hostEnd, stuEnd] = pipe(); let current = true;
  serve(mem, hostEnd, { code: CODE, uid, isCurrent: () => current });
  const ops = remoteOps(); ops.setLink(stuEnd);
  return { ops, link: stuEnd, drop: () => { stuEnd.close(); }, replaced: () => { current = false; } };
}

test('Firebase처럼: 빈 객체·null은 지워지고, 여러 경로 update가 한 번에 됨', async () => {
  const { mem, host } = room();
  await host.update(host.ref(null, R), { 'members/a': { name: '가', seat: 0, team: '0' }, 'members/b': { name: '나', seat: 1, team: '1' } });
  await host.update(host.ref(null, R + '/members'), { 'a/team': '1', 'b/team': '0' });
  assert.equal(mem.read(R + '/members/a/team'), '1');
  await host.remove(host.ref(null, R + '/members/a'));
  await host.remove(host.ref(null, R + '/members/b'));
  assert.equal(mem.read(R + '/members'), null);
  await host.set(host.ref(null, R + '/x'), { y: {}, z: null });
  assert.equal(mem.read(R + '/x'), null);
});

test('서버 시각 표시는 선생님 기기 시각으로 바뀜', async () => {
  const { mem, host } = room();
  const t0 = Date.now();
  await host.update(host.ref(null, R + '/meta'), { startedAt: host.serverTimestamp() });
  assert.ok(mem.read(R + '/meta/startedAt') >= t0);
});

test('학생: 입장(자리 트랜잭션 → 등록) → 구독으로 바뀐 값을 받음', async () => {
  const { mem, host } = room();
  const s = student(mem, 'a'); await tick();
  const tr = await s.ops.runTransaction(s.ops.ref(null, R + '/nextSeat'), n => (n || 0) + 1);
  assert.ok(tr.committed); assert.equal(tr.snapshot.val(), 1);
  await s.ops.set(s.ops.ref(null, R + '/members/a'), { name: '가람', seat: 0, team: '0', online: true });
  const seen = [];
  s.ops.onValue(s.ops.ref(null, R + '/meta'), sn => seen.push(sn.val()?.phase));
  await tick(30);
  await host.update(host.ref(null, R + '/meta'), { phase: 'playing' });
  await tick(30);
  assert.deepEqual(seen, ['lobby', 'playing']);
});

test('두 학생이 동시에 같은 도마를 써도 한 명만 성공 (트랜잭션)', async () => {
  const { mem, host } = room();
  await host.update(host.ref(null, R + '/members'), { a: { name: '가', seat: 0, team: '0' }, b: { name: '나', seat: 1, team: '0' } });
  const A = student(mem, 'a'), B = student(mem, 'b'); await tick();
  const take = ops => ops.runTransaction(ops.ref(null, R + '/teams/0/data/stations/cut1'), old => (old ? undefined : { owner: 'x' }));
  const [ra, rb] = await Promise.all([take(A.ops), take(B.ops)]);
  assert.equal([ra.committed, rb.committed].filter(Boolean).length, 1);
  // 숫자 올리기는 둘 다 반영
  const inc = ops => ops.runTransaction(ops.ref(null, R + '/teams/0/data/groups/ALL/correct'), v => (v || 0) + 1);
  await Promise.all([inc(A.ops), inc(B.ops), inc(A.ops), inc(B.ops)]);
  assert.equal(mem.read(R + '/teams/0/data/groups/ALL/correct'), 4);
});

test('권한: 학생은 방 설정·다른 학생·다른 모둠·핀을 못 건드림', async () => {
  const { mem, host } = room();
  await host.update(host.ref(null, R + '/members'), { a: { name: '가', seat: 0, team: '0' }, b: { name: '나', seat: 1, team: '1' } });
  const A = student(mem, 'a'); await tick();
  const denied = p => assert.rejects(p, /PERMISSION_DENIED/);
  await denied(A.ops.update(A.ops.ref(null, R + '/meta'), { phase: 'playing' }));
  await denied(A.ops.update(A.ops.ref(null, R + '/members/b'), { team: '0' }));
  await denied(A.ops.set(A.ops.ref(null, R + '/teams/1/data/storage'), { x: 1 }));
  await denied(A.ops.get(A.ops.ref(null, R + '/pin')));
  await denied(A.ops.update(A.ops.ref(null, R + '/members/a'), { seat: 3 }));
  await A.ops.set(A.ops.ref(null, R + '/teams/0/data/storage'), { x: 1 });          // 내 모둠은 됨
  await A.ops.update(A.ops.ref(null, R + '/members/a'), { team: '1' });              // 대기실에서 모둠 이동은 됨
  await host.update(host.ref(null, R + '/meta'), { teamLock: true });
  await denied(A.ops.update(A.ops.ref(null, R + '/members/a'), { team: '0' }));     // 잠기면 안 됨
  await host.set(host.ref(null, R + '/banned/a'), true);
  await denied(A.ops.update(A.ops.ref(null, R + '/results/a'), { hints: 1 }));      // 내보내진 학생은 아무것도 못 씀
});

test('연결이 끊기면 "접속 끊김" 표시·요리사 지우기, 다시 연결한 뒤의 옛 연결 끊김은 무시', async () => {
  const { mem, host } = room();
  await host.update(host.ref(null, R + '/members'), { a: { name: '가', seat: 0, team: '0', online: true } });
  const A = student(mem, 'a'); await tick();
  await A.ops.set(A.ops.ref(null, R + '/teams/0/players/a'), { x: 1, y: 2 });
  await A.ops.onDisconnect(A.ops.ref(null, R + '/members/a/online')).set(false);
  await A.ops.onDisconnect(A.ops.ref(null, R + '/teams/0/players/a')).remove();
  A.drop(); await tick(30);
  assert.equal(mem.read(R + '/members/a/online'), false);
  assert.equal(mem.read(R + '/teams/0/players/a'), null);
  // 새 연결이 먼저 생긴 뒤 옛 연결이 끊긴 경우
  await host.update(host.ref(null, R + '/members/a'), { online: true });
  const old = student(mem, 'a'); await tick();
  await old.ops.onDisconnect(old.ops.ref(null, R + '/members/a/online')).set(false);
  old.replaced(); old.drop(); await tick(30);
  assert.equal(mem.read(R + '/members/a/online'), true);
});

test('학생 연결이 바뀌면(다시 연결) 구독을 다시 걸어 계속 받음', async () => {
  const { mem, host } = room();
  await host.update(host.ref(null, R + '/members'), { a: { name: '가', seat: 0, team: '0' } });
  const [h1, s1] = pipe(); serve(mem, h1, { code: CODE, uid: 'a' });
  const ops = remoteOps(); ops.setLink(s1);
  const seen = [], conn = [];
  ops.onValue(ops.ref(null, R + '/meta'), sn => seen.push(sn.val()?.phase));
  ops.onValue(ops.ref(null, '.info/connected'), sn => conn.push(sn.val()));
  await tick(30);
  s1.close(); await tick(10);
  await host.update(host.ref(null, R + '/meta'), { phase: 'playing' });
  const [h2, s2] = pipe(); serve(mem, h2, { code: CODE, uid: 'a' }); ops.setLink(s2);
  await tick(30);
  assert.deepEqual(seen.at(-1), 'playing');
  assert.deepEqual(conn, [true, false, true]);
});

test('canon: 키 순서가 달라도 같은 값', () => {
  assert.equal(canon({ a: 1, b: { c: 2, d: 3 } }), canon({ b: { d: 3, c: 2 }, a: 1 }));
});

test('내보낸 학생의 연결이 끊겨도 명단에 다시 생기지 않음', async () => {
  const { mem, host } = room();
  await host.update(host.ref(null, R + '/members'), { a: { name: '가', seat: 0, team: '0', online: true } });
  const A = student(mem, 'a'); await tick();
  await A.ops.onDisconnect(A.ops.ref(null, R + '/members/a/online')).set(false);
  await host.set(host.ref(null, R + '/banned/a'), true); await host.remove(host.ref(null, R + '/members/a'));
  A.drop(); await tick(30);
  assert.equal(mem.read(R + '/members/a'), null);
});

test('바뀐 부분만 보내기: diff → patch 하면 같은 값', async () => {
  const { diff, patch } = await import('../p2pdb.js');
  const a = { players: { a: { x: 1, y: 2 }, b: { x: 3 } }, stations: { cut1: { owner: 'a' } }, n: 1 };
  const b = { players: { a: { x: 1.5, y: 2 }, b: { x: 3 }, c: { x: 0 } }, stations: {}, n: 2 };
  const d = diff(a, b);
  assert.deepEqual(patch(JSON.parse(JSON.stringify(a)), d), { players: b.players, n: 2 });
  assert.ok(JSON.stringify(d).length < JSON.stringify(b).length);
});
