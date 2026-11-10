// 실행: node --test tests/orders.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ordersTick, activeOrders, serveOrder, matchOrder, patience, patienceColor, isRush, rushStartMs, fairScore, MAX_ORDERS, RUSH_SPEED, ORDER_TIME_OPTIONS } from '../orders.js';
import { tablePut, tableAdd, tableAddCheck, plateMatch, missingOf, newPlate, contentsOf } from '../plates.js';
import { newItem, prepare } from '../items.js';
import { planTeams, CloudRoom } from '../cloud.js';

const RECIPES = [{ title: '샐러드', items: ['lettuce', 'tomato'] }, { title: '햄버거', items: ['meat', 'bread'] }, { title: '케이크', items: ['flour', 'berry'] }, { title: '피자', items: ['dough', 'cheese'] }];
const T0 = 10_000_000;
const cfg = (durationS = 180, orderTimeMs = 75000) => ({ startedAt: T0, durationMs: durationS * 1000, orderTimeMs, recipeCount: RECIPES.length });
const run = (g, from, to, c, step = 250) => { for (let t = from; t <= to; t += step) g = ordersTick(g, T0 + t, c) || g; return g; };
const count = (g, t) => activeOrders(g, T0 + t).length;
const ready = k => prepare(newItem(k, 'u'));

test('러시타임 시작 시각: 마지막 40초, 짧은 판은 마지막 20%', () => {
  assert.equal(rushStartMs(300000), 260000);
  assert.equal(rushStartMs(180000), 144000);
  assert.equal(isRush(143999, 180000), false);
  assert.equal(isRush(144000, 180000), true);
  assert.equal(isRush(180000, 180000), false, '시간이 끝나면 러시도 끝');
  assert.equal(RUSH_SPEED, 1.35);
});
test('주문 수: 평소 1개 → 러시 시작 2개 → 10초 뒤 3개 → 3개 초과 없음', () => {
  const c = cfg(180, 999999);          // 만료 없이 개수만 확인
  let g = run({}, 0, 143900, c);
  assert.equal(count(g, 143900), 1);
  assert.equal(ordersTick(g, T0 + 100000, c), null, '바뀔 것이 없으면 아무것도 쓰지 않음');
  g = run(g, 144000, 144000, c); assert.equal(count(g, 144000), 2);
  g = run(g, 144250, 153900, c); assert.equal(count(g, 153900), 2, '10초가 되기 전에는 그대로');
  g = run(g, 154000, 154000, c); assert.equal(count(g, 154000), 3);
  g = run(g, 154250, 179900, c); assert.equal(count(g, 179900), MAX_ORDERS);
  assert.equal(Object.keys(g.orders).length, 3);
  assert.equal(ordersTick(g, T0 + 180000, c), null, '종료 후에는 주문을 만들지 않음');
});
test('러시는 한 번만 발동하고, 여러 컴퓨터가 같은 시각에 계산해도 결과가 같음', () => {
  const c = cfg(180, 999999);
  const base = run({}, 0, 143900, c);
  const a = ordersTick(base, T0 + 144000, c), b = ordersTick(base, T0 + 144000, c);
  assert.deepEqual(a, b);
  assert.equal(ordersTick(a, T0 + 144000, c), null, '이미 반영된 뒤에는 다시 추가하지 않음');
  assert.equal(a.rushAdds, 1);
});
test('주문은 대기 시간이 지나도 사라지지 않음: 팁만 0점, 만들던 접시는 그대로 서빙 가능', () => {
  const c = cfg(180, 20000);
  let g = { ...ordersTick({}, T0, c), score: 150, combo: 2 };
  assert.equal(count(g, 19999), 1);
  assert.equal(count(g, 20000), 1);
  assert.equal(ordersTick(g, T0 + 60000, c), null, '시간이 지나도 주문 목록은 바뀌지 않음');
  assert.deepEqual(activeOrders(g, T0 + 60000).map(o => RECIPES[o.recipeId].title), ['샐러드']);
  assert.equal(patience(activeOrders(g, T0 + 60000)[0], T0 + 60000), 0);
  const r = serveOrder(g, ['lettuce', 'tomato'], RECIPES, T0 + 60000);
  assert.equal(r.gained, 100, '늦어도 기본 100점은 그대로');
  assert.equal(r.tip, 0);
});
test('대기 게이지: 초록 → 노랑 → 빨강', () => {
  const o = { createdAt: T0, expiresAt: T0 + 80000 };
  assert.equal(patienceColor(patience(o, T0 + 10000)), 'green');
  assert.equal(patienceColor(patience(o, T0 + 50000)), 'yellow');
  assert.equal(patienceColor(patience(o, T0 + 70000)), 'red');
});
test('점수: 기본 100 + 팁(빠를수록 최대 20, 늦어도 감점 없음)', () => {
  const c = cfg(180, 80000), g = ordersTick({}, T0, c);
  assert.equal(serveOrder(g, ['lettuce', 'tomato'], RECIPES, T0 + 1000).gained, 120);
  assert.equal(serveOrder(g, ['lettuce', 'tomato'], RECIPES, T0 + 40000).gained, 110);
  assert.equal(serveOrder(g, ['lettuce', 'tomato'], RECIPES, T0 + 79000).gained, 100);
  assert.equal(serveOrder(g, ['lettuce', 'tomato'], RECIPES, T0 + 80000).gained, 100, '대기 시간이 지나도 서빙 가능, 팁만 0');
  assert.equal(serveOrder(g, ['lettuce'], RECIPES, T0 + 1000), null);
});
test('콤보: 14초 안 연속 서빙마다 +20씩, 14초를 넘기면 처음부터, 상한 +100', () => {
  const c = cfg(600, 999999);
  let g = ordersTick({}, T0, c), r, t = 1000;
  const next = at => { r = serveOrder(g, RECIPES[activeOrders(g, T0 + at)[0].recipeId].items, RECIPES, T0 + at); g = ordersTick(r.next, T0 + at, c); return r; };
  assert.equal(next(1000).bonus, 0);
  assert.equal(next(15000).bonus, 20, '정확히 14초 뒤도 인정');
  assert.equal(next(20000).bonus, 40);
  assert.equal(next(34001).bonus, 0, '14초를 넘기면 콤보 끊김');
  for (let i = 0; i < 7; i++) r = next(35000 + i * 1000);
  assert.equal(r.bonus, 100, '상한');
  assert.equal(g.served, 11);
});
test('여러 주문·여러 접시를 따로 처리: 뒤에 온 주문 먼저 서빙 가능, 서로 다른 주문 재료는 한 접시에 못 섞음', () => {
  const c = cfg(180, 999999);
  let g = run({}, 0, 154000, c);                               // 주문 3개: 샐러드, 햄버거, 케이크
  const recs = activeOrders(g, T0 + 154000).map(o => RECIPES[o.recipeId]);
  assert.deepEqual(recs.map(r => r.title), ['샐러드', '햄버거', '케이크']);
  let p1 = tablePut(null, newPlate('u'), 1).next, p2 = tablePut(null, newPlate('u'), 1).next;
  p1 = tableAdd(p1, ready('flour'), recs, 2).next;
  assert.equal(tableAddCheck(p1, ready('lettuce'), recs).reason, 'notNeeded', '케이크 접시에 샐러드 재료 불가');
  p2 = tableAdd(p2, ready('lettuce'), recs, 2).next;
  assert.deepEqual(missingOf(contentsOf(p1.plate), recs), ['berry']);
  assert.deepEqual(missingOf(contentsOf(p2.plate), recs), ['tomato']);
  p1 = tableAdd(p1, ready('berry'), recs, 3).next;
  assert.equal(plateMatch(contentsOf(p1.plate), recs).title, '케이크');
  assert.equal(plateMatch(contentsOf(p2.plate), recs), null);
  const r = serveOrder(g, contentsOf(p1.plate), RECIPES, T0 + 155000);
  assert.equal(RECIPES[r.order.recipeId].title, '케이크');
  assert.deepEqual(activeOrders(r.next, T0 + 155000).map(o => RECIPES[o.recipeId].title), ['샐러드', '햄버거'], '다른 주문은 그대로 남음');
  assert.equal(serveOrder(r.next, contentsOf(p1.plate), RECIPES, T0 + 155100), null, '같은 주문을 두 번 서빙할 수 없음');
  assert.equal(matchOrder(r.next, ['meat', 'bread'], RECIPES, T0 + 155100).recipeId, 1);
});
test('교사 난이도 옵션: 주문 대기 시간 여유/보통/빠름', () => {
  assert.deepEqual(ORDER_TIME_OPTIONS, { easy: 100000, normal: 75000, fast: 55000 });
  const g = ordersTick({}, T0, cfg(180, ORDER_TIME_OPTIONS.easy));
  assert.equal(activeOrders(g, T0)[0].expiresAt - T0, 100000);
});
test('팀 편성과 공정 비교: 5명 팀, 20~25명 학급', () => {
  assert.deepEqual(planTeams(5), [5]);
  assert.deepEqual(planTeams(20), [5, 5, 5, 5]);
  assert.deepEqual(planTeams(23), [5, 5, 5, 4, 4]);
  assert.deepEqual(planTeams(25), [5, 5, 5, 5, 5]);
  assert.equal(fairScore(500, 5), 400);
  assert.equal(fairScore(400, 4), 400, '4명 팀 400점과 5명 팀 500점은 같은 실력으로 비교');
});

