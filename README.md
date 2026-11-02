# Laser Cage

Hide. Aim. Reveal. A party shooter where everyone vanishes while they aim, then all lasers fire at once and the floor shrinks every round.

## Modes
- **Vs Bots**: 1–5 computer players, Easy / Normal / Hard. Works offline.
- **Online**: coming soon (see roadmap).

## Run it on your computer
Needs Node.js 20+.

```bash
npm install
npm run dev        # opens on http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
```

## Build the Android app
**Easiest (no Android Studio):** push this folder to a GitHub repo. The workflow in `.github/workflows/android.yml` builds an APK and attaches it to a new Release. Open the Release on your phone and install it.

**On your own computer:** install Android Studio, then:

```bash
npm run android:sync   # builds the game and copies it into the Android project
npm run android:open   # opens Android Studio; press Run with your phone plugged in
```

## Where things live
| File | What it does |
|---|---|
| `src/config.ts` | All tuning numbers (timers, speeds, rewards, bot difficulty) and the shop catalog |
| `src/game/match.ts` | The rules: rounds, hiding, lasers, floor drops, winners |
| `src/game/bots.ts` | Computer players (they can't see hidden players either) |
| `src/render/scene.ts` | 3D arena, lasers, effects, camera |
| `src/render/models.ts` | Blocky characters, outfits, hats |
| `src/main.ts` | Menus, shop, input, HUD |
| `src/save.ts` | Coins, owned items and settings saved on the phone |
| `src/progress.ts` | Levels and XP, daily login rewards, daily missions |
| `src/monetize.ts` | Rewarded ads, Play purchases, spin wheel, gem exchange (test mode in a browser) |
| `src/firebase.ts`, `src/cloud.ts`, `src/analytics.ts` | Firebase connection, cloud save, events and error reports (off until configured) |
| `server/` | Cloud Function that checks Play purchases, and Firestore security rules |
| `SETUP_FIREBASE_ADMOB.md` | One-time setup checklist |
| `PLAY_CONSOLE_SPRINT3.md` | Product IDs and Play Console answers for ads + purchases |
| `scripts/sim.ts` | Plays hundreds of bot matches headlessly to check balance: `npx tsx scripts/sim.ts` |

## Roadmap
1. ✅ Sprint 1: real project, 3D look, menus, shop with coins, sound, Android packaging
2. ✅ Sprint 2: levels & XP, daily login rewards, daily missions, guided first match, Volcano Pit and Sky Deck arenas, music, gun skins, hit effects, victory dances
3. ✅ Sprint 3: gems, rewarded ads (AdMob), Google Play purchases (gem packs, starter pack, No-Ads Pass), daily spin wheel, gem → coin swap
4. ✅ Sprint 4: analytics and error reporting, cloud save (Firestore), server purchase checks (Cloud Function), all ready and switched on with the Firebase config. See `SETUP_FIREBASE_ADMOB.md`
5. Sprint 5–6: online multiplayer (Colyseus server, regions, bots fill empty slots)
