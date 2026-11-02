import './styles.css';
import { ARENAS, BOT_NAMES, DAILY_REWARDS, Difficulty, HAIR_COLORS, ITEMS, NPC_OUTFITS, REWARDS, SEAT_COLORS, Slot, arena, item, xpToNext, MAX_LEVEL } from './config';
import { Look, Match, SeatSpec } from './game/match';
import { ArenaView } from './render/scene';
import { addCoins, buy, equip, profile, save } from './save';
import { buzz, playMusic, refreshMusic, sfx, unlockAudio } from './audio';
import { addXp, arenaUnlocked, claimDaily, claimMission, dailyAvailable, matchXp, missions, missionsReady, nextUnlock, trackMatch } from './progress';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const view = new ArenaView($('view') as HTMLCanvasElement, $('labels'));

// ---------------- state ----------------
type Screen = 'home' | 'shop' | 'settings' | 'howto' | 'daily' | 'missions' | 'game' | 'pause' | 'result';
let screen: Screen = 'home';
let match: Match | null = null;
let paused = false;
const setup = { bots: profile.lastBots, diff: profile.lastDiff as Difficulty };
const keys = new Set<string>();
const diffMult: Record<Difficulty, number> = { easy: 1, normal: 1.5, hard: 2 };
let dailyShown = false;

const SCREENS: Screen[] = ['home', 'shop', 'settings', 'howto', 'daily', 'missions', 'pause', 'result'];
function show(s: Screen) {
  screen = s;
  for (const id of SCREENS) $(id).hidden = id !== s;
  const inGame = s === 'game' || s === 'pause' || s === 'result';
  $('hud').hidden = !inGame;
  view.menu = !inGame;
  view.shot = inGame ? 0 : s === 'shop' ? 2 : 1;
  view.previewDance = null;
  if (!inGame) { idleArena(); refreshHome(); }
  if (s !== 'game') setCoach(null);
  if (s === 'game') updateControls();
  playMusic(s === 'game' || s === 'pause' ? 'match' : 'menu');
  // daily reward pops up once per session when you open the game
  if (s === 'home' && !dailyShown && profile.tutorialDone && dailyAvailable()) { dailyShown = true; setTimeout(() => { if (screen === 'home') openDaily(); }, 500); }
}

// ---------------- menu arena ----------------
function myLook(over: Partial<Record<Slot, string>> = {}): Look {
  const e = { ...profile.equip, ...over };
  return { outfit: e.outfit, hat: e.hat, hair: HAIR_COLORS[0], gun: e.gun, fx: e.fx, dance: e.dance };
}
function idleArena() {
  match = null;
  const idle = new Match('bots', [], { arena: arena(currentArena()) });
  idle.phase = 'over';
  view.setArena(idle.arena);
  view.setMatch(idle);
  view.setFloor(profile.equip.floor);
  showMyPreview();
  $('labels').innerHTML = '';
}
function showMyPreview(over: Partial<Record<Slot, string>> = {}) {
  const l = item(over.laser ?? profile.equip.laser);
  view.showPreview(myLook(over), l.color!, !!l.rainbow);
}
const currentArena = () => (arenaUnlocked(profile.arena) ? profile.arena : 'cage');

