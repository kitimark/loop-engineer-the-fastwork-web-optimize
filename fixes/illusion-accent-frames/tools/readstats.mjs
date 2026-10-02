// PR-001 rev 3 (P-058): after an `iphone.mjs run ... --no-park`, read the arm's own counters from the still-open page (one
// evaluate, no per-frame reads): arm label (from its manifest), draws seen, canvas/video draws, draws run to the end, handbacks by
// reason (scroll, miss, drift, play), the last 24 per-draw log entries (video: max drift and the first 8 drift values in ms), the
// gate (why the arm stayed on the SVG, if it did). C and B have no arm: {arm: null}. Run `iphone.mjs park` after it.
// usage: node readstats.mjs <out.json> [host substring]
import { writeFileSync } from 'node:fs';
import { connect, sleep } from '../../../tools/lib/wip.mjs';
const [out, match] = process.argv.slice(2);
const PORT = Number(process.env.FW_IPHONE_PORT || 9222);
let c = null;
for (let i = 0; i < 10 && !c; i++) {
  const pages = (await (await fetch(`http://localhost:${PORT}/json`)).json()).filter((p) => p.webSocketDebuggerUrl && String(p.url).startsWith('http') && (!match || String(p.url).includes(match)));
  for (const p of pages) { try { const k = await connect(p.webSocketDebuggerUrl, { timeoutMs: 4000 }); if ((await k.evaluate('document.visibilityState', 'page', 3000)) === 'visible') { c = k; break; } k.close(); } catch {} }
  if (!c) await sleep(1000);
}
if (!c) { console.log('NO-TAB'); process.exit(1); }
const r = JSON.parse(await c.evaluate(`JSON.stringify((() => { const a = window.__fwAccentCanvas; if (!a) return { arm: null };
  const s = a.stats(); return { arm: s.arm, draws: s.draws, canvas: s.canvas, done: s.done, back: s.back, last: s.last, off: s.off, log: s.log, gate: a.gate || null, state: a.state() }; })())`));
c.close();
writeFileSync(out, JSON.stringify(r, null, 1));
console.log(JSON.stringify({ arm: r.arm, draws: r.draws, canvas: r.canvas, done: r.done, back: r.back, gate: r.gate, drift: (r.log || []).filter((l) => l.dmax != null).map((l) => l.dmax) }));
