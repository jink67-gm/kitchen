// 수학 문제 모듈 — 9단계 (초등 6학년 2학기 1~6단원)
// 화면과 무관한 순수 함수. 문제마다 검산용 정보(spec)를 함께 돌려주고, tests/math.test.mjs가 별도의 계산기로 수천 문제를 검산합니다.
//
// makeProblem(단원 1~6, 난이도 0~2) → { unit, level, question, grid?, answer, options[4], hint, explanation, spec }
//   answer와 options는 화면에 보일 글자 그대로입니다 ('12', '3.6', '8/9', '1 1/8'). 분수는 화면에서 세로 모양으로 바뀝니다.

export const UNIT_NAMES = ['', '분수의 나눗셈', '소수의 나눗셈', '공간과 입체', '비례식과 비례배분', '원의 둘레와 넓이', '원기둥, 원뿔, 구'];
export const LEVEL_NAMES = ['편안함', '기본', '도전'];

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
// 기약분수로 고쳐 글자로: 자연수면 '3', 진분수면 '3/4', 가분수면 대분수 '1 1/8'
export function fracText(n, d) {
  const g = gcd(n, d) || 1; n /= g; d /= g;
  if (d === 1) return String(n);
  if (n < d) return `${n}/${d}`;
  return `${Math.floor(n / d)} ${n % d}/${d}`;
}
// 100배 한 정수 → 소수 글자 (314 → '3.14', 1250 → '12.5')
export const dec = h => String(Math.round(h) / 100);

function tools(rng) {
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = arr => arr[int(0, arr.length - 1)];
  const shuffle = arr => { const z = [...arr]; for (let i = z.length - 1; i > 0; i--) { const j = int(0, i); [z[i], z[j]] = [z[j], z[i]]; } return z; };
  return { int, pick, shuffle };
}
// 보기 4개 만들기: 정답 + 흔한 실수로 나오는 오답. 모자라면 정답 근처 수로 채움. 값이 같은 보기는 넣지 않음
function withOptions(p, wrongs, T, near) {
  const seen = new Set([p.answer]), opts = [p.answer];
  for (const w of wrongs) { const s = String(w); if (s && !seen.has(s) && !/-|NaN|Infinity/.test(s) && opts.length < 4) { seen.add(s); opts.push(s); } }
  let k = 0;
  while (opts.length < 4 && k < 60) { const s = String(near(++k)); if (!seen.has(s) && !/-|NaN/.test(s)) { seen.add(s); opts.push(s); } }
  p.options = T.shuffle(opts);
  return p;
}
const nearInt = v => k => Math.max(0, v + (k % 2 ? 1 : -1) * Math.ceil(k / 2));
const nearDec = (h, step) => k => dec(Math.max(0, h + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step));

// ── 1단원: 분수의 나눗셈 ──
function unit1(level, T) {
  const { int } = T;
  if (level === 0) {                       // 분모가 같은 분수: 분자끼리 나눔
    const b = int(1, 3), k = int(2, 3), a = b * k, d = int(a + 1, Math.max(a + 1, 11));
    return withOptions({ question: `${a}/${d} ÷ ${b}/${d} = ?`, answer: String(k), hint: '분모가 같으면 분자끼리 나누면 돼요.', explanation: `${a} ÷ ${b} = ${k}`, spec: { type: 'fracdiv', a: [a, d], b: [b, d] } }, [a - b, a * b, k + 1], T, nearInt(k));
  }
  if (level === 1) {
    if (int(0, 1)) {                       // 자연수 ÷ 단위분수
      const n = int(2, 6), d = int(2, 6);
      return withOptions({ question: `${n} ÷ 1/${d} = ?`, answer: String(n * d), hint: '1/' + d + '이 몇 번 들어가는지 생각해요. 나누는 분수를 뒤집어 곱해요.', explanation: `${n} × ${d} = ${n * d}`, spec: { type: 'fracdiv', a: [n, 1], b: [1, d] } }, [fracText(n, d), n + d, n * d + d], T, nearInt(n * d));
    }
    for (;;) {                             // 분모가 다른 분수, 몫이 자연수
      const d = int(4, 10), c = int(1, d - 1), k = int(2, 4);
      if (gcd(c, d) !== 1) continue;
      const g = gcd(k * c, d), a = k * c / g, b = d / g;
      if (a >= b || b === d) continue;
      return withOptions({ question: `${a}/${b} ÷ ${c}/${d} = ?`, answer: String(k), hint: '나누는 분수의 분자와 분모를 바꾸어 곱해요.', explanation: `${a}/${b} × ${d}/${c} = ${k}`, spec: { type: 'fracdiv', a: [a, b], b: [c, d] } }, [fracText(a * c, b * d), fracText(b * c, a * d), k + 1], T, nearInt(k));
    }
  }
  for (;;) {                               // 몫이 분수
    const b = int(3, 9), a = int(1, b - 1), d = int(3, 9), c = int(1, d - 1);
    if (gcd(a, b) !== 1 || gcd(c, d) !== 1 || b === d) continue;
    const n = a * d, m = b * c;
    if (n % m === 0 || m % n === 0) continue;
    const ans = fracText(n, m);
    return withOptions({ question: `${a}/${b} ÷ ${c}/${d} = ?`, answer: ans, hint: '나누는 분수의 분자와 분모를 바꾸어 곱한 뒤 약분해요.', explanation: `${a}/${b} × ${d}/${c} = ${ans}`, spec: { type: 'fracdiv', a: [a, b], b: [c, d] } }, [fracText(a * c, b * d), fracText(m, n), fracText(a * d, b * d + c)], T, k => fracText(n + k, m));
  }
}

