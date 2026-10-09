#!/usr/bin/env node
// reveal-paint: the T-265 #6 "late wave" per rp-repaint.mjs record (phase fast). The flip = the `is-visible` class
// mutation on section.start-selling-future; a late wave = a paint of a deck photo (img @shell0/1 post-*) at least
// 1000 ms after the flip that is not within 100 ms of a #people mutation (carousel excluded, as in rp-waves.mjs).
// Prints per record: flip, mutations after it (ms after the flip), photo paints (ms after the flip), wave yes/no.
//   node fixes/reveal-paint/rp-wave-count.mjs out/reveal-paint/r6/*.json
import { readFileSync } from 'node:fs';
let n = 0, waves = 0;
for (const f of process.argv.slice(2).filter((a) => a.endsWith('.json') && !/serve-/.test(a))) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const mk = Object.fromEntries(r.marks.map((m) => [m[1], m[0]]));
  if (!r.phases?.fast?.raw) { console.log(`${f}: no fast raw`); continue; }
  const muts = r.mut.filter((m) => m[0] >= mk.fast && m[0] < mk['fast:end'] && !/avatar|st5|is-carousel/.test(m[1] + m[3]));
  const flipM = muts.find((m) => /start-selling-future/.test(m[1]) && m[2] === 'class' && /is-visible/.test(String(m[3])));
  if (!flipM) { console.log(`${f}: no flip`); continue; }
  const flip = flipM[0] - mk.fast;
  const after = muts.filter((m) => m[0] - mk.fast > flip).map((m) => Math.round(m[0] - mk.fast - flip));
  const photos = r.phases.fast.raw.filter((x) => /img @shell[01] post-/.test(x[4])).map((x) => Math.round(x[0] - flip));
  const late = photos.filter((t) => t >= 1000 && !after.some((a) => Math.abs(a - t) <= 100));
  n++; if (late.length) waves++;
  console.log(`${f.split('/').slice(-2).join('/')} ${r.arm}: flip ${Math.round(flip)} | mutations after +${after.join(' +')} | photo paints ${photos.length ? '+' + [...new Set(photos.map((t) => Math.round(t / 50) * 50))].join(' +') : '-'} | late wave ${late.length ? 'YES (' + late.length + ' paints from +' + Math.min(...late) + ')' : 'no'}`);
}
console.log(`records ${n}, with a late wave ${waves}`);
