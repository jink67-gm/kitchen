// 문제 생성기: 정답 양을 먼저 정하고 식을 거꾸로 만든 뒤, div로 다시 계산해 검증한다.
// 문제 문장은 글자와 분수 조각의 배열(parts)이다. 빗금 분수 문자열은 만들지 않는다.
import { frac, mul, div, eq, cmp, isWhole, isProper } from './fraction.js';
import { CONFIG } from './config.js';
import { INGREDIENTS } from './recipes.js';

export const TYPES = {
  1: ['s1-a', 's1-b', 's1-c', 's1-d', 's1-e', 's1-f'],
  2: ['s2-a', 's2-b', 's2-c', 's2-d', 's2-e', 's2-f'],
};

export const TYPE_NAMES = {
  's1-a': '자연수 ÷ 자연수(몫이 1보다 작음)',
  's1-b': '자연수 ÷ 자연수(몫이 1보다 큼)',
  's1-c': '분수 ÷ 자연수(분자가 나누는 수의 배수)',
  's1-d': '분수 ÷ 자연수(배수가 아님)',
  's1-e': '가분수 ÷ 자연수',
  's1-f': '대분수 ÷ 자연수',
  's2-a': '분모가 같은 진분수 ÷ 진분수(나누어떨어짐)',
  's2-b': '분모가 같은 진분수 ÷ 진분수(안 나누어떨어짐)',
  's2-c': '분모가 다른 진분수 ÷ 진분수',
  's2-d': '자연수 ÷ 분수',
  's2-e': '분수 ÷ 분수(곱셈으로 바꾸기)',
  's2-f': '대분수 ÷ 분수',
};

const SAMPLE_INGREDIENTS = Object.keys(INGREDIENTS);
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const whole = (w) => frac(w, 1);

// 받침에 따라 조사를 고른다. 단위는 읽는 소리(킬로그램, 리터)로 판단한다.
function josa(word, withBatchim, without) {
  if (word === 'kg') return withBatchim;
  if (word === 'L') return without;
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? withBatchim : without;
}
const eul = (w) => josa(w, '을', '를');
const eun = (w) => josa(w, '은', '는');
const i = (w) => josa(w, '이', '가');

// 문장 조각 만들기. form: improper = 가분수 그대로, mixed = 대분수로
const F = (f, form = 'mixed') => ({ frac: { n: f.n, d: f.d }, form });
const OP = (s) => ({ op: s });

