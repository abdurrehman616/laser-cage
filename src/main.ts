import './styles.css';
import { BOT_NAMES, Difficulty, HAIR_COLORS, ITEMS, NPC_OUTFITS, REWARDS, SEAT_COLORS, Slot, item } from './config';
import { Match, SeatSpec } from './game/match';
import { ArenaView } from './render/scene';
import { addCoins, buy, equip, profile, save } from './save';
import { buzz, sfx, unlockAudio } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const view = new ArenaView($('view') as HTMLCanvasElement, $('labels'));

// ---------------- state ----------------
type Screen = 'home' | 'shop' | 'settings' | 'howto' | 'game' | 'pause' | 'result';
let screen: Screen = 'home';
let match: Match | null = null;
let paused = false;
const setup = { bots: 3, diff: 'normal' as Difficulty };
const keys = new Set<string>();
const diffMult: Record<Difficulty, number> = { easy: 1, normal: 1.5, hard: 2 };

const SCREENS: Screen[] = ['home', 'shop', 'settings', 'howto', 'pause', 'result'];
function show(s: Screen) {
  screen = s;
  for (const id of SCREENS) $(id).hidden = id !== s;
  const inGame = s === 'game' || s === 'pause' || s === 'result';
  $('hud').hidden = !inGame;
  view.menu = !inGame;
  view.shot = inGame ? 0 : s === 'shop' ? 2 : 1;
  if (!inGame) { idleArena(); refreshCoins(); }
  if (s === 'game') updateControls();
}

// ---------------- menu arena ----------------
function idleArena() {
  match = null;
  const idle = new Match('bots', []);
  idle.phase = 'over';
  view.setMatch(idle);
  view.setFloor(profile.equip.floor);
  showMyPreview();
  $('labels').innerHTML = '';
}
function showMyPreview() {
  const l = item(profile.equip.laser);
  view.showPreview({ outfit: profile.equip.outfit, hat: profile.equip.hat, hair: HAIR_COLORS[0] }, l.color!, !!l.rainbow);
}
function refreshCoins() {
  $('coinCount').textContent = String(profile.coins);
  document.querySelectorAll('.coinCount').forEach(e => (e.textContent = String(profile.coins)));
  const s = profile.stats;
  $('statLine').textContent = s.matches ? `${s.wins} WINS · ${s.kills} HITS · BEST ROUND ${s.bestRound}` : '';
}

// ---------------- toast / banner ----------------
let toastTO = 0, bannerTO = 0;
function toast(msg: string) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTO); toastTO = window.setTimeout(() => (t.hidden = true), 2400); }
const BANNER = { gold: 'var(--gold)', red: 'var(--red-hi)', blue: 'var(--blue-hi)', white: '#fff', green: 'var(--green-hi)' };
function banner(text: string, sub = '', ms = 1100, color: string = BANNER.gold) {
  const b = $('banner'); b.innerHTML = ''; b.style.color = color;
  b.append(text); if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
  b.classList.remove('off'); clearTimeout(bannerTO); bannerTO = window.setTimeout(() => b.classList.add('off'), ms);
}

// ---------------- home ----------------
function seg(id: string, vals: (string | number)[], get: () => string | number, set: (v: never) => void, labels?: string[]) {
  const el = $(id); el.innerHTML = '';
  vals.forEach((v, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = labels ? labels[i] : String(v);
    if (get() === v) b.className = 'on';
    b.onclick = () => { sfx.click(); set(v as never); seg(id, vals, get, set, labels); };
    el.appendChild(b);
  });
}
seg('segDiff', ['easy', 'normal', 'hard'], () => setup.diff, v => (setup.diff = v), ['EASY', 'NORMAL', 'HARD']);
function setBots(n: number) { setup.bots = Math.max(1, Math.min(5, n)); $('botCount').textContent = String(setup.bots); }
$('botsMinus').onclick = () => { sfx.click(); setBots(setup.bots - 1); };
$('botsPlus').onclick = () => { sfx.click(); setBots(setup.bots + 1); };
setBots(setup.bots);

