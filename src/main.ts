import './styles.css';
import { BOT_NAMES, Difficulty, HAIR_COLORS, ITEMS, NPC_OUTFITS, REWARDS, SEAT_COLORS, Slot, item } from './config';
import { Match, Mode, Player, SeatSpec } from './game/match';
import { ArenaView } from './render/scene';
import { addCoins, buy, equip, profile, save } from './save';
import { buzz, sfx, unlockAudio } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const view = new ArenaView($('view') as HTMLCanvasElement, $('labels'));

// ---------------- state ----------------
type Screen = 'home' | 'setup' | 'shop' | 'settings' | 'howto' | 'game' | 'handoff' | 'pause' | 'result';
let screen: Screen = 'home';
let match: Match | null = null;
let paused = false;
const setup = { mode: 'bots' as Mode, bots: 3, diff: 'normal' as Difficulty, pp: 2 };
const keys = new Set<string>();
const diffMult: Record<Difficulty, number> = { easy: 1, normal: 1.5, hard: 2 };

const SCREENS: Screen[] = ['home', 'setup', 'shop', 'settings', 'howto', 'handoff', 'pause', 'result'];
function show(s: Screen) {
  screen = s;
  for (const id of SCREENS) $(id).hidden = id !== s;
  const inGame = s === 'game' || s === 'handoff' || s === 'pause' || s === 'result';
  $('hud').hidden = !inGame;
  view.menu = !inGame;
  view.shot = inGame ? 0 : s === 'shop' ? 2 : 1;
  if (!inGame) { idleArena(); refreshCoins(); }
  if (s === 'game') updateControls();
}

// ---------------- menu arena ----------------
function idleArena() {
  if (match) { match = null; }
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
  $('statLine').textContent = s.matches ? `${s.matches} matches · ${s.wins} wins · ${s.kills} hits · best round ${s.bestRound}` : 'Tip: play Vs Bots first to learn the rules.';
}

// ---------------- toast / banner ----------------
let toastTO = 0, bannerTO = 0;
function toast(msg: string) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTO); toastTO = window.setTimeout(() => (t.hidden = true), 2400); }
function banner(text: string, sub = '', ms = 1100, color = '') {
  const b = $('banner'); b.innerHTML = ''; b.style.color = color;
  b.append(text); if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
  b.classList.remove('off'); clearTimeout(bannerTO); bannerTO = window.setTimeout(() => b.classList.add('off'), ms);
}

// ---------------- home ----------------
document.querySelectorAll<HTMLButtonElement>('.mode').forEach(b => b.addEventListener('click', () => {
  unlockAudio(); sfx.click();
  const m = b.dataset.mode;
  if (m === 'online') { toast('Online play is coming in a later update.'); return; }
  setup.mode = m as Mode;
  $('setupTitle').textContent = m === 'bots' ? 'Vs Bots' : 'Pass & Play';
  $('setBots').hidden = m !== 'bots'; $('setPP').hidden = m !== 'pp';
  show('setup');
}));
document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => { sfx.click(); show('home'); }));
$('settingsBtn').onclick = () => {
  sfx.click();
  ($('optSound') as HTMLInputElement).checked = profile.sound; ($('optVibe') as HTMLInputElement).checked = profile.vibrate;
  ($('optSwap') as HTMLInputElement).checked = profile.swapSticks;
  seg('segGfx', ['auto', 'high', 'low'], () => profile.gfx, v => { profile.gfx = v; save(); applyGfx(); }, ['Auto', 'High', 'Low']);
  show('settings');
};
$('optSwap').onchange = e => { profile.swapSticks = (e.target as HTMLInputElement).checked; save(); applySwap(); };
$('optSound').onchange = e => { profile.sound = (e.target as HTMLInputElement).checked; save(); };
$('optVibe').onchange = e => { profile.vibrate = (e.target as HTMLInputElement).checked; save(); };
$('howBtn').onclick = () => { sfx.click(); pendingStart = false; show('howto'); };
let pendingStart = false;
$('howOk').onclick = () => { sfx.click(); profile.tutorialDone = true; save(); if (pendingStart) startMatch(); else show('home'); };

