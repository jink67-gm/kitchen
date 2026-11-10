// 주문 규칙 모듈 — 6단계
// 주문 대기열, 러시타임, 점수·콤보. 화면·Firebase와 무관한 순수 함수이고 시각(now)만으로 계산합니다.
// 온라인에서는 어느 학생의 컴퓨터가 계산하든 같은 결과가 나오고, 트랜잭션으로 저장해 주문이 중복으로 생기지 않습니다.
//
// 팀(편) 기록: { score, served, correct, wrong, orders:{ o0:{id,n,recipeId,createdAt,expiresAt} }, orderSeq, rushAdds, combo, lastServeAt, expired }

export const ORDER_TIME_OPTIONS = { easy: 100000, normal: 75000, fast: 55000 };   // 주문 대기 시간(ms): 여유 / 보통 / 빠름
export const ORDER_TIME_DEFAULT = ORDER_TIME_OPTIONS.normal;
export const MAX_ORDERS = 3;               // 동시에 떠 있는 주문 최대 개수
export const RUSH_SECONDS = 40;            // 러시타임: 마지막 40초
export const RUSH_FRACTION = 0.2;          // 단, 짧은 판은 마지막 20%
export const RUSH_SPEED = 1.35;            // 러시 중 이동 속도 배율
export const RUSH_INTERVAL_MS = 10000;     // 러시 중 새 주문 간격
export const SERVE_SCORE = 100;            // 서빙 기본 점수
export const COMBO_WINDOW_MS = 14000;      // 이 시간 안에 연속 서빙하면 콤보
export const COMBO_STEP = 20;              // 콤보 1단계마다 추가 점수
export const COMBO_CAP = 5;                // 콤보 상한 (+100까지)
export const TIP_MAX = 20;                 // 빨리 서빙하면 받는 팁 (늦을수록 줄어들 뿐, 감점은 없음)

export function rushStartMs(durationMs) { return durationMs - Math.min(RUSH_SECONDS * 1000, durationMs * RUSH_FRACTION); }
export function isRush(elapsedMs, durationMs) { return elapsedMs >= rushStartMs(durationMs) && elapsedMs < durationMs; }

// 지금 유효한 주문 (먼저 온 순서)
export function activeOrders(g, now) {
  return Object.values((g && g.orders) || {}).filter(o => o.expiresAt > now).sort((a, b) => a.n - b.n);
}
// 남은 대기 시간 비율 1 → 0, 그리고 게이지 색
export function patience(o, now) { return Math.max(0, Math.min(1, (o.expiresAt - now) / (o.expiresAt - o.createdAt))); }
export const patienceColor = f => (f > 0.5 ? 'green' : f > 0.25 ? 'yellow' : 'red');

// 주문 대기열 갱신: 만료 정리, 주문이 없으면 1개 추가, 러시 시작 시 +1, 러시 중 10초마다 +1 (최대 3개)
// 바뀐 것이 없으면 null. cfg: { startedAt, durationMs, orderTimeMs, recipeCount }
export function ordersTick(g, now, cfg) {
  g = g || {};
  const elapsed = now - cfg.startedAt;
  if (elapsed < 0 || elapsed >= cfg.durationMs) return null;
  const orders = { ...(g.orders || {}) };
  let changed = false, seq = g.orderSeq || 0, expired = g.expired || 0, combo = g.combo || 0, rushAdds = g.rushAdds || 0;
  for (const id of Object.keys(orders)) if (orders[id].expiresAt <= now) { delete orders[id]; expired++; combo = 0; changed = true; }   // 만료: 감점 없이 사라지고 콤보만 끊김
  let n = Object.keys(orders).length;
  const add = () => { const id = 'o' + seq; orders[id] = { id, n: seq, recipeId: seq % cfg.recipeCount, createdAt: now, expiresAt: now + cfg.orderTimeMs }; seq++; n++; changed = true; };
  if (n === 0) add();
  if (isRush(elapsed, cfg.durationMs)) {
    const expected = Math.floor((elapsed - rushStartMs(cfg.durationMs)) / RUSH_INTERVAL_MS) + 1;   // 러시 시작 순간 1번 + 이후 10초마다
    while (rushAdds < expected) { if (n < MAX_ORDERS) add(); rushAdds++; changed = true; }
  }
  return changed ? { ...g, orders, orderSeq: seq, expired, combo, rushAdds } : null;
}

const sameSet = (contents, items) => !!items && items.length > 0 && (contents || []).length === items.length && items.every(i => contents.includes(i));
// 접시와 정확히 맞는 주문 (여러 개면 먼저 온 주문)
export function matchOrder(g, contents, recipes, now) {
  return activeOrders(g, now).find(o => sameSet(contents, recipes[o.recipeId].items)) || null;
}
// 서빙: 맞는 주문이 있어야만 점수. 100 + 팁(남은 시간 비례, 5점 단위) + 콤보(14초 안 연속 성공마다 +20, 상한 있음)
export function serveOrder(g, contents, recipes, now) {
  const o = matchOrder(g, contents, recipes, now);
  if (!o) return null;
  const tip = Math.round(TIP_MAX * patience(o, now) / 5) * 5;
  const combo = g.lastServeAt && now - g.lastServeAt <= COMBO_WINDOW_MS ? (g.combo || 0) + 1 : 0;
  const bonus = Math.min(combo, COMBO_CAP) * COMBO_STEP;
  const gained = SERVE_SCORE + tip + bonus;
  const orders = { ...g.orders }; delete orders[o.id];
  return { next: { ...g, orders, score: (g.score || 0) + gained, served: (g.served || 0) + 1, combo, lastServeAt: now }, gained, tip, bonus, combo, order: o };
}
// 팀 인원이 달라도 공정하게 비교하는 점수 (4명 기준으로 환산)
export const fairScore = (score, teamSize) => Math.round((score || 0) / (teamSize || 4) * 4);
