// Screenshots of the menus on several phone sizes: node scripts/ui_shots.mjs <outdir> [tag]
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const out = process.argv[2], tag = process.argv[3] || 'x';
const SIZES = [['small', 360, 640], ['mid', 393, 851], ['tall', 412, 915], ['wide', 480, 800]];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const [name, w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { const d = new Date(); const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!localStorage.getItem('lasercage.profile.v1') && !location.search.includes('fresh')) localStorage.setItem('lasercage.profile.v1', JSON.stringify({ v: 1, tutorialDone: true, onboarded: true, coins: 3922, gems: 5, level: 4, stats: { matches: 12, wins: 4, kills: 9, bestRound: 5 }, daily: { last: t, streak: 2 } })); });
  await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: `${out}/${tag}-${name}-splash.png` });
  await pg.waitForTimeout(2600);
  await pg.screenshot({ path: `${out}/${tag}-${name}-home.png` });
  await pg.evaluate(() => window.__lc.show('botsetup')); await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${out}/${tag}-${name}-bots.png` });
  for (const tab of ['gems', 'laser', 'gun']) {
    await pg.evaluate(t => window.__lc.openShop(t), tab); await pg.waitForTimeout(1300);
    await pg.screenshot({ path: `${out}/${tag}-${name}-shop-${tab}.png` });
  }
  await ctx.close();
  // first launch
  const c2 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('http://localhost:4173/?fresh'); await p2.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) { await p2.screenshot({ path: `${out}/${tag}-${name}-ob${i}.png` }); if (i < 4) { await p2.click('#obNext'); await p2.waitForTimeout(500); } }
  await c2.close();
}
console.log('errors:', errs.join(' | ') || 'none');
await b.close();
