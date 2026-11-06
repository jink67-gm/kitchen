// Phaser 장면: 지도, 요리사, 설비, 입력. 게임 규칙은 teamState.js와 stations.js에 있고,
// 공유 상태는 session을 통해서만 읽고 바꾼다. 혼자 하기와 모둠 하기가 같은 장면을 쓴다.
import { CONFIG } from '../config.js';
import { getHint, newStations, planOrders, potState } from './stations.js';
import { activeOrders, applyUse, needsTick, startOrders, takeIngredient, tickOrders } from './teamState.js';
import { makeProblem } from '../problems.js';
import { starsFor } from '../scoring.js';
import { drawFrac } from '../ui/fracview.js';
import { ALL_ICONS, DISHES, INGREDIENTS, iconPath } from '../recipes.js';
import { ANIMALS, buildBackground, buildChef, buildProps, soupColor } from './art.js';
import { ChefView, dirCode } from './ChefView.js';

const C = CONFIG.COLORS;
const T = CONFIG.TILE;
const LIFT = CONFIG.LIFT;
const FONT = 'Galmuri11, sans-serif';
const ANIMAL_ORDER = ['cat', 'bear', 'rabbit', 'chick', 'panda'];
const STATUS_COLOR = { yellow: C.yellow, green: C.green, cooking: C.green, done: C.green, red: C.red, burnt: C.burnt };
const iconOf = (ingredient) => INGREDIENTS[ingredient].icon;
const textStyle = (size, color = '#2b2b2b', extra = {}) => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color,
  resolution: 2,
  ...extra,
});

export class KitchenScene extends Phaser.Scene {
  constructor() {
    super('kitchen');
  }

  // data: { stage, session, uid, me:{name,color}, mates, semester, types, check, answerRule, seed, startAt,
  //         hud, openProblem, controls, onReady, onEnd }
  init(data) {
    Object.assign(this, data);
    this.ctx = { seed: this.seed, semester: this.semester, types: this.types, dishes: this.stage.dishes };
    this.syncView();
    this.solved = 0;
    this.correct = 0;
    this.locked = false;
    this.started = false;
    this.finished = false;
    this.acting = false;
    this.facing = null;
    this.route = null;
    this.hint = null;
    this.nextPlanAt = 0;
    this.nextTickAt = 0;
    this.nextPosAt = 0;
    this.lastPos = '';
    this.orderKey = '';
    this.dir = { x: 0, y: 1 };
    this.others = new Map();
    this.positions = {};
  }

  // session의 최신 상태를 읽어 온다.
  syncView() {
    const { view } = this.session;
    this.stations = view.stations;
    this.orders = activeOrders(view, this.ctx);
    this.hand = view.hands[this.uid] ?? null;
    this.allHands = Object.values(view.hands);
    this.score = view.score;
  }

  preload() {
    for (const name of ALL_ICONS) {
      if (!this.textures.exists(name)) this.load.svg(name, iconPath(name), { width: 96, height: 96 });
    }
  }

