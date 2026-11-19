// 문제 그림: 글만으로 이해하기 어려운 문제(도형·그래프·시계·분수)에 함께 보여 주는 SVG
// 문제의 fig = { type, ... } → figSVG(fig)가 SVG 글자를 돌려줌. 그림에는 문제에 주어진 수와 '?'만 씀 (답이 보이지 않게)
const INK = '#2e2520', FILL = '#fff3cf', ACC = '#d6452f', BLUE = '#7fb3e6', GREEN = '#7cc28a', SOFT = '#efe6d2';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// 글자가 '분자/분모'면 위아래로 쌓은 분수 모양으로 그림
const T = (x, y, s, o = {}) => {
  const m = /^(\d+)\/(\d+)$/.exec(String(s));
  if (!m) return T0(x, y, s, o);
  const z = (o.size || 15) * 0.95, hw = Math.max(m[1].length, m[2].length) * z * 0.32 + 3;
  const cx = o.anchor === 'start' ? x + hw : o.anchor === 'end' ? x - hw : x, q = { ...o, size: z, anchor: 'middle', rot: 0 };
  return T0(cx, y - z * 0.62, m[1], q) + `<line x1="${cx - hw}" y1="${y}" x2="${cx + hw}" y2="${y}" stroke="${o.fill || INK}" stroke-width="1.6"/>` + T0(cx, y + z * 0.68, m[2], q);
};
const T0 = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 15}" font-weight="${o.w || 700}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'middle'}" dominant-baseline="middle"${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ''}>${esc(s)}</text>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || INK}" stroke-width="${o.w || 2.5}"${o.dash ? ' stroke-dasharray="6 5"' : ''} stroke-linecap="round"/>`;
const P = (pts, o = {}) => `<polygon points="${pts.map(p => p.map(v => +v.toFixed(1)).join(',')).join(' ')}" fill="${o.fill || FILL}" stroke="${o.stroke || INK}" stroke-width="${o.w || 3}" stroke-linejoin="round"${o.dash ? ' stroke-dasharray="6 5"' : ''}/>`;
const C = (x, y, r, o = {}) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${o.fill || FILL}" stroke="${o.stroke || INK}" stroke-width="${o.w || 3}"${o.dash ? ' stroke-dasharray="6 5"' : ''}/>`;
const svg = (w, h, body) => `<svg class="q-fig" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="문제 그림" xmlns="http://www.w3.org/2000/svg" font-family="'Noto Sans KR','Malgun Gothic',sans-serif">${body}</svg>`;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
// 꼭짓점 a에서 두 변(b, c 쪽) 사이 각 표시 + 글자
function angleMark(a, b, c, label, r = 26) {
  const u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - a[1], c[0] - a[0]);
  let d = v - u; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI;
  const p1 = [a[0] + r * Math.cos(u), a[1] + r * Math.sin(u)], p2 = [a[0] + r * Math.cos(u + d), a[1] + r * Math.sin(u + d)], m = u + d / 2;
  return `<path d="M${p1[0].toFixed(1)},${p1[1].toFixed(1)} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}" fill="none" stroke="${label === '?' ? ACC : INK}" stroke-width="2"/>` +
    T(a[0] + (r + 17) * Math.cos(m), a[1] + (r + 17) * Math.sin(m), label, { fill: label === '?' ? ACC : INK, size: 14 });
}
const rightMark = (a, b, c, s = 11) => { const u = [(b[0] - a[0]), (b[1] - a[1])], v = [(c[0] - a[0]), (c[1] - a[1])], nu = Math.hypot(...u), nv = Math.hypot(...v), p = [a[0] + u[0] / nu * s, a[1] + u[1] / nu * s], q = [a[0] + v[0] / nv * s, a[1] + v[1] / nv * s], r = [p[0] + q[0] - a[0], p[1] + q[1] - a[1]]; return `<polyline points="${p.join(',')} ${r.join(',')} ${q.join(',')}" fill="none" stroke="${INK}" stroke-width="2"/>`; };
// 비율에 맞춰 크기를 정함 (아주 길쭉하지 않게)
const fit = (w, h, maxW, maxH) => { const k = Math.min(maxW / Math.max(w, 1), maxH / Math.max(h, 1)); let W = w * k, H = h * k; if (W < maxW * 0.35) W = maxW * 0.35; if (H < maxH * 0.35) H = maxH * 0.35; return [W, H]; };

