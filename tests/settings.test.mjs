// 실행: node --test tests/settings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, OPTIONS, sanitize, withChops, cookTimes } from '../settings.js';
import { COOK_TIMES, cookStart, cookPhase, boardReserve } from '../stations.js';
import { ordersTick, activeOrders, participationBonus, PART_BONUS } from '../orders.js';
import { newItem } from '../items.js';

test('난이도 묶음 3개는 모두 허용된 값으로만 이루어짐', () => {
  for (const [name, p] of Object.entries(PRESETS)) for (const k of Object.keys(OPTIONS)) assert.ok(OPTIONS[k].includes(p[k]), `${name}.${k}=${p[k]}`);
  assert.ok(PRESETS.comfy.orderTimeMs > PRESETS.basic.orderTimeMs && PRESETS.basic.orderTimeMs > PRESETS.hard.orderTimeMs);
  assert.ok(PRESETS.comfy.chops < PRESETS.basic.chops && PRESETS.comfy.mathLevel < PRESETS.hard.mathLevel);
});
test('이상한 설정값은 받지 않고 기본값으로 대체', () => {
  assert.deepEqual(sanitize(null), PRESETS.basic);
  assert.deepEqual(sanitize({ chops: 9999, rushSpeed: 50, mathLevel: -3, hack: 1 }), PRESETS.basic);
  assert.equal(sanitize({ chops: '5', mathLevel: 2 }).chops, 5);
  assert.equal(sanitize({ chops: '5', mathLevel: 2 }).mathLevel, 2);
  assert.equal(withChops(PRESETS.basic, 3).chops, 3);
  assert.equal(withChops(PRESETS.basic, 3).washPresses, 3);
});
test('굽는 시간·타기 유예 설정이 실제 굽기에 적용됨', () => {
  const t = cookTimes(COOK_TIMES.meat, PRESETS.comfy);
  assert.deepEqual(t, { cook: 7800, grace: 8000 });
  const s = cookStart(boardReserve(null, newItem('meat', 'u'), 'u', '가', 0).next, 'u', 0, t).next;
  assert.equal(cookPhase(s, 7799), 'cooking'); assert.equal(cookPhase(s, 7800), 'ready'); assert.equal(cookPhase(s, 15799), 'warning'); assert.equal(cookPhase(s, 15800), 'burnt');
  assert.deepEqual(cookTimes(COOK_TIMES.meat, PRESETS.hard), { cook: 5100, grace: 3000 });
});
test('러시 주문 간격 설정: 15초로 바꾸면 15초 뒤에 추가', () => {
  const cfg = { startedAt: 0, durationMs: 180000, orderTimeMs: 999999, recipeCount: 6, rushIntervalMs: 15000 };
  let g = {}; for (let t = 0; t <= 158900; t += 300) g = ordersTick(g, t, cfg) || g;
  assert.equal(activeOrders(g, 158900).length, 2, '러시 시작 +1 뒤 15초 전까지는 2개');
  g = ordersTick(g, 159000, cfg) || g;
  assert.equal(activeOrders(g, 159000).length, 3);
});
test('참여 보너스: 팀원 모두가 한 문제 이상 맞혀야 +50, 판마다 한 번', () => {
  const g = { score: 100 }, ids = ['a', 'b', 'c', 'd'];
  assert.equal(participationBonus(g, ids, { a: 3, b: 1, c: 2 }), null, '한 명이라도 안 풀었으면 없음');
  const r = participationBonus(g, ids, { a: 3, b: 1, c: 2, d: 1 });
  assert.equal(r.score, 100 + PART_BONUS); assert.equal(r.partBonus, true);
  assert.equal(participationBonus(r, ids, { a: 9, b: 9, c: 9, d: 9 }), null, '두 번 받지 않음');
  assert.equal(participationBonus(g, ['a'], { a: 5 }), null, '혼자서는 해당 없음');
});
test('모의 검증: 4명이 번갈아 재료를 준비하면 모두 풀이 기회를 가짐 (정답 뒤 무료 횟수 규칙)', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    const pass = [0, 0, 0, 0], asked = [0, 0, 0, 0];
    for (let turn = 0; turn < 24; turn++) { const i = turn % 4; if (pass[i] > 0) pass[i]--; else { asked[i]++; pass[i] = p.freePass; } }   // 한 사람당 6번 준비
    assert.ok(asked.every(n => n >= 2), `${name}: 모두 2문제 이상 (${asked})`);
    assert.deepEqual(asked, [6 / (p.freePass + 1), 6 / (p.freePass + 1), 6 / (p.freePass + 1), 6 / (p.freePass + 1)], `${name}: 간격이 공정함`);
  }
});
