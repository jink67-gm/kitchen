/* 가져온 곳: 같은 선생님의 게임 SCHOOL(jink67-gm/SCHOOL)의 js/qr.js
=====================================================================
   qr.js — QR 코드 만들기 (외부 서비스·인터넷 없이 이 화면 안에서 직접 생성)

   QRGen.draw(canvas, "https://.../?room=1234", 크기px)  → 성공하면 true
   QRGen.matrix(text) → 모듈 배열 (true = 검은 칸)

   ▸ 표준 QR (ISO/IEC 18004) · 바이트(UTF-8) 모드 · 오류 복원 M(약 15%) · 버전 1~10 (최대 213바이트)
   ▸ 실패해도(주소가 너무 긴 경우 등) 오류를 던지지 않고 false 를 돌려주므로 게임은 그대로 진행됩니다.
   ===================================================================== */

const QRGen = (() => {
  // 버전별 (오류 복원 M) : 블록마다 오류 정정 코드워드 수, 블록 구성 [[블록 수, 데이터 코드워드 수], …]
  const TABLE_M = {
    1: { ec: 10, groups: [[1, 16]] },
    2: { ec: 16, groups: [[1, 28]] },
    3: { ec: 26, groups: [[1, 44]] },
    4: { ec: 18, groups: [[2, 32]] },
    5: { ec: 24, groups: [[2, 43]] },
    6: { ec: 16, groups: [[4, 27]] },
    7: { ec: 18, groups: [[4, 31]] },
    8: { ec: 22, groups: [[2, 38], [2, 39]] },
    9: { ec: 22, groups: [[3, 36], [2, 37]] },
    10: { ec: 26, groups: [[4, 43], [1, 44]] },
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

  const dataCapacity = (v) => TABLE_M[v].groups.reduce((a, [n, k]) => a + n * k, 0);

  function utf8(text) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(text));
    return Array.from(unescape(encodeURIComponent(text))).map((c) => c.charCodeAt(0));
  }

  // ── GF(256) · 리드-솔로몬 ──
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    const r = new Array(degree).fill(0); r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = new Array(div.length).fill(0);
    data.forEach((b) => {
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
    });
    return r;
  }

  // ── 데이터 비트열 → 코드워드 (오류 정정 포함, 섞기) ──
  function codewords(bytes, v) {
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4);                              // 바이트 모드
    put(bytes.length, v < 10 ? 8 : 16);          // 글자 수
    bytes.forEach((b) => put(b, 8));
    const cap = dataCapacity(v) * 8;
    put(0, Math.min(4, cap - bits.length));      // 끝 표시
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    for (let pad = 0xec; data.length < dataCapacity(v); pad ^= 0xec ^ 0x11) data.push(pad);
    // 블록으로 나누고 블록마다 오류 정정 코드 계산
    const { ec, groups } = TABLE_M[v];
    const div = rsDivisor(ec);
    const blocks = [];
    let k = 0;
    groups.forEach(([n, len]) => { for (let i = 0; i < n; i++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, div) }); } });
    const out = [];
    const maxD = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ec; i++) blocks.forEach((b) => out.push(b.e[i]));
    return out;
  }

  // ── 그림 칸 만들기 ──
  function build(bytes, v) {
    const size = v * 4 + 17;
    const mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    // 타이밍 패턴
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // 위치 찾기 패턴 (세 모서리) + 분리 칸
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // 정렬 패턴
    const al = ALIGN[v];
    al.forEach((ay, i) => al.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    // 형식 정보 자리 예약 (나중에 채움)
    drawFormat(mod, fn, size, 0);
    // 버전 정보 (7 이상)
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }
    // 데이터 채우기 (오른쪽 아래부터 지그재그)
    const cw = codewords(bytes, v);
    const totalBits = cw.length * 8 + REMAINDER[v];
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (fn[y][x] || i >= totalBits) continue;
          mod[y][x] = i < cw.length * 8 ? ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
          i++;
        }
      }
    }
    // 마스크 8가지 중 가장 읽기 쉬운 것
    let best = null, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const t = mod.map((r) => r.slice());
      applyMask(t, fn, size, m);
      drawFormat(t, fn, size, m);
      const sc = penalty(t, size);
      if (sc < bestScore) { bestScore = sc; best = t; }
    }
    return best;
  }

  function maskBit(m, y, x) {
    switch (m) {
      case 0: return (y + x) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (y + x) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((y * x) % 2) + ((y * x) % 3) === 0;
      case 6: return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
      default: return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
    }
  }
  function applyMask(mod, fn, size, m) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskBit(m, y, x)) mod[y][x] = !mod[y][x];
  }

  // 형식 정보 (오류 복원 M = 00 + 마스크 번호)
  function drawFormat(mod, fn, size, mask) {
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);   // 항상 검은 칸
  }

  // 읽기 어려운 모양일수록 높은 점수 (표준의 네 가지 규칙)
  function penalty(mod, size) {
    let score = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(mod[y]);
    for (let x = 0; x < size; x++) lines.push(mod.map((r) => r[x]));
    lines.forEach((line) => {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      const s = line.map((d) => (d ? 1 : 0)).join("");
      const p1 = "10111010000", p2 = "00001011101";
      for (let i = s.indexOf(p1); i !== -1; i = s.indexOf(p1, i + 1)) score += 40;
      for (let i = s.indexOf(p2); i !== -1; i = s.indexOf(p2, i + 1)) score += 40;
    });
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
    }
    let dark = 0;
    mod.forEach((r) => r.forEach((d) => { if (d) dark++; }));
    score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return score;
  }

  function matrix(text) {
    const bytes = utf8(String(text));
    for (let v = 1; v <= 10; v++) {
      const head = 4 + (v < 10 ? 8 : 16);
      if (head + bytes.length * 8 <= dataCapacity(v) * 8) return build(bytes, v);
    }
    return null;   // 너무 긴 주소
  }

  // 캔버스에 그리기 (둘레에 흰 여백 4칸)
  function draw(canvas, text, px = 240) {
    try {
      const m = matrix(text);
      if (!m || !canvas || !canvas.getContext) return false;
      const n = m.length + 8;
      const cell = Math.max(1, Math.floor(px / n));
      const w = cell * n;
      const r = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * r); canvas.height = Math.round(w * r);
      canvas.style.width = w + "px"; canvas.style.height = w + "px";
      const g = canvas.getContext("2d");
      g.setTransform(r, 0, 0, r, 0, 0);
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, w);
      g.fillStyle = "#000000";
      m.forEach((row, y) => row.forEach((d, x) => { if (d) g.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell); }));
      return true;
    } catch (e) {
      return false;
    }
  }

  return { draw, matrix };
})();

window.QRGen = QRGen;   // 수학 레스토랑: 모듈(game.js)에서 쓰도록
