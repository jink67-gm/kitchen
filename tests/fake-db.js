// 시험용 가짜 DB. js/firebase.js와 같은 함수를 제공하고, 같은 브라우저의 탭끼리 localStorage로 공유한다.
// 주소에 ?fakedb=1을 붙이면 쓰인다. Firebase처럼 null과 빈 객체는 저장하지 않는다.
const KEY = 'fkitchen-fakedb';
const channel = new BroadcastChannel('fkitchen-fakedb');
const listeners = new Set();

function clean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.length ? value : null;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const c = clean(v);
    if (c !== null) out[k] = c;
  }
  return Object.keys(out).length ? out : null;
}

const load = () => JSON.parse(localStorage.getItem(KEY) ?? '{}');
const parts = (path) => path.split('/').filter(Boolean);

function read(root, path) {
  let cur = root;
  for (const p of parts(path)) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = cur[p] ?? null;
  }
  return cur;
}

function write(root, path, value) {
  const keys = parts(path);
  let cur = root;
  keys.slice(0, -1).forEach((k) => {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
}

function commit(root) {
  localStorage.setItem(KEY, JSON.stringify(clean(root) ?? {}));
  channel.postMessage('changed');
  notify();
}

function notify() {
  const root = load();
  for (const l of listeners) {
    const value = read(root, l.path);
    const text = JSON.stringify(value);
    if (text !== l.last) {
      l.last = text;
      l.cb(value);
    }
  }
}
channel.onmessage = notify;

export async function connect() {
  let uid = sessionStorage.getItem('fakedb-uid');
  if (!uid) {
    uid = `u${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('fakedb-uid', uid);
  }
  return {
    uid,
    now: () => Date.now(),
    onValue(path, cb) {
      const l = { path, cb, last: undefined };
      listeners.add(l);
      queueMicrotask(notify);
      return () => listeners.delete(l);
    },
    get: async (path) => read(load(), path),
    set: async (path, value) => {
      const root = load();
      write(root, path, value);
      commit(root);
    },
    update: async (path, value) => {
      const root = load();
      for (const [k, v] of Object.entries(value)) write(root, `${path}/${k}`, v);
      commit(root);
    },
    remove: async (path) => {
      const root = load();
      write(root, path, null);
      commit(root);
    },
    push: async (path, value) => {
      const root = load();
      write(root, `${path}/p${Date.now()}${Math.random().toString(36).slice(2, 6)}`, value);
      commit(root);
    },
    transaction: async (path, fn) => {
      const root = load();
      const next = fn(clean(read(root, path)));
      if (next === undefined) return { committed: false };
      write(root, path, next);
      commit(root);
      return { committed: true };
    },
    onDisconnectSet() {},
    onDisconnectRemove() {},
  };
}
