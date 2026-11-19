// 실행: node --test tests/figures.test.mjs
// 문제 그림: 그림이 붙는 문제는 빠짐없이 그려지고, 잘못된 값이 없고, 답이 그림 글자로 미리 보이지 않는지
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUnitProblem, unitsOf } from '../curriculum.js';
import { figSVG, FIG_TYPES } from '../figures.js';

function rngOf(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const texts = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

test('그림이 붙는 문제: 그려지고, 값이 바르고, 답을 미리 보여 주지 않음', () => {
  const rng = rngOf(42), seen = {}, types = new Set();
  for (const g of [3, 4, 5, 6]) for (const s of [1, 2]) for (const id of unitsOf(g, s)) for (let lv = 0; lv <= 2; lv++) for (let i = 0; i < 150; i++) {
    const p = makeUnitProblem(id, lv, rng); if (!p.fig) continue;
    seen[id] = (seen[id] || 0) + 1; types.add(p.fig.type);
    const svg = figSVG(p.fig), where = `[${id}] ${p.question} → ${p.answer}`;
    assert.ok(svg.startsWith('<svg') && svg.length > 200, '그림이 그려져야 함: ' + where);
    assert.ok(!/NaN|undefined|Infinity|null/.test(svg), '그림에 잘못된 값 없음: ' + where);
    const ans = String(p.answer).replace(/°|%/g, ''), qtext = p.question;
    if (!['bars', 'line', 'clock', 'gridPoint'].includes(p.fig.type))   // 눈금(그래프·시계·모눈)은 읽어야 하는 값이라 제외
    for (const t of texts(svg)) { const v = t.replace(/ ?(cm|°|%|명)$/, '').trim(); if (v && v === ans && !qtext.includes(t.trim()) && !qtext.includes(v + ' ') && !qtext.includes(v + '°')) assert.fail('그림이 답을 보여 줌: ' + t + ' / ' + where); }
  }
  // 그림이 붙어야 하는 단원
  for (const id of ['3-1-2', '3-1-5', '3-1-6', '3-2-3', '3-2-4', '3-2-6', '4-1-2', '4-1-4', '4-1-5', '4-2-2', '4-2-4', '4-2-5', '4-2-6', '5-1-6', '5-2-3', '5-2-5', '6-1-2', '6-1-5', '6-1-6', '6-2-5', '6-2-6'])
    assert.ok(seen[id] > 0, '그림이 있어야 하는 단원: ' + id);
  for (const t of FIG_TYPES) assert.ok(types.has(t), '쓰이지 않는 그림 종류: ' + t);
});
