// Plays through the Sprint 3 screens (gems, store, spin, double coins) in browser test mode.
import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
const shot = n => pg.screenshot({ path: `${out}/${n}.png` });
const state = () => pg.evaluate(() => ({ coins: window.__lc.profile.coins, gems: window.__lc.profile.gems, noAds: window.__lc.profile.noAds, starter: window.__lc.profile.starterBought, owned: window.__lc.profile.owned.length }));
await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(800);
// skip the tutorial for this test
await pg.evaluate(() => { const p = window.__lc.profile; p.tutorialDone = true; p.daily.last = new Date().toISOString().slice(0, 10); window.__lc.show('home'); });
await pg.waitForTimeout(1200);
if (await pg.isVisible('#daily')) { await pg.click('#dailyClaim'); await pg.click('#dailyClose'); await pg.waitForTimeout(500); }
await shot('01-home');
// spin
await pg.click('#spinBtnSide'); await pg.waitForTimeout(400); await shot('02-spin');
await pg.click('#spinGo'); await pg.waitForTimeout(4600); await shot('03-spin-result');
console.log('after free spin', await state(), await pg.textContent('#spinResult'));
await pg.click('#spinGo'); await pg.waitForTimeout(600); await shot('04-test-ad');
await pg.waitForTimeout(6500); console.log('after ad spin', await state(), await pg.textContent('#spinResult'));
await pg.click('#spinClose', { force: true });
// gem store
await pg.click('.gemPill'); await pg.waitForTimeout(900); await shot('05-store');
await pg.click('[data-buy="starter_pack"]'); await pg.waitForTimeout(300); await shot('06-test-buy');
await pg.click('#fakebuyYes'); await pg.waitForTimeout(400); console.log('after starter', await state());
await pg.click('[data-buy="gems_medium"]'); await pg.click('#fakebuyYes'); await pg.waitForTimeout(300);
await pg.click('[data-ex="0"]'); await pg.waitForTimeout(300); console.log('after gems+exchange', await state());
await shot('07-store-after');
// VIP item with gems
await pg.click('#shopTabs button:nth-child(2)'); await pg.waitForTimeout(300);
await pg.click('.itm:nth-child(7)'); await pg.waitForTimeout(700); await shot('08-vip-gems');
await pg.click('#shopAction'); await pg.waitForTimeout(400); console.log('after rainbow', await state(), await pg.evaluate(() => window.__lc.profile.equip.laser));
await pg.click('#shop .back');
// match → double coins
await pg.evaluate(() => { window.__lc.setup.bots = 1; window.__lc.setup.diff = 'easy'; });
await pg.click('#playBtn', { force: true });
await pg.waitForSelector('#result:not([hidden])', { timeout: 240000 }); await pg.waitForTimeout(800); await shot('09-result-double');
const before = (await state()).coins;
await pg.click('#doubleBtn'); await pg.waitForTimeout(3500); await shot('10-doubled');
console.log('double coins', before, '->', (await state()).coins, await pg.textContent('#doubleText'));
// no-ads pass makes rewards instant
await pg.click('#homeBtn'); await pg.waitForTimeout(500);
await pg.click('.gemPill'); await pg.waitForTimeout(300);
await pg.click('[data-buy="remove_ads"]'); await pg.click('#fakebuyYes'); await pg.waitForTimeout(400); await shot('11-noads');
console.log('noads', await state());
console.log(errs.join('\n') || 'no errors');
await b.close();
