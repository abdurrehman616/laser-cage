// Player profile saved on the device. Later this moves to a server (Firebase/PlayFab)
// so purchases can't be edited and progress survives reinstalling.
import { DEFAULT_EQUIP, ITEMS, Slot, item } from './config';

export interface Profile {
  v: 1;
  coins: number;
  owned: string[];
  equip: Record<Slot, string>;
  sound: boolean;
  vibrate: boolean;
  tutorialDone: boolean;
  swapSticks: boolean;          // false = move on the left, aim on the right
  gfx: 'auto' | 'high' | 'low';
  stats: { matches: number; wins: number; kills: number; bestRound: number };
}

const KEY = 'lasercage.profile.v1';

function fresh(): Profile {
  return {
    v: 1, coins: 150,
    owned: ITEMS.filter(i => i.price === 0).map(i => i.id),
    equip: { ...DEFAULT_EQUIP },
    sound: true, vibrate: true, tutorialDone: false, swapSticks: false, gfx: 'auto',
    stats: { matches: 0, wins: 0, kills: 0, bestRound: 0 },
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = { ...fresh(), ...JSON.parse(raw) } as Profile;
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

export function equip(id: string) {
  if (!profile.owned.includes(id)) return;
  profile.equip[item(id).slot] = id;
  save();
}

export function addCoins(n: number) { profile.coins += n; save(); }
