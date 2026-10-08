#!/usr/bin/env node
// sticky-walk gate 4 scorer (fix-scrollcb-g0, 2026-10-09): scores a deck-chrome.mjs output dir offline (deck.json + crops),
// for runs that ended at the shared-lane cap before deck-chrome's own scoring. Same rules as deck-chrome.mjs.
//   node fixes/sticky-walk/gates/deck-score.mjs out/sticky-walk/deck/<stamp> [more dirs...]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta, aa } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const data = {};
for (const d of process.argv.slice(2)) { const r = JSON.parse(readFileSync(join(d, 'deck.json'), 'utf8')); for (const l of r.loads) if (!l.void && l.vp) (data[l.vp] ||= {})[l.arm] = l; }
const geomKey = (g) => g && JSON.stringify({ docH: g.docH, deck: g.deck, cw: g.cw, sw: g.sw, shells: g.shells.map((s) => [s[1], s[2], s[4]]) });
const avSeq = (a) => (a || []).map((x) => JSON.stringify(x)).filter((x, i, arr) => i === 0 || x !== arr[i - 1]);
for (const [vk, D] of Object.entries(data)) {
  for (const [x, y] of [['C', 'V'], ['C', 'C2'], ['V', 'V2'], ['C2', 'V2']]) {
    const a = D[x], b = D[y]; if (!a || !b) { console.log(vk, `${x}~${y}`, 'missing'); continue; }
    const crops = [];
    for (let i = 0; i < Math.min(a.swipes.length, b.swipes.length); i++) {
      try { const s = aa(delta(pngPixels(readFileSync(a.swipes[i].png)), pngPixels(readFileSync(b.swipes[i].png)))); crops.push(`${s.maxLevel}/${s.over8Pct}`); } catch (e) { crops.push('err'); }
    }
    console.log(vk.padEnd(6), `${x}~${y}`.padEnd(6), 'geom', geomKey(a.geom) === geomKey(b.geom), 'geom0', geomKey(a.geom0) === geomKey(b.geom0),
      'snaps', JSON.stringify(a.swipes.map((w) => w.st.slice(0, 2))) === JSON.stringify(b.swipes.map((w) => w.st.slice(0, 2))),
      'avRects', a.avRect === b.avRect, 'avStates', avSeq(a.avatars).length + '/' + avSeq(b.avatars).length, 'errors', a.errors.length + '/' + b.errors.length,
      'crops(max/%>8)', crops.join(' '));
  }
}
