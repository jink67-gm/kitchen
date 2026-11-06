// 화면 전환과 역할 판단: 혼자 하기, 교사(방 만들기), 학생(입장하기).
import { CONFIG } from './config.js';
import { STAGES } from './stages.js';
import { TYPES, makeProblem, pickTarget } from './problems.js';
import { KitchenScene } from './game/KitchenScene.js';
import { LocalSession, OnlineSession } from './game/session.js';
import { autoGroup, startingGame } from './game/teamState.js';
import { openPantry } from './ui/pantry.js';
import { createControls } from './ui/joystick.js';
import { fracHTML } from './ui/fracview.js';
import { renderStageEnd } from './screens/stage-end.js';
import { renderIntro } from './screens/intro.js';
import { renderHostSetup } from './screens/host-setup.js';
import { renderHostLobby, teamNumber } from './screens/host-lobby.js';
import { renderHostBoard } from './screens/host-board.js';
import { renderJoin } from './screens/join.js';
import { renderWait } from './screens/wait.js';
import { DISHES, INGREDIENTS, iconPath } from './recipes.js';

const params = new URLSearchParams(location.search);
const stageEl = document.getElementById('stage');

function readSettings() {
  return {
    semester: params.get('sem') === '2' ? 2 : 1,
    check: params.get('check') === 'real' ? 'real' : 'practice',
    answerRule: params.get('rule') === 'reduced' ? 'reduced' : 'equal',
  };
}

// ?fakedb=1이면 시험용 가짜 DB를 쓴다. 주소를 바꿔도 이 값은 이어 간다.
const fakeDb = params.has('fakedb');
const withDb = (search) => (fakeDb ? `${search}&fakedb=1` : search);

async function connectDb() {
  const mod = fakeDb ? await import('../tests/fake-db.js') : await import('./firebase.js');
  return withTimeout(mod.connect());
}

// 데이터베이스가 없거나 인터넷이 끊기면 Firebase는 답 없이 기다리므로 시간 제한을 둔다.
function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('응답 시간 초과')), ms);
    }),
  ]);
}

function showFatal(title, detail) {
  stageEl.innerHTML = `
    <main class="menu">
      <div class="menu-sign menu-sign-small">${title}</div>
      <p class="menu-sub">${detail}</p>
      <div class="menu-actions"><a href="./" class="button-link">처음으로</a></div>
    </main>`;
}

const CONNECT_HELP = '서버에 연결하지 못했어요. 인터넷 연결을 확인하고, 선생님은 Firebase의 Realtime Database와 익명 로그인이 켜져 있는지 확인해 주세요.';

function renderMenu() {
  stageEl.innerHTML = `
    <main class="menu">
      <div class="menu-sign">분수 키친</div>
      <p class="menu-sub">계산이 맞아야 요리가 맛있어져요!</p>
      <div class="menu-roles">
        <a class="role-card role-main" href="?join=1"><b>학생</b><span>입장하기</span></a>
        <a class="role-card" href="?host=1"><b>선생님</b><span>방 만들기</span></a>
      </div>
      <form class="menu-form menu-solo">
        <legend>혼자 연습하기</legend>
        <div class="solo-row">
          <label><input type="radio" name="sem" value="1" checked> 1학기</label>
          <label><input type="radio" name="sem" value="2"> 2학기</label>
          <label><input type="radio" name="check" value="practice" checked> 연습</label>
          <label><input type="radio" name="check" value="real"> 실전</label>
        </div>
        <div class="menu-actions">
          <button type="submit" name="to" value="solo">혼자 주방 열기</button>
          <button type="submit" name="to" value="pantry">문제만 연습</button>
        </div>
      </form>
    </main>`;
  stageEl.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const to = e.submitter?.value === 'pantry' ? 'pantry' : 'solo';
    location.search = `?${to}=1&sem=${data.get('sem')}&check=${data.get('check')}`;
  });
}