// ── 2단원: 소수의 나눗셈 (모든 수를 100배 한 정수로 계산해 오차가 없음) ──
function unit2(level, T) {
  const { int, pick } = T;
  const make = (dividendH, divisorH, quotH, hint) => withOptions({ question: `${dec(dividendH)} ÷ ${dec(divisorH)} = ?`, answer: dec(quotH), hint, explanation: `${dec(dividendH)} ÷ ${dec(divisorH)} = ${dec(quotH)}`, spec: { type: 'decdiv', a: dividendH, b: divisorH } }, [dec(quotH * 10), dec(quotH / 10), dec(quotH + 100)], T, nearDec(quotH, quotH % 100 ? 10 : 100));
  if (level === 0) { const b = int(2, 9) * 10, q = int(2, 9); return make(b * q, b, q * 100, '나누는 수와 나누어지는 수의 소수점을 똑같이 한 칸씩 옮겨요.'); }       // 1.6 ÷ 0.4
  if (level === 1) {
    if (int(0, 1)) { const b = pick([50, 120, 150, 250, 20, 40]), q = int(2, 8); return make(b * q, b, q * 100, '나누는 수가 자연수가 되도록 두 수의 소수점을 똑같이 옮겨요.'); }   // 6 ÷ 1.5
    const b = int(2, 9) * 10, q = int(12, 48); return make(b * q / 10, b, q * 10, '소수점을 똑같이 옮긴 뒤 자연수의 나눗셈처럼 계산해요.');             // 2.88 ÷ 0.8 = 3.6
  }
  if (int(0, 1)) { const b = pick([25, 75, 125, 15, 35]), q = int(2, 12); return make(b * q, b, q * 100, '두 수의 소수점을 똑같이 두 칸씩 옮겨요.'); }            // 2.25 ÷ 0.75
  const b = pick([12, 15, 24, 25, 16]) * 10, q = int(12, 48); return make(b * q / 10, b, q * 10, '소수점을 똑같이 옮긴 뒤 계산하고, 몫의 소수점 위치를 확인해요.');   // 5.76 ÷ 1.2 = 4.8
}

