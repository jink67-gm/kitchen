// 분수 계산은 이 파일로만 한다. 소수로 바꾸지 않고, 항상 { n, d } 기약분수로 저장한다(d > 0).

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function frac(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) {
    throw new Error(`잘못된 분수: ${n}, ${d}`);
  }
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export function fromMixed(w, n, d) {
  return frac(w * d + n, d);
}

// 자연수·분자·분모로 나눈다. 예: 9/4 → { w: 2, n: 1, d: 4 }
export function toMixed(f) {
  const w = Math.floor(f.n / f.d);
  return { w, n: f.n - w * f.d, d: f.d };
}

export const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const div = (a, b) => frac(a.n * b.d, a.d * b.n);
export const eq = (a, b) => a.n * b.d === b.n * a.d;
export const cmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);

// 입력한 그대로의 분자·분모가 기약인지 본다(frac을 거치면 항상 기약이 되므로 따로 받는다).
export const isReduced = (n, d) => gcd(n, d) === 1;

export const isWhole = (f) => f.d === 1;
export const isProper = (f) => f.n > 0 && f.n < f.d;
