// 스테이지 끝 화면. onRetry가 없으면(모둠 영업) 선생님 안내를 기다리게 한다.
export function renderStageEnd(host, { stage, score, stars, solved, correct, onRetry }) {
  const el = document.createElement('section');
  el.className = 'stage-end';
  const starMarks = [1, 2, 3].map((i) => `<span class="star ${i <= stars ? 'on' : ''}">★</span>`).join('');
  el.innerHTML = `
    <div class="stage-end-card">
      <h2>${stage.name} 영업 끝!</h2>
      <div class="stars" role="img" aria-label="별 ${stars}개">${starMarks}</div>
      <p class="end-score">${onRetry ? '점수' : '우리 모둠 점수'} <b>${score}</b></p>
      <p>내가 푼 문제 ${solved}개 · 맞힌 문제 ${correct}개</p>
      <div class="menu-actions">
        ${onRetry ? '<button type="button" class="primary" data-act="retry">다시 하기</button>' : '<p>선생님 화면을 봐 주세요.</p>'}
        <a href="./" class="button-link">처음으로</a>
      </div>
    </div>`;
  el.querySelector('[data-act="retry"]')?.addEventListener('click', onRetry);
  host.appendChild(el);
}
