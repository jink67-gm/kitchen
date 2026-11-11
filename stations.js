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
  if (progress >= s.need) return { next: { ...s, state: 'ready', item: s.item ? { ...s.item, state: 'prepared' } : null, progress: s.need, at: now }, done: true };
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

// ───────── 4단계: 화덕(자동 타이머)·믹서·싱크대 ─────────
// 굽는 시간(ms). cook = 다 익을 때까지, grace = 익은 뒤 타기 전까지 (앞 절반은 '완성', 뒤 절반은 '경고')
export const COOK_TIMES = { meat: { cook: 6000, grace: 4000 }, bread: { cook: 5000, grace: 3000 }, dough: { cook: 6000, grace: 4000 } };
export const COOK_DEFAULT = { cook: 6000, grace: 4000 };
export const MIX_PRESSES = 6;                    // 믹서 젓기 횟수
export const WASH_PRESSES = 5;                   // 설거지 문지르기 횟수
export const PLATES_START = 3;                   // 판을 시작할 때 접시대에 있는 깨끗한 접시 수

// 수학 정답 → 굽기 시작. 이후 상태는 시각만으로 계산하므로 아무도 "익었다/탔다"를 따로 기록하지 않음 (중복 확정 없음)
export function cookStart(s, owner, now, times) {
  if (!s || s.state !== 'reserved' || s.owner !== owner) return null;
  const t = times || COOK_TIMES[s.item.kind] || COOK_DEFAULT;
  return { next: { ...s, state: 'cooking', startAt: now, cookMs: t.cook, graceMs: t.grace, at: now } };
}
// cooking(굽는 중) → ready(다 익음) → warning(곧 탐) → burnt(탐)
export function cookPhase(s, now) {
  if (!s) return 'idle';
  if (s.state !== 'cooking') return s.state;
  const e = now - s.startAt;
  if (e < s.cookMs) return 'cooking';
  if (e < s.cookMs + s.graceMs / 2) return 'ready';
  if (e < s.cookMs + s.graceMs) return 'warning';
  return 'burnt';
}
export function cookProgress(s, now) {
  if (!s || s.state !== 'cooking') return 0;
  return Math.max(0, Math.min(1, (now - s.startAt) / s.cookMs));
}
// 직접 집기: 익었으면 완성품, 타 버렸으면 탄 재료(버려야 설비가 비워짐). 굽는 중에는 못 집음
export function cookTake(s, now) {
  if (!s) return null;
  if (isStale(s, now)) return { next: null, item: { ...s.item, loc: 'held' } };
  const ph = cookPhase(s, now);
  if (ph === 'ready' || ph === 'warning') return { next: null, item: { ...s.item, state: 'prepared', loc: 'held' } };
  if (ph === 'burnt') return { next: null, item: { ...s.item, state: 'burnt', loc: 'held' } };
  return null;
}
// 싱크대: 재료 없이 작업만 점유
export function washStart(s, owner, name, need, now) {
  if (s) return null;
  return { next: { state: 'working', item: null, owner, name: name || '', progress: 0, need: Math.max(1, need || WASH_PRESSES), at: now } };
}
export function washFinish(s) {
  if (!s || s.item || s.state !== 'ready') return null;
  return { next: null };
}
export const defaultPlates = () => ({ dirty: 0, clean: PLATES_START });
export function plateWashed(pl) {
  pl = pl || defaultPlates();
  if (!(pl.dirty > 0)) return null;
  return { dirty: pl.dirty - 1, clean: (pl.clean || 0) + 1 };
}