$('playBtn').onclick = () => {
  unlockAudio(); sfx.click();
  if (!profile.tutorialDone) { pendingStart = true; show('howto'); return; }
  startMatch();
};
$('onlineBtn').onclick = () => { unlockAudio(); sfx.denied(); toast('Online battles are coming soon!'); };
document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => { sfx.click(); show('home'); }));
$('settingsBtn').onclick = () => {
  unlockAudio(); sfx.click();
  ($('optSound') as HTMLInputElement).checked = profile.sound; ($('optVibe') as HTMLInputElement).checked = profile.vibrate;
  ($('optSwap') as HTMLInputElement).checked = profile.swapSticks;
  seg('segGfx', ['auto', 'high', 'low'], () => profile.gfx, v => { profile.gfx = v; save(); applyGfx(); }, ['AUTO', 'HIGH', 'LOW']);
  show('settings');
};
$('optSwap').onchange = e => { profile.swapSticks = (e.target as HTMLInputElement).checked; save(); applySwap(); };
$('optSound').onchange = e => { profile.sound = (e.target as HTMLInputElement).checked; save(); };
$('optVibe').onchange = e => { profile.vibrate = (e.target as HTMLInputElement).checked; save(); };
let pendingStart = false;
$('howBtn').onclick = () => { unlockAudio(); sfx.click(); pendingStart = false; show('howto'); };
$('howOk').onclick = () => { sfx.click(); profile.tutorialDone = true; save(); if (pendingStart) startMatch(); else show('home'); };

// ---------------- shop ----------------
const TABS: { slot: Slot; name: string }[] = [
  { slot: 'laser', name: 'LASERS' }, { slot: 'outfit', name: 'OUTFITS' }, { slot: 'hat', name: 'HATS' }, { slot: 'floor', name: 'FLOORS' },
];
let shopTab: Slot = 'laser', shopSel = '';
$('shopBtn').onclick = () => { unlockAudio(); sfx.click(); shopSel = profile.equip[shopTab]; renderShop(); show('shop'); };
function swatch(id: string) {
  const it = item(id);
  if (it.slot === 'laser') return it.rainbow ? 'conic-gradient(#ff4d6d,#ffb547,#fff27a,#5ef0c0,#7fb8ff,#e3a2ff,#ff4d6d)' : it.color!;
  if (it.slot === 'outfit') return `linear-gradient(${it.shirt} 55%, ${it.trim} 55% 63%, ${it.pants} 63%)`;
  if (it.slot === 'hat') return it.hat === 'none' ? 'repeating-linear-gradient(45deg,#59628f 0 6px,#3d4570 6px 12px)' : it.hatColor!;
  return `radial-gradient(circle, ${it.floor!.mesh} 22%, ${it.floor!.base} 24%)`;
}
function renderShop() {
  const tabs = $('shopTabs'); tabs.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t.name; if (t.slot === shopTab) b.className = 'on';
    b.onclick = () => { sfx.click(); shopTab = t.slot; shopSel = profile.equip[t.slot]; renderShop(); applyPreview(); };
    tabs.appendChild(b);
  }
  const grid = $('shopGrid'); grid.innerHTML = '';
  for (const it of ITEMS.filter(i => i.slot === shopTab)) {
    const owned = profile.owned.includes(it.id), eq = profile.equip[it.slot] === it.id;
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'itm' + (it.premium ? ' rare' : it.price === 0 ? ' free' : '') + (shopSel === it.id ? ' sel' : '');
    b.innerHTML = `<span class="sw" style="background:${swatch(it.id)}"></span><span class="nm"></span>` +
      (owned ? `<span class="pr own">${eq ? 'EQUIPPED' : 'OWNED'}</span>` : `<span class="pr"><b class="coin"></b>${it.price}</span>`) +
      (eq ? '<span class="eq">✓</span>' : '') + (it.premium ? '<span class="vip">VIP</span>' : '');
    (b.querySelector('.nm') as HTMLElement).textContent = it.name.toUpperCase();
    b.onclick = () => { sfx.click(); shopSel = it.id; renderShop(); applyPreview(); };
    grid.appendChild(b);
  }
  const act = $('shopAction') as HTMLButtonElement, it = item(shopSel);
  const owned = profile.owned.includes(shopSel), eq = profile.equip[it.slot] === shopSel;
  act.disabled = eq;
  act.className = 'gbtn wide ' + (owned ? 'green' : 'yellow');
  act.innerHTML = eq ? 'EQUIPPED' : owned ? 'EQUIP' : `BUY <b class="coin"></b> ${it.price}`;
  refreshCoins();
}
function applyPreview() {
  // try the selected item on, without buying it
  const e = { ...profile.equip, [shopTab]: shopSel };
  const l = item(e.laser);
  view.showPreview({ outfit: e.outfit, hat: e.hat, hair: HAIR_COLORS[0] }, l.color!, !!l.rainbow);
  view.setFloor(e.floor);
}
$('shopAction').onclick = () => {
  const it = item(shopSel);
  if (profile.owned.includes(it.id)) { equip(it.id); sfx.click(); }
  else {
    const r = buy(it.id);
    if (r === 'poor') { sfx.denied(); toast(`Need ${it.price - profile.coins} more coins. Win matches to earn them!`); return; }
    sfx.buy(); buzz(30); toast(`${it.name.toUpperCase()} UNLOCKED!`);
  }
  renderShop(); applyPreview();
};

