// 교사: 방 설정 화면
import { TYPES, TYPE_NAMES } from '../problems.js';

export function renderHostSetup(host, { onCreate }) {
  host.innerHTML = `
    <main class="menu menu-scroll">
      <div class="menu-sign menu-sign-small">방 만들기</div>
      <form class="menu-form setup-form">
        <div class="setup-cols">
          <div>
            <fieldset>
              <legend>단원</legend>
              <label><input type="radio" name="sem" value="1" checked> 1학기 분수의 나눗셈</label>
              <label><input type="radio" name="sem" value="2"> 2학기 분수의 나눗셈</label>
            </fieldset>
            <fieldset>
              <legend>확인 방식</legend>
              <label><input type="radio" name="check" value="practice" checked> 연습: 맞아야 재료가 나와요</label>
              <label><input type="radio" name="check" value="real"> 실전: 틀려도 그 양이 나와요</label>
            </fieldset>
            <fieldset>
              <legend>정답 기준</legend>
              <label><input type="radio" name="rule" value="equal" checked> 크기가 같으면 정답</label>
              <label><input type="radio" name="rule" value="reduced"> 기약분수·대분수만 정답</label>
            </fieldset>
            <label class="setup-size">모둠 인원
              <select name="size">
                <option value="2">2명</option><option value="3">3명</option>
                <option value="4" selected>4명</option><option value="5">5명</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>나올 문제 유형 (진도에 맞게 체크)</legend>
            <div class="setup-types"></div>
          </fieldset>
        </div>
        <p class="setup-msg" role="status"></p>
        <div class="menu-actions">
          <a href="./" class="button-link">뒤로</a>
          <button type="submit" class="primary">방 만들기</button>
        </div>
      </form>
    </main>`;
  const form = host.querySelector('form');
  const typesEl = host.querySelector('.setup-types');
  const msg = host.querySelector('.setup-msg');

  function renderTypes() {
    const sem = Number(new FormData(form).get('sem'));
    typesEl.innerHTML = TYPES[sem]
      .map((t) => `<label><input type="checkbox" name="types" value="${t}" checked> ${TYPE_NAMES[t]}</label>`)
      .join('');
  }
  form.querySelectorAll('[name="sem"]').forEach((r) => r.addEventListener('change', renderTypes));
  renderTypes();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const types = data.getAll('types');
    if (!types.length) {
      msg.textContent = '문제 유형을 하나 이상 골라 주세요';
      return;
    }
    onCreate({
      semester: Number(data.get('sem')),
      check: data.get('check'),
      answerRule: data.get('rule'),
      size: Number(data.get('size')),
      types,
    });
  });
}
