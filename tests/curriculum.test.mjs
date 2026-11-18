// 실행: node --test tests/curriculum.test.mjs
// 3~6학년 48단원 × 난이도 3개 × 300문제를 만들어, 생성기와 따로 만든 계산기로 다시 계산해 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM, makeUnitProblem, unitName, unitsOf, parseUnits, normUnit, weakUnitId, DEFAULT_UNITS } from '../curriculum.js';

function rngOf(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// ── 정확한 분수 계산 (생성기 코드를 쓰지 않음) ──
const g = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const Q = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const k = g(n, d) || 1; return [n / k, d / k]; };
const add = (a, b) => Q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]), sub = (a, b) => Q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => Q(a[0] * b[0], a[1] * b[1]), div = (a, b) => Q(a[0] * b[1], a[1] * b[0]);
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
function numQ(s) {   // '12', '3.45', '3/4', '1 2/3', '115°', '25%'
  s = String(s).trim().replace(/[°%]$/, '').replace(/,/g, '');
  let m = s.match(/^(\d+) (\d+)\/(\d+)$/); if (m) return add(Q(+m[1]), Q(+m[2], +m[3]));
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return Q(+m[1], +m[2]);
  m = s.match(/^(\d+)(?:\.(\d+))?$/); if (m) return Q(Number(m[1] + (m[2] || '')), 10 ** (m[2] || '').length);
  return null;
}
function evalExpr(src) {   // + - * / ( ) 와 소수·자연수
  const t = src.match(/\d+(?:\.\d+)?|[()+\-*/]/g); let i = 0;
  const atom = () => { const x = t[i++]; if (x === '(') { const v = sum(); i++; return v; } return numQ(x); };
  const prod = () => { let v = atom(); while (t[i] === '*' || t[i] === '/') { const o = t[i++], r = atom(); v = o === '*' ? mul(v, r) : div(v, r); } return v; };
  const sum = () => { let v = prod(); while (t[i] === '+' || t[i] === '-') { const o = t[i++], r = prod(); v = o === '+' ? add(v, r) : sub(v, r); } return v; };
  return sum();
}
function expected(spec) {
  switch (spec.type) {
    case 'expr': return evalExpr(spec.expr);
    case 'num': return Q(spec.value);
    case 'frac': return Q(spec.n, spec.d);
    case 'dec': return Q(spec.h, 100);
    case 'gcd': return Q(g(spec.a, spec.b));
    case 'lcm': return Q(spec.a / g(spec.a, spec.b) * spec.b);
    case 'mean': return Q(spec.xs.reduce((a, b) => a + b, 0), spec.xs.length);
    case 'solid': { const n = spec.n; return Q(spec.solid === '기둥' ? { 면: n + 2, 모서리: 3 * n, 꼭짓점: 2 * n }[spec.part] : { 면: n + 1, 모서리: 2 * n, 꼭짓점: n + 1 }[spec.part]); }
  }
  return null;
}

test('단원 목록: 3~6학년 1·2학기 모두 6단원, 이름 있음', () => {
  for (const g2 of [3, 4, 5, 6]) for (const s of [1, 2]) {
    assert.equal(CURRICULUM[g2][s].length, 6);
    for (const id of unitsOf(g2, s)) assert.ok(unitName(id).startsWith(`${g2}학년 ${s}학기`), id);
  }
  assert.equal(unitName('4-1-2'), '4학년 1학기 2. 각도');
  assert.equal(unitName('4-1-2', true), '2. 각도');
  assert.deepEqual(parseUnits('all'), DEFAULT_UNITS.split(','));
  assert.deepEqual(parseUnits('1,3'), ['6-2-1', '6-2-3']);           // 옛 방 기록
  assert.deepEqual(parseUnits('3-1-1,9-9-9,5-2-6'), ['3-1-1', '5-2-6']);
  assert.equal(normUnit('4'), '6-2-4');
  assert.equal(weakUnitId({ '3-1-2': { correct: 5, wrong: 1 }, '4-1-2': { correct: 1, wrong: 3 } }), '4-1-2');
  assert.equal(weakUnitId({}), '');
});

for (const g2 of [3, 4, 5, 6]) for (const s of [1, 2]) for (const id of unitsOf(g2, s)) {
  test(`${unitName(id)}: 난이도 3개 × 300문제 검산`, () => {
    const kinds = new Set();
    for (let lv = 0; lv <= 2; lv++) {
      const rng = rngOf(id.split('-').reduce((a, v) => a * 31 + Number(v), 7) * 10 + lv);
      for (let i = 0; i < 300; i++) {
        const p = makeUnitProblem(id, lv, rng), where = `[${id} 난이도${lv}] ${p.question} → ${p.answer} [${p.options.join(' | ')}]`;
        assert.equal(p.unit, id, '단원 번호: ' + where);
        assert.equal(p.options.length, 4, '보기는 4개: ' + where);
        assert.equal(new Set(p.options).size, 4, '보기가 서로 달라야 함: ' + where);
        assert.equal(p.options.filter(o => o === p.answer).length, 1, '정답 보기는 정확히 1개: ' + where);
        assert.ok(p.options.every(o => o && !/NaN|undefined|Infinity|null/.test(o)), '빈 보기·잘못된 값 없음: ' + where);
        assert.ok(p.question && !/NaN|undefined|Infinity|null|\[object/.test(p.question + p.explanation + p.hint), '문장에 잘못된 값 없음: ' + where);
        assert.ok(p.hint.length > 5 && p.explanation.length > 1, '힌트·해설: ' + where);
        assert.ok(!/(^|[^\d\s])-\d/.test(p.options.join(' ')), '음수 보기 없음: ' + where);
        kinds.add(p.question.replace(/\d+/g, '#').slice(0, 30));
        if (id.startsWith('6-2-')) continue;   // 6학년 2학기는 math.test.mjs가 따로 검산
        const ex = expected(p.spec);
        if (p.spec.type === 'choice') { assert.equal(p.answer, p.spec.answer, where); continue; }
        assert.ok(ex, '검산할 수 있어야 함: ' + where);
        const got = numQ(p.answer);
        assert.ok(got && eq(got, ex), `정답이 검산과 다름 (검산 ${ex[0]}/${ex[1]}): ` + where);
        // 수로 된 보기는 값이 서로 달라야 함 (2/4와 1/2처럼 같은 값이 두 개면 답이 둘)
        const vals = p.options.map(numQ);
        if (vals.every(Boolean)) assert.equal(new Set(vals.map(v => v.join('/'))).size, 4, '같은 값의 보기 없음: ' + where);
        if (p.spec.type === 'frac' || /\//.test(p.answer)) assert.ok(/^(\d+ )?\d+\/\d+$|^\d+$/.test(p.answer) && (() => { const m = p.answer.match(/(\d+)\/(\d+)$/); return !m || (g(+m[1], +m[2]) === 1 && +m[1] < +m[2]); })(), '분수 답은 기약분수(대분수): ' + where);
      }
    }
  });
}

test('6학년 2학기는 기존 문제(검산은 math.test.mjs)', () => {
  const p = makeUnitProblem('6-2-5', 1, rngOf(3));
  assert.equal(p.unit, '6-2-5'); assert.equal(p.options.length, 4); assert.ok(p.options.includes(p.answer));
});
