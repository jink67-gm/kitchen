// 점수와 별. 순위 계산은 6단계에서 추가한다.
import { CONFIG } from './config.js';

export const STARS = {
  1: [120, 240, 360],
  2: [150, 300, 450],
  3: [150, 300, 450],
  4: [180, 360, 540],
  5: [200, 400, 600],
};

export function tipFor(remainingRatio) {
  if (remainingRatio >= 0.5) return CONFIG.TIP_50;
  if (remainingRatio >= 0.25) return CONFIG.TIP_25;
  return 0;
}

export function serveScore(ingredientCount, remainingRatio) {
  const base = ingredientCount * CONFIG.SCORE_PER_INGREDIENT;
  const tip = tipFor(remainingRatio);
  return { base, tip, total: base + tip };
}

export function starsFor(stageId, score) {
  return STARS[stageId].filter((need) => score >= need).length;
}
