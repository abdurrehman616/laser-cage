// Tuning knobs and the cosmetic catalog. Change numbers here to rebalance the game.

export const ARENA = {
  rings: 4,          // hex rings around the centre tile (4 => 61 tiles)
  finalRing: 1,      // the floor stops shrinking at this ring (7 tiles)
  cageRadius: 8.9,   // octagon fence radius
  tileGap: 0.03,
};

export const PLAYER = {
  radius: 0.4,
  speed: 3.3,          // units per second while hiding
};

export const TIMING = {
  intro: 1.6,       // everyone visible: memorise positions
  hideFirst: 6.5,   // round 1 is a bit longer
  hide: 5,
  lock: 1.0,
  fire: 0.9,
  drop: 1.4,
};

export const LASER = {
  hitWidth: 0.45,          // half-width of the hit test
  suddenDeathGrow: 0.14,   // extra width per sudden-death round
};

// Tutorial (first match) runs slower so new players can read the coach
export const TUTORIAL_TIMING = { intro: 3.2, hideFirst: 11, hide: 7 };

export const REWARDS = {
  perRoundSurvived: 10,
  perKill: 15,
  win: 60,
  perMatch: 5,       // just for playing
};

export type Difficulty = 'easy' | 'normal' | 'hard';
export const BOT_DIFFICULTY: Record<Difficulty, { turn: number; noise: number; guess: number; edgeFear: number; dodge: number }> = {
  // noise: aim error (radians). guess: how well they predict where you went. dodge: how much they move off their start spot.
  easy:   { turn: 1.6, noise: 0.40, guess: 0.0, edgeFear: 0.5, dodge: 0.5 },
  normal: { turn: 2.6, noise: 0.18, guess: 0.5, edgeFear: 0.9, dodge: 0.9 },
  hard:   { turn: 4.0, noise: 0.06, guess: 0.9, edgeFear: 1.0, dodge: 1.0 },
};

export const BOT_NAMES = ['Rook', 'Vex', 'Moss', 'Juno', 'Kade', 'Pixel', 'Nova'];
export const SEAT_COLORS = ['#ff4d6d', '#ffb547', '#5ef0c0', '#7fb8ff', '#d58bff', '#ff8a4d'];

// ---------- Cosmetics ----------
export type Slot = 'laser' | 'gun' | 'outfit' | 'hat' | 'fx' | 'dance' | 'floor';
export type FxStyle = 'spark' | 'confetti' | 'pixels' | 'coins' | 'smoke';
export type DanceStyle = 'hop' | 'spin' | 'wiggle' | 'flip';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  price: number;       // coins; 0 = free starter item
  premium?: boolean;   // will be gem-only once billing is added
  // visual data
  color?: string;      // laser colour
  rainbow?: boolean;
  shirt?: string; pants?: string; trim?: string; skin?: string;
  hat?: 'none' | 'cap' | 'crown' | 'band' | 'helmet';
  hatColor?: string;
  floor?: { base: string; inner: string; mesh: string; glow?: string };
  gun?: { body: string; glow?: string; metal?: number };
  fx?: FxStyle;
  dance?: DanceStyle;
  gems?: number;          // VIP items are bought with gems instead of coins
  unlockLevel?: number;   // given free when you reach this level (or buy it earlier)
}