  create() {
    this.tileX = (x) => CONFIG.KITCHEN_X + x * T + T / 2;
    this.tileY = (y) => CONFIG.KITCHEN_Y + y * T + T / 2;
    this.topY = (y) => this.tileY(y) - LIFT; // 조리대 윗면의 가운데
    this.layout = newStations(this.stage);

    buildProps(this);
    ANIMAL_ORDER.forEach((name, i) => buildChef(this, `chef${i}`, ANIMALS[name], CONFIG.CHEF_COLORS[i]));
    buildBackground(this, this.stage, this.layout, iconOf);
    this.add.image(0, 0, 'bg').setOrigin(0).setDepth(0);

    this.createStationViews();
    this.createPlayer();

    this.highlight = this.add.graphics().setDepth(1500);
    this.hoverBox = this.add.graphics().setDepth(1499);
    this.hintRing = this.add.graphics().setDepth(1498);
    this.hintArrow = this.add.image(0, 0, 'arrow').setDepth(4000).setVisible(false).setOrigin(0.5, 1).setScale(0.85);

    this.keys = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,E,ENTER');
    this.keys.SPACE.on('down', () => this.pressA());
    this.keys.ENTER.on('down', () => this.pressA());
    this.keys.E.on('down', () => this.pressB());

    // 설비나 바닥을 클릭·터치하면 그곳으로 걸어간다.
    this.input.on('pointerdown', (p) => this.onPointerDown(p));
    this.input.on('pointermove', (p) => this.onPointerMove(p));

    this.toastBox = this.add
      .text(CONFIG.WORLD_W / 2, CONFIG.KITCHEN_Y + 40, '', textStyle(26, '#ffffff', { backgroundColor: '#2b2118e6', padding: { x: 18, y: 10 } }))
      .setOrigin(0.5, 0)
      .setDepth(5000)
      .setVisible(false);
    this.countdown = this.add
      .text(CONFIG.WORLD_W / 2, CONFIG.WORLD_H / 2, '', textStyle(120, '#fff4d6', { fontStyle: 'bold', stroke: '#2b2118', strokeThickness: 12 }))
      .setOrigin(0.5)
      .setDepth(5000)
      .setVisible(false);

    window.__kitchen = this; // 브라우저 확인용
    this.onReady?.(this);
  }

  // 혼자 하기: 시작 안내에서 '영업 시작'을 누르면 호출된다.
  startRound() {
    if (this.started) return;
    const now = this.session.now();
    this.startAt = now;
    this.session.act((game) => startOrders(game, now, this.concurrent()));
    this.beginPlay();
  }

  beginPlay() {
    this.started = true;
    this.endAt = this.startAt + this.stage.timeSec * 1000;
    this.countdown.setVisible(false);
    this.hud.showHint?.();
  }

  concurrent() {
    return this.stage.concurrent;
  }

  /* ---------- 설비 그림 ---------- */

  createStationViews() {
    this.potViews = {};
    this.itemViews = {};
    this.flames = {};
    this.steam = {};
    this.smoke = {};
    for (const s of Object.values(this.layout)) {
      const cx = this.tileX(s.x);
      const cy = this.topY(s.y);
      if (s.type === 'stove') {
        const f1 = this.add.image(cx - 15, cy + 22, 'flame').setDepth(this.tileY(s.y)).setVisible(false);
        const f2 = this.add.image(cx + 15, cy + 22, 'flame').setDepth(this.tileY(s.y)).setVisible(false);
        const f3 = this.add.image(cx, cy + 26, 'flame').setDepth(this.tileY(s.y)).setVisible(false).setScale(0.8);
        this.flames[s.id] = [f1, f2, f3];
        this.potViews[s.id] = this.add.container(cx, cy).setDepth(this.tileY(s.y) + 1);
        this.steam[s.id] = this.add.particles(cx, cy - 20, 'puff', {
          speedY: { min: -70, max: -40 },
          speedX: { min: -14, max: 14 },
          lifespan: 1100,
          scale: { start: 0.35, end: 1 },
          alpha: { start: 0.65, end: 0 },
          frequency: 170,
          emitting: false,
        }).setDepth(3000);
        this.smoke[s.id] = this.add.particles(cx, cy - 20, 'puff', {
          speedY: { min: -80, max: -50 },
          speedX: { min: -20, max: 20 },
          lifespan: 1400,
          scale: { start: 0.5, end: 1.5 },
          alpha: { start: 0.8, end: 0 },
          tint: 0x3a3a3a,
          frequency: 140,
          emitting: false,
        }).setDepth(3000);
      }
      if (s.type === 'serve') {
        this.bell = this.add.image(cx + 28, cy - 34, 'bell').setDisplaySize(34, 34).setDepth(this.tileY(s.y) + 2);
      }
    }
  }

