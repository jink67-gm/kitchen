// 설비 동작. Phaser를 쓰지 않는 순수 로직이라 테스트할 수 있고, 4단계 동기화에도 그대로 쓴다.
import { add, eq, cmp } from '../fraction.js';
import { CONFIG } from '../config.js';
import { DISHES } from '../recipes.js';

export function newStations(stage) {
  const stations = {};
  stage.map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const id = `${x},${y}`;
      const base = { id, x, y };
      if (ch === '#') stations[id] = { ...base, type: 'counter', item: null };
      else if (ch === 'O') stations[id] = { ...base, type: 'stove', pot: newPot() };
      else if (ch === 'L') stations[id] = { ...base, type: 'plates' };
      else if (ch === 'S') stations[id] = { ...base, type: 'serve' };
      else if (ch === 'T') stations[id] = { ...base, type: 'trash' };
      else stations[id] = { ...base, type: 'crate', ingredient: stage.crates[ch] };
    });
  });
  return stations;
}

const newPot = () => ({ contents: {}, cookStart: null });

// 냄비 속 재료를 진행 중인 주문과 비교한다.
// 결과: empty | yellow(덜 들어감) | green(딱 맞음) | red(많거나 다른 재료)
export function judge(contents, orders) {
  const names = Object.keys(contents);
  if (!names.length) return { status: 'empty' };
  let yellow = null;
  for (const order of orders) {
    const fits = names.every((name) => {
      const line = order.lines.find((l) => l.ingredient === name);
      return line && cmp(contents[name], line.amount) <= 0;
    });
    if (!fits) continue;
    const complete = order.lines.every((l) => contents[l.ingredient] && eq(contents[l.ingredient], l.amount));
    if (complete) return { status: 'green', order };
    yellow = yellow ?? order;
  }
  return yellow ? { status: 'yellow', order: yellow } : { status: 'red' };
}

// 시간과 내용물로 냄비 상태를 계산한다(저장하지 않고 늘 계산한다).
export function potState(pot, orders, now) {
  if (pot.cookStart !== null) {
    const t = now - pot.cookStart;
    if (t < CONFIG.COOK_MS) return { status: 'cooking', progress: t / CONFIG.COOK_MS };
    if (t < CONFIG.COOK_MS + CONFIG.BURN_AFTER_MS) {
      return { status: 'done', burnProgress: (t - CONFIG.COOK_MS) / CONFIG.BURN_AFTER_MS };
    }
    return { status: 'burnt' };
  }
  return judge(pot.contents, orders);
}

const sameAsOrder = (contents, order) =>
  Object.keys(contents).length === order.lines.length &&
  order.lines.every((l) => contents[l.ingredient] && eq(contents[l.ingredient], l.amount));

// 주문마다 어느 냄비·접시·재료가 맡고 있는지 오래된 주문부터 나누어 정한다.
// 같은 요리 주문이 둘이어도 재료가 서로 겹쳐 계산되지 않는다.
export function planOrders(stations, hand, orders, now) {
  const list = Object.values(stations);
  // hand는 한 사람의 손이거나, 모둠 전체의 손을 담은 배열이다.
  const carried = [...[].concat(hand), ...list.map((s) => s.item)].filter(Boolean);
  const meals = carried.filter((i) => i.kind === 'plate' && i.meal);
  const loose = carried.filter((i) => i.kind === 'ingredient');
  const pots = list
    .filter((s) => s.type === 'stove' && s.pot && Object.keys(s.pot.contents).length)
    .filter((s) => potState(s.pot, orders, now).status !== 'burnt');
  const used = new Set();
  const plan = new Map();

  for (const order of orders) {
    const entry = { plated: false, stove: null, have: new Set() };
    plan.set(order.id, entry);
    const meal = meals.find((m) => !used.has(m) && sameAsOrder(m.meal.contents, order));
    if (meal) {
      used.add(meal);
      entry.plated = true;
      order.lines.forEach((l) => entry.have.add(l.ingredient));
      continue;
    }
    const stove = pots.find((s) => {
      if (used.has(s)) return false;
      return Object.entries(s.pot.contents).every(([name, amount]) => {
        const line = order.lines.find((l) => l.ingredient === name);
        return line && cmp(amount, line.amount) <= 0;
      });
    });
    if (stove) {
      used.add(stove);
      entry.stove = stove;
      for (const line of order.lines) {
        const inPot = stove.pot.contents[line.ingredient];
        if (inPot && eq(inPot, line.amount)) entry.have.add(line.ingredient);
      }
    }
    for (const line of order.lines) {
      if (entry.have.has(line.ingredient)) continue;
      const item = loose.find((i) => !used.has(i) && i.ingredient === line.ingredient && eq(i.amount, line.amount));
      if (item) {
        used.add(item);
        entry.have.add(line.ingredient);
      }
    }
  }
  return plan;
}

