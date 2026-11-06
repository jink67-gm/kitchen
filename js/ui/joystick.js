// 가상 조이스틱과 A/B 버튼. 움직임은 { x, y }(-1~1)로 읽는다.
export function createControls(host, { onA, onB }) {
  const root = document.createElement('div');
  // 터치가 없는 기기(트랙패드만 있는 크롬북 등)는 클릭과 키보드로 하므로 버튼을 숨긴다.
  root.className = navigator.maxTouchPoints > 0 ? 'controls' : 'controls no-touch';
  root.innerHTML = `
    <div class="stick" aria-label="이동 조이스틱"><div class="stick-knob"></div></div>
    <div class="action-buttons">
      <button class="btn-b" type="button" aria-label="B 사용"><b>B</b><small>사용</small></button>
      <button class="btn-a" type="button" aria-label="A 집기 놓기"><b>A</b><small>집기</small></button>
    </div>`;
  host.appendChild(root);

  const stick = root.querySelector('.stick');
  const knob = root.querySelector('.stick-knob');
  const move = { x: 0, y: 0 };
  let pointer = null;

  function update(e) {
    const r = stick.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    move.x = Math.abs(dx) < 0.15 ? 0 : dx;
    move.y = Math.abs(dy) < 0.15 ? 0 : dy;
    knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
  }
  function release() {
    pointer = null;
    move.x = 0;
    move.y = 0;
    knob.style.transform = '';
  }
  stick.addEventListener('pointerdown', (e) => {
    pointer = e.pointerId;
    stick.setPointerCapture(pointer);
    update(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointer) update(e);
  });
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  const bind = (selector, fn) => {
    root.querySelector(selector).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
  };
  bind('.btn-a', onA);
  bind('.btn-b', onB);

  return { move, destroy: () => root.remove() };
}