export const ITEMS: Item[] = [
  // Lasers
  { id: 'laser_crimson', slot: 'laser', name: 'Crimson', price: 0, color: '#ff4d6d' },
  { id: 'laser_amber',   slot: 'laser', name: 'Amber',   price: 0, color: '#ffb547' },
  { id: 'laser_mint',    slot: 'laser', name: 'Mint',    price: 200, color: '#5ef0c0' },
  { id: 'laser_ice',     slot: 'laser', name: 'Ice',     price: 200, color: '#7fb8ff' },
  { id: 'laser_plasma',  slot: 'laser', name: 'Plasma',  price: 500, color: '#e3a2ff' },
  { id: 'laser_solar',   slot: 'laser', name: 'Solar',   price: 800, color: '#fff27a' },
  { id: 'laser_rainbow', slot: 'laser', name: 'Rainbow', price: 0, gems: 150, color: '#ffffff', rainbow: true, premium: true },
  // Gun skins
  { id: 'gun_classic', slot: 'gun', name: 'Classic', price: 0,    gun: { body: '#14191e', metal: 0.5 } },
  { id: 'gun_camo',    slot: 'gun', name: 'Camo',    price: 300,  gun: { body: '#4d6b35', metal: 0.1 }, unlockLevel: 4 },
  { id: 'gun_candy',   slot: 'gun', name: 'Candy',   price: 400,  gun: { body: '#ff8fc8', metal: 0.2 } },
  { id: 'gun_neon',    slot: 'gun', name: 'Neon',    price: 700,  gun: { body: '#1a2a3a', glow: '#3ff3ff', metal: 0.3 } },
  { id: 'gun_gold',    slot: 'gun', name: 'Gold',    price: 1200, gun: { body: '#ffc93a', metal: 0.9 } },
  { id: 'gun_dragon',  slot: 'gun', name: 'Dragon',  price: 0, gems: 200, gun: { body: '#b3122a', glow: '#ffb000', metal: 0.6 }, premium: true },
  // Outfits
  { id: 'fit_classic',   slot: 'outfit', name: 'Classic',   price: 0,    shirt: '#2f5fb3', pants: '#1f3554', trim: '#ffffff' },
  { id: 'fit_desert',    slot: 'outfit', name: 'Desert',    price: 300,  shirt: '#c79a5b', pants: '#6b5232', trim: '#3b2d1c' },
  { id: 'fit_ninja',     slot: 'outfit', name: 'Ninja',     price: 500,  shirt: '#1b1d22', pants: '#111216', trim: '#d6334f' },
  { id: 'fit_cricket',   slot: 'outfit', name: 'Cricket Whites', price: 600, shirt: '#f2f2ec', pants: '#e4e4dc', trim: '#1a7a3c' },
  { id: 'fit_astro',     slot: 'outfit', name: 'Astronaut', price: 0, gems: 120, shirt: '#e8ecf0', pants: '#b9c2cb', trim: '#ff8a2a', premium: true },
  // Hats
  { id: 'hat_none',  slot: 'hat', name: 'No hat',   price: 0,    hat: 'none' },
  { id: 'hat_cap',   slot: 'hat', name: 'Cap',      price: 250,  hat: 'cap', hatColor: '#d6334f' },
  { id: 'hat_band',  slot: 'hat', name: 'Headband', price: 300,  hat: 'band', hatColor: '#ffb547' },
  { id: 'hat_helmet',slot: 'hat', name: 'Helmet',   price: 700,  hat: 'helmet', hatColor: '#3d4a55' },
  { id: 'hat_crown', slot: 'hat', name: 'Crown',    price: 0, gems: 140, hat: 'crown', hatColor: '#ffd23f', premium: true },
  // Elimination effects (what your hits look like)
  { id: 'fx_spark',    slot: 'fx', name: 'Sparks',   price: 0,   fx: 'spark' },
  { id: 'fx_confetti', slot: 'fx', name: 'Confetti', price: 400, fx: 'confetti', unlockLevel: 8 },
  { id: 'fx_pixels',   slot: 'fx', name: 'Pixels',   price: 600, fx: 'pixels' },
  { id: 'fx_smoke',    slot: 'fx', name: 'Smoke Puff', price: 600, fx: 'smoke' },
  { id: 'fx_coins',    slot: 'fx', name: 'Coin Rain', price: 0, gems: 180, fx: 'coins', premium: true },
  // Victory dances
  { id: 'dance_hop',    slot: 'dance', name: 'Hop',    price: 0,   dance: 'hop' },
  { id: 'dance_spin',   slot: 'dance', name: 'Spin',   price: 400, dance: 'spin', unlockLevel: 10 },
  { id: 'dance_wiggle', slot: 'dance', name: 'Wiggle', price: 500, dance: 'wiggle' },
  { id: 'dance_flip',   slot: 'dance', name: 'Backflip', price: 0, gems: 120, dance: 'flip', premium: true },
  // Floors
  { id: 'floor_steel', slot: 'floor', name: 'Steel Mesh', price: 0,    floor: { base: '#7d8a92', inner: '#aab4ba', mesh: '#24323a' } },
  { id: 'floor_lava',  slot: 'floor', name: 'Lava Rock',  price: 800,  floor: { base: '#3b2622', inner: '#57352c', mesh: '#ff5a1f', glow: '#ff5a1f' } },
  { id: 'floor_ice',   slot: 'floor', name: 'Ice Sheet',  price: 800,  floor: { base: '#9fd3e8', inner: '#d4f0fa', mesh: '#5a9bb8' } },
  { id: 'floor_neon',  slot: 'floor', name: 'Neon Grid',  price: 0, gems: 140, floor: { base: '#12121f', inner: '#1c1c33', mesh: '#d55bff', glow: '#d55bff' }, premium: true },
];

