// 학생: 방 코드와 별명 입력
export function renderJoin(host, { code = '', onJoin }) {
  host.innerHTML = `
    <main class="menu">
      <div class="menu-sign menu-sign-small">입장하기</div>
      <form class="menu-form join-form">
        <label>방 코드 <input name="code" inputmode="numeric" maxlength="4" autocomplete="off" value="${code.replace(/\D/g, '')}" required></label>
        <label>별명 <input name="name" maxlength="12" autocomplete="off" placeholder="실명 말고 별명이나 번호" required></label>
        <p class="setup-msg" role="status"></p>
        <div class="menu-actions">
          <a href="./" class="button-link">뒤로</a>
          <button type="submit" class="primary">들어가기</button>
        </div>
      </form>
    </main>`;
  const form = host.querySelector('form');
  const msg = host.querySelector('.setup-msg');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    onJoin({ code: String(data.get('code')).trim(), name: String(data.get('name')).trim() }, (text) => {
      msg.textContent = text;
    });
  });
}
