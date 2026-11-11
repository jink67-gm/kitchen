// 실행: node --test tests/cook.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newItem, checkStore, checkTrash, heldString } from '../items.js';
import { boardReserve, boardChop, cookStart, cookPhase, cookProgress, cookTake, washStart, washFinish, plateWashed, defaultPlates, COOK_TIMES, isStale } from '../stations.js';

const T0 = 5_000_000;
const cooking = kind => cookStart(boardReserve(null, newItem(kind, 'u1'), 'u1', '가', T0).next, 'u1', T0).next;

test('고기: 6초 굽기 → 완성 → 경고 → 10초에 탐 (시각만으로 계산)', () => {
  const s = cooking('meat');
  assert.deepEqual([s.cookMs, s.graceMs], [COOK_TIMES.meat.cook, COOK_TIMES.meat.grace]);
  assert.equal(cookPhase(s, T0 + 100), 'cooking');
  assert.equal(cookPhase(s, T0 + 5999), 'cooking');
  assert.equal(cookPhase(s, T0 + 6000), 'ready');
  assert.equal(cookPhase(s, T0 + 7999), 'ready');
  assert.equal(cookPhase(s, T0 + 8000), 'warning');
  assert.equal(cookPhase(s, T0 + 9999), 'warning');
  assert.equal(cookPhase(s, T0 + 10000), 'burnt');
  assert.equal(cookProgress(s, T0 + 3000), 0.5);
});
test('빵: 5초 굽기 + 3초 유예', () => {
  const s = cooking('bread');
  assert.equal(cookPhase(s, T0 + 4999), 'cooking');
  assert.equal(cookPhase(s, T0 + 5000), 'ready');
  assert.equal(cookPhase(s, T0 + 7999), 'warning');
  assert.equal(cookPhase(s, T0 + 8000), 'burnt');
});
test('수학 정답 전(reserved)에는 시간이 흐르지 않음, 남이 시작할 수 없음', () => {
  const r = boardReserve(null, newItem('meat', 'u1'), 'u1', '가', T0).next;
  assert.equal(cookPhase(r, T0 + 30000), 'reserved');
  assert.equal(cookStart(r, 'u2', T0), null);
});
test('굽는 중에는 꺼낼 수 없고 다른 재료를 올릴 수 없음', () => {
  const s = cooking('meat');
  assert.equal(cookTake(s, T0 + 3000), null);
  assert.equal(boardReserve(s, newItem('bread', 'u2'), 'u2', '나', T0 + 3000), null);
  assert.equal(isStale(s, T0 + 999999), false, '굽는 중인 화덕은 방치 처리되지 않고 그대로 탐');
});
test('익은 뒤 꺼내면 완성품, 화덕은 비워짐 (팀원 누구나, 한 번만)', () => {
  const s = cooking('meat');
  const r = cookTake(s, T0 + 6500);
  assert.equal(r.item.state, 'prepared'); assert.equal(r.next, null);
  assert.equal(cookTake(r.next, T0 + 6600), null);
  assert.equal(cookTake(s, T0 + 9000).item.state, 'prepared', '경고 중에도 아직 완성품');
});
test('탄 재료: 꺼내야 화덕이 비워지고, 보관 불가, 접시용 문자열과 구분, 버리기만 가능', () => {
  const s = cooking('meat');
  assert.equal(boardReserve(s, newItem('bread', 'u2'), 'u2', '나', T0 + 20000), null, '탄 재료가 남아 있으면 사용 불가');
  const r = cookTake(s, T0 + 20000);
  assert.equal(r.item.state, 'burnt'); assert.equal(r.next, null);
  assert.equal(heldString(r.item), 'burnt:meat');
  assert.equal(checkStore({}, r.item).reason, 'burnt');
  assert.equal(checkTrash(r.item).ok, true);
});
test('싱크대: 연타 완료 후 마무리하면 더러운 접시 -1, 깨끗한 접시 +1', () => {
  let s = washStart(null, 'u1', '가', 2, T0).next;
  assert.equal(washStart(s, 'u2', '나', 2, T0), null, '설거지 중 중복 사용 불가');
  s = boardChop(s, 'u1', T0 + 100).next;
  assert.equal(washFinish(s), null, '끝나기 전에는 마무리 불가');
  s = boardChop(s, 'u1', T0 + 200).next;
  assert.equal(s.state, 'ready'); assert.equal(s.item, null);
  assert.deepEqual(washFinish(s), { next: null });
  assert.deepEqual(plateWashed({ dirty: 2, clean: 0 }), { dirty: 1, clean: 1 });
  assert.equal(plateWashed({ dirty: 0, clean: 2 }), null);
});
