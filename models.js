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
  'dish:🥗': 'salad', 'dish:🍔': 'burger', 'dish:🍰': 'cake', 'dish:🍕': 'pizza', 'dish:🥤': 'frappe', 'dish:🥙': 'sandwich', 'dish:🌮': 'taco', 'dish:🥞': 'pancakes', 'dish:🥪': 'sub', 'dish:🧇': 'waffle', 'dish:🧁': 'cupcake', 'dish:🥧': 'pie', 'dish:🫕': 'bowl-broth', 'dish:🍲': 'bowl-soup', 'dish:🥘': 'pan-stew', tsoup: 'bowl-soup', csoup: 'bowl-broth',
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
export const FURNITURE_FILES = { 'station:cabinet': 'kitchenCabinet', 'station:stove': 'sushi-oven', 'station:sink': 'kitchenSink', 'station:blender': 'kitchenBlender', 'station:trash': 'trashcan', 'station:pot': 'pot', 'station:wall': 'wall', 'station:wallWindow': 'wallWindow' };
// 주방 바깥 식당 홀 꾸미기 (Kenney Furniture Kit). 같은 이름의 재질은 하나로 합쳐 색을 식당 분위기에 맞춤
export const DECOR_FILES = ['tableCloth', 'tableCrossCloth', 'tableRound', 'chairCushion', 'chairRounded', 'pottedPlant', 'plantSmall1', 'plantSmall3', 'rugRound', 'rugRectangle', 'lampRoundFloor', 'benchCushion', 'bookcaseOpen', 'stoolBar', 'loungeSofa', 'coatRackStanding'];
const DECOR_COLORS = { wood: 0xb9824f, woodDark: 0x7a5233, carpet: 0xc9432f, carpetDarker: 0x8f2c1e, plant: 0x4f9a55, metal: 0x4a4038, lamp: 0xffe2a0 };
// 손님 (Kenney Mini Characters) — 서빙 창구 앞에 줄 서는 사람들
export const GUEST_FILES = ['character-female-a', 'character-male-a', 'character-female-c', 'character-male-d', 'character-female-e', 'character-male-f'];
// 셰프 (Quaternius Sushi Restaurant Kit의 토끼·판다 요리사) — 자리 번호 순서대로
export const CHARACTER_FILES = ['Rabbit_Pink', 'Rabbit_Cyan', 'Rabbit_Blond', 'Rabbit_Purple', 'Rabbit_Green'];   // 플레이어는 모두 토끼
// 게임 상황 → 모델에 들어 있는 동작 이름
export const CHARACTER_ANIMS = { idle: 'Idle', hold: 'Idle_Holding', walk: 'Walk', walkHold: 'Walk_Holding', run: 'Run', runHold: 'Run_Holding', cut: 'Chop_Loop', work: 'Assembly_Loop', pan: 'Pan_Loop', cheer: 'Yes', no: 'No', wave: 'Wave', hit: 'HitReact', jump: 'Jump' };
// 인트로의 천재 셰프 (같은 키트의 판다 요리사, 게임 중에는 나오지 않음)
export const HEAD_CHEF_FILE = 'Panda';

export async function loadModels(timeoutMs = 5000) {
  const models = new Map(), loader = new GLTFLoader();
  const decorMats = {};
  const decorMat = name => decorMats[name] || (decorMats[name] = new THREE.MeshStandardMaterial({ color: DECOR_COLORS[name] ?? 0xb9824f, roughness: 0.85, ...(name === 'lamp' ? { emissive: 0xffc860, emissiveIntensity: 0.9 } : {}) }));
  const extra = [
    ...GUEST_FILES.map((file, i) => new Promise(res => loader.load(DIR + 'guests/' + file + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); models.set('guest:' + i, { scene: g.scene, animations: g.animations }); res(); }, undefined, () => res()))),
    ...DECOR_FILES.map(file => new Promise(res => loader.load(DIR + 'decor/' + file + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.material = decorMat(o.material.name); o.castShadow = true; o.receiveShadow = true; } }); models.set('decor:' + file, g.scene); res(); }, undefined, () => res()))),
    ...Object.entries(FURNITURE_FILES).map(([key, file]) => new Promise(res => loader.load(DIR + 'furniture/' + file + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); models.set(key, g.scene); res(); }, undefined, () => res()))),
    new Promise(res => loader.load(DIR + 'chefs/' + HEAD_CHEF_FILE + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); models.set('char:head', { scene: g.scene, animations: g.animations, names: CHARACTER_ANIMS }); res(); }, undefined, () => res())),
    ...CHARACTER_FILES.map((file, i) => new Promise(res => loader.load(DIR + 'chefs/' + file + '.glb', g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); models.set('char:' + i, { scene: g.scene, animations: g.animations, names: CHARACTER_ANIMS }); res(); }, undefined, () => res()))),
  ];
  const jobs = Object.entries(MODEL_FILES).map(([key, file]) => new Promise(res => {
    loader.load(DIR + file + '.glb', g => { try { models.set(key, normalize(g.scene)); } catch {} res(); }, undefined, () => res());
  }));
  await Promise.race([Promise.all([...jobs, ...extra]), new Promise(r => setTimeout(r, timeoutMs))]);
  return models;
}
