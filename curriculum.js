// 3~6학년 1·2학기 수학 단원과 문제 만들기
// 단원 번호: '학년-학기-단원' (예: '4-1-2' = 4학년 1학기 2단원 각도). 6학년 2학기는 math.js의 기존 문제를 그대로 씀.
// 단원 이름은 널리 쓰인 교과서 단원 구성을 따름 (2022 개정 검정 교과서는 출판사마다 이름·순서가 조금 다를 수 있음).
// 문제마다 spec(검산 정보)을 함께 돌려줌 → tests/curriculum.test.mjs가 따로 만든 계산기로 다시 계산해 확인.
import { makeProblem as make62, UNIT_NAMES as NAMES62, tools, withOptions, nearInt, fracText, dec, gcd } from './math.js?v=202611180503';

export const CURRICULUM = {
  3: { 1: ['덧셈과 뺄셈', '평면도형', '나눗셈', '곱셈', '길이와 시간', '분수와 소수'],
       2: ['곱셈', '나눗셈', '원', '분수', '들이와 무게', '자료의 정리'] },
  4: { 1: ['큰 수', '각도', '곱셈과 나눗셈', '평면도형의 이동', '막대그래프', '규칙 찾기'],
       2: ['분수의 덧셈과 뺄셈', '삼각형', '소수의 덧셈과 뺄셈', '사각형', '꺾은선그래프', '다각형'] },
  5: { 1: ['자연수의 혼합 계산', '약수와 배수', '규칙과 대응', '약분과 통분', '분수의 덧셈과 뺄셈', '다각형의 둘레와 넓이'],
       2: ['수의 범위와 어림하기', '분수의 곱셈', '합동과 대칭', '소수의 곱셈', '직육면체', '평균과 가능성'] },
  6: { 1: ['분수의 나눗셈', '각기둥과 각뿔', '소수의 나눗셈', '비와 비율', '여러 가지 그래프', '직육면체의 부피와 겉넓이'],
       2: NAMES62.slice(1) },
};
export const DEFAULT_UNITS = '6-2-1,6-2-2,6-2-3,6-2-4,6-2-5,6-2-6';
const lcm = (a, b) => a / gcd(a, b) * b;
// 옛 방 기록('1'~'6' = 6학년 2학기)도 읽음
export const normUnit = u => (/^\d$/.test(String(u)) ? '6-2-' + u : String(u));
export function unitName(id, short = false) {
  const [g, s, u] = normUnit(id).split('-').map(Number), n = CURRICULUM[g]?.[s]?.[u - 1];
  if (!n) return '';
  return short ? `${u}. ${n}` : `${g}학년 ${s}학기 ${u}. ${n}`;
}
export const unitsOf = (g, s) => (CURRICULUM[g]?.[s] || []).map((_, i) => `${g}-${s}-${i + 1}`);
export function parseUnits(v) {
  if (!v || v === 'all') return DEFAULT_UNITS.split(',');
  return String(v).split(',').map(normUnit).filter(id => unitName(id));
}

// ── 공통 ──
// 보기 글자를 값으로 ('2/4' → 0.5, '1 1/2' → 1.5, '25%' → 25). 값이 같은 보기는 하나만 남기려고 씀
const valOf = s => { s = String(s).replace(/[°%]$/, '').replace(/,/g, ''); let m = s.match(/^(\d+) (\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3]; m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2]; return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; };
// 분수 모양 오답은 기약분수로 고침 ('2/4' → '1/2', '6/6' → '1') → 근처 보기와 글자로도 겹침이 걸러짐
const tidy = w => { const m = String(w).match(/^(?:(\d+) )?(\d+)\/(\d+)$/); return m && +m[3] ? fracText((+(m[1] || 0)) * +m[3] + +m[2], +m[3]) : String(w); };
const distinctVals = (answer, wrongs) => { wrongs = wrongs.map(tidy); const seen = [valOf(answer)]; return wrongs.filter(w => { const v = valOf(w); if (Number.isNaN(v)) return true; if (seen.some(x => Math.abs(x - v) < 1e-9)) return false; seen.push(v); return true; }); };
const N = (question, value, hint, explanation, wrongs, T, near, spec) =>   // 답이 수인 문제
  withOptions({ question, answer: String(value), hint, explanation, spec: spec || { type: 'num', value } }, distinctVals(String(value), wrongs.map(String)), T, near || nearInt(value));
const F = (question, n, d, hint, explanation, wrongs, T, spec) =>          // 답이 분수인 문제 (기약분수·대분수로)
  withOptions({ question, answer: fracText(n, d), hint, explanation, spec: spec || { type: 'frac', n, d } }, distinctVals(fracText(n, d), wrongs.map(String)), T, k => fracText(Math.max(1, n + (k % 2 ? 1 : -1) * Math.ceil(k / 2)), d));
const C = (question, answer, others, hint, explanation, T) =>               // 답이 글자(보기 중 고르기)
  withOptions({ question, answer: String(answer), hint, explanation, spec: { type: 'choice', answer: String(answer) } }, others, T, () => 'NaN');   // 오답 보기는 3개 이상 직접 줌
const D = (question, h, hint, explanation, wrongsH, T, step = 1, spec) =>   // 답이 소수 (100배 정수 h)
  withOptions({ question, answer: dec(h), hint, explanation, spec: spec || { type: 'dec', h } }, distinctVals(dec(h), wrongsH.map(dec)), T, k => dec(Math.max(1, h + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step)));
