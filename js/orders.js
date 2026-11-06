// 시드로 주문 순서와 양을 계산한다. 시드가 같으면 어느 기기에서든 같은 주문이 나온다.
import { pickTarget } from './problems.js';
import { DISHES, unitOf } from './recipes.js';
import { CONFIG } from './config.js';

export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// index번째 주문을 만든다. 앞 주문과 상관없이 seed와 index만으로 정해진다.
export function makeOrder(seed, index, { semester, types, dishes }) {
  const rng = seededRng((seed + Math.imul(index + 1, 2654435761)) >>> 0);
  const dishName = dishes[Math.floor(rng() * dishes.length)];
  const lines = DISHES[dishName].ingredients.map((ingredient) => {
    const type = types[Math.floor(rng() * types.length)];
    return { ingredient, unit: unitOf(ingredient), type, amount: pickTarget(semester, type, rng) };
  });
  return { id: `o${index}`, index, dish: dishName, lines, durationMs: CONFIG.ORDER_MS };
}
