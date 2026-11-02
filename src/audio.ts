// Small synthesised sound effects, so the app ships with no audio files.
import { profile } from './save';

let ac: AudioContext | null = null;
export function unlockAudio() {
  if (!ac) { try { ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* no audio */ } }
  if (ac?.state === 'suspended') ac.resume();
  if (want && !track) refreshMusic();
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

// ---------- music ----------
// A tiny synth sequencer: no audio files, so the app stays small.
// Menu: calm arpeggio. Match: same chords with drums and a driving bass.
type Track = 'menu' | 'match' | null;
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
let track: Track = null, want: Track = null, timer = 0, step = 0, nextT = 0, master: GainNode | null = null;

function note(f: number, t: number, d: number, type: OscillatorType, v: number) {
  if (!ac || !master) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05);
}
function drum(t: number, kind: 'kick' | 'hat') {
  if (!ac || !master) return;
  if (kind === 'kick') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
  } else {
    const len = Math.floor(ac.sampleRate * 0.04), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'highpass'; f.frequency.value = 6000; g.gain.value = 0.25;
    s.buffer = buf; s.connect(f).connect(g).connect(master); s.start(t);
  }
}
function tick() {
  if (!ac || !track) return;
  const bpm = track === 'menu' ? 100 : 124, sixteenth = 60 / bpm / 4;
  while (nextT < ac.currentTime + 0.15) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, chord = CHORDS[bar];
    if (track === 'menu') {
      if (s === 0) note(hz(chord[0] - 24), nextT, sixteenth * 14, 'triangle', 0.5);
      if (s % 2 === 0) note(hz(chord[(s / 2) % 3] + 12), nextT, sixteenth * 1.8, 'triangle', 0.18);
    } else {
      if (s % 4 === 0) drum(nextT, 'kick');
      if (s % 4 === 2) drum(nextT, 'hat');
      if (s % 2 === 0) note(hz(chord[0] - 24), nextT, sixteenth * 1.6, 'square', 0.16);
      if (s % 4 === 1 || s === 14) note(hz(chord[(s >> 2) % 3] + 12), nextT, sixteenth * 1.5, 'square', 0.07);
    }
    nextT += sixteenth; step++;
  }
}
/** Switch the background music. Respects the Music setting. */
export function playMusic(t: Track) {
  want = t;
  if (!ac || !profile.music || document.hidden) t = null;
  if (t === track) return;
  track = t;
  clearInterval(timer);
  if (!ac) return;
  if (!master) { master = ac.createGain(); master.gain.value = 0.07; master.connect(ac.destination); }
  if (!t) return;
  step = 0; nextT = ac.currentTime + 0.05;
  timer = window.setInterval(tick, 30);
}
/** Re-apply after the Music setting changes, audio unlocks, or the app comes back to the front. */
export function refreshMusic() { const w = want; track = null; playMusic(w); }
document.addEventListener('visibilitychange', refreshMusic);
