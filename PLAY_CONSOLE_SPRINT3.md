# Play Console changes for v0.4.0 (ads + purchases)

Update these in **Policy → App content** before sending the v0.4.0 release for review.

## Ads
- Does your app contain ads? → **Yes**

## Advertising ID
- Does your app use advertising ID? → **Yes**
- Purposes → **Advertising or marketing**, **Analytics**, **Fraud prevention, security, and compliance**

## Data safety
Does your app collect or share any of the required user data types? → **Yes**
Is all collected data encrypted in transit? → **Yes**
Do you provide a way for users to request that their data is deleted? → **No** (no accounts; users reset the ad ID in Android settings)

Tick these data types, and for each one answer: **Collected: Yes · Shared: Yes · Processed ephemerally: No · Required: Yes**
Purposes for each: **Advertising or marketing, Analytics, Fraud prevention, security, and compliance**

| Section | Data type |
|---|---|
| Location | Approximate location |
| App activity | App interactions |
| App info and performance | Diagnostics |
| Device or other IDs | Device or other IDs |

(Source: Google's AdMob "Google Play data disclosure" page.)
Purchases go through Google Play Billing, which Google handles; the game doesn't collect payment info.

## Content rating
Retake the questionnaire and change **"Does the app allow users to purchase digital goods?" → Yes** (everything else stays the same).

## Target audience
No change (13–15, 16–17, 18+). Keep "appeals to children" → **No**.

## In-app products
Monetize with Play → Products → **In-app products** (one-time products). Create these exact Product IDs, set them **Active**:

| Product ID | Name | Suggested price (PKR) | Type in the game |
|---|---|---|---|
| `gems_small` | Handful of Gems (80) | Rs 280 | consumable |
| `gems_medium` | Pouch of Gems (450) | Rs 1,400 | consumable |
| `gems_large` | Chest of Gems (1000) | Rs 2,800 | consumable |
| `starter_pack` | Starter Pack | Rs 280 | one-time |
| `remove_ads` | No-Ads Pass | Rs 840 | one-time |

Needs a **payments profile** first (Settings → Payments profile).

## License testing (buy without being charged)
Settings → **License testing** → add your Gmail and your testers' Gmails → License response "RESPOND_NORMALLY".
Testers then see "Test card, always approves" in the payment sheet.

## AdMob: switch from test ads to real ads
1. admob.google.com → Apps → Add app → Android → link to Laser Cage.
2. Create one **Rewarded** ad unit.
3. Send the **App ID** (`ca-app-pub-…~…`) and **Rewarded ad unit ID** (`ca-app-pub-…/…`) so they replace the test IDs in
   `src/config.ts` (ADS) and `android/app/src/main/AndroidManifest.xml`, and set `testMode: false`.
