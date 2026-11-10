// 실행: node --test tests/stations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newItem, prepare } from '../items.js';
import { boardReserve, boardStart, boardChop, boardCancel, boardTake, isStale, RESERVE_TIMEOUT_MS, WORK_TIMEOUT_MS, MIN_CHOP_GAP_MS } from '../stations.js';
import { CloudRoom } from '../cloud.js';

const T0 = 1_000_000;
const raw = () => newItem('tomato', 'u1');

test('수학 정답(시작)만으로는 손질 완료가 되지 않음', () => {
  let s = boardReserve(null, raw(), 'u1', '가', T0).next;
  assert.equal(s.state, 'reserved'); assert.equal(s.item.state, 'raw');
  s = boardStart(s, 'u1', 10, T0 + 1).next;
  assert.equal(s.state, 'working'); assert.equal(s.item.state, 'raw'); assert.equal(s.progress, 0);
  assert.equal(boardTake(s, T0 + 2), null, '작업 중에는 집을 수 없음');
});
test('10번 눌러야 완료, 9번까지는 미완성', () => {
  let s = boardStart(boardReserve(null, raw(), 'u1', '가', T0).next, 'u1', 10, T0).next, r;
  for (let i = 1; i <= 9; i++) { r = boardChop(s, 'u1', T0 + i * 100); s = r.next; assert.equal(s.state, 'working'); assert.equal(s.progress, i); }
  r = boardChop(s, 'u1', T0 + 1000);
  assert.equal(r.done, true); assert.equal(r.next.state, 'ready'); assert.equal(r.next.item.state, 'prepared');
  assert.equal(boardChop(r.next, 'u1', T0 + 1100), null, '완료 뒤 추가 연타는 무시');
});
test('너무 빠른 중복 입력은 1회로만 인정', () => {
  let s = boardStart(boardReserve(null, raw(), 'u1', '가', T0).next, 'u1', 10, T0).next;
  s = boardChop(s, 'u1', T0 + 100).next;
  assert.equal(boardChop(s, 'u1', T0 + 100 + MIN_CHOP_GAP_MS - 1), null);
  assert.equal(boardChop(s, 'u1', T0 + 100 + MIN_CHOP_GAP_MS).next.progress, 2);
});
test('접근성: 연타 횟수 3번 설정', () => {
  let s = boardStart(boardReserve(null, raw(), 'u1', '가', T0).next, 'u1', 3, T0).next;
  s = boardChop(s, 'u1', T0 + 100).next; s = boardChop(s, 'u1', T0 + 200).next;
  assert.equal(boardChop(s, 'u1', T0 + 300).done, true);
});
test('점유: 사용 중·완성품이 남은 도마에는 다른 재료를 올릴 수 없고, 남이 연타할 수 없음', () => {
  let s = boardReserve(null, raw(), 'u1', '가', T0).next;
  assert.equal(boardReserve(s, raw(), 'u2', '나', T0 + 1), null);
  assert.equal(boardStart(s, 'u2', 10, T0 + 1), null);
  s = boardStart(s, 'u1', 1, T0 + 2).next;
  assert.equal(boardChop(s, 'u2', T0 + 500), null);
  assert.equal(boardCancel(s, 'u2'), null);
  s = boardChop(s, 'u1', T0 + 500).next;
  assert.equal(boardReserve(s, raw(), 'u2', '나', T0 + 600), null, '완성품이 남아 있으면 사용 불가');
});
test('손질한 재료는 도마에 다시 올릴 수 없음', () => {
  assert.equal(boardReserve(null, prepare(raw()), 'u1', '가', T0), null);
});
test('완성품은 도마에 남고, 집으면 도마가 비워짐 (팀원 누구나)', () => {
  let s = boardStart(boardReserve(null, raw(), 'u1', '가', T0).next, 'u1', 1, T0).next;
  s = boardChop(s, 'u1', T0 + 100).next;
  const r = boardTake(s, T0 + 200);
  assert.equal(r.next, null); assert.equal(r.item.state, 'prepared'); assert.equal(r.item.kind, 'tomato');
});
test('취소: 문제 창을 닫으면 손질 전 재료를 돌려받고 도마가 비워짐', () => {
  const it = raw(), s = boardReserve(null, it, 'u1', '가', T0).next;
  const r = boardCancel(s, 'u1');
  assert.equal(r.next, null); assert.equal(r.item.id, it.id); assert.equal(r.item.state, 'raw');
});
test('타임아웃: 주인이 사라진 도마는 영구히 잠기지 않고 누구나 재료를 회수', () => {
  const s = boardReserve(null, raw(), 'u1', '가', T0).next;
  assert.equal(isStale(s, T0 + RESERVE_TIMEOUT_MS - 1), false);
  assert.equal(boardTake(s, T0 + RESERVE_TIMEOUT_MS - 1), null);
  assert.equal(boardTake(s, T0 + RESERVE_TIMEOUT_MS + 1).item.state, 'raw');
  const w = boardStart(s, 'u1', 10, T0).next;
  assert.equal(isStale(w, T0 + WORK_TIMEOUT_MS + 1), true);
  assert.equal(isStale(boardChop(boardStart(s, 'u1', 1, T0).next, 'u1', T0 + 1).next, T0 + 10 * WORK_TIMEOUT_MS), false, '완성품은 계속 남아 있음');
});

// 온라인 경로: 가짜 메모리 DB로 cloud.js 트랜잭션 코드 실행 (실서버 검증은 아님)
function fakeRoom(db) {
  const room = new CloudRoom();
  room.team = 0; room.code = 'T';
  room.path = (...p) => p.join('/');
  room.ops = { runTransaction: async (path, fn) => { const next = fn(structuredClone(db[path] ?? null)); if (next === undefined) return { committed: false }; if (next === null) delete db[path]; else db[path] = next; return { committed: true, snapshot: { val: () => db[path] ?? null } }; }, update: async (path, v) => { db[path] = { ...(db[path] || {}), ...v }; } };
  return room;
}
test('온라인(가짜 DB): 두 학생이 동시에 같은 도마를 잡아도 한 명만 성공, 완성품도 한 명만 집음', async () => {
  const db = {}, A = fakeRoom(db), B = fakeRoom(db);
  const [a, b] = await Promise.all([A.stationOp('cut_6_1', s => boardReserve(s, raw(), 'uA', 'A', T0)), B.stationOp('cut_6_1', s => boardReserve(s, raw(), 'uB', 'B', T0))]);
  assert.equal([a, b].filter(Boolean).length, 1);
  const owner = a ? 'uA' : 'uB', room = a ? A : B;
  await room.stationOp('cut_6_1', s => boardStart(s, owner, 2, T0));
  await room.stationOp('cut_6_1', s => boardChop(s, owner, T0 + 100));
  // 새로고침(재접속) 뒤에도 DB의 상태가 그대로: 같은 주인이 이어서 연타 가능
  const again = fakeRoom(db);
  assert.equal(db['teams/0/data/stations/cut_6_1'].progress, 1);
  const done = await again.stationOp('cut_6_1', s => boardChop(s, owner, T0 + 200));
  assert.equal(done.done, true);
  const [x, y] = await Promise.all([A.stationOp('cut_6_1', s => boardTake(s, T0 + 300)), B.stationOp('cut_6_1', s => boardTake(s, T0 + 300))]);
  assert.equal([x, y].filter(Boolean).length, 1);
  assert.equal(db['teams/0/data/stations/cut_6_1'], undefined);
});
