// end-bg image options (fix-end-bg, user T-193 #28 / T-197): build the optimized overlay of one option from the image
// inventory and the Chrome scroll census. CPU work (sips, avifenc): run it inside a --no-timing chrome-measure hold:
//   node tools/lock.mjs run chrome-measure --no-timing --max-seconds 600 --owner fix-end-bg -- \
//     node fixes/end-bg/img-build.mjs --option A|B|C|ABC [--census out/end-bg/images/img-scroll-<stamp>.json]
// Output (gitignored, never committed: Fastwork-derived pixels): out/end-bg/opt-<option>/overlay/ (JS, CSS, index.html
// copies + image files) and out/end-bg/opt-<option>/build.json (every file: source px/bytes -> output px/bytes, why).
//   A  right-size: every image a phone shows (census "seen") whose file is > 1.15x what its largest phone box needs at
//      DPR 3 (cover-aware x-need from the census / research/image-cost) is resampled to that need, same format, same URL;
//      the menu photo wall gets loading="lazy" (its columns 4-5 are display:none below 640 px, so they are not fetched).
//   B  A + lighter format: A's files and the phone-visible PNG photos are re-encoded as AVIF (avifenc -q Q), new .avif URL;
//      every literal reference in the overlay JS/CSS and index.html is rewritten (Safari: AVIF since Safari 16 / iOS 16).
//   C  baked end-screen backgrounds: out/end-bg/bake/*.png (bake-chrome.mjs) become static backgrounds below 640 px and
//      the live layers they replace (grain blend divs, blurred stage photos, the sheet's mesh + grain) are not drawn.
//   ABC all three.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OPT = arg('--option', 'A');
const Q = Number(arg('--avif-q', '68'));
const JPQ = Number(arg('--jpeg-q', '90'));
const SRC_OVL = resolve(WT, arg('--base-overlay', 'fixes/end-bg/overlay'));
const SITE = join(mirrorHome(), 'site'), PRETTY = join(mirrorHome(), 'site-pretty');
const DIR = join(WT, `out/end-bg/opt-${OPT}`), OVL = join(DIR, 'overlay');
const JSF = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
rmSync(DIR, { recursive: true, force: true }); mkdirSync(OVL, { recursive: true });
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr || r.stdout}`); return r.stdout; };
const px = (f) => { const o = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f]); return { w: Number(/pixelWidth: (\d+)/.exec(o)[1]), h: Number(/pixelHeight: (\d+)/.exec(o)[1]) }; };
const put = (rel, buf) => { const f = join(OVL, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, buf); return f; };

// the code files every option edits
let js = readFileSync(join(SRC_OVL, JSF), 'utf8'), css = readFileSync(join(SRC_OVL, CSSF), 'utf8');
let html = readFileSync(existsSync(join(SRC_OVL, 'index.html')) ? join(SRC_OVL, 'index.html') : join(PRETTY, 'index.html'), 'utf8');
const log = { option: OPT, avifQ: Q, jpegQ: JPQ, files: [], code: [], skipped: [] };
const has = (o) => OPT === o || OPT === 'ABC' || (OPT === 'B' && o === 'A');

// inventory + census
const inv = readFileSync(join(WT, 'out/end-bg/images/inventory.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => { const c = l.split('\t');
  return { path: c[0], kind: c[1], format: c[2], bytes: +c[3], w: +c[4], h: +c[5], alpha: c[6], box: c[10], xNeed: c[11] === '' ? null : +c[11], flags: c[13] || '' }; });
const censusFile = arg('--census', null);
if (!censusFile && OPT !== 'C') { console.error('--census <img-scroll json> is required: "seen on a phone" comes from it'); process.exit(2); }
const seen = new Set();
// "drawn on a phone" = Chrome drew it (PaintImage) during the load or the scripted scroll at 430 x 775 (img-scroll.mjs);
// its IntersectionObserver list misses images whose src is set later (the menu wall), so it is not used here
if (censusFile) { const cj = JSON.parse(readFileSync(resolve(WT, censusFile), 'utf8')); for (const r of cj.runs) for (const ph of ['load', 'scroll']) for (const u of Object.keys(r[ph].paintImage || {})) seen.add(u); }
const visible = (p) => seen.has(p);

if (has('A') || has('B')) {
  const targets = inv.filter((r) => r.kind === 'img' && visible(r.path) && /^(jpg|jpeg|png)$/.test(r.format));
  for (const r of targets) {
    const src = join(SITE, r.path); if (!existsSync(src)) { log.skipped.push({ path: r.path, why: 'missing in site/' }); continue; }
    const shrink = r.xNeed && r.xNeed > 1.15;
    const pngPhoto = r.format === 'png' && r.bytes > 60000;
    const toAvif = has('B') && (shrink || pngPhoto || r.bytes > 150000);
    if (!shrink && !toAvif) continue;
    const s = shrink ? 1 / r.xNeed : 1, W = Math.ceil(r.w * s), H = Math.ceil(r.h * s);
    const tmp = join(DIR, 'tmp' + r.path.replace(/\.[a-z]+$/i, '.png')); mkdirSync(dirname(tmp), { recursive: true });
    run('sips', ['-s', 'format', 'png', ...(shrink ? ['--resampleHeightWidth', String(H), String(W)] : []), src, '--out', tmp]);
    let rel, outBytes;
    // a path built at runtime has no literal reference to rewrite: B then keeps the format and only right-sizes (as A)
    const literal = [js, css, html].some((s) => s.includes(r.path));
    if (toAvif && !literal) { log.skipped.push({ path: r.path, why: 'AVIF skipped: no literal reference (built at runtime); right-sized only' }); if (!shrink) continue; }
    if (toAvif && literal) {
      rel = r.path.replace(/\.(jpe?g|png)$/i, '.avif').slice(1);
      const f = join(OVL, rel); mkdirSync(dirname(f), { recursive: true });
      run('avifenc', ['-q', String(Q), '-s', '6', '-j', '2', tmp, f]); outBytes = statSync(f).size;
      const from = r.path, to = '/' + rel; let n = 0;
      for (const k of ['js', 'css', 'html']) { const before = { js, css, html }[k]; const after = before.split(from).join(to); n += before.split(from).length - 1; if (k === 'js') js = after; else if (k === 'css') css = after; else html = after; }
      if (!n) { rmSync(f); log.skipped.push({ path: r.path, why: 'no literal reference to rewrite (built at runtime)' }); continue; }
      log.files.push({ path: r.path, to, from: `${r.w}x${r.h} ${r.bytes}`, out: `${W}x${H} ${outBytes}`, refs: n, why: shrink ? `x-need ${r.xNeed} + AVIF` : 'AVIF' });
    } else {
      rel = r.path.slice(1); const f = join(OVL, rel); mkdirSync(dirname(f), { recursive: true });
      if (r.format === 'png') copyFileSync(tmp, f); else run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPQ), tmp, '--out', f]);
      outBytes = statSync(f).size;
      // sips writes plain PNGs and its JPEG quality may be above the original's: a smaller picture can be a bigger
      // file. Then the original stays (no gain in bytes; the decoded size gain alone is not worth a pixel change).
      if (outBytes >= r.bytes) { rmSync(f); log.skipped.push({ path: r.path, why: `resized file not smaller (${outBytes} >= ${r.bytes}): original kept` }); continue; }
      log.files.push({ path: r.path, to: r.path, from: `${r.w}x${r.h} ${r.bytes}`, out: `${W}x${H} ${outBytes}`, why: `x-need ${r.xNeed}` });
    }
  }
  // the photo wall: lazy, so the columns a phone hides (display:none below 640 px) are never fetched
  const before = js; js = js.replace('var sN = h(`<img loading="eager" decoding="async" alt=""/>`)', 'var sN = h(`<img loading="lazy" decoding="async" alt=""/>`)');
  log.code.push({ what: 'photo wall <img> loading eager -> lazy (JS sN template)', changed: before !== js });
}

if (has('C')) {
  // the latest bake (bake-chrome.mjs): only stacks with a live layer to remove (a stage whose bg layer is display:none,
  // e.g. the invoice row's, has nothing to bake); stored as JPEG (--bake-q) at the size the phone shows (the invoice
  // sheet is laid out at 640x512 and scaled into the 390 px stage, so it is stored at the stage's device width)
  const B = join(WT, 'out/end-bg/bake'); const baked = []; const rules = []; const BQ = Number(arg('--bake-q', '92'));
  const bj = (() => { const fs = spawnSync('ls', ['-1t', B], { encoding: 'utf8' }).stdout.split('\n').filter((x) => /^bake-.*\.json$/.test(x)); return JSON.parse(readFileSync(join(B, fs[0]), 'utf8')); })();
  const stageW = (bj.items.find((i) => i.kind === 'stage') || {}).w || 390;
  for (const it of bj.items) {
    if (it.kind === 'stage' && !it.bg.some((b) => b.display !== 'none')) { log.skipped.push({ path: it.name, why: 'no visible background layer' }); continue; }
    const rel = `selling/baked/${it.name}.jpg`, f = put(rel, Buffer.alloc(0));
    const W = it.kind === 'sheet' ? stageW * 3 : Math.round(it.rw * 3), Hh = it.kind === 'sheet' ? Math.round(stageW * 3 * it.rh / it.rw) : Math.round(it.rh * 3);
    run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(BQ), '--resampleHeightWidth', String(Hh), String(W), it.file, '--out', f]);
    baked.push({ rel, px: `${W}x${Hh}`, bytes: statSync(f).size });
    if (it.kind === 'stage') rules.push(`  .start-selling-platform-row.is-${it.id} .start-selling-platform-stage { background: url(/${rel}) 0 0 / 100% 100% no-repeat !important; }`,
      `  .start-selling-platform-row.is-${it.id} .start-selling-platform-stage-grain, .start-selling-platform-row.is-${it.id} .start-selling-platform-stage-picture { display: none !important; }`);
    else rules.push(`  .start-selling-platform-invoice-sheet { background: url(/${rel}) 0 0 / 100% 100% no-repeat !important; }`,
      `  .start-selling-platform-invoice-sheet::before, .start-selling-platform-invoice-sheet::after { display: none !important; }`);
  }
  css += `\n/* end-bg option C (fix-end-bg): baked end-screen backgrounds, phones only */\n@media (width <= 640px) {\n${rules.join('\n')}\n}\n`;
  log.code.push({ what: 'CSS: baked backgrounds below 640 px', baked });
}

put(JSF, js); put(CSSF, css); put('index.html', html);
rmSync(join(DIR, 'tmp'), { recursive: true, force: true });
const sum = (k) => log.files.reduce((s, f) => s + Number(f[k].split(' ')[1]), 0);
log.totals = { files: log.files.length, bytesBefore: sum('from'), bytesAfter: sum('out') };
writeFileSync(join(DIR, 'build.json'), JSON.stringify(log, null, 1));
console.log(`option ${OPT}: ${log.files.length} images, ${log.totals.bytesBefore} -> ${log.totals.bytesAfter} bytes; code: ${log.code.map((c) => c.what).join('; ')}; skipped ${log.skipped.length}`);