function parameters(type, t, rng) {
  // 각 유형에서 target을 만족하는 식의 후보를 모두 찾는다.
  const out = [];
  const maxA = CONFIG.MAX_AMOUNT;
  const s1Ok = (f) => f.d <= CONFIG.S1_MAX_DENOM && cmp(f, whole(maxA)) <= 0;
  const s2Ok = (f) => f.d <= CONFIG.S2_MAX_DENOM;

  switch (type) {
    case 's1-a':
      if (isProper(t) && t.d <= CONFIG.S1_MAX_DENOM) out.push({ a: t.n, b: t.d });
      break;
    case 's1-b':
      if (t.n > t.d && !isWhole(t) && t.d <= CONFIG.S1_MAX_DENOM) out.push({ a: t.n, b: t.d });
      break;
    case 's1-c':
      if (isProper(t)) {
        for (let k = 2; k <= 5; k++) {
          const dividend = frac(t.n * k, t.d);
          if (t.n * k < t.d && dividend.d === t.d && s1Ok(dividend)) out.push({ dividend, k });
        }
      }
      break;
    case 's1-d':
      if (isProper(t)) {
        for (let k = 2; k <= 5; k++) {
          if (t.d % k !== 0) continue;
          const dividend = frac(t.n, t.d / k);
          if (isProper(dividend) && dividend.n % k !== 0 && s1Ok(dividend)) out.push({ dividend, k });
        }
      }
      break;
    case 's1-e':
    case 's1-f':
      if (t.n > 0 && !isWhole(t)) {
        for (let k = 2; k <= 5; k++) {
          const dividend = mul(t, whole(k));
          if (dividend.n > dividend.d && !isWhole(dividend) && s1Ok(dividend)) out.push({ dividend, k });
        }
      }
      break;
    case 's2-a':
      if (isProper(t) && t.n >= 2) {
        for (let b = 1; b < t.n; b++) {
          if (t.n % b === 0) out.push({ cup: frac(b, t.d), q: frac(t.n, b) });
        }
      }
      break;
    case 's2-b':
      if (isProper(t) && t.n >= 3) {
        for (let b = 2; b < t.n; b++) {
          if (t.n % b !== 0 && frac(b, t.d).d === t.d) out.push({ cup: frac(b, t.d), q: frac(t.n, b) });
        }
      }
      break;
    case 's2-c':
      if (isProper(t)) {
        for (const q of [frac(2), frac(3), frac(4), frac(3, 2), frac(5, 2), frac(4, 3)]) {
          const cup = div(t, q);
          if (cup.d !== t.d && isProper(cup) && s2Ok(cup)) out.push({ cup, q });
        }
      }
      break;
    case 's2-d':
      if (isWhole(t) && t.n >= 1 && t.n <= CONFIG.S2D_MAX_WHOLE) {
        for (let d = 2; d <= CONFIG.S2_MAX_DENOM; d++) {
          for (let n = 1; n < d; n++) {
            const cup = frac(n, d);
            if (cup.d !== d || n === 1) continue; // 단위분수는 너무 쉬워서 뺀다
            const q = div(t, cup);
            if (q.d <= 4 && q.n / q.d <= 12) out.push({ cup, q });
          }
        }
      }
      break;
    case 's2-e':
      if (t.n > 0 && !isWhole(t)) {
        for (let d = 2; d <= 7; d++) {
          for (let n = 2; n < d; n++) {
            const per = frac(n, d);
            if (per.d !== d) continue;
            const given = mul(t, per);
            if (isProper(given) && s2Ok(given) && given.d > 1 && !eq(given, t)) out.push({ per, given });
          }
        }
      }
      break;
    case 's2-f':
      if (t.n > t.d && !isWhole(t) && cmp(t, whole(maxA)) <= 0) {
        for (const q of [frac(2), frac(3), frac(4), frac(5, 2), frac(7, 2), frac(5), frac(6)]) {
          const cup = div(t, q);
          if (isProper(cup) && s2Ok(cup)) out.push({ cup, q });
        }
      }
      break;
    default:
      throw new Error(`모르는 유형: ${type}`);
  }
  return out.length ? pick(out, rng) : null;
}

function s1Parts(type, p, ing, u, box) {
  const dividend = p.dividend
    ? F(p.dividend, type === 's1-e' ? 'improper' : 'mixed')
    : `${p.a}`;
  const k = p.k ?? p.b;
  return [
    [ing, ' ', dividend, ` ${u}${eul(u)} ${k}${box}에 똑같이 나누면 한 ${box}${eun(box)} 몇 ${u}일까요?`],
    [`${ing} `, dividend, ` ${u}${i(u)} 있어요. ${k}${box}에 똑같이 나누어 담으면 한 ${box}에 몇 ${u}씩 담길까요?`],
    [`손님 ${k}팀에게 ${ing} `, dividend, ` ${u}${eul(u)} 똑같이 나눠 주려고 해요. 한 팀에 몇 ${u}씩 줄까요?`],
  ];
}

// 포함제 문장. 나누어떨어지면 '한 봉지에 ○ kg씩 → 몇 봉지', 아니면 '몇 배'로 묻는다.
function s2CountParts(q, target, cup, ing, u, form, box) {
  const T = F(target, form);
  const C = F(cup, 'improper');
  if (isWhole(q)) {
    return {
      countUnit: box,
      options: [
        [`${ing} `, T, ` ${u}${eul(u)} 한 ${box}에 `, C, ` ${u}씩 나누어 담으면 몇 ${box}${i(box)} 될까요?`],
        [`${ing} `, T, ` ${u}${i(u)} 필요해요. 한 ${box}에 `, C, ` ${u}씩 들어 있다면 몇 ${box}${eul(box)} 가져와야 할까요?`],
        [`한 ${box}에 `, C, ` ${u}씩 담긴 ${ing}${eul(ing)} 모아 `, T, ` ${u}${eul(u)} 만들려면 몇 ${box}${i(box)} 필요할까요?`],
      ],
    };
  }
  return {
    countUnit: '배',
    options: [
      [`${ing} `, T, ` ${u}${eun(u)} `, C, ` ${u}의 몇 배일까요?`],
      [`필요한 ${ing} `, T, ` ${u}${eun(u)} `, C, ` ${u}의 몇 배일까요?`],
      [`레시피의 ${ing} `, T, ` ${u}${eun(u)} 한 번에 꺼내는 양 `, C, ` ${u}의 몇 배일까요?`],
    ],
  };
}

