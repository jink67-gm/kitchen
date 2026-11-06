// Firebase 웹 설정값. 브라우저에 공개되도록 만들어진 값이며, 데이터 보호는 database.rules.json이 맡는다.
// databaseURL은 Realtime Database를 만든 지역에 따라 달라진다(콘솔의 데이터 탭 맨 위 주소와 같아야 한다).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCwbh9_uS8o7iDa-XuJI6bXg8L4aqq5nrw',
  authDomain: 'kitchen-90ab5.firebaseapp.com',
  databaseURL: 'https://kitchen-90ab5-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kitchen-90ab5',
  storageBucket: 'kitchen-90ab5.firebasestorage.app',
  messagingSenderId: '955411749483',
  appId: '1:955411749483:web:f72cefd8b0175ccbfaaf2e',
};

// 게임의 수치는 모두 여기서 고친다.
export const CONFIG = {
  POS_INTERVAL_MS: 125, // 위치 기록 간격(초당 8회)
  START_DELAY_MS: 5000, // 교사가 시작을 누른 뒤 영업이 시작되기까지
  TICK_INTERVAL_MS: 500, // 주문 시간 초과·새 주문을 확인하는 간격
  TEAM_MIN: 2,
  TEAM_MAX: 5,
  TEAM_LIMIT: 12, // 모둠 최대 개수
  PLAYER_LIMIT: 25,
  CHEF_COLORS: ['#2f8fd8', '#e0523f', '#3aa655', '#8e5bd0', '#e8a21c'],

  // 화면과 주방 크기
  WORLD_W: 1600,
  WORLD_H: 900,
  TILE: 88,
  KITCHEN_X: 228, // 주방 왼쪽 끝
  KITCHEN_Y: 226, // 주방 위쪽 끝
  LIFT: 18, // 비스듬한 시점에서 조리대 윗면이 위로 올라가 보이는 높이
  PLAYER_SPEED: 330,
  PLAYER_RADIUS: 24,
  REACH: 1.3, // 이 거리(칸) 안의 설비를 쓸 수 있다

  COOK_MS: 7000, // 재료가 다 맞은 뒤 익는 시간
  BURN_AFTER_MS: 8000, // 다 익은 뒤 타기까지
  FIRE_AFTER_MS: 16000, // 다 익은 뒤 불나기까지(5단계에서 사용)

  ORDER_MS: 100000, // 주문 하나의 제한 시간
  ORDER_GAP_MS: 4000, // 주문이 빠진 뒤 다음 주문이 오기까지
  ORDER_WARN_RATIO: 0.3, // 이 아래면 주문서가 흔들린다

  SCORE_PER_INGREDIENT: 20,
  TIP_50: 20,
  TIP_25: 10,
  SCORE_PANTRY_CORRECT: 5,
  SCORE_TIMEOUT: -10,
  SCORE_FIRE: -10,

  // 분수 범위
  S1_MAX_DENOM: 10,
  S2_MAX_DENOM: 12,
  MAX_AMOUNT: 3,
  // 기획서 표의 예시(물 6 L)를 살리려고 s2-d의 자연수만 6까지 허용한다.
  S2D_MAX_WHOLE: 6,

  COLORS: {
    highlight: 0xffa726,
    green: 0x43c35a,
    yellow: 0xf6c344,
    red: 0xe5534b,
    burnt: 0x2e2a28,
  },
};

// 점수 별 기준은 scoring.js의 STARS, 스테이지 설정은 stages.js에 있다.
