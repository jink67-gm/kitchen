// 주방 그림을 코드로 그려 텍스처로 만든다. 콘셉트: 저녁 시장 골목의 분식집.
// 움직이지 않는 것은 배경 한 장에 합쳐 저사양 기기에서도 가볍게 돌아가게 한다.
import { CONFIG } from '../config.js';

const { WORLD_W: W, WORLD_H: H, TILE: T, KITCHEN_X: KX, KITCHEN_Y: KY, LIFT } = CONFIG;
const FONT = 'Galmuri11, sans-serif';

function seeded(seed) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.getContext());
  tex.refresh();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function vGrad(ctx, y0, y1, ...stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

/* ---------- 배경 ---------- */

function paintHallFloor(ctx) {
  const rand = seeded(7);
  const plank = 46;
  for (let y = 0; y < H; y += plank) {
    let x = -rand() * 200;
    while (x < W) {
      const len = 180 + rand() * 180;
      const shade = 58 + rand() * 12;
      ctx.fillStyle = `hsl(${26 + rand() * 6}, 42%, ${shade - 22}%)`;
      ctx.fillRect(x, y, len, plank - 2);
      ctx.fillStyle = 'rgba(255,220,170,0.05)';
      ctx.fillRect(x, y, len, 5);
      ctx.fillStyle = 'rgba(30,14,4,0.55)';
      ctx.fillRect(x + len - 2, y, 2, plank);
      x += len;
    }
    ctx.fillStyle = 'rgba(30,14,4,0.55)';
    ctx.fillRect(0, y + plank - 2, W, 2);
  }
}

function paintWall(ctx) {
  const wallH = KY - LIFT;
  // 민트색 타일 벽
  const size = 34;
  for (let y = 0; y < wallH - 34; y += size) {
    for (let x = (y / size) % 2 ? -size / 2 : 0; x < W; x += size) {
      ctx.fillStyle = vGrad(ctx, y, y + size, '#8fd1c0', '#79bfae');
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x + 3, y + 3, size - 12, 3);
    }
  }
  ctx.fillStyle = 'rgba(40,90,80,0.35)';
  for (let y = 0; y < wallH - 34; y += size) ctx.fillRect(0, y, W, 1);
  // 벽 아래 나무 띠
  ctx.fillStyle = vGrad(ctx, wallH - 34, wallH, '#7a4a28', '#57321a');
  ctx.fillRect(0, wallH - 34, W, 34);
  ctx.fillStyle = 'rgba(255,220,170,0.25)';
  ctx.fillRect(0, wallH - 34, W, 3);

  // 간판
  const sx = 700;
  const sy = 34;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, sx + 5, sy + 7, 330, 96, 12);
  ctx.fill();
  ctx.fillStyle = vGrad(ctx, sy, sy + 96, '#c8402f', '#9f2c20');
  rr(ctx, sx, sy, 330, 96, 12);
  ctx.fill();
  ctx.strokeStyle = '#ffe2a8';
  ctx.lineWidth = 4;
  rr(ctx, sx + 7, sy + 7, 316, 82, 8);
  ctx.stroke();
  ctx.fillStyle = '#fff4d6';
  ctx.font = `bold 46px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('분수 분식', sx + 165, sy + 50);
}

function paintLights(ctx) {
  // 줄 전구
  ctx.strokeStyle = '#3a2a1c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const pts = [];
  for (let x = -40; x <= W + 40; x += 150) pts.push(x);
  ctx.moveTo(pts[0], 16);
  for (let i = 1; i < pts.length; i++) {
    ctx.quadraticCurveTo((pts[i - 1] + pts[i]) / 2, 50, pts[i], 16);
  }
  ctx.stroke();
  for (let i = 0; i < pts.length - 1; i++) {
    const x = (pts[i] + pts[i + 1]) / 2;
    const glow = ctx.createRadialGradient(x, 36, 2, x, 36, 60);
    glow.addColorStop(0, 'rgba(255,214,130,0.55)');
    glow.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 60, 0, 120, 110);
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(x, 38, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintStool(ctx, x, y, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 19, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, x - 15, y, 30, 16, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, 17, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(x - 2, y - 2, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintTable(scene, ctx, x, y, icon, guests) {
  guests.forEach(([dx, dy, animal], i) => {
    paintStool(ctx, x + dx, y + dy, i % 2 ? '#3e9c6b' : '#e8833a');
    if (animal) paintHead(ctx, x + dx, y + dy - 34, 0.62, animal, 0);
  });
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 26, 52, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6e7780';
  ctx.fillRect(x - 5, y, 10, 26);
  ctx.fillStyle = vGrad(ctx, y - 18, y + 20, '#f1f4f4', '#b8c2c6');
  ctx.beginPath();
  ctx.ellipse(x, y, 54, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8b969b';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (scene.textures.exists(icon)) {
    ctx.drawImage(scene.textures.get(icon).getSourceImage(), x - 21, y - 28, 42, 42);
  }
}

function paintHall(scene, ctx, rows) {
  const bottom = KY + rows * T;
  paintTable(scene, ctx, 104, 330, 'pot-of-food', [[-52, -26, ANIMALS.bear], [52, -26, null]]);
  paintTable(scene, ctx, 104, 540, 'shallow-pan-of-food', [[-52, -26, null], [52, -26, ANIMALS.rabbit]]);
  paintTable(scene, ctx, W - 104, 330, 'shallow-pan-of-food', [[-52, -26, ANIMALS.chick], [52, -26, ANIMALS.panda]]);
  paintTable(scene, ctx, W - 104, 540, 'steaming-bowl', [[-52, -26, null], [52, -26, null]]);
  // 아래쪽 복도
  ctx.fillStyle = 'rgba(30,14,4,0.28)';
  ctx.fillRect(0, bottom + 16, W, H - bottom);
}

function paintKitchenFloor(ctx, cols, rows) {
  const x0 = KX;
  const y0 = KY;
  const w = cols * T;
  const h = rows * T;
  // 시장 분식집의 테라조 바닥
  ctx.fillStyle = '#eadfca';
  ctx.fillRect(x0, y0, w, h);
  const rand = seeded(23);
  const chips = ['#c4b294', '#a79a84', '#dbc7a3', '#8e9c91', '#b98f6d', '#f7f0e0'];
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = chips[Math.floor(rand() * chips.length)];
    const s = 1.5 + rand() * 4.5;
    ctx.save();
    ctx.translate(x0 + rand() * w, y0 + rand() * h);
    ctx.rotate(rand() * 3);
    ctx.fillRect(-s / 2, -s / 3, s, s * 0.7);
    ctx.restore();
  }
  // 줄눈
  ctx.strokeStyle = 'rgba(120,100,70,0.3)';
  ctx.lineWidth = 2;
  for (let x = x0; x <= x0 + w; x += T * 2) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + h);
    ctx.stroke();
  }
  for (let y = y0; y <= y0 + h; y += T * 2) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
  }
  // 등불이 가운데를 비춘다
  const glow = ctx.createRadialGradient(x0 + w / 2, y0 + h / 2, 40, x0 + w / 2, y0 + h / 2, w * 0.55);
  glow.addColorStop(0, 'rgba(255,236,190,0.35)');
  glow.addColorStop(1, 'rgba(90,60,30,0.18)');
  ctx.fillStyle = glow;
  ctx.fillRect(x0, y0, w, h);
}

const counterTop = (ctx, x, y, w, h) => {
  ctx.fillStyle = vGrad(ctx, y, y + h, '#e6ecee', '#c6d0d4');
  ctx.fillRect(x, y, w, h);
  // 스테인리스 결
  const rand = seeded(Math.floor(x * 7 + y * 13));
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 9; i++) ctx.fillRect(x + rand() * w * 0.7, y + rand() * h, 12 + rand() * 26, 1);
  ctx.fillStyle = 'rgba(70,90,100,0.28)';
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
};

const frontFace = (ctx, x, y, w) => {
  const h = LIFT + 8;
  ctx.fillStyle = vGrad(ctx, y, y + h, '#3f9d8d', '#2a6f65');
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + w - 2, y, 2, h);
};

function paintCrate(scene, ctx, cx, cy, icon, name) {
  const w = 72;
  const h = 72;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  rr(ctx, x - 2, y + 6, w + 6, h, 6);
  ctx.fill();
  // 상자 안쪽
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(x, y, w, h - 26);
  const img = scene.textures.exists(icon) ? scene.textures.get(icon).getSourceImage() : null;
  if (img) {
    ctx.drawImage(img, cx - 34, y + 3, 34, 34);
    ctx.drawImage(img, cx - 2, y + 3, 34, 34);
    ctx.drawImage(img, cx - 18, y + 10, 38, 38);
  }
  // 앞판
  ctx.fillStyle = vGrad(ctx, y + h - 30, y + h, '#d9a262', '#ad7238');
  ctx.fillRect(x, y + h - 30, w, 30);
  ctx.strokeStyle = '#7d4d22';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#7d4d22';
  ctx.fillRect(x, y + h - 30, w, 3);
  // 이름표
  ctx.fillStyle = '#fff8e4';
  rr(ctx, x + 2, y + h - 26, w - 4, 24, 4);
  ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.font = `bold ${name.length > 3 ? 13 : 17}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, y + h - 13);
}

