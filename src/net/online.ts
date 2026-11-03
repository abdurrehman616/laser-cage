// The phone's side of an online match.
// The server runs the rules; here we keep a "mirror" Match in sync with it so the normal
// renderer, HUD and results screen work unchanged. Our own movement is applied instantly
// and sent to the server, which checks it.
import { ONLINE, arena as arenaById } from '../config';
import { Match, Player, Shot } from '../game/match';
import { ClientMsg, FullState, NetEvent, PROTOCOL, SeatInfo, ServerMsg } from './protocol';

export type OnlineStatus =
  | { kind: 'waking'; seconds: number }
  | { kind: 'connecting' }
  | { kind: 'queue'; players: number; max: number; startsIn: number }
  | { kind: 'reconnecting' }
  | { kind: 'error'; message: string };

export interface OnlineHooks {
  status(s: OnlineStatus): void;
  start(m: Match, resumed: boolean): void;
  lost(): void;                       // gave up reconnecting
  ping(ms: number): void;
}
export interface JoinInfo { name: string; color: string; rainbow: boolean; look: Player['look'] }

/** Server address; a browser test build can point elsewhere with ?server=ws://… */
function serverUrls() {
  const q = new URLSearchParams(location.search).get('server');
  if (q && !/capacitor|android/i.test(navigator.userAgent)) return { ws: q, health: q.replace(/^ws/, 'http').replace(/\/play$/, '/health') };
  return { ws: ONLINE.server, health: ONLINE.health };
}

export class OnlineSession {
  match: Match | null = null;
  private ws: WebSocket | null = null;
  private token = '';
  private byId = new Map<number, Player>();        // server player id -> mirror player
  private goal = new Map<Player, { x: number; z: number }>();
  private closedByUs = false;
  private over = false;
  private sendT = 0;
  private pingTimer = 0;
  private retry = 0;

  constructor(private join: JoinInfo, private hooks: OnlineHooks) {}

