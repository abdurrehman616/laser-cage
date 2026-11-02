// Levels, daily login rewards and daily missions. All saved in the profile on the phone.
import { ARENAS, DAILY_REWARDS, ITEMS, MAX_LEVEL, MISSION_POOL, MissionKind, XP, levelCoins, xpToNext, Difficulty } from './config';
import { profile, save, grant } from './save';

// ---------- dates (local time) ----------
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return today(d); }

// ---------- levels ----------
export interface LevelUp { level: number; coins: number; unlocks: string[] }   // unlock names for the UI

const DIFF_XP: Record<Difficulty, number> = { easy: 1, normal: 1.25, hard: 1.5 };

export function matchXp(o: { rounds: number; kills: number; won: boolean; diff: Difficulty }) {
  return Math.round((XP.perMatch + XP.perRound * o.rounds + XP.perKill * o.kills + (o.won ? XP.win : 0)) * DIFF_XP[o.diff]);
}

/** Adds XP and returns every level gained (with its rewards already paid out). */
export function addXp(amount: number): LevelUp[] {
  const ups: LevelUp[] = [];
  profile.xp += amount;
  while (profile.level < MAX_LEVEL && profile.xp >= xpToNext(profile.level)) {
    profile.xp -= xpToNext(profile.level);
    profile.level++;
    const coins = levelCoins(profile.level);
    profile.coins += coins;
    const unlocks: string[] = [];
    for (const it of ITEMS) if (it.unlockLevel === profile.level) { grant(it.id); unlocks.push(it.name); }
    for (const a of ARENAS) if (a.unlockLevel === profile.level) unlocks.push(a.name + ' arena');
    ups.push({ level: profile.level, coins, unlocks });
  }
  if (profile.level >= MAX_LEVEL) profile.xp = 0;
  save();
  return ups;
}

/** What you get at the next few levels, for the home screen hint. */
export function nextUnlock(): { level: number; name: string } | null {
  const list = [
    ...ITEMS.filter(i => i.unlockLevel && i.unlockLevel > profile.level).map(i => ({ level: i.unlockLevel!, name: i.name })),
    ...ARENAS.filter(a => a.unlockLevel > profile.level).map(a => ({ level: a.unlockLevel, name: a.name })),
  ].sort((a, b) => a.level - b.level);
  return list[0] ?? null;
}

export const arenaUnlocked = (id: string) => (ARENAS.find(a => a.id === id)?.unlockLevel ?? 99) <= profile.level;

// ---------- daily login reward ----------
/** Which streak day (1..7) you'd claim today, or 0 if already claimed. */
export function dailyAvailable(): number {
  const t = today();
  if (profile.daily.last === t) return 0;
  const continuing = profile.daily.last === yesterday();
  return continuing ? (profile.daily.streak % 7) + 1 : 1;
}
export function claimDaily(): number {
  const day = dailyAvailable(); if (!day) return 0;
  const coins = DAILY_REWARDS[day - 1];
  profile.daily = { last: today(), streak: day };
  profile.coins += coins;
  save();
  return coins;
}

// ---------- daily missions ----------
function seededPick(seed: string, n: number) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const pool = [...MISSION_POOL];
  const out: typeof MISSION_POOL = [];
  const kinds = new Set<MissionKind>();
  while (out.length < n && pool.length) {
    const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (kinds.has(m.kind)) continue;          // three different kinds of task each day
    kinds.add(m.kind); out.push(m);
  }
  return out;
}

/** Today's three missions (new set every day). */
export function missions() {
  const t = today();
  if (profile.missions.date !== t) {
    profile.missions = { date: t, list: seededPick(t + ':' + profile.level, 3).map(m => ({ id: m.id, progress: 0, claimed: false })) };
    save();
  }
  return profile.missions.list.map(s => ({ ...s, def: MISSION_POOL.find(m => m.id === s.id)! })).filter(s => s.def);
}
export const missionsReady = () => missions().filter(m => !m.claimed && m.progress >= m.def.goal).length;

/** Feed a finished match into today's missions. Returns names of missions that just became complete. */
export function trackMatch(o: { won: boolean; kills: number; rounds: number; diff: Difficulty; reachedFinal: boolean; bots: number }): string[] {
  const done: string[] = [];
  for (const m of missions()) {
    const s = profile.missions.list.find(x => x.id === m.id)!;
    const before = s.progress;
    const add: Record<MissionKind, number> = {
      play: 1, win: o.won ? 1 : 0, hits: o.kills, rounds: o.rounds,
      hardWin: o.won && o.diff === 'hard' ? 1 : 0, final: o.reachedFinal ? 1 : 0, bots5: o.bots >= 5 ? 1 : 0,
    };
    s.progress = Math.min(m.def.goal, s.progress + add[m.def.kind]);
    if (before < m.def.goal && s.progress >= m.def.goal) done.push(m.def.text);
  }
  save();
  return done;
}
export function claimMission(id: string): number {
  const m = missions().find(x => x.id === id);
  if (!m || m.claimed || m.progress < m.def.goal) return 0;
  profile.missions.list.find(x => x.id === id)!.claimed = true;
  profile.coins += m.def.reward;
  save();
  return m.def.reward;
}