// 이 재료가 아직 필요한 가장 오래된 주문을 고른다.
export function orderForIngredient(ingredient, orders, plan) {
  return (
    orders.find((o) => {
      const p = plan.get(o.id);
      return !p.plated && !p.have.has(ingredient) && o.lines.some((l) => l.ingredient === ingredient);
    }) ?? null
  );
}

const say = (message) => ({ message });

// A 버튼. ctx: { hand, orders, now, stations } → 결과에 따라 hand와 station을 고친다.
// 돌려주는 값: { hand, message?, openPantry?, served? }
export function useA(station, ctx) {
  const { hand, orders, now, stations } = ctx;
  const keep = (extra = {}) => ({ hand, ...extra });

  switch (station.type) {
    case 'crate': {
      if (hand) return keep(say('손이 차 있어요. 먼저 내려놓아요'));
      if (!orders.some((o) => o.lines.some((l) => l.ingredient === station.ingredient))) {
        return keep(say('지금 주문에 없는 재료예요'));
      }
      const plan = planOrders(stations, ctx.allHands ?? hand, orders, now);
      const order = orderForIngredient(station.ingredient, orders, plan);
      if (!order) return keep(say('이 재료는 충분해요. 다른 재료를 꺼내요'));
      return keep({ openPantry: { ingredient: station.ingredient, order } });
    }
    case 'plates':
      if (!hand) return { hand: { kind: 'plate', meal: null } };
      if (hand.kind === 'plate' && !hand.meal) return { hand: null };
      return keep(say('손이 차 있어요'));
    case 'trash':
      if (!hand) return keep(say('버릴 것을 들고 오세요'));
      if (hand.kind === 'pot') return { hand: { kind: 'pot', pot: newPot() }, message: '냄비를 비웠어요. 화구에 다시 놓아요' };
      if (hand.kind === 'plate') return { hand: { kind: 'plate', meal: null }, message: '접시를 비웠어요' };
      return { hand: null, message: '버렸어요' };
    case 'serve':
      return serve(ctx);
    case 'counter':
      if (hand && station.item) return keep(say('자리가 차 있어요'));
      if (hand) {
        if (hand.kind === 'pot') return keep(say('냄비는 화구에 놓아요'));
        station.item = hand;
        return { hand: null };
      }
      if (station.item) {
        const item = station.item;
        station.item = null;
        return { hand: item };
      }
      return keep(say('빈 조리대예요. 물건을 놓아 둘 수 있어요'));
    case 'stove':
      return useStove(station, ctx);
    default:
      return keep();
  }
}

function useStove(station, { hand, orders, now }) {
  const pot = station.pot;
  if (!pot) {
    if (hand?.kind !== 'pot') return { hand, message: '냄비를 먼저 놓아요' };
    station.pot = hand.pot;
    refreshCooking(station.pot, orders, now);
    return { hand: null };
  }
  const state = potState(pot, orders, now);

  if (hand?.kind === 'ingredient') {
    if (state.status === 'done' || state.status === 'burnt') return { hand, message: '먼저 냄비를 비워요' };
    const old = pot.contents[hand.ingredient];
    pot.contents[hand.ingredient] = old ? add(old, hand.amount) : hand.amount;
    pot.cookStart = null;
    refreshCooking(pot, orders, now);
    return { hand: null };
  }
  if (hand?.kind === 'plate') {
    if (state.status !== 'done') return { hand, message: '아직 담을 요리가 없어요' };
    if (hand.meal) return { hand, message: '접시가 차 있어요' };
    const dish = dishOf(pot.contents, orders);
    const meal = { dish, contents: pot.contents };
    station.pot = newPot();
    return { hand: { kind: 'plate', meal } };
  }
  if (hand) return { hand, message: '화구에 이미 냄비가 있어요' };

  // 빈손: 내용물이 있고 조리 중이 아니면 냄비를 들어 쓰레기통으로 가져갈 수 있다.
  if (state.status === 'done') return { hand, message: '접시를 들고 오세요' };
  if (state.status === 'cooking') return { hand, message: '끓고 있어요' };
  if (state.status === 'empty') return { hand, message: '먼저 재료를 꺼내 와요' };
  station.pot = null;
  return { hand: { kind: 'pot', pot } };
}

function refreshCooking(pot, orders, now) {
  if (judge(pot.contents, orders).status === 'green') pot.cookStart = now;
}