// ── 3단원: 공간과 입체 (위에서 본 모양에 쌓은 개수를 쓴 표) ──
function unit3(level, T) {
  const { int, pick } = T;
  const rows = level === 2 ? 3 : 2, cols = level === 0 ? 2 : 3, top = level === 2 ? 3 : level === 1 ? 3 : 2;
  let grid;
  do grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => int(level === 0 ? 1 : 0, top))); while (grid.flat().every(v => v === 0) || grid.some(r => r.every(v => v === 0)));
  const flat = grid.flat(), total = flat.reduce((a, v) => a + v, 0);
  const colMax = Array.from({ length: cols }, (_, c) => Math.max(...grid.map(r => r[c]))), rowMax = grid.map(r => Math.max(...r));
  const ask = level === 0 ? 'total' : level === 1 ? pick(['total', 'layer2', 'colmax']) : pick(['total', 'layer3', 'front', 'side']);
  const base = '위에서 본 모양에 쌓은 개수예요.\n';
  let question, value, hint, explanation, wrongs, spec = { type: 'grid', grid, ask };
  if (ask === 'total') { question = base + '쌓기나무는 모두 몇 개일까요?'; value = total; hint = '칸에 쓰인 수를 모두 더해요.'; explanation = `${flat.join(' + ')} = ${total}`; wrongs = [flat.filter(v => v > 0).length, total + cols, total - 1]; }
  else if (ask === 'layer2' || ask === 'layer3') { const n = ask === 'layer2' ? 2 : 3; value = flat.filter(v => v >= n).length; question = base + `${n}층에 쌓인 쌓기나무는 몇 개일까요?`; hint = `${n} 이상인 수가 쓰인 칸에만 ${n}층이 있어요.`; explanation = `${n} 이상이 쓰인 칸이 ${value}칸`; wrongs = [flat.filter(v => v === n).length, flat.filter(v => v >= n - 1).length, total]; }
  else if (ask === 'colmax') { const c = int(0, cols - 1); spec.col = c; value = colMax[c]; question = base + `앞에서 보면 왼쪽에서 ${c + 1}번째 줄은 몇 층으로 보일까요?`; hint = '앞에서 보면 세로줄마다 가장 높은 층만 보여요.'; explanation = `그 줄에서 가장 큰 수는 ${value}`; wrongs = [grid.reduce((a, r) => a + r[c], 0), grid[rows - 1][c], value + 1]; }
  else if (ask === 'front') { value = colMax.reduce((a, v) => a + v, 0); question = base + '앞에서 본 모양을 그리려면 칸이 모두 몇 개 필요할까요?'; hint = '세로줄마다 가장 큰 수를 찾아 더해요.'; explanation = `${colMax.join(' + ')} = ${value}`; wrongs = [total, rowMax.reduce((a, v) => a + v, 0), value + 1]; }
  else { value = rowMax.reduce((a, v) => a + v, 0); question = base + '옆에서 본 모양을 그리려면 칸이 모두 몇 개 필요할까요?'; hint = '가로줄마다 가장 큰 수를 찾아 더해요.'; explanation = `${rowMax.join(' + ')} = ${value}`; wrongs = [total, colMax.reduce((a, v) => a + v, 0), value + 1]; }
  return withOptions({ question, grid, answer: String(value), hint, explanation, spec }, wrongs, T, nearInt(value));
}

// ── 4단원: 비례식과 비례배분 ──
function unit4(level, T) {
  const { int, pick } = T;
  if (level === 0) {                       // 비의 성질: a : b = ak : □
    let a, b; do { a = int(1, 5); b = int(2, 6); } while (a === b);
    const k = int(2, 5);
    return withOptions({ question: `${a} : ${b} = ${a * k} : □\n□에 알맞은 수는?`, answer: String(b * k), hint: '비의 전항과 후항에 같은 수를 곱해도 비율은 같아요.', explanation: `${a}에 ${k}를 곱했으니 ${b} × ${k} = ${b * k}`, spec: { type: 'prop', a, b, c: a * k } }, [b + (a * k - a), a * k, b * k + k], T, nearInt(b * k));
  }
  if (level === 1 && int(0, 1) || level === 2 && int(0, 2) === 0) {      // 비례식: 외항의 곱 = 내항의 곱
    for (;;) {
      const a = int(2, 9), b = int(2, 9), c = int(2, 12);
      if (a === b || (b * c) % a || c % a === 0 && level === 2) continue;
      const x = b * c / a;
      return withOptions({ question: `${a} : ${b} = ${c} : □\n□에 알맞은 수는?`, answer: String(x), hint: '외항의 곱과 내항의 곱은 같아요.', explanation: `${a} × □ = ${b} × ${c} = ${b * c}, □ = ${x}`, spec: { type: 'prop', a, b, c } }, [b + (c - a), b * c, a * c / gcd(a * c, b) === x ? x + 2 : c], T, nearInt(x));
    }
  }
  let a, b; do { a = int(1, level === 2 ? 7 : 4); b = int(2, level === 2 ? 8 : 5); } while (a === b || gcd(a, b) !== 1);   // 비례배분
  const t = int(2, level === 2 ? 9 : 5), total = (a + b) * t, item = pick([['딸기와 우유를', '딸기는', '컵'], ['밀가루와 설탕을', '밀가루는', 'g'], ['빨간 접시와 파란 접시를', '빨간 접시는', '개']]);
  return withOptions({ question: `${item[0]} ${a} : ${b}로 나누려고 해요.\n모두 ${total}${item[2]}라면 ${item[1]} 몇 ${item[2]}일까요?`, answer: String(a * t), hint: '전체를 (전항 + 후항)으로 나눈 뒤 전항을 곱해요.', explanation: `${total} ÷ ${a + b} × ${a} = ${a * t}`, spec: { type: 'share', a, b, total } }, [b * t, total / gcd(total, a) === total ? total - a : total / a | 0, t], T, nearInt(a * t));
}

