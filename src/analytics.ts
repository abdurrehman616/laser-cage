// Game analytics and error reporting.
// Events go to Firebase Analytics when it's switched on; otherwise they're kept in memory
// (the last 50) so nothing is lost while testing.
import { APP_VERSION } from './config';
import { firebase, firebaseOn } from './firebase';

type Params = Record<string, string | number | boolean>;
const recent: { t: number; name: string; params: Params }[] = [];
let queue: { name: string; params: Params }[] = [];
let flushing = false;

export function track(name: string, params: Params = {}) {
  recent.push({ t: Date.now(), name, params }); if (recent.length > 50) recent.shift();
  if (!firebaseOn()) return;
  queue.push({ name, params }); flush();
}
async function flush() {
  if (flushing) return; flushing = true;
  const fb = await firebase();
  if (fb?.analytics) {
    for (const e of queue) { try { fb.anMod.logEvent(fb.analytics, e.name, { ...e.params, app_version: APP_VERSION }); } catch { /* ignore */ } }
    queue = [];
  } else if (queue.length > 100) queue = queue.slice(-100);
  flushing = false;
}
export const recentEvents = () => recent.slice();

// ---------- errors ----------
const ERR_KEY = 'lasercage.errors';
let sent = 0;
function remember(msg: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
    list.push(new Date().toISOString() + ' ' + msg); while (list.length > 20) list.shift();
    localStorage.setItem(ERR_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}
function report(msg: string, where: string) {
  remember(`${where}: ${msg}`);
  if (sent++ < 8) track('app_error', { message: msg.slice(0, 95), where: where.slice(0, 95) });
}
addEventListener('error', e => report(String(e.message || e.error), `${(e.filename || '').split('/').pop()}:${e.lineno}`));
addEventListener('unhandledrejection', e => report(String((e.reason && (e.reason.message || e.reason)) || 'rejection'), 'promise'));

/** A short text players can copy into a bug report. */
export function diagnostics(extra: Record<string, unknown> = {}) {
  let errors: string[] = [];
  try { errors = JSON.parse(localStorage.getItem(ERR_KEY) || '[]'); } catch { /* ignore */ }
  return [
    `Laser Cage ${APP_VERSION}`,
    `Device: ${navigator.userAgent}`,
    `Screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    `Recent errors (${errors.length}):`, ...errors.slice(-8),
    `Recent events:`, ...recent.slice(-10).map(e => `${new Date(e.t).toISOString().slice(11, 19)} ${e.name} ${JSON.stringify(e.params)}`),
  ].join('\n');
}
