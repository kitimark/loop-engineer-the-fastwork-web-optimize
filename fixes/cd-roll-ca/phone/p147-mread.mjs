#!/usr/bin/env node
// P-147 step 0 (PHONE TICKET P-147, fixes/cd-roll-ca/README.md): read the menu's open state at rest on the iPhone.
// Inside the phone hold, after an uncounted W warm-up run on the arm's port with --no-park (the page stays at its end):
// connects to the Safari tab on that port (ios_webkit_debug_proxy, tools/lib/wip.mjs), reads the panel's --morph (the
// page's own inline value, the same read as P-097's S1) twice 2 s apart, plus scrollY and the page end (scrollHeight -
// innerHeight). Prints one JSON line; exit 0 when both reads are exactly '1', 3 when not, 1 on a tool error.
// No timing; the inspector is attached only for these reads, never during a counted run (protocol §5.5).
//   node fixes/cd-roll-ca/phone/p147-mread.mjs --port <server port> --arm C|V
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(fileURLToPath(import.meta.url), '../../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const port = arg('--port'), arm = arg('--arm');
if (!port || !arm) { console.error('usage: p147-mread.mjs --port <server port> --arm C|V'); process.exit(1); }
export const MREAD = `(() => { const p = document.querySelector('.start-selling-morph-panel'); return p ? p.style.getPropertyValue('--morph') : null; })()`;
const FACTS = `({ y: Math.round(scrollY), maxY: document.documentElement.scrollHeight - innerHeight, vh: innerHeight })`;
let c;
try {
  c = await openTab(`:${port}/`);
  const m1 = await c.evaluate(MREAD), f1 = await c.evaluate(FACTS);
  await sleep(2000);
  const m2 = await c.evaluate(MREAD), f2 = await c.evaluate(FACTS);
  const ok = m1 === '1' && m2 === '1';
  console.log(JSON.stringify({ tool: 'p147-mread', arm, at: new Date().toISOString(), m: [m1, m2], facts: [f1, f2], open: ok }));
  process.exitCode = ok ? 0 : 3;
} catch (e) { console.error('p147-mread: ' + String(e.message || e)); process.exitCode = 1; }
finally { if (c) c.close(); }
