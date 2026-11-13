// 실행: node --test tests/pot.test.mjs — 냄비 규칙
import test from 'node:test';
import assert from 'node:assert/strict';
import { potAdd, potTake, potCanAdd, potPartners, cookPhase, POT_TIMES } from '../stations.js';
const ready = (kind, id = kind) => ({ id, kind, state: 'prepared', loc: 'held', owner: 'a' });
const T0 = 1_000_000;
test('손질한 재료 2가지를 넣으면 끓기 시작 (토마토+우유 → 토마토 수프)', () => {
  let r = potAdd(null, ready('tomato'), 'a', '가람', T0);
  assert.equal(r.next.state, 'filling'); assert.deepEqual(r.next.items, ['tomato']); assert.equal(r.out, undefined);
  r = potAdd(r.next, ready('milk'), 'b', '나래', T0 + 1000);
  assert.equal(r.next.state, 'cooking'); assert.equal(r.out, 'tsoup');
  assert.equal(cookPhase(r.next, T0 + 1000 + POT_TIMES.cook - 1), 'cooking');
  assert.equal(cookPhase(r.next, T0 + 1000 + POT_TIMES.cook + 10), 'ready');
});
test('치즈+우유 → 치즈 수프, 넣는 순서는 상관없음', () => {
  const r = potAdd(potAdd(null, ready('milk'), 'a', '', T0).next, ready('cheese'), 'a', '', T0);
  assert.equal(r.out, 'csoup');
});
test('넣을 수 없는 경우: 손질 전 재료, 탄 재료, 짝이 안 맞는 재료, 같은 재료 두 번, 끓는 중', () => {
  assert.equal(potAdd(null, { ...ready('tomato'), state: 'raw' }, 'a', '', T0), null);
  assert.equal(potAdd(null, { ...ready('tomato'), state: 'burnt' }, 'a', '', T0), null);
  assert.equal(potAdd(null, ready('lettuce'), 'a', '', T0), null);
  const f = potAdd(null, ready('tomato'), 'a', '', T0).next;
  assert.equal(potAdd(f, ready('cheese'), 'a', '', T0), null, '토마토와 치즈는 수프가 안 됨');
  assert.equal(potAdd(f, ready('tomato', 't2'), 'a', '', T0), null);
  const c = potAdd(f, ready('milk'), 'a', '', T0).next;
  assert.equal(potAdd(c, ready('cheese'), 'a', '', T0), null);
  assert.ok(potCanAdd(null, 'milk') && potCanAdd(f, 'milk') && !potCanAdd(c, 'milk'));
  assert.deepEqual(potPartners('milk').sort(), ['cheese', 'tomato']);
});
test('꺼내기: 한 가지만 넣었으면 다시 꺼냄, 끓는 중 못 꺼냄, 다 되면 수프, 넘치면 넘친 수프', () => {
  const f = potAdd(null, ready('tomato'), 'a', '', T0).next;
  assert.deepEqual([potTake(f, T0).item.kind, potTake(f, T0).item.state, potTake(f, T0).next], ['tomato', 'prepared', null]);
  const c = potAdd(f, ready('milk'), 'a', '', T0).next;
  assert.equal(potTake(c, T0 + 100), null);
  const ok = potTake(c, T0 + POT_TIMES.cook + 100); assert.equal(ok.item.kind, 'tsoup'); assert.equal(ok.item.state, 'prepared');
  const over = potTake(c, T0 + POT_TIMES.cook + POT_TIMES.grace + 100); assert.equal(over.item.kind, 'tsoup'); assert.equal(over.item.state, 'burnt');
});
