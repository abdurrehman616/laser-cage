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
}

const KEY = 'lasercage.profile.v1';
const freeItems = () => ITEMS.filter(i => i.price === 0).map(i => i.id);

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

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ }
}

export function buy(id: string): 'ok' | 'owned' | 'poor' {
  const it = item(id);
  if (profile.owned.includes(id)) return 'owned';
  if (profile.coins < it.price) return 'poor';
  profile.coins -= it.price;
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