function s2PerParts(p, ing, u) {
  const per = F(p.per, 'improper');
  const g = F(p.given, 'improper');
  return [
    [`양념 `, per, ` kg에 ${ing} `, g, ` ${u}${i(u)} 들어가요. 양념 1 kg에는 ${ing}${i(ing)} 몇 ${u} 들어갈까요?`],
    [`반죽 `, per, ` kg을 만드는 데 ${ing} `, g, ` ${u}${eul(u)} 썼어요. 반죽 1 kg을 만들려면 ${ing}${i(ing)} 몇 ${u} 필요할까요?`],
    [`국물 `, per, ` L에 ${ing} `, g, ` ${u}${i(u)} 들어가요. 국물 1 L에는 ${ing}${eul(ing)} 몇 ${u} 넣을까요?`],
  ];
}

// 만들 수 없는 target이면 null을 돌려준다.
export function makeProblem(semester, type, target, { ingredient, rng = Math.random } = {}) {
  if (!TYPES[semester].includes(type)) throw new Error(`${semester}학기에 없는 유형: ${type}`);
  const p = parameters(type, target, rng);
  if (!p) return null;

  const ing = ingredient ?? pick(SAMPLE_INGREDIENTS, rng);
  const info = INGREDIENTS[ing];
  const u = info.unit;
  const box = pick(info.box, rng);
  const base = { semester, type, ingredient: ing, unit: u, target };

  let problem;
  if (semester === 1) {
    const parts = pick(s1Parts(type, p, ing, u, box), rng);
    const k = p.k ?? p.b;
    const dividend = p.dividend ?? whole(p.a);
    const dividendToken = p.dividend ? F(p.dividend, type === 's1-e' ? 'improper' : 'mixed') : `${p.a}`;
    problem = {
      ...base,
      parts,
      expr: [dividendToken, OP('÷'), `${k}`, OP('='), F(target)],
      answer: target,
      answerKind: 'amount',
      cup: null,
      check: div(dividend, whole(k)),
    };
  } else if (type === 's2-e') {
    problem = {
      ...base,
      parts: pick(s2PerParts(p, ing, u), rng),
      expr: [F(p.given, 'improper'), OP('÷'), F(p.per, 'improper'), OP('='), F(target)],
      answer: target,
      answerKind: 'amount',
      cup: null,
      check: div(p.given, p.per),
    };
  } else {
    const form = type === 's2-f' ? 'mixed' : 'improper';
    const counted = s2CountParts(p.q, target, p.cup, ing, u, form, box);
    problem = {
      ...base,
      parts: pick(counted.options, rng),
      countUnit: counted.countUnit,
      expr: [F(target, form), OP('÷'), F(p.cup, 'improper'), OP('='), F(p.q)],
      answer: p.q,
      answerKind: 'count',
      cup: p.cup,
      check: div(target, p.cup),
    };
  }

  // 다시 계산해 정답과 같은지 검사한다.
  if (!eq(problem.check, problem.answer)) throw new Error(`검증 실패: ${type}`);
  if (!eq(amountFromAnswer(problem, problem.answer), target)) throw new Error(`양 불일치: ${type}`);
  delete problem.check;
  return problem;
}

// 학생이 낸 답으로 실제 꺼내는 재료의 양을 구한다.
export function amountFromAnswer(problem, answer) {
  return problem.cup ? mul(answer, problem.cup) : answer;
}

// 이 유형으로 문제를 만들 수 있는 정답 양을 하나 고른다.
export function pickTarget(semester, type, rng = Math.random) {
  for (let tries = 0; tries < 400; tries++) {
    const t = randomTarget(semester, type, rng);
    if (parameters(type, t, rng)) return t;
  }
  throw new Error(`정답 양을 찾지 못함: ${type}`);
}

function randomTarget(semester, type, rng) {
  const maxD = semester === 1 ? CONFIG.S1_MAX_DENOM : CONFIG.S2_MAX_DENOM;
  if (type === 's2-d') return frac(1 + Math.floor(rng() * CONFIG.S2D_MAX_WHOLE), 1);
  const d = 2 + Math.floor(rng() * (maxD - 1));
  const improper = type === 's1-b' || type === 's2-f';
  if (improper) {
    const n = d + 1 + Math.floor(rng() * (CONFIG.MAX_AMOUNT * d - d));
    return frac(n, d);
  }
  return frac(1 + Math.floor(rng() * (d - 1)), d);
}