  /* ---------- 요리사 ---------- */

  createPlayer() {
    const color = this.me?.color ?? 0;
    const x = this.tileX(4 + (color % 5));
    const y = this.tileY(2);
    const r = CONFIG.PLAYER_RADIUS;
    this.player = this.add.circle(x, y, r, 0xffffff, 0);
    this.physics.add.existing(this.player);
    this.player.body.setCircle(r);
    this.player.body.setCollideWorldBounds(true);

    this.walls = this.physics.add.staticGroup();
    for (const s of Object.values(this.layout)) {
      this.walls.add(this.add.rectangle(this.tileX(s.x), this.tileY(s.y), T, T).setVisible(false));
    }
    this.physics.add.collider(this.player, this.walls);
    this.chef = new ChefView(this, `chef${color % 5}`, x, y, this.me?.name ?? '');
  }

  // 같은 모둠 친구들의 위치를 받는다.
  setPositions(positions) {
    this.positions = positions;
  }

  updateOthers(time, delta) {
    for (const [uid, pos] of Object.entries(this.positions)) {
      if (uid === this.uid) continue;
      let other = this.others.get(uid);
      if (!other) {
        const mate = this.mates?.[uid] ?? {};
        other = { x: pos.x, y: pos.y, view: new ChefView(this, `chef${(mate.color ?? 1) % 5}`, pos.x, pos.y, mate.name ?? '') };
        this.others.set(uid, other);
      }
      // 초당 8번 오는 위치 사이를 부드럽게 잇는다.
      const k = Math.min(1, delta * 0.012);
      const dx = pos.x - other.x;
      const dy = pos.y - other.y;
      other.x += dx * k;
      other.y += dy * k;
      const moving = Math.hypot(dx, dy) > 4;
      other.view.update(other.x, other.y, moving, pos.dir ?? 0, this.session.view.hands[uid] ?? null, time);
    }
    for (const [uid, other] of this.others) {
      if (!this.positions[uid]) {
        other.view.destroy();
        this.others.delete(uid);
      }
    }
  }

  publishPosition(now) {
    if (now < this.nextPosAt) return;
    const pos = { x: Math.round(this.player.x), y: Math.round(this.player.y), dir: dirCode(this.dir) };
    const key = `${pos.x},${pos.y},${pos.dir}`;
    if (key === this.lastPos) return; // 움직일 때만 기록한다
    this.lastPos = key;
    this.nextPosAt = now + CONFIG.POS_INTERVAL_MS;
    this.session.publishPosition(pos);
  }

  /* ---------- 매 프레임 ---------- */

  update(time, delta) {
    const now = this.session.now();
    this.syncView();
    this.updateStations(now, time);
    this.updateOthers(time, delta);
    const body = this.player.body;
    this.chef.update(this.player.x, this.player.y, Math.abs(body.velocity.x) + Math.abs(body.velocity.y) > 10, dirCode(this.dir), this.hand, time);
    this.updateFacing();
    this.drawHighlight(time);
    this.renderOrdersIfChanged();

    if (!this.started && this.startAt) {
      const left = Math.ceil((this.startAt - now) / 1000);
      if (left > 0) {
        this.countdown.setText(`${left}`).setVisible(true);
      } else {
        this.beginPlay();
      }
    }
    if (!this.started || this.finished) return;

    this.updateMovement();
    this.publishPosition(now);
    this.tick(now);
    this.hud.renderStatus({
      score: this.score,
      remainingSec: Math.max(0, Math.ceil((this.endAt - now) / 1000)),
    });
    this.hud.updateOrderBars(this.orders, now);
    if (time >= this.nextPlanAt) {
      this.nextPlanAt = time + 180;
      this.refreshGuide(now);
    }
    this.drawHintArrow(time);
    if (now >= this.endAt) this.finish();
  }

