// The rules of a match, with no drawing code. The renderer and UI only read this state,
// so the same rules can later run on the online game server.
import { ARENA, LASER, PLAYER, TIMING, Difficulty } from '../config';
import { Tile, buildTiles, ringAt, rayToCage } from './arena';
import { botAim, botPlanRound, botStep } from './bots';

export type Mode = 'bots';   // 'online' joins later, using these same rules on a server
export type Phase = 'intro' | 'hide' | 'lock' | 'fire' | 'drop' | 'over';

export interface Look { outfit: string; hat: string; hair: string }

export interface Player {
  id: number;
  name: string;
  color: string;        // laser colour
  rainbow: boolean;
  look: Look;
  human: boolean;       // controlled on this device
  x: number; z: number;
  aim: number;          // radians, 0 = +x, PI/2 = +z (towards camera)
  alive: boolean;
  how: 'shot' | 'fell' | null;
  killedBy: Player | null;
  kills: number;
  survived: number;     // last round survived
  diedAt: number;       // match clock when eliminated (for animations)
  target: { x: number; z: number } | null;
  seenX: number; seenZ: number;  // where everyone last saw this player
  // bot memory
  bot?: { foe: Player | null; wantAim: number; replan: number };
}

export interface Shot { from: Player; x: number; z: number; hit: Player | null }

export interface SeatSpec { name: string; color: string; rainbow?: boolean; look: Look; human: boolean }

export type MatchEvent =
  | { type: 'round'; round: number; final: boolean }
  | { type: 'phase'; phase: Phase }
  | { type: 'tick'; sec: number }
  | { type: 'lock' }
  | { type: 'fire'; shots: Shot[]; victims: Player[] }
  | { type: 'drop'; fell: Player[] }
  | { type: 'sudden'; level: number }
  | { type: 'over' };

export class Match {
  mode: Mode;
  diff: Difficulty;
  tiles: Tile[] = buildTiles();
  players: Player[] = [];
  ring = ARENA.rings;
  round = 0;
  phase: Phase = 'intro';
  t = 0; tt = 1;
  clock = 0;
  sudden = 0;
  shots: Shot[] = [];
  out: Player[][] = [];          // elimination groups in order
  private lastSec = 99;
  private listeners: ((e: MatchEvent) => void)[] = [];

  constructor(mode: Mode, seats: SeatSpec[], diff: Difficulty = 'normal') {
    this.mode = mode; this.diff = diff;
    const n = seats.length;
    seats.forEach((s, i) => {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / n;   // seat 0 starts nearest the camera
      let rad = 4.6, x = 0, z = 0;
      do { x = Math.cos(a) * rad; z = Math.sin(a) * rad; rad -= 0.2; } while (!this.onFloor(x, z));
      this.players.push({
        id: i, name: s.name, color: s.color, rainbow: !!s.rainbow, look: s.look, human: s.human,
        x, z, aim: Math.atan2(-z, -x), alive: true, how: null, killedBy: null, kills: 0, survived: 0, diedAt: 0,
        target: null, seenX: x, seenZ: z,
        bot: s.human ? undefined : { foe: null, wantAim: 0, replan: 0 },
      });
    });
  }

  on(fn: (e: MatchEvent) => void) { this.listeners.push(fn); }
  private emit(e: MatchEvent) { this.listeners.forEach(f => f(e)); }

  start() { this.nextRound(); }

  // ---------- queries ----------
  onFloor(x: number, z: number) { return ringAt(x, z) <= this.ring; }
  get alive() { return this.players.filter(p => p.alive); }
  get me() { return this.players[0]; }
  get final() { return this.ring <= ARENA.finalRing; }
  hitWidth() { return LASER.hitWidth + (this.final ? LASER.suddenDeathGrow * this.sudden : 0); }

  /** Players nobody may see right now. This is the heart of the hide-and-aim rule. */
  isHidden(p: Player): boolean { return this.phase === 'hide' && !p.human; }
  anyHidden() { return this.players.some(p => p.alive && this.isHidden(p)); }

  /** Who the local input controls right now, if anyone. */
  controlled(): Player | null { return this.phase === 'hide' && this.me?.alive ? this.me : null; }

  /** Where a laser ends. When `ghost` is set it ignores players, so its length never gives away a hidden player. */
  laserEnd(p: Player, ghost = false): { x: number; z: number; hit: Player | null } {
    const ox = p.x, oz = p.z;
    const dx = Math.cos(p.aim), dz = Math.sin(p.aim);
    let best: Player | null = null, bt = rayToCage(ox, oz, dx, dz);
    if (!ghost) {
      const hw = this.hitWidth();
      for (const o of this.players) {
        if (o === p || !o.alive) continue;
        const rx = o.x - ox, rz = o.z - oz, t = rx * dx + rz * dz;
        if (t <= 0 || t > bt) continue;
        if (Math.abs(rx * dz - rz * dx) < hw) { bt = t; best = o; }
      }
    }
    return { x: ox + dx * bt, z: oz + dz * bt, hit: best };
  }