function refreshHome() {
  $('coinCount').textContent = String(profile.coins);
  document.querySelectorAll('.coinCount').forEach(e => (e.textContent = String(profile.coins)));
  $('lvlNum').textContent = String(profile.level);
  $('xpFill').style.transform = `scaleX(${profile.level >= MAX_LEVEL ? 1 : profile.xp / xpToNext(profile.level)})`;
  const s = profile.stats;
  $('statLine').textContent = s.matches ? `${s.wins} WINS · ${s.kills} HITS · BEST ROUND ${s.bestRound}` : '';
  $('dailyDot').hidden = !dailyAvailable() || !profile.tutorialDone;
  const ready = missionsReady(); $('missionDot').hidden = !ready; $('missionDot').textContent = String(ready);
  $('dailyBtn').hidden = $('missionsBtn').hidden = !profile.tutorialDone;
  // arena picker
  const a = arena(profile.arena), unlocked = arenaUnlocked(a.id);
  $('arenaName').textContent = a.name.toUpperCase();
  const lock = $('arenaLock'); lock.hidden = unlocked; lock.innerHTML = `<svg><use href="#i-lock"/></svg>REACH LEVEL ${a.unlockLevel}`;
  document.querySelector('.arenarow')!.classList.toggle('locked', !unlocked);
  const play = $('playBtn'); play.classList.toggle('locked', !unlocked);
  (play.querySelector('.sub') as HTMLElement).textContent = !profile.tutorialDone ? 'TUTORIAL' : unlocked ? 'VS BOTS' : `LEVEL ${a.unlockLevel}`;
  const nu = nextUnlock();
  $('nextUnlock').textContent = nu ? `LEVEL ${nu.level}: ${nu.name.toUpperCase()}` : '';
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
seg('segDiff', ['easy', 'normal', 'hard'], () => setup.diff, v => { setup.diff = v; profile.lastDiff = v; save(); }, ['EASY', 'NORMAL', 'HARD']);
function setBots(n: number) { setup.bots = Math.max(1, Math.min(5, n)); $('botCount').textContent = String(setup.bots); profile.lastBots = setup.bots; save(); }
$('botsMinus').onclick = () => { sfx.click(); setBots(setup.bots - 1); };
$('botsPlus').onclick = () => { sfx.click(); setBots(setup.bots + 1); };
setBots(setup.bots);
function stepArena(d: number) {
  const i = ARENAS.findIndex(a => a.id === profile.arena);
  profile.arena = ARENAS[(i + d + ARENAS.length) % ARENAS.length].id; save();
  sfx.click();
  view.setArena(arena(profile.arena)); refreshHome();
}
$('arenaPrev').onclick = () => stepArena(-1);
$('arenaNext').onclick = () => stepArena(1);

$('playBtn').onclick = () => {
  unlockAudio(); sfx.click();
  if (!profile.tutorialDone) return startMatch(true);
  if (!arenaUnlocked(profile.arena)) { sfx.denied(); toast(`Reach level ${arena(profile.arena).unlockLevel} to play ${arena(profile.arena).name}`); return; }
  startMatch(false);
};
$('onlineBtn').onclick = () => { unlockAudio(); sfx.denied(); toast('Online battles are coming soon!'); };
document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => { sfx.click(); show('home'); }));
$('settingsBtn').onclick = () => {
  unlockAudio(); sfx.click();
  ($('optSound') as HTMLInputElement).checked = profile.sound; ($('optVibe') as HTMLInputElement).checked = profile.vibrate;
  ($('optMusic') as HTMLInputElement).checked = profile.music; ($('optSwap') as HTMLInputElement).checked = profile.swapSticks;
  seg('segGfx', ['auto', 'high', 'low'], () => profile.gfx, v => { profile.gfx = v; save(); applyGfx(); }, ['AUTO', 'HIGH', 'LOW']);
  show('settings');
};
$('optSwap').onchange = e => { profile.swapSticks = (e.target as HTMLInputElement).checked; save(); applySwap(); };
$('optSound').onchange = e => { profile.sound = (e.target as HTMLInputElement).checked; save(); };
$('optMusic').onchange = e => { profile.music = (e.target as HTMLInputElement).checked; save(); refreshMusic(); };
$('optVibe').onchange = e => { profile.vibrate = (e.target as HTMLInputElement).checked; save(); };
$('howBtn').onclick = () => { unlockAudio(); sfx.click(); show('howto'); };
$('howOk').onclick = () => { sfx.click(); show('home'); };

// ---------------- daily reward ----------------
function openDaily() {
  const avail = dailyAvailable();
  const done = avail ? avail - 1 : profile.daily.streak;      // days already claimed in this streak
  const grid = $('dayGrid'); grid.innerHTML = '';
  DAILY_REWARDS.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'day' + (i < done ? ' done' : '') + (avail && i === avail - 1 ? ' today' : '') + (i === 6 ? ' big' : '');
    d.innerHTML = `<span class="dn">DAY ${i + 1}</span><span class="coin"></span><b>${c}</b>`;
    grid.appendChild(d);
  });
  const btn = $('dailyClaim') as HTMLButtonElement;
  btn.disabled = !avail; btn.textContent = avail ? `CLAIM ${DAILY_REWARDS[avail - 1]}` : 'COME BACK TOMORROW';
  show('daily');
}
$('dailyBtn').onclick = () => { unlockAudio(); sfx.click(); openDaily(); };
$('dailyClaim').onclick = () => {
  const c = claimDaily(); if (!c) return;
  sfx.buy(); buzz(40); toast(`+${c} COINS!`);
  openDaily(); refreshHome();
};
$('dailyClose').onclick = () => { sfx.click(); show('home'); };