export const DEFAULT_EQUIP: Record<Slot, string> = {
  laser: 'laser_crimson', gun: 'gun_classic', outfit: 'fit_classic', hat: 'hat_none', fx: 'fx_spark', dance: 'dance_hop', floor: 'floor_steel',
};

// ---------- Arenas ----------
export interface Arena {
  id: string; name: string; unlockLevel: number;
  holes: [number, number][];   // hex tiles (q, r) missing from the floor
  sky: string; ground: string; groundDot: [string, string]; rim: string; well: string; pit: string;
  post: string; fence: string; hemiSky: string; hemiGround: string; sun: string;
}
export const ARENAS: Arena[] = [
  { id: 'cage', name: 'The Cage', unlockLevel: 1, holes: [],
    sky: '#14205a', ground: '#2f6046', groundDot: ['rgba(20,50,34,.35)', 'rgba(80,130,90,.25)'], rim: '#46545c', well: '#0e1f1c', pit: '#020605',
    post: '#12171b', fence: 'rgba(190,205,212,.85)', hemiSky: '#cfe8ff', hemiGround: '#1d3a2c', sun: '#fff3df' },
  { id: 'volcano', name: 'Volcano Pit', unlockLevel: 3,
    holes: [[2, 0], [0, 2], [-2, 2], [-2, 0], [0, -2], [2, -2]],   // six gaps in the middle ring
    sky: '#2a0d12', ground: '#3a2622', groundDot: ['rgba(20,8,6,.45)', 'rgba(255,110,40,.18)'], rim: '#5a3a30', well: '#3a1208', pit: '#ff5a1f',
    post: '#2a0f0a', fence: 'rgba(255,140,80,.8)', hemiSky: '#ffd2b0', hemiGround: '#5a1a0a', sun: '#ffb27a' },
  { id: 'sky', name: 'Sky Deck', unlockLevel: 6,
    holes: [[0, 0]],                                              // no centre tile: the final platform is a ring
    sky: '#62b6ff', ground: '#eaf6ff', groundDot: ['rgba(170,205,235,.5)', 'rgba(255,255,255,.6)'], rim: '#c9d6e3', well: '#7fb8ff', pit: '#bfe3ff',
    post: '#e9eef3', fence: 'rgba(255,255,255,.9)', hemiSky: '#ffffff', hemiGround: '#8fb6e0', sun: '#ffffff' },
];
export const arena = (id: string) => ARENAS.find(a => a.id === id) ?? ARENAS[0];

// ---------- Progression ----------
export const XP = { perMatch: 20, perRound: 15, perKill: 25, win: 50 };
/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 100 + 50 * (level - 1);
export const MAX_LEVEL = 50;
/** Coins for reaching a level, plus any item or arena that unlocks there. */
export const levelCoins = (level: number) => 40 + 10 * level;

export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500];   // 7-day login streak

export type MissionKind = 'play' | 'win' | 'hits' | 'rounds' | 'hardWin' | 'final' | 'bots5';
export interface MissionDef { id: string; kind: MissionKind; goal: number; reward: number; text: string }
export const MISSION_POOL: MissionDef[] = [
  { id: 'play3',   kind: 'play',    goal: 3, reward: 60,  text: 'Play 3 matches' },
  { id: 'play5',   kind: 'play',    goal: 5, reward: 100, text: 'Play 5 matches' },
  { id: 'win1',    kind: 'win',     goal: 1, reward: 80,  text: 'Win a match' },
  { id: 'win2',    kind: 'win',     goal: 2, reward: 140, text: 'Win 2 matches' },
  { id: 'hits3',   kind: 'hits',    goal: 3, reward: 70,  text: 'Hit 3 players' },
  { id: 'hits6',   kind: 'hits',    goal: 6, reward: 120, text: 'Hit 6 players' },
  { id: 'rounds8', kind: 'rounds',  goal: 8, reward: 60,  text: 'Survive 8 rounds' },
  { id: 'hard1',   kind: 'hardWin', goal: 1, reward: 200, text: 'Win on Hard' },
  { id: 'final1',  kind: 'final',   goal: 1, reward: 90,  text: 'Reach the final platform' },
  { id: 'bots5',   kind: 'bots5',   goal: 1, reward: 60,  text: 'Play a match with 5 bots' },
];