  // ---------- commands from input ----------
  setTarget(x: number, z: number) { const p = this.controlled(); if (p && this.onFloor(x, z)) p.target = { x, z }; }
  setAim(a: number) { const p = this.controlled(); if (p) p.aim = a; }
  aimAtPoint(x: number, z: number) {
    const p = this.controlled(); if (!p) return;
    if (Math.hypot(x - p.x, z - p.z) > 0.2) p.aim = Math.atan2(z - p.z, x - p.x);
  }
  /** Joystick / keyboard movement. dx,dz is a world direction, mag 0..1. */
  nudge(dx: number, dz: number, dt: number, mag = 1) {
    const p = this.controlled(); if (!p) return;
    const step = PLAYER.speed * mag * dt;
    p.target = null; this.tryMove(p, dx * step, dz * step);
  }

  // ---------- flow ----------
  private setPhase(ph: Phase, t: number) { this.phase = ph; this.t = this.tt = t; this.lastSec = 99; this.emit({ type: 'phase', phase: ph }); }

  private nextRound() {
    this.round++; this.shots = [];
    for (const p of this.players) { p.target = null; p.seenX = p.x; p.seenZ = p.z; }
    this.setPhase('intro', TIMING.intro);
    this.emit({ type: 'round', round: this.round, final: this.final });
  }

  private doLock() { this.setPhase('lock', TIMING.lock); this.emit({ type: 'lock' }); }

  private doFire() {
    const victims = new Set<Player>();
    this.shots = this.alive.map(p => {
      const e = this.laserEnd(p);
      if (e.hit) { victims.add(e.hit); if (!e.hit.killedBy) e.hit.killedBy = p; p.kills++; }
      return { from: p, x: e.x, z: e.z, hit: e.hit };
    });
    for (const v of victims) { v.alive = false; v.how = 'shot'; v.diedAt = this.clock; }
    if (victims.size) this.out.push([...victims]);
    this.setPhase('fire', TIMING.fire);
    this.emit({ type: 'fire', shots: this.shots, victims: [...victims] });
  }

  private doDrop() {
    const fell: Player[] = [];
    if (!this.final) {
      for (const t of this.tiles) if (t.ring === this.ring) t.fall = 0.0001;
      this.ring--;
      for (const p of this.alive) if (!this.onFloor(p.x, p.z)) { p.alive = false; p.how = 'fell'; p.diedAt = this.clock; fell.push(p); }
      if (fell.length) this.out.push(fell);
      this.emit({ type: 'drop', fell });
    } else {
      this.sudden++;
      this.emit({ type: 'sudden', level: this.sudden });
    }
    for (const p of this.alive) p.survived = this.round;
    this.setPhase('drop', TIMING.drop);
  }

  private isOver() { return this.alive.length <= 1 || !this.me.alive; }
  private finish() { this.phase = 'over'; this.emit({ type: 'over' }); }

  /** Final placing for a player: 1 = winner. */
  placeOf(p: Player): number {
    if (p.alive) return 1;
    let after = 0;
    for (let i = this.out.length - 1; i >= 0; i--) { if (this.out[i].includes(p)) break; after += this.out[i].length; }
    return this.alive.length + after + 1;
  }

  // ---------- movement ----------
  tryMove(p: Player, mx: number, mz: number) {
    const nx = p.x + mx, nz = p.z + mz;
    if (this.onFloor(nx, nz)) { p.x = nx; p.z = nz; }
    else if (this.onFloor(p.x + mx, p.z)) p.x += mx;
    else if (this.onFloor(p.x, p.z + mz)) p.z += mz;
  }
  stepToward(p: Player, dt: number, spd: number) {
    if (!p.target) return;
    const dx = p.target.x - p.x, dz = p.target.z - p.z, L = Math.hypot(dx, dz);
    if (L < 0.03) return;
    const s = Math.min(L, spd * dt);
    this.tryMove(p, (dx / L) * s, (dz / L) * s);
  }

  // ---------- tick ----------
  update(dt: number) {
    this.clock += dt;
    for (const t of this.tiles) if (t.fall > 0 && t.fall < 1) t.fall = Math.min(1, t.fall + dt * 0.8);
    if (this.phase === 'over') return;
    this.t -= dt;
    const sec = Math.ceil(this.t);

    switch (this.phase) {
      case 'intro':
        if (this.t <= 0) {
          for (const b of this.alive) if (b.bot) botPlanRound(this, b);
          this.setPhase('hide', this.round === 1 ? TIMING.hideFirst : TIMING.hide);
        }
        break;
      case 'hide':
        if (this.me) this.stepToward(this.me, dt, PLAYER.speed);
        for (const b of this.alive) if (b.bot) { botStep(this, b, dt); this.stepToward(b, dt, PLAYER.speed * 0.92); botAim(this, b, dt); }
        // players may overlap while hidden: bumping into someone would reveal them
        if (sec <= 3 && sec > 0 && sec !== this.lastSec) { this.lastSec = sec; this.emit({ type: 'tick', sec }); }
        if (this.t <= 0) this.doLock();
        break;
      case 'lock':
        if (this.t <= 0) this.doFire();
        break;
      case 'fire':
        if (this.t <= 0) { if (this.isOver()) return this.finish(); this.doDrop(); }
        break;
      case 'drop':
        if (this.t <= 0) { if (this.isOver()) return this.finish(); this.nextRound(); }
        break;
    }
  }
}