// 온라인 경로: 가짜 메모리 DB로 cloud.js 트랜잭션 코드 실행 (실서버 검증은 아님)
function fakeRoom(db, uid) {
  const room = new CloudRoom();
  room.team = 0; room.code = 'T'; room.uid = uid;
  room.path = (...p) => p.join('/');
  room.ops = { runTransaction: async (path, fn) => { const next = fn(structuredClone(db[path] ?? null)); if (next === undefined) return { committed: false }; if (next === null) delete db[path]; else db[path] = next; return { committed: true }; } };
  return room;
}
test('온라인(가짜 DB): 5명이 동시에 주문 갱신을 요청해도 주문은 한 번만 생기고, 동시 서빙은 한 번만 인정', async () => {
  const db = {}, rooms = ['a', 'b', 'c', 'd', 'e'].map(u => fakeRoom(db, u)), c = cfg(180, 999999);
  await Promise.all(rooms.map(r => r.groupOp('ALL', old => ordersTick(old, T0 + 144000, c))));
  const g = db['teams/0/data/groups/ALL'];
  assert.equal(Object.keys(g.orders).length, 2, '첫 주문 1개 + 러시 시작 1개');
  const res = await Promise.all(rooms.map(r => r.servePlate('ALL', ['lettuce', 'tomato'], RECIPES, () => T0 + 145000)));
  assert.equal(res.filter(Boolean).length, 1);
  assert.equal(db['teams/0/data/groups/ALL'].served, 1);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(['a', 'b', 'c', 'd', 'e'].reduce((n, u) => n + (db[`results/${u}/served`] || 0), 0), 1, '개인 서빙 기록도 한 명에게만');
});
