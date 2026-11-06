// 영업 방법 안내. 무엇을 어떻게 하는지 한눈에 보여 준다.
import { iconPath } from '../recipes.js';

export function howToHTML() {
  const steps = [
    ['shallow-pan-of-food', '주문서 보기', '위쪽 주문서에서 요리와 재료의 양을 확인해요.'],
    ['dango', '재료 꺼내기', '재료 상자를 눌러요. 문제를 풀면 답만큼 재료를 들고 나와요.'],
    ['pot-of-food', '냄비에 넣기', '냄비를 눌러 넣어요. 재료의 양이 다 맞으면 끓기 시작해요.'],
    ['bell', '접시에 담아 내기', '접시를 집고, 완성된 냄비를 누른 뒤, 내놓는 곳을 눌러요.'],
  ];
  return `
    <ol class="intro-steps">
      ${steps
        .map(
          ([icon, title, text], i) => `<li>
            <span class="intro-num">${i + 1}</span>
            <img src="${iconPath(icon)}" alt="">
            <b>${title}</b>
            <p>${text}</p>
          </li>`,
        )
        .join('')}
    </ol>
    <p class="intro-control"><b>조작</b> 설비를 클릭하거나 터치하면 요리사가 걸어가서 집어요. 주황색 화살표를 따라가 보세요.<br>
    키보드: 방향키 또는 WASD로 이동, Space로 집기·놓기</p>`;
}

export function renderIntro(host, { stage, onStart }) {
  const el = document.createElement('section');
  el.className = 'intro';
  el.innerHTML = `
    <div class="intro-card">
      <h2>${stage.name} 영업 방법</h2>
      ${howToHTML()}
      <button type="button" class="intro-start">영업 시작!</button>
    </div>`;
  el.querySelector('.intro-start').addEventListener('click', () => {
    el.remove();
    onStart();
  });
  host.appendChild(el);
}