// ---------------- match ----------------
function pick<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }
function buildSeats(): SeatSpec[] {
  const mine = item(profile.equip.laser);
  const others = SEAT_COLORS.filter(c => c.toLowerCase() !== mine.color!.toLowerCase());
  const seats: SeatSpec[] = [{ name: 'You', color: mine.color!, rainbow: !!mine.rainbow, human: true,
    look: { outfit: profile.equip.outfit, hat: profile.equip.hat, hair: HAIR_COLORS[0] } }];
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < setup.bots; i++) seats.push({
    name: names[i], color: others[i % others.length], human: false,
    look: { outfit: pick(NPC_OUTFITS), hat: pick(['hat_none', 'hat_none', 'hat_cap', 'hat_band']), hair: HAIR_COLORS[(i + 1) % HAIR_COLORS.length] },
  });
  return seats;
}

const PHASE_LABEL: Record<string, string> = { intro: 'REMEMBER!', hide: 'HIDE & AIM', lock: 'LOCKED', fire: 'FIRE!', drop: 'FLOOR DROP', over: '' };

function startMatch() {
  view.clearPreview(); $('labels').innerHTML = '';
  match = new Match('bots', buildSeats(), setup.diff);
  const m = match;
  view.setMatch(m); view.setFloor(profile.equip.floor);
  m.on(e => {
    if (match !== m) return;
    switch (e.type) {
      case 'round':
        $('roundTag').textContent = 'ROUND ' + e.round;
        banner('ROUND ' + e.round, e.final ? 'Final platform! Lasers get wider' : 'Remember where everyone is');
        sfx.round(); chips();
        break;
      case 'phase':
        $('phaseTag').textContent = e.phase === 'drop' && m.final ? 'SUDDEN DEATH' : PHASE_LABEL[e.phase];
        if (e.phase === 'hide') banner('HIDE!', 'Everyone is invisible', 800, BANNER.blue);
        updateControls();
        break;
      case 'tick': sfx.tick(e.sec === 1); if (e.sec === 1) buzz(15); break;
      case 'lock': banner('LOCK!', '', 600, BANNER.red); sfx.lock(); buzz(40); break;
      case 'fire': {
        view.showShots(m); sfx.fire();
        if (e.victims.length) {
          setTimeout(() => sfx.hit(), 120);
          const meHit = e.victims.includes(m.me);
          buzz(meHit ? [80, 60, 120] : 50);
          const v = e.victims[0];
          banner(e.victims.length > 1 ? `${e.victims.length} DOWN!` : meHit ? 'YOU\'RE OUT!' : `${v.name.toUpperCase()} IS OUT!`, '', 1000, meHit ? BANNER.red : BANNER.gold);
        } else banner('MISSED!', 'Everyone dodged', 900, BANNER.white);
        chips();
        break;
      }
      case 'drop': sfx.drop(); buzz(30); if (e.fell.length) banner('FELL!', e.fell.map(p => p.name).join(' · '), 1000, BANNER.red); chips(); break;
      case 'sudden': banner('SUDDEN DEATH', 'Lasers get wider', 1000, BANNER.red); break;
      case 'over': setTimeout(() => { if (match === m) results(m); }, 900); break;
    }
  });
  paused = false;
  show('game');
  view.snapCamera();
  m.start();
}
$('pauseBtn').onclick = () => { sfx.click(); pause(); };
$('resumeBtn').onclick = () => { sfx.click(); paused = false; show('game'); };
$('quitBtn').onclick = () => { sfx.click(); paused = false; show('home'); };
$('homeBtn').onclick = () => { sfx.click(); show('home'); };
$('againBtn').onclick = () => { sfx.click(); startMatch(); };
function pause() { if (!match || match.phase === 'over' || screen !== 'game') return; paused = true; show('pause'); }

