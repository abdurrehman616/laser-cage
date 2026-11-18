// Three browser phones in one online match through a local server.
// Bobby walks off the edge in round 1 and spectates; Cara's connection drops and comes back;
// nobody who is still alive may ever learn where a hidden player is.
//   node scripts/online_spectate.mjs <outdir>
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
const out = process.argv[2], PORT = 8125;
const srv = spawn('node', ['server/game/dist/index.js'], { env: { ...process.env, PORT: String(PORT), LOBBY_WAIT_MS: '5000', LC_DEBUG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
await new Promise(r => setTimeout(r, 700));
const fails = []; const check = (ok, msg) => { console.log((ok ? '  ok  ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
const today = (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date());

const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function phone(name, w = 393, h = 851) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
  pg.on('console', m => m.type() === 'error' && !/ERR_TUNNEL|onrender/.test(m.text()) && pg.errs.push(m.text()));
  // count, at the network level, any position of a living hidden player that reaches a living phone
  await pg.addInitScript(() => {
    const W = window.WebSocket; window.__net = { leaks: 0, you: -1, alive: true, sent: [] };
    window.WebSocket = class extends W { constructor(...a) { super(...a);
      const send = this.send.bind(this); this.send = d => { try { const x = JSON.parse(d); if (x.t === 'rejoin' || x.t === 'join' || x.t === 'leave') window.__net.sent.push(x.t + ':' + String(x.token ?? '').slice(0, 6)); } catch {} send(d); };
      this.addEventListener('message', ev => { try { const m = JSON.parse(ev.data); const N = window.__net;
        if (m.t === 'start') { N.you = m.you; N.token = m.token.slice(0, 6); }
        if (m.t === 'snap') { for (const p of m.ps) if (p.id === N.you) N.alive = p.al;
          if (m.ph === 'hide' && N.alive) for (const p of m.ps) if (p.id !== N.you && p.al && p.x !== undefined) N.leaks++; } } catch {} }); } };
  });
  await pg.addInitScript(([n, t]) => localStorage.setItem('lasercage.profile.v1', JSON.stringify({ v: 1, tutorialDone: true, onboarded: true, name: n, coins: 100, level: 3, daily: { last: t, streak: 1 } })), [name, today]);
  await pg.goto('http://localhost:4173/?server=ws://localhost:' + PORT + '/play'); await pg.waitForTimeout(2600);
  return { pg, cdp: await ctx.newCDPSession(pg), name };
}
const A = await phone('Alice'), B = await phone('Bobby', 360, 640), C = await phone('Cara');
for (const p of [A, B, C]) await p.pg.click('#playBtn', { force: true });
for (const p of [A, B, C]) await p.pg.waitForFunction(() => window.__lc.match?.online, null, { timeout: 40000 });
const names = await A.pg.evaluate(() => window.__lc.match.players.map(p => p.name));
check(['Alice', 'Bobby', 'Cara'].every(n => names.includes(n)), 'all three phones are in the same match: ' + names.join(', '));

// --- a stick helper (CDP touch so it behaves like a finger)
async function hold(P, pad, dx, dy) {
  const r = await P.pg.locator(pad).boundingBox(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx, y: cy + dy, id: 1 }] });
}
const release = P => P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const pos = (P, who) => P.pg.evaluate(n => { const p = window.__lc.match.players.find(x => x.name === n); return { x: p.x, z: p.z, alive: p.alive }; }, who);
const phase = P => P.pg.evaluate(() => window.__lc.match?.phase);
const waitPhase = (P, ph, t = 40000) => P.pg.waitForFunction(x => window.__lc.match?.phase === x, ph, { timeout: t });

// --- round 1: Bobby walks straight out to the edge (toward the camera = down on the stick) and will fall
await waitPhase(B, 'hide');
const bp = await pos(B, 'Bobby');
const away = Math.atan2(bp.z, bp.x);   // world direction from the centre outwards
// screen-space: x right ~ world x, y down ~ world z (camera looks down from +z)
await hold(B, '#movepad', Math.cos(away) * 50, Math.sin(away) * 50);
// meanwhile Cara's connection drops mid-round and comes back
{
  await C.pg.evaluate(() => window.__lc.dropNet());
  await C.pg.waitForTimeout(300);
  const overlay = await C.pg.isVisible('#netlost');
  await C.pg.waitForFunction(() => document.getElementById('netlost').hidden, null, { timeout: 15000 }).catch(() => {});
  const r = await C.pg.evaluate(() => ({ screen: window.__lc.screen, tag: document.getElementById('roundTag').textContent, round: window.__lc.match?.round, chips: document.querySelectorAll('#chips .chip').length, pads: !document.getElementById('movepad').hidden, phase: window.__lc.match?.phase }));
  check(overlay && r.screen === 'game' && r.tag === 'ROUND ' + r.round && r.chips === 5, `mid-round reconnect: RECONNECTING shown, back in game, HUD right (${r.tag}, ${r.chips} players, phase ${r.phase}, sticks ${r.pads ? 'on' : 'off'})`);
}
await A.pg.waitForTimeout(800);
await A.pg.screenshot({ path: out + '/1-alice-hide.png' });
await waitPhase(A, 'lock'); await release(B); await A.pg.waitForTimeout(500);
await A.pg.screenshot({ path: out + '/2-alice-lock-charging.png' });
await waitPhase(A, 'fire'); await A.pg.waitForTimeout(60);
await A.pg.screenshot({ path: out + '/3-alice-fire.png' });
await A.pg.waitForTimeout(300);
await A.pg.screenshot({ path: out + '/4-alice-fire-late.png' });
await A.pg.waitForFunction(() => ['drop', 'intro', 'hide', 'over'].includes(window.__lc.match?.phase), null, { timeout: 20000 });
await A.pg.waitForTimeout(1600);
const bobDead = !(await pos(B, 'Bobby')).alive;
check(bobDead, 'Bobby is out after round 1 (walked off the edge or got hit)');

// --- round 2: Bobby spectates. He must see the others move while they hide; living phones must not.
const over = await phase(A) === 'over';
if (bobDead && !over) {
  await waitPhase(B, 'hide');
  const spec = await B.pg.evaluate(() => ({ s: window.__lc.match.spectating, bar: !document.getElementById('specbar').hidden, pads: !document.getElementById('movepad').hidden }));
  check(spec.s && spec.bar && !spec.pads, 'Bobby\'s phone is in spectate mode (bar shown, sticks hidden)');
  const aliveNames = (await B.pg.evaluate(() => window.__lc.match.players.filter(p => p.alive).map(p => p.name)));
  // someone alive moves: use a living phone, else bots move by themselves
  // both living phones walk (each once its own phone is in the hide phase), so there is something to spectate
  const movers = [];
  for (const P of [A, C]) if ((await pos(P, P.name)).alive) { await waitPhase(P, 'hide').catch(() => {}); if (await phase(P) === 'hide') { await hold(P, '#movepad', 45, -15); movers.push(P); } }
  // Each phone samples, inside the page, how far every other living player moves on its screen,
  // only while the hide phase is still on (the lock legitimately reveals everyone). Skip the first 0.6 s
  // while bodies finish gliding to their last known spot.
  const sample = P => P.pg.evaluate(() => new Promise(res => {
    const m = window.__lc.match, me = m.me, start = performance.now(), base = new Map(), moved = {};
    const t = setInterval(() => {
      if (m.phase !== 'hide') { clearInterval(t); res({ moved, alive: me.alive, ms: Math.round(performance.now() - start) }); return; }
      if (performance.now() - start < 600) return;
      for (const p of m.players) {
        if (p === me || !p.alive) continue;
        if (!base.has(p)) base.set(p, { x: p.x, z: p.z });
        const b0 = base.get(p); moved[p.name] = Math.max(moved[p.name] ?? 0, Math.hypot(p.x - b0.x, p.z - b0.z));
      }
    }, 100);
  }));
  const [sa, sb, sc] = await Promise.all([sample(A), sample(B), sample(C)]);
  for (const P of movers) await release(P);
  await B.pg.screenshot({ path: out + '/5-bobby-spectating.png' }).catch(() => {});
  const movedB = Object.values(sb.moved).filter(d => d > 0.3).length;
  check(movedB > 0, `spectator sees hidden players moving (${movedB} of ${Object.keys(sb.moved).length} moved on Bobby's screen over ${sb.ms} ms: ${JSON.stringify(sb.moved, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v)})`);
  const hiddenOnB = await B.pg.evaluate(() => window.__lc.match.players.filter(p => p.alive && window.__lc.match.isHidden(p)).length);
  check(hiddenOnB === 0, 'nobody is drawn hidden on the spectator\'s phone');
  for (const [P, r] of [[A, sa], [C, sc]]) {
    if (!r.alive) continue;
    const leaks = Object.entries(r.moved).filter(([, d]) => d > 0.05);
    check(leaks.length === 0, `${P.name} (alive) can't see where anyone hides (${leaks.length ? 'LEAK ' + JSON.stringify(leaks) : 'none moved over ' + r.ms + ' ms'})`);
  }

  // --- Cara's connection drops during the match and comes back
  if (!(await phase(A) === 'over')) {
    const roundBefore = await C.pg.evaluate(() => window.__lc.match?.round ?? -1);
    C.pg.on('console', m => /toast|lost/i.test(m.text()) && console.log('   [Cara]', m.text()));
    await C.pg.evaluate(() => window.__lc.dropNet());
    await C.pg.waitForTimeout(400);
    const overlay = await C.pg.isVisible('#netlost');
    await C.pg.waitForFunction(() => document.getElementById('netlost').hidden, null, { timeout: 15000 }).catch(() => {});
    const back = await C.pg.evaluate(() => ({ hidden: document.getElementById('netlost').hidden, tag: document.getElementById('roundTag').textContent, round: window.__lc.match?.round, screen: window.__lc.screen, toast: document.getElementById('toast').textContent, phase: window.__lc.match?.phase }));
    if (back.round === undefined) console.log('   Cara after drop:', JSON.stringify(back), JSON.stringify(await C.pg.evaluate(() => window.__net)));
    check(overlay && back.hidden, 'Cara sees RECONNECTING and gets back in');
    if (back.screen === 'result' || back.phase === 'over') check(true, 'match ended while Cara was reconnecting: she still gets her results');
    else check(back.tag === 'ROUND ' + back.round && back.round >= roundBefore && back.screen !== 'home', `Cara's HUD is up to date after reconnecting (${back.tag}, screen ${back.screen})`);
  }

  // --- Bobby leaves early from spectating and gets his results
  if (await B.pg.isVisible('#specLeave')) await B.pg.click('#specLeave');
  await B.pg.waitForSelector('#result:not([hidden])', { timeout: 60000 });
  const rb = await B.pg.evaluate(() => ({ title: document.getElementById('resTitle').textContent, place: document.getElementById('stPlace').textContent }));
  check(rb.title === 'ELIMINATED', `Bobby's early results: ${rb.title}, ${rb.place}`);
  await B.pg.screenshot({ path: out + '/6-bobby-result.png' });
}

// --- the others finish; everyone still in agrees
await A.pg.waitForSelector('#result:not([hidden])', { timeout: 240000 });
await C.pg.waitForSelector('#result:not([hidden])', { timeout: 60000 });
const res = P => P.pg.evaluate(() => ({ alive: window.__lc.match.alive.map(p => p.name).sort().join(','), rounds: window.__lc.match.round }));
const ra = await res(A), rc = await res(C);
check(ra.alive === rc.alive && ra.rounds === rc.rounds, `Alice and Cara agree on the result (${ra.alive || 'nobody'} after ${ra.rounds} rounds)`);
// play again goes back into matchmaking
await A.pg.click('#againBtn');
await A.pg.waitForFunction(() => window.__lc.screen === 'online' || window.__lc.match?.online, null, { timeout: 8000 });
check(true, 'PLAY AGAIN goes back to matchmaking');
for (const P of [A, B, C]) { const n = await P.pg.evaluate(() => window.__net); check(n.leaks === 0, `${P.name}: no hidden positions ever reached this phone while alive (network: ${n.leaks})`); }
const errs = [A, B, C].flatMap(P => P.pg.errs.map(e => P.name + ': ' + e));
check(errs.length === 0, 'no errors on any phone' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
await b.close(); srv.kill();
console.log(fails.length ? 'FAILED: ' + fails.length : 'ALL SPECTATE TESTS PASSED');
process.exit(fails.length ? 1 : 0);
