// Hex floor maths. Tiles are pointy-top hexes of size 1 laid out in axial coordinates.
import { ARENA } from '../config';

export interface Tile { q: number; r: number; x: number; z: number; ring: number; fall: number }

const SQ3 = Math.sqrt(3);

export function buildTiles(rings = ARENA.rings): Tile[] {
  const out: Tile[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      out.push({ q, r, x: SQ3 * (q + r / 2), z: 1.5 * r, ring: (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2, fall: 0 });
    }
  }
  return out;
}

/** Which ring of the hex grid a world point is on (0 = centre tile). */
export function ringAt(x: number, z: number): number {
  const q = x / SQ3 - z / 3, r = (2 * z) / 3, s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs; else rs = -rq - rr;
  return (Math.abs(rq) + Math.abs(rr) + Math.abs(rs)) / 2;
}

/** Octagon corner points of the cage, matching the fence the renderer draws. */
export function cageCorners(radius = ARENA.cageRadius): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

/** Distance along a ray from (x,z) in direction (dx,dz) to the inside of the cage fence. */
export function rayToCage(x: number, z: number, dx: number, dz: number): number {
  const pts = cageCorners(ARENA.cageRadius - 0.15);
  let best = 50;
  for (let i = 0; i < 8; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 8];
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - x) * ez - (az - z) * ex) / den;
    const u = ((ax - x) * dz - (az - z) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
