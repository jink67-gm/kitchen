// 접시 규칙 모듈 — 5단계
// 접시는 실제 물건입니다: 접시대(깨끗한 접시 더미) → 플레이팅대(재료를 하나씩 올림) → 손에 들고 서빙 벨 → 더러운 접시가 되어 싱크대로.
// 화면·Firebase와 무관한 순수 함수. 혼자 체험과 온라인 트랜잭션이 같은 함수를 씁니다.
//
// 접시(손에 든 상태): { id, kind:'plate', state:'plate', contents:['lettuce','tomato'], loc }
// 플레이팅대 기록:     { state:'plate', plate:{ id, contents }, at }
// 접시 수:             { clean, dirty }  (clean = 접시대에 쌓인 수, dirty = 싱크대에서 설거지를 기다리는 수)
import { defaultPlates } from './stations.js';

export const SERVE_SCORE = 100;

let seq = 0;
export const newPlate = owner => ({ id: `plate-${owner}-${Date.now().toString(36)}-${++seq}`, kind: 'plate', state: 'plate', contents: [], loc: 'held' });
export const isPlate = it => !!it && it.kind === 'plate';
export const contentsOf = p => (p && p.contents) || [];      // Firebase는 빈 배열을 저장하지 않으므로 항상 이 함수로 읽음

// 주문과 정확히 같은 조합인지 (모자라도, 남아도 안 됨)
export function plateComplete(contents, recipe) {
  const c = contents || [];
  return !!recipe && c.length === recipe.items.length && recipe.items.every(i => c.includes(i));
}
export const missingOf = (contents, recipe) => recipe.items.filter(i => !(contents || []).includes(i));

// 접시대: 깨끗한 접시 한 장 꺼내기 / 빈 접시 돌려놓기
export function rackTake(pl) {
  pl = pl || defaultPlates();
  if (!(pl.clean > 0)) return null;
  return { ...pl, clean: pl.clean - 1 };
}
export function rackReturn(pl) {
  pl = pl || defaultPlates();
  return { ...pl, clean: (pl.clean || 0) + 1 };
}
// 서빙한 접시는 더러운 접시가 되어 싱크대로
export function plateDirtied(pl) {
  pl = pl || defaultPlates();
  return { ...pl, dirty: (pl.dirty || 0) + 1 };
}

// 플레이팅대에 접시 놓기 (이미 접시가 있으면 불가)
export function tablePut(s, plate, now) {
  if (s || !isPlate(plate)) return null;
  return { next: { state: 'plate', plate: { id: plate.id, contents: [...contentsOf(plate)] }, at: now } };
}
// 재료를 올릴 수 있는지와 이유
export function tableAddCheck(s, item, recipe) {
  if (!item || item.state === 'raw') return { ok: false, reason: 'notPrepared' };
  if (item.state === 'burnt') return { ok: false, reason: 'burnt' };
  if (!s || s.state !== 'plate') return { ok: false, reason: 'noPlate' };
  if (!recipe || !recipe.items.includes(item.kind)) return { ok: false, reason: 'notNeeded' };
  if (contentsOf(s.plate).includes(item.kind)) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}
// 준비된 재료 하나를 접시에 올림. 같은 재료를 두 번 올릴 수 없음 (동시에 눌러도 한 명만 성공)
export function tableAdd(s, item, recipe, now) {
  if (!tableAddCheck(s, item, recipe).ok) return null;
  return { next: { ...s, plate: { id: s.plate.id, contents: [...contentsOf(s.plate), item.kind] }, at: now } };
}
// 접시 들기 (완성이든 아니든 누구나, 한 명만)
export function tableLift(s) {
  if (!s || s.state !== 'plate') return null;
  return { next: null, item: { id: s.plate.id, kind: 'plate', state: 'plate', contents: [...contentsOf(s.plate)], loc: 'held' } };
}
// 서빙: 지금 주문과 정확히 맞는 접시만 점수. 주문이 이미 넘어갔으면 거절 → 같은 주문을 두 번 서빙할 수 없음
export function serveGroup(old, contents, recipes) {
  if (!old) return null;
  const cur = recipes[(old.orderIndex || 0) % recipes.length];
  if (!plateComplete(contents, cur)) return null;
  return { ...old, orderIndex: (old.orderIndex || 0) + 1, score: (old.score || 0) + SERVE_SCORE, served: (old.served || 0) + 1 };
}
