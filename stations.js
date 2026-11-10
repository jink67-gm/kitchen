// 설비(도마) 상태 규칙 모듈 — 3단계
// 화면·Firebase와 무관한 순수 함수. 혼자 체험과 온라인 트랜잭션이 같은 함수를 씁니다.
//
// 도마 상태: 없음(null) = idle → reserved(재료를 올리고 수학 문제 푸는 중) → working(연타 중) → ready(완성품이 도마 위에 있음)
// 기록: { state, item:{id,kind,state,sourceBinId}, owner, name, progress, need, at }
// 각 함수는 성공하면 { next, item? }를, 할 수 없으면 null을 돌려줍니다. next가 null이면 도마가 비워집니다.

export const CHOPS_DEFAULT = 10;                 // 기본 연타 횟수
export const CHOP_OPTIONS = [10, 6, 3];          // 접근성: 연타 횟수 선택지
export const MIN_CHOP_GAP_MS = 45;               // 이보다 빠른 입력은 중복으로 보고 무시
export const RESERVE_TIMEOUT_MS = 60000;         // 문제 창을 띄운 채 사라진 경우
export const WORK_TIMEOUT_MS = 25000;            // 연타하다 자리를 떠난 경우

export const stationId = st => `${st.type}_${st.x}_${st.y}`;

// 주인이 사라져 방치된 도마인지 (누구나 재료를 회수할 수 있게 됨 → 영구 잠김 방지)
export function isStale(s, now) {
  if (!s) return false;
  if (s.state === 'reserved') return now - s.at > RESERVE_TIMEOUT_MS;
  if (s.state === 'working') return now - s.at > WORK_TIMEOUT_MS;
  return false;
}

const rec = item => ({ id: item.id, kind: item.kind, state: item.state, sourceBinId: item.sourceBinId });

// 손질 전 재료를 빈 도마에 올림
export function boardReserve(s, item, owner, name, now) {
  if (s || !item || item.state !== 'raw') return null;
  return { next: { state: 'reserved', item: rec(item), owner, name: name || '', progress: 0, need: 0, at: now } };
}
// 수학 정답 → 연타 시작 (아직 손질 완료가 아님)
export function boardStart(s, owner, need, now) {
  if (!s || s.state !== 'reserved' || s.owner !== owner) return null;
  return { next: { ...s, state: 'working', progress: 0, need: Math.max(1, Math.round(need) || CHOPS_DEFAULT), at: now } };
}
// 키를 한 번 누를 때마다 1회. 주인만 가능. 너무 빠른 중복 입력은 무시
export function boardChop(s, owner, now) {
  if (!s || s.state !== 'working' || s.owner !== owner) return null;
  if (s.progress > 0 && now - s.at < MIN_CHOP_GAP_MS) return null;
  const progress = s.progress + 1;
  if (progress >= s.need) return { next: { ...s, state: 'ready', item: { ...s.item, state: 'prepared' }, progress: s.need, at: now }, done: true };
  return { next: { ...s, progress, at: now } };
}
// 주인이 그만둠 (문제 창 닫기 등): 재료를 손질 전 그대로 돌려받음
export function boardCancel(s, owner) {
  if (!s || s.owner !== owner || (s.state !== 'reserved' && s.state !== 'working')) return null;
  return { next: null, item: { ...s.item, loc: 'held' } };
}
// 도마 위 물건 집기: 완성품은 팀원 누구나, 방치된 재료도 누구나
export function boardTake(s, now) {
  if (!s || !(s.state === 'ready' || isStale(s, now))) return null;
  return { next: null, item: { ...s.item, loc: 'held' } };
}