export const item = (id: string) => ITEMS.find(i => i.id === id)!;

// Looks for computer players
export const NPC_OUTFITS = ['fit_classic', 'fit_desert', 'fit_ninja', 'fit_cricket'];
export const HAIR_COLORS = ['#d8432a', '#e09a3a', '#3a2a20', '#f2d86c', '#7a4bd1', '#2fb3a5'];

// ---------- Monetization (Sprint 3) ----------
// AdMob: these are Google's official TEST ids. Replace with your own before going live
// (App ID also goes in android/app/src/main/AndroidManifest.xml).
export const ADS = {
  testMode: true,
  appId: 'ca-app-pub-3940256099942544~3347511713',
  rewardedUnit: 'ca-app-pub-3940256099942544/5224354917',
  dailyCap: 12,            // max rewarded ads per day
};

// Google Play in-app products. Create these exact Product IDs in Play Console → Monetize → In-app products.
export interface Product { id: string; kind: 'gems' | 'starter' | 'noads'; gems: number; consumable: boolean; name: string; fallbackPrice: string; bonus?: string }
export const PRODUCTS: Product[] = [
  { id: 'gems_small',   kind: 'gems',    gems: 80,   consumable: true,  name: 'Handful of Gems', fallbackPrice: 'Rs 280' },
  { id: 'gems_medium',  kind: 'gems',    gems: 450,  consumable: true,  name: 'Pouch of Gems',   fallbackPrice: 'Rs 1,400', bonus: '+12%' },
  { id: 'gems_large',   kind: 'gems',    gems: 1000, consumable: true,  name: 'Chest of Gems',   fallbackPrice: 'Rs 2,800', bonus: '+25%' },
  { id: 'starter_pack', kind: 'starter', gems: 150,  consumable: false, name: 'Starter Pack',    fallbackPrice: 'Rs 280' },
  { id: 'remove_ads',   kind: 'noads',   gems: 0,    consumable: false, name: 'No-Ads Pass',     fallbackPrice: 'Rs 840' },
];
export const STARTER = { coins: 1000, item: 'gun_neon' };
export const NOADS_DAILY_GEMS = 10;
/** Swap gems for coins. */
export const EXCHANGE = [{ gems: 20, coins: 500 }, { gems: 60, coins: 1700 }, { gems: 150, coins: 4500 }];

// Daily spin wheel: weights decide how often each slice wins.
export interface SpinSlice { label: string; coins?: number; gems?: number; item?: boolean; weight: number; color: string }
export const SPIN: SpinSlice[] = [
  { label: '50',   coins: 50,  weight: 22, color: '#3557d4' },
  { label: '100',  coins: 100, weight: 20, color: '#7f43f0' },
  { label: '5',    gems: 5,    weight: 14, color: '#ec2f45' },
  { label: '200',  coins: 200, weight: 14, color: '#3fb52b' },
  { label: 'ITEM', item: true, weight: 6,  color: '#ffb300' },
  { label: '300',  coins: 300, weight: 10, color: '#2a7ff0' },
  { label: '15',   gems: 15,   weight: 9,  color: '#c81f8a' },
  { label: '40',   gems: 40,   weight: 5,  color: '#0b1240' },
];
export const SPIN_AD_EXTRA = 2;   // extra spins per day by watching an ad

// ---------- Firebase (Sprint 4) ----------
// Off until the Firebase project exists. Paste the Web app config from
// Firebase console → Project settings → Your apps → Web app, then set enabled: true.
export const FIREBASE = {
  enabled: false,
  config: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
  },
  functionsRegion: 'asia-south1',   // Mumbai, closest to Pakistan
  verifyPurchases: true,            // check Play purchases on the server once the function is deployed
};
export const APP_VERSION = '0.5.0';

// ---------- Online (Sprint 5) ----------
export const ONLINE = {
  enabled: false,                                     // switched on once online matches are built
  server: 'wss://laser-cage-server.onrender.com/play', // Render free plan, Singapore
  health: 'https://laser-cage-server.onrender.com/health',
};