function seg(id: string, vals: (string | number)[], get: () => string | number, set: (v: never) => void, labels?: string[]) {
  const el = $(id); el.innerHTML = '';
  vals.forEach((v, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = labels ? labels[i] : String(v);
    if (get() === v) b.className = 'on';
    b.onclick = () => { sfx.click(); set(v as never); seg(id, vals, get, set, labels); };
    el.appendChild(b);
  });
}
seg('segBots', [1, 2, 3, 4, 5], () => setup.bots, v => (setup.bots = v));
seg('segDiff', ['easy', 'normal', 'hard'], () => setup.diff, v => (setup.diff = v), ['Easy', 'Normal', 'Hard']);
seg('segPP', [2, 3, 4], () => setup.pp, v => (setup.pp = v));
$('playBtn').onclick = () => {
  unlockAudio(); sfx.click();
  if (!profile.tutorialDone) { pendingStart = true; show('howto'); return; }
  startMatch();
};

// ---------------- shop ----------------
const TABS: { slot: Slot; name: string }[] = [
  { slot: 'laser', name: 'Lasers' }, { slot: 'outfit', name: 'Outfits' }, { slot: 'hat', name: 'Hats' }, { slot: 'floor', name: 'Floors' },
];
let shopTab: Slot = 'laser', shopSel = '';
$('shopBtn').onclick = () => { sfx.click(); shopSel = profile.equip[shopTab]; renderShop(); show('shop'); };
function swatch(id: string) {
  const it = item(id);
  if (it.slot === 'laser') return it.rainbow ? 'conic-gradient(#ff4d6d,#ffb547,#fff27a,#5ef0c0,#7fb8ff,#e3a2ff,#ff4d6d)' : it.color!;
  if (it.slot === 'outfit') return `linear-gradient(${it.shirt} 55%, ${it.trim} 55% 63%, ${it.pants} 63%)`;
  if (it.slot === 'hat') return it.hat === 'none' ? 'repeating-linear-gradient(45deg,#2d3c48 0 6px,#1c2731 6px 12px)' : it.hatColor!;
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
    const b = document.createElement('button'); b.type = 'button'; b.className = 'itm' + (shopSel === it.id ? ' sel' : '');
    b.innerHTML = `<span class="sw" style="background:${swatch(it.id)}"></span><span class="nm"></span>` +
      (owned ? `<span class="pr own">${eq ? 'Equipped' : 'Owned'}</span>` : `<span class="pr"><b class="coin"></b>${it.price}</span>`) +
      (eq ? '<span class="eq">✓</span>' : '') + (it.premium ? '<span class="vip">VIP</span>' : '');
    (b.querySelector('.nm') as HTMLElement).textContent = it.name;
    b.onclick = () => { sfx.click(); shopSel = it.id; renderShop(); applyPreview(); };
    grid.appendChild(b);
  }
  const act = $('shopAction') as HTMLButtonElement, it = item(shopSel);
  const owned = profile.owned.includes(shopSel), eq = profile.equip[it.slot] === shopSel;
  act.disabled = eq;
  act.textContent = eq ? 'Equipped' : owned ? 'Equip' : `Buy for ${it.price}`;
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
    if (r === 'poor') { sfx.denied(); toast(`You need ${it.price - profile.coins} more coins. Win matches to earn them.`); return; }
    sfx.buy(); buzz(30); toast(`${it.name} unlocked`);
  }
  renderShop(); applyPreview();
};

// ---------------- match ----------------
function pick<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }
function buildSeats(): SeatSpec[] {
  const mine = item(profile.equip.laser);
  const others = SEAT_COLORS.filter(c => c.toLowerCase() !== mine.color!.toLowerCase());
  const me: SeatSpec = { name: setup.mode === 'bots' ? 'You' : 'P1', color: mine.color!, rainbow: !!mine.rainbow, human: true,
    look: { outfit: profile.equip.outfit, hat: profile.equip.hat, hair: HAIR_COLORS[0] } };
  const n = setup.mode === 'bots' ? setup.bots : setup.pp - 1;
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const seats = [me];
  for (let i = 0; i < n; i++) seats.push({
    name: setup.mode === 'bots' ? names[i] : 'P' + (i + 2), color: others[i % others.length], human: setup.mode === 'pp',
    look: { outfit: setup.mode === 'pp' ? NPC_OUTFITS[(i + 1) % NPC_OUTFITS.length] : pick(NPC_OUTFITS), hat: pick(['hat_none', 'hat_none', 'hat_cap', 'hat_band']), hair: HAIR_COLORS[(i + 1) % HAIR_COLORS.length] },
  });
  return seats;
}

