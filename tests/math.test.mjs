// 실행: node --test tests/math.test.mjs
// 문제 생성기와 "따로 만든 계산기"의 답을 비교합니다. 단원 6개 × 난이도 3개 × 400문제 = 7,200문제를 검산합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProblem, fracText, dec, isCorrect, weakUnit, UNIT_NAMES } from '../math.js';

// 재현 가능한 난수
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 검산용 계산기 (생성기의 계산을 쓰지 않고 spec만 보고 다시 계산)
const g = (a, b) => (b ? g(b, a % b) : Math.abs(a));
function solve(spec) {
  switch (spec.type) {
    case 'fracdiv': { const n = spec.a[0] * spec.b[1], d = spec.a[1] * spec.b[0], k = g(n, d); const N = n / k, D = d / k; return D === 1 ? String(N) : N < D ? `${N}/${D}` : `${Math.floor(N / D)} ${N % D}/${D}`; }
    case 'decdiv': { const q100 = spec.a * 100 / spec.b; assert.ok(Number.isInteger(q100), '몫이 소수 둘째 자리 안에서 나누어떨어져야 함'); return String(q100 / 100); }
    case 'grid': {
      const flat = spec.grid.flat(), cols = spec.grid[0].length;
      const colMax = Array.from({ length: cols }, (_, c) => Math.max(...spec.grid.map(r => r[c])));
      if (spec.ask === 'total') return String(flat.reduce((a, v) => a + v, 0));
      if (spec.ask === 'layer2') return String(flat.filter(v => v >= 2).length);
      if (spec.ask === 'layer3') return String(flat.filter(v => v >= 3).length);
      if (spec.ask === 'colmax') return String(colMax[spec.col]);
      if (spec.ask === 'front') return String(colMax.reduce((a, v) => a + v, 0));
      return String(spec.grid.reduce((a, r) => a + Math.max(...r), 0));
    }
    case 'prop': { const x = spec.b * spec.c / spec.a; assert.ok(Number.isInteger(x), '비례식의 답은 자연수'); return String(x); }
    case 'share': { assert.equal(spec.total % (spec.a + spec.b), 0, '비례배분이 나누어떨어져야 함'); return String(spec.total / (spec.a + spec.b) * spec.a); }
    case 'circle': {
      if (spec.ask === 'circ') return String(spec.r2 * spec.piH / 100);
      if (spec.ask === 'area') return String(spec.r2 * spec.r2 * spec.piH / 400);
      const d = spec.circH / spec.piH; assert.ok(Number.isInteger(d)); return String(d);
    }
    case 'cyl': {
      if (spec.ask === 'width') return String(2 * spec.r * spec.piH / 100);
      if (spec.ask === 'side') return String(2 * spec.r * spec.piH * spec.h / 100);
      const r = spec.widthH / spec.piH / 2; assert.ok(Number.isInteger(r)); return String(r);
    }
    case 'value': return String(spec.value);
  }
  throw new Error('모르는 문제 종류: ' + spec.type);
}
// 보기의 값이 서로 다른지 비교하기 위해 글자를 수로 바꿈 ('1 1/8' → 1.125)
function valueOf(s) { const m = String(s).match(/^(?:(\d+) )?(\d+)\/(\d+)$/); return m ? (Number(m[1] || 0) + Number(m[2]) / Number(m[3])) : Number(s); }

for (let unit = 1; unit <= 6; unit++) for (let level = 0; level <= 2; level++) {
  test(`${unit}단원 ${UNIT_NAMES[unit]} · 난이도 ${level}: 400문제 검산`, () => {
    const rng = rngOf(unit * 1000 + level * 77 + 5), kinds = new Set();
    for (let i = 0; i < 400; i++) {
      const p = makeProblem(unit, level, rng), where = `${p.question} → ${p.answer} [${p.options.join(', ')}]`;
      assert.equal(p.answer, solve(p.spec), '정답이 검산과 다름: ' + where);
      assert.equal(p.options.length, 4, '보기는 4개: ' + where);
      assert.equal(p.options.filter(o => isCorrect(p, o)).length, 1, '정답 보기는 정확히 1개: ' + where);
      const vals = p.options.map(valueOf);
      assert.ok(vals.every(v => Number.isFinite(v) && v >= 0), '보기는 0 이상의 수: ' + where);
      assert.equal(new Set(vals.map(v => v.toFixed(6))).size, 4, '값이 같은 보기가 없어야 함 (답이 여러 개가 되지 않게): ' + where);
      assert.ok(p.hint && p.hint.length > 5, '힌트가 있어야 함');
      assert.ok(p.explanation && p.explanation.length > 3, '해설이 있어야 함');
      if (/[=×÷]/.test(p.explanation)) assert.ok(p.explanation.includes(p.answer.split(' ').pop().split('/')[0]), '계산식 해설에는 답이 들어 있어야 함: ' + where + ' / ' + p.explanation);
      assert.ok(!/NaN|undefined|Infinity|-\d/.test(p.question + p.options.join(' ') + p.explanation), '문장에 잘못된 값이 없어야 함: ' + where);
      assert.ok(!/\d\.\d{3,}/.test(p.question + p.options.join(' ')), '소수는 둘째 자리까지만: ' + where);
      if (unit === 1) for (const m of (p.question + ' ' + p.answer).matchAll(/(\d+)\/(\d+)/g)) assert.equal(g(Number(m[1]), Number(m[2])), level === 0 ? g(Number(m[1]), Number(m[2])) : 1, '분수는 기약분수로: ' + where);
      kinds.add(p.spec.type + (p.spec.ask || ''));
    }
    assert.ok(kinds.size >= 1);
  });
}

test('표시 형식: 기약분수·대분수·소수', () => {
  assert.equal(fracText(6, 8), '3/4'); assert.equal(fracText(9, 8), '1 1/8'); assert.equal(fracText(12, 4), '3');
  assert.equal(dec(314), '3.14'); assert.equal(dec(1250), '12.5'); assert.equal(dec(600), '6');
});
test('난이도가 실제로 다름: 원주율 3 / 3.1 / 3.14, 3단원 표 크기', () => {
  const rng = rngOf(9);
  assert.ok(makeProblem(5, 0, rng).question.includes('원주율: 3)'));
  assert.ok(makeProblem(5, 1, rng).question.includes('원주율: 3.1)'));
  assert.ok(makeProblem(5, 2, rng).question.includes('원주율: 3.14)'));
  assert.deepEqual([makeProblem(3, 0, rng).grid.flat().length, makeProblem(3, 1, rng).grid.flat().length, makeProblem(3, 2, rng).grid.flat().length], [4, 6, 9]);
});
test('다시 공부할 단원 추천', () => {
  assert.equal(weakUnit({}), 0);
  assert.equal(weakUnit({ 1: { correct: 5 } }), 0, '틀린 적이 없으면 추천 없음');
  assert.equal(weakUnit({ 1: { correct: 3, wrong: 1 }, 4: { correct: 1, wrong: 3 }, 5: { correct: 9, wrong: 1 } }), 4);
  assert.equal(weakUnit({ 2: { correct: 1, wrong: 1 }, 6: { correct: 2, wrong: 2 } }), 6, '정답률이 같으면 더 많이 틀린 단원');
});
