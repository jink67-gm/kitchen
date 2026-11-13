// 효과음 모듈 — 7단계
// 녹음된 효과음(Kenney, CC0 — CREDITS.md 참고)을 먼저 쓰고, 파일을 못 읽거나 맞는 녹음이 없는 소리는 브라우저에서 직접 합성합니다.
// 사용: sfx.play('chop'), sfx.setVolume(0~1), sfx.setSizzle(true/false)

let ctx = null, master = null, noiseBuf = null, sizzle = null;
let volume = 0.8;
try { const v = Number(localStorage.getItem('mathcook-volume')); if (v >= 0 && v <= 1 && localStorage.getItem('mathcook-volume') !== null) volume = v; } catch {}

function ready() {
  if (volume <= 0) return false;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  } catch { return false; }
}
// 음 하나: 종류, 시작·끝 주파수, 길이, 크기, 지연
function tone(type, f0, f1, dur, gain = 0.08, delay = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
// 잡음 한 번: 걸러낼 주파수, 길이, 크기 (칼질·물소리·버리기)
function noise(freq, q, dur, gain = 0.08, delay = 0) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + delay;
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5, dur + 0.02);
}

const SOUNDS = {
  pickup: () => tone('sine', 390, 520, 0.14),
  return: () => tone('sine', 520, 330, 0.16),
  store: () => { tone('sine', 440, 440, 0.07); tone('sine', 660, 660, 0.1, 0.06, 0.07); },
  success: () => { tone('triangle', 523, 784, 0.16); tone('triangle', 784, 1046, 0.18, 0.06, 0.12); },
  error: () => tone('sine', 185, 125, 0.2, 0.09),
  chop: () => { noise(1800, 1.2, 0.05, 0.16); tone('square', 220, 90, 0.06, 0.05); },
  stir: () => { noise(600, 2, 0.12, 0.1); tone('sine', 300, 380, 0.1, 0.03); },
  wash: () => { noise(3200, 0.8, 0.14, 0.1); tone('sine', 900, 1500, 0.08, 0.025, 0.03); },
  plate: () => { tone('sine', 1900, 1700, 0.09, 0.06); tone('sine', 2600, 2400, 0.07, 0.03, 0.02); },
  panStart: () => noise(4500, 0.6, 0.5, 0.12),
  cookDone: () => { tone('triangle', 880, 880, 0.12, 0.08); tone('triangle', 1175, 1175, 0.22, 0.08, 0.13); },
  warn: () => { tone('square', 740, 740, 0.09, 0.06); tone('square', 740, 740, 0.09, 0.06, 0.16); },
  burnt: () => { tone('sawtooth', 200, 70, 0.45, 0.08); noise(700, 0.7, 0.4, 0.08); },
  trash: () => { noise(350, 0.8, 0.18, 0.16); tone('sine', 140, 80, 0.2, 0.07); },
  serve: () => { tone('sine', 1318, 1318, 0.5, 0.09); tone('sine', 1760, 1760, 0.5, 0.09, 0.09); },
  combo: () => [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.14, 0.07, 0.25 + i * 0.07)),
  rush: () => { for (let i = 0; i < 3; i++) tone('sawtooth', 660, 880, 0.2, 0.06, i * 0.22); },
  // ── 인트로용 (직접 합성) ──
  whoosh: () => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime; s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.35); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4); s.connect(f).connect(g).connect(master); s.start(t, 0, 0.45); },
  letter: () => [784, 988, 1175].forEach((f, i) => tone('sine', f, f, 0.25, 0.07, i * 0.09)),
  boing: () => { tone('square', 180, 620, 0.22, 0.05); tone('sine', 360, 900, 0.25, 0.06, 0.02); },
  pop: () => { tone('sine', 300, 900, 0.09, 0.09); noise(2500, 1, 0.05, 0.06); },
  murmur: () => { for (let i = 0; i < 9; i++) tone('triangle', 180 + Math.random() * 160, 160 + Math.random() * 200, 0.18, 0.02, i * 0.09); noise(900, 0.5, 0.9, 0.04); },
  warn: () => { tone('square', 880, 880, 0.1, 0.05); tone('square', 660, 660, 0.1, 0.05, 0.12); tone('square', 880, 880, 0.1, 0.05, 0.24); },
  thud: () => { tone('sine', 120, 45, 0.35, 0.22); noise(300, 0.6, 0.25, 0.14); },
  rattle: () => { for (let i = 0; i < 5; i++) { noise(4200, 3, 0.05, 0.08, i * 0.07); tone('square', 1600 + i * 90, 1400, 0.04, 0.025, i * 0.07); } },
  nope: () => { tone('triangle', 494, 494, 0.16, 0.08); tone('triangle', 392, 392, 0.3, 0.08, 0.17); },
  gasp: () => { tone('sine', 1400, 150, 1.0, 0.09); tone('triangle', 1200, 130, 1.0, 0.05, 0.03); },
  drumroll: () => { for (let i = 0; i < 18; i++) noise(240 + (i % 2) * 60, 0.8, 0.06, 0.05 + i * 0.006, i * 0.06); },
  missionStart: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone('square', f, f, i === 5 ? 0.5 : 0.12, 0.05, i * 0.11)),
};
export const SOUND_NAMES = Object.keys(SOUNDS);