// ---------------- missions ----------------
function openMissions() {
  const list = $('missionList'); list.innerHTML = '';
  for (const m of missions()) {
    const doneM = m.progress >= m.def.goal;
    const row = document.createElement('div'); row.className = 'mission' + (m.claimed ? ' claimed' : '');
    row.innerHTML = `<span class="mt"></span><span class="mbar"><i style="transform:scaleX(${m.progress / m.def.goal})"></i><span>${m.progress} / ${m.def.goal}</span></span>`;
    (row.querySelector('.mt') as HTMLElement).textContent = m.def.text.toUpperCase();
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'gbtn ' + (m.claimed ? 'locked' : doneM ? 'green' : 'blue');
    b.disabled = m.claimed || !doneM;
    b.innerHTML = m.claimed ? 'DONE' : `<b class="coin"></b>${m.def.reward}`;
    b.onclick = () => { const c = claimMission(m.id); if (c) { sfx.buy(); buzz(30); toast(`+${c} COINS!`); openMissions(); refreshHome(); } };
    row.appendChild(b); list.appendChild(row);
  }
  show('missions');
}
$('missionsBtn').onclick = () => { unlockAudio(); sfx.click(); openMissions(); };
$('missionsClose').onclick = () => { sfx.click(); show('home'); };

// ---------------- shop ----------------
const TABS: { slot: Slot; name: string }[] = [
  { slot: 'laser', name: 'LASERS' }, { slot: 'gun', name: 'GUNS' }, { slot: 'outfit', name: 'OUTFITS' }, { slot: 'hat', name: 'HATS' },
  { slot: 'fx', name: 'EFFECTS' }, { slot: 'dance', name: 'DANCES' }, { slot: 'floor', name: 'FLOORS' },
];
let shopTab: Slot = 'laser', shopSel = '';
$('shopBtn').onclick = () => { unlockAudio(); sfx.click(); shopSel = profile.equip[shopTab]; renderShop(); show('shop'); applyPreview(); };
const FX_ICON: Record<string, string> = { spark: '✦', confetti: '✿', pixels: '▦', coins: '●', smoke: '☁' };
function swatch(id: string) {
  const it = item(id);
  if (it.slot === 'laser') return it.rainbow ? 'conic-gradient(#ff4d6d,#ffb547,#fff27a,#5ef0c0,#7fb8ff,#e3a2ff,#ff4d6d)' : it.color!;
  if (it.slot === 'outfit') return `linear-gradient(${it.shirt} 55%, ${it.trim} 55% 63%, ${it.pants} 63%)`;
  if (it.slot === 'hat') return it.hat === 'none' ? 'repeating-linear-gradient(45deg,#59628f 0 6px,#3d4570 6px 12px)' : it.hatColor!;
  if (it.slot === 'gun') return it.gun!.glow ? `linear-gradient(${it.gun!.body} 40%, ${it.gun!.glow} 40% 55%, ${it.gun!.body} 55%)` : it.gun!.body;
  if (it.slot === 'fx') return 'linear-gradient(180deg,#26306b,#14205a)';
  if (it.slot === 'dance') return 'linear-gradient(180deg,#7f43f0,#4a21a1)';
  return `radial-gradient(circle, ${it.floor!.mesh} 22%, ${it.floor!.base} 24%)`;
}
function swatchLabel(id: string) {
  const it = item(id);
  if (it.slot === 'fx') return FX_ICON[it.fx!] ?? '';
  if (it.slot === 'dance') return ({ hop: '⤒', spin: '⟳', wiggle: '≈', flip: '↻' } as Record<string, string>)[it.dance!] ?? '';
  return '';
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
    const price = owned ? `<span class="pr own">${eq ? 'EQUIPPED' : 'OWNED'}</span>`
      : it.unlockLevel ? `<span class="pr"><b class="coin"></b>${it.price} · LV${it.unlockLevel}</span>`
      : `<span class="pr"><b class="coin"></b>${it.price}</span>`;
    b.innerHTML = `<span class="sw" style="background:${swatch(it.id)}">${swatchLabel(it.id)}</span><span class="nm"></span>` + price +
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
  refreshHome();
}
function applyPreview() {
  // try the selected item on, without buying it
  const it = item(shopSel);
  showMyPreview({ [shopTab]: shopSel });
  view.setFloor(shopTab === 'floor' ? shopSel : profile.equip.floor);
  view.previewDance = shopTab === 'dance' ? it.dance ?? null : null;
  if (shopTab === 'fx') view.previewBurst(it.fx!);
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

// ---------------- coach (guided first match) ----------------
function setCoach(text: string | null, pulse: 'move' | 'aim' | null = null) {
  const c = $('coach');
  if (!text) { c.hidden = true; } else { $('coachText').textContent = text; c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
  $('movepad').classList.toggle('pulse', pulse === 'move');
  $('aimpad').classList.toggle('pulse', pulse === 'aim');
}
const coach = { step: 0, aimed: false };
function coachTick() {
  // called every frame during the tutorial's first hide phase
  const m = match; if (!m || !m.tutorial || m.round !== 1 || m.phase !== 'hide') return;
  const me = m.me, moved = Math.hypot(me.x - me.seenX, me.z - me.seenZ);
  if (coach.step === 1 && moved > 1.3) { coach.step = 2; setCoach('Now drag the AIM stick toward where a rival went.', 'aim'); }
  else if (coach.step === 2 && coach.aimed) { coach.step = 3; setCoach('Nice! Hold your aim. LOCK is coming…'); }
}

// ---------------- match ----------------
function pick<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }
function buildSeats(bots: number): SeatSpec[] {
  const mine = item(profile.equip.laser);
  const others = SEAT_COLORS.filter(c => c.toLowerCase() !== mine.color!.toLowerCase());
  const seats: SeatSpec[] = [{ name: 'You', color: mine.color!, rainbow: !!mine.rainbow, human: true, look: myLook() }];
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < bots; i++) seats.push({
    name: names[i], color: others[i % others.length], human: false,
    look: { outfit: pick(NPC_OUTFITS), hat: pick(['hat_none', 'hat_none', 'hat_cap', 'hat_band']), hair: HAIR_COLORS[(i + 1) % HAIR_COLORS.length],
      gun: pick(['gun_classic', 'gun_classic', 'gun_camo', 'gun_candy']), fx: 'fx_spark', dance: 'dance_hop' },
  });
  return seats;
}

