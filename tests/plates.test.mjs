// 실행: node --test tests/plates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newItem, prepare, heldString } from '../items.js';
import { defaultPlates, plateWashed, PLATES_START } from '../stations.js';
import { newPlate, plateComplete, missingOf, rackTake, rackReturn, plateDirtied, tablePut, tableAddCheck, tableAdd, tableLift, serveGroup, contentsOf } from '../plates.js';
import { CloudRoom } from '../cloud.js';

const SALAD = { title: '샐러드', items: ['lettuce', 'tomato'] }, BURGER = { title: '햄버거', items: ['meat', 'bread'] };
const RECIPES = [SALAD, BURGER];
const ready = k => prepare(newItem(k, 'u1'));
const group = () => ({ orderIndex: 0, score: 0, served: 0 });

test('접시대: 처음 3장, 꺼내면 줄고 다 쓰면 못 꺼냄, 빈 접시는 돌려놓을 수 있음', () => {
  let pl = defaultPlates();
  assert.deepEqual(pl, { dirty: 0, clean: PLATES_START });
  for (let i = 0; i < PLATES_START; i++) pl = rackTake(pl);
  assert.equal(pl.clean, 0);
  assert.equal(rackTake(pl), null);
  assert.equal(rackReturn(pl).clean, 1);
});
test('플레이팅대: 접시가 있어야 재료를 올릴 수 있고, 한 자리에 접시 하나만', () => {
  assert.equal(tableAddCheck(null, ready('lettuce'), SALAD).reason, 'noPlate');
  const s = tablePut(null, newPlate('u1'), 1).next;
  assert.equal(tablePut(s, newPlate('u2'), 2), null);
  assert.equal(tablePut(null, ready('lettuce'), 1), null, '접시가 아닌 것은 놓을 수 없음');
});
test('재료를 하나씩 올림: 손질 전·탄 것·주문에 없는 것·같은 것 두 번은 거절', () => {
  let s = tablePut(null, newPlate('u1'), 1).next;
  assert.equal(tableAddCheck(s, newItem('lettuce', 'u1'), SALAD).reason, 'notPrepared');
  assert.equal(tableAddCheck(s, { ...ready('lettuce'), state: 'burnt' }, SALAD).reason, 'burnt');
  assert.equal(tableAddCheck(s, ready('cheese'), SALAD).reason, 'notNeeded');
  s = tableAdd(s, ready('lettuce'), SALAD, 2).next;
  assert.deepEqual(contentsOf(s.plate), ['lettuce']);
  assert.equal(tableAddCheck(s, ready('lettuce'), SALAD).reason, 'duplicate');
  assert.equal(tableAdd(s, ready('lettuce'), SALAD, 3), null);
  assert.deepEqual(missingOf(contentsOf(s.plate), SALAD), ['tomato']);
});
test('완성 판정: 주문과 정확히 같은 조합만 완성', () => {
  assert.equal(plateComplete([], SALAD), false);
  assert.equal(plateComplete(['lettuce'], SALAD), false);
  assert.equal(plateComplete(['tomato', 'lettuce'], SALAD), true);
  assert.equal(plateComplete(['tomato', 'lettuce'], BURGER), false);
  assert.equal(plateComplete(undefined, SALAD), false, 'Firebase에서 빈 배열이 사라져도 안전');
});
test('접시 들기: 내용물이 그대로 따라오고 자리는 비워짐, 손에 든 접시는 문자열로 구분', () => {
  let s = tablePut(null, newPlate('u1'), 1).next;
  s = tableAdd(tableAdd(s, ready('lettuce'), SALAD, 2).next, ready('tomato'), SALAD, 3).next;
  const r = tableLift(s);
  assert.equal(r.next, null);
  assert.equal(heldString(r.item), 'plate:lettuce+tomato');
  assert.equal(heldString(newPlate('u1')), 'plate:');
  assert.equal(tableLift(null), null);
});
test('서빙: 완성 접시만 +100, 미완성·빈 접시·다른 요리는 거절', () => {
  assert.equal(serveGroup(group(), [], RECIPES), null);
  assert.equal(serveGroup(group(), ['lettuce'], RECIPES), null);
  assert.equal(serveGroup(group(), ['meat', 'bread'], RECIPES), null);
  const g = serveGroup(group(), ['lettuce', 'tomato'], RECIPES);
  assert.deepEqual(g, { orderIndex: 1, score: 100, served: 1 });
  assert.equal(serveGroup(g, ['lettuce', 'tomato'], RECIPES), null, '주문이 넘어간 뒤 같은 요리를 또 서빙할 수 없음');
});
test('접시 순환: 서빙하면 더러운 접시 +1, 설거지하면 깨끗한 접시 +1', () => {
  let pl = rackTake(defaultPlates());
  pl = plateDirtied(pl);
  assert.deepEqual(pl, { dirty: 1, clean: PLATES_START - 1 });
  pl = plateWashed(pl);
  assert.deepEqual(pl, { dirty: 0, clean: PLATES_START });
  assert.equal(plateWashed(pl), null);
});

// 온라인 경로: 가짜 메모리 DB로 cloud.js 트랜잭션 코드 실행 (실서버 검증은 아님)
function fakeRoom(db) {
  const room = new CloudRoom();
  room.team = 0; room.code = 'T';
  room.path = (...p) => p.join('/');
  room.ops = { runTransaction: async (path, fn) => { const next = fn(structuredClone(db[path] ?? null)); if (next === undefined) return { committed: false }; if (next === null) delete db[path]; else db[path] = next; return { committed: true }; } };
  return room;
}
test('온라인(가짜 DB): 두 학생이 완성 접시를 동시에 서빙해도 한 번만 점수', async () => {
  const db = { 'teams/0/data/groups/ALL': group() }, A = fakeRoom(db), B = fakeRoom(db);
  const res = await Promise.all([A.servePlate('ALL', ['lettuce', 'tomato'], RECIPES), B.servePlate('ALL', ['tomato', 'lettuce'], RECIPES)]);
  assert.equal(res.filter(Boolean).length, 1);
  assert.equal(db['teams/0/data/groups/ALL'].score, 100);
});
test('온라인(가짜 DB): 같은 재료를 동시에 올려도 한 명만, 접시도 한 명만 들고, 마지막 접시도 한 명만 꺼냄', async () => {
  const db = {}, A = fakeRoom(db), B = fakeRoom(db);
  await A.stationOp('plate_9_1', s => tablePut(s, newPlate('uA'), 1));
  const add = await Promise.all([A.stationOp('plate_9_1', s => tableAdd(s, ready('lettuce'), SALAD, 2)), B.stationOp('plate_9_1', s => tableAdd(s, ready('lettuce'), SALAD, 2))]);
  assert.equal(add.filter(Boolean).length, 1);
  const lift = await Promise.all([A.stationOp('plate_9_1', s => tableLift(s)), B.stationOp('plate_9_1', s => tableLift(s))]);
  assert.equal(lift.filter(Boolean).length, 1);
  db['teams/0/data/plates'] = { dirty: 0, clean: 1 };
  const take = await Promise.all([A.platesOp(rackTake), B.platesOp(rackTake)]);
  assert.equal(take.filter(Boolean).length, 1);
});
