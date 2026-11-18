// First-launch onboarding: four swipeable cards that teach a round, then pick a name, then the tutorial match.
// The pictures are drawn here as SVG: a hex arena seen from above with little blocky players.

const O = '#0b1240';
const SQ3 = Math.sqrt(3);

type Dot = { q: number; r: number; c: string; ghost?: boolean; me?: boolean; hit?: boolean; dx?: number; dy?: number };

function hexPath(cx: number, cy: number, R: number) {
  let d = '';
  for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; d += (i ? 'L' : 'M') + (cx + R * Math.cos(a)).toFixed(1) + ' ' + (cy + R * Math.sin(a)).toFixed(1); }
  return d + 'Z';
}
const pos = (q: number, r: number, S = 30) => ({ x: 150 + S * 1.5 * q, y: 150 + S * SQ3 * (r + q / 2) });
const ring = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

function arena(opts: { warn?: boolean; falling?: boolean }) {
  let s = `<path d="${hexPath(150, 150, 142)}" fill="#0b1240" opacity=".55"/>`;
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    const k = ring(q, r); if (k > 2) continue;
    const p = pos(q, r);
    const outer = k === 2;
    if (outer && opts.falling && (q + r * 3) % 2 === 0) {
      // a few outer tiles tumbling away
      s += `<g opacity=".45" transform="translate(${(p.x - 150) * 0.12} ${18}) rotate(${(q - r) * 9} ${p.x} ${p.y})"><path d="${hexPath(p.x, p.y, 25)}" fill="#ff6b9a" stroke="${O}" stroke-width="3"/></g>`;
      continue;
    }
    const fill = outer && (opts.warn || opts.falling) ? '#ff6b9a' : k === 0 ? '#7d89c9' : k === 1 ? '#6372b8' : '#4d5a9e';
    s += `<path d="${hexPath(p.x, p.y, 27)}" fill="${fill}" stroke="${O}" stroke-width="3"/>`;
    s += `<path d="${hexPath(p.x, p.y - 2, 21)}" fill="#fff" opacity=".08"/>`;
  }
  return s;
}

function player(d: Dot) {
  const p = pos(d.q, d.r), x = p.x + (d.dx ?? 0), y = p.y + (d.dy ?? 0);
  if (d.ghost) return `<g opacity=".8"><rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="7" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/>
    <text x="${x}" y="${y + 7}" text-anchor="middle" font-family="Lilita One, Impact, sans-serif" font-size="20" fill="#fff" stroke="${O}" stroke-width="4" paint-order="stroke">?</text></g>`;
  let s = `<rect x="${x - 14}" y="${y - 14}" width="28" height="28" rx="7" fill="${d.c}" stroke="${O}" stroke-width="4"/>
    <rect x="${x - 9}" y="${y - 10}" width="18" height="6" rx="3" fill="#fff" opacity=".35"/>
    <rect x="${x - 6}" y="${y - 2}" width="4" height="6" rx="1" fill="${O}"/><rect x="${x + 2}" y="${y - 2}" width="4" height="6" rx="1" fill="${O}"/>`;
  if (d.me) s = `<circle cx="${x}" cy="${y}" r="22" fill="none" stroke="#ffcf33" stroke-width="3.5"/>` + s;
  if (d.hit) s += `<path d="M${x - 16} ${y - 16}l32 32M${x + 16} ${y - 16}l-32 32" stroke="${O}" stroke-width="10" stroke-linecap="round"/><path d="M${x - 16} ${y - 16}l32 32M${x + 16} ${y - 16}l-32 32" stroke="#ff4d6d" stroke-width="5" stroke-linecap="round"/>`;
  return s;
}

function laser(from: { q: number; r: number; dx?: number; dy?: number }, to: { x: number; y: number }, c: string) {
  const p = pos(from.q, from.r), x = p.x + (from.dx ?? 0), y = p.y + (from.dy ?? 0);
  return `<line x1="${x}" y1="${y}" x2="${to.x}" y2="${to.y}" stroke="${c}" stroke-width="14" stroke-linecap="round" opacity=".3"/>
    <line x1="${x}" y1="${y}" x2="${to.x}" y2="${to.y}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${to.x}" cy="${to.y}" r="6" fill="#fff" stroke="${c}" stroke-width="3"/>`;
}

const svg = (body: string) => `<svg viewBox="0 0 300 300" aria-hidden="true">${body}</svg>`;
const P = { me: '#2a7ff0', a: '#ff4d6d', b: '#5ef0c0', c: '#ffcf33' };

