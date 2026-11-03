// Laser Cage online server.
// Runs the same match rules as the phone (src/game), but here the server is in charge:
// it moves the bots, checks every player's movement, fires the lasers and decides who's out.
// While players are hiding, nobody is ever sent another player's position.
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Match, Player, SeatSpec, acceptMove } from '../../../src/game/match';
import { ARENAS, BOT_NAMES, DEFAULT_EQUIP, HAIR_COLORS, ITEMS, NPC_OUTFITS, SEAT_COLORS } from '../../../src/config';
import { ClientMsg, FullState, NetEvent, PROTOCOL, PlayerSnap, SeatInfo, ServerMsg } from '../../../src/net/protocol';

const PORT = Number(process.env.PORT) || 8080;
const VERSION = '0.2.0';
const REGION = process.env.REGION || 'singapore';
const MAX_HUMANS = 6;          // per match
const FILL_TO = 5;             // bots fill the match up to this many players
const LOBBY_WAIT = Number(process.env.LOBBY_WAIT_MS) || 8000;   // how long to wait for more people
const AWAY_GRACE = 12000;      // a disconnected player keeps their seat this long before a bot takes over
const TICK = 1000 / 30;
const started = Date.now();

// ---------------- clients ----------------
interface Client {
  ws: WebSocket; id: string;
  name: string; color: string; rainbow: boolean; look: SeatSpec['look'];
  room: Room | null; seat: number;         // seat = player id inside the room's match
  lastPos: number; posCount: number; posWindow: number;
}
const clients = new Set<Client>();
const send = (c: Client | undefined, m: ServerMsg) => { if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)); };

