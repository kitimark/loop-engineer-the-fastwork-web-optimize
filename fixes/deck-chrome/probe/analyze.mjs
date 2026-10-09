// deck-chrome: per-frame deck pixels for runs of fling.mjs, aligned with the page log. PIXELS AND COUNTS ONLY.
//   node fixes/deck-chrome/probe/analyze.mjs <run dir> [...]            # table per run + summary line
//   node fixes/deck-chrome/probe/analyze.mjs strip <run dir> <from> <to> [step] [out.png]   # frames side by side (1/2 size)
// Per frame: the deck's and each shell's viewport rect come from the last rAF record at or before the frame's timestamp
// (rects + its scrollY = document position; minus the frame's scrollOffsetY = where the deck sits in that frame).
// In each visible shell region (clipped to the viewport and the deck's box): white % (all channels >= 248) and edge %
// (|horizontal luma step| > 24), the two numbers that drop or jump when a card is blank or half drawn.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));

export function loadRun(dir) {
  const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  const to = run.log?.timeOrigin ?? 0; const fr = run.log?.fr ?? [];
  const at = (ms) => { let lo = 0, hi = fr.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (to + fr[m][0] <= ms) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  return { run, to, fr, at };
}
export function frameStats(dir, R, i) {
  const { run, fr, at, to } = R; const f = run.frames[i];
  const ms = f.timestamp * 1000; const k = at(ms); const rec = k >= 0 ? fr[k] : null;
  const img = pngPixels(readFileSync(join(dir, f.f)));
  const sc = img.w / 430; // css px -> frame px
  const out = { i, f: f.f, t: to && run.t0 ? +(ms - run.t0).toFixed(1) : null, y: +f.scrollOffsetY.toFixed(1), recY: rec ? rec[1] : null, recLag: rec ? +(ms - to - rec[0]).toFixed(1) : null, deck: null, shells: [] };
  if (!rec || !rec[2]) return out;
  const dy = rec[1] - f.scrollOffsetY; // main-thread rects are for scrollY rec[1]; the frame shows scrollOffsetY
  const [dl, dt, dw, dh] = rec[2]; const deckTop = dt + dy; out.deck = [+deckTop.toFixed(0), +(deckTop + dh).toFixed(0)];
  rec[3].forEach((s, si) => {
    const x0 = Math.max(0, s[0], dl), x1 = Math.min(430, s[0] + s[2], dl + dw); const y0 = Math.max(0, s[1] + dy), y1 = Math.min(H(img, sc), s[1] + dy + s[3]);
    if (x1 - x0 < 8 || y1 - y0 < 8) return;
    let n = 0, wh = 0, ed = 0, lum = 0;
    for (let y = Math.ceil(y0 * sc); y < Math.floor(y1 * sc); y++) for (let x = Math.ceil(x0 * sc) + 1; x < Math.floor(x1 * sc); x++) {
      const p = (y * img.w + x) * 4, q = p - 4; const L = 0.299 * img.px[p] + 0.587 * img.px[p + 1] + 0.114 * img.px[p + 2]; const Lq = 0.299 * img.px[q] + 0.587 * img.px[q + 1] + 0.114 * img.px[q + 2];
      n++; lum += L; if (img.px[p] >= 248 && img.px[p + 1] >= 248 && img.px[p + 2] >= 248) wh++; if (Math.abs(L - Lq) > 24) ed++; }
    out.shells.push({ si, act: s[7], vis: s[4], wc: s[6], img: s[8], rows: [Math.round(y0), Math.round(y1)], cols: [Math.round(x0), Math.round(x1)], white: +(100 * wh / n).toFixed(1), edge: +(100 * ed / n).toFixed(2), lum: +(lum / n).toFixed(0) });
  });
  return out;
}
const H = (img, sc) => img.h / sc;

export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export function strip(dir, idx, out, scale = 2, label = true) {
  const imgs = idx.map((i) => pngPixels(readFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`))));
  const w = Math.floor(imgs[0].w / scale), h = Math.floor(imgs[0].h / scale), gap = 4; const W = imgs.length * (w + gap); const buf = Buffer.alloc(W * h * 4, 255);
  imgs.forEach((im, k) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((y * scale) * im.w + x * scale) * 4, d = (y * W + k * (w + gap) + x) * 4; buf[d] = im.px[s]; buf[d + 1] = im.px[s + 1]; buf[d + 2] = im.px[s + 2]; buf[d + 3] = 255; } });
  writeFileSync(out, encodePng(W, h, buf)); return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !['final', 'steps', 'summary'].includes(process.argv[2])) {
  const a = process.argv.slice(2);
  if (a[0] === 'strip') {
    const dir = resolve(a[1]); const from = +a[2], to = +a[3], step = +(a[4] || 1); const idx = []; for (let i = from; i <= to; i += step) idx.push(i);
    console.log(strip(dir, idx, a[5] ? resolve(a[5]) : join(dir, `strip-${from}-${to}.png`)));
  } else for (const d of a) {
    const dir = resolve(d); const R = loadRun(dir); const { run } = R;
    console.log(`# ${run.arm} ${run.case} r${run.r}  frames ${run.frames.length}  deck doc ${run.info0?.deckDocTop?.toFixed(0)}+${run.info0?.deckH?.toFixed(0)}  end y ${run.info1?.y?.toFixed(0)}`);
    const rows = []; for (let i = 0; i < run.frames.length; i++) rows.push(frameStats(dir, R, i));
    for (const r of rows) if (r.shells.length) console.log(`${String(r.i).padStart(4)} t${String(r.t).padStart(7)} y${String(r.y).padStart(7)} lag${String(r.recLag).padStart(6)} deck ${JSON.stringify(r.deck)} ` + r.shells.map((s) => `[${s.si}${s.act ? '*' : ''} ${s.vis}${s.wc ?? '-'} img${s.img} r${s.rows[0]}-${s.rows[1]} w${s.white} e${s.edge}]`).join(' '));
    writeFileSync(join(dir, 'stats.json'), JSON.stringify(rows));
    const T = (t) => +(t + R.to - run.t0).toFixed(1);
    for (const e of run.log?.ev ?? []) console.log(`  ev t${String(T(e[0])).padStart(7)} ${e.slice(1).join(' ')}`);
  }
}

// vs-final: each frame's deck pixels against the last frame's, row-matched by document position (frame scrollOffsetY).
// d = mean |luma diff| over the deck rows both frames show; p = % of those pixels differing by > 32 levels.
// A frame that is still fading/blurred has a high d; a blink is d low -> high -> low once the deck had settled.
export function vsFinal(dir, R, { x0 = 0, x1 = 430 } = {}) {
  const { run, fr } = R; const last = run.frames.length - 1; const fl = run.frames[last];
  const recL = fr[fr.length - 1]; if (!recL || !recL[2]) return [];
  const deckDocTop = recL[2][1] + recL[1], deckDocBot = deckDocTop + recL[2][3];
  const F = pngPixels(readFileSync(join(dir, fl.f))); const sc = F.w / 430;
  const luma = (im, x, y) => { const p = (y * im.w + x) * 4; return 0.299 * im.px[p] + 0.587 * im.px[p + 1] + 0.114 * im.px[p + 2]; };
  const rows = [];
  for (let i = 0; i <= last; i++) {
    const f = run.frames[i]; const a = Math.max(deckDocTop, f.scrollOffsetY, fl.scrollOffsetY), b = Math.min(deckDocBot, f.scrollOffsetY + 932, fl.scrollOffsetY + 932);
    const t = run.t0 ? +(f.timestamp * 1000 - run.t0).toFixed(0) : null;
    if (b - a < 20) { rows.push({ i, t, y: +f.scrollOffsetY.toFixed(0), n: 0 }); continue; }
    const im = pngPixels(readFileSync(join(dir, f.f))); let n = 0, s = 0, big = 0;
    for (let dy = Math.ceil(a); dy < b; dy += 2) { const yi = Math.round((dy - f.scrollOffsetY) * sc), yf = Math.round((dy - fl.scrollOffsetY) * sc); if (yi < 0 || yi >= im.h || yf < 0 || yf >= F.h) continue;
      for (let x = Math.round(x0 * sc); x < Math.round(x1 * sc); x += 2) { const d = Math.abs(luma(im, x, yi) - luma(F, x, yf)); n++; s += d; if (d > 32) big++; } }
    rows.push({ i, t, y: +f.scrollOffsetY.toFixed(0), rowsDoc: [Math.round(a), Math.round(b)], n, d: n ? +(s / n).toFixed(1) : null, p: n ? +(100 * big / n).toFixed(1) : null });
  }
  return rows;
}
// step: frame i against frame i-1 and i+1, row-matched by document position, over the deck's document rows (rect of
// the last rAF record at frame i). p01 = % pixels > 32 levels apart between i-1 and i, p02 = between i-1 and i+1.
// A one-frame blink is an A-B-A pattern: p01 high and p12 high while p02 low (aba = min(p01, p12) - p02).
export function steps(dir, R, { x0 = 0, x1 = 430, stride = 2 } = {}) {
  const { run, fr, at } = R; const cache = new Map();
  const img = (i) => { if (!cache.has(i)) { cache.set(i, pngPixels(readFileSync(join(dir, run.frames[i].f)))); if (cache.size > 6) cache.delete(cache.keys().next().value); } return cache.get(i); };
  const luma = (im, x, y) => { const p = (y * im.w + x) * 4; return 0.299 * im.px[p] + 0.587 * im.px[p + 1] + 0.114 * im.px[p + 2]; };
  const cmp = (i, j, a, b) => { const A = img(i), B = img(j), sc = A.w / 430, fi = run.frames[i], fj = run.frames[j]; let n = 0, big = 0;
    for (let dy = Math.ceil(a); dy < b; dy += stride) { const yi = Math.round((dy - fi.scrollOffsetY) * sc), yj = Math.round((dy - fj.scrollOffsetY) * sc); if (yi < 0 || yi >= A.h || yj < 0 || yj >= B.h) continue;
      for (let x = Math.round(x0 * sc); x < Math.round(x1 * sc); x += stride) { n++; if (Math.abs(luma(A, x, yi) - luma(B, x, yj)) > 32) big++; } }
    return n ? +(100 * big / n).toFixed(1) : null; };
  const rows = [];
  for (let i = 1; i < run.frames.length - 1; i++) {
    const f = run.frames[i]; const k = at(f.timestamp * 1000); const rec = k >= 0 ? fr[k] : null; if (!rec || !rec[2]) continue;
    const top = rec[2][1] + rec[1], bot = top + rec[2][3];
    const lo = Math.max(top, ...[i - 1, i, i + 1].map((j) => run.frames[j].scrollOffsetY)), hi = Math.min(bot, ...[i - 1, i, i + 1].map((j) => run.frames[j].scrollOffsetY + 932));
    if (hi - lo < 40) continue;
    const p01 = cmp(i - 1, i, lo, hi), p12 = cmp(i, i + 1, lo, hi), p02 = cmp(i - 1, i + 1, lo, hi);
    rows.push({ i, t: run.t0 ? +(f.timestamp * 1000 - run.t0).toFixed(0) : null, y: +f.scrollOffsetY.toFixed(0), rows: [Math.round(lo), Math.round(hi)], p01, p12, p02, aba: +(Math.min(p01, p12) - p02).toFixed(1) });
  }
  return rows;
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'steps') {
  for (const d of process.argv.slice(3)) { const dir = resolve(d); const R = loadRun(dir); const rows = steps(dir, R); writeFileSync(join(dir, 'steps.json'), JSON.stringify(rows));
    const top = [...rows].sort((a, b) => b.aba - a.aba).slice(0, 6), big = rows.filter((r) => r.p01 > 15);
    console.log(`# ${R.run.arm} ${R.run.case}: ${rows.length} deck frames, p01>15: ${big.length} [${big.map((r) => `${r.i}@y${r.y}:${r.p01}`).join(' ')}]`);
    console.log(`  top A-B-A: ${top.map((r) => `${r.i}@t${r.t}/y${r.y} aba${r.aba} (${r.p01}/${r.p12}/${r.p02})`).join('  ')}`); }
}
// summary: the reveal timeline against the deck. Times in ms from the gesture start (page clock; frames by timestamp).
//   visY  = screen y (frame scrollOffsetY) when .is-visible was set; runAt = the card's transitionrun (fade start)
//   inAt  = first frame with >= 150 px of the deck on screen; landAt = first frame within 2 px of the final y
//   opEnd / blurEnd = the card's opacity / filter transitionend; preSharp = frames with >= 150 px of deck on screen
//   before blurEnd (the deck faded or blurred while in view); blank = of those, frames whose deck rows are >= 90 % white.
export function summary(dir) {
  const R = loadRun(dir); const { run, to } = R; const T = (t) => Math.round(t + to - run.t0);
  const ev = run.log?.ev ?? []; const fT = (f) => f.timestamp * 1000 - run.t0;
  const at = (ms) => { let k = -1; run.frames.forEach((f, i) => { if (fT(f) <= ms) k = i; }); return k >= 0 ? run.frames[k] : null; };
  const vis = ev.find((e) => e[1] === 'attr' && /people/.test(e[2]) && e[3] === 'class' && !/is-visible/.test(e[4]) && /is-visible/.test(e[5]));
  const card = (k, p) => ev.find((e) => e[1] === k && /future-card/.test(e[2]) && e[3] === p && (!vis || e[0] >= vis[0]));
  const runAt = card('transitionrun', 'opacity'), opEnd = ev.filter((e) => e[1] === 'transitionend' && /future-card/.test(e[2]) && e[3] === 'opacity').pop(), blurEnd = ev.filter((e) => e[1] === 'transitionend' && /future-card/.test(e[2]) && e[3] === 'filter').pop();
  const st = existsSync(join(dir, 'stats.json')) ? JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8')) : run.frames.map((_, i) => frameStats(dir, R, i));
  if (!existsSync(join(dir, 'stats.json'))) writeFileSync(join(dir, 'stats.json'), JSON.stringify(st));
  const onScreen = (s) => s.deck && Math.min(932, s.deck[1]) - Math.max(0, s.deck[0]) >= 150;
  const inF = st.find(onScreen); const yEnd = run.frames.at(-1).scrollOffsetY; const land = run.frames.find((f) => Math.abs(f.scrollOffsetY - yEnd) <= 2);
  const be = blurEnd ? T(blurEnd[0]) : Infinity;
  const pre = st.filter((s) => onScreen(s) && s.t < be);
  const blank = pre.filter((s) => { const a = s.shells.find((x) => x.act); return a && a.white >= 90; });
  return { arm: run.arm, case: run.case, css: !!run.log && undefined, yEnd: Math.round(yEnd), visT: vis ? T(vis[0]) : null, visY: vis ? Math.round(at(T(vis[0]))?.scrollOffsetY ?? -1) : null, runAt: runAt ? T(runAt[0]) : null, opEnd: opEnd ? T(opEnd[0]) : null, blurEnd: blurEnd ? T(blurEnd[0]) : null, inAt: inF ? Math.round(inF.t) : null, inY: inF ? Math.round(inF.y) : null, landAt: land ? Math.round(fT(land)) : null, frames: run.frames.length, preSharp: pre.length, blank: blank.length, blankY: blank.length ? [Math.round(blank[0].y), Math.round(blank.at(-1).y)] : null };
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'summary') {
  for (const d of process.argv.slice(3)) { try { console.log(JSON.stringify(summary(resolve(d)))); } catch (e) { console.log(d, 'error', e.message); } }
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'final') {
  for (const d of process.argv.slice(3)) { const dir = resolve(d); const R = loadRun(dir); const rows = vsFinal(dir, R); writeFileSync(join(dir, 'final.json'), JSON.stringify(rows));
    console.log(`# ${R.run.arm} ${R.run.case} final y ${R.run.frames.at(-1).scrollOffsetY.toFixed(0)}`);
    for (const r of rows) if (r.n) console.log(`${String(r.i).padStart(4)} t${String(r.t).padStart(6)} y${String(r.y).padStart(5)} rows ${r.rowsDoc.join('-')} d${String(r.d).padStart(6)} p${String(r.p).padStart(6)}`);
    const T = (t) => +(t + R.to - R.run.t0).toFixed(0);
    for (const e of R.run.log?.ev ?? []) if (!/future-shrink:/.test(e.join(' '))) console.log(`  ev t${String(T(e[0])).padStart(6)} ${e.slice(1).join(' ')}`); }
}
