// Firebase 초기화, 익명 로그인, 읽기·쓰기·트랜잭션. 모든 경로는 fkitchen/ 아래로만 간다.
// 분석(Analytics)은 켜지 않는다. 학생 데이터를 수집하지 않기 위해서다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  browserSessionPersistence,
  initializeAuth,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  get,
  getDatabase,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { FIREBASE_CONFIG } from './config.js';

const ROOT = 'fkitchen';

export async function connect() {
  const app = initializeApp(FIREBASE_CONFIG);
  // 탭마다 따로 로그인한다. 새로고침해도 같은 사람으로 남고, 한 컴퓨터에서 탭 여러 개로 시험할 수 있다.
  const auth = initializeAuth(app, { persistence: browserSessionPersistence });
  const { user } = await signInAnonymously(auth);
  const db = getDatabase(app);
  const at = (path) => ref(db, `${ROOT}/${path}`);

  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    offset = snap.val() ?? 0;
  });

  return {
    uid: user.uid,
    now: () => Date.now() + offset,
    onValue: (path, cb, onError) => onValue(at(path), (snap) => cb(snap.val()), onError),
    get: async (path) => (await get(at(path))).val(),
    set: (path, value) => set(at(path), value),
    update: (path, value) => update(at(path), value),
    remove: (path) => remove(at(path)),
    push: (path, value) => push(at(path), value),
    transaction: (path, fn) => runTransaction(at(path), fn),
    onDisconnectSet: (path, value) => onDisconnect(at(path)).set(value),
    onDisconnectRemove: (path) => onDisconnect(at(path)).remove(),
  };
}
