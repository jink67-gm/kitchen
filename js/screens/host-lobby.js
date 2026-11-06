// 교사: 방 코드, 입장 목록, 모둠 편성
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function teamNumber(teamId) {
  return Number(teamId.slice(1));
}

export function renderHostLobby(host, { code, onGroup, onStart, onClose }) {
  host.innerHTML = `
    <main class="lobby">
      <header class="lobby-head">
        <div>
          <small>방 코드</small>
          <div class="lobby-code">${code}</div>
        </div>
        <p>학생은 이 게임 주소에 들어가 <b>입장하기</b>를 누르고<br>방 코드와 별명을 입력해요.</p>
        <div class="menu-actions">
          <button type="button" data-act="close">방 닫기</button>
          <button type="button" data-act="group">모둠 편성</button>
          <button type="button" data-act="start" class="primary" disabled>영업 시작</button>
        </div>
      </header>
      <p class="lobby-msg" role="status">학생을 기다리는 중이에요.</p>
      <section class="lobby-teams"></section>
    </main>`;
  const teamsEl = host.querySelector('.lobby-teams');
  const msg = host.querySelector('.lobby-msg');
  const startBtn = host.querySelector('[data-act="start"]');
  host.querySelector('[data-act="group"]').addEventListener('click', onGroup);
  host.querySelector('[data-act="start"]').addEventListener('click', onStart);
  host.querySelector('[data-act="close"]').addEventListener('click', onClose);

  return {
    setPlayers(players) {
      const list = Object.entries(players).filter(([, p]) => p.name);
      const groups = new Map();
      for (const [uid, p] of list) {
        const key = p.teamId ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ uid, ...p });
      }
      const keys = [...groups.keys()].sort((a, b) => (a && b ? teamNumber(a) - teamNumber(b) : a ? -1 : 1));
      teamsEl.innerHTML = keys
        .map(
          (k) => `<article class="team-card ${k ? '' : 'team-none'}">
            <h3>${k ? `${teamNumber(k)}모둠` : '모둠 없음'}</h3>
            <ul>${groups.get(k).map((p) => `<li class="${p.online === false ? 'off' : ''}">${escapeHTML(p.name)}</li>`).join('')}</ul>
          </article>`,
        )
        .join('');
      const waiting = groups.get('')?.length ?? 0;
      const ready = list.length > 0 && waiting === 0;
      startBtn.disabled = !ready;
      if (!list.length) msg.textContent = '학생을 기다리는 중이에요.';
      else if (waiting) msg.textContent = `${list.length}명 입장. 모둠 편성을 눌러 주세요.`;
      else msg.textContent = `${list.length}명, ${keys.length}모둠 준비 완료. 영업 시작을 눌러 주세요.`;
    },
    message(text) {
      msg.textContent = text;
    },
  };
}