const cleanName = (n: unknown) => {
  const s = String(n ?? '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 12);
  return s.length >= 3 ? s : 'Player' + Math.floor(1000 + Math.random() * 9000);
};
const validItem = (id: unknown, slot: string) => (typeof id === 'string' && ITEMS.some(i => i.id === id && i.slot === slot) ? id : (DEFAULT_EQUIP as Record<string, string>)[slot]);
function cleanLook(l: Partial<SeatSpec['look']> | undefined): SeatSpec['look'] {
  return {
    outfit: validItem(l?.outfit, 'outfit'), hat: validItem(l?.hat, 'hat'), gun: validItem(l?.gun, 'gun'),
    fx: validItem(l?.fx, 'fx'), dance: validItem(l?.dance, 'dance'),
    hair: typeof l?.hair === 'string' && /^#[0-9a-f]{6}$/i.test(l.hair) ? l.hair : HAIR_COLORS[0],
  };
}

// ---------------- rooms ----------------
interface Seat { client: Client | null; token: string; awaySince: number }
class Room {
  id = crypto.randomUUID().slice(0, 8);
  state: 'lobby' | 'playing' | 'done' = 'lobby';
  created = Date.now();
  lobby: Client[] = [];
  match: Match | null = null;
  seats = new Map<number, Seat>();          // player id -> seat (humans only)
  arena = ARENAS[Math.floor(Math.random() * ARENAS.length)];
  info: SeatInfo[] = [];
  tickN = 0;
  doneAt = 0;

  add(c: Client) { this.lobby.push(c); c.room = this; this.broadcastQueue(); if (this.lobby.length >= MAX_HUMANS) this.start(); }
  remove(c: Client) {
    if (this.state === 'lobby') { this.lobby = this.lobby.filter(x => x !== c); c.room = null; this.broadcastQueue(); return; }
    const seat = this.seats.get(c.seat);
    if (seat && seat.client === c) { seat.client = null; seat.awaySince = Date.now(); }
    c.room = null;
  }
  broadcastQueue() {
    const startsIn = Math.max(0, Math.ceil((this.created + LOBBY_WAIT - Date.now()) / 1000));
    for (const c of this.lobby) send(c, { t: 'queue', players: this.lobby.length, max: MAX_HUMANS, startsIn });
  }

  start() {
    if (this.state !== 'lobby') return;
    this.state = 'playing';
    if (waiting === this) waiting = null;
    const used = new Set<string>(), names = new Set(this.lobby.map(c => c.name.toLowerCase()));
    const seats: SeatSpec[] = this.lobby.map(c => {
      let color = c.color;
      if (used.has(color.toLowerCase()) || !/^#[0-9a-f]{6}$/i.test(color)) color = SEAT_COLORS.find(x => !used.has(x.toLowerCase()))!;
      used.add(color.toLowerCase());
      return { name: c.name, color, rainbow: c.rainbow, look: c.look, human: true };
    });
    const botNames = BOT_NAMES.filter(n => !names.has(n.toLowerCase())).sort(() => Math.random() - 0.5);
    while (seats.length < FILL_TO) {
      const color = SEAT_COLORS.find(x => !used.has(x.toLowerCase())) ?? SEAT_COLORS[seats.length % SEAT_COLORS.length];
      used.add(color.toLowerCase());
      seats.push({ name: botNames.pop() ?? 'Bot', color, human: false,
        look: { outfit: NPC_OUTFITS[Math.floor(Math.random() * NPC_OUTFITS.length)], hat: 'hat_none', hair: HAIR_COLORS[seats.length % HAIR_COLORS.length], gun: 'gun_classic', fx: 'fx_spark', dance: 'dance_hop' } });
    }
    const m = new Match('bots', seats, { diff: 'normal', arena: this.arena, online: true });
    this.match = m;
    this.info = m.players.map(p => ({ id: p.id, name: p.name, color: p.color, rainbow: p.rainbow, look: p.look, bot: !p.human }));
    this.lobby.forEach((c, i) => {
      const token = crypto.randomBytes(16).toString('hex');
      c.seat = i; this.seats.set(i, { client: c, token, awaySince: 0 }); tokens.set(token, { room: this, seat: i });
      send(c, { t: 'start', you: i, token, arena: this.arena.id, seats: this.info });
    });
    this.lobby = [];
    m.on(e => this.forward(e));
    m.start();
    console.log(`room ${this.id} started: ${this.seats.size} players + ${m.players.length - this.seats.size} bots on ${this.arena.id}`);
  }

  forward(e: import('../../../src/game/match').MatchEvent) {
    let ne: NetEvent;
    switch (e.type) {
      case 'round': ne = { type: 'round', round: e.round, final: e.final }; break;
      case 'fire': ne = { type: 'fire', shots: e.shots.map(s => ({ from: s.from.id, x: s.x, z: s.z, hit: s.hit ? s.hit.id : null })), victims: e.victims.map(v => v.id) }; break;
      case 'drop': ne = { type: 'drop', fell: e.fell.map(p => p.id) }; break;
      case 'over': { const w = this.match!.alive; ne = { type: 'over', winner: w.length === 1 ? w[0].id : null }; this.state = 'done'; this.doneAt = Date.now(); break; }
      default: ne = e as NetEvent;
    }
    // positions at the lock are sent first, so everyone sees the same lasers as the server
    if (e.type === 'lock' || e.type === 'fire' || (e.type === 'phase' && (e.phase === 'lock' || e.phase === 'fire'))) this.snapshot();
    for (const s of this.seats.values()) send(s.client ?? undefined, { t: 'ev', e: ne });
  }

  /** Per-player view of the match. While hiding, you only get your own position. */
  snapshot() {
    const m = this.match!; const hiding = m.phase === 'hide';
    for (const [id, s] of this.seats) {
      if (!s.client) continue;
      const ps: PlayerSnap[] = m.players.map(p => (hiding && p.id !== id && p.alive)
        ? { id: p.id, al: p.alive }
        : { id: p.id, x: +p.x.toFixed(3), z: +p.z.toFixed(3), a: +p.aim.toFixed(3), al: p.alive });
      send(s.client, { t: 'snap', ph: m.phase, tl: +m.t.toFixed(3), tt: m.tt, ps });
    }
  }

  fullState(): FullState {
    const m = this.match!;
    return {
      round: m.round, ring: m.ring, sudden: m.sudden, phase: m.phase, t: m.t, tt: m.tt,
      players: m.players.map(p => ({ id: p.id, alive: p.alive, how: p.how, kills: p.kills, survived: p.survived, killedBy: p.killedBy ? p.killedBy.id : null })),
      out: m.out.map(g => g.map(p => p.id)),
    };
  }

  tick(dt: number) {
    if (this.state === 'lobby') {
      if (Date.now() - this.created >= LOBBY_WAIT && this.lobby.length) this.start();
      else if (++this.tickN % 30 === 0) this.broadcastQueue();
      return;
    }
    if (!this.match) return;
    const m = this.match;
    // players who stayed away too long are handed to a bot
    for (const [id, s] of this.seats) {
      const p = m.players[id];
      if (!s.client && s.awaySince && p.human && Date.now() - s.awaySince > AWAY_GRACE) {
        p.human = false; p.bot = { foe: null, wantAim: p.aim, replan: 99 }; p.target = null;
      }
    }
    if (this.state === 'playing') m.update(dt);
    if (++this.tickN % 2 === 0 && m.phase !== 'over') this.snapshot();
  }
  get humansConnected() { return [...this.seats.values()].filter(s => s.client).length; }
}

const rooms = new Set<Room>();
const tokens = new Map<string, { room: Room; seat: number }>();
let waiting: Room | null = null;

function matchmake(c: Client) {
  if (!waiting || waiting.state !== 'lobby') { waiting = new Room(); rooms.add(waiting); }
  waiting.add(c);
}

// ---------------- messages ----------------
function onMessage(c: Client, raw: string) {
  let m: ClientMsg;
  try { m = JSON.parse(raw); } catch { return; }
  switch (m.t) {
    case 'ping': send(c, { t: 'pong', at: m.at }); break;
    case 'join': {
      if (m.v !== PROTOCOL) { send(c, { t: 'error', message: 'Please update the game to play online.' }); return; }
      if (c.room) return;
      c.name = cleanName(m.name); c.color = String(m.color ?? '').slice(0, 7); c.rainbow = !!m.rainbow; c.look = cleanLook(m.look);
      matchmake(c);
      break;
    }
    case 'rejoin': {
      const t = tokens.get(String(m.token));
      if (!t || t.room.state === 'done' || !t.room.match) { send(c, { t: 'error', message: 'That match has ended.' }); return; }
      const seat = t.room.seats.get(t.seat)!;
      if (seat.client && seat.client !== c) seat.client.ws.close();
      seat.client = c; seat.awaySince = 0; c.room = t.room; c.seat = t.seat;
      const p = t.room.match.players[t.seat];
      if (!p.human && p.alive) { p.human = true; p.bot = undefined; }   // take your seat back from the bot
      send(c, { t: 'start', you: t.seat, token: String(m.token), arena: t.room.arena.id, seats: t.room.info, state: t.room.fullState() });
      break;
    }
    case 'pos': {
      const r = c.room; if (!r?.match || r.state !== 'playing') return;
      const now = Date.now();
      if (now - c.posWindow > 1000) { c.posWindow = now; c.posCount = 0; }
      if (++c.posCount > 40) return;                       // more than 40 updates a second: ignore
      const p = r.match.players[c.seat]; if (!p?.human) return;
      // one message can never claim more than 0.15 s of walking, so a pause can't be saved up for a teleport
      const dt = Math.min(0.15, Math.max(0.02, (now - (c.lastPos || now - 50)) / 1000)); c.lastPos = now;
      acceptMove(r.match, p, Number(m.x), Number(m.z), dt);
      if (r.match.phase === 'hide' && p.alive && Number.isFinite(m.a)) p.aim = Number(m.a);
      break;
    }
    case 'leave': c.room?.remove(c); break;
  }
}

// ---------------- server ----------------
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, game: 'laser-cage', version: VERSION, protocol: PROTOCOL, region: REGION,
      players: clients.size, rooms: [...rooms].filter(r => r.state === 'playing').length, uptimeSec: Math.round((Date.now() - started) / 1000) }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, path: '/play', maxPayload: 8 * 1024 });
wss.on('connection', ws => {
  const c: Client = { ws, id: crypto.randomUUID(), name: 'Player', color: SEAT_COLORS[0], rainbow: false, look: cleanLook(undefined), room: null, seat: -1, lastPos: 0, posCount: 0, posWindow: 0 };
  clients.add(c);
  send(c, { t: 'hello', v: PROTOCOL, online: true, region: REGION });
  ws.on('message', raw => onMessage(c, String(raw)));
  ws.on('close', () => { clients.delete(c); c.room?.remove(c); });
  ws.on('error', () => ws.close());
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const r of rooms) {
    r.tick(dt);
    const empty = r.state !== 'lobby' && r.humansConnected === 0 && [...r.seats.values()].every(s => !s.awaySince || now - s.awaySince > AWAY_GRACE);
    if ((r.state === 'done' && now - r.doneAt > 15000) || empty) {
      for (const [tok, v] of tokens) if (v.room === r) tokens.delete(tok);
      rooms.delete(r); if (waiting === r) waiting = null;
    }
  }
}, TICK);

server.listen(PORT, () => console.log(`Laser Cage server ${VERSION} listening on ${PORT}`));
export { server, rooms };
