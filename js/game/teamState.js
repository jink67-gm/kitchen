// 한 모둠의 공유 상태(손, 설비, 주문, 점수). Phaser·Firebase를 모르는 순수 로직이다.
// 혼자 하기는 메모리에서, 모둠 하기는 Firebase 트랜잭션 안에서 같은 함수를 실행한다.
//
// Firebase는 null과 빈 객체를 저장하지 않으므로, '빈 냄비'와 '냄비 없음'을 구분해 저장한다(encode/decode).
import { CONFIG } from '../config.js';
import { makeOrder } from '../orders.js';
import { serveScore } from '../scoring.js';
import { newStations, useA } from './stations.js';

/* ---------- 저장 형식 ---------- */

function encodeItem(item) {
  if (!item) return null;
  if (item.kind === 'pot') return { kind: 'pot', pot: encodePot(item.pot) };
  if (item.kind === 'plate') return item.meal ? { kind: 'plate', meal: item.meal } : { kind: 'plate' };
  return item;
}

function decodeItem(raw) {
  if (!raw) return null;
  if (raw.kind === 'pot') return { kind: 'pot', pot: decodePot(raw.pot) };
  if (raw.kind === 'plate') return { kind: 'plate', meal: raw.meal ?? null };
  return { ...raw };
}

function encodePot(pot) {
  const out = {};
  if (Object.keys(pot.contents).length) out.c = pot.contents;
  if (pot.cookStart !== null) out.s = pot.cookStart;
  return out;
}

function decodePot(raw) {
  return { contents: { ...(raw?.c ?? {}) }, cookStart: raw?.s ?? null };
}

export function encode(game) {
  const stations = {};
  for (const s of Object.values(game.stations)) {
    if (s.type === 'counter' && s.item) stations[s.id] = { item: encodeItem(s.item) };
    if (s.type === 'stove') {
      if (!s.pot) stations[s.id] = { noPot: true };
      else if (Object.keys(s.pot.contents).length) stations[s.id] = { pot: encodePot(s.pot) };
    }
  }
  const hands = {};
  for (const [uid, item] of Object.entries(game.hands)) {
    if (item) hands[uid] = encodeItem(item);
  }
  return {
    stations,
    hands,
    orders: { next: game.orders.next, active: game.orders.active, dueAt: game.orders.dueAt },
    served: game.served,
    score: game.score,
  };
}

export function decode(raw, stage) {
  const stations = newStations(stage);
  for (const [id, saved] of Object.entries(raw?.stations ?? {})) {
    const s = stations[id];
    if (!s) continue;
    if (s.type === 'counter') s.item = decodeItem(saved.item);
    if (s.type === 'stove') s.pot = saved.noPot ? null : decodePot(saved.pot);
  }
  const hands = {};
  for (const [uid, item] of Object.entries(raw?.hands ?? {})) hands[uid] = decodeItem(item);
  return {
    stations,
    hands,
    orders: {
      next: raw?.orders?.next ?? 0,
      active: { ...(raw?.orders?.active ?? {}) },
      dueAt: raw?.orders?.dueAt ?? 0,
    },
    served: raw?.served ?? 0,
    score: raw?.score ?? 0,
  };
}

/* ---------- 주문 ---------- */

const orderCache = new Map();

function orderAt(index, ctx) {
  const key = `${ctx.seed}|${ctx.semester}|${ctx.types.join()}|${ctx.dishes.join()}|${index}`;
  if (!orderCache.has(key)) orderCache.set(key, makeOrder(ctx.seed, index, ctx));
  return orderCache.get(key);
}

// 진행 중인 주문을 오래된 순서로 돌려준다. 내용은 시드로 계산하므로 모든 모둠이 같다.
export function activeOrders(game, ctx) {
  return Object.values(game.orders.active)
    .sort((a, b) => a.i - b.i)
    .map((a) => ({ ...orderAt(a.i, ctx), startAt: a.startAt }));
}