const CARDS = [
  {
    step: 'STEP 1', title: 'REMEMBER', text: 'Each round starts with everyone in view. Remember where your rivals are standing!',
    art: () => svg(arena({}) + [{ q: 0, r: 0, c: P.me, me: true }, { q: 1, r: -2, c: P.a }, { q: -2, r: 1, c: P.b }, { q: 2, r: 0, c: P.c }].map(player).join('')),
  },
  {
    step: 'STEP 2', title: 'HIDE & AIM', text: 'Everyone vanishes. Move somewhere new, then aim where you think someone went.',
    art: () => {
      const t = pos(1, -1);
      return svg(arena({}) + [{ q: 1, r: -2, c: '', ghost: true }, { q: -2, r: 1, c: '', ghost: true }, { q: 2, r: 0, c: '', ghost: true }].map(player).join('')
        + laser({ q: -1, r: 0 }, { x: t.x + 6, y: t.y - 8 }, P.me) + player({ q: -1, r: 0, c: P.me, me: true })
        + `<path d="M150 150 L${pos(-1, 0).x + 18} ${pos(-1, 0).y + 4}" stroke="#fff" stroke-width="4" stroke-dasharray="2 7" stroke-linecap="round"/>`);
    },
  },
  {
    step: 'STEP 3', title: 'REVEAL!', text: 'At the lock everyone appears and every laser fires. Get hit and you’re out.',
    art: () => {
      const a = pos(1, -1), b = pos(-1, 2), c = pos(-2, 0); void c;
      return svg(arena({}) + laser({ q: -1, r: 0 }, { x: a.x, y: a.y }, P.me) + laser({ q: 2, r: 0 }, { x: b.x + 52, y: b.y + 4 }, P.c) + laser({ q: 1, r: -1 }, { x: c.x - 4, y: c.y - 30 }, P.a)
        + [{ q: 1, r: -1, c: P.a, hit: true }, { q: 2, r: 0, c: P.c }, { q: -1, r: 2, c: P.b }, { q: -1, r: 0, c: P.me, me: true }].map(player).join(''));
    },
  },
  {
    step: 'STEP 4', title: 'DON’T FALL', text: 'The pink outer ring drops after every round. Be the last one standing to win!',
    art: () => svg(arena({ falling: true }) + [{ q: 0, r: 0, c: P.me, me: true }, { q: 1, r: -1, c: P.b }].map(player).join('')),
  },
];

/** Shows the onboarding inside #onboard. Calls done(name) when the player taps PLAY on the last card. */
export function openOnboarding(defaultName: string, done: (name: string) => void, sounds: { click: () => void }) {
  const track = document.getElementById('obTrack')!, dots = document.getElementById('obDots')!, next = document.getElementById('obNext') as HTMLButtonElement;
  const total = CARDS.length + 1;
  track.innerHTML = '';
  const cards: HTMLElement[] = [];
  CARDS.forEach(c => {
    const el = document.createElement('div'); el.className = 'obcard';
    el.innerHTML = `<div class="art">${c.art()}</div><span class="step">${c.step}</span><h2>${c.title}</h2><p>${c.text}</p>`;
    track.appendChild(el); cards.push(el);
  });
  const last = document.createElement('div'); last.className = 'obcard';
  last.innerHTML = `<div class="art">${svg(arena({}) + player({ q: 0, r: 0, c: P.me, me: true }))}</div><span class="step">LAST STEP</span><h2>YOUR NAME</h2>
    <p>Other players see this in online matches.</p><input id="obName" class="namefield" type="text" maxlength="12" autocomplete="off" spellcheck="false" />`;
  track.appendChild(last); cards.push(last);
  const nameIn = last.querySelector('#obName') as HTMLInputElement; nameIn.value = defaultName;

  let i = 0;
  const paint = () => {
    cards.forEach((c, k) => { c.style.transform = `translateX(${(k - i) * 105}%)`; c.style.opacity = k === i ? '1' : '0'; c.style.pointerEvents = k === i ? 'auto' : 'none'; });
    dots.innerHTML = Array.from({ length: total }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    next.textContent = i === total - 1 ? "LET'S PLAY!" : 'NEXT';
    next.className = 'gbtn wide big ' + (i === total - 1 ? 'green' : 'yellow');
  };
  const go = (k: number) => { const n = Math.max(0, Math.min(total - 1, k)); if (n !== i) { i = n; sounds.click(); paint(); } };
  const finish = () => {
    const v = nameIn.value.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 12);
    done(v.length >= 3 ? v : defaultName);
  };
  next.onclick = () => { if (i === total - 1) { sounds.click(); finish(); } else go(i + 1); };
  (document.getElementById('obSkip') as HTMLButtonElement).onclick = () => { sounds.click(); if (i === total - 1) finish(); else { i = total - 1; paint(); } };

  // swipe left / right
  let sx = 0, sy = 0, down = false;
  track.onpointerdown = e => { if ((e.target as HTMLElement).tagName === 'INPUT') return; down = true; sx = e.clientX; sy = e.clientY; };
  track.onpointerup = e => {
    if (!down) return; down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1));
  };
  track.onpointercancel = () => (down = false);
  paint();
}
