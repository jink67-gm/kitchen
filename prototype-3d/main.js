// 수학 레스토랑 2.0 — 3D 주방 시제품 (1A)
// 독립 실행 파일입니다. 게임 본체(game.js, cloud.js)는 읽지도 고치지도 않습니다.
// 좌표는 game.js와 같은 타일 좌표(가로 18 × 세로 12)를 그대로 써서 1B에서 연결하기 쉽게 했습니다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';

const $ = id => document.getElementById(id);
const W = 18, H = 12;                 // game.js의 W, H와 동일
const TOP = 0.88;                     // 조리대 윗면 높이

// 주방 배치 (시제품 전용 새 구조): 벽을 따라 이어진 조리대 + 가운데 Z자 섬.
// 위·아래 두 통로가 양옆에서만 이어져서, 섬 너머로 재료를 건네는 협동이 생깁니다.
// # 벽  . 바닥  = 빈 조리대  대문자 = 설비 (아래 KIND 참고)
const LAYOUT = [
  '##################',
  '#==LT=KK=PP=HB=S=#',
  '#=..............=#',
  '#M..............I#',
  '#=..............=#',
  '#F...==RR=......D#',
  '#=.......====...=#',
  '#Y..............=#',
  '#=..............=#',
  '#=..............X#',
  '#..=OO==VV==ZZ=..#',
  '##################'
];
const KIND = {
  '=': ['counter', '조리대'], S: ['sink', '싱크대'], K: ['cut', '도마'], P: ['plate', '플레이팅대'], O: ['cook', '화덕'], V: ['serve', '서빙 벨'],
  Z: ['mix', '믹서'], R: ['storage', '보관대'], X: ['trash', '쓰레기통'],
  L: ['bin', '양상추', 'lettuce'], T: ['bin', '토마토', 'tomato'], H: ['bin', '치즈', 'cheese'], B: ['bin', '빵', 'bread'], M: ['bin', '고기', 'meat'],
  F: ['bin', '밀가루', 'flour'], Y: ['bin', '딸기', 'berry'], I: ['bin', '우유', 'milk'], D: ['bin', '반죽', 'dough']
};
const STATIONS = [];
{
  const seen = {};
  LAYOUT.forEach((row, y) => [...row].forEach((ch, x) => {
    const k = KIND[ch]; if (!k) return;
    const s = { x, y, type: k[0], label: k[1], food: k[2] };
    seen[ch] = (seen[ch] || 0) + 1;
    if (seen[ch] === 1 && 'KPO'.includes(ch)) s.demo = true;     // 샘플 재료를 올려둘 설비
    if (ch === 'R') s.part = seen[ch] - 1;
    STATIONS.push(s);
  }));
}
const blocked = new Set(STATIONS.map(s => s.x + ',' + s.y));
// game.js의 walkable()과 같은 규칙
function walkable(x, y) {
  if (x < 1.1 || x > W - 1.1 || y < 1.1 || y > H - 1.1) return false;
  const r = 0.29;
  for (const sx of [-r, r]) for (const sy of [-r, r]) if (blocked.has(Math.floor(x + sx) + ',' + Math.floor(y + sy))) return false;
  return true;
}
const wx = gx => gx - W / 2, wz = gy => gy - H / 2;   // 타일 좌표 → 3D 좌표

// ───────── 렌더러 ─────────
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('fail').classList.remove('hidden');
  throw e;
}
let pixelCap = 1.5, quality = '보통';
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24223f);
scene.fog = new THREE.Fog(0x24223f, 34, 60);

// 고정 쿼터뷰 카메라
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
const CAM_ANGLE = THREE.MathUtils.degToRad(56);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needH = H * Math.sin(CAM_ANGLE) + 3.9, needW = W + 1.2;
  const dist = Math.max(needH / 2 / t, needW / 2 / t / camera.aspect);
  camera.position.set(0, Math.sin(CAM_ANGLE) * dist, Math.cos(CAM_ANGLE) * dist - 0.3);
  camera.lookAt(0, 0.4, -0.3);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ───────── 조명 ─────────
scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8f84c9, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
sun.position.set(-7, 14, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 2, far: 34 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
scene.add(sun);

// ───────── 재질·도형 도우미 ─────────
const matCache = new Map();
function mat(color, rough = 0.75, extra) {
  const key = color + '|' + rough;
  if (!extra && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  if (!extra) matCache.set(key, m);
  return m;
}
const geoCache = new Map();
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const rbox = (w, h, d, r = 0.05) => geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const cyl = (rt, rb, h, seg = 20) => geo(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sph = (r, ws = 18, hs = 12) => geo(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
function add(parent, g, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true;
  parent.add(o);
  return o;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

// 모눈종이 바닥 (2×2 타일 무늬)
const floorTex = canvasTex(512, 512, (g, s) => {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = i * 256, y = j * 256;
    g.fillStyle = (i + j) % 2 ? '#fff8e8' : '#eaf6ee'; g.fillRect(x, y, 256, 256);
    g.strokeStyle = (i + j) % 2 ? '#f0e2c4' : '#cfe6d8'; g.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      g.beginPath(); g.moveTo(x + k * 64, y); g.lineTo(x + k * 64, y + 256); g.stroke();
      g.beginPath(); g.moveTo(x, y + k * 64); g.lineTo(x + 256, y + k * 64); g.stroke();
    }
    g.strokeStyle = '#b9d9c8'; g.lineWidth = 5; g.strokeRect(x, y, 256, 256);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(8, 5);
// 자 눈금 조리대 윗면
const rulerTex = canvasTex(256, 256, (g, s) => {
  g.fillStyle = '#fff6e0'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#c9a877'; g.lineWidth = 4;
  for (let i = 0; i <= 10; i++) { const x = i * s / 10; g.beginPath(); g.moveTo(x, s); g.lineTo(x, s - (i % 5 ? 22 : 42)); g.stroke(); }
  g.strokeStyle = '#ecd9b8'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
});
const M = {
  top: mat(0xffffff, 0.55, { map: rulerTex }), wood: mat(0xd9a66b), woodDark: mat(0xb07d48), steel: mat(0xc3c9d6, 0.3, { metalness: 0.6 }),
  dark: mat(0x3b3558, 0.6), white: mat(0xffffff, 0.35), lav: mat(0xb9aee8), coral: mat(0xff8f7a), mint: mat(0x8ed8c0), gold: mat(0xffd66b, 0.3, { metalness: 0.5 })
};

const world = new THREE.Group();     // 움직이지 않는 것들
scene.add(world);

// ───────── 바닥과 벽 ─────────
const floor = add(world, new THREE.PlaneGeometry(16, 10), mat(0xffffff, 0.85, { map: floorTex }), 0, 0, 0, false);
floor.rotation.x = -Math.PI / 2;
add(world, new THREE.BoxGeometry(W + 0.4, 0.5, H + 0.4), mat(0x4a3f78), 0, -0.26, 0);
const wallM = mat(0x9b8fdc, 0.9), trimM = mat(0xfff6e0, 0.7);
function wall(x0, y0, x1, y1, h) {   // 타일 범위(끝 포함)를 벽으로
  const w = x1 - x0 + 1, d = y1 - y0 + 1, cx = wx((x0 + x1 + 1) / 2), cz = wz((y0 + y1 + 1) / 2);
  add(world, new THREE.BoxGeometry(w, h, d), wallM, cx, h / 2, cz);
  add(world, new THREE.BoxGeometry(w + 0.06, 0.12, d + 0.06), trimM, cx, h + 0.06, cz);
}
wall(0, 0, 17, 0, 2.7); wall(0, 1, 0, 10, 0.7); wall(17, 1, 17, 10, 0.7); wall(0, 11, 17, 11, 0.45);
// 뒷벽: 칠판과 창문
const boardTex = canvasTex(1024, 320, (g, w, h) => {
  g.fillStyle = '#2f5d50'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffffee'; g.textBaseline = 'middle';
  g.font = `bold 64px ${FONT}`; g.fillText('오늘의 수학 메뉴', 40, 70);
// 분수는 분자 위·분모 아래 세로 모양으로 그림
  const frac = (x, n, d) => { g.font = `bold 62px ${FONT}`; g.textAlign = 'center'; g.fillText(n, x, 165); g.fillText(d, x, 240); g.fillRect(x - 30, 198, 60, 7); g.textAlign = 'left'; };
  g.fillStyle = '#ffe08a'; frac(80, '3', '4'); frac(250, '1', '2');
  g.font = `bold 84px ${FONT}`; g.fillText('÷', 135, 203); g.fillText('= ?', 310, 203);
  g.fillStyle = '#ffb3a6'; g.fillText('3 : 4 = 6 : □', 520, 203);
  g.strokeStyle = '#bfe8d8'; g.lineWidth = 6; g.beginPath(); g.arc(900, 80, 50, 0, 7); g.moveTo(900, 80); g.lineTo(950, 80); g.stroke();
  g.font = `bold 40px ${FONT}`; g.fillStyle = '#bfe8d8'; g.fillText('r', 915, 60);
});
const backZ = wz(1) + 0.001;
add(world, new THREE.BoxGeometry(6.4, 1.5, 0.08), M.wood, 0, 1.75, backZ, false);
add(world, new THREE.PlaneGeometry(6.1, 1.25), mat(0xffffff, 0.9, { map: boardTex }), 0, 1.75, backZ + 0.045, false);
for (const cx of [-6.2, 6.2]) {
  add(world, new THREE.BoxGeometry(2.2, 1.3, 0.08), trimM, cx, 1.75, backZ, false);
  add(world, new THREE.PlaneGeometry(1.95, 1.05), mat(0xbfe9ff, 0.2, { emissive: 0x8fd6ff, emissiveIntensity: 0.55 }), cx, 1.75, backZ + 0.045, false);
  add(world, new THREE.BoxGeometry(0.07, 1.05, 0.02), trimM, cx, 1.75, backZ + 0.05, false);
  add(world, new THREE.BoxGeometry(1.95, 0.07, 0.02), trimM, cx, 1.75, backZ + 0.05, false);
}

// ───────── 재료 모형 ─────────
function food(kind, state) {
  const g = new THREE.Group();
  if (kind === 'lettuce') {
    add(g, sph(0.17), mat(0x7cc65a), 0, 0.14).scale.y = 0.82;
    for (let i = 0; i < 3; i++) { const l = add(g, sph(0.15), mat(0xa9e07c), Math.cos(i * 2.1) * 0.06, 0.17, Math.sin(i * 2.1) * 0.06); l.scale.set(1, 0.6, 0.75); l.rotation.y = i * 2.1; }
  } else if (kind === 'tomato') {
    add(g, sph(0.15), mat(0xf0483e, 0.35), 0, 0.125).scale.y = 0.85;
    add(g, geo('leaf', () => new THREE.ConeGeometry(0.08, 0.03, 5)), mat(0x4fa84a), 0, 0.26);
  } else if (kind === 'meat') {
    const cooked = state === 'cooked';
    add(g, rbox(0.34, 0.09, 0.24, 0.04), mat(cooked ? 0x8a5433 : 0xe5596a, 0.5), 0, 0.05);
    add(g, rbox(0.08, 0.095, 0.24, 0.04), mat(cooked ? 0xd9b98a : 0xfff0ee, 0.5), -0.15, 0.05);
  } else if (kind === 'flour') {
    add(g, rbox(0.28, 0.3, 0.2, 0.07), mat(0xf6ead2), 0, 0.15);
    add(g, cyl(0.07, 0.05, 0.08, 10), mat(0xf6ead2), 0, 0.33);
    add(g, rbox(0.2, 0.12, 0.21, 0.02), mat(0x7fa8ff), 0, 0.15);
  } else if (kind === 'berry') {
    add(g, geo('berry', () => new THREE.ConeGeometry(0.12, 0.22, 14)), mat(0xf23f5f, 0.4), 0, 0.12).rotation.x = Math.PI;
    add(g, geo('leaf', () => new THREE.ConeGeometry(0.08, 0.03, 5)), mat(0x4fa84a), 0, 0.24);
  } else if (kind === 'cheese') {
    const c = add(g, geo('cheese', () => new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12, 1, false, 0, Math.PI / 3)), mat(0xffc93c, 0.5), -0.07, 0.08, -0.12);
    c.material.side = THREE.DoubleSide;
  } else if (kind === 'bread') {
    add(g, cyl(0.17, 0.15, 0.06), mat(0xe2a85c), 0, 0.03);
    if (state !== 'bottom') add(g, geo('bun', () => new THREE.SphereGeometry(0.18, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0xd9903f, 0.5), 0, 0.07).scale.y = 0.7;
  } else if (kind === 'milk') {
    add(g, rbox(0.17, 0.26, 0.17, 0.02), mat(0xffffff, 0.4), 0, 0.13);
    add(g, rbox(0.175, 0.1, 0.175, 0.02), mat(0x6fb4ff, 0.4), 0, 0.12);
    const r = add(g, geo('roof', () => new THREE.ConeGeometry(0.125, 0.09, 4)), mat(0xffffff, 0.4), 0, 0.3); r.rotation.y = Math.PI / 4;
  } else if (kind === 'dough') {
    add(g, sph(0.18), mat(0xf5deb0, 0.85), 0, 0.09).scale.y = 0.5;
  }
  return g;
}

// ───────── 설비 ─────────
const BODY = { counter: M.lav, bin: M.wood, cut: M.lav, cook: M.dark, mix: M.mint, plate: M.lav, serve: M.coral, storage: M.woodDark, sink: M.steel, trash: M.dark };
const anchors = {};      // HTML 표시가 따라다닐 3D 위치
const anim = {};         // 움직이는 부품

function plateModel(parent, y) {
  add(parent, cyl(0.3, 0.2, 0.04, 24), M.white, 0, y + 0.02);
  add(parent, geo('rim', () => new THREE.TorusGeometry(0.29, 0.015, 6, 24)), mat(0x9fd8ff, 0.4), 0, y + 0.04).rotation.x = Math.PI / 2;
}

function buildStation(s) {
  const g = new THREE.Group();
  g.position.set(wx(s.x + 0.5), 0, wz(s.y + 0.5));
  world.add(g);
  s.group = g;
  if (s.type !== 'trash') {
    add(g, rbox(0.96, 0.8, 0.96, 0.06), BODY[s.type], 0, 0.4);
    add(g, rbox(1, 0.09, 1, 0.035), s.type === 'cook' || s.type === 'sink' ? M.steel : s.type === 'bin' || s.type === 'storage' ? M.wood : M.top, 0, TOP - 0.045);
  }
  // 앞면 이름표
  const y = TOP;
  if (s.type === 'bin') {               // 재료 상자: 테두리 + 재료 더미
    for (const [bx, bz, bw, bd] of [[0, -0.42, 0.92, 0.08], [0, 0.42, 0.92, 0.08], [-0.42, 0, 0.08, 0.84], [0.42, 0, 0.08, 0.84]]) add(g, rbox(bw, 0.2, bd, 0.02), M.woodDark, bx, y + 0.1, bz);
    [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.19], [0.19, 0.19], [0, 0.02]].forEach(([fx, fz], i) => {
      const f = food(s.food); f.position.set(fx, y + (i === 4 ? 0.14 : 0.01), fz); f.rotation.y = i * 1.3; f.scale.setScalar(i === 4 ? 1.1 : 0.95); g.add(f);
    });
  } else if (s.type === 'cut') {        // 도마 + 칼
    add(g, rbox(0.74, 0.06, 0.52, 0.025), mat(0xe9bd82), 0, y + 0.03, 0.02);
    const knife = new THREE.Group(); knife.userData.dynamic = true; knife.position.set(0.24, y + 0.075, 0.05); g.add(knife);
    add(knife, rbox(0.07, 0.015, 0.32, 0.005), M.steel, 0, 0, -0.08);
    add(knife, rbox(0.05, 0.035, 0.16, 0.015), M.dark, 0, 0.005, 0.16);
    if (s.demo) {                       // 손질 중인 토마토: 반쪽 + 조각
      const t = food('tomato'); t.position.set(-0.14, y + 0.06, 0); g.add(t);
      for (let i = 0; i < 3; i++) add(g, cyl(0.12, 0.12, 0.03, 16), mat(0xf7766c, 0.4), 0.02 + i * 0.045, y + 0.08 + i * 0.012, 0.1 - i * 0.05).rotation.z = 0.5;
      anim.knife = knife; anchors.cut = new THREE.Vector3(g.position.x, y + 0.95, g.position.z);
    }
  } else if (s.type === 'cook') {       // 화덕 + 팬
    add(g, cyl(0.3, 0.3, 0.03, 24), M.dark, 0, y + 0.015);
    const fire = add(g, geo('ring', () => new THREE.TorusGeometry(0.2, 0.035, 8, 24)), mat(0xff7a3c, 0.5, { emissive: 0xff5a1f, emissiveIntensity: s.demo ? 2 : 0.25 }), 0, y + 0.035, 0, false);
    fire.rotation.x = Math.PI / 2;
    add(g, cyl(0.32, 0.26, 0.09, 24), mat(0x4b4860, 0.4, { metalness: 0.5 }), 0, y + 0.1);
    add(g, cyl(0.29, 0.25, 0.02, 24), mat(0x2b293a, 0.5), 0, y + 0.14, 0, false);
    const handle = add(g, rbox(0.34, 0.04, 0.07, 0.015), M.woodDark, 0.44, y + 0.12, 0.12); handle.rotation.y = -0.3;
    for (const kx of [-0.25, 0.25]) add(g, cyl(0.05, 0.05, 0.04, 12), M.coral, kx, 0.62, 0.49).rotation.x = Math.PI / 2;
    if (s.demo) {
      const meat = food('meat'); meat.position.set(0, y + 0.15, 0); g.add(meat);
      anim.meat = meat.children[0].material = mat(0xe5596a, 0.5, {});
      anim.fire = fire.material;
      const glow = new THREE.PointLight(0xff8a3c, 2.5, 4, 1.6); glow.position.set(0, y + 0.5, 0.2); g.add(glow); anim.glow = glow;
      anim.steam = [];
      const sm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
      for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(sph(0.07, 8, 6), sm.clone()); p.userData.t = i / 6; p.userData.dynamic = true; g.add(p); anim.steam.push(p); }
      anim.steamY = y + 0.25;
      anchors.stove = new THREE.Vector3(g.position.x, y + 1.15, g.position.z);
    }
  } else if (s.type === 'mix') {        // 믹서
    add(g, cyl(0.2, 0.25, 0.16), M.coral, 0, y + 0.08);
    add(g, cyl(0.2, 0.15, 0.36, 20), mat(0xdff3ff, 0.1, { transparent: true, opacity: 0.55 }), 0, y + 0.34, 0, false);
    add(g, cyl(0.21, 0.21, 0.05), M.dark, 0, y + 0.54);
    add(g, cyl(0.04, 0.04, 0.03, 12), M.gold, 0, y + 0.07, 0.24).rotation.x = Math.PI / 2;
  } else if (s.type === 'plate') {      // 플레이팅대
    plateModel(g, y);
    if (s.demo) {                       // 접시 위 빵 + 고기가 실제로 보임
      const b = food('bread', 'bottom'); b.position.y = y + 0.04; g.add(b);
      const m = food('meat', 'cooked'); m.position.y = y + 0.1; m.scale.setScalar(0.9); g.add(m);
    }
  } else if (s.type === 'serve') {      // 서빙 벨
    add(g, rbox(0.7, 0.02, 0.7, 0.01), M.white, 0, y + 0.01);
    add(g, cyl(0.15, 0.15, 0.03), M.dark, 0.26, y + 0.035, -0.26);
    add(g, geo('bell', () => new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.gold, 0.26, y + 0.05, -0.26);
    add(g, sph(0.03, 8, 6), M.gold, 0.26, y + 0.19, -0.26);
  } else if (s.type === 'storage') {    // 보관대: 두 칸에 걸쳐 5칸
    const slots = s.part === 0 ? [-0.3, 0.1, 0.5] : [-0.1, 0.3];
    for (const sx of slots) add(g, rbox(0.34, 0.03, 0.6, 0.012), mat(0xfff6e0), sx, y + 0.015, 0);
    if (s.part === 0) { const f = food('cheese'); f.position.set(-0.3, y + 0.03, 0); g.add(f); }
  } else if (s.type === 'sink') {       // 싱크대
    add(g, rbox(0.76, 0.05, 0.6, 0.02), M.dark, 0, y - 0.01, 0.06);
    add(g, rbox(0.7, 0.02, 0.54, 0.01), mat(0x7fd0ff, 0.1, { transparent: true, opacity: 0.85 }), 0, y + 0.012, 0.06, false);
    add(g, cyl(0.03, 0.03, 0.3, 10), M.steel, 0, y + 0.15, -0.36);
    add(g, cyl(0.025, 0.025, 0.2, 10), M.steel, 0, y + 0.29, -0.27).rotation.x = Math.PI / 2;
    for (let i = 0; i < 2; i++) add(g, cyl(0.2, 0.14, 0.035, 20), M.white, 0.12, y + 0.05 + i * 0.04, 0.1);
  } else if (s.type === 'trash') {      // 쓰레기통
    add(g, cyl(0.4, 0.33, 0.78, 20), mat(0x6f6a8c), 0, 0.39);
    add(g, cyl(0.42, 0.42, 0.06, 20), M.dark, 0, 0.8);
    add(g, cyl(0.3, 0.3, 0.02, 20), mat(0x1d1b2e), 0, 0.835, 0, false);
  }
}
STATIONS.forEach(buildStation);
mergeStatic(world);

// 움직이지 않는 메시를 재질별로 하나로 합칩니다 → 그리기 횟수가 수백 회에서 수십 회로 줄어 저사양 PC에 유리
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), done = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    for (let q = o; q && q !== root; q = q.parent) if (q.userData.dynamic) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(o);
    done.push(o);
  });
  for (const o of done) o.parent.remove(o);
  for (const b of buckets.values()) {
    const parts = b.list.map(o => { const gm = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); gm.applyMatrix4(o.matrixWorld); return gm; });
    const n = parts.reduce((a, gm) => a + gm.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let k = 0;
    for (const gm of parts) {
      const c = gm.attributes.position.count;
      pos.set(gm.attributes.position.array, k * 3); nor.set(gm.attributes.normal.array, k * 3);
      if (gm.attributes.uv) uv.set(gm.attributes.uv.array, k * 2);
      k += c; gm.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
}

// 상호작용 대상 강조
const focusRing = new THREE.Mesh(rbox(1.08, 0.06, 1.08, 0.03), new THREE.MeshBasicMaterial({ color: 0xffdf6b, transparent: true, opacity: 0.6, depthWrite: false }));
focusRing.visible = false; scene.add(focusRing);

// ───────── 셰프 ─────────
function buildChef(color) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const skin = mat(0xffd2ad, 0.6), coat = mat(0xffffff, 0.6), accent = mat(color, 0.6);
  add(body, cyl(0.2, 0.28, 0.44, 20), coat, 0, 0.36);                                   // 몸통
  add(body, rbox(0.3, 0.3, 0.06, 0.03), accent, 0, 0.32, 0.2).rotation.x = -0.18;       // 앞치마 (앞면에만)
  add(body, rbox(0.13, 0.1, 0.03, 0.01), mat(0xfff6e0), 0, 0.3, 0.245).rotation.x = -0.18; // 주머니
  add(body, cyl(0.215, 0.225, 0.07, 20), accent, 0, 0.58);                              // 스카프
  add(body, sph(0.07, 10, 8), accent, 0, 0.56, -0.22);                                  // 스카프 매듭 (뒷면)
  add(body, sph(0.25, 22, 16), skin, 0, 0.86);                                          // 머리
  add(body, cyl(0.21, 0.2, 0.17, 20), coat, 0, 1.11);                                   // 모자 띠
  add(body, sph(0.25, 18, 12), coat, 0, 1.26).scale.y = 0.68;                           // 모자 윗부분
  for (const ex of [-0.09, 0.09]) {
    add(body, sph(0.035, 10, 8), M.dark, ex, 0.89, 0.225);                              // 눈
    add(body, sph(0.045, 10, 8), mat(0xffa3a3), ex * 1.8, 0.81, 0.19).scale.set(1, 0.6, 0.5); // 볼
  }
  add(body, rbox(0.07, 0.025, 0.02, 0.008), mat(0xc4594f), 0, 0.79, 0.24);              // 입
  const handL = add(body, sph(0.08, 12, 8), skin, -0.31, 0.4, 0.06), handR = add(body, sph(0.08, 12, 8), skin, 0.31, 0.4, 0.06);
  const footL = add(root, sph(0.1, 12, 8), M.dark, -0.12, 0.07, 0.03), footR = add(root, sph(0.1, 12, 8), M.dark, 0.12, 0.07, 0.03);
  footL.scale.set(1, 0.7, 1.45); footR.scale.set(1, 0.7, 1.45);
  const carry = new THREE.Group(); carry.position.set(0, 0.42, 0.34); body.add(carry);  // 들고 있는 재료 자리
  scene.add(root);
  return { root, body, handL, handR, footL, footR, carry };
}
const chef = buildChef(0xe77e95);
const player = { x: 7, y: 7, dx: 0, dy: 1, angle: 0, walk: 0, moving: false, held: '', hop: 0 };
const SPEED = 4.2;

// ───────── 입력 ─────────
const keys = new Set();
const KEY = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
addEventListener('keydown', e => {
  if (KEY[e.code]) { keys.add(KEY[e.code]); e.preventDefault(); }
  if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) { e.preventDefault(); interact(); }
});
addEventListener('keyup', e => keys.delete(KEY[e.code]));
addEventListener('blur', () => keys.clear());

let focus = null;
function nearestStation() {          // game.js와 같은 규칙
  let best = null, dist = 1.55;
  for (const s of STATIONS) { const d = Math.hypot(s.x + 0.5 - player.x, s.y + 0.5 - player.y); if (d < dist) { dist = d; best = s; } }
  return best;
}
// 시제품용 맛보기: 재료 상자에서 집기 / 같은 상자에 돌려놓기만 됩니다 (실제 규칙은 1B부터)
function interact() {
  player.hop = 1;
  if (!focus || focus.type !== 'bin') return;
  if (!player.held) { player.held = focus.food; chef.carry.add(food(focus.food)); }
  else if (player.held === focus.food) { player.held = ''; chef.carry.clear(); }
}

function update(dt) {
  let ix = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), iy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
  player.moving = !!(ix || iy);
  if (player.moving) {
    const len = Math.hypot(ix, iy); ix /= len; iy /= len;
    player.dx = ix; player.dy = iy;
    const nx = player.x + ix * SPEED * dt, ny = player.y + iy * SPEED * dt;   // 시간 기준 이동: 느린 PC도 같은 속도
    if (walkable(nx, player.y)) player.x = nx;
    if (walkable(player.x, ny)) player.y = ny;
    player.walk += dt * 13;
  }
  const target = Math.atan2(player.dx, player.dy);
  player.angle += Math.atan2(Math.sin(target - player.angle), Math.cos(target - player.angle)) * Math.min(1, dt * 14);
  player.hop = Math.max(0, player.hop - dt * 4);
  focus = nearestStation();
}