function spawn(game, now) {
  const i = game.orders.next++;
  game.orders.active[`o${i}`] = { i, startAt: now };
}

export function startOrders(game, now, count) {
  for (let n = 0; n < count; n++) spawn(game, now);
  return { changed: true };
}

export function needsTick(game, now, ctx, concurrent) {
  const list = activeOrders(game, ctx);
  if (list.some((o) => now - o.startAt >= o.durationMs)) return true;
  if (list.length < concurrent && !game.orders.dueAt) return true;
  return !!game.orders.dueAt && now >= game.orders.dueAt;
}

// 시간이 지난 주문을 빼고 새 주문을 낸다. 여러 기기가 동시에 불러도 한 번만 반영된다.
export function tickOrders(game, now, ctx, concurrent) {
  let changed = false;
  let expired = 0;
  for (const o of activeOrders(game, ctx)) {
    if (now - o.startAt >= o.durationMs) {
      delete game.orders.active[o.id];
      game.score += CONFIG.SCORE_TIMEOUT;
      expired++;
      changed = true;
    }
  }
  const count = () => Object.keys(game.orders.active).length;
  if (count() < concurrent && !game.orders.dueAt) {
    game.orders.dueAt = now + CONFIG.ORDER_GAP_MS;
    changed = true;
  }
  if (game.orders.dueAt && now >= game.orders.dueAt) {
    game.orders.dueAt = 0;
    if (count() < concurrent) spawn(game, now);
    changed = true;
  }
  return { changed, expired };
}

/* ---------- 행동 ---------- */

export function newGame(stage) {
  return decode(null, stage);
}

// 교사가 시작을 누를 때 모둠마다 저장할 처음 상태
export function startingGame(stage, now) {
  const game = newGame(stage);
  startOrders(game, now, stage.concurrent);
  return encode(game);
}

// A 행동. 결과의 changed가 false면 저장하지 않는다.
export function applyUse(game, uid, stationId, now, ctx) {
  const station = game.stations[stationId];
  if (!station) return { changed: false };
  const before = JSON.stringify(encode(game));
  const orders = activeOrders(game, ctx);
  const result = useA(station, {
    hand: game.hands[uid] ?? null,
    orders,
    now,
    stations: game.stations,
    allHands: Object.values(game.hands),
  });
  if (result.hand) game.hands[uid] = result.hand;
  else delete game.hands[uid];

  let served = null;
  if (result.served) {
    const remaining = 1 - (now - result.served.startAt) / result.served.durationMs;
    served = serveScore(result.served.lines.length, remaining);
    delete game.orders.active[result.served.id];
    game.score += served.total;
    game.served += 1;
  }
  return {
    changed: JSON.stringify(encode(game)) !== before,
    message: result.message ?? null,
    openPantry: result.openPantry
      ? { ingredient: result.openPantry.ingredient, orderId: result.openPantry.order.id }
      : null,
    served,
  };
}

// 문제를 풀고 재료를 들고 나온다. 그사이 손이 찼으면 아무 일도 하지 않는다.
export function takeIngredient(game, uid, { ingredient, unit, amount, correct }) {
  if (game.hands[uid]) return { changed: false };
  game.hands[uid] = { kind: 'ingredient', ingredient, unit, amount };
  if (correct) game.score += CONFIG.SCORE_PANTRY_CORRECT;
  return { changed: true };
}

/* ---------- 모둠 편성 ---------- */

// 인원을 고르게 나눈다. 돌려주는 값: uid → { teamId, color }
export function autoGroup(uids, size, rng = Math.random) {
  const list = [...uids];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const teamCount = Math.min(CONFIG.TEAM_LIMIT, Math.max(1, Math.ceil(list.length / size)));
  const out = {};
  const counts = new Array(teamCount).fill(0);
  list.forEach((uid, i) => {
    const t = i % teamCount;
    out[uid] = { teamId: `t${t + 1}`, color: counts[t]++ };
  });
  return out;
}