function chips() {
  if (!match) return;
  $('chips').innerHTML = '';
  for (const p of match.players) {
    const c = document.createElement('span'); c.className = 'chip' + (p.alive ? '' : ' out');
    c.innerHTML = '<b></b>'; (c.firstChild as HTMLElement).style.setProperty('--c', p.color);
    c.append(p.name.toUpperCase()); $('chips').appendChild(c);
  }
}

function updateControls() {
  const m = match, c = m?.controlled();
  const inGame = screen === 'game';
  $('aimpad').hidden = $('movepad').hidden = !(inGame && c);
  if (!c) { moveStick.reset(); aimStick.reset(); }
  const hint = $('hint');
  if (inGame && m?.phase === 'hide' && c && m.round <= 2) { hint.hidden = false; hint.textContent = 'Move somewhere new. Aim where you think someone went!'; }
  else hint.hidden = true;
}

function ord(n: number) { const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function results(m: Match) {
  updateControls();
  const me = m.me, place = m.placeOf(me), kills = me.kills;
  const won = me.alive && m.alive.length === 1;
  const coins = Math.round((REWARDS.perMatch + me.survived * REWARDS.perRoundSurvived + kills * REWARDS.perKill + (won ? REWARDS.win : 0)) * diffMult[m.diff]);
  const sub = won ? `Last one standing out of ${m.players.length}!`
    : me.how === 'fell' ? 'You were on the outer ring when it dropped.'
    : me.killedBy ? `${me.killedBy.name} guessed where you went.` : 'You got caught in a laser.';
  won ? sfx.win() : sfx.lose();
  profile.stats.matches++; profile.stats.wins += won ? 1 : 0; profile.stats.kills += kills;
  profile.stats.bestRound = Math.max(profile.stats.bestRound, m.round);
  addCoins(coins);
  const t = $('resTitle'); t.textContent = won ? 'VICTORY!' : 'ELIMINATED'; t.className = 'ribbon ' + (won ? 'win' : 'lose');
  $('resLabel').textContent = `VS BOTS · ${m.diff.toUpperCase()}`;
  $('resSub').textContent = sub;
  $('stPlace').textContent = ord(place);
  $('stKills').textContent = String(kills);
  $('stCoins').textContent = '+' + coins;
  show('result');
}

// ---------------- input ----------------
const canvas = $('view');
let dragging = false;
canvas.addEventListener('pointerdown', e => {
  if (screen !== 'game' || !match?.controlled()) return;
  unlockAudio(); dragging = true;
  const g = view.screenToGround(e.clientX, e.clientY); if (g) match.setTarget(g.x, g.z);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
canvas.addEventListener('pointermove', e => {
  if (screen !== 'game' || !match?.controlled()) return;
  const g = view.screenToGround(e.clientX, e.clientY); if (!g) return;
  if (e.pointerType === 'mouse' && !(e.buttons & 1)) match.aimAtPoint(g.x, g.z);
  else if (dragging) match.setTarget(g.x, g.z);
});
addEventListener('pointerup', () => (dragging = false));

// Twin sticks. Each stick tracks its own finger, so you can move and aim at the same time.
class Stick {
  x = 0; y = 0; mag = 0; private id: number | null = null;
  constructor(el: HTMLElement, onMove?: (dx: number, dy: number, mag: number) => void) {
    const knob = el.querySelector('.knob') as HTMLElement;
    const upd = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const L = Math.hypot(dx, dy), max = r.width * 0.32, k = Math.min(L, max) / (L || 1);
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.mag = L < 8 ? 0 : Math.min(1, L / max);
      this.x = L ? dx / L : 0; this.y = L ? dy / L : 0;
      if (this.mag) onMove?.(this.x, this.y, this.mag);
    };
    el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); unlockAudio(); this.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } el.classList.add('active'); upd(e); });
    el.addEventListener('pointermove', e => { if (e.pointerId === this.id) upd(e); });
    const end = (e: PointerEvent) => { if (e.pointerId === this.id) this.reset(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    this.reset = () => { this.id = null; this.mag = 0; knob.style.transform = ''; el.classList.remove('active'); };
  }
  reset() { /* set in constructor */ }
}
const aimStick = new Stick($('aimpad'), (dx, dy) => {
  const c = match?.controlled(); if (!c) return;
  const a = view.screenDirToAngle(c.x, c.z, dx, dy);
  if (a !== null) match!.setAim(a);
});
const moveStick = new Stick($('movepad'));
function applySwap() { $('app').classList.toggle('swap', profile.swapSticks); }
applySwap();

addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') { if (screen === 'game') pause(); else if (screen === 'pause') $('resumeBtn').click(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'game') pause(); });

// Android back button
import('@capacitor/app').then(({ App }) => {
  App.addListener('backButton', () => {
    if (screen === 'game') pause();
    else if (screen === 'pause') $('resumeBtn').click();
    else if (screen === 'home') App.exitApp();
    else show('home');
  });
}).catch(() => { /* running in a browser */ });

// ---------------- graphics quality ----------------
function applyGfx() { view.setQuality(profile.gfx === 'low' || (profile.gfx === 'auto' && autoLow) ? 'low' : 'high'); }
let autoLow = (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 3;
applyGfx();
let slowFrames = 0, sampled = 0;
function watchSpeed(realDt: number) {
  // if the phone keeps missing frames during a match, switch to Low automatically
  if (profile.gfx !== 'auto' || autoLow || screen !== 'game') return;
  sampled++; if (realDt > 1 / 40) slowFrames++;
  if (sampled >= 180) {
    if (slowFrames / sampled > 0.35) { autoLow = true; applyGfx(); }
    sampled = slowFrames = 0;
  }
}

// ---------------- loop ----------------
// The rules run at a fixed 60 steps per second, so the game never slows down on a slow phone;
// a slow phone just shows fewer frames.
const STEP = 1 / 60;
let last = performance.now(), acc = 0;
const tmpDir = { x: 0, z: 0 };
function stickToWorld(sx: number, sy: number) {
  const c = match?.controlled(); if (!c) return null;
  const a = view.screenDirToAngle(c.x, c.z, sx, sy); if (a === null) return null;
  tmpDir.x = Math.cos(a); tmpDir.z = Math.sin(a); return tmpDir;
}
function frame(now: number) {
  const realDt = Math.min(0.25, (now - last) / 1000); last = now;
  watchSpeed(realDt);
  if (match && !paused && screen === 'game') {
    acc += realDt;
    const kx = (+keys.has('d') || +keys.has('arrowright')) - (+keys.has('a') || +keys.has('arrowleft'));
    const kz = (+keys.has('s') || +keys.has('arrowdown')) - (+keys.has('w') || +keys.has('arrowup'));
    const dir = moveStick.mag ? stickToWorld(moveStick.x, moveStick.y) : null;
    while (acc >= STEP && match) {
      if (dir) match.nudge(dir.x, dir.z, STEP, moveStick.mag);
      else if (kx || kz) { const L = Math.hypot(kx, kz); match.nudge(kx / L, kz / L, STEP); }
      match.update(STEP);
      acc -= STEP;
    }
    if (match) $('barFill').style.transform = `scaleX(${Math.max(0, match.t / match.tt)})`;
  } else if (match && screen === 'result') {
    match.update(realDt);   // let falling tiles / effects finish behind the results card
  } else acc = 0;
  view.render(realDt);
  requestAnimationFrame(frame);
}
show('home');
requestAnimationFrame(frame);

// debug hook for automated tests
(window as unknown as { __lc: unknown }).__lc = { get match() { return match; }, startMatch, setup, profile };
