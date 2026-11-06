// 화면의 모든 분수는 이 파일로만 그린다. 항상 세로형(분자 위 · 가로선 · 분모 아래)이다.
import { toMixed } from '../fraction.js';

function stackHTML(n, d) {
  return `<span class="fv-stack"><span class="fv-n">${n}</span><span class="fv-line"></span><span class="fv-d">${d}</span></span>`;
}

// form: 'mixed'(기본, 1보다 크면 대분수) | 'improper'(가분수 그대로)
export function fracHTML(f, unit = '', form = 'mixed') {
  let body;
  if (f.d === 1) {
    body = `<span class="fv-whole">${f.n}</span>`;
  } else if (form === 'mixed' && f.n > f.d) {
    const m = toMixed(f);
    body = `<span class="fv-whole">${m.w}</span>${stackHTML(m.n, m.d)}`;
  } else {
    body = stackHTML(f.n, f.d);
  }
  const u = unit ? `<span class="fv-unit">${unit}</span>` : '';
  return `<span class="fv">${body}${u}</span>`;
}

// 글자와 분수 조각이 섞인 배열(문제 문장, 식)을 HTML로 바꾼다.
export function partsHTML(parts) {
  return parts
    .map((p) => {
      if (typeof p === 'string') return escapeText(p);
      if (p.op) return `<span class="fv-op">${p.op}</span>`;
      return fracHTML(p.frac, '', p.form);
    })
    .join('');
}

function escapeText(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

// Phaser 주방 화면용. 가운데 정렬된 컨테이너를 돌려준다.
export function drawFrac(scene, x, y, f, unit = '', { size = 13, color = '#2b2b2b' } = {}) {
  const style = { fontFamily: 'Galmuri11, sans-serif', fontSize: `${size}px`, color, resolution: 2 };
  const small = { ...style, fontSize: `${Math.max(10, size - 1)}px` };
  const c = scene.add.container(x, y);
  let cursor = 0;
  const place = (obj, width) => {
    obj.x = cursor + width / 2;
    c.add(obj);
    cursor += width;
  };

  const m = f.d !== 1 && f.n > f.d ? toMixed(f) : null;
  const wholeNumber = f.d === 1 ? f.n : m ? m.w : null;
  if (wholeNumber !== null) {
    const t = scene.add.text(0, 0, `${wholeNumber}`, { ...style, fontSize: `${size + 3}px` }).setOrigin(0.5);
    place(t, t.width + 1);
  }
  if (f.d !== 1) {
    const n = m ? m.n : f.n;
    const top = scene.add.text(0, 0, `${n}`, small).setOrigin(0.5, 1);
    const bottom = scene.add.text(0, 0, `${f.d}`, small).setOrigin(0.5, 0);
    const w = Math.max(top.width, bottom.width) + 3;
    const cx = cursor + w / 2;
    top.setPosition(cx, -1);
    bottom.setPosition(cx, 1);
    const line = scene.add.rectangle(cx, 0, w, 1.5, Phaser.Display.Color.HexStringToColor(color).color);
    c.add([top, line, bottom]);
    cursor += w;
  }
  if (unit) {
    const t = scene.add.text(0, 0, unit, small).setOrigin(0.5);
    cursor += 2;
    place(t, t.width);
  }
  c.list.forEach((o) => {
    o.x -= cursor / 2;
  });
  c.fracWidth = cursor;
  return c;
}