  renderOrdersIfChanged() {
    const key = this.orders.map((o) => o.id).join();
    if (key === this.orderKey) return;
    this.orderKey = key;
    this.hud.renderOrders(this.orders);
  }

  tick(now) {
    if (now < this.nextTickAt) return;
    this.nextTickAt = now + CONFIG.TICK_INTERVAL_MS;
    if (!needsTick(this.session.view, now, this.ctx, this.concurrent())) return;
    this.session.act((game) => tickOrders(game, now, this.ctx, this.concurrent())).then((r) => {
      if (r?.expired) this.toast('주문 시간이 지났어요');
    });
  }

  refreshGuide(now) {
    const plan = planOrders(this.stations, this.allHands, this.orders, now);
    this.hud.updateTicks(this.orders, plan);
    this.hint = getHint({ stations: this.stations, hand: this.hand, orders: this.orders, now, allHands: this.allHands });
    this.hud.renderHint(this.hint.text);
  }

  drawHintArrow(time) {
    const target = this.locked ? null : this.hint?.target && this.stations[this.hint.target];
    this.hintArrow.setVisible(!!target);
    this.hintRing.clear();
    if (!target) return;
    const lift = Math.abs(Math.sin(time / 260)) * 14;
    // 맨 윗줄은 위쪽이 주문서에 가리므로 아래에서 위로 가리킨다.
    if (target.y === 0) {
      this.hintArrow.setFlipY(true).setOrigin(0.5, 0).setPosition(this.tileX(target.x), this.tileY(target.y) + T / 2 + 2 + lift);
    } else {
      this.hintArrow.setFlipY(false).setOrigin(0.5, 1).setPosition(this.tileX(target.x), this.topY(target.y) - 34 - lift);
    }
    const glow = 0.45 + Math.abs(Math.sin(time / 260)) * 0.55;
    this.hintRing
      .lineStyle(7, 0xff8c2e, glow)
      .strokeRoundedRect(this.tileX(target.x) - T / 2 - 1, this.topY(target.y) - T / 2 - 1, T + 2, T + 2, 12);
  }

  updateMovement() {
    const body = this.player.body;
    if (this.locked) {
      body.setVelocity(0, 0);
      return;
    }
    const k = this.keys;
    let x = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let y = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (!x && !y && this.controls) {
      x = this.controls.move.x;
      y = this.controls.move.y;
    }
    const len = Math.hypot(x, y);
    if (len > 0) {
      this.route = null; // 직접 움직이면 걸어가던 길을 멈춘다
      const scale = Math.min(1, len) / len;
      body.setVelocity(x * scale * CONFIG.PLAYER_SPEED, y * scale * CONFIG.PLAYER_SPEED);
      this.dir = { x: x / len, y: y / len };
      return;
    }
    if (this.route) {
      this.followRoute();
      return;
    }
    body.setVelocity(0, 0);
  }

  /* ---------- 클릭·터치로 걸어가기 ---------- */

  stationAtPoint(px, py) {
    const col = Math.floor((px - CONFIG.KITCHEN_X) / T);
    const lifted = Math.floor((py + LIFT - CONFIG.KITCHEN_Y) / T);
    const exact = Math.floor((py - CONFIG.KITCHEN_Y) / T);
    return this.stations[`${col},${lifted}`] ?? this.stations[`${col},${exact}`] ?? null;
  }

  onPointerMove(p) {
    const s = this.started && !this.locked ? this.stationAtPoint(p.worldX, p.worldY) : null;
    this.game.canvas.style.cursor = s ? 'pointer' : 'default';
    this.hoverBox.clear();
    if (s) this.hoverBox.lineStyle(3, 0xffffff, 0.8).strokeRoundedRect(this.tileX(s.x) - T / 2 + 3, this.topY(s.y) - T / 2 + 3, T - 6, T - 6, 8);
  }