  async connect() {
    const urls = serverUrls();
    // The free server sleeps when nobody plays; the first visitor wakes it (up to ~1 minute).
    const t0 = Date.now();
    for (;;) {
      if (this.closedByUs) return;
      try {
        const r = await fetch(urls.health, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (r.ok) break;
      } catch { /* still waking */ }
      const s = Math.round((Date.now() - t0) / 1000);
      if (s > 90) { this.hooks.status({ kind: 'error', message: 'The online server isn\'t answering. Check your internet and try again.' }); return; }
      this.hooks.status({ kind: 'waking', seconds: s });
      await new Promise(r => setTimeout(r, 2500));
    }
    this.hooks.status({ kind: 'connecting' });
    this.open(false);
  }

  private open(rejoin: boolean) {
    const ws = new WebSocket(serverUrls().ws);
    this.ws = ws;
    ws.onopen = () => {
      this.send(rejoin ? { t: 'rejoin', v: PROTOCOL, token: this.token } : { t: 'join', v: PROTOCOL, ...this.join });
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), 3000);
    };
    ws.onmessage = ev => { try { this.onMsg(JSON.parse(String(ev.data))); } catch { /* bad message */ } };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.closedByUs || this.over) return;
      if (!this.match) { this.hooks.status({ kind: 'error', message: 'Lost connection to the server.' }); return; }
      // in a match: try to get our seat back for a few seconds
      if (this.retry++ < 5) { this.hooks.status({ kind: 'reconnecting' }); setTimeout(() => this.open(true), 2000); }
      else this.hooks.lost();
    };
  }

  private send(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  leave() {
    this.closedByUs = true;
    this.send({ t: 'leave' });
    clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  // ---------- incoming ----------
  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'queue': this.hooks.status({ kind: 'queue', players: m.players, max: m.max, startsIn: m.startsIn }); break;
      case 'start': this.onStart(m.you, m.token, m.arena, m.seats, m.state); break;
      case 'snap': this.onSnap(m); break;
      case 'ev': this.onEvent(m.e); break;
      case 'pong': this.hooks.ping(Math.round(performance.now() - m.at)); break;
      case 'error': this.hooks.status({ kind: 'error', message: m.message }); break;
    }
  }

  private onStart(you: number, token: string, arenaId: string, seats: SeatInfo[], state?: FullState) {
    this.token = token; this.retry = 0;
    if (this.match && state) { this.applyState(state); this.hooks.start(this.match, true); return; }
    // our seat goes first, so the mirror's "me" is us
    const order = [seats.find(s => s.id === you)!, ...seats.filter(s => s.id !== you)];
    const m = new Match('bots', order.map(s => ({ name: s.name, color: s.color, rainbow: s.rainbow, look: s.look, human: s.id === you })),
      { arena: arenaById(arenaId), online: true, mirror: true, diff: 'normal' });
    order.forEach((s, i) => this.byId.set(s.id, m.players[i]));
    this.match = m;
    if (state) this.applyState(state);
    this.hooks.start(m, false);
  }

  private applyState(s: FullState) {
    const m = this.match!;
    m.round = s.round; m.sudden = s.sudden; m.phase = s.phase; m.t = s.t; m.tt = s.tt;
    while (m.ring > s.ring) { for (const t of m.tiles) if (t.ring === m.ring) t.fall = 1; m.ring--; }
    for (const ps of s.players) {
      const p = this.byId.get(ps.id); if (!p) continue;
      p.alive = ps.alive; p.how = ps.how; p.kills = ps.kills; p.survived = ps.survived;
      p.killedBy = ps.killedBy !== null ? this.byId.get(ps.killedBy) ?? null : null;
      if (!p.alive) p.diedAt = m.clock - 5;
    }
    m.out = s.out.map(g => g.map(id => this.byId.get(id)!).filter(Boolean));
  }

  private onSnap(s: Extract<ServerMsg, { t: 'snap' }>) {
    const m = this.match; if (!m) return;
    m.t = s.tl; m.tt = s.tt;
    for (const ps of s.ps) {
      const p = this.byId.get(ps.id); if (!p || ps.x === undefined || ps.z === undefined) continue;
      if (p === m.me && m.phase === 'hide' && p.alive) {
        // our own position: trust the phone unless the server disagrees a lot (it blocked a move)
        if (Math.hypot(ps.x - p.x, ps.z - p.z) > 0.7) { p.x = ps.x; p.z = ps.z; p.target = null; }
        continue;
      }
      const g = this.goal.get(p);
      const first = !g || m.phase === 'lock' || m.phase === 'fire';
      this.goal.set(p, { x: ps.x, z: ps.z });
      if (first) { p.x = ps.x; p.z = ps.z; }
      if (ps.a !== undefined && p !== m.me) p.aim = ps.a;
      else if (ps.a !== undefined && m.phase !== 'hide') p.aim = ps.a;
    }
  }

  private onEvent(e: NetEvent) {
    const m = this.match; if (!m) return;
    const P = (id: number) => this.byId.get(id)!;
    switch (e.type) {
      case 'round':
        m.round = e.round; m.shots = [];
        for (const p of m.players) { p.target = null; p.seenX = p.x; p.seenZ = p.z; }
        if (e.final && m.me.alive) m.reachedFinal = true;
        m.emit({ type: 'round', round: e.round, final: e.final, meAlive: m.me.alive });
        break;
      case 'phase': m.phase = e.phase; m.emit(e); break;
      case 'tick': m.emit(e); break;
      case 'lock': m.phase = 'lock'; m.emit(e); break;
      case 'fire': {
        const shots: Shot[] = e.shots.map(s => ({ from: P(s.from), x: s.x, z: s.z, hit: s.hit !== null ? P(s.hit) : null }));
        const victims = e.victims.map(P);
        for (const s of shots) if (s.hit) { s.from.kills++; if (!s.hit.killedBy) s.hit.killedBy = s.from; }
        for (const v of victims) { v.alive = false; v.how = 'shot'; v.diedAt = m.clock; }
        if (victims.length) m.out.push(victims);
        m.shots = shots; m.phase = 'fire';
        m.emit({ type: 'fire', shots, victims });
        break;
      }
      case 'drop': {
        const fell = e.fell.map(P);
        if (!m.final) { for (const t of m.tiles) if (t.ring === m.ring) t.fall = 0.0001; m.ring--; }
        for (const p of fell) { p.alive = false; p.how = 'fell'; p.diedAt = m.clock; }
        if (fell.length) m.out.push(fell);
        for (const p of m.alive) p.survived = m.round;
        m.emit({ type: 'drop', fell });
        break;
      }
      case 'sudden': m.sudden = e.level; for (const p of m.alive) p.survived = m.round; m.emit(e); break;
      case 'over': this.over = true; m.phase = 'over'; m.emit({ type: 'over' }); this.leave(); break;
    }
  }

  // ---------- every frame ----------
  frame(dt: number) {
    const m = this.match; if (!m) return;
    // glide other players toward their latest server position
    const k = 1 - Math.exp(-dt * 14);
    for (const [p, g] of this.goal) if (p !== m.me || m.phase !== 'hide') { p.x += (g.x - p.x) * k; p.z += (g.z - p.z) * k; }
    // send our position and aim 20 times a second while hiding
    this.sendT -= dt;
    if (m.phase === 'hide' && m.me.alive && this.sendT <= 0) {
      this.sendT = 0.05;
      this.send({ t: 'pos', x: +m.me.x.toFixed(3), z: +m.me.z.toFixed(3), a: +m.me.aim.toFixed(3) });
    }
  }
}