// 2단계: 문제 창만 계속 풀어 보는 화면
function startPantryPractice() {
  const { semester, check, answerRule } = readSettings();
  stageEl.innerHTML = `
    <div class="practice">
      <div class="practice-bar">
        <span>문제 창 연습 · ${semester}학기</span>
        <label>확인 <select id="set-check">
          <option value="practice" ${check === 'practice' ? 'selected' : ''}>연습</option>
          <option value="real" ${check === 'real' ? 'selected' : ''}>실전</option>
        </select></label>
        <label>정답 <select id="set-rule">
          <option value="equal" ${answerRule === 'equal' ? 'selected' : ''}>크기 같으면</option>
          <option value="reduced" ${answerRule === 'reduced' ? 'selected' : ''}>기약분수만</option>
        </select></label>
        <span id="practice-result"></span>
      </div>
    </div>`;
  const host = stageEl.querySelector('.practice');
  const checkSel = stageEl.querySelector('#set-check');
  const ruleSel = stageEl.querySelector('#set-rule');
  const result = stageEl.querySelector('#practice-result');
  let handle = null;

  function next() {
    handle?.close();
    const types = TYPES[semester];
    const type = types[Math.floor(Math.random() * types.length)];
    const problem = makeProblem(semester, type, pickTarget(semester, type));
    handle = openPantry(host, {
      problem,
      check: checkSel.value,
      answerRule: ruleSel.value,
      canClose: false,
      onTake: ({ correct, amount }) => {
        result.innerHTML = `${correct ? '맞았어요' : '틀렸어요'} · 꺼낸 양 ${fracHTML(amount, problem.unit)}`;
        next();
      },
    });
  }
  checkSel.addEventListener('change', next);
  ruleSel.addEventListener('change', next);
  next();
}

/* ---------- 주방 화면(혼자·모둠 공용) ---------- */

// options: { stage, session, uid, me, mates, semester, types, check, answerRule, seed, startAt, label, onReady, onEnd }
function mountKitchen(options) {
  const { label } = options;
  stageEl.innerHTML = `
    <div class="kitchen-screen">
      <div id="game"></div>
      <div class="hud">
        <div class="hud-orders"></div>
        <div class="hud-side">
          ${label ? `<div class="hud-board"><small>우리 모둠</small><b>${label}</b></div>` : ''}
          <div class="hud-board"><small>남은 시간</small><b id="hud-time">3:00</b></div>
          <div class="hud-board"><small>점수</small><b id="hud-score">0</b></div>
        </div>
      </div>
      <div class="hint-bar" hidden><span class="hint-tag">지금 할 일</span><span id="hint-text"></span></div>
      <div id="overlay"></div>
    </div>`;

  const hud = createHud(stageEl);
  const overlay = stageEl.querySelector('#overlay');
  const screen = stageEl.querySelector('.kitchen-screen');
  let scene = null;

  const controls = createControls(screen, {
    onA: () => scene?.pressA(),
    onB: () => scene?.pressB(),
  });

  return document.fonts.load('bold 16px Galmuri11').finally(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: CONFIG.WORLD_W,
      height: CONFIG.WORLD_H,
      backgroundColor: '#2b2118',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
      input: { activePointers: 3 },
    });
    game.scene.add('kitchen', KitchenScene, true, {
      ...options,
      hud,
      controls,
      openProblem: (o) => openPantry(overlay, o),
      onReady: (ready) => {
        scene = ready;
        options.onReady?.(ready, overlay);
      },
      onEnd: (result) => {
        controls.destroy();
        hud.hideHint();
        options.onEnd(result, overlay);
      },
    });
  });
}

// 3단계: 혼자 하는 주방
function startSolo() {
  const settings = readSettings();
  const stage = STAGES[1];
  const session = new LocalSession(stage);
  mountKitchen({
    ...settings,
    stage,
    session,
    uid: 'me',
    types: TYPES[settings.semester],
    seed: Number(params.get('seed')) || Math.floor(Math.random() * 1e9),
    onReady: (scene, overlay) => {
      session.now = () => scene.time.now;
      renderIntro(overlay, { stage, onStart: () => scene.startRound() });
    },
    onEnd: (result, overlay) => {
      renderStageEnd(overlay, { stage, ...result, onRetry: () => location.reload() });
    },
  });
}

