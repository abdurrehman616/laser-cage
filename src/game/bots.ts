// Computer players. They follow the same rule as you: during the hide phase they can't see
// anyone, so they only know where players stood when the round started.
import { BOT_DIFFICULTY, PLAYER, TIMING } from '../config';
import type { Match, Player } from './match';
import { ringAt } from './arena';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Guess where a foe will end up, from where they were last seen. */
function predict(m: Match, foe: Player, guess: number) {
  // people tend to step off their start spot and away from the ring that's about to drop
  const toCentre = Math.hypot(foe.seenX, foe.seenZ) || 1;
  const inward = !m.final && Math.hypot(foe.seenX, foe.seenZ) > m.ring * 1.3 ? 1 : 0.3;
  let x = foe.seenX - (foe.seenX / toCentre) * 1.2 * inward * guess;
  let z = foe.seenZ - (foe.seenZ / toCentre) * 1.2 * inward * guess;
  x += rand(-1, 1) * 1.4 * (1 - guess * 0.6);
  z += rand(-1, 1) * 1.4 * (1 - guess * 0.6);
  return { x, z };
}

/** Called once when the hide phase starts. */
export function botPlanRound(m: Match, b: Player) {
  const d = BOT_DIFFICULTY[m.diff];
  const foes = m.alive.filter(p => p !== b);
  if (!foes.length || !b.bot) return;

  // pick a target: usually the nearest, sometimes the human
  foes.sort((p, q) => Math.hypot(p.seenX - b.x, p.seenZ - b.z) - Math.hypot(q.seenX - b.x, q.seenZ - b.z));
  const human = foes.find(p => p.human);
  b.bot.foe = human && Math.random() < 0.4 ? human : foes[0];
  const g = predict(m, b.bot.foe, d.guess);

  // pick where to stand: off the lines others could aim along, away from the dropping ring
  const reach = PLAYER.speed * TIMING.hide * 0.55;
  let best = { x: b.x, z: b.z }, bs = Infinity;
  for (let i = 0; i < 24; i++) {
    const a = rand(0, Math.PI * 2), r = i === 0 ? 0 : rand(0.6, reach);
    const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
    if (!m.onFloor(x, z)) continue;
    let s = rand(0, 2.2) * (1.2 - d.dodge);
    for (const f of foes) {
      // how close is this spot to the line from the foe to my start spot (where they'd aim)?
      const lx = b.seenX - f.seenX, lz = b.seenZ - f.seenZ, L = Math.hypot(lx, lz) || 1;
      const px = x - f.seenX, pz = z - f.seenZ;
      const off = Math.abs(px * lz - pz * lx) / L;
      s += Math.max(0, 1.6 - off) * 2 * d.dodge;
    }
    if (!m.final && ringAt(x, z) >= m.ring) s += 6 * d.edgeFear;   // this ring is about to fall
    if (s < bs) { bs = s; best = { x, z }; }
  }
  b.target = best;
  b.bot.wantAim = Math.atan2(g.z - best.z, g.x - best.x) + rand(-1, 1) * d.noise;
  b.bot.replan = rand(1.5, 3);
}

/** Small mid-round adjustments so bots don't look robotic. */
export function botStep(m: Match, b: Player, dt: number) {
  if (!b.bot) return;
  b.bot.replan -= dt;
  if (b.bot.replan <= 0 && m.t > 1.2) {
    b.bot.replan = 99;
    if (Math.random() < 0.35 && b.target) {
      const x = b.target.x + rand(-0.8, 0.8), z = b.target.z + rand(-0.8, 0.8);
      if (m.onFloor(x, z)) b.target = { x, z };
    }
  }
}

export function botAim(m: Match, b: Player, dt: number) {
  if (!b.bot) return;
  const d = BOT_DIFFICULTY[m.diff];
  const da = ((b.bot.wantAim - b.aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  b.aim += Math.max(-d.turn * dt, Math.min(d.turn * dt, da));
}