const F = {};
F.rect = f => { const [w, h] = fit(f.w, f.h, 190, 100), x = (260 - w) / 2, y = 22; return svg(260, 150, P([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) + rightMark([x, y + h], [x + w, y + h], [x, y]) + (f.top != null ? T(x + w / 2, y + h + 18, f.top) : '') + (f.side != null ? T(x - 8, y + h / 2, f.side, { anchor: 'end' }) : '')); };
F.tri = f => { const [w, h] = fit(f.base, f.h, 190, 100), x = (260 - w) / 2, y = 128, top = [x + w * 0.38, y - h]; return svg(260, 150, P([[x, y], [x + w, y], top]) + L(top[0], top[1], top[0], y, { dash: 1, w: 2 }) + rightMark([top[0], y], [x + w, y], top, 9) + T(x + w / 2, y + 14, f.baseLabel) + T(top[0] + 6, y - h * 0.26, f.hLabel, { anchor: 'start', size: 14 })); };
F.para = f => { const [w, h] = fit(f.base, f.h, 160, 95), x = 50, y = 120, s = 34; return svg(260, 150, P([[x, y], [x + w, y], [x + w + s, y - h], [x + s, y - h]]) + (f.hLabel != null ? L(x + s, y - h, x + s, y, { dash: 1, w: 2 }) + T(x + s + 8, y - h / 2, f.hLabel, { anchor: 'start' }) : '') + (f.baseLabel != null ? T(x + w / 2, y + 16, f.baseLabel) : '') + (f.angle ? angleMark([x, y], [x + w, y], [x + s, y - h], f.angle) + angleMark([x + w, y], [x + w + s, y - h], [x, y], '?') : '') + (f.sides ? T(x + w / 2, y + 16, f.sides[0]) + T(x + s / 2 - 10, y - h / 2, f.sides[1], { anchor: 'end' }) : '')); };
F.trap = f => { const [w, h] = fit(f.bot, f.h, 190, 95), k = w / f.bot, tw = f.top * k, x = (260 - w) / 2, y = 122, tx = x + (w - tw) * 0.35; return svg(260, 150, P([[x, y], [x + w, y], [tx + tw, y - h], [tx, y - h]]) + L(tx, y - h, tx, y, { dash: 1, w: 2 }) + T(tx + tw / 2, y - h - 11, f.topLabel) + T(x + w / 2, y + 15, f.botLabel) + T(tx + 7, y - h / 2, f.hLabel, { anchor: 'start' })); };
F.rhom = f => { const [a, b] = fit(f.d1, f.d2, 190, 110), cx = 130, cy = 72; return svg(260, 150, P([[cx - a / 2, cy], [cx, cy - b / 2], [cx + a / 2, cy], [cx, cy + b / 2]]) + (f.d1Label != null ? L(cx - a / 2, cy, cx + a / 2, cy, { dash: 1, w: 2 }) + L(cx, cy - b / 2, cx, cy + b / 2, { dash: 1, w: 2 }) + T(cx + a / 4, cy - 10, f.d1Label) + T(cx + 8, cy + b / 4, f.d2Label, { anchor: 'start' }) : '') + (f.side != null ? T(cx + a / 4 + 14, cy - b / 4 - 8, f.side, { anchor: 'start' }) : '')); };
// 각이 표시된 삼각형: angles = [왼쪽 아래, 오른쪽 아래, 위] 글자
F.triAngles = f => { const A = [40, 125], B = [225, 125], Cc = [f.apexX || 95, 25]; return svg(260, 150, P([A, B, Cc]) + angleMark(A, B, Cc, f.angles[0]) + angleMark(B, Cc, A, f.angles[1]) + angleMark(Cc, A, B, f.angles[2], 22) + (f.ticks ? `${tick(A, Cc)}${tick(B, Cc)}` : '') + (f.sides ? T(132, 140, f.sides[0]) : '')); };
const tick = (a, b) => { const m = mid(a, b), d = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2; return L(m[0] - 7 * Math.cos(d), m[1] - 7 * Math.sin(d), m[0] + 7 * Math.cos(d), m[1] + 7 * Math.sin(d), { w: 2.5 }); };
F.quadAngles = f => { const pts = [[45, 125], [215, 125], [195, 30], [70, 40]]; return svg(260, 150, P(pts) + pts.map((p, i) => angleMark(p, pts[(i + 1) % 4], pts[(i + 3) % 4], f.angles[i], 22)).join('')); };
F.poly = f => { const n = f.n, r = 56, cx = 130, cy = 76, rot = n === 4 ? Math.PI / 4 : 0, pts = Array.from({ length: n }, (_, i) => [cx + r * Math.sin(2 * Math.PI * i / n + rot), cy - r * Math.cos(2 * Math.PI * i / n + rot)]);
  return svg(260, 150, P(pts) + (f.oneDiag ? pts.slice(2, n - 1).map(q => L(pts[0][0], pts[0][1], q[0], q[1], { dash: 1, w: 2, stroke: ACC })).join('') : '') + (f.side != null ? T(...mid(pts[0], pts[1]).map((v, i) => v + (i ? -12 : 14)), f.side, { anchor: 'start' }) : '')); };
F.circle = f => { const cx = 130, cy = 72, r = 54; let b = C(cx, cy, r) + `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${INK}"/>`;
  if (f.mode === 'r') b += L(cx, cy, cx + r, cy, { stroke: ACC, w: 3 }) + T(cx + r / 2, cy - 12, f.label, { fill: ACC });
  else b += L(cx - r, cy, cx + r, cy, { stroke: ACC, w: 3 }) + T(cx, cy - 12, f.label, { fill: ACC });
  return svg(260, 150, b); };
F.circles = f => { const n = f.n, r = Math.min(30, 200 / n / 2), x0 = 130 - n * r; let b = ''; for (let i = 0; i < n; i++) b += C(x0 + r + 2 * i * r, 70, r); b += L(x0 + r, 70, x0 + 2 * r, 70, { stroke: ACC }) + T(x0 + r * 1.5, 70 - 11, f.rLabel, { fill: ACC, size: 13 }) + `<path d="M${x0},${70 + r + 14} L${x0 + 2 * n * r},${70 + r + 14}" stroke="${INK}" stroke-width="2" marker-start="url(#ar)" marker-end="url(#ar)"/>` + T(130, 70 + r + 28, '?', { fill: ACC });
  return svg(260, 150, `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs>` + b); };
F.circleInSquare = f => svg(260, 150, P([[75, 15], [185, 15], [185, 125], [75, 125]], { fill: '#fff' }) + C(130, 70, 55) + L(130, 70, 185, 70, { stroke: ACC }) + T(158, 58, f.rLabel, { fill: ACC }) + T(130, 140, '한 변 ?', { fill: ACC }));
F.clock = f => { const cx = 130, cy = 72, r = 60, hA = ((f.h % 12) + f.m / 60) / 12 * 2 * Math.PI, mA = f.m / 60 * 2 * Math.PI; let b = C(cx, cy, r, { fill: '#fff' });
  for (let i = 1; i <= 12; i++) { const a = i / 12 * 2 * Math.PI; b += T(cx + 47 * Math.sin(a), cy - 47 * Math.cos(a), i, { size: 12 }); }
  for (let i = 0; i < 60; i++) { const a = i / 60 * 2 * Math.PI, o = i % 5 ? 57 : 54; b += L(cx + o * Math.sin(a), cy - o * Math.cos(a), cx + 60 * Math.sin(a), cy - 60 * Math.cos(a), { w: i % 5 ? 1 : 2 }); }
  b += L(cx, cy, cx + 28 * Math.sin(hA), cy - 28 * Math.cos(hA), { w: 5 }) + L(cx, cy, cx + 42 * Math.sin(mA), cy - 42 * Math.cos(mA), { w: 3, stroke: ACC }) + `<circle cx="${cx}" cy="${cy}" r="4" fill="${INK}"/>`;
  return svg(260, 150, b); };
// 분수 막대: n칸 칠한 d등분 막대 (여러 개면 줄줄이)
F.fracBars = f => { const bars = f.bars, H = Math.min(26, 120 / bars.length - 6); let b = ''; bars.forEach(([n, d, label], j) => { const y = 12 + j * (H + 8), w = 200, x = 20; for (let i = 0; i < d; i++) b += `<rect x="${(x + i * w / d).toFixed(1)}" y="${y}" width="${(w / d).toFixed(1)}" height="${H}" fill="${i < n ? BLUE : '#fff'}" stroke="${INK}" stroke-width="2"/>`; if (label) b += T(x + w + 8, y + H / 2, label, { anchor: 'start', size: 13 }); }); return svg(260, 12 + bars.length * (H + 8) + 6, b); };
// 묶음: total개를 d묶음으로
F.groups = f => { const per = f.total / f.d; let b = ''; for (let g = 0; g < f.d; g++) { const gx = 10 + g * (240 / f.d), gw = 240 / f.d - 8; b += `<rect x="${gx}" y="20" width="${gw}" height="100" rx="12" fill="${g < (f.n || 0) ? '#fde3a7' : '#fff'}" stroke="${INK}" stroke-width="2" stroke-dasharray="5 4"/>`; for (let i = 0; i < per; i++) { const cols = Math.ceil(Math.sqrt(per)), cx = gx + gw / 2 + ((i % cols) - (cols - 1) / 2) * 14, cy = 70 + (Math.floor(i / cols) - (Math.ceil(per / cols) - 1) / 2) * 14; b += `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${ACC}" stroke="${INK}" stroke-width="1.2"/>`; } } return svg(260, 140, b); };
// 막대그래프: cells = 칸 수, unit = 눈금 한 칸
F.bars = f => { const n = f.labels.length, max = Math.max(...f.cells) + 1, x0 = 40, y0 = 120, ch = 100 / max, bw = 200 / n; let b = '';
  for (let i = 0; i <= max; i++) b += L(x0, y0 - i * ch, x0 + 205, y0 - i * ch, { w: 1, stroke: '#cbbfa6' }) + (i % (max > 8 ? 2 : 1) === 0 ? T(x0 - 6, y0 - i * ch, i * f.unit, { anchor: 'end', size: 10, w: 400 }) : '');
  f.cells.forEach((c, i) => { b += `<rect x="${x0 + i * bw + bw * 0.2}" y="${y0 - c * ch}" width="${bw * 0.6}" height="${c * ch}" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>` + T(x0 + i * bw + bw / 2, y0 + 12, f.labels[i], { size: 11 }); });
  return svg(260, 140, b + L(x0, y0, x0 + 205, y0) + L(x0, y0, x0, 12) + T(x0 - 2, 6, `(${f.unitName || '명'})`, { size: 10, anchor: 'start', w: 400 })); };
// 꺾은선그래프
F.line = f => { const n = f.ys.length, lo = Math.floor(Math.min(...f.ys)) - 1, hi = Math.ceil(Math.max(...f.ys)) + 1, x0 = 40, y0 = 118, H = 100, W = 200, Y = v => y0 - (v - lo) / (hi - lo) * H, X = i => x0 + 15 + i * (W - 30) / (n - 1); let b = '';
  for (let v = lo; v <= hi; v++) b += L(x0, Y(v), x0 + W, Y(v), { w: 1, stroke: '#cbbfa6' }) + ((v - lo) % 2 === 0 ? T(x0 - 6, Y(v), v, { anchor: 'end', size: 10, w: 400 }) : '');
  b += `<polyline points="${f.ys.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="${ACC}" stroke-width="3"/>` + f.ys.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${ACC}"/>` + T(X(i), y0 + 12, f.xs[i], { size: 11 })).join('');
  return svg(260, 140, b + L(x0, y0, x0 + W, y0) + L(x0, y0, x0, 10) + T(x0 - 2, 5, f.unitName || '(°C)', { size: 10, anchor: 'start', w: 400 })); };
// 그림그래프: 큰 그림 big개(10), 작은 그림 small개(1)
F.pict = f => { let b = '', x = 20; for (let i = 0; i < f.big; i++, x += 34) b += `<circle cx="${x + 14}" cy="60" r="15" fill="${ACC}" stroke="${INK}" stroke-width="2"/>`; for (let i = 0; i < f.small; i++, x += 18) b += `<circle cx="${x + 7}" cy="66" r="7" fill="${ACC}" stroke="${INK}" stroke-width="1.5"/>`;
  return svg(Math.max(260, x + 20), 120, b + `<circle cx="40" cy="104" r="9" fill="${ACC}" stroke="${INK}"/>` + T(56, 104, '10명', { anchor: 'start', size: 12 }) + `<circle cx="120" cy="104" r="5" fill="${ACC}" stroke="${INK}"/>` + T(130, 104, '1명', { anchor: 'start', size: 12 })); };
// 모눈 위의 점과 미는 방향
F.gridPoint = f => { const s = 16, x0 = 30, y0 = 130; let b = ''; for (let i = 0; i <= 13; i++) b += L(x0 + i * s, y0, x0 + i * s, y0 - 7 * s, { w: 1, stroke: '#d8cdb5' }); for (let j = 0; j <= 7; j++) b += L(x0, y0 - j * s, x0 + 13 * s, y0 - j * s, { w: 1, stroke: '#d8cdb5' });
  const px = x0 + f.x * s, py = y0 - f.y * s; b += `<circle cx="${px}" cy="${py}" r="6" fill="${ACC}" stroke="${INK}" stroke-width="2"/>` + `<path d="M${px},${py} L${px + f.dx * s},${py}" stroke="${BLUE}" stroke-width="3" stroke-dasharray="5 4"/>` + `<path d="M${px + f.dx * s},${py} L${px + f.dx * s},${py - f.dy * s}" stroke="${BLUE}" stroke-width="3" stroke-dasharray="5 4"/>` + T(px + f.dx * s, py - f.dy * s - 2, '?', { fill: ACC });
  for (let i = 0; i <= 12; i += 2) b += T(x0 + i * s, y0 + 10, i, { size: 9, w: 400 }); for (let j = 2; j <= 6; j += 2) b += T(x0 - 8, y0 - j * s, j, { size: 9, w: 400 });
  return svg(260, 145, b); };
// 직육면체 (a 가로, b 세로(깊이), c 높이)
F.cuboid = f => { const [w, h] = fit(f.a, f.c, 140, 80), d = Math.min(45, 25 + (f.b || 1) * 3), x = 50, y = 125, o = [d * 0.8, -d * 0.6]; const A = [x, y], B = [x + w, y], Cc = [x + w, y - h], Dd = [x, y - h], E = [x + o[0], y + o[1] - h], Fp = [x + w + o[0], y + o[1] - h], G = [x + w + o[0], y + o[1]];
  let b = P([A, B, Cc, Dd]) + P([Dd, Cc, Fp, E], { fill: '#fff8e2' }) + P([B, G, Fp, Cc], { fill: '#f3e3b8' }) + L(A[0], A[1], x + o[0], y + o[1], { dash: 1, w: 1.5 }) + L(x + o[0], y + o[1], G[0], G[1], { dash: 1, w: 1.5 }) + L(x + o[0], y + o[1], E[0], E[1], { dash: 1, w: 1.5 });
  if (f.labels) b += T(x + w / 2, y + 14, f.labels[0]) + T((B[0] + G[0]) / 2 + 12, (B[1] + G[1]) / 2 + 6, f.labels[1], { anchor: 'start' }) + T(x - 8, y - h / 2, f.labels[2], { anchor: 'end' });
  return svg(260, 150, b); };
// 각기둥·각뿔 (밑면 n각형)
F.solid = f => { const n = f.n, cx = 130, rx = 62, ry = 18, base = Array.from({ length: n }, (_, i) => { const a = 2 * Math.PI * i / n + Math.PI / 2 + Math.PI / n; return [cx + rx * Math.cos(a), 118 + ry * Math.sin(a)]; }), front = i => Math.sin(2 * Math.PI * i / n + Math.PI / 2 + Math.PI / n) > -0.2;
  let b = '';
  if (f.kind === '뿔') { const apex = [cx, 18]; base.forEach((p, i) => { const q = base[(i + 1) % n]; b += L(p[0], p[1], q[0], q[1], { dash: !(front(i) && front((i + 1) % n)), w: 2.5 }); b += L(p[0], p[1], apex[0], apex[1], { dash: !front(i), w: 2.5 }); }); }
  else { const top = base.map(p => [p[0], p[1] - 82]); base.forEach((p, i) => { const q = base[(i + 1) % n]; b += L(p[0], p[1], q[0], q[1], { dash: !(front(i) && front((i + 1) % n)), w: 2.5 }) + L(top[i][0], top[i][1], top[(i + 1) % n][0], top[(i + 1) % n][1]) + L(p[0], p[1], top[i][0], top[i][1], { dash: !front(i), w: 2.5 }); }); }
  return svg(260, 150, b); };
F.cylinder = f => { const cx = 130, rx = 46, ry = 13, top = 28, bot = 118; return svg(260, 150, `<ellipse cx="${cx}" cy="${bot}" rx="${rx}" ry="${ry}" fill="${FILL}" stroke="${INK}" stroke-width="2.5" stroke-dasharray="6 5"/>` + `<path d="M${cx - rx},${top} L${cx - rx},${bot} A${rx},${ry} 0 0 0 ${cx + rx},${bot} L${cx + rx},${top}" fill="${FILL}" stroke="${INK}" stroke-width="2.5"/>` + `<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="#fff8e2" stroke="${INK}" stroke-width="2.5"/>` + L(cx, bot, cx + rx, bot, { stroke: ACC }) + T(cx + rx / 2, bot - 9, f.rLabel, { fill: ACC, size: 13 }) + (f.hLabel ? T(cx + rx + 8, (top + bot) / 2, f.hLabel, { anchor: 'start' }) : '')); };
// 원그래프 (한 조각 강조) / 띠그래프
F.pie = f => { const cx = 90, cy = 72, r = 58, a = f.p / 100 * 2 * Math.PI, x = cx + r * Math.sin(a), y = cy - r * Math.cos(a); return svg(260, 150, C(cx, cy, r, { fill: '#fff' }) + `<path d="M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(1)},${y.toFixed(1)} Z" fill="${BLUE}" stroke="${INK}" stroke-width="2.5"/>` + T(cx + r * 0.55 * Math.sin(a / 2), cy - r * 0.55 * Math.cos(a / 2), `${f.p}%`, { size: 13 }) + T(205, 60, f.label, { size: 14 }) + T(205, 84, `전체 ${f.total}명`, { size: 13, w: 400 })); };
// 띠그래프: 좁은 칸(46px 미만)은 이름을 띠 위에
F.band = f => { let x = 15, b = ''; const cols = [BLUE, GREEN, '#f2b66b', SOFT]; f.parts.forEach(([lab, p], i) => { const w = 230 * (p == null ? f.rest : p) / 100; const narrow = w < 46; b += `<rect x="${x.toFixed(1)}" y="40" width="${w.toFixed(1)}" height="44" fill="${cols[i % 4]}" stroke="${INK}" stroke-width="2"/>` + T(x + w / 2, narrow ? 28 - (i % 2) * 12 : 54, lab, { size: 11 }) + T(x + w / 2, narrow ? 62 : 72, p == null ? '?' : p + '%', { size: narrow ? 10 : 12, fill: p == null ? ACC : INK }); x += w; }); return svg(260, 110, b + T(130, 100, '띠그래프 전체 = 100%', { size: 11, w: 400 })); };
// 대칭축을 찾을 도형
F.shape = f => { const k = f.kind, cx = 130, cy = 74; if (k === '직사각형') return svg(260, 150, P([[60, 34], [200, 34], [200, 114], [60, 114]]));
  if (k === '이등변삼각형') return svg(260, 150, P([[cx, 18], [cx - 55, 128], [cx + 55, 128]]) + tick([cx, 18], [cx - 55, 128]) + tick([cx, 18], [cx + 55, 128]));
  const n = { 정사각형: 4, 정삼각형: 3, 정오각형: 5, 정육각형: 6 }[k] || 4, r = 58, rot = n === 4 ? Math.PI / 4 : 0; return svg(260, 150, P(Array.from({ length: n }, (_, i) => [cx + r * Math.sin(2 * Math.PI * i / n + rot), cy - r * Math.cos(2 * Math.PI * i / n + rot)]))); };

export function figSVG(fig) {
  try { return fig && F[fig.type] ? F[fig.type](fig) : ''; } catch (e) { console.warn('문제 그림', e); return ''; }
}
export const FIG_TYPES = Object.keys(F);