// ── 조사 고르기: 숫자는 읽는 소리로 (2/9 → '구분의 이' → 를), 낱말은 받침으로 ──
const BATCHIM_DIGIT = { 0: 1, 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1, 9: 0 };   // 영 일 이 삼 사 오 육 칠 팔 구 (10·100·1000·만도 받침)
const UNIT_BATCHIM = { '°C': 0, '°': 0, '%': 0, cm: 0, mm: 0, km: 0, m: 0, L: 0, mL: 0, g: 1, kg: 1 };
const hasBatchimWord = w => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false; };
const PAIRS = { 을: ['을', '를'], 를: ['을', '를'], 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'], 과: ['과', '와'], 와: ['과', '와'] };
export function fixJosa(text) {
  return String(text).replace(/(\d+\/\d+|\d+(?:\.\d+)?|°C|°|%|cm|mm|km|kg|mL|m|L|g)(을|를|은|는|이|가|과|와)(?=[\s,?)]|$)/g, (all, tok, j) => {
    let b; const fr = tok.match(/^(\d+)\/\d+$/);
    if (fr) b = BATCHIM_DIGIT[fr[1].slice(-1)]; else if (/\d$/.test(tok)) b = BATCHIM_DIGIT[tok.slice(-1)]; else b = UNIT_BATCHIM[tok];
    return tok + PAIRS[j][b ? 0 : 1];
  });
}
const wj = (w, a, b) => w + (hasBatchimWord(w) ? a : b);   // 낱말 + 조사
const noCarryAdd = (a, b) => { let r = 0, p = 1; while (a || b) { r += ((a % 10 + b % 10) % 10) * p; a = Math.floor(a / 10); b = Math.floor(b / 10); p *= 10; } return r; };
const absDigitSub = (a, b) => { let r = 0, p = 1; while (a || b) { r += Math.abs(a % 10 - b % 10) * p; a = Math.floor(a / 10); b = Math.floor(b / 10); p *= 10; } return r; };
const comma = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const G = {};
// ═════ 3학년 1학기 ═════
G['3-1-1'] = (lv, T) => {   // 세 자리 수의 덧셈과 뺄셈
  const { int } = T;
  if (lv === 0 || int(0, 1)) {
    const a = int(100, lv ? 799 : 499), b = int(100, lv ? 199 + (899 - a) : 399), s = a + b;
    return N(`${a} + ${b} = ?`, s, '일의 자리부터 더하고, 10이 넘으면 윗자리로 받아올림해요.', `${a} + ${b} = ${s}`, [noCarryAdd(a, b), s + 10, s - 10, s + 100], T, null, { type: 'expr', expr: `${a}+${b}` });
  }
  const a = int(300, 999), b = int(101, a - 100), d = a - b;
  return N(`${a} - ${b} = ?`, d, '일의 자리부터 빼고, 뺄 수 없으면 윗자리에서 10을 받아내림해요.', `${a} - ${b} = ${d}`, [absDigitSub(a, b), d + 10, d - 10, d + 100], T, null, { type: 'expr', expr: `${a}-${b}` });
};
G['3-1-2'] = (lv, T) => {   // 평면도형
  const { int, pick } = T;
  if (lv === 2 && int(0, 1)) { const s = int(3, 12), k = pick([['정사각형', 4], ['직사각형', 0]]);
    if (k[1]) return N(`한 변이 ${s} cm인 정사각형의 네 변의 길이의 합은 몇 cm일까요?`, 4 * s, '정사각형은 네 변의 길이가 모두 같아요.', `${s} × 4 = ${4 * s}`, [2 * s, 3 * s, s + 4], T);
    const w = int(4, 12), h = int(2, w - 1); return N(`가로 ${w} cm, 세로 ${h} cm인 직사각형의 네 변의 길이의 합은 몇 cm일까요?`, 2 * (w + h), '직사각형은 마주 보는 두 변의 길이가 같아요.', `${w} + ${h} + ${w} + ${h} = ${2 * (w + h)}`, [w + h, w * h, 2 * w + h], T); }
  const f = pick([['직사각형에는 직각이 몇 개 있을까요?', 4, '직사각형은 네 각이 모두 직각이에요.'], ['직각삼각형에는 직각이 몇 개 있을까요?', 1, '직각삼각형은 한 각이 직각인 삼각형이에요.'], ['정사각형에서 길이가 같은 변은 모두 몇 개일까요?', 4, '정사각형은 네 변의 길이가 모두 같아요.'], ['삼각형의 꼭짓점은 몇 개일까요?', 3, '삼각형은 변 3개, 꼭짓점 3개예요.'], ['사각형의 변은 몇 개일까요?', 4, '사각형은 변 4개, 꼭짓점 4개예요.'], ['각은 몇 개의 반직선으로 이루어져 있을까요?', 2, '한 점에서 그은 두 반직선으로 이루어진 도형이 각이에요.']]);
  if (lv === 0 || int(0, 1)) return N(f[0], f[1], f[2], f[2], [0, 1, 2, 3, 4, 5].filter(v => v !== f[1]), T);
  const t = pick([['두 점을 곧게 이은 선', '선분'], ['한 점에서 시작하여 한쪽으로 끝없이 늘인 곧은 선', '반직선'], ['선분을 양쪽으로 끝없이 늘인 곧은 선', '직선'], ['네 각이 모두 직각인 사각형', '직사각형']]);
  return C(`${wj(t[0], '을', '를')} 무엇이라고 할까요?`, t[1], ['선분', '반직선', '직선', '직사각형', '각'].filter(x => x !== t[1]), '뜻을 하나씩 떠올려 봐요.', `${t[0]} → ${t[1]}`, T);
};
G['3-1-3'] = (lv, T) => {   // 나눗셈 (곱셈구구 범위)
  const { int, pick } = T, b = int(2, 9), q = int(lv ? 2 : 1, 9), a = b * q;
  if (lv === 2 && int(0, 1)) { const t = pick([['사탕', '개', '명에게 똑같이 나누어 주면 한 명에게'], ['연필', '자루', '명이 똑같이 나누어 가지면 한 명이'], ['쿠키', '개', '접시에 똑같이 나누어 담으면 한 접시에']]);
    return N(`${t[0]} ${a}${t[1]}를 ${b}${t[2]} 몇 ${t[1]}일까요?`, q, '나눗셈식으로 나타내 봐요.', `${a} ÷ ${b} = ${q}`, [a - b, q + 1, q - 1, b], T, null, { type: 'expr', expr: `${a}/${b}` }); }
  return N(`${a} ÷ ${b} = ?`, q, `${b}단 곱셈구구에서 ${a}가 나오는 곳을 찾아요.`, `${b} × ${q} = ${a} → ${a} ÷ ${b} = ${q}`, [q + 1, q - 1, a - b, b], T, null, { type: 'expr', expr: `${a}/${b}` });
};
G['3-1-4'] = (lv, T) => {   // (두 자리 수) × (한 자리 수)
  const { int } = T;
  let a, b;
  if (lv === 0) { b = int(2, 4); a = int(1, Math.floor(9 / b)) * 10 + int(1, Math.floor(9 / b)); }   // 올림 없음
  else { b = int(3, 9); a = int(lv === 2 ? 45 : 13, lv === 2 ? 99 : 59); }
  const p = a * b, noCarry = Math.floor(a / 10) * b % 10 * 10 + a % 10 * b % 10;
  return N(`${a} × ${b} = ?`, p, '일의 자리, 십의 자리를 따로 곱한 뒤 더해요. 올림을 잊지 마세요.', `${Math.floor(a / 10) * 10} × ${b} + ${a % 10} × ${b} = ${p}`, [noCarry, p + 10, p - 10, p + b], T, null, { type: 'expr', expr: `${a}*${b}` });
};
G['3-1-5'] = (lv, T) => {   // 길이와 시간
  const { int, pick } = T, k = lv === 0 ? pick(['cm', 'm']) : pick(['cm', 'km', 'time', 'sec']);
  if (k === 'cm') { const c = int(2, 15), m = int(1, 9); return N(`${c} cm ${m} mm는 몇 mm일까요?`, c * 10 + m, '1 cm = 10 mm예요.', `${c} cm = ${c * 10} mm → ${c * 10 + m} mm`, [c + m, c * 100 + m, c * 10], T); }
  if (k === 'm') { const a = int(1, 9), b = int(10, 99); return N(`${a} m ${b} cm는 몇 cm일까요?`, a * 100 + b, '1 m = 100 cm예요.', `${a * 100} + ${b} = ${a * 100 + b}`, [a * 10 + b, a + b, a * 1000 + b], T); }
  if (k === 'km') { const a = int(1, 9), b = int(1, 9) * 100; return N(`${a} km ${b} m는 몇 m일까요?`, a * 1000 + b, '1 km = 1000 m예요.', `${a * 1000} + ${b} = ${a * 1000 + b}`, [a * 100 + b, a * 10000 + b, a * 1000], T); }
  if (k === 'sec') { const m = int(1, 4), s = int(5, 55); return C(`${m * 60 + s}초는 몇 분 몇 초일까요?`, `${m}분 ${s}초`, [`${m + 1}분 ${s}초`, `${m}분 ${s + 4}초`, `${Math.floor((m * 60 + s) / 100)}분 ${(m * 60 + s) % 100}초`, `${m - 1 || m + 2}분 ${s}초`], '1분 = 60초예요.', `${m * 60 + s}초 = ${m * 60}초 + ${s}초 = ${m}분 ${s}초`, T); }
  const h = int(1, 10), m = int(20, 55), add = int(Math.max(10, 61 - m), 55), tot = h * 60 + m + add, H = Math.floor(tot / 60), M = tot % 60;
  const t = (a, b) => `${a}시 ${b}분`;
  return C(`${t(h, m)}에서 ${add}분이 지나면 몇 시 몇 분일까요?`, t(H, M), [t(h, m + add), t(H, (M + 10) % 60), t(H + 1, M), t(h, M)], '분끼리 더해서 60분이 넘으면 1시간으로 바꿔요.', `${m} + ${add} = ${m + add}분 → ${t(H, M)}`, T);
};
G['3-1-6'] = (lv, T) => {   // 분수와 소수
  const { int, pick, shuffle } = T, k = pick(lv === 0 ? ['tenth', 'unit'] : ['tenth', 'unit', 'mm', 'biggest']);
  if (k === 'tenth') { const n = int(2, 9); return C(`0.1이 ${n}개인 수는 얼마일까요?`, `0.${n}`, [`${n}`, `0.0${n}`, `${n}.1`, `1.${n}`], '0.1이 몇 개인지 세면 소수 첫째 자리 숫자가 돼요.', `0.1 × ${n} = 0.${n}`, T); }
  if (k === 'mm') { const n = int(1, 9); return C(`${n} mm는 몇 cm인지 소수로 나타내면?`, `0.${n}`, [`${n}`, `0.0${n}`, `${n}0`, `1.${n}`], '1 mm = 0.1 cm예요.', `${n} mm = 0.1 cm가 ${n}개 = 0.${n} cm`, T); }
  if (k === 'unit') { const d = int(3, 9), n = int(2, d - 1); return F(`1/${d}이 ${n}개이면 얼마일까요?`, n, d, '단위분수가 몇 개인지 세면 분자가 돼요.', `1/${d} × ${n} = ${n}/${d}`, [`${d}/${n}`, `1/${n}`, `${n}/${d + 1}`], T, { type: 'frac', n, d }); }
  const ds = shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4), m = Math.min(...ds);
  return C(`다음 중 가장 큰 분수는 무엇일까요?\n${ds.map(d => '1/' + d).join(',  ')}`, `1/${m}`, ds.filter(d => d !== m).map(d => '1/' + d), '단위분수는 분모가 작을수록 커요.', `분모가 가장 작은 1/${m}이 가장 커요.`, T);
};
// ═════ 3학년 2학기 ═════
G['3-2-1'] = (lv, T) => {   // 곱셈 (세 자리×한 자리, 두 자리×두 자리)
  const { int } = T;
  if (lv < 2 && int(0, 2)) { const a = int(lv ? 125 : 111, lv ? 489 : 333), b = int(2, lv ? 9 : 3), p = a * b; return N(`${a} × ${b} = ?`, p, '일·십·백의 자리를 차례로 곱하고 올림한 수를 더해요.', `${a} × ${b} = ${p}`, [p + 10, p - 10, p + 100, p - b], T, null, { type: 'expr', expr: `${a}*${b}` }); }
  const a = int(12, lv === 2 ? 68 : 39), b = int(11, lv === 2 ? 49 : 25), p = a * b, wrong = a * Math.floor(b / 10) + a * (b % 10);
  return N(`${a} × ${b} = ?`, p, `${a} × ${b % 10}과 ${a} × ${Math.floor(b / 10) * 10}을 더해요.`, `${a} × ${b % 10} + ${a} × ${Math.floor(b / 10) * 10} = ${p}`, [wrong, p + 10, p - 10, p + a], T, null, { type: 'expr', expr: `${a}*${b}` });
};
G['3-2-2'] = (lv, T) => {   // 나눗셈 (나머지)
  const { int } = T;
  if (lv === 0) { const b = int(2, 4), q = int(11, Math.floor(99 / b)), a = b * q; return N(`${a} ÷ ${b} = ?`, q, '십의 자리부터 나누어요.', `${a} ÷ ${b} = ${q}`, [q + 1, q - 1, q + 10, a - b], T, null, { type: 'expr', expr: `${a}/${b}` }); }
  const b = int(3, 9), q = int(lv === 2 ? 11 : 3, lv === 2 ? 30 : 9), r = int(1, b - 1), a = b * q + r, t = (x, y) => `몫 ${x}, 나머지 ${y}`;
  return C(`${a} ÷ ${b}의 몫과 나머지는?`, t(q, r), [t(q + 1, r), t(q, r + 1 < b ? r + 1 : r - 1), t(q - 1, r + b), t(q + 1, Math.abs(r - b))], '나머지는 나누는 수보다 작아야 해요.', `${b} × ${q} = ${b * q}, ${a} - ${b * q} = ${r}`, T);
};
G['3-2-3'] = (lv, T) => {   // 원
  const { int, pick } = T, k = pick(lv === 0 ? ['d', 'r'] : ['d', 'r', 'line', 'box']);
  if (k === 'd') { const r = int(2, 15); return N(`반지름이 ${r} cm인 원의 지름은 몇 cm일까요?`, 2 * r, '지름은 반지름의 2배예요.', `${r} × 2 = ${2 * r}`, [r, r + 2, 4 * r], T); }
  if (k === 'r') { const r = int(2, 15); return N(`지름이 ${2 * r} cm인 원의 반지름은 몇 cm일까요?`, r, '반지름은 지름의 반이에요.', `${2 * r} ÷ 2 = ${r}`, [2 * r, 4 * r, r + 2], T); }
  if (k === 'line') { const r = int(2, 9), n = int(2, 5); return N(`반지름이 ${r} cm인 원 ${n}개를 겹치지 않게 한 줄로 맞닿게 놓았어요.\n전체 길이는 몇 cm일까요?`, 2 * r * n, '원 하나의 길이는 지름이에요.', `${2 * r} × ${n} = ${2 * r * n}`, [r * n, 2 * r * n + r, 2 * r + n], T); }
  const r = int(2, 8); return N(`반지름이 ${r} cm인 원이 꼭 맞게 들어가는 정사각형의 한 변은 몇 cm일까요?`, 2 * r, '정사각형의 한 변은 원의 지름과 같아요.', `${r} × 2 = ${2 * r}`, [r, 4 * r, r + 2], T);
};
G['3-2-4'] = (lv, T) => {   // 분수
  const { int, pick } = T, k = pick(lv === 0 ? ['part1'] : ['part', 'toMixed', 'toImp']);
  if (k === 'part1' || k === 'part') { const d = int(2, 6), n = k === 'part1' ? 1 : int(1, d - 1), whole = d * int(2, 5), v = whole / d * n;
    return N(`${whole}의 ${n}/${d}은 얼마일까요?`, v, `${whole}을 똑같이 ${d}묶음으로 나눈 것 중 ${n}묶음이에요.`, `${whole} ÷ ${d} × ${n} = ${v}`, [whole / d, whole - v, v + n, whole * n], T, null, { type: 'expr', expr: `${whole}*${n}/${d}` }); }
  const d = int(3, 9), w = int(1, 4); let n; do n = int(1, d - 1); while (gcd(n, d) !== 1); const imp = w * d + n;
  if (k === 'toMixed') return C(`${imp}/${d}을 대분수로 나타내면?`, `${w} ${n}/${d}`, [`${w + 1} ${n}/${d}`, `${n} ${w}/${d}`, `${w + 2} ${n}/${d}`, `${w} ${d}/${n}`], '분자를 분모로 나눈 몫이 자연수, 나머지가 분자예요.', `${imp} ÷ ${d} = ${w} … ${n} → ${w} ${n}/${d}`, T);
  return C(`${w} ${n}/${d}을 가분수로 나타내면?`, `${imp}/${d}`, [`${w + n}/${d}`, `${w * d}/${d + n}`, `${imp + 1}/${d}`], '자연수에 분모를 곱하고 분자를 더해요.', `${w} × ${d} + ${n} = ${imp} → ${imp}/${d}`, T);
};
G['3-2-5'] = (lv, T) => {   // 들이와 무게
  const { int, pick } = T, k = pick(lv === 0 ? ['mL', 'g'] : ['mL', 'g', 'addL', 'kg']);
  if (k === 'mL') { const a = int(1, 9), b = int(1, 9) * 100; return N(`${a} L ${b} mL는 몇 mL일까요?`, a * 1000 + b, '1 L = 1000 mL예요.', `${a * 1000} + ${b} = ${a * 1000 + b}`, [a * 100 + b, a + b, a * 10000 + b], T); }
  if (k === 'g') { const a = int(1, 9), b = int(1, 9) * 100; return N(`${a} kg ${b} g은 몇 g일까요?`, a * 1000 + b, '1 kg = 1000 g이에요.', `${a * 1000} + ${b} = ${a * 1000 + b}`, [a * 100 + b, a + b, a * 10000 + b], T); }
  if (k === 'kg') { const a = int(1, 9), b = int(1, 9) * 100, t = (x, y) => `${x} kg ${y} g`; return C(`${a * 1000 + b} g은 몇 kg 몇 g일까요?`, t(a, b), [t(a * 10, b), t(a, b / 100), t(b / 100, a * 100), t(a + 1, b), t(a, b / 10)], '1000 g = 1 kg이에요.', `${a * 1000 + b} g = ${a * 1000} g + ${b} g = ${t(a, b)}`, T); }
  const a = int(1, 4), b = int(3, 9) * 100, c = int(1, 4), d2 = int(Math.max(3, 11 - b / 100), 9) * 100, tot = a * 1000 + b + c * 1000 + d2, t = v => `${Math.floor(v / 1000)} L ${v % 1000} mL`;
  return C(`${a} L ${b} mL + ${c} L ${d2} mL = ?`, t(tot), [`${a + c} L ${b + d2} mL`, t(tot + 1000), t(tot - 100)].filter(x => !/ 0 mL$/.test(x) || true), 'mL끼리 더해 1000이 넘으면 1 L로 받아올림해요.', `${b} + ${d2} = ${b + d2} mL → ${t(tot)}`, T);
};
G['3-2-6'] = (lv, T) => {   // 자료의 정리
  const { int, pick, shuffle } = T, items = shuffle(['사과', '배', '귤', '포도', '딸기']).slice(0, 4), cnt = shuffle([3, 4, 5, 6, 7, 8, 9]).slice(0, 4), table = items.map((x, i) => `${x} ${cnt[i]}명`).join(', ');
  const k = pick(lv === 0 ? ['max', 'total'] : ['max', 'total', 'pic', 'diff']);
  if (k === 'max') { const m = items[cnt.indexOf(Math.max(...cnt))]; return C(`좋아하는 과일 조사: ${table}\n가장 많은 학생이 좋아하는 과일은?`, m, items.filter(x => x !== m), '수가 가장 큰 것을 찾아요.', `${m} ${Math.max(...cnt)}명이 가장 많아요.`, T); }
  if (k === 'total') { const s = cnt.reduce((a, b) => a + b, 0); return N(`좋아하는 과일 조사: ${table}\n조사한 학생은 모두 몇 명일까요?`, s, '모든 수를 더해요.', `${cnt.join(' + ')} = ${s}`, [s - cnt[0], s + 1, s + 10], T); }
  if (k === 'diff') { const d = Math.max(...cnt) - Math.min(...cnt); return N(`좋아하는 과일 조사: ${table}\n가장 많은 과일과 가장 적은 과일의 학생 수 차이는?`, d, '가장 큰 수에서 가장 작은 수를 빼요.', `${Math.max(...cnt)} - ${Math.min(...cnt)} = ${d}`, [d + 1, Math.max(...cnt), Math.min(...cnt)], T); }
  const big = int(1, 5), small = int(1, 9); return N(`그림그래프에서 큰 그림은 10명, 작은 그림은 1명이에요.\n큰 그림 ${big}개, 작은 그림 ${small}개는 몇 명일까요?`, big * 10 + small, '큰 그림 하나는 10, 작은 그림 하나는 1이에요.', `${big} × 10 + ${small} = ${big * 10 + small}`, [big + small, small * 10 + big, big * 10], T);
};
// ═════ 4학년 1학기 ═════
G['4-1-1'] = (lv, T) => {   // 큰 수
  const { int, pick } = T, k = pick(lv === 0 ? ['man', 'jump'] : ['man', 'digit', 'jump', 'eok']);
  if (k === 'man') { const a = int(2, 9), b = int(1, 9), c = int(1, 9), v = a * 10000 + b * 1000 + c * 10; return N(`10000이 ${a}개, 1000이 ${b}개, 10이 ${c}개인 수는?`, v, '자리마다 숫자를 써요. 빈 자리는 0이에요.', `${a}${b}0${c}0`, [a * 10000 + b * 1000 + c, a * 1000 + b * 100 + c * 10, a * 100000 + b * 1000 + c * 10], T); }
  if (k === 'digit') { const digits = Array.from({ length: 8 }, (_, i) => int(i ? 0 : 1, 9)), n = Number(digits.join('')), places = [['천만', 0], ['백만', 1], ['십만', 2], ['만', 3]], p = pick(places);
    return N(`${comma(n)}에서 ${p[0]}의 자리 숫자는 무엇일까요?`, digits[p[1]], '일, 십, 백, 천, 만, 십만, 백만, 천만 차례로 세어 봐요.', `${p[0]}의 자리 숫자는 ${digits[p[1]]}`, digits.filter((d, i) => i !== p[1]), T, k2 => (digits[p[1]] + k2) % 10); }
  if (k === 'eok') { const a = int(1, 9), b = int(1, 9) * 1000; return C(`1억이 ${a}개, 1만이 ${b}개인 수를 읽으면?`, `${a}억 ${b}만`, [`${a}억 ${b / 1000}만`, `${a}억 ${b}`, `${b}억 ${a}만`], '억, 만, 일의 단위로 끊어 읽어요.', `${a}억 ${b}만`, T); }
  const s = int(2, 30) * 100, step = pick([100, 1000]), n = int(3, 5); return C(`${s}만에서 ${step}만씩 ${n}번 뛰어 센 수는?`, `${s + step * n}만`, [`${s + step * (n - 1)}만`, `${s + step * (n + 1)}만`, `${s + n}만`], `${step}만씩 커져요.`, `${s}만 + ${step}만 × ${n} = ${s + step * n}만`, T);
};
G['4-1-2'] = (lv, T) => {   // 각도
  const { int, pick } = T, deg = v => `${v}°`, k = pick(lv === 0 ? ['add', 'sub'] : ['tri', 'quad', 'add', 'sub']);
  const opts = (v, w) => withOptions({ question: '', answer: deg(v), hint: '', explanation: '', spec: { type: 'num', value: v } }, w.map(deg), T, k2 => deg(Math.max(5, v + (k2 % 2 ? 5 : -5) * Math.ceil(k2 / 2))));
  let q, v, h, e, w;
  if (k === 'add') { const a = int(2, 14) * 5, b = int(2, 14) * 5; v = a + b; q = `${a}° + ${b}° = ?`; h = '각도는 자연수의 덧셈처럼 더해요.'; e = `${a} + ${b} = ${v}`; w = [v + 10, v - 10, Math.abs(a - b)]; }
  else if (k === 'sub') { const a = int(12, 34) * 5, b = int(2, a / 5 - 2) * 5; v = a - b; q = `${a}° - ${b}° = ?`; h = '각도는 자연수의 뺄셈처럼 빼요.'; e = `${a} - ${b} = ${v}`; w = [v + 10, v - 10, a + b]; }
  else if (k === 'tri') { const a = int(6, 14) * 5, b = int(4, (175 - a) / 5 - 2) * 5; v = 180 - a - b; q = `삼각형의 두 각이 ${a}°, ${b}°일 때 나머지 한 각은?`; h = '삼각형의 세 각의 크기의 합은 180°예요.'; e = `180 - ${a} - ${b} = ${v}`; w = [360 - a - b, v + 10, a + b]; }
  else { const a = int(14, 22) * 5, b = int(14, 22) * 5, c = int(14, 22) * 5; v = 360 - a - b - c; q = `사각형의 세 각이 ${a}°, ${b}°, ${c}°일 때 나머지 한 각은?`; h = '사각형의 네 각의 크기의 합은 360°예요.'; e = `360 - ${a} - ${b} - ${c} = ${v}`; w = [Math.abs(180 - a - b - c) || v + 20, v + 10, v - 10]; }
  return Object.assign(opts(v, w), { question: q, hint: h, explanation: e });
};
G['4-1-3'] = (lv, T) => {   // 곱셈과 나눗셈 (세 자리×두 자리, 세 자리÷두 자리)
  const { int } = T;
  if (int(0, 1)) { const a = int(lv ? 105 : 110, lv ? 499 : 300), b = int(lv ? 12 : 11, lv ? 45 : 20), p = a * b; return N(`${a} × ${b} = ?`, p, `${a} × ${b % 10}과 ${a} × ${b - b % 10}을 더해요.`, `${a} × ${b} = ${p}`, [a * Math.floor(b / 10) + a * (b % 10), p + 100, p - 10, p + a], T, null, { type: 'expr', expr: `${a}*${b}` }); }
  const b = int(12, lv ? 45 : 25), q = int(lv === 2 ? 11 : 3, lv === 2 ? 29 : 9);
  if (lv < 2) { const a = b * q; return N(`${a} ÷ ${b} = ?`, q, `${b}에 몇을 곱하면 ${a}가 되는지 어림해요.`, `${b} × ${q} = ${a}`, [q + 1, q - 1, q + 10], T, null, { type: 'expr', expr: `${a}/${b}` }); }
  const r = int(1, b - 1), a = b * q + r, t = (x, y) => `몫 ${x}, 나머지 ${y}`;
  return C(`${a} ÷ ${b}의 몫과 나머지는?`, t(q, r), [t(q + 1, r), t(q - 1, r + b), t(q, (r + 1) % b || r + 2)], '나머지는 나누는 수보다 작아야 해요.', `${b} × ${q} = ${b * q}, ${a} - ${b * q} = ${r}`, T);
};
G['4-1-4'] = (lv, T) => {   // 평면도형의 이동
  const { int, pick } = T, k = pick(lv === 0 ? ['rot', 'slide'] : ['rot', 'ccw', 'flip', 'slide']), deg = v => `${v}°`;
  if (k === 'rot') { const n = lv === 2 ? pick([2, 3, 5, 6, 7]) : int(1, 3), v = (90 * n) % 360; return C(`도형을 시계 방향으로 90°만큼 ${n}번 돌린 모양은\n시계 방향으로 몇 °만큼 돌린 모양과 같을까요?`, deg(v), [0, 90, 180, 270, 360].filter(x => x !== v && !(v === 0 && x === 360)).map(deg), '90°씩 돌린 횟수를 더하고, 360°는 한 바퀴예요.', `90° × ${n} = ${90 * n}°${90 * n >= 360 ? ' → 한 바퀴 빼면 ' + v + '°' : ''}`, T); }
  if (k === 'ccw') { const a = pick([90, 180, 270]); return C(`시계 반대 방향으로 ${a}°만큼 돌린 모양은\n시계 방향으로 몇 °만큼 돌린 모양과 같을까요?`, deg(360 - a), [90, 180, 270, 360].filter(x => x !== 360 - a).map(deg), '한 바퀴(360°)에서 빼 봐요.', `360° - ${a}° = ${360 - a}°`, T); }
  if (k === 'flip') { const n = int(2, 7); return C(`도형을 오른쪽으로 ${n}번 뒤집으면 처음 모양과 같을까요?`, n % 2 ? '오른쪽으로 1번 뒤집은 모양' : '처음 모양과 같아요', ['처음 모양과 같아요', '오른쪽으로 1번 뒤집은 모양', '위쪽으로 1번 뒤집은 모양', '시계 방향으로 90° 돌린 모양'].filter(x => x !== (n % 2 ? '오른쪽으로 1번 뒤집은 모양' : '처음 모양과 같아요')), '같은 방향으로 2번 뒤집으면 처음 모양이 돼요.', `${n}번은 ${n % 2 ? '홀수 → 1번 뒤집은 모양' : '짝수 → 처음 모양'}`, T); }
  const x = int(1, 6), y = int(1, 6), dx = int(1, 5), dy = int(1, 5); return C(`점의 자리가 (가로 ${x}칸, 세로 ${y}칸)이에요.\n오른쪽으로 ${dx}칸, 위쪽으로 ${dy}칸 밀면?`, `(가로 ${x + dx}칸, 세로 ${y + dy}칸)`, [`(가로 ${x + dy}칸, 세로 ${y + dx}칸)`, `(가로 ${x + dx}칸, 세로 ${y}칸)`, `(가로 ${x}칸, 세로 ${y + dy}칸)`, `(가로 ${x + dx + 1}칸, 세로 ${y + dy}칸)`], '오른쪽은 가로, 위쪽은 세로로 움직여요.', `가로 ${x} + ${dx}, 세로 ${y} + ${dy}`, T);
};
G['4-1-5'] = (lv, T) => {   // 막대그래프
  const { int, pick, shuffle } = T, unit = lv === 0 ? 1 : pick([2, 5, 10]), k = pick(lv === 0 ? ['read', 'max'] : ['read', 'max', 'diff', 'total']);
  const items = shuffle(['축구', '피구', '줄넘기', '수영', '농구']).slice(0, 4), cells = shuffle([2, 3, 4, 5, 6, 7, 8]).slice(0, 4), cnt = cells.map(c => c * unit), table = items.map((x, i) => `${x} ${cells[i]}칸`).join(', ');
  const head = `막대그래프의 세로 눈금 한 칸은 ${unit}명이에요.\n막대: ${table}\n`;
  if (k === 'read') { const i = int(0, 3); return N(head + `${wj(items[i], '을', '를')} 좋아하는 학생은 몇 명일까요?`, cnt[i], '칸 수에 눈금 한 칸의 크기를 곱해요.', `${cells[i]} × ${unit} = ${cnt[i]}`, [cells[i], cnt[i] + unit, cells[i] + unit], T); }
  if (k === 'max') { const m = items[cells.indexOf(Math.max(...cells))]; return C(head + '가장 많은 학생이 좋아하는 운동은?', m, items.filter(x => x !== m), '막대가 가장 긴 것을 찾아요.', `${m} 막대가 가장 길어요.`, T); }
  if (k === 'diff') { const d = (Math.max(...cells) - Math.min(...cells)) * unit; return N(head + '가장 많은 운동과 가장 적은 운동의 학생 수 차이는?', d, '칸 수의 차이에 눈금 크기를 곱해요.', `(${Math.max(...cells)} - ${Math.min(...cells)}) × ${unit} = ${d}`, [d / unit, d + unit, Math.max(...cnt)], T); }
  const s = cnt.reduce((a, b) => a + b, 0); return N(head + '조사한 학생은 모두 몇 명일까요?', s, '각 막대가 나타내는 수를 모두 더해요.', `${cnt.join(' + ')} = ${s}`, [s / unit, s + unit, s - unit], T);
};
G['4-1-6'] = (lv, T) => {   // 규칙 찾기
  const { int, pick } = T, k = pick(lv === 0 ? ['add'] : ['add', 'mul', 'calc']);
  if (k === 'add') { const a = int(1, 50), d = int(2, lv ? 25 : 9) * (lv === 2 ? 11 : 1), s = [0, 1, 2, 3].map(i => a + d * i); return N(`규칙에 따라 수를 늘어놓았어요.\n${s.join(', ')}, □\n□에 알맞은 수는?`, a + 4 * d, '앞의 수와 뒤의 수의 차이를 찾아요.', `${d}씩 커져요 → ${s[3]} + ${d} = ${a + 4 * d}`, [a + 3 * d + d * 2, s[3] + 1, s[3] + 10], T); }
  if (k === 'mul') { const a = int(1, 5), r = int(2, 3), s = [0, 1, 2, 3].map(i => a * r ** i); return N(`규칙에 따라 수를 늘어놓았어요.\n${s.join(', ')}, □\n□에 알맞은 수는?`, a * r ** 4, '몇 배씩 커지는지 찾아요.', `${r}배씩 커져요 → ${s[3]} × ${r} = ${a * r ** 4}`, [s[3] + (s[3] - s[2]), s[3] * 2 + 1, s[3] * r + r], T); }
  const d = int(1, 4) * 100 + int(0, 1) * 10 + int(1, 3), rows = [1, 2, 3].map(i => `${d * i} + ${d * (i + 1)} = ${d * (2 * i + 1)}`); return N(`계산식의 규칙을 찾아요.\n${rows.join('\n')}\n${d * 4} + ${d * 5} = □`, d * 9, '더하는 두 수와 결과가 일정하게 변해요.', `${d * 4} + ${d * 5} = ${d * 9}`, [d * 8, d * 10, d * 9 + 10], T, null, { type: 'expr', expr: `${d * 4}+${d * 5}` });
};
// ═════ 4학년 2학기 ═════
G['4-2-1'] = (lv, T) => {   // 분모가 같은 분수의 덧셈과 뺄셈
  const { int } = T, d = int(3, 9);
  if (lv === 0) { const a = int(1, d - 2), b = int(1, d - 1 - a); return F(`${a}/${d} + ${b}/${d} = ?`, a + b, d, '분모는 그대로, 분자끼리 더해요.', `${a} + ${b} = ${a + b} → ${fracText(a + b, d)}`, [`${a + b}/${2 * d}`, `${a + b + 1}/${d}`], T, { type: 'expr', expr: `${a}/${d}+${b}/${d}` }); }
  const w1 = int(1, 4), w2 = int(1, 3), a = int(1, d - 1), b = int(1, d - 1);
  if (int(0, 1)) { const n = (w1 * d + a) + (w2 * d + b); return F(`${w1} ${a}/${d} + ${w2} ${b}/${d} = ?`, n, d, '자연수끼리, 분수끼리 더하고 분수가 1보다 크면 받아올림해요.', `= ${fracText(n, d)}`, [`${w1 + w2} ${a + b}/${d}`, fracText(n + d, d)], T, { type: 'expr', expr: `(${w1 * d + a}/${d})+(${w2 * d + b}/${d})` }); }
  const big = w1 + w2, nb = w2 * d + b, n = big * d - nb; if (n <= 0) return G['4-2-1'](0, T);
  return F(`${big} - ${w2} ${b}/${d} = ?`, n, d, `${big}을 ${big - 1} ${d}/${d}로 바꿔서 빼요.`, `= ${fracText(n, d)}`, [`${big - w2} ${b}/${d}`, fracText(n + d, d)], T, { type: 'expr', expr: `${big}-(${nb}/${d})` });
};
G['4-2-2'] = (lv, T) => {   // 삼각형
  const { int, pick } = T, k = pick(lv === 0 ? ['eq', 'iso'] : ['iso', 'base', 'kind', 'eqp']);
  if (k === 'eq') return N('정삼각형의 한 각의 크기는 몇 도일까요?', 60, '정삼각형은 세 각의 크기가 모두 같아요.', '180 ÷ 3 = 60', [90, 45, 180], T);
  if (k === 'eqp') { const s = int(3, 15); return N(`한 변이 ${s} cm인 정삼각형의 세 변의 길이의 합은 몇 cm일까요?`, 3 * s, '정삼각형은 세 변의 길이가 같아요.', `${s} × 3 = ${3 * s}`, [4 * s, 2 * s, s + 3], T); }
  if (k === 'iso') { const a = pick([20, 30, 40, 50, 60, 70, 80, 100, 120]), v = (180 - a) / 2; return N(`이등변삼각형에서 길이가 같은 두 변 사이의 각이 ${a}°예요.\n나머지 한 각의 크기는 몇 도일까요?`, v, '이등변삼각형은 두 밑각의 크기가 같아요.', `(180 - ${a}) ÷ 2 = ${v}`, [180 - a, a, 180 - 2 * a > 0 ? 180 - 2 * a : v + 10], T); }
  if (k === 'base') { const b = pick([30, 35, 40, 45, 50, 55, 65, 70, 75]), v = 180 - 2 * b; return N(`이등변삼각형의 한 밑각이 ${b}°예요.\n꼭짓각(나머지 한 각)은 몇 도일까요?`, v, '두 밑각의 크기가 같아요.', `180 - ${b} × 2 = ${v}`, [180 - b, b, v + 10], T); }
  const t = pick([[[30, 40, 110], '둔각삼각형'], [[50, 60, 70], '예각삼각형'], [[30, 60, 90], '직각삼각형'], [[20, 35, 125], '둔각삼각형'], [[45, 65, 70], '예각삼각형'], [[40, 50, 90], '직각삼각형']]);
  return C(`세 각이 ${t[0].join('°, ')}°인 삼각형은?`, t[1], ['예각삼각형', '직각삼각형', '둔각삼각형', '정삼각형'].filter(x => x !== t[1]), '가장 큰 각이 90°보다 작으면 예각, 같으면 직각, 크면 둔각삼각형이에요.', `가장 큰 각 ${Math.max(...t[0])}° → ${t[1]}`, T);
};
G['4-2-3'] = (lv, T) => {   // 소수의 덧셈과 뺄셈
  const { int } = T, two = lv > 0;
  const a = two ? int(101, 899) : int(11, 89) * 10, b = two ? int(101, 899) : int(11, 89) * 10;
  if (int(0, 1)) { const s = a + b; return D(`${dec(a)} + ${dec(b)} = ?`, s, '소수점의 자리를 맞추어 더해요.', `${dec(a)} + ${dec(b)} = ${dec(s)}`, [s + 10, s - 1, Math.round(s / 10)], T, two ? 1 : 10, { type: 'expr', expr: `${dec(a)}+${dec(b)}` }); }
  const [x, y] = a > b ? [a, b] : [b, a], d = x - y; if (!d) return G['4-2-3'](lv, T);
  return D(`${dec(x)} - ${dec(y)} = ?`, d, '소수점의 자리를 맞추어 빼요.', `${dec(x)} - ${dec(y)} = ${dec(d)}`, [d + 10, d + 100, x + y], T, two ? 1 : 10, { type: 'expr', expr: `${dec(x)}-${dec(y)}` });
};
G['4-2-4'] = (lv, T) => {   // 사각형
  const { int, pick } = T, k = pick(lv === 0 ? ['name', 'rhombus'] : ['para', 'rhombus', 'paraP', 'name']);
  if (k === 'para') { const a = int(7, 16) * 5, v = 180 - a; return N(`평행사변형의 한 각이 ${a}°예요. 이웃한 각의 크기는 몇 도일까요?`, v, '평행사변형에서 이웃한 두 각의 크기의 합은 180°예요.', `180 - ${a} = ${v}`, [a, 360 - a, 90], T); }
  if (k === 'rhombus') { const s = int(3, 15); return N(`한 변이 ${s} cm인 마름모의 네 변의 길이의 합은 몇 cm일까요?`, 4 * s, '마름모는 네 변의 길이가 모두 같아요.', `${s} × 4 = ${4 * s}`, [2 * s, 3 * s, s + 4], T); }
  if (k === 'paraP') { const a = int(4, 15), b = int(3, a - 1); return N(`이웃한 두 변이 ${a} cm, ${b} cm인 평행사변형의 네 변의 길이의 합은?`, 2 * (a + b), '마주 보는 두 변의 길이가 같아요.', `(${a} + ${b}) × 2 = ${2 * (a + b)}`, [a + b, a * b, 2 * a + b], T); }
  const t = pick([['평행한 변이 한 쌍이라도 있는 사각형', '사다리꼴'], ['마주 보는 두 쌍의 변이 서로 평행한 사각형', '평행사변형'], ['네 변의 길이가 모두 같은 사각형', '마름모'], ['네 각이 모두 직각인 사각형', '직사각형']]);
  return C(`${wj(t[0], '을', '를')} 무엇이라고 할까요?`, t[1], ['사다리꼴', '평행사변형', '마름모', '직사각형'].filter(x => x !== t[1]), '사각형의 뜻을 떠올려 봐요.', `${t[0]} → ${t[1]}`, T);
};
G['4-2-5'] = (lv, T) => {   // 꺾은선그래프
  const { int, pick } = T, hours = [9, 10, 11, 12, 13], start = int(10, 16), steps = [int(1, 4), int(1, 5), int(1, 4), int(0, 3)], temp = [start]; steps.forEach(s => temp.push(temp.at(-1) + s));
  const data = hours.map((h, i) => `${h}시 ${temp[i]}°C`).join(', '), k = pick(lv === 0 ? ['at', 'diff'] : ['at', 'diff', 'most', 'mid']);
  if (k === 'at') { const i = int(0, 4); return N(`기온 기록: ${data}\n${hours[i]}시의 기온은 몇 °C일까요?`, temp[i], '그 시각의 값을 읽어요.', `${hours[i]}시 → ${temp[i]}°C`, temp.filter((t, j) => j !== i), T); }
  if (k === 'diff') { const d = temp[4] - temp[0]; return N(`기온 기록: ${data}\n9시부터 13시까지 기온은 몇 °C 올랐을까요?`, d, '나중 값에서 처음 값을 빼요.', `${temp[4]} - ${temp[0]} = ${d}`, [d + 1, temp[4], d - 1 || d + 2], T); }
  if (k === 'mid') { const i = int(0, 3), m = (temp[i] + temp[i + 1]) / 2; if (m % 1) return G['4-2-5'](1, T); return N(`기온 기록: ${data}\n${hours[i]}시 30분의 기온은 약 몇 °C였을까요? (중간값으로 어림)`, m, '두 시각의 가운데 값을 어림해요.', `(${temp[i]} + ${temp[i + 1]}) ÷ 2 = ${m}`, [temp[i], temp[i + 1], m + 2], T); }
  const mx = Math.max(...steps), i = steps.indexOf(mx); if (steps.filter(s => s === mx).length > 1) return G['4-2-5'](1, T);
  const label = j => `${hours[j]}시~${hours[j + 1]}시`; return C(`기온 기록: ${data}\n기온이 가장 많이 오른 때는?`, label(i), [0, 1, 2, 3].filter(j => j !== i).map(label), '선이 가장 많이 기울어진 곳을 찾아요.', `${label(i)}에 ${mx}°C 올랐어요.`, T);
};
G['4-2-6'] = (lv, T) => {   // 다각형
  const { int, pick } = T, names = { 3: '삼각형', 4: '사각형', 5: '오각형', 6: '육각형', 7: '칠각형', 8: '팔각형' }, n = int(lv === 0 ? 4 : 4, lv === 2 ? 8 : 6), k = pick(lv === 0 ? ['perim', 'sides'] : ['diag', 'perim', 'side']);
  if (k === 'diag') { const v = n * (n - 3) / 2; return N(`${names[n]}의 대각선은 모두 몇 개일까요?`, v, '한 꼭짓점에서 이웃하지 않은 꼭짓점으로 그을 수 있는 대각선 수를 생각해요.', `${n} × ${n - 3} ÷ 2 = ${v}`, [n * (n - 3), n - 3, n], T); }
  if (k === 'sides') return N(`${names[n]}의 변은 몇 개일까요?`, n, '이름 앞의 수가 변의 수예요.', `${names[n]} → 변 ${n}개`, [n - 1, n + 1, n + 2], T);
  const s = int(2, 12); if (k === 'perim') return N(`한 변이 ${s} cm인 정${names[n]}의 모든 변의 길이의 합은?`, s * n, '정다각형은 변의 길이가 모두 같아요.', `${s} × ${n} = ${s * n}`, [s * (n - 1), s * (n + 1), s + n], T);
  return N(`모든 변의 길이의 합이 ${s * n} cm인 정${names[n]}의 한 변은 몇 cm일까요?`, s, '변의 수로 나누어요.', `${s * n} ÷ ${n} = ${s}`, [s + 1, s * n - n, n], T);
};
// ═════ 5학년 1학기 ═════
G['5-1-1'] = (lv, T) => {   // 자연수의 혼합 계산
  const { int, pick } = T, a = int(10, 40), b = int(2, 9), c = int(2, 9), d = int(2, 9), form = pick(lv === 0 ? ['a+b*c', 'a-b*c'] : lv === 1 ? ['a+b*c', '(a+b)*c', 'a-b*c+d', 'a+bc/c'] : ['(a+b)*c-d', 'a-(b+c)*d', 'a+bc/c-d', '(a-b)*c+d']);
  const expr = form.replace('bc/c', `${b * c}/${c}`).replace(/a/g, a).replace(/b/g, b).replace(/c/g, c).replace(/d/g, d);
  const show = expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/(\d)-/g, '$1 - ').replace(/\)-/g, ') - ');
  const val = Function(`return ${expr}`)(); if (val < 0 || !Number.isInteger(val)) return G['5-1-1'](lv, T);
  let ltr = null; try { const toks = expr.replace(/[()]/g, '').match(/\d+|[+\-*/]/g); let v = Number(toks[0]); for (let i = 1; i < toks.length; i += 2) { const x = Number(toks[i + 1]); v = toks[i] === '+' ? v + x : toks[i] === '-' ? v - x : toks[i] === '*' ? v * x : v / x; } ltr = v; } catch {}
  if (!(Number.isInteger(ltr) && ltr >= 0)) ltr = val + 2 * b;
  return N(`${show} = ?`, val, '( ) 안을 먼저, 그다음 ×와 ÷, 마지막으로 +와 -를 계산해요.', `${show} = ${val}`, [ltr, val + 10, val - b], T, null, { type: 'expr', expr });
};
G['5-1-2'] = (lv, T) => {   // 약수와 배수
  const { int, pick } = T, k = pick(lv === 0 ? ['count', 'mult'] : ['gcd', 'lcm', 'count']);
  if (k === 'count') { const n = pick([6, 8, 10, 12, 15, 16, 18, 20, 24, 28, 30, 36]), c = Array.from({ length: n }, (_, i) => i + 1).filter(x => n % x === 0).length; return N(`${n}의 약수는 모두 몇 개일까요?`, c, `${n}을 나누어떨어지게 하는 수를 모두 찾아요.`, `${Array.from({ length: n }, (_, i) => i + 1).filter(x => n % x === 0).join(', ')} → ${c}개`, [c - 1, c + 1, c + 2], T); }
  if (k === 'mult') { const n = int(3, 9), m = int(3, 6); return N(`${n}의 배수를 작은 수부터 쓸 때 ${m}번째 수는?`, n * m, `${n}에 1, 2, 3, …을 곱해요.`, `${n} × ${m} = ${n * m}`, [n * (m - 1), n * (m + 1), n + m], T); }
  const g = int(2, 9); let a, b; do { a = int(2, 9); b = int(2, 9); } while (a === b || gcd(a, b) !== 1);
  if (k === 'gcd') return N(`${g * a}와 ${g * b}의 최대공약수는?`, g, '두 수를 모두 나누어떨어지게 하는 수 중 가장 큰 수예요.', `${g * a} = ${g} × ${a}, ${g * b} = ${g} × ${b} → ${g}`, [g * a * b, 1, g * Math.min(a, b)], T, null, { type: 'gcd', a: g * a, b: g * b });
  return N(`${g * a}와 ${g * b}의 최소공배수는?`, g * a * b, '두 수의 공통인 배수 중 가장 작은 수예요.', `${g} × ${a} × ${b} = ${g * a * b}`, [g, g * a * g * b, g * a * b * 2], T, null, { type: 'lcm', a: g * a, b: g * b });
};
G['5-1-3'] = (lv, T) => {   // 규칙과 대응
  const { int } = T, k = int(2, 9), c = lv === 2 ? int(1, 9) : 0, xs = [1, 2, 3, 4], x = int(6, 12), y = v => k * v + c;
  return N(`△와 □의 대응 관계예요.\n△: ${xs.join(', ')}\n□: ${xs.map(y).join(', ')}\n△가 ${x}일 때 □는?`, y(x), c ? '□는 △의 몇 배보다 몇 큰지 찾아요.' : '□는 △의 몇 배인지 찾아요.', c ? `□ = △ × ${k} + ${c} → ${x} × ${k} + ${c} = ${y(x)}` : `□ = △ × ${k} → ${x} × ${k} = ${y(x)}`, [x + k, y(x) + k, k * x], T);
};
G['5-1-4'] = (lv, T) => {   // 약분과 통분
  const { int, pick } = T, kind = pick(lv === 0 ? ['reduce'] : ['reduce', 'lcd', 'cmp']);
  if (kind === 'reduce') { let n, d; do { d = int(3, 9); n = int(1, d - 1); } while (gcd(n, d) !== 1); const m = int(2, lv ? 6 : 4); return F(`${n * m}/${d * m}을 기약분수로 나타내면?`, n, d, '분자와 분모를 최대공약수로 나누어요.', `${n * m} ÷ ${m} = ${n}, ${d * m} ÷ ${m} = ${d}`, [`${n * m}/${d}`, `${n}/${d * m}`, `${n + 1}/${d}`], T); }
  if (kind === 'lcd') { const a = int(2, 9), b = int(2, 9); if (a === b || a % b === 0 || b % a === 0) return G['5-1-4'](lv, T); const l = lcm(a, b); return N(`1/${a}과 1/${b}을 분모의 최소공배수로 통분할 때 공통분모는?`, l, '두 분모의 최소공배수를 찾아요.', `${a}와 ${b}의 최소공배수 = ${l}`, [a * b === l ? l * 2 : a * b, a + b, Math.max(a, b)], T, null, { type: 'lcm', a, b }); }
  const fr = []; while (fr.length < 4) { const d = int(3, 9), n = int(1, d - 1); if (gcd(n, d) === 1 && !fr.some(([x, y]) => x * d === y * n)) fr.push([n, d]); }
  const mx = fr.reduce((m, f) => (f[0] * m[1] > m[0] * f[1] ? f : m)), txt = f => `${f[0]}/${f[1]}`;
  return C(`다음 중 가장 큰 분수는 무엇일까요?\n${fr.map(txt).join(',  ')}`, txt(mx), fr.filter(f => f !== mx).map(txt), '통분하거나 1/2 같은 기준과 비교해 봐요.', `${txt(mx)}이 가장 커요.`, T);
};
G['5-1-5'] = (lv, T) => {   // 분모가 다른 분수의 덧셈과 뺄셈
  const { int } = T; let a, b, c, d; do { b = int(2, lv ? 9 : 6); d = int(2, lv ? 9 : 6); a = int(1, b - 1); c = int(1, d - 1); } while (b === d || gcd(a, b) !== 1 || gcd(c, d) !== 1);
  const w1 = lv === 2 ? int(1, 3) : 0, w2 = lv === 2 ? int(1, 2) : 0, A = w1 * b + a, Cc = w2 * d + c, show = (w, n, dd) => (w ? `${w} ${n}/${dd}` : `${n}/${dd}`);
  if (int(0, 1) || A * d <= Cc * b) { const n = A * d + Cc * b, D2 = b * d; return F(`${show(w1, a, b)} + ${show(w2, c, d)} = ?`, n, D2, '통분한 뒤 분자끼리 더해요.', `${n}/${D2} = ${fracText(n, D2)}`, [`${a + c}/${b + d}`, fracText(n + D2, D2)], T, { type: 'expr', expr: `(${A}/${b})+(${Cc}/${d})` }); }
  const n = A * d - Cc * b, D2 = b * d; return F(`${show(w1, a, b)} - ${show(w2, c, d)} = ?`, n, D2, '통분한 뒤 분자끼리 빼요.', `${n}/${D2} = ${fracText(n, D2)}`, [`${Math.abs(a - c) || 1}/${Math.abs(b - d)}`, fracText(n + D2, D2)], T, { type: 'expr', expr: `(${A}/${b})-(${Cc}/${d})` });
};
G['5-1-6'] = (lv, T) => {   // 다각형의 둘레와 넓이
  const { int, pick } = T, k = pick(lv === 0 ? ['rect', 'sq'] : ['rect', 'tri', 'para', 'trap', 'rhom', 'rectP']);
  if (k === 'sq') { const s = int(2, 12); return N(`한 변이 ${s} cm인 정사각형의 넓이는 몇 cm²일까요?`, s * s, '정사각형의 넓이 = 한 변 × 한 변', `${s} × ${s} = ${s * s}`, [4 * s, 2 * s, s * s + s], T); }
  const a = int(3, 14), b = int(2, 12);
  if (k === 'rect') return N(`가로 ${a} cm, 세로 ${b} cm인 직사각형의 넓이는 몇 cm²일까요?`, a * b, '직사각형의 넓이 = 가로 × 세로', `${a} × ${b} = ${a * b}`, [2 * (a + b), a + b, a * b + a], T);
  if (k === 'rectP') return N(`가로 ${a} cm, 세로 ${b} cm인 직사각형의 둘레는 몇 cm일까요?`, 2 * (a + b), '직사각형의 둘레 = (가로 + 세로) × 2', `(${a} + ${b}) × 2 = ${2 * (a + b)}`, [a * b, a + b, 2 * a + b], T);
  if (k === 'para') return N(`밑변 ${a} cm, 높이 ${b} cm인 평행사변형의 넓이는 몇 cm²일까요?`, a * b, '평행사변형의 넓이 = 밑변 × 높이', `${a} × ${b} = ${a * b}`, [a * b / 2, 2 * (a + b), a + b], T, n => Math.max(1, a * b + (n % 2 ? 1 : -1) * Math.ceil(n / 2)));
  const h = int(1, 6) * 2;
  if (k === 'tri') return N(`밑변 ${a} cm, 높이 ${h} cm인 삼각형의 넓이는 몇 cm²일까요?`, a * h / 2, '삼각형의 넓이 = 밑변 × 높이 ÷ 2', `${a} × ${h} ÷ 2 = ${a * h / 2}`, [a * h, a + h, a * h / 2 + h], T);
  if (k === 'rhom') return N(`두 대각선이 ${a} cm, ${h} cm인 마름모의 넓이는 몇 cm²일까요?`, a * h / 2, '마름모의 넓이 = 한 대각선 × 다른 대각선 ÷ 2', `${a} × ${h} ÷ 2 = ${a * h / 2}`, [a * h, a + h, 2 * (a + h)], T);
  const top = int(2, 9), bot = top + int(1, 8); return N(`윗변 ${top} cm, 아랫변 ${bot} cm, 높이 ${h} cm인 사다리꼴의 넓이는 몇 cm²일까요?`, (top + bot) * h / 2, '사다리꼴의 넓이 = (윗변 + 아랫변) × 높이 ÷ 2', `(${top} + ${bot}) × ${h} ÷ 2 = ${(top + bot) * h / 2}`, [(top + bot) * h, top * bot * h / 2, (top + bot) * h / 2 + h], T);
};
// ═════ 5학년 2학기 ═════
G['5-2-1'] = (lv, T) => {   // 수의 범위와 어림하기
  const { int, pick } = T, k = pick(lv === 0 ? ['range', 'round'] : ['range', 'round', 'up', 'down']);
  if (k === 'range') { const a = int(10, 40), b = a + int(4, 12), mode = pick(['이상 미만', '초과 이하', '이상 이하']), c = mode === '이상 미만' || mode === '초과 이하' ? b - a : b - a + 1;
    const [l, r] = mode.split(' '); return N(`${a} ${l} ${b} ${r}인 자연수는 모두 몇 개일까요?`, c, '이상·이하는 그 수를 포함하고, 초과·미만은 포함하지 않아요.', `${c}개`, [b - a + 1 === c ? c - 1 : b - a + 1, b - a - 1 === c ? c + 1 : b - a - 1, c + 2], T); }
  const n = int(1001, 9989), place = pick([10, 100, 1000]), pn = { 10: '십', 100: '백', 1000: '천' }[place];
  const up = Math.ceil(n / place) * place, down = Math.floor(n / place) * place, round = Math.round(n / place) * place;
  if (k === 'round') return N(`${n}을 반올림하여 ${pn}의 자리까지 나타내면?`, round, `${pn}의 자리 바로 아래 숫자가 5 이상이면 올리고, 4 이하이면 버려요.`, `${n} → ${round}`, [round === up ? down : up, round + place, n], T, k2 => round + (k2 % 2 ? place : -place) * Math.ceil(k2 / 2));
  if (k === 'up') { if (up === n) return G['5-2-1'](lv, T); return N(`${n}을 올림하여 ${pn}의 자리까지 나타내면?`, up, `${pn}의 자리 아래 수를 올려요.`, `${n} → ${up}`, [down, up + place, n], T, k2 => up + (k2 % 2 ? place : -place) * Math.ceil(k2 / 2)); }
  if (down === n) return G['5-2-1'](lv, T); return N(`${n}을 버림하여 ${pn}의 자리까지 나타내면?`, down, `${pn}의 자리 아래 수를 0으로 버려요.`, `${n} → ${down}`, [up, down - place, n], T, k2 => down + (k2 % 2 ? place : -place) * Math.ceil(k2 / 2));
};
G['5-2-2'] = (lv, T) => {   // 분수의 곱셈
  const { int } = T; let a, b; do { b = int(2, 9); a = int(1, b - 1); } while (gcd(a, b) !== 1);
  if (lv === 0) { const n = int(2, 9); return F(`${a}/${b} × ${n} = ?`, a * n, b, '분자에 자연수를 곱해요.', `${a} × ${n} = ${a * n} → ${fracText(a * n, b)}`, [`${a * n}/${b * n}`, `${a}/${b * n}`], T, { type: 'expr', expr: `(${a}/${b})*${n}` }); }
  let c, d; do { d = int(2, 9); c = int(1, d - 1); } while (gcd(c, d) !== 1);
  if (lv === 1) return F(`${a}/${b} × ${c}/${d} = ?`, a * c, b * d, '분자는 분자끼리, 분모는 분모끼리 곱해요.', `${a * c}/${b * d} = ${fracText(a * c, b * d)}`, [`${a + c}/${b + d}`, `${a * d}/${b * c}`], T, { type: 'expr', expr: `(${a}/${b})*(${c}/${d})` });
  const w = int(1, 3), A = w * b + a; return F(`${w} ${a}/${b} × ${c}/${d} = ?`, A * c, b * d, '대분수를 가분수로 바꾸어 곱해요.', `${A}/${b} × ${c}/${d} = ${fracText(A * c, b * d)}`, [fracText(w * c * b + a * c, b * d) === fracText(A * c, b * d) ? `${w} ${a * c}/${b * d}` : fracText(w * c * b + a * c, b * d), `${w} ${a * c}/${b * d}`], T, { type: 'expr', expr: `(${A}/${b})*(${c}/${d})` });
};
G['5-2-3'] = (lv, T) => {   // 합동과 대칭
  const { int, pick } = T, k = pick(lv === 0 ? ['axis'] : ['axis', 'cong', 'angle', 'center']);
  if (k === 'axis') { const f = pick([['정사각형', 4], ['정삼각형', 3], ['직사각형', 2], ['정오각형', 5], ['정육각형', 6], ['이등변삼각형', 1]]); return N(`${f[0]}의 대칭축은 몇 개일까요?`, f[1], '접었을 때 완전히 겹치는 직선을 모두 찾아요.', `${f[0]} → ${f[1]}개`, [1, 2, 3, 4, 5, 6].filter(v => v !== f[1]), T); }
  if (k === 'cong') { const a = int(3, 9), b = int(3, 9), c = int(Math.abs(a - b) + 1, a + b - 1); return N(`서로 합동인 두 삼각형이 있어요.\n한 삼각형의 세 변이 ${a} cm, ${b} cm, ${c} cm일 때\n다른 삼각형의 둘레는 몇 cm일까요?`, a + b + c, '합동인 도형은 대응변의 길이가 같아요.', `${a} + ${b} + ${c} = ${a + b + c}`, [2 * (a + b + c), a + b, a * b], T); }
  if (k === 'angle') return N('선대칭도형에서 대응점을 이은 선분은 대칭축과 몇 도로 만날까요?', 90, '대응점을 이은 선분은 대칭축과 수직으로 만나요.', '수직 → 90°', [45, 180, 60], T);
  return N('점대칭도형에서 대칭의 중심은 몇 개일까요?', 1, '대칭의 중심은 항상 하나예요.', '1개', [0, 2, 4], T);
};
G['5-2-4'] = (lv, T) => {   // 소수의 곱셈
  const { int } = T;
  if (lv === 0) { let a; do a = int(11, 99); while (a % 10 === 0); const n = int(2, 9); return D(`${dec(a * 10)} × ${n} = ?`, a * 10 * n, '자연수의 곱셈처럼 계산하고 소수점을 찍어요.', `${dec(a * 10)} × ${n} = ${dec(a * 10 * n)}`, [a * n, a * 10 * n * 10], T, 10, { type: 'expr', expr: `${dec(a * 10)}*${n}` }); }
  let a; do a = int(11, 99); while (a % 10 === 0); const b = int(2, 9);   // a.b × 0.b 꼴(기본), a.b × b.c 꼴(도전): 소수 둘째 자리까지만
  if (lv === 1) { const A = a * 10, p = a * b; return D(`${dec(A)} × ${dec(b * 10)} = ?`, p, '자연수처럼 곱한 뒤 소수점 아래 자리 수를 더해 소수점을 찍어요.', `${dec(A)} × ${dec(b * 10)} = ${dec(p)}`, [p * 10, Math.round(p / 10), p + 100], T, 1, { type: 'expr', expr: `${dec(A)}*${dec(b * 10)}` }); }
  const A = int(11, 49) * 10, B = int(11, 29) * 10, p = A * B / 100; if (!Number.isInteger(p)) return G['5-2-4'](1, T);
  return D(`${dec(A)} × ${dec(B)} = ?`, p, '소수점 아래 자리 수를 세어 곱의 소수점을 찍어요.', `${dec(A)} × ${dec(B)} = ${dec(p)}`, [p * 10, Math.round(p / 10), p + 100], T, 1, { type: 'expr', expr: `${dec(A)}*${dec(B)}` });
};
G['5-2-5'] = (lv, T) => {   // 직육면체
  const { int, pick } = T, k = pick(lv === 0 ? ['count'] : ['count', 'edgeSum', 'cubeSum', 'hidden']);
  if (k === 'count') { const f = pick([['면', 6], ['모서리', 12], ['꼭짓점', 8]]); return N(`직육면체의 ${wj(f[0], '은', '는')} 모두 몇 개일까요?`, f[1], '직육면체를 떠올리며 세어 봐요.', `${f[0]} ${f[1]}개`, [6, 8, 12, 4].filter(v => v !== f[1]), T); }
  if (k === 'cubeSum') { const a = int(2, 9); return N(`한 모서리가 ${a} cm인 정육면체의 모든 모서리 길이의 합은?`, 12 * a, '정육면체는 모서리 12개의 길이가 같아요.', `${a} × 12 = ${12 * a}`, [6 * a, 8 * a, a * a * a], T); }
  if (k === 'edgeSum') { const a = int(2, 9), b = int(2, 9), c = int(2, 9); return N(`가로 ${a} cm, 세로 ${b} cm, 높이 ${c} cm인 직육면체의 모든 모서리 길이의 합은?`, 4 * (a + b + c), '같은 길이의 모서리가 4개씩 있어요.', `(${a} + ${b} + ${c}) × 4 = ${4 * (a + b + c)}`, [a + b + c, 2 * (a + b + c), a * b * c], T); }
  const f = pick([['보이지 않는 모서리', 3], ['보이는 모서리', 9], ['보이는 꼭짓점', 7], ['보이지 않는 면', 3]]); return N(`직육면체의 겨냥도에서 ${wj(f[0], '은', '는')} 몇 개일까요?`, f[1], '겨냥도에서 보이는 것은 실선, 보이지 않는 것은 점선으로 그려요.', `${f[0]} ${f[1]}개`, [3, 6, 7, 9, 12].filter(v => v !== f[1]), T);
};
G['5-2-6'] = (lv, T) => {   // 평균과 가능성
  const { int, pick } = T, k = pick(lv === 0 ? ['mean', 'chance'] : ['mean', 'missing', 'chance']);
  if (k === 'chance') { const f = pick([['주사위를 굴릴 때 7이 나올 가능성', '0', '불가능해요.'], ['동전을 던질 때 그림 면이 나올 가능성', '1/2', '반반이에요.'], ['1부터 6까지 적힌 주사위를 굴릴 때 6 이하의 수가 나올 가능성', '1', '확실해요.'], ['빨간 공만 4개 든 주머니에서 빨간 공을 꺼낼 가능성', '1', '확실해요.'], ['흰 공 2개, 검은 공 2개 중 흰 공을 꺼낼 가능성', '1/2', '반반이에요.']]);
    return C(`${wj(f[0], '을', '를')} 수로 나타내면?`, f[1], ['0', '1/2', '1', '1/4'].filter(x => x !== f[1]), '불가능하다 0, 반반이다 1/2, 확실하다 1이에요.', `${f[2]} → ${f[1]}`, T); }
  const n = int(4, 5), m = int(lv ? 20 : 5, lv ? 90 : 15); let xs; do { xs = Array.from({ length: n - 1 }, () => m + int(-4, 4)); } while (m * n - xs.reduce((a, b) => a + b, 0) <= 0);
  xs.push(m * n - xs.reduce((a, b) => a + b, 0));
  if (k === 'mean') return N(`${xs.join(', ')}의 평균은?`, m, '모두 더한 뒤 자료의 수로 나누어요.', `${xs.join(' + ')} = ${m * n}, ${m * n} ÷ ${n} = ${m}`, [m * n, m + 1, m - 1], T, null, { type: 'mean', xs });
  const last = xs.pop(); return N(`${n}번 시험의 평균이 ${m}점이에요. ${n - 1}번의 점수가 ${xs.join(', ')}일 때\n나머지 한 번의 점수는?`, last, '평균 × 횟수 = 전체 합이에요.', `${m} × ${n} - (${xs.join(' + ')}) = ${last}`, [m, last + 1, m * n], T);
};
// ═════ 6학년 1학기 ═════
G['6-1-1'] = (lv, T) => {   // (분수) ÷ (자연수)
  const { int } = T; let a, b; do { b = int(2, 9); a = int(1, b - 1); } while (gcd(a, b) !== 1);
  if (lv === 0) { let n, A; do { b = int(5, 9); a = int(1, 4); n = int(2, 3); A = a * n; } while (A >= b || gcd(a, b) !== 1); return F(`${A}/${b} ÷ ${n} = ?`, A / n, b, '분자를 자연수로 나누어요.', `${A} ÷ ${n} = ${A / n} → ${fracText(A / n, b)}`, [`${A}/${b * n}`, `${A * n}/${b}`], T, { type: 'expr', expr: `(${A}/${b})/${n}` }); }
  const n = int(2, 9);
  if (lv === 1) return F(`${a}/${b} ÷ ${n} = ?`, a, b * n, '÷ 자연수를 × 1/자연수로 바꾸어 계산해요.', `${a}/${b} × 1/${n} = ${fracText(a, b * n)}`, [`${a * n}/${b}`, `${a}/${b + n}`], T, { type: 'expr', expr: `(${a}/${b})/${n}` });
  const w = int(1, 3), A = w * b + a; return F(`${w} ${a}/${b} ÷ ${n} = ?`, A, b * n, '대분수를 가분수로 바꾼 뒤 1/자연수를 곱해요.', `${A}/${b} × 1/${n} = ${fracText(A, b * n)}`, [`${w} ${a}/${b * n}`, fracText(A * n, b)], T, { type: 'expr', expr: `(${A}/${b})/${n}` });
};
G['6-1-2'] = (lv, T) => {   // 각기둥과 각뿔
  const { int, pick } = T, n = int(3, lv === 2 ? 10 : 6), names = { 3: '삼', 4: '사', 5: '오', 6: '육', 7: '칠', 8: '팔', 9: '구', 10: '십' }, solid = pick(['기둥', '뿔']), part = pick(lv === 0 ? ['면', '꼭짓점'] : ['면', '모서리', '꼭짓점']);
  const v = solid === '기둥' ? { 면: n + 2, 모서리: 3 * n, 꼭짓점: 2 * n }[part] : { 면: n + 1, 모서리: 2 * n, 꼭짓점: n + 1 }[part];
  const hint = solid === '기둥' ? `${names[n]}각기둥: 면 = ${n} + 2, 모서리 = ${n} × 3, 꼭짓점 = ${n} × 2` : `${names[n]}각뿔: 면 = ${n} + 1, 모서리 = ${n} × 2, 꼭짓점 = ${n} + 1`;
  return N(`${names[n]}각${solid}의 ${wj(part, '은', '는')} 몇 개일까요?`, v, solid === '기둥' ? '밑면 2개와 옆면을 생각해요.' : '밑면 1개와 옆면, 꼭짓점 1개를 생각해요.', hint, [n, solid === '기둥' ? n + 1 : n + 2, 2 * n === v ? 3 * n : 2 * n, n * 3 === v ? n + 2 : n * 3], T, null, { type: 'solid', n, solid, part });
};
G['6-1-3'] = (lv, T) => {   // (소수) ÷ (자연수)
  const { int } = T, n = int(2, 9), q = lv === 0 ? int(11, 99) * 10 : int(lv === 2 ? 101 : 11, lv === 2 ? 499 : 99), a = q * n;   // 100배 정수
  return D(`${dec(a)} ÷ ${n} = ?`, q, '자연수의 나눗셈처럼 계산하고, 몫의 소수점은 나누어지는 수의 소수점 위치에 맞추어요.', `${dec(a)} ÷ ${n} = ${dec(q)}`, [q * 10, Math.round(q / 10), q + 10], T, lv ? 1 : 10, { type: 'expr', expr: `${dec(a)}/${n}` });
};
G['6-1-4'] = (lv, T) => {   // 비와 비율
  const { int, pick } = T, k = pick(lv === 0 ? ['frac', 'pct'] : ['frac', 'pct', 'pctOf', 'dec']);
  if (k === 'frac') { let a, b; do { a = int(1, 9); b = int(2, 9); } while (a === b); return F(`비 ${a} : ${b}를 비율(분수)로 나타내면?`, a, b, '비율 = 비교하는 양 ÷ 기준량 (뒤의 수가 기준량)', `${a} ÷ ${b} = ${fracText(a, b)}`, [fracText(b, a), `${a}/${a + b}`], T); }
  if (k === 'pct') { const p = pick([10, 20, 25, 30, 40, 50, 60, 75, 80]), f = [p / gcd(p, 100), 100 / gcd(p, 100)]; return C(`비율 ${fracText(f[0], f[1])}을 백분율로 나타내면?`, `${p}%`, [`${100 - p}%`, `${f[0]}%`, `${p / 10}%`, `${p * 2 > 100 ? p / 2 : p * 2}%`, `${p + 5}%`], '비율에 100을 곱하고 %를 붙여요.', `${fracText(f[0], f[1])} × 100 = ${p}%`, T); }
  if (k === 'dec') { const p = int(1, 19) * 5; return C(`비율 ${p / 100}을 백분율로 나타내면?`, `${p}%`, [`${p / 10}%`, `${p * 10}%`, `${100 - p}%`, `${p + 10}%`], '소수에 100을 곱하고 %를 붙여요.', `${p / 100} × 100 = ${p}%`, T); }
  const total = pick([20, 25, 40, 50, 200]), p = pick([10, 20, 40, 50, 60, 80]), part = total * p / 100; return C(`전체 ${total}명 중 ${part}명이 안경을 썼어요. 안경을 쓴 학생은 몇 %일까요?`, `${p}%`, [`${part}%`, `${100 - p}%`, `${p / 2}%`, `${p + 10}%`, `${p - 10}%`], '(비교하는 양 ÷ 기준량) × 100', `${part} ÷ ${total} × 100 = ${p}%`, T);
};
G['6-1-5'] = (lv, T) => {   // 여러 가지 그래프
  const { int, pick } = T, total = pick([20, 40, 50, 100, 200, 400]), p = pick([10, 15, 20, 25, 30, 35, 40, 45]), part = total * p / 100;
  if (!Number.isInteger(part)) return G['6-1-5'](lv, T);
  if (lv === 0 || int(0, 1)) return N(`전체 ${total}명을 나타낸 원그래프에서 '피자'가 ${p}%예요.\n피자를 좋아하는 학생은 몇 명일까요?`, part, '전체 × 백분율 ÷ 100', `${total} × ${p} ÷ 100 = ${part}`, [p, total - part, part * 2], T);
  const other = [int(10, 30), int(10, 30)], rest = 100 - p - other[0] - other[1]; if (rest <= 0) return G['6-1-5'](lv, T);
  return N(`띠그래프에서 피자 ${p}%, 치킨 ${other[0]}%, 떡볶이 ${other[1]}%이고 나머지는 김밥이에요.\n김밥은 몇 %일까요?`, rest, '띠그래프 전체는 100%예요.', `100 - ${p} - ${other[0]} - ${other[1]} = ${rest}`, [100 - p, rest + 5, p], T);
};
G['6-1-6'] = (lv, T) => {   // 직육면체의 부피와 겉넓이
  const { int, pick } = T, a = int(2, 9), b = int(2, 9), c = int(2, 9), k = pick(lv === 0 ? ['vol', 'cubeV'] : ['vol', 'cubeV', 'area', 'cubeA', 'm3']);
  if (k === 'vol') return N(`가로 ${a} cm, 세로 ${b} cm, 높이 ${c} cm인 직육면체의 부피는 몇 cm³일까요?`, a * b * c, '부피 = 가로 × 세로 × 높이', `${a} × ${b} × ${c} = ${a * b * c}`, [a + b + c, 2 * (a * b + b * c + c * a), a * b * c + a], T);
  if (k === 'cubeV') return N(`한 모서리가 ${a} cm인 정육면체의 부피는 몇 cm³일까요?`, a ** 3, '부피 = 한 모서리 × 한 모서리 × 한 모서리', `${a} × ${a} × ${a} = ${a ** 3}`, [a * a, 6 * a * a, 3 * a], T);
  if (k === 'cubeA') return N(`한 모서리가 ${a} cm인 정육면체의 겉넓이는 몇 cm²일까요?`, 6 * a * a, '겉넓이 = 한 면의 넓이 × 6', `${a} × ${a} × 6 = ${6 * a * a}`, [a ** 3, 4 * a * a, a * a], T);
  if (k === 'm3') { const m = int(2, 9); return C(`${m} m³는 몇 cm³일까요?`, `${comma(m * 1000000)} cm³`, [`${comma(m * 1000)} cm³`, `${comma(m * 100)} cm³`, `${comma(m * 10000)} cm³`], '1 m³ = 100 cm × 100 cm × 100 cm = 1,000,000 cm³', `${m} × 1,000,000 = ${comma(m * 1000000)}`, T); }
  const s = 2 * (a * b + b * c + c * a); return N(`가로 ${a} cm, 세로 ${b} cm, 높이 ${c} cm인 직육면체의 겉넓이는 몇 cm²일까요?`, s, '겉넓이 = (가로×세로 + 세로×높이 + 높이×가로) × 2', `(${a * b} + ${b * c} + ${c * a}) × 2 = ${s}`, [s / 2, a * b * c, s + 2 * a], T);
};

export function makeUnitProblem(id, level = 1, rng = Math.random) {
  const u = normUnit(id), lv = Math.min(2, Math.max(0, Math.round(Number(level)) || 0));
  if (u.startsWith('6-2-')) { const p = make62(Number(u.split('-')[2]), lv, rng); return { ...p, unit: u }; }
  const gen = G[u] || G['3-1-1'], p = gen(lv, tools(rng));
  for (const k of ['question', 'hint', 'explanation']) p[k] = fixJosa(p[k]);
  return { unit: G[u] ? u : '3-1-1', level: lv, ...p };
}
// 다시 공부하면 좋은 단원: 틀린 적 있는 단원 중 정답률이 가장 낮은 곳 ('' = 없음)
export function weakUnitId(units) {
  let best = '', bestRate = 2, bestWrong = 0;
  for (const [id, v] of Object.entries(units || {})) {
    const c = v?.correct || 0, w = v?.wrong || 0; if (!w) continue;
    const rate = c / (c + w);
    if (rate < bestRate || (rate === bestRate && w > bestWrong)) { best = normUnit(id); bestRate = rate; bestWrong = w; }
  }
  return best;
}
export const GENERATORS = G;