function dishOf(contents, orders) {
  const names = Object.keys(contents);
  const hit = orders.find((o) => o.lines.every((l) => contents[l.ingredient]) && names.length === o.lines.length);
  if (hit) return hit.dish;
  const found = Object.entries(DISHES).find(
    ([, d]) => d.ingredients.length === names.length && d.ingredients.every((n) => contents[n]),
  );
  return found ? found[0] : '요리';
}

function serve({ hand, orders }) {
  if (!hand || hand.kind !== 'plate' || !hand.meal) return { hand, message: '완성한 요리를 접시에 담아 와요' };
  const order = orders.find((o) => sameAsOrder(hand.meal.contents, o));
  if (!order) return { hand, message: '이 요리를 찾는 손님이 없어요' };
  return { hand: null, served: order };
}

// 지금 무엇을 하면 좋은지 알려 준다. 돌려주는 값: { text, target(설비 id 또는 null) }
export function getHint({ stations, hand, orders, now, allHands }) {
  const list = Object.values(stations);
  const first = (type) => list.find((s) => s.type === type);
  const stoves = list.filter((s) => s.type === 'stove');
  const stateOf = (s) => potState(s.pot, orders, now);
  const emptyStove = stoves.find((s) => s.pot && !Object.keys(s.pot.contents).length);
  const to = (station, text) => ({ text, target: station?.id ?? null });

  if (hand?.kind === 'ingredient') {
    const fitting = stoves.find((s) => {
      if (!s.pot || !Object.keys(s.pot.contents).length) return false;
      const status = stateOf(s).status;
      if (status !== 'yellow') return false;
      const old = s.pot.contents[hand.ingredient];
      const next = { ...s.pot.contents, [hand.ingredient]: old ? add(old, hand.amount) : hand.amount };
      return ['yellow', 'green'].includes(judge(next, orders).status);
    });
    if (fitting) return to(fitting, '이 냄비에 넣어요');
    if (judge({ [hand.ingredient]: hand.amount }, orders).status === 'red') {
      return to(first('trash'), '양이 레시피와 달라요. 버리는 곳으로 가요');
    }
    if (emptyStove) return to(emptyStove, '빈 냄비에 재료를 넣어요');
    return to(null, '빈 냄비가 없어요. 조리대에 잠시 내려놓아요');
  }
  if (hand?.kind === 'plate') {
    if (hand.meal) {
      return orders.some((o) => sameAsOrder(hand.meal.contents, o))
        ? to(first('serve'), '내놓는 곳으로 가져가요')
        : to(first('trash'), '찾는 손님이 없어요. 버리는 곳으로 가요');
    }
    const done = stoves.find((s) => s.pot && stateOf(s).status === 'done');
    if (done) return to(done, '완성된 냄비를 눌러 접시에 담아요');
    const cooking = stoves.find((s) => s.pot && stateOf(s).status === 'cooking');
    if (cooking) return to(null, '다 끓을 때까지 조금만 기다려요');
    return to(first('plates'), '접시를 내려놓고 재료를 꺼내요');
  }
  if (hand?.kind === 'pot') {
    if (Object.keys(hand.pot.contents).length) return to(first('trash'), '버리는 곳에서 냄비를 비워요');
    return to(stoves.find((s) => !s.pot), '빈 화구에 냄비를 놓아요');
  }

  const done = stoves.find((s) => s.pot && stateOf(s).status === 'done');
  if (done) return to(first('plates'), '요리가 완성됐어요! 접시를 집어요');
  const spoiled = stoves.find((s) => s.pot && ['red', 'burnt'].includes(stateOf(s).status));
  if (spoiled) return to(spoiled, '이 냄비를 들어서 버려요');
  // 문제를 푸는 사이 요리가 타지 않도록, 끓는 냄비가 있으면 접시부터 챙기게 한다.
  if (stoves.some((s) => s.pot && stateOf(s).status === 'cooking')) {
    return to(first('plates'), '끓는 동안 접시를 미리 집어요');
  }

  const plan = planOrders(stations, allHands ?? hand, orders, now);
  for (const order of orders) {
    const p = plan.get(order.id);
    if (p.plated) continue;
    const missing = order.lines.find((l) => !p.have.has(l.ingredient));
    if (!missing) continue;
    if (!p.stove && !emptyStove) continue;
    const crate = list.find((s) => s.type === 'crate' && s.ingredient === missing.ingredient);
    return to(crate, `${missing.ingredient} 상자를 눌러 문제를 풀어요`);
  }
  const waiting = list.find((s) => s.item);
  if (waiting) return to(waiting, '조리대에 둔 물건을 집어요');
  return to(null, '다음 주문을 기다려요');
}
