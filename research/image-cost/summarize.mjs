// image-cost: fold the gitignored Simulator outputs into one small committed summary (no image bytes, no page text).
// Usage: node research/image-cost/summarize.mjs --inv out/image-cost/inventory-1.json --cap out/image-cost/arms/cap2.json \
//   --pd <mix pd json> --idle <mix idle json> [--walk <mix walk json>] [--pix <mix pix json>] --out research/image-cost/results.json
import { readFileSync, writeFileSync } from 'node:fs';
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const rd = (k) => (arg(k) ? JSON.parse(readFileSync(arg(k), 'utf8')) : null);
const inv = rd('--inv'), cap = rd('--cap'), pd = rd('--pd'), idle = rd('--idle'), walk = rd('--walk'), pix = rd('--pix');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const out = {
  study: 'research/image-cost', baselineSnapshot: 'b1789284481295-4ad4a84a',
  setting: 'iOS Simulator (iOS 26.5, WebKit), 430x775 CSS px, DPR 3; Timeline Paint/Composite records; ms are Mac-CPU ms, indicative only (F-084)',
  sources: { inv: arg('--inv'), cap: arg('--cap'), pd: arg('--pd'), idle: arg('--idle'), walk: arg('--walk'), pix: arg('--pix') },
};
if (inv) {
  const seen = inv.images.filter((x) => x.r3 != null && /^(jpe?g|png|avif|webp)$/.test(x.fmt));
  const sum = (k, a = seen) => +a.reduce((s, x) => s + (x[k] || 0), 0).toFixed(1);
  out.inventory = {
    uniqueUrls: inv.images.length, rasterSeen: seen.length, decMBNatural: sum('decMB'), decMBAt3x: sum('dec3MB'), decMBAt2x: sum('dec2MB'),
    over3x: seen.filter((x) => x.r3 > 1.05).length, over2x: seen.filter((x) => x.r2 > 1.05).length, moreThan2xOver3x: seen.filter((x) => x.r3 > 2).length,
    withSrcset: 0,
    images: inv.images.map((x) => ({ p: x.p, fmt: x.fmt, bytes: x.bytes, nat: x.nat, cssBox: x.sbox, r3: x.r3, r2: x.r2, decMB: x.decMB, dec3MB: x.dec3MB, dec2MB: x.dec2MB, loading: x.loading, decoding: x.decoding, moving: x.moving })),
  };
}
if (cap) out.cap2 = { files: cap.n, bytes: cap.bytes, bytesCap: cap.bytesCap, decMB: cap.decMB, decCapMB: cap.decCapMB, list: cap.files.map((f) => ({ p: f.p, nat: f.nat, cap: f.cap, box: f.box, from: f.from })) };
if (pd) {
  const arms = pd.runs.map((r) => r.arm);
  const byU = new Map();
  pd.runs.forEach((r, i) => r.rows.forEach((w) => { const a = byU.get(w.u) || byU.set(w.u, { p: w.u, arms: [] }).get(w.u); a.arms[i] = { nat: w.nat, freshMax: w.fresh?.max ?? null, freshMs: w.fresh?.ms ?? null, decodedMax: w.decoded?.max ?? null }; }));
  out.decodeInPaint = {
    what: 'a fresh copy of each image appended into an already-painted fixed will-change layer at mid page; Paint records in the 3 rAF + 150 ms window. "decoded" = the same image appended again after it was decoded (control).',
    arms, sums: pd.runs.map((r) => ({ arm: r.arm, freshMs: +r.rows.reduce((s, w) => s + (w.fresh?.ms || 0), 0).toFixed(1), decodedMs: +r.rows.reduce((s, w) => s + (w.decoded?.ms || 0), 0).toFixed(1) })),
    images: [...byU.values()],
  };
}
const phase = (j) => j && j.runs.map((r) => ({ arm: r.arm, frames: r.frames, frameP50: r.frameP50, frameP95: r.frameP95, paint: r.paint, composite: r.composite, layout: r.layout, style: r.style, imgChanges: r.imgChanges, memory: r.memory ?? undefined }));
if (idle) out.idle = { idleS: idle.runs[0].idleS, runs: phase(idle), swapPaintMaxMs: idle.runs.map((r) => Math.max(0, ...(r.swaps || []).map((s) => s.max || 0))) };
if (walk) {
  const runs = phase(walk);
  const by = (a) => runs.filter((r) => r.arm === a);
  const m = (a, f) => by(a).map(f);
  out.walk = { runs, perArm: Object.fromEntries(['base', 'cap2'].map((a) => [a, { paintMs: m(a, (r) => r.paint.ms), paintMax: m(a, (r) => r.paint.max), paintOver2: m(a, (r) => r.paint.over2), paintOver4: m(a, (r) => r.paint.over4), compMs: m(a, (r) => r.composite.ms), frameP95: m(a, (r) => r.frameP95), imagesPeakMB: m(a, (r) => r.memory?.imagesPeakMB ?? null), imagesMeanMB: m(a, (r) => r.memory?.imagesMeanMB ?? null) }])) };
}
if (pix) out.pixels = pix.runs.map((r) => ({ arm: r.arm, rows: r.rows }));
writeFileSync(arg('--out'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', arg('--out'));
