// Server check for Google Play purchases.
// The game sends the purchase token; we ask Google Play whether it's a real, completed purchase
// for this app and product, and record it so the same token can't be used twice.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';

initializeApp();
const PACKAGE = 'com.lasercage.game';
const PRODUCTS = new Set(['gems_small', 'gems_medium', 'gems_large', 'starter_pack', 'remove_ads']);

// Uses the function's own service account. In Play Console → Users and permissions, invite that
// service account email and give it "View financial data" so it can read purchases.
const publisher = google.androidpublisher({
  version: 'v3',
  auth: new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] }),
});

export const verifyPurchase = onCall({ region: 'asia-south1', enforceAppCheck: false }, async req => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { productId, purchaseToken } = (req.data ?? {}) as { productId?: string; purchaseToken?: string };
  if (!productId || !PRODUCTS.has(productId) || typeof purchaseToken !== 'string' || purchaseToken.length < 10 || purchaseToken.length > 2000)
    throw new HttpsError('invalid-argument', 'Bad purchase data.');

  const db = getFirestore();
  const ref = db.collection('purchases').doc(purchaseToken.slice(0, 1400).replace(/\//g, '_'));
  const seen = await ref.get();
  if (seen.exists) return { valid: seen.get('uid') === uid && seen.get('productId') === productId, repeat: true };

  try {
    const { data } = await publisher.purchases.products.get({ packageName: PACKAGE, productId, token: purchaseToken });
    // purchaseState 0 = purchased, 1 = cancelled, 2 = pending
    const valid = data.purchaseState === 0;
    await ref.set({ uid, productId, valid, orderId: data.orderId ?? null, testPurchase: data.purchaseType === 0, at: FieldValue.serverTimestamp() });
    return { valid };
  } catch (e) {
    console.error('verify failed', e);
    // Google couldn't find this token: treat it as not genuine.
    if ((e as { code?: number }).code === 400 || (e as { code?: number }).code === 404) return { valid: false };
    throw new HttpsError('unavailable', 'Could not reach Google Play.');
  }
});
