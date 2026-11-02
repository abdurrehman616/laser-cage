// Rewarded ads (AdMob), Google Play purchases, the daily spin wheel and gem exchange.
// In a browser (development / web preview) ads and purchases run in a clearly labelled test mode.
import { Capacitor } from '@capacitor/core';
import { ADS, EXCHANGE, ITEMS, NOADS_DAILY_GEMS, PRODUCTS, Product, SPIN, SPIN_AD_EXTRA, SpinSlice, STARTER } from './config';
import { profile, save, grant } from './save';
import { today } from './progress';
import { FIREBASE } from './config';
import { firebaseOn } from './firebase';
import { verifyPurchaseOnServer } from './cloud';
import { track } from './analytics';

const native = Capacitor.isNativePlatform();

// ======================= ADS =======================
type AdMobT = typeof import('@capacitor-community/admob').AdMob;
let admob: AdMobT | null = null;
let adReady = false, adLoading = false;
export let privacyOptionsRequired = false;

export async function initAds() {
  if (!native) return;
  try {
    const mod = await import('@capacitor-community/admob');
    admob = mod.AdMob;
    await admob.initialize({ initializeForTesting: ADS.testMode, tagForChildDirectedTreatment: false });
    // Google's consent form (EU/UK users must be asked before personalised ads)
    try {
      const info = await admob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) await admob.showConsentForm();
      const after = await admob.requestConsentInfo();
      privacyOptionsRequired = String(after.privacyOptionsRequirementStatus) === 'REQUIRED';
    } catch { /* consent not available */ }
    preloadAd();
  } catch { admob = null; }
}
async function preloadAd() {
  if (!admob || adReady || adLoading) return;
  adLoading = true;
  try { await admob.prepareRewardVideoAd({ adId: ADS.rewardedUnit, isTesting: ADS.testMode }); adReady = true; }
  catch { adReady = false; }
  adLoading = false;
}
export async function showPrivacyOptions() { try { await admob?.showPrivacyOptionsForm(); } catch { /* ignore */ } }

function adsToday() { if (profile.ads.date !== today()) profile.ads = { date: today(), count: 0 }; return profile.ads; }
export const adsLeftToday = () => Math.max(0, ADS.dailyCap - adsToday().count);

/**
 * Show a rewarded ad. Resolves true if the player earned the reward.
 * No-Ads Pass owners get the reward straight away.
 */
export async function rewardedAd(webFallback: () => Promise<boolean>): Promise<boolean> {
  if (profile.noAds) return true;
  if (!adsLeftToday()) return false;
  let ok = false;
  if (!native) ok = await webFallback();
  else if (admob) {
    try {
      if (!adReady) await preloadAd();
      if (!adReady) return false;
      adReady = false;
      const r = await admob.showRewardVideoAd();
      ok = !!r;
    } catch { ok = false; }
    preloadAd();
  }
  if (ok) { adsToday().count++; save(); }
  track(ok ? 'ad_reward' : 'ad_failed', { native });
  return ok;
}

// ======================= PURCHASES =======================
type NP = typeof import('@capgo/native-purchases');
let np: NP | null = null;
const prices = new Map<string, string>();
export let storeReady = false;

export const priceOf = (p: Product) => prices.get(p.id) ?? p.fallbackPrice;

export async function initStore(onChange: () => void) {
  if (!native) return;
  try {
    np = await import('@capgo/native-purchases');
    const { isBillingSupported } = await np.NativePurchases.isBillingSupported();
    if (!isBillingSupported) return;
    const { products } = await np.NativePurchases.getProducts({ productIdentifiers: PRODUCTS.map(p => p.id), productType: np.PURCHASE_TYPE.INAPP });
    for (const p of products) prices.set(p.identifier, p.priceString);
    storeReady = true;
    await restorePurchases(true);
    onChange();
  } catch { /* billing not available (e.g. app not installed from Play) */ }
}

/** Gives the player what a product contains. Returns a short description. */
function grantProduct(p: Product): string {
  if (p.kind === 'gems') { profile.gems += p.gems; save(); return `+${p.gems} GEMS`; }
  if (p.kind === 'starter') {
    if (!profile.starterBought) { profile.gems += p.gems; profile.coins += STARTER.coins; profile.starterBought = true; }
    grant(STARTER.item); save();
    return `STARTER PACK: +${p.gems} GEMS, +${STARTER.coins} COINS, NEON GUN`;
  }
  profile.noAds = true; save();
  return 'NO-ADS PASS ACTIVE';
}

