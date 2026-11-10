// 실행: node --test tests/items.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newItem, heldString, prepare, checkReturn, checkStore, storePut, storeTake, storageList, checkTrash, applyPenalty, STORAGE_MAX } from '../items.js';
import { CloudRoom } from '../cloud.js';

const tomatoBin = { type: 'bin', food: 'tomato' }, lettuceBin = { type: 'bin', food: 'lettuce' };
const ready = kind => prepare(newItem(kind, 'u1'));

test('토마토 집기 → 토마토 상자 반환 성공, 다른 상자는 거부', () => {
  const t = newItem('tomato', 'u1');
  assert.equal(heldString(t), 'tomato');
  assert.equal(checkReturn(t, tomatoBin).ok, true);
  assert.deepEqual(checkReturn(t, lettuceBin), { ok: false, reason: 'wrongBin' });
});
test('손질 완료 재료는 원래 상자에도 반환 불가', () => {
  const t = ready('tomato');
  assert.equal(heldString(t), 'ready:tomato');
  assert.deepEqual(checkReturn(t, tomatoBin), { ok: false, reason: 'notRaw' });
  assert.equal(prepare(t), null, '이미 손질한 재료를 다시 손질할 수 없음');
});
test('보관대: 손질 전 재료 거부, 5칸 제한, 6번째 거부', () => {
  assert.equal(checkStore({}, newItem('tomato', 'u1')).reason, 'raw');
  let s = {};
  for (let i = 0; i < STORAGE_MAX; i++) { s = storePut(s, ready('tomato'), i); assert.ok(s); }
  assert.equal(storageList(s).length, 5);
  assert.equal(checkStore(s, ready('cheese')).reason, 'full');
  assert.equal(storePut(s, ready('cheese')), null);
});
test('보관대: 원하는 재료를 골라 꺼냄 (넣은 순서와 무관)', () => {
  const a = ready('tomato'), b = ready('cheese'), c = ready('lettuce');
  let s = storePut(storePut(storePut({}, a, 1), b, 2), c, 3);
  const r = storeTake(s, b.id);
  assert.equal(r.item.kind, 'cheese'); assert.equal(r.item.state, 'prepared'); assert.equal(r.item.sourceBinId, 'bin:cheese');
  assert.deepEqual(storageList(r.storage).map(x => x.kind), ['tomato', 'lettuce']);
});
test('복제 불가: 같은 재료를 두 번 넣거나 두 번 꺼낼 수 없음', () => {
  const a = ready('tomato');
  const s = storePut({}, a);
  assert.equal(storePut(s, a), null);
  const r = storeTake(s, a.id);
  assert.equal(storeTake(r.storage, a.id), null);
});
test('폐기: 손질 완료만 가능, -8점, 0점 아래로 내려가지 않음', () => {
  assert.equal(checkTrash(newItem('tomato', 'u1')).reason, 'raw');
  assert.equal(checkTrash(null).reason, 'empty');
  assert.equal(checkTrash(ready('tomato')).penalty, 8);
  assert.equal(applyPenalty(100), 92);
  assert.equal(applyPenalty(5), 0);
  assert.equal(applyPenalty(undefined), 0);
});

// 온라인 경로: 실제 Firebase 대신 메모리 가짜 DB로 cloud.js의 트랜잭션 코드를 실행 (실서버 검증은 아님)
function fakeRoom(db) {
  const room = new CloudRoom();
  room.team = 0; room.code = 'T';
  room.path = (...p) => p.join('/');
  room.ops = { runTransaction: async (path, fn) => { const next = fn(structuredClone(db[path] ?? null)); if (next === undefined) return { committed: false }; db[path] = next; return { committed: true, snapshot: { val: () => db[path] ?? null } }; }, update: async (path, v) => { db[path] = { ...(db[path] || {}), ...v }; } };
  return room;
}
test('온라인 보관대(가짜 DB): 두 학생이 동시에 꺼내도 한 명만 성공', async () => {
  const db = {}, A = fakeRoom(db), B = fakeRoom(db);
  const item = ready('tomato');
  assert.equal(await A.storagePut(item), true);
  assert.equal(await B.storagePut(item), false, '같은 재료 중복 보관 거부');
  const [x, y] = await Promise.all([A.storageTake(item.id), B.storageTake(item.id)]);
  assert.equal([x, y].filter(Boolean).length, 1);
});
test('온라인 보관대(가짜 DB): 6개를 동시에 넣어도 5개만 들어감', async () => {
  const db = {}, A = fakeRoom(db);
  const res = await Promise.all(Array.from({ length: 6 }, () => A.storagePut(ready('cheese'))));
  assert.equal(res.filter(Boolean).length, 5);
  assert.equal(Object.keys(db['teams/0/data/storage']).length, 5);
});
test('온라인 감점(가짜 DB): 0점 아래로 내려가지 않음', async () => {
  const db = { 'teams/0/data/groups/ALL/score': 5 }, A = fakeRoom(db);
  await A.penalize('ALL');
  assert.equal(db['teams/0/data/groups/ALL/score'], 0);
});
