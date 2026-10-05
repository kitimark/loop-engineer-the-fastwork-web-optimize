// One read of the open Safari tab's viewport geometry (lead, T-170 #101 change 2): visualViewport height, offsetTop,
// pageTop, innerHeight, screen size, scrollY, plus a wall/perf clock pair. Numbers only, appended as one JSON line
// to --out. Runs ONLY inside the runner's own iphone hold (hold.sh), outside the timed driver runs: one short
// inspector attach, one evaluate, close. Never prints the page URL (it holds the LAN address, Hard rule 12).
//   node research/team-article/capture/phone/vv.mjs --port <serve port> --label <run>-start|end --out <file.jsonl>
import { appendFileSync } from 'node:fs';
import { openTab, urlHost } from '../../../../tools/lib/wip.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const port = String(arg('port', '')), label = arg('label', 'vv'), out = arg('out');
if (!port || !out) { console.error('usage: vv.mjs --port <serve port> --label <l> --out <file.jsonl>'); process.exit(2); }
const EXPR = `JSON.stringify((() => { const v = window.visualViewport; const r = (x) => Math.round(x * 10) / 10;
  return { vvH: v ? r(v.height) : null, vvTop: v ? r(v.offsetTop) : null, vvPageTop: v ? r(v.pageTop) : null, vvScale: v ? v.scale : null,
    innerH: innerHeight, innerW: innerWidth, screen: [screen.width, screen.height], y: Math.round(scrollY),
    docH: document.documentElement.scrollHeight, wallMs: Date.now(), perfMs: r(performance.now()) }; })())`;
const c = await openTab((u) => urlHost(u).endsWith(`:${port}`), { tries: 3 }); // pickTab passes the tab's URL string
let rec;
try {
  const v = await c.evaluate(EXPR);
  rec = { label, macMs: Date.now(), ...JSON.parse(typeof v === 'string' ? v : JSON.stringify(v)) };
} finally { c.close(); }
appendFileSync(out, JSON.stringify(rec) + '\n');
console.log(`VV ${label} vvH ${rec.vvH} vvTop ${rec.vvTop} innerH ${rec.innerH} y ${rec.y}`);
