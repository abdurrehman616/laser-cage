// End-to-end test of the online server with simulated phones.
// Checks: matchmaking + bot fill, hidden players never leak, everyone sees the same result,
// speed/teleport cheats are blocked, disconnect + rejoin keeps your seat, a full lobby splits rooms.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 8123, URL = `ws://localhost:${PORT}/play`;
const srv = spawn('node', ['dist/index.js'], { env: { ...process.env, PORT: String(PORT), LOBBY_WAIT_MS: '1500' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', d => process.env.VERBOSE && process.stdout.write('[srv] ' + d));
srv.stderr.on('data', d => process.stdout.write('[srv err] ' + d));
await new Promise(r => setTimeout(r, 600));

const look = { outfit: 'fit_classic', hat: 'hat_none', hair: '#d8432a', gun: 'gun_classic', fx: 'fx_spark', dance: 'dance_hop' };
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

function sim(name, opts = {}) {
  return new Promise(resolve => {
    const s = { name, me: -1, token: '', seats: [], phase: '', leaks: 0, events: [], over: null, x: 0, z: 0, serverMe: null, maxJump: 0, rejoined: false, gotStart: 0 };
    let ws, mover = null, t0 = Date.now();
    const open = (rejoin) => {
      ws = new WebSocket(URL);
      ws.on('open', () => ws.send(JSON.stringify(rejoin ? { t: 'rejoin', v: 1, token: s.token } : { t: 'join', v: 1, name, color: opts.color ?? '#ff4d6d', rainbow: false, look })));
      ws.on('message', raw => {
        const m = JSON.parse(String(raw));
        if (m.t === 'start') { s.gotStart++; s.me = m.you; s.token = m.token; s.seats = m.seats; if (m.state) s.rejoined = true; }
        if (m.t === 'snap') {
          s.phase = m.ph;
          for (const p of m.ps) {
            if (m.ph === 'hide' && p.id !== s.me && p.al && p.x !== undefined) s.leaks++;
            if (p.id === s.me && p.x !== undefined) {
              if (s.serverMe) { const j = Math.hypot(p.x - s.serverMe.x, p.z - s.serverMe.z); if (j > 1.2 && process.env.DBG) console.log('JUMP', j.toFixed(2), m.ph, s.serverMe.ph, p.al, JSON.stringify(s.serverMe), p.x, p.z); s.maxJump = Math.max(s.maxJump, j); }
              s.serverMe = { x: p.x, z: p.z, ph: m.ph };
              if (m.ph !== 'hide') { s.x = p.x; s.z = p.z; }
            }
          }
        }
        if (m.t === 'ev') {
          s.events.push(m.e);
          if (m.e.type === 'phase' && m.e.phase === 'hide') startMoving();
          if (m.e.type === 'phase' && m.e.phase !== 'hide') stopMoving();
          if (m.e.type === 'over') { s.over = m.e; stopMoving(); ws.close(); resolve(s); }
          // drop mid-match and come back
          if (opts.dropAt && m.e.type === 'round' && m.e.round === opts.dropAt && !s.dropped) {
            s.dropped = true; stopMoving(); ws.close();
            setTimeout(() => open(true), 2000);
          }
        }
        if (m.t === 'error') { s.error = m.message; }
      });
    };
    function startMoving() {
      stopMoving();
      const dir = Math.random() * Math.PI * 2;
      mover = setInterval(() => {
        if (opts.cheat) { s.x += 3; }   // tries to teleport 3 units every 50 ms
        else { s.x += Math.cos(dir) * 3.0 * 0.05; s.z += Math.sin(dir) * 3.0 * 0.05; }
        ws.readyState === 1 && ws.send(JSON.stringify({ t: 'pos', x: s.x, z: s.z, a: Math.random() * 6.28 }));
      }, 50);
    }
    function stopMoving() { if (mover) clearInterval(mover); mover = null; }
    open(false);
    setTimeout(() => { stopMoving(); s.timeout = true; resolve(s); }, 150000);
  });
}

console.log('Test 1: three phones, one room, bots fill to 5, one cheater, one disconnect+rejoin');
const [a, b, c] = await Promise.all([sim('Alice'), sim('Bob', { color: '#ff4d6d', dropAt: 1 }), sim('Cheater', { cheat: true, color: '#5ef0c0' })]);
for (const s of [a, b, c]) {
  check(!s.timeout, `${s.name}: match never finished`);
  check(s.seats.length === 5, `${s.name}: expected 5 seats, got ${s.seats.length}`);
  check(s.leaks === 0, `${s.name}: saw ${s.leaks} hidden positions`);
}
check(new Set([a.me, b.me, c.me]).size === 3, 'players share a seat');
check(a.seats.filter(x => x.bot).length === 2, 'expected 2 bots');
const colors = a.seats.map(x => x.color); check(new Set(colors).size === colors.length, 'duplicate laser colours');
check(a.over?.winner === b.over?.winner && a.over?.winner === c.over?.winner, 'players disagree on the winner');
const fires = s => JSON.stringify(s.events.filter(e => e.type === 'fire').map(e => e.victims));
check(fires(a) === fires(c), 'players saw different hits');
check(c.maxJump < 1.2, `cheater moved ${c.maxJump.toFixed(2)} units between snapshots`);
check(b.rejoined && b.gotStart === 2, 'rejoin did not restore the seat');
console.log(`  winner seat ${a.over?.winner}, rounds ${a.events.filter(e => e.type === 'round').length}, cheater max step ${c.maxJump.toFixed(2)}, Bob rejoined: ${b.rejoined}`);

console.log('Test 2: seven phones at once -> a full room of 6 and a second room');
const seven = await Promise.all(Array.from({ length: 7 }, (_, i) => sim('P' + i, { color: ['#ff4d6d', '#ffb547', '#5ef0c0', '#7fb8ff', '#d58bff', '#ff8a4d', '#ff4d6d'][i] })));
const sizes = seven.map(s => s.seats.filter(x => !x.bot).length).sort();
check(sizes.filter(n => n === 6).length === 6 && sizes.includes(1), `room sizes wrong: ${sizes}`);
check(seven.every(s => !s.timeout && s.leaks === 0), 'a seven-phone match leaked or stalled');
console.log(`  humans per room seen by each phone: ${sizes.join(',')}`);

const res = await fetch(`http://localhost:${PORT}/health`).then(r => r.json());
console.log('  health:', JSON.stringify(res));
srv.kill();
console.log(fails.length ? 'FAILED:\n - ' + fails.join('\n - ') : 'ALL ONLINE TESTS PASSED');
process.exit(fails.length ? 1 : 0);
