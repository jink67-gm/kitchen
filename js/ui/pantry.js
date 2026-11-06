// 문제 창: 세로형 입력 칸, 숫자 키패드, 계량 그림. 답 판단은 fraction.js로만 한다.
import { frac, fromMixed, eq, isReduced, toMixed } from '../fraction.js';
import { amountFromAnswer } from '../problems.js';
import { INGREDIENTS, iconPath } from '../recipes.js';
import { fracHTML, partsHTML } from './fracview.js';

// 입력 칸의 글자를 분수로 바꾼다. 비었거나 형식이 틀리면 null.
export function readAnswer({ w, n, d }) {
  const hasFraction = n !== '' || d !== '';
  if (w === '' && !hasFraction) return null;
  if (hasFraction && (n === '' || d === '' || Number(d) === 0)) return null;
  const whole = w === '' ? 0 : Number(w);
  return hasFraction ? fromMixed(whole, Number(n), Number(d)) : frac(whole, 1);
}

// 기약분수·대분수 규칙에 맞게 썼는지 본다.
export function meetsRule({ w, n, d }, rule) {
  if (rule !== 'reduced' || n === '') return true;
  return isReduced(Number(n), Number(d)) && Number(n) < Number(d);
}

// host: 창을 넣을 요소, options: { problem, check, answerRule, orderLabel, onTake, onCancel, keepOpen }
export function openPantry(host, { problem, check = 'practice', answerRule = 'equal', orderLabel = '', onTake, onCancel, canClose = true }) {
  const input = { w: '', n: '', d: '' };
  let active = 'n';

  const el = document.createElement('div');
  el.className = 'pantry';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `
    <div class="pantry-head">
      <img class="pantry-icon" src="${iconPath(INGREDIENTS[problem.ingredient].icon)}" alt="">
      <span class="pantry-tag">${problem.ingredient} 꺼내기</span>
      ${orderLabel ? `<span class="pantry-order">${orderLabel} 주문용</span>` : ''}
      <span class="pantry-guide">답을 맞게 쓰면 그만큼 들고 나와요</span>
      ${canClose ? '<button class="pantry-close" type="button" aria-label="창 닫기">닫기</button>' : ''}
    </div>
    <p class="pantry-q">${partsHTML(problem.parts)}</p>
    <div class="pantry-body">
      <div class="pantry-answer">
        <div class="frac-input" aria-label="답 입력 칸">
          <button class="cell cell-w" data-cell="w" type="button" aria-label="자연수 칸"></button>
          <span class="frac-stack">
            <button class="cell cell-n" data-cell="n" type="button" aria-label="분자 칸"></button>
            <span class="frac-bar"></span>
            <button class="cell cell-d" data-cell="d" type="button" aria-label="분모 칸"></button>
          </span>
          <span class="frac-unit">${problem.answerKind === 'count' ? problem.countUnit : problem.unit}</span>
        </div>
        <div class="pantry-msg" role="status"></div>
      </div>
      <div class="gauge" aria-hidden="true"></div>
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((k) => `<button type="button" data-key="${k}">${k}</button>`).join('')}
        <button type="button" data-key="del" class="key-wide">지우기</button>
        <button type="button" data-key="next" class="key-wide">다음 칸</button>
        <button type="button" data-key="ok" class="key-ok">꺼내기</button>
      </div>
    </div>`;
  host.appendChild(el);

  const cells = { w: el.querySelector('.cell-w'), n: el.querySelector('.cell-n'), d: el.querySelector('.cell-d') };
  const msg = el.querySelector('.pantry-msg');
  const gauge = el.querySelector('.gauge');
  const ORDER = ['w', 'n', 'd'];

  function render() {
    for (const k of ORDER) {
      cells[k].textContent = input[k];
      cells[k].classList.toggle('active', k === active);
    }
    drawGauge(gauge, problem, input);
  }

  function press(key) {
    msg.textContent = '';
    msg.classList.remove('bad');
    if (/^\d$/.test(key)) {
      if (input[active].length < 2) input[active] += key;
    } else if (key === 'del') {
      if (input[active]) input[active] = input[active].slice(0, -1);
      else active = ORDER[Math.max(0, ORDER.indexOf(active) - 1)];
    } else if (key === 'next') {
      active = ORDER[(ORDER.indexOf(active) + 1) % ORDER.length];
    } else if (key === 'ok') {
      submit();
    }
    render();
  }

  function warn(text) {
    msg.textContent = text;
    msg.classList.add('bad');
  }

  function submit() {
    const answer = readAnswer(input);
    if (!answer) return warn('칸을 다 채워 주세요');
    if (!meetsRule(input, answerRule)) return warn('기약분수나 대분수로 써 주세요');
    const correct = eq(answer, problem.answer);
    if (!correct && check === 'practice') return warn('양이 이상해요. 다시 풀어 봐요');
    finish();
    onTake?.({ correct, answer, amount: amountFromAnswer(problem, answer) });
  }

  function onKey(e) {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Tab') {
      e.preventDefault();
      press('next');
    } else if (e.key === 'Enter') press('ok');
    else if (e.key === 'Escape' && canClose) cancel();
    else return;
    e.stopPropagation();
  }

  function finish() {
    window.removeEventListener('keydown', onKey, true);
    el.remove();
  }
  function cancel() {
    finish();
    onCancel?.();
  }

  el.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      active = cell.dataset.cell;
      render();
    }
    const key = e.target.closest('[data-key]');
    if (key) press(key.dataset.key);
    if (e.target.closest('.pantry-close')) cancel();
  });
  window.addEventListener('keydown', onKey, true);
  render();
  return { close: finish };
}

