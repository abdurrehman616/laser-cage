// Small synthesised sound effects, so the app ships with no audio files.
import { profile } from './save';

let ac: AudioContext | null = null;
export function unlockAudio() {
  if (!ac) { try { ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* no audio */ } }
  if (ac?.state === 'suspended') ac.resume();
}

function tone(f: number, d: number, type: OscillatorType = 'square', v = 0.05, to?: number, delay = 0) {
  if (!ac || !profile.sound) return;
  const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, n);
  if (to) o.frequency.exponentialRampToValueAtTime(to, n + d);
  g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.0001, n + d);
  o.connect(g).connect(ac.destination); o.start(n); o.stop(n + d + 0.02);
}
function noise(d: number, v = 0.08) {
  if (!ac || !profile.sound) return;
  const len = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  s.buffer = buf; g.gain.value = v; s.connect(f).connect(g).connect(ac.destination); s.start();
}

export const sfx = {
  click: () => tone(520, 0.05, 'triangle', 0.04),
  round: () => { tone(330, 0.12, 'triangle', 0.05); tone(495, 0.16, 'triangle', 0.05, undefined, 0.1); },
  tick: (last: boolean) => tone(last ? 880 : 660, 0.08, 'square', 0.04),
  lock: () => tone(220, 0.28, 'square', 0.05, 180),
  fire: () => { tone(1100, 0.35, 'sawtooth', 0.05, 90); noise(0.2, 0.05); },
  hit: () => { tone(160, 0.35, 'square', 0.06, 50); noise(0.35, 0.1); },
  drop: () => { tone(120, 0.7, 'triangle', 0.08, 40); noise(0.6, 0.06); },
  buy: () => { tone(660, 0.08, 'triangle', 0.05); tone(990, 0.14, 'triangle', 0.05, undefined, 0.08); },
  denied: () => tone(180, 0.15, 'square', 0.04),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.05, undefined, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.05, undefined, i * 0.15)),
};

export function buzz(ms: number | number[]) {
  if (!profile.vibrate) return;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}