// ── 5단원: 원의 둘레와 넓이 (원주율: 편안함 3, 기본 3.1, 도전 3.14) ──
const PI_H = [300, 310, 314];
function unit5(level, T) {
  const { int, pick } = T, piH = PI_H[level], pi = dec(piH), note = `\n(원주율: ${pi})`;
  const kind = level === 0 ? pick(['circD', 'circR']) : level === 1 ? pick(['circR', 'areaR', 'circD']) : pick(['areaR', 'areaD', 'diam']);
  const r = int(2, level === 2 ? 9 : 6);
  if (kind === 'circD') { const d = int(2, 9), v = d * piH; return withOptions({ question: `지름이 ${d} cm인 원의 둘레는 몇 cm일까요?${note}`, answer: dec(v), hint: '원의 둘레(원주) = 지름 × 원주율', explanation: `${d} × ${pi} = ${dec(v)}`, spec: { type: 'circle', ask: 'circ', r2: d, piH } }, [dec(d * d * piH), dec(2 * d * piH), dec(d * piH / 2)], T, nearDec(v, piH)); }
  if (kind === 'circR') { const v = 2 * r * piH; return withOptions({ question: `반지름이 ${r} cm인 원의 둘레는 몇 cm일까요?${note}`, answer: dec(v), hint: '원의 둘레 = 반지름 × 2 × 원주율', explanation: `${r} × 2 × ${pi} = ${dec(v)}`, spec: { type: 'circle', ask: 'circ', r2: 2 * r, piH } }, [dec(r * piH), dec(r * r * piH), dec(4 * r * piH)], T, nearDec(v, piH)); }
  if (kind === 'areaR') { const v = r * r * piH; return withOptions({ question: `반지름이 ${r} cm인 원의 넓이는 몇 cm²일까요?${note}`, answer: dec(v), hint: '원의 넓이 = 반지름 × 반지름 × 원주율', explanation: `${r} × ${r} × ${pi} = ${dec(v)}`, spec: { type: 'circle', ask: 'area', r2: 2 * r, piH } }, [dec(2 * r * piH), dec(4 * r * r * piH), dec(r * piH)], T, nearDec(v, piH)); }
  if (kind === 'areaD') { const d = 2 * int(2, 6), v = (d / 2) * (d / 2) * piH; return withOptions({ question: `지름이 ${d} cm인 원의 넓이는 몇 cm²일까요?${note}`, answer: dec(v), hint: '먼저 반지름(지름의 반)을 구하고, 반지름 × 반지름 × 원주율', explanation: `${d / 2} × ${d / 2} × ${pi} = ${dec(v)}`, spec: { type: 'circle', ask: 'area', r2: d, piH } }, [dec(d * d * piH), dec(d * piH), dec(d / 2 * piH)], T, nearDec(v, piH)); }
  const d = int(2, 12), c = d * piH;       // 원주 → 지름
  return withOptions({ question: `둘레가 ${dec(c)} cm인 원의 지름은 몇 cm일까요?${note}`, answer: String(d), hint: '지름 = 원의 둘레 ÷ 원주율', explanation: `${dec(c)} ÷ ${pi} = ${d}`, spec: { type: 'circle', ask: 'diam', circH: c, piH } }, [d * 2, fracText(d, 2).includes('/') ? d + 3 : d / 2, d + 1], T, nearInt(d));
}

