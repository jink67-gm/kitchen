// 재료(아이템) 규칙 모듈 — 2단계
// 화면·Firebase와 무관한 순수 함수만 둡니다. 혼자 체험(game.js)과 온라인(cloud.js 트랜잭션)이 같은 함수를 써서 규칙이 어긋나지 않게 합니다.
//
// 아이템: { id, kind, state, sourceBinId, loc, owner }
//   state: 'raw'(손질 전) | 'prepared'(손질·조리 완료) | 'burnt'(탄 것, 4단계에서 사용)
//   loc:   'held' | 'storage' | 'plate' | 'bin'(반환됨) | 'trash'  — 한 아이템은 한 곳에만 있습니다.

export const STORAGE_MAX = 5;      // 보관대 칸 수 (팀 공유)
export const TRASH_PENALTY = 8;    // 손질한 재료를 버릴 때 깎이는 점수

let seq = 0;
export const binIdOf = kind => 'bin:' + kind;

export function newItem(kind, owner) {
  return { id: `${owner}-${Date.now().toString(36)}-${++seq}`, kind, state: 'raw', sourceBinId: binIdOf(kind), loc: 'held', owner };
}

// 예전 p.held 문자열('tomato', 'ready:tomato')과의 호환 어댑터. 온라인 위치 동기화와 화면 그리기가 이 문자열을 씁니다.
export function heldString(item) {
  if (!item) return '';
  if (item.kind === 'plate') return 'plate:' + (item.contents || []).join('+');   // 접시: 'plate:lettuce+tomato'
  return item.state === 'raw' ? item.kind : (item.state === 'burnt' ? 'burnt:' : 'ready:') + item.kind;
}

export function prepare(item) {
  if (!item || item.state !== 'raw') return null;
  return { ...item, state: 'prepared' };
}

// 재료 상자에 돌려놓기: 손질 전 + 가져온 바로 그 상자만
export function checkReturn(item, bin) {
  if (!item) return { ok: false, reason: 'empty' };
  if (item.state !== 'raw') return { ok: false, reason: 'notRaw' };
  if (!bin || binIdOf(bin.food) !== item.sourceBinId) return { ok: false, reason: 'wrongBin' };
  return { ok: true };
}

const count = storage => Object.keys(storage || {}).length;

// 보관대에 넣기: 손질 완료 재료만, 최대 5칸
export function checkStore(storage, item) {
  if (!item) return { ok: false, reason: 'empty' };
  if (item.state === 'raw') return { ok: false, reason: 'raw' };
  if (item.state === 'burnt') return { ok: false, reason: 'burnt' };
  if ((storage || {})[item.id]) return { ok: false, reason: 'duplicate' };
  if (count(storage) >= STORAGE_MAX) return { ok: false, reason: 'full' };
  return { ok: true };
}
// 넣은 뒤의 새 보관대를 돌려줌. 안 되면 null. (원본은 바꾸지 않음 → 트랜잭션 안에서 그대로 사용)
export function storePut(storage, item, at = Date.now()) {
  if (!checkStore(storage, item).ok) return null;
  return { ...(storage || {}), [item.id]: { id: item.id, kind: item.kind, state: item.state, sourceBinId: item.sourceBinId, at } };
}
// 고른 아이템 하나를 꺼냄. 이미 다른 사람이 꺼냈으면 null → 복제 불가
export function storeTake(storage, id) {
  const rec = (storage || {})[id];
  if (!rec) return null;
  const rest = { ...storage };
  delete rest[id];
  return { storage: rest, item: { id: rec.id, kind: rec.kind, state: rec.state, sourceBinId: rec.sourceBinId, loc: 'held' } };
}
export function storageList(storage) {
  return Object.values(storage || {}).sort((a, b) => (a.at || 0) - (b.at || 0) || String(a.id).localeCompare(String(b.id)));
}

// 쓰레기통: 손질 완료(또는 탄) 재료만. 손질 전 재료는 상자로 돌려놓게 유도
export function checkTrash(item) {
  if (!item) return { ok: false, reason: 'empty' };
  if (item.state === 'raw') return { ok: false, reason: 'raw' };
  return { ok: true, penalty: TRASH_PENALTY };
}
export const applyPenalty = (score, penalty = TRASH_PENALTY) => Math.max(0, (Number(score) || 0) - penalty);
