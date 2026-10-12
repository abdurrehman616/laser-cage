// Headless check: play many all-bot matches and report how they end.
import { Match } from '../src/game/match';
import { NPC_OUTFITS } from '../src/config';
let rounds = 0, draws = 0, overs = 0, stuck = 0; const hows: Record<string, number> = {};
for (let g = 0; g < 300; g++) {
  const n = 2 + (g % 5);
  const seats = Array.from({ length: n }, (_, i) => ({ name: 'B' + i, color: '#f00', look: { outfit: NPC_OUTFITS[0], hat: 'hat_none', hair: '#000' }, human: false }));
  const m = new Match('bots', seats, (['easy', 'normal', 'hard'] as const)[g % 3]);
  // seat 0 acts as an idle "human" stand-in: make it human but never moves
  m.players[0].human = true; delete m.players[0].bot;
  m.start();
  let steps = 0;
  while (m.phase !== 'over' && steps < 20000) { m.update(1 / 30); steps++; }
  if (m.phase !== 'over') { stuck++; continue; }
  overs++; rounds += m.round; if (m.alive.length === 0) draws++;
  for (const p of m.players) if (!p.alive) hows[p.how!] = (hows[p.how!] || 0) + 1;
}
console.log({ overs, stuck, avgRounds: (rounds / overs).toFixed(2), draws, hows });
