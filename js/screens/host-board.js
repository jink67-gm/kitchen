// 교사(TV): 영업 중 모둠 점수와 끝난 뒤 순위. 자세한 현황과 오답 분석은 6단계에서 더한다.
import { starsFor } from '../scoring.js';
import { teamNumber } from './host-lobby.js';

export function renderHostBoard(host, { stage, startAt, teamIds, now, onClose }) {
  host.innerHTML = `
    <main class="lobby">
      <header class="lobby-head">
        <div><small>${stage.name}</small><div class="lobby-code" id="board-time">-</div></div>
        <p id="board-note">영업 중이에요.</p>
        <div class="menu-actions"><button type="button" data-act="close">방 닫기</button></div>
      </header>
      <section class="board-teams"></section>
    </main>`;
  host.querySelector('[data-act="close"]').addEventListener('click', onClose);
  const timeEl = host.querySelector('#board-time');
  const noteEl = host.querySelector('#board-note');
  const teamsEl = host.querySelector('.board-teams');
  const scores = Object.fromEntries(teamIds.map((t) => [t, 0]));
  const endAt = startAt + stage.timeSec * 1000;

  function render() {
    const ended = now() >= endAt;
    const left = Math.max(0, Math.ceil((endAt - now()) / 1000));
    if (now() < startAt) timeEl.textContent = `${Math.ceil((startAt - now()) / 1000)}초 뒤 시작`;
    else timeEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    noteEl.textContent = ended ? '영업이 끝났어요!' : '영업 중이에요.';
    const ranked = teamIds
      .map((t) => ({ t, score: scores[t], stars: starsFor(stage.id, scores[t]) }))
      .sort((a, b) => b.score - a.score || teamNumber(a.t) - teamNumber(b.t));
    teamsEl.innerHTML = ranked
      .map(
        (r, i) => `<article class="board-row">
          <span class="board-rank">${ended ? `${i + 1}등` : ''}</span>
          <b>${teamNumber(r.t)}모둠</b>
          <span class="board-stars">${'★'.repeat(r.stars)}<i>${'★'.repeat(3 - r.stars)}</i></span>
          <span class="board-score">${r.score}</span>
        </article>`,
      )
      .join('');
  }
  const timer = setInterval(render, 500);
  render();

  return {
    setScore(teamId, score) {
      scores[teamId] = score ?? 0;
      render();
    },
    destroy() {
      clearInterval(timer);
    },
  };
}