function drawGauge(gauge, problem, input) {
  const value = readAnswer(input);
  if (problem.answerKind === 'count') drawCups(gauge, problem, value);
  else drawBars(gauge, problem, value, Number(input.d) || 1);
}

// 1학기: 계량 막대가 입력한 분모만큼 나뉘고 입력한 만큼 칠해진다.
function drawBars(gauge, problem, value, denom) {
  const m = value ? toMixed(value) : { w: 0, n: 0, d: 1 };
  const filled = value ? Math.round((value.n * denom) / value.d) : 0;
  const bars = Math.min(4, Math.max(1, Math.ceil(filled / denom)));
  const over = filled > bars * denom;
  let html = '<div class="gauge-title">계량 막대</div>';
  for (let b = 0; b < bars; b++) {
    let cells = '';
    for (let c = 0; c < denom; c++) {
      cells += `<span class="${b * denom + c < filled ? 'on' : ''}"></span>`;
    }
    html += `<div class="bar-row"><div class="bar">${cells}</div><span class="bar-label">1 ${problem.unit}</span></div>`;
  }
  if (over) html += '<div class="gauge-note">막대보다 많아요</div>';
  gauge.innerHTML = html;
  void m;
}

// 2학기: 계량컵 그림이 입력한 횟수만큼 반복되어 쌓인다.
function drawCups(gauge, problem, value) {
  const MAX_CUPS = 12;
  const count = value ? value.n / value.d : 0; // 그림의 길이 계산에만 쓴다
  const shown = Math.min(MAX_CUPS, Math.ceil(count));
  const name = problem.countUnit === '배' ? '한 칸' : `한 ${problem.countUnit}`;
  let html = `<div class="gauge-title">${name} ${fracHTML(problem.cup, problem.unit, 'improper')}</div><div class="cups">`;
  for (let c = 0; c < Math.max(1, shown); c++) {
    const fill = value ? Math.max(0, Math.min(1, count - c)) : 0;
    html += `<span class="cup"><span class="cup-fill" style="height:${fill * 100}%"></span></span>`;
  }
  html += '</div>';
  if (count > MAX_CUPS) html += '<div class="gauge-note">컵이 너무 많아요</div>';
  gauge.innerHTML = html;
}