  onPointerDown(p) {
    if (!this.started || this.finished || this.locked) return;
    const station = this.stationAtPoint(p.worldX, p.worldY);
    if (station) {
      this.goTo(station);
      return;
    }
    const col = Math.floor((p.worldX - CONFIG.KITCHEN_X) / T);
    const row = Math.floor((p.worldY - CONFIG.KITCHEN_Y) / T);
    if (this.isFloor(col, row)) this.route = this.makeRoute([[col, row]], null);
  }

  isFloor(col, row) {
    return this.stage.map[row]?.[col] === '.';
  }

  distanceTo(station) {
    return Math.hypot(this.tileX(station.x) - this.player.x, this.tileY(station.y) - this.player.y);
  }

  goTo(station) {
    if (this.distanceTo(station) <= T * CONFIG.REACH) {
      this.route = null;
      this.useStation(station);
      return;
    }
    const goals = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dx, dy]) => [station.x + dx, station.y + dy])
      .filter(([x, y]) => this.isFloor(x, y));
    const route = this.makeRoute(goals, station);
    if (route) this.route = route;
    else this.toast('그쪽으로 갈 수 없어요');
  }

  // 칸 단위로 가장 짧은 길을 찾는다.
  makeRoute(goals, station) {
    const startCol = Math.floor((this.player.x - CONFIG.KITCHEN_X) / T);
    const startRow = Math.floor((this.player.y - CONFIG.KITCHEN_Y) / T);
    const key = (x, y) => `${x},${y}`;
    const goalSet = new Set(goals.map(([x, y]) => key(x, y)));
    const prev = new Map([[key(startCol, startRow), null]]);
    const queue = [[startCol, startRow]];
    let end = null;
    while (queue.length) {
      const [x, y] = queue.shift();
      if (goalSet.has(key(x, y))) {
        end = [x, y];
        break;
      }
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isFloor(nx, ny) || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), [x, y]);
        queue.push([nx, ny]);
      }
    }
    if (!end) return null;
    const points = [];
    for (let at = end; at; at = prev.get(key(at[0], at[1]))) points.unshift(at);
    return { points, index: 0, station: station ? station.id : null, lastX: this.player.x, lastY: this.player.y, stillFrames: 0 };
  }

  // 시간이 아니라 '움직이지 않은 프레임 수'로 판단한다. 느린 기기나 화면 끊김에도 길을 멈추지 않는다.
  routeIsStuck(route) {
    const moved = Math.hypot(this.player.x - route.lastX, this.player.y - route.lastY);
    route.lastX = this.player.x;
    route.lastY = this.player.y;
    route.stillFrames = moved < 0.2 ? route.stillFrames + 1 : 0;
    return route.stillFrames > 60;
  }

  followRoute() {
    const route = this.route;
    const body = this.player.body;
    const station = route.station ? this.stations[route.station] : null;
    if (station && this.distanceTo(station) <= T * 1.05) {
      this.arrive(station);
      return;
    }
    const [col, row] = route.points[route.index];
    const tx = this.tileX(col);
    const ty = this.tileY(row);
    const dx = tx - this.player.x;
    const dy = ty - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) {
      route.index++;
      if (route.index >= route.points.length) {
        if (station) this.arrive(station);
        else {
          this.route = null;
          body.setVelocity(0, 0);
        }
      }
      return;
    }
    if (this.routeIsStuck(route)) {
      this.route = null;
      body.setVelocity(0, 0);
      return;
    }
    body.setVelocity((dx / dist) * CONFIG.PLAYER_SPEED, (dy / dist) * CONFIG.PLAYER_SPEED);
    this.dir = { x: dx / dist, y: dy / dist };
  }

  arrive(station) {
    this.route = null;
    this.player.body.setVelocity(0, 0);
    const dx = this.tileX(station.x) - this.player.x;
    const dy = this.tileY(station.y) - this.player.y;
    const len = Math.hypot(dx, dy) || 1;
    this.dir = { x: dx / len, y: dy / len };
    this.useStation(station);
  }

  /* ---------- 바라보는 설비 ---------- */

  stationInReach(requireFacing) {
    const px = this.player.x;
    const py = this.player.y;
    let best = null;
    let bestScore = Infinity;
    for (const s of Object.values(this.stations)) {
      const dx = this.tileX(s.x) - px;
      const dy = this.tileY(s.y) - py;
      const dist = Math.hypot(dx, dy);
      if (dist > T * CONFIG.REACH) continue;
      const dot = (dx * this.dir.x + dy * this.dir.y) / (dist || 1);
      if (requireFacing && dot < 0.25) continue;
      const score = dist - dot * 40;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  updateFacing() {
    this.facing = this.stationInReach(true) ?? this.stationInReach(false);
  }

  drawHighlight(time) {
    this.highlight.clear();
    if (!this.facing || this.locked || !this.started) return;
    const pulse = 0.65 + Math.sin(time / 170) * 0.35;
    this.highlight
      .lineStyle(6, C.highlight, pulse)
      .strokeRoundedRect(this.tileX(this.facing.x) - T / 2 + 2, this.topY(this.facing.y) - T / 2 + 2, T - 4, T - 4, 10);
  }

  /* ---------- 설비 상태 그리기 ---------- */

  updateStations(now, time) {
    for (const s of Object.values(this.stations)) {
      if (s.type === 'stove') this.drawPot(s, now, time);
      if (s.type === 'counter') this.drawCounterItem(s);
    }
  }

  // 냄비 그림은 상태가 바뀔 때만 다시 만들고, 진행 막대·불꽃만 매 프레임 움직인다.
  drawPot(s, now, time) {
    const view = this.potViews[s.id];
    const pot = s.pot;
    const state = pot ? potState(pot, this.orders, now) : null;
    const status = state?.status ?? 'none';
    const key = pot ? `${status}|${JSON.stringify(pot.contents)}` : 'none';
    if (view.key !== key) {
      view.key = key;
      view.removeAll(true);
      view.barFill = null;
      if (pot) this.buildPotView(view, s, pot, status);
    }
    const lit = status === 'cooking' || status === 'done';
    this.flames[s.id].forEach((f, i) => {
      f.setVisible(lit);
      if (lit) f.setScale(0.75 + Math.sin(time / 70 + i * 2) * 0.16, 0.85 + Math.sin(time / 53 + i) * 0.22);
    });
    this.toggleEmitter(this.steam[s.id], lit);
    this.toggleEmitter(this.smoke[s.id], status === 'burnt');

    if (view.barFill) {
      const ratio = status === 'cooking' ? state.progress : status === 'done' ? state.burnProgress : 0;
      let color = C.green;
      if (status === 'done') color = state.burnProgress > 0.6 && Math.floor(time / 150) % 2 ? 0xffffff : C.red;
      view.barFill.clear().fillStyle(color, 1).fillRect(-34, -52, 68 * Math.min(1, ratio), 8);
    }
    view.y = lit ? this.topY(s.y) + Math.sin(time / 60) * 1.2 : this.topY(s.y);
  }

  toggleEmitter(emitter, on) {
    if (emitter.emitting !== on) emitter.emitting = on;
  }

  buildPotView(view, s, pot, status) {
    const color = STATUS_COLOR[status];
    if (color !== undefined && status !== 'burnt') {
      view.add(this.add.ellipse(0, 6, 88, 62).setStrokeStyle(6, color, 0.95));
    }
    const potImg = this.add.image(0, -4, 'pot');
    if (status === 'burnt') potImg.setTint(0x4a4440);
    view.add(potImg);

    const names = Object.keys(pot.contents);
    if (names.length) {
      view.add(this.add.ellipse(0, -16, 54, 24, status === 'burnt' ? 0x201c1a : soupColor(pot.contents)));
      names.slice(0, 3).forEach((name, i) => {
        const img = this.add.image(-16 + i * 16, -18, iconOf(name)).setDisplaySize(26, 26);
        if (status === 'burnt') img.setTint(0x333333);
        view.add(img);
      });
      this.addPotCard(view, s, pot, color);
    }

    if (status === 'cooking' || status === 'done') {
      view.add(this.add.rectangle(0, -48, 72, 12, 0x1f1a16).setStrokeStyle(2, 0xffffff));
      view.barFill = this.add.graphics();
      view.add(view.barFill);
    }
    const word = { yellow: '재료를 더!', red: '맛이 이상해!', burnt: '탔어요!', done: '완성!' }[status];
    if (word) {
      const bg = { yellow: '#a86f00', red: '#c62e25', burnt: '#2e2a28', done: '#23833a' }[status];
      const y = status === 'done' ? -72 : -52;
      view.add(this.add.text(0, y, word, textStyle(18, '#ffffff', { fontStyle: 'bold', backgroundColor: bg, padding: { x: 8, y: 4 } })).setOrigin(0.5));
    }
  }

  // 냄비에 든 재료와 양을 카드로 보여 준다. 캐릭터를 가리지 않도록 맨 아래 줄은 아래쪽에 띄운다.
  addPotCard(view, s, pot, color) {
    const lines = Object.entries(pot.contents);
    const rowH = 44;
    const width = 138;
    const height = 8 + lines.length * rowH;
    const below = s.y === this.stage.map.length - 1;
    const centerY = below ? T / 2 + LIFT + 14 + height / 2 : -T / 2 - 8 - height / 2;
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.97).fillRoundedRect(-width / 2, centerY - height / 2, width, height, 10);
    bg.lineStyle(3, color ?? 0x999999, 1).strokeRoundedRect(-width / 2, centerY - height / 2, width, height, 10);
    view.add(bg);
    lines.forEach(([name, amount], i) => {
      const rowY = centerY - ((lines.length - 1) * rowH) / 2 + i * rowH;
      view.add(this.add.image(-width / 2 + 24, rowY, iconOf(name)).setDisplaySize(32, 32));
      view.add(drawFrac(this, 26, rowY, amount, INGREDIENTS[name].unit, { size: 18 }));
    });
  }

  drawCounterItem(s) {
    const key = s.item ? JSON.stringify(s.item) : '';
    let view = this.itemViews[s.id];
    if ((view?.key ?? '') === key) return;
    view?.destroy();
    delete this.itemViews[s.id];
    if (!s.item) return;
    view = this.add.container(this.tileX(s.x), this.topY(s.y)).setDepth(this.tileY(s.y) + 1);
    view.key = key;
    this.fillItemView(view, s.item, true);
    this.itemViews[s.id] = view;
  }

  drawAmount(x, y, amount, unit, size) {
    return drawFrac(this, x, y, amount, unit, { size });
  }

  fillItemView(view, item, withAmount) {
    if (item.kind === 'ingredient') {
      view.add(this.add.image(0, withAmount ? -12 : 0, iconOf(item.ingredient)).setDisplaySize(50, 50));
      if (withAmount) {
        const card = this.add.graphics();
        card.fillStyle(0xffffff, 0.95).fillRoundedRect(-36, 8, 72, 32, 7);
        view.add(card);
        view.add(drawFrac(this, 0, 24, item.amount, '', { size: 16 }));
      }
    } else if (item.kind === 'plate') {
      view.add(this.add.image(0, 0, 'plate'));
      if (item.meal) {
        const icon = DISHES[item.meal.dish]?.icon ?? 'pot-of-food';
        view.add(this.add.image(0, -6, icon).setDisplaySize(44, 44));
      }
    } else if (item.kind === 'pot') {
      view.add(this.add.image(0, 0, 'pot').setScale(0.75));
    }
  }

  /* ---------- 화면 효과 ---------- */

  toast(message) {
    this.toastBox.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(1700, () => this.toastBox.setVisible(false));
  }

  floatText(x, y, text, color = '#ffe27a') {
    const t = this.add
      .text(x, y, text, textStyle(34, color, { fontStyle: 'bold', stroke: '#2b2118', strokeThickness: 6 }))
      .setOrigin(0.5)
      .setDepth(5000);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /* ---------- 행동 ---------- */

  pressA() {
    if (!this.started || this.locked || this.finished) return;
    const target = this.facing;
    if (!target) {
      this.toast('설비 가까이 가서 눌러요. 설비를 바로 눌러도 돼요');
      return;
    }
    this.useStation(target);
  }

  async useStation(station) {
    if (this.locked || this.finished || this.acting) return;
    this.acting = true; // 저장이 끝나기 전에 또 누르면 무시한다
    const stationId = station.id;
    const now = this.session.now();
    let result;
    try {
      result = await this.session.act((game) => applyUse(game, this.uid, stationId, now, this.ctx));
    } catch (error) {
      console.error(error);
      this.toast('저장하지 못했어요. 다시 눌러 주세요');
      return;
    } finally {
      this.acting = false;
    }
    this.syncView();
    if (result?.message) this.toast(result.message);
    if (result?.openPantry) this.openPantry(result.openPantry);
    if (result?.served) this.celebrateServe(result.served, stationId);
    this.nextPlanAt = 0;
  }

  pressB() {
    if (!this.started || this.locked || this.finished) return;
    this.toast('이 가게에는 손질할 재료가 없어요');
  }

  openPantry({ ingredient, orderId }) {
    const order = this.orders.find((o) => o.id === orderId);
    const line = order?.lines.find((l) => l.ingredient === ingredient);
    const problem = line && makeProblem(this.semester, line.type, line.amount, { ingredient });
    if (!problem) {
      this.toast('문제를 만들 수 없어요');
      return;
    }
    this.locked = true;
    this.route = null;
    this.player.body.setVelocity(0, 0);
    this.pantry = this.openProblem({
      problem,
      check: this.check,
      answerRule: this.answerRule,
      orderLabel: order.dish,
      onCancel: () => {
        this.locked = false;
      },
      onTake: ({ correct, answer, amount }) => {
        this.locked = false;
        this.solved++;
        if (correct) {
          this.correct++;
          this.floatText(this.player.x, this.player.y - 90, `+${CONFIG.SCORE_PANTRY_CORRECT}`);
        }
        this.session.addLog({ type: problem.type, answer, correct });
        this.session
          .act((game) => takeIngredient(game, this.uid, { ingredient, unit: problem.unit, amount, correct }))
          .then(() => {
            this.syncView();
            this.nextPlanAt = 0;
          });
      },
    });
  }

  celebrateServe(s, stationId) {
    const station = this.stations[stationId];
    const x = this.tileX(station.x);
    const y = this.topY(station.y);
    this.floatText(x, y - 50, s.tip ? `+${s.base}  팁 +${s.tip}` : `+${s.base}`);
    this.tweens.add({ targets: this.bell, angle: { from: -22, to: 22 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => this.bell.setAngle(0) });
    const stars = this.add.particles(x, y, 'star', {
      speed: { min: 120, max: 300 },
      angle: { min: 200, max: 340 },
      gravityY: 500,
      lifespan: 800,
      scale: { start: 0.32, end: 0 },
      emitting: false,
    }).setDepth(4800);
    stars.explode(14);
    this.time.delayedCall(1000, () => stars.destroy());
  }

  finish() {
    this.finished = true;
    this.pantry?.close();
    this.hintArrow.setVisible(false);
    this.hintRing.clear();
    this.player.body.setVelocity(0, 0);
    this.onEnd({
      score: this.score,
      stars: starsFor(this.stage.id, this.score),
      solved: this.solved,
      correct: this.correct,
    });
  }
}
