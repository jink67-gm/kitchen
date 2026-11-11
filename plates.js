// 접시 규칙 모듈 — 5단계
// 접시는 실제 물건입니다: 접시대(깨끗한 접시 더미) → 플레이팅대(재료를 하나씩 올림) → 손에 들고 서빙 벨 → 더러운 접시가 되어 싱크대로.
// 화면·Firebase와 무관한 순수 함수. 혼자 체험과 온라인 트랜잭션이 같은 함수를 씁니다.
//
// 접시(손에 든 상태): { id, kind:'plate', state:'plate', contents:['lettuce','tomato'], loc }
// 플레이팅대 기록:     { state:'plate', plate:{ id, contents }, at }
// 접시 수:             { clean, dirty }  (clean = 접시대에 쌓인 수, dirty = 싱크대에서 설거지를 기다리는 수)
import { defaultPlates } from './stations.js';

let seq = 0;
export const newPlate = owner => ({ id: `plate-${owner}-${Date.now().toString(36)}-${++seq}`, kind: 'plate', state: 'plate', contents: [], loc: 'held' });
export const isPlate = it => !!it && it.kind === 'plate';
export const contentsOf = p => (p && p.contents) || [];      // Firebase는 빈 배열을 저장하지 않으므로 항상 이 함수로 읽음

// 주문과 정확히 같은 조합인지 (모자라도, 남아도 안 됨)
export function plateComplete(contents, recipe) {
  const c = contents || [];
  return !!recipe && recipe.items.length > 0 && c.length === recipe.items.length && recipe.items.every(i => c.includes(i));
}
// 6단계: 주문이 여러 개일 수 있음. recipes = 지금 떠 있는 주문들의 레시피 (먼저 온 순서)
const asList = r => (Array.isArray(r) ? r : r ? [r] : []);
const fits = (contents, recipe) => (contents || []).every(k => recipe.items.includes(k));
// 접시와 정확히 맞는 레시피 (없으면 null)
export const plateMatch = (contents, recipes) => asList(recipes).find(r => plateComplete(contents, r)) || null;
// 이 접시가 향하고 있는 레시피 (지금까지 올린 재료를 모두 포함하는 첫 주문)
export const plateTarget = (contents, recipes) => asList(recipes).find(r => r.items.length && fits(contents, r)) || null;
export const missingOf = (contents, recipes) => { const r = plateTarget(contents, recipes); return r ? r.items.filter(i => !(contents || []).includes(i)) : []; };

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
export function tableAddCheck(s, item, recipes) {
  if (!item || item.state === 'raw') return { ok: false, reason: 'notPrepared' };
  if (item.state === 'burnt') return { ok: false, reason: 'burnt' };
  if (!s || s.state !== 'plate') return { ok: false, reason: 'noPlate' };
  if (contentsOf(s.plate).includes(item.kind)) return { ok: false, reason: 'duplicate' };
  // 올린 뒤에도 어떤 주문 하나의 재료 조합 안에 들어가야 함 (서로 다른 주문의 재료를 한 접시에 섞을 수 없음)
  if (!asList(recipes).some(r => r.items.includes(item.kind) && fits(contentsOf(s.plate), r))) return { ok: false, reason: 'notNeeded' };
  return { ok: true };
}
// 준비된 재료 하나를 접시에 올림. 같은 재료를 두 번 올릴 수 없음 (동시에 눌러도 한 명만 성공)
export function tableAdd(s, item, recipes, now) {
  if (!tableAddCheck(s, item, recipes).ok) return null;
  return { next: { ...s, plate: { id: s.plate.id, contents: [...contentsOf(s.plate), item.kind] }, at: now } };
}
// 접시 들기 (완성이든 아니든 누구나, 한 명만)
export function tableLift(s) {
  if (!s || s.state !== 'plate') return null;
  return { next: null, item: { id: s.plate.id, kind: 'plate', state: 'plate', contents: [...contentsOf(s.plate)], loc: 'held' } };
}
// 서빙 점수 계산은 orders.js의 serveOrder가 담당합니다.
