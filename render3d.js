// 3D 렌더링 어댑터 (1B)
// 게임 규칙·점수·수학·Firebase는 전혀 모릅니다. game.js가 매 프레임 넘겨주는 "상태"를 그리기만 합니다.
// 상태 형식: { chefs:[{id,x,y,held,name,seat,mine}], focus:설비|null, tray:{재료:true}, particles:[{x,y,life,color}], dim:boolean }
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';
import { clone as cloneSkinned } from './vendor/three/jsm/utils/SkeletonUtils.js';

const TOP = 0.88;                                   // 조리대 윗면 높이
const SEAT_COLOR = [0xe77e95, 0x56c5dd, 0xfac268, 0x9d88e9, 0x63c49b];   // game.js의 COLOR와 같은 순서
const FONT = 'Galmuri11,"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';   // 갈무리11 (OFL) → 없으면 기기 글꼴

export function createRenderer3D(canvas, { W, H, stations, foods, icons = {}, models = new Map() }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });   // WebGL 불가면 여기서 예외 → game.js가 2D로 전환
  let pixelCap = 1.5, quality = 'normal', cw = 0, ch = 0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const wx = gx => gx - W / 2, wz = gy => gy - H / 2;   // 타일 좌표 → 3D 좌표
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2622);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
  const CAM_ANGLE = THREE.MathUtils.degToRad(56);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === cw && h === ch)) return;
    cw = w; ch = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needH = H * Math.sin(CAM_ANGLE) + 5.4, needW = W + 1.2;
    const dist = Math.max(needH / 2 / t, needW / 2 / t / camera.aspect);
    camera.position.set(0, Math.sin(CAM_ANGLE) * dist, Math.cos(CAM_ANGLE) * dist - 1.1);
    camera.lookAt(0, 0.4, -1.1);
    camera.updateProjectionMatrix();
  }

  // ───────── 조명 ─────────
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0x8f84c9, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
  sun.position.set(-7, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 2, far: 34 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun);

  // ───────── 재질·도형 도우미 ─────────
  const matCache = new Map(), geoCache = new Map();
  function mat(color, rough = 0.75, extra) {
    const key = color + '|' + rough;
    if (!extra && matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
    if (!extra) matCache.set(key, m);
    return m;
  }
  const geo = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
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
  // 식당 주방 바닥: 크림색과 살구색 체크 타일
  const floorTex = canvasTex(512, 512, g => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = i * 256, y = j * 256;
      g.fillStyle = (i + j) % 2 ? '#f6ecdd' : '#e9c9a8'; g.fillRect(x, y, 256, 256);
      g.fillStyle = (i + j) % 2 ? '#fbf4e8' : '#efd3b6'; g.fillRect(x + 10, y + 10, 236, 236);     // 타일 가운데를 살짝 밝게
      g.strokeStyle = '#cfb596'; g.lineWidth = 6; g.strokeRect(x, y, 256, 256);                    // 줄눈
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set((W - 2) / 2, (H - 2) / 2);
  // 조리대 윗면: 밝은 돌 상판
  const rulerTex = canvasTex(256, 256, (g, s) => {
    g.fillStyle = '#f7f3ec'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? '#ece5da' : '#ffffff'; g.fillRect((i * 97) % s, (i * 53) % s, 5, 3); }
    g.strokeStyle = '#ddd3c4'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
  });
  const M = {
    top: mat(0xffffff, 0.55, { map: rulerTex }), wood: mat(0xd9a66b), woodDark: mat(0xb07d48), steel: mat(0xc3c9d6, 0.3, { metalness: 0.6 }),
    dark: mat(0x3b3558, 0.6), white: mat(0xffffff, 0.35), lav: mat(0xb9aee8), coral: mat(0xff8f7a), mint: mat(0x8ed8c0), gold: mat(0xffd66b, 0.3, { metalness: 0.5 })
  };

  const world = new THREE.Group();
  scene.add(world);

  // ───────── 바닥과 벽 ─────────
  add(world, new THREE.PlaneGeometry(W - 2, H - 2), mat(0xffffff, 0.85, { map: floorTex }), 0, 0, 0, false).rotation.x = -Math.PI / 2;
  add(world, new THREE.BoxGeometry(W + 0.4, 0.5, H + 0.4), mat(0x5a4636), 0, -0.26, 0);
  const wallM = mat(0xf1e6d6, 0.9), trimM = mat(0xc9a57a, 0.7);       // 크림색 벽과 나무 몰딩
  function wall(x0, y0, x1, y1, h) {
    const w = x1 - x0 + 1, d = y1 - y0 + 1, cx = wx((x0 + x1 + 1) / 2), cz = wz((y0 + y1 + 1) / 2);
    add(world, new THREE.BoxGeometry(w, h, d), wallM, cx, h / 2, cz);
    add(world, new THREE.BoxGeometry(w + 0.06, 0.12, d + 0.06), trimM, cx, h + 0.06, cz);
  }
  wall(0, 0, W - 1, 0, 2.7); wall(0, 1, 0, H - 2, 0.7); wall(W - 1, 1, W - 1, H - 2, 0.7); wall(0, H - 1, W - 1, H - 1, 0.45);
  const boardTex = canvasTex(1024, 320, (g, w, h) => {
    g.fillStyle = '#2f3b46'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff55'; g.lineWidth = 4; g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = '#ffe08a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 92px ${FONT}`; g.fillText('오늘의 메뉴', w / 2, 110);
    g.fillStyle = '#ffffffdd'; g.font = `bold 50px ${FONT}`; g.fillText('샐러드 · 햄버거 · 케이크 · 피자', w / 2, 225);
  });
  const wallSrc = models.get('station:wall'), winSrc = models.get('station:wallWindow');
  if (wallSrc) for (let x = 0; x < W; x++) {              // Kenney Furniture Kit 벽 패널을 뒷벽 앞면에 이어 붙임
    const isWin = winSrc && [2, 3, 4, 13, 14, 15].includes(x);
    const pm = fitBox(isWin ? winSrc : wallSrc, 1, 2.62, 0.14); pm.position.set(wx(x + 0.5), 0, wz(1) - 0.05); world.add(pm);
  }
  const backZ = wz(1) + 0.03;
  add(world, new THREE.BoxGeometry(6.4, 1.5, 0.08), M.wood, 0, 1.75, backZ, false);
  add(world, new THREE.PlaneGeometry(6.1, 1.25), mat(0xffffff, 0.9, { map: boardTex }), 0, 1.75, backZ + 0.045, false);
  if (!winSrc) for (const cx of [-6.2, 6.2]) {
    add(world, new THREE.BoxGeometry(2.2, 1.3, 0.08), trimM, cx, 1.75, backZ, false);
    add(world, new THREE.PlaneGeometry(1.95, 1.05), mat(0xbfe9ff, 0.2, { emissive: 0x8fd6ff, emissiveIntensity: 0.55 }), cx, 1.75, backZ + 0.045, false);
    add(world, new THREE.BoxGeometry(0.07, 1.05, 0.02), trimM, cx, 1.75, backZ + 0.05, false);
    add(world, new THREE.BoxGeometry(1.95, 0.07, 0.02), trimM, cx, 1.75, backZ + 0.05, false);
  }

  // ───────── 재료 모형 ─────────
  // state: 없음 = 손질 전, 'ready' = 손질/조리 완료 (자른 것은 두 조각, 구운 것은 갈색, 섞은 것은 그릇에)
  function rawFood(kind, cooked) {
    const g = new THREE.Group();
    if (kind === 'lettuce') {
      add(g, sph(0.17), mat(0x7cc65a), 0, 0.14).scale.y = 0.82;
      for (let i = 0; i < 3; i++) { const l = add(g, sph(0.15), mat(0xa9e07c), Math.cos(i * 2.1) * 0.06, 0.17, Math.sin(i * 2.1) * 0.06); l.scale.set(1, 0.6, 0.75); l.rotation.y = i * 2.1; }
    } else if (kind === 'tomato') {
      add(g, sph(0.15), mat(0xf0483e, 0.35), 0, 0.125).scale.y = 0.85;
      add(g, geo('leaf', () => new THREE.ConeGeometry(0.08, 0.03, 5)), mat(0x4fa84a), 0, 0.26);
    } else if (kind === 'meat') {
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
      add(g, geo('cheese', () => new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12, 1, false, 0, Math.PI / 3)), mat(0xffc93c, 0.5, { side: THREE.DoubleSide }), -0.07, 0.08, -0.12);
    } else if (kind === 'bread') {
      add(g, cyl(0.17, 0.15, 0.06), mat(cooked ? 0xc98a3c : 0xe2a85c), 0, 0.03);
      add(g, geo('bun', () => new THREE.SphereGeometry(0.18, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2)), mat(cooked ? 0xb06a24 : 0xd9903f, 0.5), 0, 0.07).scale.y = 0.7;
    } else if (kind === 'milk') {
      add(g, rbox(0.17, 0.26, 0.17, 0.02), mat(0xffffff, 0.4), 0, 0.13);
      add(g, rbox(0.175, 0.1, 0.175, 0.02), mat(0x6fb4ff, 0.4), 0, 0.12);
      add(g, geo('roof', () => new THREE.ConeGeometry(0.125, 0.09, 4)), mat(0xffffff, 0.4), 0, 0.3).rotation.y = Math.PI / 4;
    } else if (kind === 'dough') {
      add(g, sph(0.18), mat(cooked ? 0xe0a85a : 0xf5deb0, 0.85), 0, 0.09).scale.y = cooked ? 0.35 : 0.5;
    }
    return g;
  }
  const MIX_COLOR = { flour: 0xfff3dc, milk: 0xffffff };
  // Kenney Food Kit 모델이 있으면 그것을 쓰고, 없는 재료·상태는 아래의 코드로 만든 모형을 씀
  const MODEL_SIZE = { lettuce: 0.32, tomato: 0.28, meat: 0.34, flour: 0.34, berry: 0.26, cheese: 0.3, bread: 0.34, milk: 0.32, dough: 0.32 };   // 가장 긴 변의 길이 (타일 1칸 = 1)
  const burntM = mat(0x2b2422, 0.95);
  function modelFood(kind, state) {
    const size = MODEL_SIZE[kind] || 0.36, raw = models.get(kind), done = models.get(kind + ':ready');
    const one = (src, k = 1) => { const m = src.clone(); m.scale.setScalar(size * k); return m; };
    if (state === 'burnt') { const src = done || raw; if (!src) return null; const m = one(src); m.traverse(o => { if (o.isMesh) o.material = burntM; }); return m; }
    if (state === 'ready') {
      if (done) return one(done);
      if (raw && foods[kind]?.prep === 'cut') {          // 손질한 모습이 따로 없으면 작은 조각 두 개로
        const g = new THREE.Group();
        for (const s of [-1, 1]) { const h = one(raw, 0.62); h.position.set(s * 0.1, 0, s * 0.03); h.rotation.set(0, s * 0.6, s * 0.35); g.add(h); }
        return g;
      }
      return null;
    }
    return raw ? one(raw) : null;
  }
  function food(kind, state) {
    const mf = modelFood(kind, state);
    if (mf) return mf;
    if (state === 'burnt') { const bg = rawFood(kind, true); bg.traverse(o => { if (o.isMesh) o.material = mat(0x2b2422, 0.95); }); return bg; }   // 탄 재료: 새까맣게
    if (state !== 'ready') return rawFood(kind);
    const prep = foods[kind]?.prep, g = new THREE.Group();
    if (prep === 'cook') g.add(rawFood(kind, true));
    else if (prep === 'mix') {                     // 그릇에 담긴 모습
      add(g, cyl(0.2, 0.12, 0.13, 18), M.mint, 0, 0.065);
      add(g, cyl(0.175, 0.175, 0.02, 18), mat(MIX_COLOR[kind] || 0xfff3dc, 0.6), 0, 0.125);
    } else {                                       // 자른 모습: 작은 조각 두 개
      for (const s of [-1, 1]) { const h = rawFood(kind); h.scale.set(0.62, 0.62, 0.62); h.position.set(s * 0.1, 0, s * 0.03); h.rotation.set(0, s * 0.6, s * 0.5); h.position.y = 0.03; g.add(h); }
    }
    return g;
  }

  // ───────── 설비 ─────────
  const BODY = { counter: M.lav, bin: M.wood, cut: M.lav, cook: M.dark, mix: M.mint, plate: M.lav, serve: M.coral, storage: mat(0xbfe3f5, 0.5), sink: M.steel, trash: M.dark };
  const fires = [], glowPads = [], extraLights = [];
  const coolM = mat(0xdff4ff, 0.3, { emissive: 0x5cc4ff, emissiveIntensity: 0.55 });
  let coolLight = null;
  const boards = new Map();       // 도마별 움직이는 부품
  const storageSlots = [];        // 보관대 5칸의 위치
  let storageN = 0;
  // 설비 위에서 바뀌는 것들(올려둔 재료, 게이지, 상태 글자). 병합하지 않고 매 프레임 게임 상태를 따라감
  function dynParts(g, s, sx, sy, sz, extra) {
    const spot = new THREE.Group(); spot.userData.dynamic = true; spot.position.set(sx, sy, sz); g.add(spot);
    const bar = new THREE.Group(); bar.userData.dynamic = true; bar.position.set(0, TOP + 1.3, 0); bar.visible = false; g.add(bar);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x3b3558, depthTest: false })); bg.renderOrder = 18; bar.add(bg);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false })); fill.renderOrder = 19; fill.position.z = 0.001; bar.add(fill);
    const v = { spot, spotY: sy, bar, fill, key: '', count: 0, swing: -1e9, label: null, labelText: '', g, type: s.type, ...extra };
    boards.set(s.x + ',' + s.y, v);
    return v;
  }
  // 모델을 주어진 크기의 칸에 꼭 맞게 넣음 (바닥은 y=0, 가운데 정렬)
  function fitBox(src, w, h, d) {
    const m = src.clone(), wrap = new THREE.Group(); wrap.add(m);
    const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -b.min.y, -c.z);
    wrap.scale.set(w / sz.x, h / sz.y, d / sz.z);
    return wrap;
  }
  function buildStation(s) {
    const g = new THREE.Group();
    g.position.set(wx(s.x + 0.5), 0, wz(s.y + 0.5));
    world.add(g);
    const y = TOP;
    const cabSrc = models.get(s.type === 'cook' ? 'station:stove' : s.type === 'sink' ? 'station:sink' : 'station:cabinet');
    const useModel = cabSrc && !['bin', 'storage', 'trash'].includes(s.type);
    if (useModel) g.add(fitBox(cabSrc, 0.98, TOP - (s.type === 'cook' || s.type === 'sink' ? 0 : 0.085), 0.98));     // Kenney 주방 가구
    if (s.type !== 'trash') {
      if (!useModel) add(g, rbox(0.96, 0.8, 0.96, 0.06), BODY[s.type] || M.lav, 0, 0.4);
      if (!(useModel && (s.type === 'cook' || s.type === 'sink')))
      add(g, rbox(1, 0.09, 1, 0.035), s.type === 'cook' || s.type === 'sink' ? M.steel : s.type === 'storage' ? mat(0xe9f7ff, 0.35) : s.type === 'bin' ? M.wood : M.top, 0, TOP - 0.045);
    }
    if (s.type === 'bin') {
      for (const [bx, bz, bw, bd] of [[0, -0.42, 0.92, 0.08], [0, 0.42, 0.92, 0.08], [-0.42, 0, 0.08, 0.84], [0.42, 0, 0.08, 0.84]]) add(g, rbox(bw, 0.2, bd, 0.02), M.woodDark, bx, y + 0.1, bz);
      // 재료 더미: 상자 안쪽(0.76칸) 밖으로 나가지 않게 실제 크기를 재서 맞춤. 2×2로 깔고 가운데 위에 하나
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18], [0, 0]].forEach(([fx, fz], i) => {
        const f = food(s.food), holder = new THREE.Group(); holder.add(f);
        const b = new THREE.Box3().setFromObject(f), sz = b.getSize(new THREE.Vector3());
        holder.scale.setScalar(Math.min(1, (i === 4 ? 0.36 : 0.32) / Math.max(sz.x, sz.z, 1e-6), 0.34 / Math.max(sz.y, 1e-6)));
        holder.position.set(fx, y + (i === 4 ? 0.13 : 0.01), fz); g.add(holder);
      });
    } else if (s.type === 'cut') {
      add(g, rbox(0.74, 0.06, 0.52, 0.025), mat(0xe9bd82), 0, y + 0.03, 0.02);
      // 칼·도마 위 재료·게이지는 움직이므로 병합하지 않음
      const knife = new THREE.Group(); knife.userData.dynamic = true; knife.position.set(0.24, y + 0.075, 0.05); g.add(knife);
      add(knife, rbox(0.07, 0.015, 0.32, 0.005), M.steel, 0, 0, -0.08);
      add(knife, rbox(0.05, 0.035, 0.16, 0.015), M.dark, 0, 0.005, 0.16);
      dynParts(g, s, -0.08, y + 0.06, 0.02, { knife, knifeY: y + 0.075 });
    } else if (s.type === 'cook') {
      if (!useModel) add(g, cyl(0.3, 0.3, 0.03, 24), M.dark, 0, y + 0.015);
      const fm = mat(0xff7a3c, 0.5, { emissive: 0xff5a1f, emissiveIntensity: 0.3 });
      add(g, geo('ring', () => new THREE.TorusGeometry(0.2, 0.035, 8, 24)), fm, 0, y + 0.035, 0, false).rotation.x = Math.PI / 2;
      const smoke = [];
      for (let i = 0; i < 5; i++) { const pm = new THREE.Mesh(sph(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); pm.userData.dynamic = true; pm.userData.k = i / 5; g.add(pm); smoke.push(pm); }
      const glow = new THREE.PointLight(0xff8a3c, 0, 3.4, 1.7); glow.position.set(0, y + 0.55, 0.25); glow.userData.dynamic = true; g.add(glow); extraLights.push(glow);   // 화덕 발광
      dynParts(g, s, 0, y + 0.15, 0, { fire: fm, smoke, glow });
      add(g, cyl(0.32, 0.26, 0.09, 24), mat(0x4b4860, 0.4, { metalness: 0.5 }), 0, y + 0.1);
      add(g, cyl(0.29, 0.25, 0.02, 24), mat(0x2b293a, 0.5), 0, y + 0.14, 0, false);
      add(g, rbox(0.34, 0.04, 0.07, 0.015), M.woodDark, 0.44, y + 0.12, 0.12).rotation.y = -0.3;
      if (!useModel) for (const kx of [-0.25, 0.25]) add(g, cyl(0.05, 0.05, 0.04, 12), M.coral, kx, 0.62, 0.49).rotation.x = Math.PI / 2;
    } else if (s.type === 'mix') {
      const bl = models.get('station:blender');
      if (bl) { const bm = fitBox(bl, 0.5, 0.62, 0.42); bm.position.set(0.14, y, -0.12); g.add(bm); add(g, cyl(0.24, 0.17, 0.16, 20), M.mint, -0.12, y + 0.08, 0.12); }   // 믹서기 + 섞는 그릇
      else {
        add(g, cyl(0.2, 0.25, 0.16), M.coral, 0, y + 0.08);
        add(g, cyl(0.2, 0.15, 0.36, 20), mat(0xdff3ff, 0.1, { transparent: true, opacity: 0.55 }), 0, y + 0.34, 0, false);
        add(g, cyl(0.21, 0.21, 0.05), M.dark, 0, y + 0.54);
      }
      dynParts(g, s, bl ? -0.12 : 0, y + (bl ? 0.1 : 0.2), bl ? 0.12 : 0, {}).mini = 0.6;
    } else if (s.type === 'plate') {
      add(g, rbox(0.8, 0.02, 0.8, 0.01), mat(0xd9f0ff, 0.6), 0, y + 0.01);      // 접시 놓는 자리 표시
      dynParts(g, s, 0, y + 0.02, 0, {});
    } else if (s.type === 'rack') {
      add(g, rbox(0.8, 0.04, 0.8, 0.015), M.wood, 0, y + 0.02);
      dynParts(g, s, 0, y + 0.04, 0, {});
    } else if (s.type === 'serve') {
      const padM = mat(0xfff3c4, 0.4, { emissive: 0xffc94a, emissiveIntensity: 0.5 }); glowPads.push(padM);   // 서빙대 강조: 은은하게 빛나는 받침
      add(g, rbox(0.74, 0.03, 0.74, 0.012), padM, 0, y + 0.015, 0, false);
      add(g, cyl(0.15, 0.15, 0.03), M.dark, 0.26, y + 0.035, -0.26);
      add(g, geo('bell', () => new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.gold, 0.26, y + 0.05, -0.26);
      add(g, sph(0.03, 8, 6), M.gold, 0.26, y + 0.19, -0.26);
    } else if (s.type === 'storage') {
      for (const sx of storageN++ % 2 === 0 ? [-0.3, 0.1, 0.5] : [-0.1, 0.3]) { add(g, rbox(0.34, 0.03, 0.6, 0.012), coolM, sx, y + 0.015, 0, false); storageSlots.push(new THREE.Vector3(g.position.x + sx, y + 0.03, g.position.z)); }
      // 냉장 보관대: 푸른 띠와 푸른 빛
      add(g, rbox(0.9, 0.07, 0.03, 0.01), coolM, 0, 0.66, 0.485, false);
      if (!coolLight) { coolLight = new THREE.PointLight(0x7fd0ff, 1.6, 3.2, 1.8); coolLight.position.set(g.position.x + 0.5, y + 0.7, g.position.z + 0.2); scene.add(coolLight); }
    } else if (s.type === 'sink') {
      if (!useModel) {
        add(g, rbox(0.76, 0.05, 0.6, 0.02), M.dark, 0, y - 0.01, 0.06);
        add(g, rbox(0.7, 0.02, 0.54, 0.01), mat(0x7fd0ff, 0.1, { transparent: true, opacity: 0.85 }), 0, y + 0.012, 0.06, false);
        add(g, cyl(0.03, 0.03, 0.3, 10), M.steel, 0, y + 0.15, -0.36);
        add(g, cyl(0.025, 0.025, 0.2, 10), M.steel, 0, y + 0.29, -0.27).rotation.x = Math.PI / 2;
      }
      dynParts(g, s, 0.05, y + 0.03, 0.08, {});
    } else if (s.type === 'trash') {
      const tc = models.get('station:trash');
      if (tc) g.add(fitBox(tc, 0.72, 0.86, 0.72));
      else {
        add(g, cyl(0.4, 0.33, 0.78, 20), mat(0x6f6a8c), 0, 0.39);
        add(g, cyl(0.42, 0.42, 0.06, 20), M.dark, 0, 0.8);
        add(g, cyl(0.3, 0.3, 0.02, 20), mat(0x1d1b2e), 0, 0.835, 0, false);
      }
    }
  }
  stations.forEach(buildStation);
  mergeStatic(world);

  // 움직이지 않는 메시를 재질별로 하나로 합쳐 그리기 횟수를 줄입니다 (저사양 PC 대책)
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const buckets = new Map(), done = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      for (let q = o; q && q !== root; q = q.parent) if (q.userData.dynamic) return;
      const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
      if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, list: [] });
      buckets.get(key).list.push(o); done.push(o);
    });
    for (const o of done) o.parent.remove(o);
    for (const b of buckets.values()) {
      const parts = b.list.map(o => { const gm = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); gm.applyMatrix4(o.matrixWorld); return gm; });
      const n = parts.reduce((a, gm) => a + gm.attributes.position.count, 0);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let k = 0;
      for (const gm of parts) {
        pos.set(gm.attributes.position.array, k * 3); nor.set(gm.attributes.normal.array, k * 3);
        if (gm.attributes.uv) uv.set(gm.attributes.uv.array, k * 2);
        k += gm.attributes.position.count; gm.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    }
  }

  // ───────── 강조 표시, E 표시, 색종이 ─────────
  const focusRing = new THREE.Mesh(rbox(1.08, 0.06, 1.08, 0.03), new THREE.MeshBasicMaterial({ color: 0xffdf6b, transparent: true, opacity: 0.6, depthWrite: false }));
  focusRing.visible = false; scene.add(focusRing);
  function textSprite(text, bg, fg, scale, cw = 256) {
    const tex = canvasTex(cw, 80, (g, w, h) => {
      g.font = `bold 40px ${FONT}`;
      const tw = Math.min(w - 8, g.measureText(text).width + 44);
      g.fillStyle = bg; g.beginPath(); g.roundRect((w - tw) / 2, 8, tw, h - 16, 28); g.fill();
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2, w - 40);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(scale * cw / 80, scale, 1); sp.renderOrder = 20;
    return sp;
  }
  // E 말풍선: 지금 누르면 무슨 일이 일어나는지 글자로 보여줌 (집기 / 돌려놓기 / 보관 / 꺼내기 / 버리기)
  const marks = new Map();
  let eMark = null;
  function setMark(text) {
    if (eMark) eMark.visible = false;
    if (!text) { eMark = null; return; }
    if (!marks.has(text)) { const bad = text === '✕'; const sp = textSprite(text === 'E' || bad ? text : 'E ' + text, bad ? '#ff8f7a' : '#ffd66b', '#3b3558', 0.5); scene.add(sp); marks.set(text, sp); }
    eMark = marks.get(text); eMark.visible = true;
  }
  const storageGroup = new THREE.Group(); scene.add(storageGroup);
  const CHIP_COLOR = { lettuce: 0x8fd16a, tomato: 0xf0483e, berry: 0xf23f5f, cheese: 0xffc93c, flour: 0xfff3dc, milk: 0xffffff };
  const chips = Array.from({ length: 36 }, () => { const m = new THREE.Mesh(geo('chip', () => new THREE.BoxGeometry(0.07, 0.03, 0.07)), new THREE.MeshBasicMaterial()); m.visible = false; scene.add(m); return { m, life: 0, vx: 0, vy: 0, vz: 0 }; });
  let chipI = 0;
  function burst(x, y, z, color, n, spread = 1) {
    for (let i = 0; i < n; i++) {
      const c = chips[chipI++ % chips.length], a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 0.9) * spread;
      c.m.position.set(x, y, z); c.m.material.color.setHex(color); c.m.visible = true;
      c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = 1.6 + Math.random() * 1.4; c.life = 0.55;
    }
  }
  const popMap = new Map();
  const fxMap = new Map();          // 날아가는 재료 (반환·보관·버리기·접시 담기)
  const CONFETTI = 80, confGeo = sph(0.07, 6, 4);
  const confetti = Array.from({ length: CONFETTI }, () => { const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial()); m.visible = false; scene.add(m); return m; });
  const dimmer = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x2b2622, transparent: true, opacity: 0.55, depthTest: false }));
  dimmer.renderOrder = 15; dimmer.visible = false; scene.add(dimmer);

  // ───────── 접시 ─────────
  // 층으로 쌓는 재료(빵·고기·치즈·반죽)는 위로, 나머지는 접시 위에 나란히. 완성되면 금색 테두리 + 요리 그림
  const STACK = new Set(['bread', 'meat', 'cheese', 'dough']);
  const dishCache = new Map();
  function dishSprite(emoji) {
    if (!dishCache.has(emoji) && icons[emoji]) { const tx = new THREE.TextureLoader().load(icons[emoji]); tx.colorSpace = THREE.SRGBColorSpace; dishCache.set(emoji, tx); }   // 완성 요리 그림 (Fluent Emoji Flat)
    if (!dishCache.has(emoji)) dishCache.set(emoji, canvasTex(128, 128, (g, w) => { g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, w / 2, w / 2 + 6); }));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dishCache.get(emoji), depthTest: false, transparent: true }));
    sp.scale.set(0.62, 0.62, 1); sp.renderOrder = 17;
    return sp;
  }
  function plateModel(contents, complete, emoji, dirty) {
    const g = new THREE.Group();
    const pm = new THREE.Mesh(cyl(0.36, 0.24, 0.04, 24), dirty ? mat(0xb9a78a, 0.8) : M.white); pm.position.y = 0.02; pm.castShadow = true; g.add(pm);
    const rim = new THREE.Mesh(geo('rim', () => new THREE.TorusGeometry(0.35, 0.02, 6, 24)), complete ? M.gold : mat(0x9fd8ff, 0.4)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; g.add(rim);
    const dish = complete && models.get('dish:' + emoji);      // 완성되면 재료 대신 완성 요리 모델로 바뀜
    if (dish) { const d = dish.clone(); d.scale.setScalar(0.56); d.position.y = 0.045; g.add(d); return g; }
    const flat = (contents || []).filter(k => foods[k] && !STACK.has(k)), stack = (contents || []).filter(k => foods[k] && STACK.has(k));
    let h = 0.045;
    stack.sort((a, b) => (a === 'bread' || a === 'dough' ? -1 : 0) - (b === 'bread' || b === 'dough' ? -1 : 0)).forEach(k => {
      const m = food(k, 'ready'); m.scale.multiplyScalar(0.9); m.position.set(flat.length ? -0.12 : 0, h, 0); g.add(m); h += k === 'bread' ? 0.12 : 0.08;
    });
    flat.forEach((k, i) => {
      const m = food(k, 'ready'); m.scale.multiplyScalar(0.7);
      const a = (i / Math.max(1, flat.length)) * Math.PI * 2 + 0.6, r = flat.length > 1 || stack.length ? 0.14 : 0;
      m.position.set(Math.cos(a) * r + (stack.length ? 0.1 : 0), 0.045, Math.sin(a) * r); g.add(m);
    });
    if (complete && emoji) { const sp = dishSprite(emoji); sp.position.y = 0.62; g.add(sp); g.userData.sprite = sp; }
    return g;
  }

  // ───────── 셰프 ─────────
  function buildChef(color) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const skin = mat(0xffd2ad, 0.6), coat = mat(0xffffff, 0.6), accent = mat(color, 0.6);
    add(body, cyl(0.2, 0.28, 0.44, 20), coat, 0, 0.36);
    add(body, rbox(0.3, 0.3, 0.06, 0.03), accent, 0, 0.32, 0.2).rotation.x = -0.18;
    add(body, cyl(0.215, 0.225, 0.07, 20), accent, 0, 0.58);
    add(body, sph(0.07, 10, 8), accent, 0, 0.56, -0.22);
    add(body, sph(0.25, 22, 16), skin, 0, 0.86);
    add(body, cyl(0.21, 0.2, 0.17, 20), coat, 0, 1.11);
    add(body, sph(0.25, 18, 12), coat, 0, 1.26).scale.y = 0.68;
    for (const ex of [-0.09, 0.09]) {
      add(body, sph(0.035, 10, 8), M.dark, ex, 0.89, 0.225);
      add(body, sph(0.045, 10, 8), mat(0xffa3a3), ex * 1.8, 0.81, 0.19).scale.set(1, 0.6, 0.5);
    }
    add(body, rbox(0.07, 0.025, 0.02, 0.008), mat(0xc4594f), 0, 0.79, 0.24);
    const handL = add(body, sph(0.08, 12, 8), skin, -0.31, 0.4, 0.06), handR = add(body, sph(0.08, 12, 8), skin, 0.31, 0.4, 0.06);
    const footL = add(root, sph(0.1, 12, 8), M.dark, -0.12, 0.07, 0.03), footR = add(root, sph(0.1, 12, 8), M.dark, 0.12, 0.07, 0.03);
    footL.scale.set(1, 0.7, 1.45); footR.scale.set(1, 0.7, 1.45);
    const carry = new THREE.Group(); carry.position.set(0, 0.42, 0.34); body.add(carry);
    const blob = new THREE.Mesh(geo('blob', () => new THREE.CircleGeometry(0.3, 20)), new THREE.MeshBasicMaterial({ color: 0x1b1830, transparent: true, opacity: 0.22, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; root.add(blob);   // 발밑 그림자 (그림자를 끈 저사양 화질에서도 보임)
    const ring = new THREE.Mesh(geo('mine', () => new THREE.TorusGeometry(0.38, 0.035, 6, 28)), new THREE.MeshBasicMaterial({ color: 0xffd66b }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ring.visible = false; root.add(ring);
    scene.add(root);
    return { root, body, handL, handR, footL, footR, carry, ring, x: null, y: 0, angle: 0, walk: 0, held: null, name: null, tag: null, moveAmt: 0, run: 0 };
  }
  // 토끼·판다 요리사 (Quaternius Sushi Restaurant Kit): 동작(대기·걷기·달리기·들고 걷기·칼질·작업·환호)이 모델에 들어 있음. 모델이 없으면 위의 기본 셰프를 씀
  function buildChefModel(seat, color) {
    const src = models.get('char:' + (seat % 5));
    if (!src) return null;
    const root = new THREE.Group(), obj = cloneSkinned(src.scene);
    const b = new THREE.Box3().setFromObject(obj), h = b.max.y - b.min.y;
    const CH = 1.35;                                   // 셰프 키 (귀 포함)
    obj.scale.setScalar(CH / h); root.add(obj);
    const hat = new THREE.Group(); root.add(hat);        // 이 캐릭터들은 이미 요리사 차림이라 모자를 따로 씌우지 않음
    const blob = new THREE.Mesh(geo('blob', () => new THREE.CircleGeometry(0.3, 20)), new THREE.MeshBasicMaterial({ color: 0x1b1830, transparent: true, opacity: 0.22, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; root.add(blob);
    const ring = new THREE.Mesh(geo('mine', () => new THREE.TorusGeometry(0.38, 0.035, 6, 28)), new THREE.MeshBasicMaterial({ color: 0xffd66b })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ring.visible = false; root.add(ring);
    const carry = new THREE.Group(); carry.position.set(0, 0.58, 0.42); root.add(carry);
    const mixer = new THREE.AnimationMixer(obj), actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    const N = src.names || {};
    const dummy = () => new THREE.Group();
    scene.add(root);
    return { root, body: dummy(), handL: dummy(), handR: dummy(), footL: dummy(), footR: dummy(), carry, ring, obj, hat, mixer, actions, N, cur: '', x: null, y: 0, angle: 0, walk: 0, held: null, name: null, tag: null, moveAmt: 0, run: 0 };
  }
  function playAnim(v, name, speed = 1) {
    name = v.N[name] || v.N.idle || name;
    const a = v.actions[name]; if (!a) return;
    a.timeScale = speed;
    if (v.cur === name) return;
    a.reset().fadeIn(0.12).play();
    if (v.actions[v.cur]) v.actions[v.cur].fadeOut(0.12);
    v.cur = name;
  }
  const lookOf = held => held.startsWith('ready:') ? 'ready' : held.startsWith('burnt:') ? 'burnt' : '';
  let curOrders = [];
  const chefs = new Map();
  function syncChef(c, dt, seen) {
    let v = chefs.get(c.id);
    if (!v) { const col = SEAT_COLOR[(c.seat || 0) % SEAT_COLOR.length]; v = buildChefModel(c.seat || 0, col) || buildChef(col); chefs.set(c.id, v); }
    seen.add(c.id);
    if (v.x === null || Math.hypot(c.x - v.x, c.y - v.y) > 3) { v.x = c.x; v.y = c.y; }   // 처음이거나 순간이동이면 바로 이동
    const k = c.mine ? 1 : Math.min(1, dt * 10);        // 다른 사람은 부드럽게 따라가기 (온라인 끊김 완화)
    const dx = (c.x - v.x) * k, dy = (c.y - v.y) * k, moved = Math.hypot(dx, dy);
    v.x += dx; v.y += dy;
    const moving = moved > dt * 0.25;
    if (moving) { const target = Math.atan2(dx, dy); v.angle += Math.atan2(Math.sin(target - v.angle), Math.cos(target - v.angle)) * Math.min(1, dt * 14); v.walk += moved * 3.2; }
    else if (lastT - (v.actT || -1e9) < 500 && v.faceTo != null) v.angle += Math.atan2(Math.sin(v.faceTo - v.angle), Math.cos(v.faceTo - v.angle)) * Math.min(1, dt * 12);   // 작업 중에는 설비를 바라봄
    const speedNow = dt > 0 ? moved / dt : 0; v.run += ((speedNow > 6 ? 1 : 0) - (v.run || 0)) * Math.min(1, dt * 8);   // 러시(달리기)면 몸을 더 숙임
    v.moveAmt += ((moving ? 1 : 0) - v.moveAmt) * Math.min(1, dt * 12);
    const a = v.moveAmt, s = Math.sin(v.walk);
    v.root.position.set(wx(v.x), 0, wz(v.y));
    v.root.rotation.y = v.angle;
    const cheer = Math.max(0, 1 - (performance.now() - (c.cheer || -1e9)) / 700), reach = Math.max(0, 1 - (lastT - (v.reachT || -1e9)) / 220);   // 서빙 환호 / 집기·내려놓기
    v.body.position.y = a * Math.abs(s) * (0.055 + v.run * 0.03) + Math.sin(cheer * Math.PI) * 0.35 - Math.sin(reach * Math.PI) * 0.06;
    v.body.rotation.x = a * (0.1 + v.run * 0.12) + Math.sin(reach * Math.PI) * 0.22;
    v.footL.position.z = 0.03 + a * s * 0.14; v.footR.position.z = 0.03 - a * s * 0.14;
    const held = c.held || '';
    if (held !== v.held) {
      if (v.held !== null) v.reachT = lastT;
      v.held = held; v.carry.clear();
      const kind = held.replace(/^\w+:/, '');
      if (held.startsWith('plate:')) { v.plateOrder = null; }       // 접시는 아래에서 주문 상태에 맞춰 그림
      else if (foods[kind]) v.carry.add(food(kind, lookOf(held)));
    }
    if (held.startsWith('plate:')) {
      const ok = curOrders.map(o => o.items.join('+')).join('|');
      if (v.plateOrder !== ok) { v.plateOrder = ok; v.carry.clear(); const c = held.slice(6).split('+').filter(Boolean); const hit = curOrders.find(o => o.items.length && c.length === o.items.length && o.items.every(i => c.includes(i))); const pm = plateModel(c, !!hit, hit && hit.emoji); pm.scale.setScalar(0.8); pm.position.y = -0.05; v.carry.add(pm); }
    }
    const carrying = !!held;
    // 작업 동작: 도마=오른손 내려치기, 믹서=두 손으로 원 그리기, 싱크대=두 손 문지르기
    const actK = Math.max(0, 1 - (lastT - (v.actT || -1e9)) / 200), cu = Math.sin(actK * Math.PI), act = actK > 0 ? v.act : '';
    const wide = held.startsWith('plate:') ? 0.24 : 0.16;      // 접시는 두 손을 넓게 벌려 받침
    let lx = carrying ? -wide : -0.31, ly = carrying ? 0.44 : 0.4, lz = carrying ? 0.3 : 0.06 - a * s * 0.13;
    let rx = carrying ? wide : 0.31, ry = carrying ? 0.44 : 0.4, rz = carrying ? 0.3 : 0.06 + a * s * 0.13;
    if (!carrying) {
      if (act === 'cut') { rx -= cu * 0.1; ry += cu * 0.28; rz += cu * 0.22; lx += 0.08; lz += 0.2 * Math.min(1, actK * 3); }
      else if (act === 'mix') { const ph = lastT / 60; lx = -0.14 + Math.cos(ph) * 0.1; rx = 0.14 + Math.cos(ph) * 0.1; lz = rz = 0.3 + Math.sin(ph) * 0.1; ly = ry = 0.62; }
      else if (act === 'sink') { const ph = Math.sin(lastT / 40) * 0.09; lx = -0.14 + ph; rx = 0.14 - ph; lz = rz = 0.32; ly = ry = 0.5; }
      if (cheer > 0) { const up = Math.sin(cheer * Math.PI); ly += up * 0.55; ry += up * 0.55; lx -= up * 0.08; rx += up * 0.08; }
    }
    v.handL.position.set(lx, ly, lz); v.handR.position.set(rx, ry, rz);
    v.body.rotation.x += cu * (act === 'cut' ? 0.12 : 0.05);
    if (v.mixer) {                                   // 모델 셰프: 상황에 맞는 동작을 골라 재생
      const jump = Math.sin(cheer * Math.PI) * 0.3;
      v.obj.position.y = jump;
      if (cheer > 0) playAnim(v, 'cheer', 1.4);
      else if (lastT - (v.actT || -1e9) < 450) playAnim(v, v.act === 'cut' ? 'cut' : 'work', 1.5);      // 연타하는 동안 칼질/작업 동작 유지
      else if (a > 0.3) playAnim(v, (v.run > 0.5 ? 'run' : 'walk') + (carrying ? 'Hold' : ''), 1.2);
      else playAnim(v, carrying ? 'hold' : 'idle');
      v.mixer.update(dt);
    }
    v.ring.visible = !!c.mine;
    const name = String(c.name || '셰프').slice(0, 8);
    if (name !== v.name || !!c.mine !== v.tagMine) {
      if (v.tag) { v.root.remove(v.tag); v.tag.material.map.dispose(); v.tag.material.dispose(); }
      v.name = name; v.tagMine = !!c.mine;
      v.tag = textSprite(name, c.mine ? '#4c785d' : '#4a3f78', '#ffffff', 0.34);
      v.tag.position.y = v.mixer ? 2.0 : 1.72; v.root.add(v.tag);
    }
  }

  // ───────── 한 프레임 그리기 ─────────
  let lastT = 0, storageKey = null;
  const perf = { fps: 0, frames: 0, acc: 0, slow: 0, samples: 0 };
  function render(state, t) {
    const raw = lastT ? (t - lastT) / 1000 : 0.016, dt = Math.min(0.1, raw);
    lastT = t;
    resize();
    curOrders = state.orders || [];
    // 러시타임: 주방 조명이 붉게 깜빡임
    const rk = state.rush ? 0.5 + Math.sin(t / 130) * 0.5 : 0;
    sun.color.setRGB(1, 0.94 - rk * 0.35, 0.84 - rk * 0.45); hemi.intensity = 1.25 - rk * 0.25;
    const seen = new Set();
    for (const c of state.chefs) syncChef(c, dt, seen);
    for (const [id, v] of chefs) if (!seen.has(id)) { scene.remove(v.root); chefs.delete(id); }

    const f = state.focus;
    focusRing.visible = !!f;
    const busy = f && (state.boards || []).some(b => b.x === f.x && b.y === f.y);   // 도마에 이미 상태 글자가 떠 있으면 E 말풍선은 생략
    setMark(f && !busy ? state.focusLabel || 'E' : '');
    if (f) {
      focusRing.position.set(wx(f.x + 0.5), f.type === 'trash' ? 0.84 : TOP - 0.04, wz(f.y + 0.5));
      focusRing.material.opacity = 0.45 + Math.sin(t / 160) * 0.15;
      if (eMark) eMark.position.set(wx(f.x + 0.5), TOP + 0.95, wz(f.y + 0.5));
    }
    // 보관대 위 재료: 게임 상태(storage)를 그대로 따라감
    const sKey = (state.storage || []).map(r => r.id).join(',');
    if (sKey !== storageKey) {
      storageKey = sKey; storageGroup.clear();
      (state.storage || []).slice(0, storageSlots.length).forEach((rec, i) => {
        if (!foods[rec.kind]) return;
        const m = food(rec.kind, rec.state === 'raw' ? '' : 'ready'); m.scale.multiplyScalar(0.8); m.position.copy(storageSlots[i]); storageGroup.add(m);
      });
    }
    // 도마: 올려둔 재료, 게이지, 상태 글자, 칼질 동작 — 게임 상태(boards)를 그대로 따라감
    const active = new Map((state.boards || []).map(b => [b.x + ',' + b.y, b]));
    for (const [k, v] of boards) {
      const b = active.get(k), key = b ? (b.type === 'sink' ? 'dirty' + b.dirty : b.type === 'rack' ? 'clean' + b.clean : b.type === 'plate' ? 'P:' + b.contents.join('+') + (b.complete ? ':done' : '') : b.kind + (b.look === 'ready' ? ':r' : b.look === 'burnt' ? ':b' : '')) : '';
      if (key !== v.key) {
        v.key = key; v.spot.clear();
        if (b && b.type === 'sink') {       // 더러운 접시 더미(왼쪽)와 깨끗한 접시 더미(오른쪽)
          for (let i = 0; i < Math.min(5, b.dirty); i++) { const pm = new THREE.Mesh(cyl(0.2, 0.14, 0.03, 16), mat(0xb9a78a, 0.8)); pm.position.set(0, i * 0.04, 0); v.spot.add(pm); }
        } else if (b && b.type === 'rack') {       // 깨끗한 접시 더미
          for (let i = 0; i < Math.min(6, b.clean); i++) { const pm = new THREE.Mesh(cyl(0.32, 0.22, 0.035, 20), M.white); pm.position.y = 0.02 + i * 0.045; pm.castShadow = true; v.spot.add(pm); }
        } else if (b && b.type === 'plate') {      // 플레이팅대의 접시: 올린 재료가 그대로 보임
          v.spot.add(plateModel(b.contents, b.complete, b.emoji));
          v.pop = t;
        } else if (b && foods[b.kind]) { const fm2 = food(b.kind, b.look === 'raw' ? '' : b.look); if (v.mini) fm2.scale.setScalar(v.mini); v.spot.add(fm2); }
      }
      const count = b ? b.count : 0;
      if (b && count > v.count) {            // 진행이 늘면 동작 한 번 (다른 사람 것도 보임): 칼질 조각 / 젓기 / 물방울
        v.swing = t;
        const c = chefs.get(b.owner); if (c) { c.actT = t; c.act = v.type; c.faceTo = Math.atan2(v.g.position.x - c.root.position.x, v.g.position.z - c.root.position.z); }
        if (v.type === 'cut') burst(v.g.position.x - 0.08, TOP + 0.12, v.g.position.z, CHIP_COLOR[b.kind] || 0xffffff, 4);
        else if (v.type === 'sink') burst(v.g.position.x, TOP + 0.1, v.g.position.z + 0.05, 0x9fdcff, 5, 0.7);
        else if (v.type === 'mix') burst(v.g.position.x, TOP + 0.5, v.g.position.z, CHIP_COLOR[b.kind] || 0xfff3dc, 2, 0.5);
      }
      v.count = count;
      const sw = Math.max(0, 1 - (t - v.swing) / 160), up = Math.sin(sw * Math.PI);
      if (v.knife) { v.knife.position.y = v.knifeY + up * 0.22; v.knife.rotation.z = up * 0.5; v.knife.position.x = 0.24 - up * 0.2; }
      v.spot.position.y = v.spotY - up * 0.02; v.spot.rotation.z = (sw > 0 ? Math.sin(t / 18) : 0) * 0.08;
      if (v.type === 'mix' && b && b.state === 'working') v.spot.rotation.y += sw > 0 ? 0.5 : 0.02;     // 젓기
      if (v.fire) {                                                                                    // 화덕: 불꽃과 연기
        const st2 = b ? b.state : 'idle', hot = st2 === 'cooking' || st2 === 'ready' || st2 === 'warning';
        v.fire.emissiveIntensity = hot ? 1.8 + Math.sin(t / 55 + v.g.position.x) * 0.5 : 0.3;
        v.glow.intensity = hot && quality !== 'low' ? 2.2 + Math.sin(t / 70 + v.g.position.x) * 0.6 : 0;
        const smoky = st2 === 'warning' || st2 === 'burnt', steamy = st2 === 'cooking' || st2 === 'ready';
        for (const pm of v.smoke) {
          pm.userData.k = (pm.userData.k + dt * (smoky ? 0.8 : 0.45)) % 1;
          const kk = pm.userData.k;
          pm.position.set(Math.sin(kk * 9 + pm.id) * 0.1, TOP + 0.3 + kk * (smoky ? 1.1 : 0.7), Math.cos(kk * 7 + pm.id) * 0.07);
          pm.scale.setScalar((smoky ? 1 : 0.6) + kk * 1.5);
          pm.material.opacity = smoky || steamy ? (1 - kk) * (smoky ? 0.75 : 0.4) : 0;
          pm.material.color.setHex(smoky ? 0x4a4458 : 0xffffff);
        }
      }
      v.bar.visible = !!b && !(b.type === 'sink' && b.state !== 'working') && b.type !== 'plate' && b.type !== 'rack';
      if (v.type === 'plate') { const pk = Math.max(0, 1 - (t - (v.pop || -1e9)) / 220); v.spot.scale.setScalar(1 + Math.sin(pk * Math.PI) * 0.18); const d = v.spot.children[0]; if (d && d.userData.sprite) d.userData.sprite.position.y = 0.62 + Math.sin(t / 260) * 0.05; }   // 놓일 때 통 튀는 동작, 완성 그림은 둥실
      if (b) {
        v.bar.quaternion.copy(camera.quaternion);
        v.fill.scale.x = Math.max(0.02, b.progress); v.fill.position.x = -0.7 * (1 - Math.max(0.02, b.progress));
        v.fill.material.color.set(b.state === 'warning' ? (Math.sin(t / 70) > 0 ? 0xff6b57 : 0xffd166) : b.state === 'burnt' ? 0x55505f : b.ready ? 0x5fcf8f : b.state === 'stale' ? 0x9aa7b8 : 0xffd166);
      }
      const text = b ? b.label : '';
      if (text !== v.labelText) {
        if (v.label) { scene.remove(v.label); v.label.material.map.dispose(); v.label.material.dispose(); v.label = null; }
        v.labelText = text;
        if (text) { v.label = textSprite(text, '#fffdf5', '#3b3558', 0.56, 384); v.label.position.set(v.g.position.x, TOP + 1.8, v.g.position.z); scene.add(v.label); }
      }
    }
    for (const c of chips) {
      if (c.life <= 0) continue;
      c.life -= dt; c.vy -= 9 * dt;
      c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt; c.m.rotation.x += dt * 9; c.m.rotation.z += dt * 7;
      if (c.life <= 0 || c.m.position.y < 0.02) { c.life = 0; c.m.visible = false; }
    }
    for (const pm of glowPads) pm.emissiveIntensity = 0.45 + Math.sin(t / 380) * 0.25;
    // 점수 팝업 (+100)
    for (const pu of state.popups || []) {
      let sp = popMap.get(pu);
      if (!sp) { sp = textSprite(pu.text, pu.hot ? '#ff6b57' : '#ffd66b', pu.hot ? '#ffffff' : '#3b3558', pu.hot ? 0.62 : 0.75, pu.hot ? 320 : 256); scene.add(sp); popMap.set(pu, sp); }
      const k = Math.max(0, Math.min(1, (t - pu.t) / 1400)), pop = 1 + Math.sin(Math.min(1, k * 5) * Math.PI) * 0.35;      // 처음에 통 튀어나옴
      sp.visible = t >= pu.t;
      sp.position.set(wx(pu.x), TOP + 0.8 + k * 1.4, wz(pu.y)); sp.material.opacity = 1 - k * k; sp.scale.set((pu.hot ? 0.62 * 4 : 0.75 * 3.2) * pop, (pu.hot ? 0.62 : 0.75) * pop, 1);
    }
    for (const [pu, sp] of popMap) if (!(state.popups || []).includes(pu)) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); popMap.delete(pu); }
    for (const fobj of state.fx || []) {
      let m = fxMap.get(fobj);
      if (!m) { const kind = fobj.held.replace(/^\w+:/, ''); m = fobj.held.startsWith('plate:') ? plateModel(fobj.held.slice(6).split('+').filter(Boolean), false) : food(kind, lookOf(fobj.held)); scene.add(m); fxMap.set(fobj, m); }
      const k = Math.min(1, (t - fobj.t) / 300);
      m.position.set(wx(fobj.x0 + (fobj.x1 - fobj.x0) * k), 0.8 + Math.sin(k * Math.PI) * 0.7 + (TOP - 0.8) * k, wz(fobj.y0 + (fobj.y1 - fobj.y0) * k));
      m.scale.setScalar(1 - k * 0.4); m.visible = k < 1;
    }
    for (const [fobj, m] of fxMap) if (!(state.fx || []).includes(fobj)) { scene.remove(m); fxMap.delete(fobj); }
    const ps = state.particles || [];
    for (let i = 0; i < CONFETTI; i++) {
      const m = confetti[i], p = ps[i];
      m.visible = !!p;
      if (p) { m.position.set(wx(p.x), 0.9 + (1 - p.life) * 1.6 * p.life * 4, wz(p.y)); m.material.color.set(p.color); m.scale.setScalar(0.5 + p.life); }
    }
    dimmer.visible = !!state.dim;
    if (state.dim) { dimmer.position.copy(camera.position).multiplyScalar(0.5); dimmer.quaternion.copy(camera.quaternion); }
    renderer.render(scene, camera);

    // 성능 측정: 3초 연속 28FPS 미만이면 그림자를 끄고 해상도를 낮춤
    perf.frames++; perf.acc += raw;
    if (perf.acc >= 0.5) {
      perf.fps = Math.round(perf.frames / perf.acc); perf.frames = 0; perf.acc = 0; perf.samples++;
      perf.slow = perf.fps < 28 && perf.samples > 3 ? perf.slow + 1 : 0;
      if (perf.slow >= 6 && quality !== 'low') {
        quality = 'low'; pixelCap = 1; renderer.shadowMap.enabled = false; sun.castShadow = false; if (coolLight) coolLight.visible = false;
        scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
        cw = 0;
      }
    }
  }

  return { render, perf, renderer, get quality() { return quality; }, get modelCount() { return models.size; }, get plateKeys() { return [...boards.values()].filter(v => v.type === 'plate' && v.key).map(v => v.key); }, get boardKeys() { return [...boards.values()].map(v => v.key + '|' + v.labelText).filter(k => k !== '|'); }, get storageKey() { return storageKey; }, get mark() { for (const [k, v] of marks) if (v.visible) return k; return ''; }, chefs };
}
