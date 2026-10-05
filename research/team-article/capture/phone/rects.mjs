// Element geometry for the phone clip scenes (T-170 #101 / T-183, lead's plan 2026-10-05 05:3xZ): numbers only.
// Attaches once to the open Safari tab served on --port (phone inside the runner's own hold, or the Simulator inside a
// functional session), reads every scene element's document rect at the top, then scrolls (instant) to put each crop
// element where its scene parks it and reads its viewport rect there, plus the viewport facts (innerHeight,
// visualViewport, screenY/screenTop, docH). Never views or writes a frame; never prints the page URL (Hard rule 12).
//   node research/team-article/capture/phone/rects.mjs --port <serve port> --out <file.json> [--label A] [--sweep] [--watch]
// --sweep: the hero cards' opacity and box at scroll 0..1600 (step 100); --watch: at each WATCH element's park position,
// the times (ms) its class or image changes by itself over 10 s at rest (the carousel's period). Numbers only.
import { writeFileSync } from 'node:fs';
import { openTab, urlHost, sleep } from '../../../../tools/lib/wip.mjs';

export const SELECTORS = {
  nav: 'header.start-selling-top-nav',
  hero: '.hero-track',
  cards: '.mobile-deck .orbit-card',
  countdown: '.hero-copy .countdown',
  title: '#future-heading',
  showcase: '#profile-showcase',
  showcaseSticky: '#profile-showcase .start-selling-profile-sticky',
  avatars: '.start-selling-avatars.is-carousel',
  communityPill: '.start-selling-future-community-pill',
  peopleO: '.start-selling-future-people-o',
  credRows: '.start-selling-platform-cred-row',
  pain: 'section.pain',
  platform: '#platform',
};
// where each crop scene parks its element: the element's top at this fraction of the viewport height
export const PARK = { countdown: null, title: 0.35, showcaseSticky: 0, avatars: 0.45, communityPill: 0.45, credRows: 0.3 };

const READ = (sels) => `JSON.stringify((() => { const r = (x) => Math.round(x * 10) / 10, v = window.visualViewport, out = {};
  for (const [k, s] of Object.entries(${JSON.stringify(sels)})) { const els = [...document.querySelectorAll(s)];
    if (!els.length) { out[k] = null; continue; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of els) { const b = e.getBoundingClientRect(); if (!b.width && !b.height) continue; x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
    out[k] = x0 === Infinity ? { n: els.length, empty: true } : { n: els.length, x: r(x0), y: r(y0), w: r(x1 - x0), h: r(y1 - y0), docY: r(y0 + scrollY), pos: getComputedStyle(els[0]).position }; }
  return { y: Math.round(scrollY), innerH: innerHeight, innerW: innerWidth, vvH: v ? r(v.height) : null, vvTop: v ? r(v.offsetTop) : null,
    screenY: window.screenY, screenTop: window.screenTop, outerH: window.outerHeight, screen: [screen.width, screen.height],
    docH: document.documentElement.scrollHeight, rects: out }; })())`;

const SWEEP = `JSON.stringify((() => { const cs = [...document.querySelectorAll('.mobile-deck .orbit-card')];
  const op = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return Math.round(o * 100) / 100; };
  const vis = cs.map((e) => { const b = e.getBoundingClientRect(); return { o: op(e), top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  return { y: Math.round(scrollY), cards: vis }; })())`;
const WATCH = { avatars: '.start-selling-avatars.is-carousel img', peopleO: '.start-selling-future-people-o, .start-selling-future-people-o-face', credRows: '.start-selling-platform-cred-row' };
const WATCH_MS = 10000;
const flag = (k) => process.argv.includes(`--${k}`);

async function main() {
  const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const port = String(arg('port', '')), out = arg('out'), label = arg('label', '');
  if (!port || !out) { console.error('usage: rects.mjs --port <serve port> --out <file.json> [--label A]'); process.exit(2); }
  const c = await openTab((u) => urlHost(u).endsWith(`:${port}`), { tries: 3 });
  const ev = async (e) => { const v = await c.evaluate(e); return JSON.parse(typeof v === 'string' ? v : JSON.stringify(v)); };
  const res = { label, at: new Date().toISOString(), top: null, parked: {} };
  try {
    await c.evaluate('scrollTo(0, 0); "ok"'); await sleep(1200);
    res.top = await ev(READ(SELECTORS));
    for (const [k, f] of Object.entries(PARK)) {
      const t = res.top.rects[k]; if (!t || t.empty || f === null) continue;
      const y = Math.max(0, Math.round(t.docY - f * res.top.innerH));
      await c.evaluate(`scrollTo(0, ${y}); "ok"`); await sleep(1500);
      res.parked[k] = { target: y, ...(await ev(READ({ [k]: SELECTORS[k] }))) };
    }
    if (flag('sweep')) { // hero cards: opacity and box per scroll position (where the fade-out starts and ends)
      res.sweep = [];
      for (let y = 0; y <= 1600; y += 100) {
        await c.evaluate(`scrollTo(0, ${y}); "ok"`); await sleep(700);
        res.sweep.push(await ev(SWEEP));
      }
    }
    if (flag('watch')) { // what changes by itself at rest: class flips per element over WATCH_MS (the carousel's period)
      res.watch = {};
      for (const [k, sel] of Object.entries(WATCH)) {
        const t = res.top.rects[k]; if (!t || t.empty) continue;
        const y = Math.max(0, Math.round(t.docY - (PARK[k] ?? 0.4) * res.top.innerH));
        await c.evaluate(`scrollTo(0, ${y}); "ok"`); await sleep(1000);
        await c.evaluate(`(() => { const w = window.__rw = { t0: performance.now(), ev: [] }; let last = null;
          const snap = () => [...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.className + '|' + (e.getAttribute('src') || '').slice(-24)).join(',');
          w.id = setInterval(() => { const v = snap(); if (v !== last) { w.ev.push(Math.round(performance.now() - w.t0)); last = v; } }, 100); return 'ok'; })()`);
        await sleep(WATCH_MS);
        res.watch[k] = { y, ...(await ev(`JSON.stringify((() => { clearInterval(window.__rw.id); return { changesAtMs: window.__rw.ev }; })())`)) };
      }
    }
    await c.evaluate('scrollTo(0, 0); "ok"');
  } finally { c.close(); }
  writeFileSync(out, JSON.stringify(res, null, 1));
  const t = res.top;
  console.log(`RECTS ${label} innerH ${t.innerH} vvH ${t.vvH} screenY ${t.screenY} outerH ${t.outerH} docH ${t.docH}`);
  for (const [k, v] of Object.entries(t.rects)) console.log(`  ${k}: ${v ? (v.empty ? `${v.n} matched, no box` : `n ${v.n} doc y ${v.docY} x ${v.x} w ${v.w} h ${v.h} ${v.pos}`) : 'none'}`);
  for (const [k, v] of Object.entries(res.parked)) { const b = v.rects[k]; console.log(`  parked ${k} at y ${v.y} (target ${v.target}): viewport x ${b?.x} y ${b?.y} w ${b?.w} h ${b?.h}`); }
  for (const s of res.sweep || []) console.log(`  sweep y ${s.y}: cards ${s.cards.map((c) => `${c.o}@${c.top}..${c.bottom}`).join(' ')}`);
  for (const [k, w] of Object.entries(res.watch || {})) console.log(`  watch ${k} at y ${w.y}: ${w.changesAtMs.length} changes at ms ${w.changesAtMs.join(' ')}`);
}
if (process.argv[1] && process.argv[1].endsWith('rects.mjs')) await main();