const PHASE_LABEL: Record<string, string> = { intro: 'Remember positions', hide: 'Hide & aim', handoff: 'Pass the phone', reveal: 'Reveal', lock: 'Locked', fire: 'Fire', drop: 'Floor dropping', over: '' };

function startMatch() {
  view.clearPreview(); $('labels').innerHTML = '';
  match = new Match(setup.mode, buildSeats(), setup.diff);
  const m = match;
  view.setMatch(m); view.setFloor(profile.equip.floor);
  m.on(e => {
    if (match !== m) return;
    switch (e.type) {
      case 'round':
        $('roundTag').textContent = 'Round ' + e.round;
        banner('ROUND ' + e.round, e.final ? 'Final platform · lasers get wider' : 'Remember where everyone is');
        sfx.round(); chips();
        break;
      case 'phase':
        $('phaseTag').textContent = e.phase === 'plan' && m.cur ? `${m.cur.name} is planning` : e.phase === 'drop' && m.final ? 'Sudden death' : PHASE_LABEL[e.phase];
        if (e.phase === 'hide') { banner('HIDE', 'Everyone is invisible', 800); }
        updateControls();
        break;
      case 'tick': sfx.tick(e.sec === 1); if (e.sec === 1) buzz(15); break;
      case 'lock': banner('LOCK', '', 600); sfx.lock(); buzz(40); break;
      case 'fire': {
        view.showShots(m); sfx.fire();
        if (e.victims.length) {
          setTimeout(() => sfx.hit(), 120);
          const meHit = m.me && e.victims.includes(m.me);
          buzz(meHit ? [80, 60, 120] : 50);
          banner(e.victims.length > 1 ? `${e.victims.length} DOWN` : `${e.victims[0].name.toUpperCase()} ${e.victims[0].name === 'You' ? 'ARE' : 'IS'} OUT`, '', 1000, meHit ? 'var(--hot)' : '');
        } else banner('MISSED', 'Everyone dodged', 900);
        chips();
        break;
      }
      case 'drop': sfx.drop(); buzz(30); if (e.fell.length) banner('FELL!', e.fell.map(p => p.name).join(' · '), 1000); chips(); break;
      case 'sudden': banner('SUDDEN DEATH', 'Lasers get wider', 1000); break;
      case 'handoff':
        $('handName').textContent = e.player.name; $('handName').style.color = e.player.color;
        show('handoff');
        break;
      case 'over': setTimeout(() => { if (match === m) results(m); }, 900); break;
    }
  });
  paused = false;
  show('game');
  view.snapCamera();
  m.start();
}
$('readyBtn').onclick = () => { unlockAudio(); sfx.click(); show('game'); match?.beginPlan(); };
$('lockBtn').onclick = () => { sfx.click(); match?.lockIn(); };
$('pauseBtn').onclick = () => pause();
$('resumeBtn').onclick = () => { sfx.click(); paused = false; show(match?.phase === 'handoff' ? 'handoff' : 'game'); };
$('quitBtn').onclick = () => { sfx.click(); paused = false; match = null; show('home'); };
$('homeBtn').onclick = () => { sfx.click(); match = null; show('home'); };
$('againBtn').onclick = () => { sfx.click(); startMatch(); };
function pause() { if (!match || match.phase === 'over' || screen === 'result') return; paused = true; show('pause'); }

function chips() {
  if (!match) return;
  $('chips').innerHTML = '';
  for (const p of match.players) {
    const c = document.createElement('span'); c.className = 'chip' + (p.alive ? '' : ' out');
    c.innerHTML = '<b></b>'; (c.firstChild as HTMLElement).style.setProperty('--c', p.color);
    c.append(p.name); $('chips').appendChild(c);
  }
}

function updateControls() {
  const m = match, c = m?.controlled();
  const inGame = screen === 'game';
  $('aimpad').hidden = $('movepad').hidden = !(inGame && c);
  if (!c) { moveStick.reset(); aimStick.reset(); }
  $('lockBtn').hidden = !(inGame && m?.phase === 'plan');
  const hint = $('hint');
  if (inGame && m?.phase === 'hide' && c && m.round <= 2) { hint.hidden = false; hint.textContent = 'Move somewhere new. Aim where you think someone went.'; }
  else if (inGame && m?.phase === 'plan') { hint.hidden = false; hint.textContent = 'Move your spot inside the dashed circle, aim, then lock in.'; }
  else hint.hidden = true;
}

