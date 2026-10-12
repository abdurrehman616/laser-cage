import { Match } from '../src/game/match';
import { NPC_OUTFITS } from '../src/config';
for (const diff of ['easy','normal','hard'] as const) for (const n of [4,6]) {
  let r1shot = 0, botsTotal = 0, idleShot = 0, games = 400;
  for (let g = 0; g < games; g++) {
    const seats = Array.from({ length: n }, (_, i) => ({ name: 'B' + i, color: '#f00', look: { outfit: NPC_OUTFITS[0], hat: 'hat_none', hair: '#000' }, human: false }));
    const m = new Match('bots', seats, diff);
    m.players[0].human = true; delete m.players[0].bot;
    m.start();
    while (m.phase !== 'fire' && m.phase !== 'over') m.update(1/30);
    const bots = m.players.slice(1); botsTotal += bots.length;
    r1shot += bots.filter(b => !b.alive).length; if (!m.players[0].alive) idleShot++;
  }
  console.log(diff, n, 'bot shot rate r1', (r1shot/botsTotal).toFixed(2), 'idle player shot r1', (idleShot/games).toFixed(2));
}