// 녹음 효과음: 이름 → [파일들(여러 개면 매번 다른 것), 크기]. 바꾸고 싶으면 이 표의 파일 이름만 고치면 됩니다.
const DIR = 'assets/sounds/';
const SAMPLES = {
  pickup: [['drop_001.ogg'], 0.7], return: [['drop_003.ogg'], 0.7], store: [['drop_002.ogg'], 0.7],
  success: [['confirmation_001.ogg'], 0.7], error: [['error_004.ogg'], 0.6],
  chop: [['impactWood_light_000.ogg', 'impactWood_light_001.ogg', 'impactWood_light_002.ogg'], 0.9],
  plate: [['impactPlate_light_000.ogg', 'impactPlate_medium_000.ogg'], 0.8],
  trash: [['impactSoft_heavy_000.ogg'], 0.9],
  serve: [['impactBell_heavy_000.ogg'], 0.8],
  combo: [['jingles_PIZZI07.ogg'], 0.6], rush: [['jingles_NES05.ogg'], 0.5], roundEnd: [['jingles_STEEL02.ogg'], 0.6],
  missionStart: [['jingles_NES00.ogg'], 0.6], letter: [['jingles_PIZZI02.ogg'], 0.55],
};
const buffers = {};       // 파일 이름 → 소리 데이터
let loading = false;
function loadSamples() {
  if (loading) return; loading = true;
  for (const [files] of Object.values(SAMPLES)) for (const f of files) {
    fetch(DIR + f).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(a => ctx.decodeAudioData(a)).then(b => { buffers[f] = b; }).catch(() => {});   // 실패하면 합성음으로 대신함
  }
}
function playSample(name) {
  const def = SAMPLES[name]; if (!def) return false;
  const ok = def[0].filter(f => buffers[f]); if (!ok.length) return false;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buffers[ok[Math.floor(Math.random() * ok.length)]]; g.gain.value = def[1];
  s.connect(g).connect(master); s.start();
  return true;
}
export const sampleCount = () => Object.keys(buffers).length;