function createHud(root) {
  const ordersEl = root.querySelector('.hud-orders');
  const timeEl = root.querySelector('#hud-time');
  const scoreEl = root.querySelector('#hud-score');
  const hintEl = root.querySelector('#hint-text');
  const hintBar = root.querySelector('.hint-bar');

  return {
    showHint() {
      hintBar.hidden = false;
    },
    hideHint() {
      hintBar.hidden = true;
    },
    renderOrders(orders) {
      // 남아 있는 주문서는 그대로 두고, 끝난 것만 빼고 새 것만 더한다.
      const ids = new Set(orders.map((o) => o.id));
      ordersEl.querySelectorAll('.ticket').forEach((card) => {
        if (!ids.has(card.dataset.id)) card.remove();
      });
      for (const o of orders) {
        if (ordersEl.querySelector(`[data-id="${o.id}"]`)) continue;
        ordersEl.insertAdjacentHTML(
          'beforeend',
          `<article class="ticket" data-id="${o.id}">
            <header><img src="${iconPath(DISHES[o.dish].icon)}" alt=""><span>${o.dish}</span></header>
            <ul>${o.lines
              .map(
                (l) => `<li data-ingredient="${l.ingredient}">
                  <img src="${iconPath(INGREDIENTS[l.ingredient].icon)}" alt="">
                  <span class="ticket-name">${l.ingredient}</span>${fracHTML(l.amount, l.unit)}</li>`,
              )
              .join('')}</ul>
            <div class="ticket-time"><span></span></div>
          </article>`,
        );
      }
    },
    updateOrderBars(orders, now) {
      for (const o of orders) {
        const card = ordersEl.querySelector(`[data-id="${o.id}"]`);
        if (!card) continue;
        const left = Math.max(0, 1 - (now - o.startAt) / o.durationMs);
        card.querySelector('.ticket-time span').style.width = `${left * 100}%`;
        card.classList.toggle('warn', left < CONFIG.ORDER_WARN_RATIO);
      }
    },
    // 이미 준비한 재료에 표시를 한다.
    updateTicks(orders, plan) {
      for (const o of orders) {
        const card = ordersEl.querySelector(`[data-id="${o.id}"]`);
        const p = plan.get(o.id);
        if (!card || !p) continue;
        card.querySelectorAll('li').forEach((li) => {
          li.classList.toggle('ready', p.have.has(li.dataset.ingredient));
        });
      }
    },
    renderHint(text) {
      if (hintEl.textContent !== text) hintEl.textContent = text;
    },
    renderStatus({ score, remainingSec }) {
      scoreEl.textContent = score;
      const m = Math.floor(remainingSec / 60);
      const s = String(remainingSec % 60).padStart(2, '0');
      timeEl.textContent = `${m}:${s}`;
      timeEl.classList.toggle('danger', remainingSec <= 30);
    },
  };
}

/* ---------- 교사 ---------- */

async function createRoom(conn, settings) {
  const meta = {
    hostUid: conn.uid,
    semester: settings.semester,
    mode: 'contest',
    stages: [1], // 스테이지 2~5는 5단계에서 더한다
    check: settings.check,
    answerRule: settings.answerRule,
    types: settings.types,
    seed: Math.floor(Math.random() * 1e9),
  };
  for (let tries = 0; tries < 20; tries++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const result = await conn.transaction(`rooms/${code}/meta`, (cur) => (cur === null ? meta : undefined));
    if (result.committed) return { code, meta };
  }
  throw new Error('방 코드를 만들지 못함');
}

async function startHost() {
  let conn;
  try {
    conn = await connectDb();
  } catch (error) {
    console.error(error);
    showFatal('연결 실패', CONNECT_HELP);
    return;
  }
  renderHostSetup(stageEl, {
    onCreate: async (settings) => {
      let room;
      try {
        room = await withTimeout(createRoom(conn, settings));
        await withTimeout(conn.set(`rooms/${room.code}/state`, { phase: 'lobby', stageIndex: 0, startAt: 0 }));
      } catch (error) {
        console.error(error);
        showFatal('방을 만들지 못했어요', CONNECT_HELP);
        return;
      }
      hostLobby(conn, room.code, room.meta, settings.size);
    },
  });
}

function hostLobby(conn, code, meta, size) {
  let players = {};
  const closeRoom = async () => {
    if (!confirm('방을 닫을까요? 모든 기록이 지워져요.')) return;
    offPlayers();
    await conn.remove(`rooms/${code}`);
    location.href = withDb('?host=1');
  };

  const lobby = renderHostLobby(stageEl, {
    code,
    onClose: closeRoom,
    onGroup: () => {
      const uids = Object.entries(players).filter(([, p]) => p.name).map(([uid]) => uid);
      if (!uids.length) return;
      const groups = autoGroup(uids, size);
      const patch = {};
      for (const [uid, g] of Object.entries(groups)) {
        patch[`players/${uid}/teamId`] = g.teamId;
        patch[`players/${uid}/color`] = g.color;
      }
      conn.update(`rooms/${code}`, patch);
    },
    onStart: async () => {
      const stage = STAGES[meta.stages[0]];
      const startAt = conn.now() + CONFIG.START_DELAY_MS;
      const teamIds = [...new Set(Object.values(players).map((p) => p.teamId).filter(Boolean))];
      const patch = {};
      for (const t of teamIds) patch[`teams/${t}/game`] = startingGame(stage, startAt);
      patch.state = { phase: 'playing', stageIndex: 0, startAt };
      try {
        await conn.update(`rooms/${code}`, patch);
      } catch (error) {
        console.error(error);
        lobby.message('시작하지 못했어요. 다시 눌러 주세요.');
        return;
      }
      offPlayers();
      hostBoard(conn, code, stage, startAt, teamIds);
    },
  });

  const offPlayers = conn.onValue(`rooms/${code}/players`, (value) => {
    players = value ?? {};
    lobby.setPlayers(players);
  }, (error) => {
    console.error(error);
    lobby.message('읽기 권한이 없어요. 보안 규칙을 확인해 주세요.');
  });
}

