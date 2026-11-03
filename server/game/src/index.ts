// Laser Cage online server (first version).
// Right now it only answers health checks and accepts connections so the hosting can be set up;
// matchmaking and online matches are added in Sprint 5 on top of this.
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 8080;
const VERSION = '0.1.0';
const started = Date.now();

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, game: 'laser-cage', version: VERSION, players: wss.clients.size, uptimeSec: Math.round((Date.now() - started) / 1000) }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, path: '/play', maxPayload: 16 * 1024 });
wss.on('connection', (ws: WebSocket) => {
  ws.send(JSON.stringify({ t: 'hello', version: VERSION, online: false, message: 'Online matches are coming soon.' }));
  ws.on('message', raw => {
    let msg: { t?: string } = {};
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: Date.now() }));
  });
});

server.listen(PORT, () => console.log(`Laser Cage server ${VERSION} listening on ${PORT}`));