export function play(name) {
  if (!ready()) return false;
  try { loadSamples(); if (!playSample(name)) (SOUNDS[name] || SOUNDS.success)(); return true; } catch { return false; }
}
// ── 배경음악 (인트로용, 직접 작곡해 브라우저에서 합성) ──
// 음표는 MIDI 번호(60 = 가운데 도), null = 쉼표. 한 칸 = 8분음표
// 한 칸 = 16분음표. lead·bass는 8분음표 단위 배열, chords는 한 마디마다 [뿌리음, 단조?], drums는 한 마디 16칸
//   드럼 글자: k 킥 · s 스네어 · h 하이햇 · x 킥+하이햇 · t 시계 째깍 · . 쉼
const bar = (r, o = 12) => [r, r, r + o, r, r, r + o, r, r + o];   // 달리는 베이스 한 마디
const SONGS = {
  // 인트로 시작: 밝고 통통 튀게
  calm: { bpm: 132, wave: 'square', vol: 0.05,
    lead: [72, null, 76, 79, 77, 76, 74, null, 72, 74, 76, 72, 71, null, 67, null, 69, null, 72, 76, 74, 72, 71, null, 72, 76, 79, 84, 79, null, null, null],
    bass: [...bar(48), ...bar(45), ...bar(41), ...bar(43)], chords: [[60, 0], [57, 1], [53, 0], [55, 0]], drums: 'k.h.s.h.k.h.s.hh' },
  // 게임 중: 흥미진진하게 (가단조, 달리는 베이스, 드럼)
  cook: { bpm: 148, wave: 'square', vol: 0.055,
    lead: [76, null, 76, 79, 81, null, 79, 76, 77, null, 77, 76, 74, null, 72, 74, 76, null, 76, 79, 84, null, 83, 81, 79, null, 77, 76, 74, 76, 74, 71,
           69, null, 72, 76, 74, null, 72, 69, 77, null, 76, 74, 72, null, 71, 72, 74, null, 76, 77, 79, null, 81, 79, 76, null, 74, null, 71, null, 69, null],
    bass: [...bar(45), ...bar(41), ...bar(48), ...bar(43)], chords: [[57, 1], [53, 0], [60, 0], [55, 0]], drums: 'x.h.s.h.x.x.s.hh' },
  // 러시타임·주문 폭주: 더 빠르고 급하게 (마단조)
  rush: { bpm: 172, wave: 'sawtooth', vol: 0.045,
    lead: [76, 76, null, 76, 79, null, 76, 74, 72, 72, null, 72, 76, null, 72, 71, 74, 74, null, 74, 78, null, 74, 72, 71, null, 75, null, 78, null, 83, null],
    bass: [...bar(40), ...bar(36), ...bar(38), ...bar(35)], chords: [[64, 1], [60, 0], [62, 0], [59, 0]], drums: 'x.hsx.hsx.hsxsss' },
  // 잠긴 레시피: 째깍째깍 시계 + 낮게 쿵쿵, 불안한 음
  tense: { bpm: 104, wave: 'triangle', vol: 0.08,
    lead: [null, null, null, null, 76, null, 75, null, null, null, null, null, 76, null, 77, null, null, null, null, null, 79, null, 78, null, null, null, 77, null, 76, null, 75, null],
    bass: [40, null, 40, null, 41, null, 40, null, 40, null, 40, null, 41, null, 43, null], chords: null, drums: 'k.t.t.t.k.t.t.t.' },
  // 학생 요리사 등장: 씩씩한 행진
  hero: { bpm: 140, wave: 'square', vol: 0.05,
    lead: [67, null, 72, null, 72, 74, 76, null, 74, null, 72, null, 76, null, 79, null, 79, 77, 76, 74, 76, null, 72, null, 74, 76, 74, 72, 72, null, null, null],
    bass: [...bar(48), ...bar(43), ...bar(45), ...bar(41)], chords: [[60, 0], [55, 0], [57, 1], [53, 0]], drums: 'x.h.s.h.x.hhs.sh' },
  // 메뉴·대기실: 가볍게 들썩이게 (기다리는 동안 지루하지 않게)
  lobby: { bpm: 116, wave: 'triangle', vol: 0.07,
    lead: [72, null, null, 76, null, null, 79, null, 77, null, null, 76, null, null, 74, null, 72, null, null, 74, null, null, 76, null, 74, null, null, 71, null, null, 67, null],
    bass: [48, null, 55, null, 48, 55, 53, null, 45, null, 52, null, 45, 52, 43, null], chords: [[60, 0], [57, 1], [53, 0], [55, 0]], drums: 'k...h...s...h.h.' },
  // 결과 화면
  result: { bpm: 108, wave: 'triangle', vol: 0.07,
    lead: [79, null, 76, null, 72, null, 76, null, 77, null, 74, null, 71, null, 74, null, 76, null, 72, null, 69, null, 72, null, 74, 72, 71, 69, 67, null, null, null],
    bass: [48, null, 55, null, 53, null, 55, null, 45, null, 52, null, 43, null, 48, null], chords: null, drums: 'k...h...s...h...' },
};
let song = null, songTimer = null, songGain = null, songStep = 0, songNext = 0;
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
function note(type, f, at, dur, gain) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(songGain); o.start(at); o.stop(at + dur + 0.03);
}
function hit(at, kind) {
  if (kind === 'k') {                                     // 킥: 낮게 떨어지는 음
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.13);
    g.gain.setValueAtTime(0.13, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    o.connect(g).connect(songGain); o.start(at); o.stop(at + 0.18); return;
  }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  const p = { s: ['bandpass', 1900, 0.07, 0.13], h: ['highpass', 7000, 0.02, 0.04], t: ['bandpass', 3200, 0.05, 0.025] }[kind];
  f.type = p[0]; f.frequency.value = p[1]; if (kind === 't') f.Q.value = 8;
  g.gain.setValueAtTime(p[2], at); g.gain.exponentialRampToValueAtTime(0.0001, at + p[3]);
  s.connect(f).connect(g).connect(songGain); s.start(at, Math.random() * 0.5, p[3] + 0.02);
  if (kind === 's') { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(210, at); o.frequency.exponentialRampToValueAtTime(140, at + 0.06); og.gain.setValueAtTime(0.035, at); og.gain.exponentialRampToValueAtTime(0.0001, at + 0.08); o.connect(og).connect(songGain); o.start(at); o.stop(at + 0.1); }
}
function schedule() {
  if (!song || !ctx) return;
  const sp = 15 / song.bpm;                              // 16분음표 길이(초)
  while (songNext < ctx.currentTime + 0.15) {
    const i = songStep, at = songNext;
    if (i % 2 === 0) {                                    // 8분음표마다: 멜로디·베이스
      const L = song.lead[(i / 2) % song.lead.length], B = song.bass[(i / 2) % song.bass.length];
      if (L != null) note(song.wave, hz(L), at, sp * 1.8, song.vol);
      if (B != null) note('triangle', hz(B), at, sp * 1.7, Math.min(0.12, song.vol * 1.8));
    }
    if (song.chords) {                                    // 16분음표 아르페지오 (화음을 빠르게 오르내림)
      const [r, minor] = song.chords[Math.floor(i / 16) % song.chords.length], arp = [0, minor ? 3 : 4, 7, 12, 7, minor ? 3 : 4];
      note('triangle', hz(r + 12 + arp[i % arp.length]), at, sp * 0.9, Math.min(0.05, song.vol * 0.7));
    }
    const d = song.drums[i % song.drums.length];
    if (d === 'k' || d === 'x') hit(at, 'k');
    if (d === 'h' || d === 'x') hit(at, 'h');
    if (d === 's') hit(at, 's');
    if (d === 't') hit(at, 't');
    songStep++; songNext += sp;
  }
}
// 배경음악 바꾸기: 'calm' | 'rush' | 'tense' | 'hero' | 'cook' | 'lobby' | 'result' | null(멈춤)
export function setMusic(name) {
  const next = name && SONGS[name] ? SONGS[name] : null;
  if (next === song) return;
  if (songGain) { const g = songGain; try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); setTimeout(() => g.disconnect(), 600); } catch {} songGain = null; }
  song = null; clearInterval(songTimer); songTimer = null;
  if (!next || !ready()) return;
  song = next; songGain = ctx.createGain(); songGain.gain.value = 1.4; songGain.connect(master);
  songStep = 0; songNext = ctx.currentTime + 0.05; schedule(); songTimer = setInterval(schedule, 40);
}
export const musicName = () => (song ? Object.keys(SONGS).find(k => SONGS[k] === song) : null);

// 화덕에 굽는 것이 있는 동안 계속 나는 지글지글 소리
export function setSizzle(on) {
  if (on && !sizzle) {
    if (!ready()) return;
    try {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'highpass'; f.frequency.value = 3800; g.gain.value = 0.035;
      s.connect(f).connect(g).connect(master); s.start();
      sizzle = { s, g };
    } catch {}
  } else if (!on && sizzle) {
    try { sizzle.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3); sizzle.s.stop(ctx.currentTime + 0.35); } catch {}
    sizzle = null;
  }
}
// 음량: 0(끔) ~ 1. 버튼은 크게 → 작게 → 끔 순서로 돌아감
export const VOLUME_STEPS = [0.8, 0.35, 0];
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
  if (volume <= 0) { setSizzle(false); setMusic(null); }
  try { localStorage.setItem('mathcook-volume', String(volume)); } catch {}
}
export const getVolume = () => volume;
export const volumeIcon = () => (volume <= 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊');
