// 인트로 컷신 《사라진 천재 셰프》 3D 연출 — 캐릭터 동작, 카메라, 편지, 주문 카드, 잠긴 레시피 책
// 자막·효과음·음악 시간표는 intro.js. 이 파일은 "지금이 인트로의 몇 ms인가"만 보고 화면을 정합니다.
// 같은 ms면 누구 화면에서나 같은 장면이 되므로, 친구들과 같은 장면을 보고 같은 순간에 게임이 시작됩니다.
import { INTRO_MS, TITLE_AT } from './intro.js';

const sm = k => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));          // 부드럽게 0→1
const seg = (ms, a, b) => sm((ms - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = i => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };   // 매번 같은 "무작위"

export function createIntro3D(c) {
  const { THREE, scene, camera, wx, wz, TOP } = c;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const tp = (tx, ty, y = 0) => V(wx(tx), y, wz(ty));                        // 타일 좌표 → 3D 위치
  let root = null, head = null, studs = [], seated = [], rushers = [], cards = [], book = null, letter = null, bang = null, headTag = null, hat = null, pan = null;
  let hidden = [], lastMs = -1, rushOn = false, asideOn = false, built = false;
  const camPos = V(), camLook = V(), tmp = V(), tmp2 = V();

  // ───────── 배우 (요리사 모델 + 동작) ─────────
  function actor(src, h, parent) {
    const g = new THREE.Group(), obj = c.cloneSkinned(src.scene);
    const b = new THREE.Box3().setFromObject(obj);
    obj.scale.setScalar(h / ((b.max.y - b.min.y) || 1)); g.add(obj);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0x1b1830, transparent: true, opacity: 0.22, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; g.add(blob);
    const mixer = new THREE.AnimationMixer(obj), actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    parent.add(g);
    return { root: g, obj, mixer, actions, cur: '', bones: {} };
  }
  function play(a, name, once = false, speed = 1) {
    const act = a.actions[name]; if (!act || a.cur === name) return;
    act.reset(); act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); act.clampWhenFinished = once; act.timeScale = speed;
    act.fadeIn(0.15).play();
    if (a.actions[a.cur]) a.actions[a.cur].fadeOut(0.15);
    a.cur = name;
  }
  const bone = (a, name) => a.bones[name] || (a.bones[name] = a.obj.getObjectByName(name));
  function turn(a, ang, dt, k = 10) { let d = ang - a.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); a.root.rotation.y += d * Math.min(1, dt * k); }
  // 시각표(경유점) [[ms, 타일x, 타일y, 높이?], ...] → 그 시각의 위치와 움직이는 방향
  function path(wp, ms) {
    if (ms <= wp[0][0]) return { p: tp(wp[0][1], wp[0][2], wp[0][3] || 0), moving: false };
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i], b = wp[i + 1];
      if (ms <= b[0]) {
        const k = (ms - a[0]) / (b[0] - a[0]), pa = tp(a[1], a[2]), pb = tp(b[1], b[2]);
        const p = pa.lerp(pb, k); p.y = lerp(a[3] || 0, b[3] || 0, k);
        return { p, moving: pb.distanceTo(tp(a[1], a[2])) > 0.01, dir: Math.atan2(wx(b[1]) - wx(a[1]), wz(b[2]) - wz(a[2])) };
      }
    }
    const z = wp[wp.length - 1]; return { p: tp(z[1], z[2], z[3] || 0), moving: false };
  }
  const hop = (ms, a, b, h) => (ms > a && ms < b ? Math.sin(Math.PI * (ms - a) / (b - a)) * h : 0);

  // ───────── 소품 ─────────
  function tex(w, h, draw) { return c.canvasTex(w, h, draw); }
  function iconOnto(t, emoji, x, y, s) {           // 음식 그림(Fluent Emoji)을 그림판에 얹고 다시 칠함
    const src = c.icons[emoji]; if (!src) return;
    const img = new Image(); img.onload = () => { t.image.getContext('2d').drawImage(img, x, y, s, s); t.needsUpdate = true; }; img.src = src;
  }
  function vfrac(g, x, y, top, bot, size) {        // 세로 분수: 분자 위, 가로선, 분모 아래
    g.font = `bold ${size}px ${c.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.max(g.measureText(top).width, g.measureText(bot).width) + 14;
    g.fillText(top, x, y - size * 0.62); g.fillRect(x - w / 2, y - 2, w, 5); g.fillText(bot, x, y + size * 0.66);
    return w;
  }
  function makeBook() {
    const g = new THREE.Group();
    const t = tex(512, 352, (k, w, h) => {
      k.fillStyle = '#fff6e0'; k.fillRect(0, 0, w, h); k.strokeStyle = '#a93321'; k.lineWidth = 10; k.strokeRect(8, 8, w - 16, h - 16);
      k.fillStyle = '#a93321'; k.font = `bold 44px ${c.FONT}`; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText('비밀 레시피', w / 2, 50);
      k.fillStyle = '#2e2520'; const y = 150; vfrac(k, 230, y, '3', '4', 50); k.font = `bold 50px ${c.FONT}`; k.fillText('÷', 290, y); vfrac(k, 350, y, '1', '2', 50); k.font = `bold 50px ${c.FONT}`; k.fillText('= ?', 432, y);
      k.fillStyle = '#c9b89a'; for (let i = 0; i < 3; i++) k.fillRect(60, 232 + i * 20, 390 - i * 70, 9);
      k.fillStyle = '#a93321'; k.font = `bold 22px ${c.FONT}`; k.fillText('정답을 맞혀야 열려요!', w / 2, 322);
    });
    iconOnto(t, '🍔', 40, 92, 110);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.35, 0.12), new THREE.MeshStandardMaterial({ color: 0xa93321, roughness: 0.7 }));
    const page = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.22), new THREE.MeshBasicMaterial({ map: t }));
    page.position.z = 0.065; g.add(cover, page);
    const metal = new THREE.MeshStandardMaterial({ color: 0x8d8f99, metalness: 0.7, roughness: 0.35 });
    const link = new THREE.TorusGeometry(0.045, 0.014, 6, 12);
    for (let i = 0; i < 26; i++) {                 // 쇠사슬: 책 아래쪽을 가로질러 감음
      const m = new THREE.Mesh(link, metal);
      m.position.set(lerp(-1.02, 1.02, i / 25), -0.3 + Math.sin(i / 25 * Math.PI) * -0.04, 0.1); m.rotation.set(0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2);
      g.add(m);
    }
    const lock = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xf0b429, metalness: 0.6, roughness: 0.3, emissive: 0x6b4a00, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.12), gold); lock.add(body);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 18, Math.PI), metal); shackle.position.y = 0.13; lock.add(shackle);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: 0x2e2520 })); hole.position.set(0, -0.02, 0.061); lock.add(hole);
    lock.position.set(0, -0.36, 0.17); g.add(lock);
    g.userData.lock = lock; g.userData.gold = gold;
    return g;
  }
  function makeLetter() {
    const t = tex(160, 112, (k, w, h) => {
      k.fillStyle = '#fffdf5'; k.strokeStyle = '#2e2520'; k.lineWidth = 6; k.fillRect(6, 6, w - 12, h - 12); k.strokeRect(6, 6, w - 12, h - 12);
      k.beginPath(); k.moveTo(6, 6); k.lineTo(w / 2, h * 0.55); k.lineTo(w - 6, 6); k.stroke();
      k.fillStyle = '#d6452f'; k.beginPath(); k.arc(w / 2, h * 0.55, 15, 0, 7); k.fill();
      k.fillStyle = '#2e2520'; k.font = `bold 20px ${c.FONT}`; k.textAlign = 'center'; k.fillText('초대장', w / 2, h - 18);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(0.5, 0.35, 1); sp.renderOrder = 23;
    return sp;
  }
  const CARD_DISH = ['🍔', '🥗', '🍰', '🍕', '🥞', '🌮'];
  function makeCardTextures() {
    return CARD_DISH.map(e => {
      const t = tex(128, 160, (k, w, h) => {
        k.fillStyle = '#fffdf5'; k.fillRect(0, 0, w, h); k.strokeStyle = '#2e2520'; k.lineWidth = 6; k.strokeRect(3, 3, w - 6, h - 6);
        k.fillStyle = '#d6452f'; k.fillRect(3, 3, w - 6, 34); k.fillStyle = '#fff'; k.font = `bold 22px ${c.FONT}`; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText('주문!', w / 2, 21);
        k.fillStyle = '#c9b89a'; k.fillRect(20, 128, 88, 6); k.fillRect(30, 142, 68, 6);
      });
      iconOnto(t, e, 28, 46, 72);
      return t;
    });
  }
  function makeHat() {                               // 천재 셰프의 높은 요리사 모자
    const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20), white); band.position.y = 0.06; g.add(band);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.32, 20), white); tube.position.y = 0.26; g.add(tube);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), white); p.position.set(Math.cos(a) * 0.12, 0.46, Math.sin(a) * 0.12); g.add(p); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), white); top.position.y = 0.52; g.add(top);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ───────── 장면 준비 (처음 한 번) ─────────
  function build(info) {
    built = true; lastMs = -1; rushOn = false; asideOn = false;
    root = new THREE.Group(); scene.add(root);
    for (const gu of c.guestList) if (gu.root.visible) { gu.root.visible = false; hidden.push(gu); }   // 게임용 손님은 잠시 숨김
    const hs = c.models.get('char:head') || c.models.get('char:0');
    head = actor(hs, 1.8, root);
    hat = makeHat(); root.add(hat);
    headTag = c.textSprite('천재 셰프', '#f0b429', '#2e2520', 0.44, 256); headTag.position.y = 2.75; head.root.add(headTag);
    bang = c.textSprite('!!', '#d6452f', '#ffffff', 0.62, 160); bang.position.y = 2.45; bang.visible = false; head.root.add(bang);
    letter = makeLetter(); root.add(letter);
    // 1장면 소품: 조리대 위 프라이팬과 완성 요리
    pan = new THREE.Group();
    const panM = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.07, 20), new THREE.MeshStandardMaterial({ color: 0x2e2a33, metalness: 0.5, roughness: 0.4 }));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x5a3b26 })); handle.position.set(0.48, 0.02, 0);
    pan.add(panM, handle); pan.position.copy(tp(10.5, 6.45, TOP + 0.04)); root.add(pan);
    [['🍔', 9.4], ['🥗', 11.6], ['🍰', 12.5]].forEach(([e, x]) => { const src = c.models.get('dish:' + e); if (src) { const m = src.clone(); m.scale.setScalar(0.5); m.position.copy(tp(x, 6.45, TOP)); pan.userData.dishes = (pan.userData.dishes || []).concat(m); root.add(m); } });
    // 홀에 앉아 먹는 손님 (게임 화면의 식탁 자리)
    const KX = c.W / 2;
    const seats = [[-1, KX + 3.6, -2.6, -0.3, 0], [-1, KX + 3.6, -2.6, -0.3, 1], [1, KX + 3.6, -2.6, 0.3, 0], [1, KX + 3.6, -2.6, 0.3, 2], [-1, KX + 3.2, 2.6, -0.15, 1], [1, KX + 3.2, 2.6, 0.15, 3]];
    for (const [s, x, z, rot, i] of seats) {
      const a = rot + (i / 4) * Math.PI * 2 + Math.PI / 4, R = x === KX + 3.6 ? 1.05 : 1.15;
      const gu = c.makeGuest(s * x + Math.sin(a) * R, z + Math.cos(a) * R); if (!gu) continue;
      gu.root.rotation.y = a + Math.PI; gu.face = a + Math.PI; gu.rest = 'sit'; gu.speed = 0; gu.tx = gu.root.position.x; gu.tz = gu.root.position.z; gu.root.position.y = 0.12;
      seated.push(gu);
    }
    // 학생 요리사 (우리 팀)
    const team = (info && info.team && info.team.length ? info.team : [{ name: '요리사', seat: 0 }]).slice(0, 5), n = team.length;
    team.forEach((m, i) => {
      const src = c.models.get('char:' + (m.seat % 5)); if (!src) return;
      const a = actor(src, 1.35, root); a.root.visible = false;
      const tag = c.textSprite(m.name, m.me ? '#f0b429' : '#fffdf5', '#2e2520', 0.4, 256); tag.position.y = 1.95; a.root.add(tag);
      a.x = (i - (n - 1) / 2) * 1.5; a.start = 32000 + i * 450; a.seat = m.seat; a.landed = false;
      studs.push(a);
    });
    // 쏟아지는 주문 카드
    const tx = makeCardTextures(), geo = new THREE.PlaneGeometry(0.95, 1.2);
    for (let i = 0; i < 56; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tx[i % tx.length], side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 2; root.add(m);
      cards.push({ m, t0: 15400 + i * 120, x: lerp(-8.5, 8.5, rnd(i)), z: lerp(-3.5, 10.5, rnd(i + 50)), y0: 9 + rnd(i + 90) * 3, v: 2.6 + rnd(i + 130) * 1.6, ph: rnd(i + 170) * 6, rz: rnd(i + 210) * 6 });
    }
    book = makeBook(); book.visible = false; root.add(book);
  }

  // ───────── 사람·물건 움직이기 ─────────
  const P0 = [10.5, 5.35];                             // 천재 셰프가 요리하던 자리
  const RUN_OUT = [[12300, 10.5, 5.35], [12900, 14.6, 5.6], [13500, 15.5, 9.3], [13900, 16.3, 10.3], [14400, 18.8, 10.6], [15000, 22.5, 10.8]];
  const RUN_IN = [[20200, 22.5, 7.4], [20700, 18.7, 7.5], [21100, 15.2, 7.5], [21600, 11, 7.6]];
  const CIRCLE = { x: 9.5, y: 7.6, r: 1.0, t0: 21600, t1: 24000 };
  const circleAt = ms => { const a = (ms - CIRCLE.t0) / 1000 * Math.PI * 2 * 0.85; return [CIRCLE.x + Math.cos(a) * CIRCLE.r, CIRCLE.y + Math.sin(a) * CIRCLE.r, a]; };
  const cEnd = circleAt(CIRCLE.t1);
  const TO_BOOK = [[24000, cEnd[0], cEnd[1]], [24900, 7.0, 2.35]];
  const TO_KIDS = [[36500, 7.0, 2.35], [38800, 9, 4.4]];
  const FLEE = [[48300, 9, 4.4], [48900, 12.8, 4.7], [49500, 15.5, 6.6], [50000, 18.7, 6.9], [50800, 23, 7]];
  function headChef(ms, dt, t) {
    const a = head, r = a.root;
    let pos, moving = false, dir = 0, faceTo = 0, anim = 'Idle', vis = true, y = 0;
    if (ms < 12300) {
      pos = tp(P0[0], P0[1]);
      anim = ms < 7000 ? 'Pan_Loop' : ms < 7700 ? 'Idle' : ms < 8300 ? 'HitReact' : ms < 10000 ? 'Idle_Holding' : ms < 11300 ? 'Jump' : 'Yes';
      y = hop(ms, 10050, 10750, 0.55);
    } else if (ms < 15000) { const q = path(RUN_OUT, ms); pos = q.p; moving = q.moving; dir = q.dir; anim = 'Run'; y = hop(ms, 13900, 14400, 1.15); vis = ms < 14900; }
    else if (ms < 20200) { vis = false; pos = tp(22, 8); }
    else if (ms < 21600) { const q = path(RUN_IN, ms); pos = q.p; moving = true; dir = q.dir; anim = 'Run'; y = hop(ms, 20700, 21100, 1.15); }
    else if (ms < 24000) { const [x, z, ang] = circleAt(ms); pos = tp(x, z); moving = true; dir = Math.atan2(-Math.sin(ang), Math.cos(ang)); anim = 'Run'; }
    else if (ms < 24900) { const q = path(TO_BOOK, ms); pos = q.p; moving = true; dir = q.dir; anim = 'Run'; }
    else if (ms < 32000) {
      pos = tp(7.0, 2.35); faceTo = ms < 30100 ? Math.PI : 0;
      anim = (ms > 26000 && ms < 26700) || (ms > 28200 && ms < 28900) ? 'Assembly_Loop' : ms > 30100 ? 'No' : 'Idle';
    } else if (ms < 36500) { pos = tp(7.0, 2.35); faceTo = 0.35; anim = ms > 33500 && ms < 34400 ? 'HitReact' : ms > 35100 ? 'Yes' : 'Idle'; }
    else if (ms < 38800) { const q = path(TO_KIDS, ms); pos = q.p; moving = true; dir = q.dir; anim = 'Walk'; }
    else if (ms < 48300) {
      pos = tp(9, 4.4); faceTo = 0;
      anim = ms < 39200 ? 'Idle' : ms < 41000 ? 'Wave' : ms < 42200 ? 'Yes' : ms < 46300 ? 'Idle' : ms < 47000 ? 'HitReact' : 'Jump';
      y = hop(ms, 46350, 46900, 0.45) + hop(ms, 47000, 47700, 0.9);
    } else { const q = path(FLEE, ms); pos = q.p; moving = q.moving; dir = q.dir; anim = 'Run'; y = hop(ms, 49500, 50000, 1.15); vis = ms < 50700; }
    r.visible = vis; r.position.set(pos.x, y, pos.z);
    turn(a, moving ? dir : faceTo, dt, moving ? 14 : 8);
    play(a, anim, anim === 'HitReact' || anim === 'Jump');
    a.mixer.update(dt);
    // 모자는 머리를 따라감
    const hb = bone(a, 'Head'); hat.visible = vis;
    if (hb) { hb.getWorldPosition(tmp); hb.getWorldQuaternion(hat.quaternion); hat.position.copy(tmp); hat.translateY(0.42); hat.scale.setScalar(1); }
    // 이름표: 얼굴을 크게 잡는 장면에서는 숨김
    headTag.visible = vis && !(ms > 42200 && ms < 48400) && !(ms > 7000 && ms < 12300) && !(ms > 24300 && ms < 32000);
    bang.visible = vis && ((ms > 20400 && ms < 24000) || (ms > 46300 && ms < 48400)); if (bang.visible) bang.position.y = 2.45 + Math.abs(Math.sin(t / 90)) * 0.12;
    if (vis && ms > 21600 && ms < 24000 && Math.random() < dt * 7) c.burst(r.position.x, 1.9, r.position.z, 0x7fd0ff, 2, 0.5);   // 땀방울
    if (vis && moving && Math.random() < dt * 9) c.burst(r.position.x, 0.08, r.position.z, 0xe9d8c0, 1, 0.35);                  // 발밑 먼지
  }
  function letterAt(ms) {
    letter.visible = ms > 7000 && ms < 12300 && head.root.visible;
    if (!letter.visible) return;
    const hb = bone(head, 'Index1.R'); const hand = hb ? hb.getWorldPosition(tmp2) : tmp2.copy(head.root.position).setY(1.0);
    if (ms < 7800) { const k = sm((ms - 7000) / 800), from = V(6.5, 6.5, -4); letter.position.copy(from.lerp(hand, k)); letter.position.y += Math.sin(k * Math.PI) * 0.8; letter.material.rotation = (1 - k) * 6; }
    else { letter.position.copy(hand).add(V(0.32, -0.12, 0.2)); letter.material.rotation = Math.sin(ms / 160) * 0.1; }
  }
  function students(ms, dt) {
    for (const a of studs) {
      const r = a.root, k0 = a.start;
      r.visible = ms >= k0;
      if (!r.visible) continue;
      const zEnd = wz(8.6), zStart = 11.8, run = 1700;
      let z = ms < k0 + run ? lerp(zStart, zEnd, (ms - k0) / run) : zEnd, y = 0, anim = 'Idle', face = 0;
      if (ms < k0 + run) { anim = z < 6.9 && z > 3.4 ? 'Jump' : 'Run'; y = z < 6.9 && z > 3.4 ? Math.sin(Math.PI * (6.9 - z) / 3.5) * 1.5 : 0; face = Math.PI; }
      else if (ms < 39000) { anim = ms > k0 + run + 150 ? 'Yes' : 'Idle'; face = 0; }
      else if (ms < 45000) { anim = 'Idle'; face = Math.PI; }
      else if (ms < 46300) { anim = 'No'; face = Math.PI; }
      else if (ms < 48300) { anim = 'HitReact'; face = Math.PI; }
      else { anim = 'Yes'; face = 0; }
      if (!a.landed && ms >= k0 + run) { a.landed = true; if (ms - (k0 + run) < 600) { c.ring(a.x, 0.06, zEnd, 0xffd66b, 1.1); c.burst(a.x, 0.4, zEnd, 0xffd66b, 8, 1); } }
      r.position.set(a.x, y, z);
      turn(a, face, dt, 12);
      play(a, anim, anim === 'Jump' || anim === 'HitReact');
      a.mixer.update(dt);
    }
  }
  function guests(ms, dt) {
    for (const gu of seated) {
      if (ms < 15000) { gu.rest = 'sit'; gu.root.position.y = 0.12; }
      else { gu.rest = (Math.floor(ms / 700 + gu.phase) % 3) ? 'jump' : 'emote-no'; gu.root.position.y = 0; }
      c.gAnim(gu, gu.rest); gu.mixer.update(dt);
    }
    if (ms >= 15000 && !rushOn) {                       // 주문 폭주: 양쪽에서 손님이 달려옴
      rushOn = true;
      for (let i = 0; i < 12; i++) {
        const s = i % 2 ? 1 : -1, gu = c.makeGuest(s * (19 + rnd(i) * 3), 7.5 + rnd(i + 7) * 3); if (!gu) continue;
        gu.speed = 6; gu.tx = s * (1.8 + (Math.floor(i / 2) % 4) * 1.45 + rnd(i + 3) * 0.3); gu.tz = 6.9 + Math.floor(i / 8) * 1.2 + rnd(i + 11) * 0.9; gu.rest = 'jump';
        if (ms > 17500) { gu.root.position.set(gu.tx, 0, gu.tz); }      // 늦게 들어온 학생 화면: 이미 와 있는 것으로
        rushers.push(gu);
      }
    }
    if (ms >= 32000 && !asideOn) { asideOn = true; rushers.forEach((gu, i) => { const s = gu.tx >= 0 ? 1 : -1; gu.tx = s * (7.6 + (i % 4) * 0.8); gu.speed = 5; }); }
    for (const gu of rushers) { gu.rest = ms < 32000 ? ((Math.floor(ms / 600 + gu.phase) % 4) ? 'jump' : 'emote-no') : ms > 46300 ? 'jump' : 'idle'; c.gStep(gu, dt); }
  }
  function cardsAt(ms) {
    for (let i = 0; i < cards.length; i++) {
      const q = cards[i], m = q.m;
      m.visible = ms >= q.t0; if (!m.visible) continue;
      const s = (ms - q.t0) / 1000, rest = 0.02 + i * 0.0015, y = q.y0 - q.v * s;
      if (y > rest) {
        m.position.set(q.x + Math.sin(s * 3 + q.ph) * 0.45, y, q.z + Math.cos(s * 2.3 + q.ph) * 0.3);
        m.rotation.set(Math.sin(s * 4 + q.ph) * 1.1, s * 2 + q.ph, Math.cos(s * 5 + q.ph) * 0.6);
      } else {
        const sl = (q.y0 - rest) / q.v;
        m.position.set(q.x + Math.sin(sl * 3 + q.ph) * 0.45, rest, q.z + Math.cos(sl * 2.3 + q.ph) * 0.3);
        m.rotation.set(-Math.PI / 2, 0, q.rz);
      }
    }
  }
  function bookAt(ms, t) {
    book.visible = ms > 24300;
    if (!book.visible) return;
    const yEnd = 1.95, k = seg(ms, 24300, 24650), bounce = ms > 24650 && ms < 25000 ? Math.sin(Math.PI * (ms - 24650) / 350) * 0.12 : 0;
    book.position.set(0, lerp(5.5, yEnd, k) + bounce, wz(1) + 0.82);
    const shake = (ms > 26000 && ms < 26600) || (ms > 28200 && ms < 28800) ? 1 : 0;
    const lock = book.userData.lock; lock.rotation.z = shake * Math.sin(t / 28) * 0.35; book.rotation.z = shake * Math.sin(t / 35) * 0.04;
    book.userData.gold.emissiveIntensity = 0.3 + Math.abs(Math.sin(t / 300)) * 0.5;
  }
  function panFx(ms, dt) {
    pan.visible = ms < 15000; for (const m of pan.userData.dishes || []) m.visible = ms < 32000;
    if (ms < 7000 && Math.random() < dt * 10) c.burst(pan.position.x, pan.position.y + 0.1, pan.position.z, Math.random() < 0.5 ? 0xffa53c : 0xffe08a, 1, 0.5);
  }

  // ───────── 카메라 ─────────
  function shot(ms) {
    const set = (p, l) => { camPos.set(...p); camLook.set(...l); };
    const mix = (p0, l0, p1, l1, k) => set(p0.map((v, i) => lerp(v, p1[i], k)), l0.map((v, i) => lerp(v, l1[i], k)));
    const chef = head.root.position;
    if (ms < 2800) mix([-15.5, 4.2, 5.2], [-12.4, 0.7, -2.2], [-10.2, 4.8, 5.6], [-12.4, 0.8, -2.0], seg(ms, 0, 2800));
    else if (ms < 7000) mix([-10.2, 4.8, 5.6], [-12.4, 0.8, -2.0], [3.2, 4.4, 7.0], [1.5, 1.1, -0.6], seg(ms, 2800, 6400));
    else if (ms < 12300) mix([2.7, 2.9, 3.7], [1.5, 1.55, -0.6], [2.1, 2.55, 2.5], [1.5, 1.55, -0.6], seg(ms, 7000, 12300));
    else if (ms < 15000) { const lx = Math.min(chef.x, 8.5), lz = Math.min(chef.z, 4.6); mix([2.1, 2.55, 2.5], [1.5, 1.55, -0.6], [lx - 1.5, 4.6, lz + 7.4], [lx, 1.0, lz], seg(ms, 12300, 12900)); }
    else if (ms < 20200) mix([0, 9.5, 17.5], [0, 0.4, 3.8], [0, 8.6, 15.5], [0, 0.5, 3.6], seg(ms, 15000, 20200));
    else if (ms < 24000) mix([0, 8.6, 15.5], [0, 0.5, 3.6], [0.5, 4.6, 8.4], [0.5, 0.9, wz(7.6)], seg(ms, 20200, 21400));
    else if (ms < 24900) mix([0.5, 4.6, 8.4], [0.5, 0.9, wz(7.6)], [-0.8, 3.2, 2.0], [-0.4, 1.7, -4.1], seg(ms, 24000, 24900));
    else if (ms < 30000) mix([-0.8, 3.2, 2.0], [-0.4, 1.7, -4.1], [-0.3, 2.4, -0.7], [0, 1.9, -4.15], seg(ms, 24900, 30000));
    else if (ms < 32000) mix([-0.3, 2.4, -0.7], [0, 1.9, -4.15], [-0.9, 2.8, 0.7], [-1.2, 1.5, -3.6], seg(ms, 30000, 31200));
    else if (ms < 35000) set([0, 1.9, 13.4], [0, 1.2, 3.4]);
    else if (ms < 39000) mix([0, 1.9, 13.4], [0, 1.2, 3.4], [0, 3.5, 7.8], [0, 0.85, wz(8.6)], seg(ms, 35000, 36800));
    else if (ms < 42200) set([7.4, 3.0, 0.7], [0, 1.1, 0.5]);
    else if (ms < 45000) mix([1.0, 1.55, 1.4], [0, 1.05, -1.6], [0.45, 1.3, 0.2], [0, 1.05, -1.6], seg(ms, 42200, 45000));
    else if (ms < 46300) set([0, 1.9, -0.5], [0, 0.8, wz(8.6)]);
    else if (ms < 48300) mix([0, 1.6 + chef.y * 0.9, 1.3], [0, 1.15 + chef.y, -1.6], [0, 1.5 + chef.y * 0.9, 0.55], [0, 1.2 + chef.y, -1.6], seg(ms, 46300, 46650));
    else { const g = c.gameCamPose(); mix([0, 1.5, 0.55], [0, 1.2, -1.6], g.pos.toArray(), g.look.toArray(), seg(ms, 48300, 50600)); }
    // 화면 흔들림
    const amp = ms > 15000 && ms < 19500 ? 0.05 : ms > 20400 && ms < 24000 ? 0.08 : ms > 46300 && ms < 47800 ? 0.16 * (1 - (ms - 46300) / 1500) : 0;
    if (amp) camPos.add(V((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, 0));
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  function light(ms, t) {
    if (ms > 15000 && ms < 24000) { const k = 0.5 + Math.sin(t / 120) * 0.5; c.sun.color.setRGB(1, 0.82 - k * 0.25, 0.72 - k * 0.35); }
    else if (ms > 24000 && ms < 32000) { c.sun.color.setRGB(0.85, 0.82, 0.95); c.hemi.intensity = 0.95; }
  }

  // 시각에 맞춰 한 번씩 터지는 효과 (건너뛰어 크게 넘어간 경우는 생략)
  const EVENTS = [
    [2200, () => { const g = seated[0]; if (g) c.shout('맛있다!', g.root.position.x - 0.75, 1.9, g.root.position.z); }],
    [4800, () => { const g = seated[2]; if (g) c.shout('최고예요!', g.root.position.x - 0.75, 1.9, g.root.position.z); }],
    [7750, () => { c.ring(head.root.position.x, 1.2, head.root.position.z, 0xffffff, 1); c.burst(head.root.position.x, 1.3, head.root.position.z + 0.3, 0xffd66b, 8, 0.8); }],
    [10050, () => c.shout('두근두근!', head.root.position.x - 0.75, 2.6, head.root.position.z)],
    [14150, () => c.burst(head.root.position.x, 0.5, head.root.position.z, 0xe9d8c0, 10, 1)],
    ...[['주문이요!', 15500], ['여기요!', 16300], ['햄버거 세 개!', 17200], ['케이크도요!', 18200], ['빨리요~!', 19000], ['피자 아직이에요?', 19800]].map(([w, at], i) => [at, () => { const g = rushers[(i * 5) % Math.max(1, rushers.length)]; if (g) c.shout(w, g.root.position.x - 0.75, 1.95, g.root.position.z); }]),
    [20900, () => c.burst(head.root.position.x, 0.5, head.root.position.z, 0xe9d8c0, 10, 1)],
    [24650, () => { c.burst(0, 1.3, wz(1) + 0.9, 0xe9d8c0, 14, 1.2); c.ring(0, TOP + 0.05, wz(1) + 1.1, 0xffffff, 1.4); }],
    [26050, () => c.burst(0, 1.95, wz(1) + 1.0, 0xffd66b, 8, 0.9)],
    [28250, () => c.burst(0, 1.95, wz(1) + 1.0, 0xffd66b, 8, 0.9)],
    [45050, () => c.shout('아니요!', 0 - 0.75, 2.3, wz(8.6), '#fffdf5', '#2e2520', 0.7)],
    [46350, () => { c.shout('뭐어어어?!', -0.75, 2.05, -0.9, '#d6452f', '#ffffff', 0.5); c.ring(0, 0.06, -1.6, 0xd6452f, 1.8); }],
    [47700, () => c.burst(0, 0.2, -1.6, 0xe9d8c0, 12, 1.2)],
  ];

  function fitTag(sp, base) {
    sp.getWorldPosition(tmp); const d = camera.position.distanceTo(tmp), f = Math.max(0.3, Math.min(1, (d - 1.5) / 8));
    if (!sp.userData.base) sp.userData.base = sp.scale.clone();
    sp.scale.set(sp.userData.base.x * f, sp.userData.base.y * f, 1); if (d < 3) sp.visible = false;
  }
  function update(ms, dt, t, info) {
    if (!built) build(info);
    c.hemi.intensity = 1.25;
    headChef(ms, dt, t); letterAt(ms); students(ms, dt); guests(ms, dt); cardsAt(ms); bookAt(ms, t); panFx(ms, dt); light(ms, t); shot(ms);
    if (headTag.visible) fitTag(headTag); for (const a of studs) { const tg = a.root.children.find(o => o.isSprite); if (tg) { tg.visible = true; fitTag(tg); } }
    if (lastMs >= 0) for (const [at, fn] of EVENTS) if (lastMs < at && ms >= at && ms - at < 700) fn();
    lastMs = ms;
  }
  function end() {
    if (!built) return;
    built = false;
    for (const gu of [...seated, ...rushers]) c.removeGuest(gu);
    seated = []; rushers = [];
    for (const a of [head, ...studs]) if (a) a.mixer.stopAllAction();
    studs = []; cards = [];
    scene.remove(root);
    root.traverse(o => { if (o.isMesh || o.isSprite) { o.geometry?.dispose?.(); if (o.material?.map && !o.material.map.userData?.shared) o.material.map.dispose(); o.material?.dispose?.(); } });
    root = null; head = null;
    for (const gu of hidden) gu.root.visible = true;
    hidden = [];
  }
  return { update, end, get active() { return built; }, INTRO_MS, TITLE_AT };
}
