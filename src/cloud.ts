// Cloud save: keeps a copy of your progress in Firestore under your account.
// The phone copy is always the one you play with; the cloud copy is a backup that
// comes back when you sign in on a new phone. Off while Firebase is off.
import { Capacitor } from '@capacitor/core';
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

let restored: () => void = () => {};
/** Compare the cloud copy with this phone and keep whichever has more progress. */
async function pull() {
  const fb = await firebase(); if (!fb) { set('offline'); return; }
  try {
    const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'players', fb.uid));
    const cloud = snap.exists() ? (snap.data().profile as Profile | undefined) : undefined;
    // Take whichever copy has more progress (e.g. after signing in on a new phone).
    if (cloud && progressScore(cloud) > progressScore(profile)) {
      const keep: Partial<Profile> = {};
      for (const k of DEVICE_ONLY) (keep as Record<string, unknown>)[k] = profile[k];
      replaceProfile({ ...cloud, ...keep });
      restored();
      set('synced');
    } else await push();
  } catch { set('offline'); }
}

/** Start syncing. Call once at startup. */
export async function initCloud(onRestored: () => void) {
  if (!firebaseOn()) return;
  restored = onRestored;
  await pull();
  // every local save is backed up a few seconds later
  onSaved(() => { clearTimeout(pushTimer); pushTimer = window.setTimeout(push, 4000); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(pushTimer); push(); } });
}

/** Who is signed in: a guest (anonymous) or a Google account. */
export async function account(): Promise<{ id: string; google: boolean; name: string } | null> {
  const fb = await firebase(); const u = fb?.auth.currentUser; if (!fb || !u) return null;
  const g = !u.isAnonymous && u.providerData.some(p => p.providerId === 'google.com');
  return { id: u.uid, google: g, name: u.displayName || u.email || '' };
}

/**
 * Sign in with Google. Your guest progress moves into the Google account (same save), so it's safe
 * if you reinstall or change phones. If that Google account already has a save (from another phone),
 * we switch to it and keep whichever has more progress.
 */
export async function signInWithGoogle(): Promise<'ok' | 'switched' | 'cancel' | 'error'> {
  const fb = await firebase(); if (!fb) return 'error';
  const { GoogleAuthProvider, linkWithCredential, linkWithPopup, signInWithCredential } = fb.authMod;
  let cred: import('firebase/auth').OAuthCredential | null = null;
  try {
    if (Capacitor.isNativePlatform()) {
      // the phone's own Google account picker; we then sign in to Firebase here in the game
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      if (!r.credential?.idToken) return 'error';
      cred = GoogleAuthProvider.credential(r.credential.idToken);
      await linkWithCredential(fb.auth.currentUser!, cred);
    } else {
      await linkWithPopup(fb.auth.currentUser!, new GoogleAuthProvider());
    }
    await fb.auth.currentUser!.reload();
    await push();
    return 'ok';
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
      // this Google account was used before: switch to it
      try {
        const c = GoogleAuthProvider.credentialFromError(e as import('firebase/app').FirebaseError) ?? cred;
        if (!c) return 'error';
        const u = (await signInWithCredential(fb.auth, c)).user;
        fb.uid = u.uid;
        await pull();
        return 'switched';
      } catch { return 'error'; }
    }
    if (code === 'auth/provider-already-linked') return 'ok';
    if (msg.includes('cancel') || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'cancel';
    console.warn('Google sign-in failed', e);
    return 'error';
  }
}

/** Sign out of Google. This phone keeps playing as a new guest with the same progress. */
export async function signOutGoogle() {
  const fb = await firebase(); if (!fb) return;
  try {
    if (Capacitor.isNativePlatform()) { const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication'); await FirebaseAuthentication.signOut().catch(() => {}); }
    await fb.authMod.signOut(fb.auth);
    fb.uid = (await fb.authMod.signInAnonymously(fb.auth)).user.uid;
    await push();
  } catch { set('offline'); }
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