const PHASE_LABEL: Record<string, string> = { intro: 'REMEMBER!', hide: 'HIDE & AIM', lock: 'LOCKED', fire: 'FIRE!', drop: 'FLOOR DROP', over: '' };
let lastSetup = { tutorial: false };

function startMatch(tutorial: boolean) {
  lastSetup = { tutorial };
  view.clearPreview(); $('labels').innerHTML = '';
  const ar = arena(tutorial ? 'cage' : currentArena());
  match = new Match('bots', buildSeats(tutorial ? 2 : setup.bots), { diff: tutorial ? 'easy' : setup.diff, arena: ar, tutorial });
  const m = match;
  coach.step = 0; coach.aimed = false;
  view.setArena(ar);
  view.setMatch(m); view.setFloor(profile.equip.floor);
  m.on(e => {
    if (match !== m) return;
    switch (e.type) {
      case 'round':
        $('roundTag').textContent = 'ROUND ' + e.round;
        banner('ROUND ' + e.round, e.final ? 'Final platform! Lasers get wider' : 'Remember where everyone is');
        sfx.round(); chips();
        if (m.tutorial && e.round === 1) setCoach('These are your rivals. Remember where they stand!');
        if (m.tutorial && e.round === 2) { setCoach('You\'ve got it! Now you\'re on your own. Good luck!'); setTimeout(() => { if (match === m && m.round === 2) setCoach(null); }, 3200); }
        break;
      case 'phase':
        $('phaseTag').textContent = e.phase === 'drop' && m.final ? 'SUDDEN DEATH' : PHASE_LABEL[e.phase];
        if (e.phase === 'hide') banner('HIDE!', 'Everyone is invisible', 800, BANNER.blue);
        if (m.tutorial && m.round === 1 && e.phase === 'hide') { coach.step = 1; setCoach('Everyone is invisible! Drag the MOVE stick to walk somewhere new.', 'move'); }
        if (m.tutorial && m.round === 1 && e.phase === 'lock') setCoach('LOCK! Everyone appears and the lasers fire.');
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
        if (m.tutorial && m.round === 1) {
          const mine = m.shots.find(s => s.from === m.me);
          setCoach(mine?.hit ? `Great shot! You got ${mine.hit.name}!` : 'Missed! The trick is guessing where they moved.');
        }
        chips();
        break;
      }
      case 'drop':
        sfx.drop(); buzz(30); if (e.fell.length) banner('FELL!', e.fell.map(p => p.name).join(' · '), 1000, BANNER.red); chips();
        if (m.tutorial && m.round === 1) setCoach('The pink ring just fell! Never stand on pink tiles.');
        break;
      case 'sudden': banner('SUDDEN DEATH', 'Lasers get wider', 1000, BANNER.red); break;
      case 'over': setCoach(null); setTimeout(() => { if (match === m) results(m); }, 1400); break;
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
$('againBtn').onclick = () => { sfx.click(); if (!arenaUnlocked(currentArena())) return show('home'); startMatch(lastSetup.tutorial && !profile.tutorialDone); };
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
  if (inGame && m?.phase === 'hide' && c && !m.tutorial && m.round <= 1 && profile.stats.matches < 3) { hint.hidden = false; hint.textContent = 'Move somewhere new. Aim where you think someone went!'; }
  else hint.hidden = true;
}

function ord(n: number) { const s = ['TH', 'ST', 'ND', 'RD'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function results(m: Match) {
  updateControls();
  const me = m.me, place = m.placeOf(me), kills = me.kills;
  const won = me.alive && m.alive.length === 1;
  let coins = Math.round((REWARDS.perMatch + me.survived * REWARDS.perRoundSurvived + kills * REWARDS.perKill + (won ? REWARDS.win : 0)) * diffMult[m.diff]);
  const firstTime = m.tutorial && !profile.tutorialDone;
  if (firstTime) { coins += 100; profile.tutorialDone = true; }
  const sub = firstTime ? 'Tutorial complete! Here are 100 bonus coins.'
    : won ? `Last one standing out of ${m.players.length}!`
    : me.how === 'fell' ? 'You were on the outer ring when it dropped.'
    : me.killedBy ? `${me.killedBy.name} guessed where you went.` : 'You got caught in a laser.';
  won ? sfx.win() : sfx.lose();
  profile.stats.matches++; profile.stats.wins += won ? 1 : 0; profile.stats.kills += kills;
  profile.stats.bestRound = Math.max(profile.stats.bestRound, m.round);
  addCoins(coins);

  // XP and levels
  const startFrac = profile.level >= MAX_LEVEL ? 1 : profile.xp / xpToNext(profile.level);
  const xp = matchXp({ rounds: me.survived, kills, won, diff: m.diff });
  const ups = addXp(xp);
  const done = m.tutorial ? [] : trackMatch({ won, kills, rounds: me.survived, diff: m.diff, reachedFinal: m.reachedFinal, bots: m.players.length - 1 });

  const t = $('resTitle'); t.textContent = won ? 'VICTORY!' : 'ELIMINATED'; t.className = 'ribbon ' + (won ? 'win' : 'lose');
  $('resLabel').textContent = `${m.arena.name.toUpperCase()} · ${m.diff.toUpperCase()}`;
  $('resSub').textContent = sub;
  $('stPlace').textContent = ord(place);
  $('stKills').textContent = String(kills);
  $('stCoins').textContent = '+' + coins;
  $('resXp').textContent = `+${xp} XP`;
  $('resLvl').textContent = String(profile.level);
  const fill = $('resXpFill');
  fill.style.transition = 'none'; fill.style.transform = `scaleX(${ups.length ? 0 : startFrac})`; void fill.offsetWidth; fill.style.transition = '';
  setTimeout(() => (fill.style.transform = `scaleX(${profile.level >= MAX_LEVEL ? 1 : profile.xp / xpToNext(profile.level)})`), 350);
  const lu = $('levelUps'); lu.innerHTML = '';
  for (const u of ups) {
    const d = document.createElement('div'); d.className = 'lvup';
    d.textContent = `LEVEL UP! LEVEL ${u.level} · +${u.coins} COINS` + (u.unlocks.length ? ` · UNLOCKED ${u.unlocks.join(', ').toUpperCase()}` : '');
    lu.appendChild(d);
  }
  if (ups.length) setTimeout(() => { sfx.win(); buzz([40, 40, 80]); }, 600);
  const md = $('missionDone'); md.innerHTML = '';
  for (const name of done) { const d = document.createElement('div'); d.className = 'mdone'; d.textContent = `MISSION DONE: ${name.toUpperCase()} · CLAIM IT ON THE HOME SCREEN`; md.appendChild(d); }
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
  if (e.pointerType === 'mouse' && !(e.buttons & 1)) { match.aimAtPoint(g.x, g.z); coach.aimed = true; }
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
  if (a !== null) { match!.setAim(a); coach.aimed = true; }
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
    coachTick();
    if (match) $('barFill').style.transform = `scaleX(${Math.max(0, match.t / match.tt)})`;
  } else if (match && screen === 'result') {
    match.update(realDt);   // let falling tiles / effects / the winner's dance play behind the results card
  } else acc = 0;
  view.render(realDt);
  requestAnimationFrame(frame);
}
show('home');
requestAnimationFrame(frame);

// debug hook for automated tests
(window as unknown as { __lc: unknown }).__lc = { get match() { return match; }, startMatch, setup, profile, show, openDaily, openMissions };