function ord(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function results(m: Match) {
  updateControls();
  const alive = m.alive;
  let title: string, sub: string, color: string, coins = 0, place = 0, kills = 0;
  if (m.mode === 'bots') {
    const me = m.players[0];
    place = m.placeOf(me); kills = me.kills;
    const won = me.alive && alive.length === 1;
    coins = Math.round((REWARDS.perMatch + me.survived * REWARDS.perRoundSurvived + kills * REWARDS.perKill + (won ? REWARDS.win : 0)) * diffMult[m.diff]);
    if (won) { title = 'Victory'; sub = `Last one standing out of ${m.players.length}.`; color = 'var(--mint)'; sfx.win(); }
    else {
      title = 'Eliminated'; color = 'var(--hot)'; sfx.lose();
      sub = me.how === 'fell' ? 'You were on the outer ring when it dropped.' : me.killedBy ? `${me.killedBy.name} guessed where you went.` : 'You were caught in a laser.';
    }
    profile.stats.wins += won ? 1 : 0; profile.stats.kills += kills;
    $('resLabel').textContent = `Vs bots · ${m.diff}`;
  } else {
    coins = REWARDS.passAndPlay;
    const w: Player | undefined = alive.length === 1 ? alive[0] : undefined;
    title = w ? `${w.name} wins` : 'Draw'; color = w ? w.color : 'var(--ink)';
    sub = w ? `${w.kills} hit${w.kills === 1 ? '' : 's'} · survived ${m.round} rounds` : 'The last players knocked each other out on the same shot.';
    kills = w ? w.kills : 0; place = 0;
    sfx.win();
    $('resLabel').textContent = 'Pass & play';
  }
  profile.stats.matches++; profile.stats.bestRound = Math.max(profile.stats.bestRound, m.round);
  addCoins(coins);
  $('resTitle').textContent = title; $('resTitle').style.color = color; $('resSub').textContent = sub;
  $('stPlace').textContent = place ? ord(place) : '—';
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
  constructor(private el: HTMLElement, private onMove?: (dx: number, dy: number, mag: number) => void) {
    const knob = el.querySelector('.knob') as HTMLElement;
    const upd = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const L = Math.hypot(dx, dy), max = r.width * 0.32, k = Math.min(L, max) / (L || 1);
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.mag = L < 8 ? 0 : Math.min(1, L / max);
      this.x = L ? dx / L : 0; this.y = L ? dy / L : 0;
      if (this.mag) this.onMove?.(this.x, this.y, this.mag);
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
  const o = match!.mode === 'pp' && c.target ? c.target : c;
  const a = view.screenDirToAngle(o.x, o.z, dx, dy);
  if (a !== null) match!.setAim(a);
});
const moveStick = new Stick($('movepad'));
function applySwap() { $('app').classList.toggle('swap', profile.swapSticks); }
applySwap();

addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') { if (screen === 'game') pause(); else if (screen === 'pause') $('resumeBtn').click(); }
  if (e.key === ' ' && match?.phase === 'plan' && screen === 'game') match.lockIn();
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
    else if (screen === 'result' || screen === 'handoff') $(screen === 'result' ? 'homeBtn' : 'quitBtn').click();
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
  if (match && !paused && screen !== 'handoff') {
    acc += realDt;
    const kx = (+keys.has('d') || +keys.has('arrowright')) - (+keys.has('a') || +keys.has('arrowleft'));
    const kz = (+keys.has('s') || +keys.has('arrowdown')) - (+keys.has('w') || +keys.has('arrowup'));
    const dir = moveStick.mag ? stickToWorld(moveStick.x, moveStick.y) : null;
    while (acc >= STEP) {
      if (dir) match.nudge(dir.x, dir.z, STEP, moveStick.mag);
      else if (kx || kz) { const L = Math.hypot(kx, kz); match.nudge(kx / L, kz / L, STEP); }
      match.update(STEP);
      acc -= STEP;
      if (!match || (screen as Screen) === 'handoff') { acc = 0; break; }
    }
    if (match) $('barFill').style.transform = `scaleX(${Math.max(0, match.t / match.tt)})`;
  } else acc = 0;
  view.render(realDt);
  requestAnimationFrame(frame);
}
show('home');
requestAnimationFrame(frame);

// debug hook for automated tests
(window as unknown as { __lc: unknown }).__lc = { get match() { return match; }, startMatch, setup, profile };
