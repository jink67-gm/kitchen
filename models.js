// 3D 모델 불러오기 — 음식·가구는 Kenney(CC0), 셰프와 오븐은 Quaternius Sushi Restaurant Kit(CC0). CREDITS.md 참고
// 모델 파일을 못 읽으면(파일 없음, 느린 연결 등) 빈 목록을 돌려주고, 화면은 코드로 만든 기본 모형으로 그대로 동작합니다.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/jsm/loaders/GLTFLoader.js';

const DIR = 'assets/models/';
// 열쇠: 재료 이름(손질 전), 재료:ready(손질·조리 후), dish:요리이모지(완성 요리)
export const MODEL_FILES = {
  lettuce: 'cabbage', tomato: 'tomato', 'tomato:ready': 'tomato-slice',
  meat: 'meat-raw', 'meat:ready': 'meat-cooked',
  flour: 'bag', berry: 'strawberry',
  cheese: 'cheese', 'cheese:ready': 'cheese-cut',
  bread: 'loaf', 'bread:ready': 'bread',
  milk: 'carton', 'dough:ready': 'loaf-round',
  'dish:🥗': 'salad', 'dish:🍔': 'burger', 'dish:🍰': 'cake', 'dish:🍕': 'pizza', 'dish:🥤': 'frappe', 'dish:🥙': 'sandwich',
};

// 크기가 제각각인 모델을 "가장 긴 변 = 1, 바닥이 y=0, 가운데 정렬"로 맞춤 → 쓰는 쪽에서 원하는 크기를 곱하기만 하면 됨
function normalize(obj) {
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = 1 / Math.max(size.x, size.y, size.z, 1e-6);
  obj.position.set(-c.x, -box.min.y, -c.z);
  const g = new THREE.Group(); g.add(obj); g.scale.setScalar(s);
  const out = new THREE.Group(); out.add(g);
  out.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return out;
}

// 주방 설비 (Kenney Furniture Kit) — 크기는 쓰는 쪽에서 설비 칸에 맞춤
export const FURNITURE_FILES = { 'station:cabinet': 'kitchenCabinet', 'station:stove': 'sushi-oven', 'station:sink': 'kitchenSink', 'station:blender': 'kitchenBlender', 'station:trash': 'trashcan' };
// 셰프 (Quaternius Sushi Restaurant Kit의 토끼·판다 요리사) — 자리 번호 순서대로
export const CHARACTER_FILES = ['Rabbit_Pink', 'Rabbit_Cyan', 'Panda', 'Rabbit_Purple', 'Rabbit_Green'];
// 게임 상황 → 모델에 들어 있는 동작 이름
export const CHARACTER_ANIMS = { idle: 'Idle', hold: 'Idle_Holding', walk: 'Walk', walkHold: 'Walk_Holding', run: 'Run', runHold: 'Run_Holding', cut: 'Chop_Loop', work: 'Assembly_Loop', pan: 'Pan_Loop', cheer: 'Yes' };

export async function loadModels(timeoutMs = 5000) {
  const models = new Map(), loader = new GLTFLoader();
  const extra = [
    ...Object.entries(FURNITURE_FILES).map(([key, file]) => new Promise(res => loader.load(DIR + 'furniture/' + file + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); models.set(key, g.scene); res(); }, undefined, () => res()))),
    ...CHARACTER_FILES.map((file, i) => new Promise(res => loader.load(DIR + 'chefs/' + file + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); models.set('char:' + i, { scene: g.scene, animations: g.animations, names: CHARACTER_ANIMS }); res(); }, undefined, () => res()))),
  ];
  const jobs = Object.entries(MODEL_FILES).map(([key, file]) => new Promise(res => {
    loader.load(DIR + file + '.glb', g => { try { models.set(key, normalize(g.scene)); } catch {} res(); }, undefined, () => res());
  }));
  await Promise.race([Promise.all([...jobs, ...extra]), new Promise(r => setTimeout(r, timeoutMs))]);
  return models;
}