let stoveT = 0;
function animate(t, dt) {
  const a = player.moving ? 1 : 0, s = Math.sin(player.walk);
  chef.root.position.set(wx(player.x), 0, wz(player.y));
  chef.root.rotation.y = player.angle;
  chef.body.position.y = a * Math.abs(s) * 0.055 + (1 - a) * Math.sin(t * 2.4) * 0.012 + Math.sin(player.hop * Math.PI) * 0.12;
  chef.body.rotation.x = a * 0.1;
  chef.footL.position.z = 0.03 + a * s * 0.14; chef.footR.position.z = 0.03 - a * s * 0.14;
  const carrying = !!player.held;
  chef.handL.position.set(carrying ? -0.16 : -0.31, carrying ? 0.44 : 0.4, carrying ? 0.3 : 0.06 - a * s * 0.13);
  chef.handR.position.set(carrying ? 0.16 : 0.31, carrying ? 0.44 : 0.4, carrying ? 0.3 : 0.06 + a * s * 0.13);

  focusRing.visible = !!focus;
  if (focus) { focusRing.position.set(wx(focus.x + 0.5), focus.type === 'trash' ? 0.84 : TOP - 0.04, wz(focus.y + 0.5)); focusRing.material.opacity = 0.45 + Math.sin(t * 6) * 0.15; }

  // 화덕 샘플: 굽기(8초) → 타기 경고(3초) 반복
  stoveT = (stoveT + dt) % 11;
  const prog = Math.min(1, stoveT / 8), warn = stoveT > 8;
  anim.meat.color.setHex(0xe5596a).lerp(new THREE.Color(warn ? 0x3a2418 : 0x8a5433), warn ? (stoveT - 8) / 3 : prog);
  anim.fire.emissiveIntensity = 1.8 + Math.sin(t * 17) * 0.4;
  anim.glow.intensity = 2.3 + Math.sin(t * 13) * 0.5;
  for (const p of anim.steam) {
    p.userData.t = (p.userData.t + dt * 0.45) % 1;
    const k = p.userData.t;
    p.position.set(Math.sin(k * 9 + p.id) * 0.08, anim.steamY + k * 0.7, Math.cos(k * 7 + p.id) * 0.06);
    p.scale.setScalar(0.6 + k * 1.3); p.material.opacity = (1 - k) * 0.45; p.material.color.setHex(warn ? 0x6b6478 : 0xffffff);
  }
  const gs = $('gaugeStove');
  gs.classList.toggle('warn', warn);
  gs.firstElementChild.textContent = warn ? '🔥 탄다! 꺼내요' : '🥩 굽는 중';
  gs.querySelector('b').style.width = (warn ? 100 : prog * 100) + '%';
  // 도마 샘플: 칼이 까딱까딱
  anim.knife.rotation.z = Math.max(0, Math.sin(t * 9)) * 0.35;
  anim.knife.position.y = TOP + 0.075 + Math.max(0, Math.sin(t * 9)) * 0.08;
}

