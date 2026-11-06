// 재료와 요리 정의. 재료 종류는 고정이고, 양은 주문마다 문제 생성기가 정한다.
// icon은 assets/icons/fluent-emoji-flat/ 안의 파일 이름이다.

export const INGREDIENTS = {
  떡: { unit: 'kg', icon: 'dango', box: ['봉지', '접시', '통'] },
  '고추장 소스': { unit: 'L', icon: 'hot-pepper', box: ['병', '통', '그릇'] },
  어묵: { unit: 'kg', icon: 'oden', box: ['봉지', '접시', '통'] },
  육수: { unit: 'L', icon: 'bowl-with-spoon', box: ['병', '통', '그릇'] },
  반죽: { unit: 'kg', icon: 'flatbread', box: ['덩이', '봉지', '판'] },
  치즈: { unit: 'kg', icon: 'cheese-wedge', box: ['조각', '봉지', '접시'], chop: true },
  '토마토 소스': { unit: 'L', icon: 'canned-food', box: ['병', '통', '그릇'] },
  면: { unit: 'kg', icon: 'spaghetti', box: ['묶음', '봉지', '그릇'] },
  애호박: { unit: 'kg', icon: 'cucumber', box: ['봉지', '접시', '바구니'] },
  토마토: { unit: 'kg', icon: 'tomato', box: ['바구니', '봉지', '상자'] },
  물: { unit: 'L', icon: 'droplet', box: ['병', '통', '그릇'] },
  감자: { unit: 'kg', icon: 'potato', box: ['바구니', '봉지', '상자'] },
  우유: { unit: 'L', icon: 'glass-of-milk', box: ['병', '통', '컵'] },
  버터: { unit: 'kg', icon: 'butter', box: ['덩이', '접시', '통'] },
};

export const DISHES = {
  떡볶이: { icon: 'shallow-pan-of-food', ingredients: ['떡', '고추장 소스'], cooker: 'pot' },
  어묵탕: { icon: 'pot-of-food', ingredients: ['어묵', '육수'], cooker: 'pot' },
  '치즈 피자': { icon: 'pizza', ingredients: ['반죽', '치즈', '토마토 소스'], cooker: 'oven' },
  잔치국수: { icon: 'steaming-bowl', ingredients: ['면', '육수', '애호박'], cooker: 'pot' },
  '토마토 수프': { icon: 'pot-of-food', ingredients: ['토마토', '물'], cooker: 'pot' },
  '감자 수프': { icon: 'pot-of-food', ingredients: ['감자', '우유', '버터'], cooker: 'pot' },
};

export const unitOf = (ingredient) => INGREDIENTS[ingredient].unit;
export const iconPath = (name) => `assets/icons/fluent-emoji-flat/${name}.svg`;
export const ALL_ICONS = [
  ...new Set([
    ...Object.values(INGREDIENTS).map((i) => i.icon),
    ...Object.values(DISHES).map((d) => d.icon),
    'bell',
    'star',
    'sparkles',
  ]),
];