function paintStove(ctx, cx, cy) {
  ctx.fillStyle = vGrad(ctx, cy - 40, cy + 40, '#3b4046', '#22262a');
  rr(ctx, cx - 40, cy - 40, 80, 80, 8);
  ctx.fill();
  ctx.strokeStyle = '#6a7178';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const r of [30, 20]) {
    ctx.strokeStyle = r === 30 ? '#70777e' : '#50565c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#d24a35';
  ctx.beginPath();
  ctx.arc(cx + 30, cy + 31, 5, 0, Math.PI * 2);
  ctx.fill();
}

function paintPlates(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 22, 34, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const y = cy + 16 - i * 7;
    ctx.fillStyle = i === 4 ? '#ffffff' : '#e8ece9';
    ctx.beginPath();
    ctx.ellipse(cx, y, 33, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9fb0ac';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.strokeStyle = '#4f9d8e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 16 - 28, 24, 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff8e4';
  rr(ctx, cx - 24, cy + 25, 48, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.fillText('접시', cx, cy + 34);
}

function paintServe(ctx, cx, cy) {
  ctx.fillStyle = '#1f1a16';
  rr(ctx, cx - 42, cy - 42, 84, 84, 6);
  ctx.fill();
  ctx.fillStyle = vGrad(ctx, cy - 40, cy + 40, '#ffd27a', '#ec9a3a');
  rr(ctx, cx - 37, cy - 37, 74, 74, 4);
  ctx.fill();
  ctx.fillStyle = '#fff6df';
  for (const dy of [-16, 4]) {
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy + dy + 12);
    ctx.lineTo(cx, cy + dy - 4);
    ctx.lineTo(cx + 18, cy + dy + 12);
    ctx.lineTo(cx + 18, cy + dy + 20);
    ctx.lineTo(cx, cy + dy + 5);
    ctx.lineTo(cx - 18, cy + dy + 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#c8402f';
  rr(ctx, cx - 37, cy + 19, 74, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('내놓는 곳', cx, cy + 29);
}

function paintTrash(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 28, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = vGrad(ctx, cy - 14, cy + 30, '#8d979d', '#5a6268');
  ctx.beginPath();
  ctx.moveTo(cx - 32, cy - 14);
  ctx.lineTo(cx + 32, cy - 14);
  ctx.lineTo(cx + 25, cy + 30);
  ctx.lineTo(cx - 25, cy + 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  for (const dx of [-12, 12]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy - 2);
    ctx.lineTo(cx + dx * 0.85, cy + 24);
    ctx.stroke();
  }
  ctx.fillStyle = '#2b2f33';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 14, 32, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a9b2b7';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#fff8e4';
  rr(ctx, cx - 26, cy + 8, 52, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('버리기', cx, cy + 17);
}

// 빈 조리대를 채우는 작은 소품. 물건을 놓을 가운데 자리는 비워 둔다.
function paintCounterProp(ctx, cx, cy, kind) {
  const jar = (x, y, body, lid) => {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 12, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    rr(ctx, x - 8, y - 9, 16, 21, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - 5, y - 6, 3, 13);
    ctx.fillStyle = lid;
    rr(ctx, x - 7, y - 14, 14, 6, 2);
    ctx.fill();
  };
  if (kind === 0) {
    jar(cx - 26, cy - 24, '#c8402f', '#f2e3c2');
    jar(cx - 8, cy - 28, '#e7b23a', '#7a4a28');
  } else if (kind === 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, cx + 3, cy - 30, 34, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#f7f1e2';
    rr(ctx, cx, cy - 33, 34, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#4f9d8e';
    ctx.fillRect(cx, cy - 26, 34, 4);
    ctx.fillRect(cx, cy - 18, 34, 4);
  } else {
    jar(cx + 26, cy + 22, '#3e8f5a', '#2b2b2b');
    ctx.fillStyle = '#6b6f73';
    rr(ctx, cx - 36, cy + 20, 30, 7, 3);
    ctx.fill();
    ctx.fillStyle = '#d8dfe2';
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy + 23, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 화구 앞에 까는 고무 발판
function paintMat(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(40,30,20,0.25)';
  rr(ctx, x + 3, y + 4, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#4a5a56';
  rr(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#5f7570';
  for (let i = 10; i < w - 8; i += 16) {
    for (let j = 9; j < h - 6; j += 14) ctx.fillRect(x + i, y + j, 9, 5);
  }
}

// stage 지도와 설비를 배경 한 장으로 그린다.
export function buildBackground(scene, stage, stations, iconOf) {
  const rows = stage.map.length;
  const cols = stage.map[0].length;
  canvasTexture(scene, 'bg', W, H, (ctx) => {
    paintHallFloor(ctx);
    paintHall(scene, ctx, rows);
    paintWall(ctx);
    paintLights(ctx);
    paintKitchenFloor(ctx, cols, rows);

    const at = (x, y) => stations[`${x},${y}`];
    // 화구 앞 발판
    for (const s of Object.values(stations)) {
      if (s.type === 'stove' && !at(s.x, s.y - 1)) paintMat(ctx, KX + s.x * T + 4, KY + (s.y - 1) * T + 18, T - 8, T - 26);
    }
    // 벽·조리대가 바닥에 드리우는 그림자
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (at(x, y)) continue;
        const px = KX + x * T;
        const py = KY + y * T;
        if (at(x, y - 1)) {
          ctx.fillStyle = vGrad(ctx, py + LIFT - 8, py + LIFT + 26, 'rgba(50,30,10,0.38)', 'rgba(50,30,10,0)');
          ctx.fillRect(px, py, T, LIFT + 26);
        }
        if (at(x - 1, y)) {
          const g = ctx.createLinearGradient(px, 0, px + 24, 0);
          g.addColorStop(0, 'rgba(50,30,10,0.3)');
          g.addColorStop(1, 'rgba(50,30,10,0)');
          ctx.fillStyle = g;
          ctx.fillRect(px, py, 24, T);
        }
      }
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const s = at(x, y);
        if (!s) continue;
        const px = KX + x * T;
        const py = KY + y * T;
        counterTop(ctx, px, py - LIFT, T, T);
        if (!at(x, y + 1)) frontFace(ctx, px, py + T - LIFT, T);
      }
    }
    // 바깥 경계선
    ctx.strokeStyle = '#1f3f3a';
    ctx.lineWidth = 4;
    ctx.strokeRect(KX - 2, KY - LIFT - 2, cols * T + 4, rows * T + LIFT + 12);

    for (const s of Object.values(stations)) {
      const cx = KX + s.x * T + T / 2;
      const cy = KY + s.y * T + T / 2 - LIFT;
      if (s.type === 'crate') paintCrate(scene, ctx, cx, cy, iconOf(s.ingredient), s.ingredient);
      else if (s.type === 'stove') paintStove(ctx, cx, cy);
      else if (s.type === 'plates') paintPlates(ctx, cx, cy);
      else if (s.type === 'serve') paintServe(ctx, cx, cy);
      else if (s.type === 'trash') paintTrash(ctx, cx, cy);
      else if (s.type === 'counter' && (s.x * 3 + s.y * 5) % 4 === 0) paintCounterProp(ctx, cx, cy, (s.x + s.y) % 3);
    }

    // 가장자리를 살짝 어둡게 해 시선을 주방으로 모은다
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.68);
    v.addColorStop(0, 'rgba(20,10,0,0)');
    v.addColorStop(1, 'rgba(20,10,0,0.48)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  });
}

/* ---------- 요리사와 동물 ---------- */

export const ANIMALS = {
  cat: { fur: '#f4a64a', dark: '#d8802a', ear: 'cat', stripes: true },
  bear: { fur: '#a9744a', dark: '#7f5433', ear: 'round', muzzle: '#e8c9a4' },
  rabbit: { fur: '#f3eee6', dark: '#d9cfc1', ear: 'long', inner: '#f3b3bd' },
  chick: { fur: '#fbd84f', dark: '#e0b52c', ear: 'none', beak: true },
  panda: { fur: '#f7f7f4', dark: '#2e2e2e', ear: 'round', patches: true },
};

// view: 0 앞, 1 옆, 2 뒤
function paintHead(ctx, cx, cy, s, a, view) {
  const r = 32 * s;
  ctx.save();
  // 귀
  ctx.fillStyle = a.ear === 'round' && a.patches ? a.dark : a.fur;
  if (a.ear === 'cat') {
    for (const d of view === 1 ? [1] : [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + d * r * 0.95, cy - r * 0.2);
      ctx.lineTo(cx + d * r * 0.8, cy - r * 1.15);
      ctx.lineTo(cx + d * r * 0.1, cy - r * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  } else if (a.ear === 'round') {
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + d * r * 0.72, cy - r * 0.78, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.ear === 'long') {
    for (const d of [-1, 1]) {
      ctx.fillStyle = a.fur;
      ctx.beginPath();
      ctx.ellipse(cx + d * r * 0.42, cy - r * 1.25, r * 0.26, r * 0.72, d * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = a.inner;
      ctx.beginPath();
      ctx.ellipse(cx + d * r * 0.42, cy - r * 1.22, r * 0.13, r * 0.52, d * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 얼굴
  ctx.fillStyle = a.fur;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,35,15,0.55)';
  ctx.lineWidth = 2.2 * Math.max(s, 0.7);
  ctx.stroke();

  if (a.stripes) {
    ctx.fillStyle = a.dark;
    for (const d of [-0.3, 0, 0.3]) {
      rr(ctx, cx + d * r - r * 0.06, cy - r * 0.85, r * 0.12, r * 0.42, r * 0.06);
      ctx.fill();
    }
  }
  if (view !== 2) {
    const shift = view === 1 ? r * 0.3 : 0;
    const eyes = view === 1 ? [0.28] : [-0.38, 0.38];
    if (a.patches) {
      ctx.fillStyle = a.dark;
      for (const d of eyes) {
        ctx.beginPath();
        ctx.ellipse(cx + d * r + shift * 0.4, cy + r * 0.02, r * 0.25, r * 0.3, d * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (a.muzzle) {
      ctx.fillStyle = a.muzzle;
      ctx.beginPath();
      ctx.ellipse(cx + shift * 0.6, cy + r * 0.32, r * 0.38, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of eyes) {
      const ex = cx + d * r + shift * 0.4;
      ctx.fillStyle = a.patches ? '#fff' : '#2a1d14';
      ctx.beginPath();
      ctx.arc(ex, cy, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      if (!a.patches) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - r * 0.04, cy - r * 0.05, r * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (a.beak) {
      ctx.fillStyle = '#f08a2b';
      ctx.beginPath();
      ctx.moveTo(cx + shift - r * 0.16, cy + r * 0.2);
      ctx.lineTo(cx + shift + r * 0.16, cy + r * 0.2);
      ctx.lineTo(cx + shift, cy + r * 0.44);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#5a3a28';
      ctx.beginPath();
      ctx.arc(cx + shift * 0.7, cy + r * 0.24, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(240,110,110,0.4)';
    for (const d of eyes) {
      ctx.beginPath();
      ctx.ellipse(cx + d * r * 1.35 + shift * 0.4, cy + r * 0.3, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintChef(ctx, view, animal, hat) {
  const cx = 60;
  // 팔
  ctx.fillStyle = '#fbfbf7';
  ctx.strokeStyle = 'rgba(60,50,40,0.6)';
  ctx.lineWidth = 2;
  for (const d of view === 1 ? [1] : [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + d * 27, 106, 9, 12, d * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // 몸통(흰 조리복)
  ctx.fillStyle = vGrad(ctx, 84, 138, '#ffffff', '#dfe3de');
  rr(ctx, cx - 25, 84, 50, 52, 20);
  ctx.fill();
  ctx.stroke();
  if (view !== 2) {
    // 앞치마
    ctx.fillStyle = hat;
    rr(ctx, cx - 17 + (view === 1 ? 7 : 0), 100, 34, 34, 8);
    ctx.fill();
  } else {
    ctx.strokeStyle = hat;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 22, 106);
    ctx.lineTo(cx + 22, 106);
    ctx.stroke();
  }
  // 발
  ctx.fillStyle = animal.dark;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + d * 12, 138, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  paintHead(ctx, cx, 62, 1, animal, view);
  // 요리사 모자
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(60,50,40,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - 15, 21, 13, 0, Math.PI * 2);
  ctx.arc(cx + 15, 21, 13, 0, Math.PI * 2);
  ctx.arc(cx, 15, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 21, 22, 42, 16);
  ctx.fillStyle = hat;
  rr(ctx, cx - 23, 32, 46, 10, 3);
  ctx.fill();
  ctx.strokeRect(cx - 23, 32, 46, 10);
}

// 모둠원마다 동물과 색을 달리해 만든다.
export function buildChef(scene, prefix, animal, hat) {
  ['front', 'side', 'back'].forEach((name, view) => {
    canvasTexture(scene, `${prefix}-${name}`, 120, 150, (ctx) => paintChef(ctx, view, animal, hat));
  });
}

/* ---------- 작은 소품 ---------- */

export function buildProps(scene) {
  canvasTexture(scene, 'shadow', 80, 32, (ctx) => {
    const g = ctx.createRadialGradient(40, 16, 2, 40, 16, 38);
    g.addColorStop(0, 'rgba(20,10,0,0.5)');
    g.addColorStop(1, 'rgba(20,10,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, 0.4);
    ctx.translate(0, 24);
    ctx.fillRect(0, -24, 80, 80);
    ctx.restore();
  });
  canvasTexture(scene, 'pot', 92, 80, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(46, 70, 36, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7f8a90';
    for (const x of [4, 76]) {
      rr(ctx, x, 26, 12, 12, 4);
      ctx.fill();
    }
    ctx.fillStyle = vGrad(ctx, 22, 72, '#d8dfe2', '#868f95');
    ctx.beginPath();
    ctx.moveTo(12, 26);
    ctx.lineTo(12, 60);
    ctx.quadraticCurveTo(46, 82, 80, 60);
    ctx.lineTo(80, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(20, 36, 6, 24);
    ctx.fillStyle = '#eff3f4';
    ctx.beginPath();
    ctx.ellipse(46, 26, 34, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#39424a';
    ctx.beginPath();
    ctx.ellipse(46, 26, 28, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, 'plate', 72, 44, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(36, 26, 33, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(36, 21, 33, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9fb0ac';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#4f9d8e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(36, 21, 24, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  canvasTexture(scene, 'flame', 28, 40, (ctx) => {
    const g = ctx.createRadialGradient(14, 28, 2, 14, 24, 20);
    g.addColorStop(0, '#fff6c4');
    g.addColorStop(0.45, '#ffb03a');
    g.addColorStop(1, 'rgba(232,70,30,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(14, 1);
    ctx.quadraticCurveTo(28, 22, 22, 32);
    ctx.quadraticCurveTo(14, 42, 6, 32);
    ctx.quadraticCurveTo(0, 22, 14, 1);
    ctx.fill();
  });
  canvasTexture(scene, 'puff', 48, 48, (ctx) => {
    const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
  });
  canvasTexture(scene, 'arrow', 72, 84, (ctx) => {
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ff8c2e';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(22, 6);
    ctx.lineTo(50, 6);
    ctx.lineTo(50, 40);
    ctx.lineTo(66, 40);
    ctx.lineTo(36, 76);
    ctx.lineTo(6, 40);
    ctx.lineTo(22, 40);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  });
}

export function soupColor(contents) {
  const names = Object.keys(contents).join(' ');
  if (/고추장|토마토/.test(names)) return 0xd8402f;
  if (/우유|감자|버터/.test(names)) return 0xf0e2c0;
  if (/면|애호박/.test(names)) return 0xe3c98a;
  return 0xcf9f58;
}
