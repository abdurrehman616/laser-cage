// Firebase connection: anonymous account, Firestore and Analytics.
// Everything here is skipped while FIREBASE.enabled is false, and the Firebase code is only
// downloaded into memory when it's switched on.
import { FIREBASE } from './config';

type FB = {
  uid: string;
  db: import('firebase/firestore').Firestore;
  fs: typeof import('firebase/firestore');
  auth: import('firebase/auth').Auth;
  authMod: typeof import('firebase/auth');
  functions: import('firebase/functions').Functions;
  fnMod: typeof import('firebase/functions');
  analytics: import('firebase/analytics').Analytics | null;
  anMod: typeof import('firebase/analytics');
};

let ready: Promise<FB | null> | null = null;

export const firebaseOn = () => FIREBASE.enabled && !!FIREBASE.config.apiKey;

/** Connects once and signs in as a guest. Resolves null when Firebase is off or unreachable. */
export function firebase(): Promise<FB | null> {
  if (!firebaseOn()) return Promise.resolve(null);
  ready ??= (async () => {
    try {
      const [{ initializeApp }, authMod, fs, fnMod, anMod] = await Promise.all([
        import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/functions'), import('firebase/analytics'),
      ]);
      const app = initializeApp(FIREBASE.config);
      const auth = authMod.initializeAuth(app, { persistence: authMod.indexedDBLocalPersistence });
      const user = auth.currentUser ?? (await authMod.signInAnonymously(auth)).user;
      const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
      const functions = fnMod.getFunctions(app, FIREBASE.functionsRegion);
      const analytics = (await anMod.isSupported().catch(() => false)) && FIREBASE.config.measurementId ? anMod.getAnalytics(app) : null;
      return { uid: user.uid, db, fs, auth, authMod, functions, fnMod, analytics, anMod };
    } catch (e) {
      console.warn('Firebase unavailable', e);
      ready = null;          // try again next time
      return null;
    }
  })();
  return ready;
}