function hostBoard(conn, code, stage, startAt, teamIds) {
  const offs = [];
  const board = renderHostBoard(stageEl, {
    stage,
    startAt,
    teamIds,
    now: conn.now,
    onClose: async () => {
      if (!confirm('방을 닫을까요? 모든 기록이 지워져요.')) return;
      offs.forEach((off) => off());
      board.destroy();
      await conn.remove(`rooms/${code}`);
      location.href = withDb('?host=1');
    },
  });
  // 위치까지 받지 않도록 점수만 구독한다.
  for (const t of teamIds) {
    offs.push(conn.onValue(`rooms/${code}/teams/${t}/game/score`, (score) => board.setScore(t, score)));
  }
}

/* ---------- 학생 ---------- */

async function startJoin() {
  let conn;
  try {
    conn = await connectDb();
  } catch (error) {
    console.error(error);
    showFatal('연결 실패', CONNECT_HELP);
    return;
  }
  renderJoin(stageEl, {
    code: params.get('code') ?? '',
    onJoin: async ({ code, name }, showMessage) => {
      try {
        const meta = await withTimeout(conn.get(`rooms/${code}/meta`));
        if (!meta) {
          showMessage('없는 방 코드예요. 다시 확인해 주세요.');
          return;
        }
        await withTimeout(conn.update(`rooms/${code}/players/${conn.uid}`, { name, online: true }));
        conn.onDisconnectSet(`rooms/${code}/players/${conn.uid}/online`, false);
        studentWait(conn, code, meta, name);
      } catch (error) {
        console.error(error);
        showMessage('입장하지 못했어요. 잠시 뒤 다시 해 주세요.');
      }
    },
  });
}

function studentWait(conn, code, meta, name) {
  const stage = STAGES[meta.stages[0]];
  const waiting = renderWait(stageEl, { code, stage });
  let players = {};
  let state = null;
  let launched = false;

  const check = () => {
    const me = players[conn.uid];
    if (launched || !me?.teamId || state?.phase !== 'playing') return;
    launched = true;
    offPlayers();
    offState();
    launchTeamKitchen(conn, code, meta, stage, me, players, state.startAt, name);
  };
  const offPlayers = conn.onValue(`rooms/${code}/players`, (value) => {
    players = value ?? {};
    const me = players[conn.uid];
    const members = Object.values(players).filter((p) => me?.teamId && p.teamId === me.teamId);
    waiting.setTeam(me?.teamId, members);
    check();
  });
  const offState = conn.onValue(`rooms/${code}/state`, (value) => {
    state = value;
    if (!value) {
      waiting.message('방이 닫혔어요');
      return;
    }
    check();
  });
}

function launchTeamKitchen(conn, code, meta, stage, me, players, startAt, name) {
  const teamPath = `rooms/${code}/teams/${me.teamId}`;
  const mates = Object.fromEntries(
    Object.entries(players).filter(([, p]) => p.teamId === me.teamId),
  );
  let scene = null;
  let latest = {};
  const session = new OnlineSession({
    conn,
    teamPath,
    stage,
    uid: conn.uid,
    onPositions: (positions) => {
      latest = positions;
      scene?.setPositions(positions);
    },
    onError: (error) => {
      console.error(error);
      scene?.toast('연결이 불안정해요');
    },
  });
  mountKitchen({
    stage,
    session,
    uid: conn.uid,
    me: { name, color: me.color ?? 0 },
    mates,
    semester: meta.semester,
    types: meta.types ? Object.values(meta.types) : TYPES[meta.semester],
    check: meta.check,
    answerRule: meta.answerRule,
    seed: meta.seed,
    startAt,
    label: `${teamNumber(me.teamId)}모둠`,
    onReady: (ready) => {
      scene = ready;
      ready.setPositions(latest);
    },
    onEnd: (result, overlay) => {
      renderStageEnd(overlay, { stage, ...result });
    },
  });
}

/* ---------- 시작 ---------- */

if (params.has('pantry')) startPantryPractice();
else if (params.has('solo') && params.has('sem')) startSolo();
else if (params.has('host')) startHost();
else if (params.has('join')) startJoin();
else renderMenu();
