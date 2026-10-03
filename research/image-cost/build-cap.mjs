// image-cost: build a local overlay arm whose raster images are capped at K x their largest displayed size at 430 px
// (K = 2 by default: "2x cap"), from the frozen baseline mirror (site/), with macOS sips (no new dependency).
// Usage: node research/image-cost/build-cap.mjs out/image-cost/inventory-1.json [--k 2] [--arm cap2]
// Writes out/image-cost/arms/<arm>/<same path>.jpg|png (gitignored; Fastwork-derived) and out/image-cost/arms/<arm>.json.
// Images the census did not see on screen get the box of their group (hero card, hero avatar, morph column).
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const SITE = resolveTree('site');
const inv = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const K = Number(arg('--k', 2)); const ARM = arg('--arm', 'cap' + K);
const DIR = join(WT, 'out/image-cost/arms', ARM);
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
// group boxes (CSS px, object-fit cover) for images the census saw loaded but not on screen
const hero = inv.images.filter((x) => /^\/selling\/hero\/.*-cover\./.test(x.p) && x.sbox[0]).reduce((m, x) => (x.sbox[0] * x.sbox[1] > m[0] * m[1] ? x.sbox : m), [0, 0]);
const heroAv = inv.images.filter((x) => /^\/selling\/hero\/.*-avatar\./.test(x.p) && x.sbox[0]).reduce((m, x) => (x.sbox[0] * x.sbox[1] > m[0] * m[1] ? x.sbox : m), [0, 0]);
const morph = inv.images.filter((x) => /morph-col-track/.test(x.moving) && x.sbox[0]).reduce((m, x) => (x.sbox[0] * x.sbox[1] > m[0] * m[1] ? x.sbox : m), [0, 0]);
const groupBox = (x) => (/^\/selling\/hero\/.*-cover\./.test(x.p) ? ['hero-card', hero] : /^\/selling\/hero\/.*-avatar\./.test(x.p) ? ['hero-avatar', heroAv]
  : /^\/selling\/(roles|work|profile\/portfolio|media)\//.test(x.p) && /morph-col-track/.test(x.where) ? ['morph-column', morph] : null);
const out = [];
for (const x of inv.images) {
  if (!/\.(jpe?g|png)$/i.test(x.p) || !x.nat[0]) continue;
  let box = x.sbox, from = 'census';
  if (!box[0] || !box[1]) { const g = groupBox(x); if (!g) continue; box = g[1]; from = g[0]; }
  const [nw, nh] = x.nat; const s = Math.max(box[0] / nw, box[1] / nh); // cover (every capped image here is cover-fit)
  const tw = Math.ceil(nw * s * K); if (tw >= nw * 0.95) continue; // already within K x (5 % slack)
  const th = Math.max(1, Math.round(nh * tw / nw));
  const src = join(SITE, x.p); const dst = join(DIR, x.p); mkdirSync(dirname(dst), { recursive: true });
  const fmt = execFileSync('sips', ['-g', 'format', src], { encoding: 'utf8' }).match(/format: (\w+)/)[1];
  const args = ['-z', String(th), String(tw), '-s', 'format', fmt, ...(fmt === 'jpeg' ? ['-s', 'formatOptions', '85'] : []), src, '--out', dst];
  execFileSync('sips', args, { stdio: 'ignore' });
  out.push({ p: x.p, fmt, from, box, nat: [nw, nh], cap: [tw, th], r2: +(nw / (nw * s * 2)).toFixed(2), bytes: statSync(src).size, bytesCap: statSync(dst).size,
    decMB: +(nw * nh * 4 / 1048576).toFixed(2), decCapMB: +(tw * th * 4 / 1048576).toFixed(2) });
}
const tot = (k) => Math.round(out.reduce((s, x) => s + x[k], 0) * 100) / 100;
const summary = { arm: ARM, k: K, n: out.length, bytes: tot('bytes'), bytesCap: tot('bytesCap'), decMB: tot('decMB'), decCapMB: tot('decCapMB'), files: out };
writeFileSync(join(WT, 'out/image-cost/arms', ARM + '.json'), JSON.stringify(summary, null, 1));
console.log(`${ARM}: ${out.length} files; bytes ${summary.bytes} -> ${summary.bytesCap}; decoded at natural size ${summary.decMB} -> ${summary.decCapMB} MB`);
for (const x of out) console.log(`${x.p} ${x.fmt} ${x.from} box ${x.box.join('x')} ${x.nat.join('x')} -> ${x.cap.join('x')} (r2 ${x.r2}) bytes ${x.bytes} -> ${x.bytesCap} dec ${x.decMB} -> ${x.decCapMB} MB`);
