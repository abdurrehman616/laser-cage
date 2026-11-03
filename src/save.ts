// Player profile saved on the device. Later this moves to a server (Firebase/PlayFab)
// so purchases can't be edited and progress survives reinstalling.
import { DEFAULT_EQUIP, ITEMS, Slot, item } from './config';

export interface MissionState { id: string; progress: number; claimed: boolean }

export interface Profile {
  v: 1;
  coins: number;
  owned: string[];
  equip: Record<Slot, string>;
  sound: boolean;
  music: boolean;
  vibrate: boolean;
  tutorialDone: boolean;        // finished the guided first match
  swapSticks: boolean;          // false = move on the left, aim on the right
  gfx: 'auto' | 'high' | 'low';
  stats: { matches: number; wins: number; kills: number; bestRound: number };
  // progression (Sprint 2)
  level: number;
  xp: number;                   // XP into the current level
  arena: string;
  daily: { last: string; streak: number };          // last claim date (YYYY-MM-DD) and streak day 1..7
  missions: { date: string; list: MissionState[] };
  lastBots: number;
  lastDiff: 'easy' | 'normal' | 'hard';
  // monetization (Sprint 3)
  gems: number;
  noAds: boolean;               // bought the No-Ads Pass
  starterBought: boolean;
  ads: { date: string; count: number };              // rewarded ads watched today
  spin: { date: string; freeUsed: boolean; adSpins: number };
  noAdsGems: string;            // date the No-Ads daily gems were last given
  tokens: string[];             // purchase tokens already granted (avoid double rewards)
  // online (Sprint 5)
  name: string;
  online: { matches: number; wins: number };
}

const KEY = 'lasercage.profile.v1';
const freeItems = () => ITEMS.filter(i => i.price === 0 && !i.gems).map(i => i.id);

function fresh(): Profile {
  return {
    v: 1, coins: 150,
    owned: freeItems(),
    equip: { ...DEFAULT_EQUIP },
    sound: true, music: true, vibrate: true, tutorialDone: false, swapSticks: false, gfx: 'auto',
    stats: { matches: 0, wins: 0, kills: 0, bestRound: 0 },
    level: 1, xp: 0, arena: 'cage',
    daily: { last: '', streak: 0 },
    missions: { date: '', list: [] },
    lastBots: 3, lastDiff: 'normal',
    gems: 0, noAds: false, starterBought: false,
    ads: { date: '', count: 0 }, spin: { date: '', freeUsed: false, adSpins: 0 }, noAdsGems: '', tokens: [],
    name: 'Player' + Math.floor(1000 + Math.random() * 9000), online: { matches: 0, wins: 0 },
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const saved = JSON.parse(raw);
    const p = { ...fresh(), ...saved } as Profile;
    p.equip = { ...DEFAULT_EQUIP, ...(saved.equip || {}) };
    // players from older versions get every new free item
    for (const id of freeItems()) if (!p.owned.includes(id)) p.owned.push(id);
    // anyone who already played has learned the game; skip the guided match
    if (saved.v && saved.level === undefined && p.stats.matches > 0) p.tutorialDone = true;
    // guard against removed items
    for (const s of Object.keys(DEFAULT_EQUIP) as Slot[]) {
      if (!ITEMS.some(i => i.id === p.equip[s]) || !p.owned.includes(p.equip[s])) p.equip[s] = DEFAULT_EQUIP[s];
    }
    return p;
  } catch { return fresh(); }
}

export const profile: Profile = load();

const savedListeners: (() => void)[] = [];
/** Run something after every save (used for the cloud backup). */
export const onSaved = (f: () => void) => { savedListeners.push(f); };

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ }
  savedListeners.forEach(f => f());
}

/** Swap in a profile restored from the cloud, filling any fields an older save didn't have. */
export function replaceProfile(p: Partial<Profile>) {
  const base = fresh();
  const merged = { ...base, ...p, equip: { ...base.equip, ...(p.equip || {}) } } as Profile;
  for (const id of base.owned) if (!merged.owned.includes(id)) merged.owned.push(id);
  for (const k of Object.keys(profile) as (keyof Profile)[]) delete (profile as unknown as Record<string, unknown>)[k];
  Object.assign(profile, merged);
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function buy(id: string): 'ok' | 'owned' | 'poor' {
  const it = item(id);
  if (profile.owned.includes(id)) return 'owned';
  if (it.gems) {
    if (profile.gems < it.gems) return 'poor';
    profile.gems -= it.gems;
  } else {
    if (profile.coins < it.price) return 'poor';
    profile.coins -= it.price;
  }
  profile.owned.push(id);
  profile.equip[it.slot] = id;
  save();
  return 'ok';
}

export function grant(id: string) { if (!profile.owned.includes(id)) { profile.owned.push(id); save(); } }

export function equip(id: string) {
  if (!profile.owned.includes(id)) return;
  profile.equip[item(id).slot] = id;
  save();
}

export function addCoins(n: number) { profile.coins += n; save(); }

export function addGems(n: number) { profile.gems += n; save(); }
