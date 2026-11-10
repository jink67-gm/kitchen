// 효과음 모듈 — 7단계
// 모든 소리를 브라우저에서 직접 합성합니다 (녹음 파일 없음 → 저작권·라이선스 문제 없음, 인터넷 없이도 동작).
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
};
export const SOUND_NAMES = Object.keys(SOUNDS);

export function play(name) {
  if (!ready()) return false;
  try { (SOUNDS[name] || SOUNDS.pickup)(); return true; } catch { return false; }
}
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
  if (volume <= 0) setSizzle(false);
  try { localStorage.setItem('mathcook-volume', String(volume)); } catch {}
}
export const getVolume = () => volume;
export const volumeIcon = () => (volume <= 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊');