// ── 6단원: 원기둥, 원뿔, 구 ──
function unit6(level, T) {
  const { int, pick } = T;
  if (level === 0) {
    if (int(0, 2) === 0) { const r = int(2, 9); return withOptions({ question: `지름이 ${2 * r} cm인 구의 반지름은 몇 cm일까요?`, answer: String(r), hint: '반지름은 지름의 반이에요.', explanation: `${2 * r} ÷ 2 = ${r}`, spec: { type: 'value', value: r } }, [2 * r, 4 * r, r + 1], T, nearInt(r)); }
    const f = pick([['원기둥의 밑면은 몇 개일까요?', 2, '원기둥은 위와 아래에 서로 평행하고 합동인 원이 있어요.'], ['원뿔의 밑면은 몇 개일까요?', 1, '원뿔의 밑면은 원 하나예요.'], ['원뿔의 꼭짓점은 몇 개일까요?', 1, '원뿔의 뾰족한 점이 꼭짓점이고, 하나예요.'], ['원기둥의 옆면은 몇 개일까요?', 1, '원기둥의 옆면은 굽은 면 하나예요.'], ['구의 중심은 몇 개일까요?', 1, '구에서 가장 안쪽에 있는 점이 중심이고, 하나예요.']]);
    return withOptions({ question: f[0], answer: String(f[1]), hint: f[2], explanation: f[2], spec: { type: 'value', value: f[1] } }, [0, 1, 2, 3].filter(v => v !== f[1]), T, nearInt(f[1]));
  }
  const piH = level === 1 ? 300 : 310, pi = dec(piH), note = `\n(원주율: ${pi})`, r = int(2, level === 1 ? 6 : 9);
  if (level === 1) {
    if (int(0, 2) === 0) { const d = int(3, 12) * 2; return withOptions({ question: `반지름이 ${d / 2} cm인 구의 지름은 몇 cm일까요?`, answer: String(d), hint: '지름은 반지름의 2배예요.', explanation: `${d / 2} × 2 = ${d}`, spec: { type: 'value', value: d } }, [d / 2, d * 2, d + 2], T, nearInt(d)); }
    const v = 2 * r * piH;
    return withOptions({ question: `밑면의 반지름이 ${r} cm인 원기둥의 전개도에서\n옆면(직사각형)의 가로는 몇 cm일까요?${note}`, answer: dec(v), hint: '옆면의 가로는 밑면의 둘레와 같아요.', explanation: `${r} × 2 × ${pi} = ${dec(v)}`, spec: { type: 'cyl', ask: 'width', r, piH } }, [dec(r * piH), dec(r * r * piH), String(2 * r)], T, nearDec(v, piH));
  }
  if (int(0, 1)) {
    const h = int(2, 9), v = 2 * r * piH * h;
    return withOptions({ question: `밑면의 반지름이 ${r} cm, 높이가 ${h} cm인 원기둥의\n옆면의 넓이는 몇 cm²일까요?${note}`, answer: dec(v), hint: '옆면의 넓이 = 밑면의 둘레 × 높이', explanation: `${r} × 2 × ${pi} × ${h} = ${dec(v)}`, spec: { type: 'cyl', ask: 'side', r, h, piH } }, [dec(r * piH * h), dec(r * r * piH * h), dec(2 * r * piH)], T, nearDec(v, piH * 2));
  }
  const w = 2 * r * piH;
  return withOptions({ question: `원기둥의 전개도에서 옆면의 가로가 ${dec(w)} cm예요.\n밑면의 반지름은 몇 cm일까요?${note}`, answer: String(r), hint: '옆면의 가로 = 밑면의 둘레. 둘레 ÷ 원주율 ÷ 2 = 반지름', explanation: `${dec(w)} ÷ ${pi} ÷ 2 = ${r}`, spec: { type: 'cyl', ask: 'radius', widthH: w, piH } }, [2 * r, r + 1, r * 3], T, nearInt(r));
}

const UNITS = [null, unit1, unit2, unit3, unit4, unit5, unit6];
export function makeProblem(unit, level = 1, rng = Math.random) {
  const u = Math.min(6, Math.max(1, Math.round(Number(unit)) || 1)), lv = Math.min(2, Math.max(0, Math.round(Number(level)) || 0));
  const p = UNITS[u](lv, tools(rng));
  return { unit: u, level: lv, ...p };
}
export const isCorrect = (problem, choice) => String(choice) === String(problem.answer);

// 다시 공부하면 좋은 단원: 틀린 적이 있는 단원 중 정답률이 가장 낮은 곳 (같으면 더 많이 틀린 곳). 없으면 0
export function weakUnit(units) {
  let best = 0, bestRate = 2, bestWrong = 0;
  for (let u = 1; u <= 6; u++) {
    const c = units?.[u]?.correct || 0, w = units?.[u]?.wrong || 0;
    if (!w) continue;
    const rate = c / (c + w);
    if (rate < bestRate || (rate === bestRate && w > bestWrong)) { best = u; bestRate = rate; bestWrong = w; }
  }
  return best;
}
