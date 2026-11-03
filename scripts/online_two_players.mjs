// Two browser "phones" join the same online match through a local server and play it to the end.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const PORT = 8124;
const srv = spawn('node', ['server/game/dist/index.js'], { env: { ...process.env, PORT: String(PORT), LOBBY_WAIT_MS: '4000' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
await new Promise(r => setTimeout(r, 700));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function phone(name) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('console', m => m.type() === 'error' && pg.errs.push(m.text()));
  await pg.goto(`http://localhost:4173/?server=ws://localhost:${PORT}/play`); await pg.waitForTimeout(800);
  await pg.evaluate(n => { const p = window.__lc.profile; p.tutorialDone = true; p.name = n; const d = new Date(); p.daily.last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; window.__lc.show('home'); }, name);
  await pg.waitForTimeout(500);
  return { pg, cdp: await ctx.newCDPSession(pg) };
}
const A = await phone('Alice'), B = await phone('Bobby');
await A.pg.click('#onlineBtn'); await B.pg.click('#onlineBtn');
await A.pg.waitForTimeout(1500); await A.pg.screenshot({ path: `${out}/1-finding.png` });
await A.pg.waitForFunction(() => window.__lc.match?.online, null, { timeout: 30000 });
await B.pg.waitForFunction(() => window.__lc.match?.online, null, { timeout: 30000 });
const names = await A.pg.evaluate(() => window.__lc.match.players.map(p => p.name));
console.log('Alice sees players:', names.join(', '));

// Bobby walks during the hide phase; Alice must not receive his position until the lock
await A.pg.waitForFunction(() => window.__lc.match?.phase === 'hide', null, { timeout: 30000 });
const bobBefore = await A.pg.evaluate(() => { const p = window.__lc.match.players.find(x => x.name === 'Bobby'); return { x: p.x, z: p.z }; });
const r = await B.pg.locator('#movepad').boundingBox(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 45, y: cy - 10, id: 1 }] });
await A.pg.waitForTimeout(1500);
await A.pg.screenshot({ path: `${out}/2-alice-hiding.png` });
const bobDuring = await A.pg.evaluate(() => { const p = window.__lc.match.players.find(x => x.name === 'Bobby'); return { x: p.x, z: p.z }; });
const bobSelf = await B.pg.evaluate(() => ({ x: window.__lc.match.me.x, z: window.__lc.match.me.z }));
await B.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await A.pg.waitForFunction(() => window.__lc.match?.phase === 'lock', null, { timeout: 30000 }); await A.pg.waitForTimeout(400);
await A.pg.screenshot({ path: `${out}/3-alice-lock.png` });
const bobAtLock = await A.pg.evaluate(() => { const p = window.__lc.match.players.find(x => x.name === 'Bobby'); return { x: p.x, z: p.z }; });
const bobServerSelf = await B.pg.evaluate(() => ({ x: window.__lc.match.me.x, z: window.__lc.match.me.z }));
const d = (p, q) => Math.hypot(p.x - q.x, p.z - q.z).toFixed(2);
console.log(`Bobby moved ${d(bobBefore, bobSelf)} on his phone; Alice's copy moved ${d(bobBefore, bobDuring)} while hidden, then ${d(bobBefore, bobAtLock)} at the lock (Bobby's own: ${d(bobBefore, bobServerSelf)})`);

await A.pg.waitForSelector('#result:not([hidden])', { timeout: 240000 }); await B.pg.waitForSelector('#result:not([hidden])', { timeout: 60000 });
await A.pg.waitForTimeout(800);
await A.pg.screenshot({ path: `${out}/4-alice-result.png` });
const res = pg => pg.evaluate(() => ({ title: document.getElementById('resTitle').textContent, label: document.getElementById('resLabel').textContent, alive: window.__lc.match.alive.map(p => p.name), rounds: window.__lc.match.round }));
const ra = await res(A.pg), rb = await res(B.pg);
console.log('Alice result', JSON.stringify(ra)); console.log('Bobby result', JSON.stringify(rb));
console.log('same survivors:', JSON.stringify(ra.alive) === JSON.stringify(rb.alive), '| same rounds:', ra.rounds === rb.rounds);
console.log('errors:', [...A.pg.errs, ...B.pg.errs].join(' | ') || 'none');
await b.close(); srv.kill();
