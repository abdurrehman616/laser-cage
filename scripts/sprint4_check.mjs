// Sprint 4 check with Firebase switched off: the game must work exactly as before,
// record analytics events locally, and show the account panel and problem report.
import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
const reqs = []; pg.on('request', r => { if (/googleapis|firebase|google-analytics/.test(r.url())) reqs.push(r.url()); });
await pg.goto('http://localhost:4173/'); await pg.waitForTimeout(1000);
await pg.evaluate(() => { const p = window.__lc.profile; p.tutorialDone = true; window.__lc.setup.bots = 1; window.__lc.setup.diff = 'easy'; window.__lc.show('home'); });
await pg.waitForTimeout(800);
if (await pg.isVisible('#daily')) { await pg.click('#dailyClaim'); await pg.click('#dailyClose'); }
await pg.click('#playBtn', { force: true });
await pg.waitForSelector('#result:not([hidden])', { timeout: 240000 }); await pg.waitForTimeout(600);
await pg.click('#homeBtn'); await pg.waitForTimeout(500);
await pg.click('#settingsBtn'); await pg.waitForTimeout(500);
await pg.screenshot({ path: `${out}/settings.png` });
await pg.click('#reportBtn'); await pg.waitForTimeout(400);
const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
console.log('events:', (await pg.evaluate(() => window.__lc.recentEvents().map(e => e.name))).join(', '));
console.log('account line:', await pg.textContent('#acctLine'));
console.log('report starts:', clip.split('\n').slice(0, 2).join(' | '));
console.log('firebase network requests while off:', reqs.length);
console.log(errs.join('\n') || 'no errors');
await b.close();
