# Laser Cage

Hide. Aim. Reveal. A party shooter where everyone vanishes while they aim, then all lasers fire at once and the floor shrinks every round.

## Modes
- **Vs Bots**: 1–5 computer players, Easy / Normal / Hard. Works offline.
- **Pass & Play**: 2–4 friends on one phone. Each player plans in secret.
- **Online**: planned (see roadmap).

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
| `scripts/sim.ts` | Plays hundreds of bot matches headlessly to check balance: `npx tsx scripts/sim.ts` |

## Roadmap
1. ✅ Sprint 1: real project, 3D look, menus, shop with coins, sound, Android packaging
2. Sprint 2: rewarded ads, Google Play Billing (gems, VIP items), analytics, crash reporting
3. Sprint 3: online multiplayer (Colyseus server, regions, bots fill empty slots)
4. Closed testing on Play Console → soft launch
