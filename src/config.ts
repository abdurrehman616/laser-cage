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
export type Slot = 'laser' | 'outfit' | 'hat' | 'floor';

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
}

export const ITEMS: Item[] = [
  // Lasers
  { id: 'laser_crimson', slot: 'laser', name: 'Crimson', price: 0, color: '#ff4d6d' },
  { id: 'laser_amber',   slot: 'laser', name: 'Amber',   price: 0, color: '#ffb547' },
  { id: 'laser_mint',    slot: 'laser', name: 'Mint',    price: 200, color: '#5ef0c0' },
  { id: 'laser_ice',     slot: 'laser', name: 'Ice',     price: 200, color: '#7fb8ff' },
  { id: 'laser_plasma',  slot: 'laser', name: 'Plasma',  price: 500, color: '#e3a2ff' },
  { id: 'laser_solar',   slot: 'laser', name: 'Solar',   price: 800, color: '#fff27a' },
  { id: 'laser_rainbow', slot: 'laser', name: 'Rainbow', price: 1500, color: '#ffffff', rainbow: true, premium: true },
  // Outfits
  { id: 'fit_classic',   slot: 'outfit', name: 'Classic',   price: 0,    shirt: '#2f5fb3', pants: '#1f3554', trim: '#ffffff' },
  { id: 'fit_desert',    slot: 'outfit', name: 'Desert',    price: 300,  shirt: '#c79a5b', pants: '#6b5232', trim: '#3b2d1c' },
  { id: 'fit_ninja',     slot: 'outfit', name: 'Ninja',     price: 500,  shirt: '#1b1d22', pants: '#111216', trim: '#d6334f' },
  { id: 'fit_cricket',   slot: 'outfit', name: 'Cricket Whites', price: 600, shirt: '#f2f2ec', pants: '#e4e4dc', trim: '#1a7a3c' },
  { id: 'fit_astro',     slot: 'outfit', name: 'Astronaut', price: 1000, shirt: '#e8ecf0', pants: '#b9c2cb', trim: '#ff8a2a', premium: true },
  // Hats
  { id: 'hat_none',  slot: 'hat', name: 'No hat',   price: 0,    hat: 'none' },
  { id: 'hat_cap',   slot: 'hat', name: 'Cap',      price: 250,  hat: 'cap', hatColor: '#d6334f' },
  { id: 'hat_band',  slot: 'hat', name: 'Headband', price: 300,  hat: 'band', hatColor: '#ffb547' },
  { id: 'hat_helmet',slot: 'hat', name: 'Helmet',   price: 700,  hat: 'helmet', hatColor: '#3d4a55' },
  { id: 'hat_crown', slot: 'hat', name: 'Crown',    price: 1200, hat: 'crown', hatColor: '#ffd23f', premium: true },
  // Floors
  { id: 'floor_steel', slot: 'floor', name: 'Steel Mesh', price: 0,    floor: { base: '#7d8a92', inner: '#aab4ba', mesh: '#24323a' } },
  { id: 'floor_lava',  slot: 'floor', name: 'Lava Rock',  price: 800,  floor: { base: '#3b2622', inner: '#57352c', mesh: '#ff5a1f', glow: '#ff5a1f' } },
  { id: 'floor_ice',   slot: 'floor', name: 'Ice Sheet',  price: 800,  floor: { base: '#9fd3e8', inner: '#d4f0fa', mesh: '#5a9bb8' } },
  { id: 'floor_neon',  slot: 'floor', name: 'Neon Grid',  price: 1200, floor: { base: '#12121f', inner: '#1c1c33', mesh: '#d55bff', glow: '#d55bff' }, premium: true },
];

export const DEFAULT_EQUIP: Record<Slot, string> = {
  laser: 'laser_crimson', outfit: 'fit_classic', hat: 'hat_none', floor: 'floor_steel',
};

export const item = (id: string) => ITEMS.find(i => i.id === id)!;

// Looks for computer players
export const NPC_OUTFITS = ['fit_classic', 'fit_desert', 'fit_ninja', 'fit_cricket'];
export const HAIR_COLORS = ['#d8432a', '#e09a3a', '#3a2a20', '#f2d86c', '#7a4bd1', '#2fb3a5'];
