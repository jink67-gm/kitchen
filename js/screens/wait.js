// 학생: 영업 시작을 기다리는 화면. 내 모둠과 영업 방법을 보여 준다.
import { howToHTML } from './intro.js';
import { teamNumber } from './host-lobby.js';

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderWait(host, { code, stage }) {
  host.innerHTML = `
    <main class="wait">
      <div class="intro-card">
        <h2 class="wait-title">선생님이 시작할 때까지 기다려요</h2>
        <p class="wait-team">방 ${code} · <b id="wait-team">모둠 편성 중</b></p>
        <ul class="wait-members"></ul>
        ${howToHTML(stage)}
      </div>
    </main>`;
  const teamEl = host.querySelector('#wait-team');
  const membersEl = host.querySelector('.wait-members');
  return {
    setTeam(teamId, members) {
      teamEl.textContent = teamId ? `${teamNumber(teamId)}모둠` : '모둠 편성 중';
      membersEl.innerHTML = members.map((m) => `<li>${escapeHTML(m.name)}</li>`).join('');
    },
    message(text) {
      host.querySelector('.wait-title').textContent = text;
    },
  };
}
