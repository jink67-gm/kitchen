// 난이도 설정 모듈 — 9단계
// 세 가지 묶음(편안함/기본/도전)과 교사가 하나씩 바꿀 수 있는 세부 항목. 온라인에서는 방을 만든 교사의 설정이 모두에게 적용됩니다.

export const PRESETS = {
  comfy: { chops: 5, mixPresses: 4, washPresses: 3, cookScale: 1.3, graceScale: 2, orderTimeMs: 100000, rushSpeed: 1.2, rushIntervalMs: 15000, mathLevel: 0, freePass: 2 },
  basic: { chops: 10, mixPresses: 6, washPresses: 5, cookScale: 1, graceScale: 1, orderTimeMs: 75000, rushSpeed: 1.35, rushIntervalMs: 10000, mathLevel: 1, freePass: 1 },
  hard: { chops: 12, mixPresses: 8, washPresses: 6, cookScale: 0.85, graceScale: 0.75, orderTimeMs: 55000, rushSpeed: 1.45, rushIntervalMs: 8000, mathLevel: 2, freePass: 0 },
};
export const PRESET_NAMES = { comfy: '편안함', basic: '기본', hard: '도전' };

// 항목별로 고를 수 있는 값 (이 밖의 값은 받지 않음)
export const OPTIONS = {
  chops: [3, 5, 6, 10, 12],                 // 도마 연타 횟수
  cookScale: [1.3, 1, 0.85],                // 굽는 시간 배율 (클수록 느긋)
  graceScale: [2, 1, 0.75],                 // 익은 뒤 타기까지 유예 배율
  orderTimeMs: [100000, 75000, 55000],      // 주문 대기 시간(팁이 줄어드는 시간)
  rushSpeed: [1.2, 1.35, 1.45],             // 러시타임 이동 속도
  rushIntervalMs: [15000, 10000, 8000],     // 러시타임 새 주문 간격
  mathLevel: [0, 1, 2],                     // 수학 문제 난이도
  freePass: [2, 1, 0],                      // 정답 뒤 문제 없이 바로 작업할 수 있는 횟수
  mixPresses: [3, 4, 6, 8], washPresses: [3, 5, 6],
};

// 어떤 값이 들어와도 허용된 값으로만 이루어진 설정을 돌려줌 (빠진 항목은 기본 묶음 값)
export function sanitize(input, base = 'basic') {
  const out = { ...(PRESETS[base] || PRESETS.basic) };
  if (input && typeof input === 'object') for (const k of Object.keys(OPTIONS)) { const v = Number(input[k]); if (OPTIONS[k].includes(v)) out[k] = v; }
  return out;
}
// 연타 횟수에 맞춰 젓기·설거지 횟수도 함께 줄이거나 늘림 (접근성 3번을 고르면 모두 가벼워지게)
export function withChops(s, chops) {
  const c = OPTIONS.chops.includes(Number(chops)) ? Number(chops) : s.chops;
  return { ...s, chops: c, mixPresses: c <= 3 ? 3 : c <= 6 ? 4 : c >= 12 ? 8 : 6, washPresses: c <= 6 ? 3 : c >= 12 ? 6 : 5 };
}
export const cookTimes = (base, s) => ({ cook: Math.round(base.cook * s.cookScale), grace: Math.round(base.grace * s.graceScale) });
