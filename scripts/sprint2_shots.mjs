// Plays through the Sprint 2 screens in a phone-sized headless browser and saves screenshots.
import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
const cdp = await ctx.newCDPSession(pg);
const touch = async (sel, dx, dy, ms) => { const r = await pg.locator(sel).boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy, id: 1 }] });
  await pg.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
const shot = n => pg.screenshot({ path: `${out}/${n}.png` });
await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(1500);
await shot('01-home-new');
// guided first match
await pg.click('#playBtn', { force: true });
await pg.waitForFunction(() => window.__lc.match?.phase === 'intro'); await pg.waitForTimeout(700); await shot('02-tut-intro');
await pg.waitForFunction(() => window.__lc.match?.phase === 'hide', null, { timeout: 60000 }); await pg.waitForTimeout(400); await shot('03-tut-move');
await touch('#movepad', 40, -30, 1500);
await pg.waitForFunction(() => document.getElementById('coachText').textContent.includes('AIM'), null, { timeout: 30000 }); await shot('04-tut-aim');
await touch('#aimpad', -40, -20, 500); await pg.waitForTimeout(300); await shot('04b-tut-aimed');
await pg.waitForFunction(() => window.__lc.match?.phase === 'drop', null, { timeout: 60000 }); await pg.waitForTimeout(300); await shot('05-tut-drop');
await pg.waitForSelector('#result:not([hidden])', { timeout: 240000 }); await pg.waitForTimeout(1200); await shot('06-result-xp');
console.log('after tutorial', await pg.evaluate(() => ({ lvl: window.__lc.profile.level, xp: window.__lc.profile.xp, coins: window.__lc.profile.coins, tut: window.__lc.profile.tutorialDone, round: window.__lc.match?.round })));
await pg.click('#homeBtn'); await pg.waitForTimeout(1300); await shot('07-daily-popup');
await pg.click('#dailyClaim'); await pg.waitForTimeout(300); await shot('08-daily-claimed');
await pg.click('#dailyClose'); await pg.waitForTimeout(500); await shot('09-home-after');
await pg.click('#missionsBtn'); await pg.waitForTimeout(300); await shot('10-missions');
await pg.click('#missionsClose');
// shop new tabs
await pg.evaluate(() => { window.__lc.profile.coins = 5000; });
await pg.click('#shopBtn'); await pg.waitForTimeout(300);
await pg.click('#shopTabs button:nth-child(2)'); await pg.click('.itm:nth-child(4)'); await pg.waitForTimeout(900); await shot('11-shop-guns');
await pg.click('#shopTabs button:nth-child(5)'); await pg.click('.itm:nth-child(2)'); await pg.waitForTimeout(500); await shot('12-shop-fx');
await pg.click('#shopTabs button:nth-child(6)'); await pg.click('.itm:nth-child(4)'); await pg.waitForTimeout(700); await shot('13-shop-dance');
await pg.click('#shop .back');
// arenas
await pg.evaluate(() => { const p = window.__lc.profile; p.level = 6; });
await pg.click('#arenaNext'); await pg.waitForTimeout(1200); await shot('14-home-volcano');
await pg.click('#playBtn', { force: true }); await pg.waitForFunction(() => window.__lc.match?.phase === 'intro'); await pg.waitForTimeout(600); await shot('15-volcano-match');
await pg.click('#pauseBtn'); await pg.click('#quitBtn');
await pg.click('#arenaNext'); await pg.waitForTimeout(800);
await pg.click('#playBtn', { force: true }); await pg.waitForFunction(() => window.__lc.match?.phase === 'intro'); await pg.waitForTimeout(600); await shot('16-sky-match');
await pg.click('#pauseBtn'); await pg.click('#quitBtn'); await pg.waitForTimeout(400);
await pg.click('#arenaNext'); await pg.evaluate(() => { window.__lc.profile.level = 1; }); await pg.click('#arenaNext'); await pg.waitForTimeout(600); await shot('17-home-locked');
console.log(errs.join('\n') || 'no errors');
await b.close();
