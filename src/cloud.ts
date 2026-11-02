// Cloud save: keeps a copy of your progress in Firestore under your account.
// The phone copy is always the one you play with; the cloud copy is a backup that
// comes back when you sign in on a new phone. Off while Firebase is off.
import { APP_VERSION } from './config';
import { firebase, firebaseOn } from './firebase';
import { Profile, onSaved, profile, replaceProfile } from './save';

// Device settings stay on each phone and are never copied to or from the cloud.
const DEVICE_ONLY: (keyof Profile)[] = ['sound', 'music', 'vibrate', 'swapSticks', 'gfx'];

export type CloudState = 'off' | 'connecting' | 'synced' | 'offline';
let state: CloudState = firebaseOn() ? 'connecting' : 'off';
let listeners: ((s: CloudState) => void)[] = [];
const set = (s: CloudState) => { state = s; listeners.forEach(f => f(s)); };
export const cloudState = () => state;
export const onCloudState = (f: (s: CloudState) => void) => { listeners.push(f); };

function progressScore(p: Pick<Profile, 'level' | 'xp' | 'stats'>) {
  return p.level * 1e6 + p.xp * 10 + (p.stats?.matches ?? 0);
}
function toCloud(): Record<string, unknown> {
  const data: Record<string, unknown> = { ...profile };
  for (const k of DEVICE_ONLY) delete data[k];
  return data;
}

let pushTimer = 0;
async function push() {
  const fb = await firebase(); if (!fb) { set('offline'); return; }
  try {
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'players', fb.uid), {
      profile: toCloud(), score: progressScore(profile), appVersion: APP_VERSION, updatedAt: fb.fs.serverTimestamp(),
    });
    set('synced');
  } catch { set('offline'); }
}

/** Start syncing. Call once at startup. */
export async function initCloud(onRestored: () => void) {
  if (!firebaseOn()) return;
  const fb = await firebase(); if (!fb) { set('offline'); return; }
  try {
    const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'players', fb.uid));
    const cloud = snap.exists() ? (snap.data().profile as Profile | undefined) : undefined;
    // Take whichever copy has more progress (e.g. after signing in on a new phone).
    if (cloud && progressScore(cloud) > progressScore(profile)) {
      const keep: Partial<Profile> = {};
      for (const k of DEVICE_ONLY) (keep as Record<string, unknown>)[k] = profile[k];
      replaceProfile({ ...cloud, ...keep });
      onRestored();
      set('synced');
    } else await push();
  } catch { set('offline'); }
  // every local save is backed up a few seconds later
  onSaved(() => { clearTimeout(pushTimer); pushTimer = window.setTimeout(push, 4000); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(pushTimer); push(); } });
}

/** Your account id, shown in Settings so support can find your save. */
export async function accountId(): Promise<string | null> {
  const fb = await firebase(); return fb ? fb.uid : null;
}

/** Ask the server to check a Google Play purchase. 'unavailable' means the check couldn't run. */
export async function verifyPurchaseOnServer(productId: string, purchaseToken: string): Promise<'valid' | 'invalid' | 'unavailable'> {
  const fb = await firebase(); if (!fb) return 'unavailable';
  try {
    const call = fb.fnMod.httpsCallable<{ productId: string; purchaseToken: string }, { valid: boolean }>(fb.functions, 'verifyPurchase');
    const r = await call({ productId, purchaseToken });
    return r.data.valid ? 'valid' : 'invalid';
  } catch { return 'unavailable'; }
}
