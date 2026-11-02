# Laser Cage – one-time setup (Firebase + AdMob)

Do these when you're ready, then send the items marked **SEND**. The game works without them
(progress stays on the phone, ads are Google test ads).

## 1. Firebase project (free)
1. https://console.firebase.google.com → **Add project** → name "Laser Cage" → enable Google Analytics → create.
2. **Add app → Web** (</> icon) → nickname "Laser Cage game" → Register.
   Copy the `firebaseConfig` block (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId).
   **SEND** that block.
3. **Add app → Android** → package name `com.lasercage.game` → Register → download **google-services.json**.
   **SEND** the file. (Needed later for Google sign-in, so players can restore progress on a new phone.)
4. **Build → Authentication → Get started → Sign-in method** → enable **Anonymous** (and **Google**).
5. **Build → Firestore Database → Create database** → Production mode → location **asia-south1 (Mumbai)**.

## 2. Purchase checking on the server (optional now, recommended before launch)
1. Firebase → ⚙ Usage and billing → switch to the **Blaze** plan (pay as you go; needs a card; small games stay inside the free allowance).
2. On a computer with Node.js: `npm i -g firebase-tools` → `firebase login`
3. In the repo: `cd server/functions && npm install && cd .. && firebase use <your-project-id> && npm --prefix functions run deploy`
4. Google Cloud console → IAM → copy the email of the **default compute service account** used by the function.
   Play Console → **Users and permissions → Invite new users** → paste that email → app permission **View financial data**.

## 3. AdMob (real ads)
1. https://admob.google.com → **Apps → Add app** → Android → link to Laser Cage.
2. **Ad units → Add ad unit → Rewarded** → name "Rewarded".
3. **SEND** the **App ID** (`ca-app-pub-…~…`) and the **Rewarded ad unit ID** (`ca-app-pub-…/…`).
4. (Recommended) AdMob → Privacy & messaging → create a **GDPR** message so EU/UK players get the consent form.

## What happens when you send them
I put the IDs into `src/config.ts` and the Android manifest, switch Firebase on and ads to live,
build a new version and send you the signed .aab. Then update the Data safety form (I'll give the answers).