// HTML 표시를 3D 위치에 붙이기
const v = new THREE.Vector3();
function place(el, pos, show = true) {
  v.copy(pos).project(camera);
  el.style.display = show ? '' : 'none';
  if (show) el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - v.y) / 2 * innerHeight).toFixed(1)}px)`;
}
const tmp = new THREE.Vector3();
function placeAnchors() {
  place($('nameTag'), tmp.set(wx(player.x), 1.62, wz(player.y)));
  place($('gaugeStove'), anchors.stove);
  place($('gaugeCut'), anchors.cut);
  const hint = $('hint');
  if (focus) hint.lastElementChild.textContent = focus.type === 'bin' ? (player.held === focus.food ? focus.label + ' 돌려놓기' : focus.label + ' 집기') : focus.label;
  place(hint, focus ? tmp.set(wx(focus.x + 0.5), TOP + 0.75, wz(focus.y + 0.5)) : tmp, !!focus && focus !== STATIONS.find(s => s.demo && s.type === 'cook') && focus !== STATIONS.find(s => s.demo && s.type === 'cut'));
}

// ───────── 루프, 성능 측정, 자동 화질 조절 ─────────
const perf = { fps: 0, min: Infinity, frames: 0, acc: 0, slow: 0, samples: 0 };
let last = performance.now(), clock = 165;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, total = Math.min(0.25, raw);
  last = now;
  const steps = Math.ceil(total / 0.05) || 1, dt = total / steps;
  for (let i = 0; i < steps; i++) update(dt);   // 느린 PC: 여러 번 나눠 계산해 이동 속도를 똑같이 유지
  animate(now / 1000, total); placeAnchors();
  renderer.render(scene, camera);

  clock = clock - dt <= 0 ? 165 : clock - dt;
  perf.frames++; perf.acc += raw;
  if (perf.acc >= 0.5) {
    perf.fps = Math.round(perf.frames / perf.acc); perf.frames = 0; perf.acc = 0;
    if (++perf.samples > 3) perf.min = Math.min(perf.min, perf.fps);
    // 3초 연속 28FPS 미만이면 화질을 한 단계 낮춤
    perf.slow = perf.fps < 28 && perf.samples > 3 ? perf.slow + 1 : 0;
    if (perf.slow >= 6 && quality !== '낮음') {
      quality = '낮음'; pixelCap = 1; renderer.shadowMap.enabled = false; sun.castShadow = false; anim.glow.visible = false;
      scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      resize(); perf.min = Infinity; perf.samples = 0;
    }
    const i = renderer.info.render, m = Math.floor(clock / 60), sec = Math.floor(clock % 60);
    $('timer').textContent = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    $('perf').innerHTML = `${perf.fps} FPS · 최저 ${perf.min === Infinity ? '-' : perf.min}<br>${canvas.width}×${canvas.height} · 그리기 ${i.calls}회 · 삼각형 ${(i.triangles / 1000).toFixed(1)}천<br>화질: ${quality}`;
  }
}
requestAnimationFrame(frame);

// 자동 테스트용
window.__proto3d = { player, keys, walkable, perf, renderer, STATIONS, get focus() { return focus; }, get quality() { return quality; } };