export type BuyResult = { ok: true; msg: string } | { ok: false; msg: string };
export async function buyProduct(p: Product, webConfirm: () => Promise<boolean>): Promise<BuyResult> {
  if (!native) {
    // browser test mode: no real money, lets us test the flow
    if (!(await webConfirm())) return { ok: false, msg: '' };
    return { ok: true, msg: grantProduct(p) };
  }
  if (!np || !storeReady) return { ok: false, msg: 'The Play Store isn\'t available right now. Try again later.' };
  try {
    const t = await np.NativePurchases.purchaseProduct({
      productIdentifier: p.id, productType: np.PURCHASE_TYPE.INAPP, quantity: 1,
      isConsumable: p.consumable, autoAcknowledgePurchases: true,
    });
    if (t.purchaseState && t.purchaseState !== '1') return { ok: false, msg: 'Your payment is pending. Your items arrive once it completes.' };
    const token = t.purchaseToken ?? t.transactionId;
    if (token && profile.tokens.includes(token)) return { ok: false, msg: 'Already received.' };
    // ask our server to confirm the purchase with Google (once Firebase is set up)
    if (token && firebaseOn() && FIREBASE.verifyPurchases) {
      const v = await verifyPurchaseOnServer(p.id, token);
      track('iap_verify', { product: p.id, result: v });
      if (v === 'invalid') return { ok: false, msg: 'This purchase couldn\'t be verified with Google Play.' };
    }
    if (token) { profile.tokens.push(token); if (profile.tokens.length > 200) profile.tokens.shift(); }
    track('iap_purchase', { product: p.id });
    return { ok: true, msg: grantProduct(p) };
  } catch (e) {
    const m = String((e as Error)?.message ?? e).toLowerCase();
    if (m.includes('cancel')) return { ok: false, msg: '' };
    if (m.includes('already') && !p.consumable) { grantProduct(p); return { ok: true, msg: 'Restored your purchase.' }; }
    return { ok: false, msg: 'Purchase didn\'t go through. You were not charged.' };
  }
}

/** Re-apply one-time purchases (No-Ads Pass, Starter Pack items) after reinstalling. */
export async function restorePurchases(silent = false): Promise<string> {
  if (!np) return silent ? '' : 'Purchases can only be restored in the Play Store app.';
  try {
    const { purchases } = await np.NativePurchases.getPurchases({ productType: np.PURCHASE_TYPE.INAPP });
    let n = 0;
    for (const t of purchases) {
      if (t.purchaseState && t.purchaseState !== '1') continue;
      if (t.productIdentifier === 'remove_ads' && !profile.noAds) { profile.noAds = true; n++; }
      if (t.productIdentifier === 'starter_pack') { grant(STARTER.item); if (!profile.starterBought) { profile.starterBought = true; n++; } }
    }
    save();
    return n ? 'Purchases restored.' : 'No purchases to restore.';
  } catch { return 'Couldn\'t reach the Play Store.'; }
}

/** No-Ads Pass owners get a few gems every day. */
export function noAdsDaily(): number {
  if (!profile.noAds || profile.noAdsGems === today()) return 0;
  profile.noAdsGems = today(); profile.gems += NOADS_DAILY_GEMS; save();
  return NOADS_DAILY_GEMS;
}

// ======================= GEMS → COINS =======================
export function exchange(i: number): boolean {
  const e = EXCHANGE[i];
  if (!e || profile.gems < e.gems) return false;
  profile.gems -= e.gems; profile.coins += e.coins; save();
  return true;
}

// ======================= DAILY SPIN =======================
function spinToday() { if (profile.spin.date !== today()) profile.spin = { date: today(), freeUsed: false, adSpins: 0 }; return profile.spin; }
export const freeSpinReady = () => !spinToday().freeUsed;
export const adSpinsLeft = () => SPIN_AD_EXTRA - spinToday().adSpins;

export interface SpinResult { index: number; slice: SpinSlice; text: string }
/** Picks a slice, pays it out, and marks the spin as used. */
export function spin(viaAd: boolean): SpinResult {
  const s = spinToday();
  if (viaAd) s.adSpins++; else s.freeUsed = true;
  const total = SPIN.reduce((a, x) => a + x.weight, 0);
  let r = Math.random() * total, index = 0;
  for (; index < SPIN.length - 1; index++) { r -= SPIN[index].weight; if (r < 0) break; }
  const slice = SPIN[index];
  let text = '';
  if (slice.coins) { profile.coins += slice.coins; text = `+${slice.coins} COINS`; }
  else if (slice.gems) { profile.gems += slice.gems; text = `+${slice.gems} GEMS`; }
  else {
    // a random coin item you don't own yet; if you own them all, 400 coins instead
    const pool = ITEMS.filter(i => !i.gems && i.price > 0 && !profile.owned.includes(i.id));
    if (pool.length) { const it = pool[Math.floor(Math.random() * pool.length)]; grant(it.id); text = `NEW ITEM: ${it.name.toUpperCase()}!`; }
    else { profile.coins += 400; text = '+400 COINS'; }
  }
  save();
  return { index, slice, text };
}
