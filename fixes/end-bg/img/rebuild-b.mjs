#!/usr/bin/env node
// end-bg PR-025 option B ("new-format": lighter files + AVIF, accepted by the user 2026-10-05 21:04Z): the RECIPE.
// No re-encoded Fastwork image is ever committed (lead ruling, Hard rule 3). What is committed instead is this script
// and fixes/end-bg/img/b-manifest.json: per picture the source (path, sha256, size), the operation (resample size,
// encoder, exact version, settings) and the output (path, size, bytes, sha256); per code file the text edits and the
// sha256 of the result. A rebuild from the frozen baseline is checkable file by file.
//   node fixes/end-bg/img/rebuild-b.mjs --make-manifest [--from out/end-bg/opt-B]   (once, from img-build.mjs --option B)
//   node fixes/end-bg/img/rebuild-b.mjs --build <dir> [--base-overlay fixes/end-bg/overlay]   rebuild into <dir>/overlay
//   node fixes/end-bg/img/rebuild-b.mjs --check <overlay dir>       compare an overlay with the manifest (no CPU work)
//   node fixes/end-bg/img/rebuild-b.mjs --selftest
// --build is CPU work (sips, avifenc): run it inside a --no-timing chrome-measure hold. It refuses (exit 4) when the
// encoder versions differ from the manifest's, or a source file's sha256 differs (another baseline).
// Exit: 0 MATCH (every file equals the manifest), 1 MISMATCH (listed), 2 usage, 4 refused before any work.
// Output lines: "REBUILD <n> files ..." / "CHECK MATCH <n>/<n>" / "CHECK MISMATCH <path> want <sha> got <sha>".
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MANIFEST = join(WT, 'fixes/end-bg/img/b-manifest.json');
const JSF = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css', HTML = 'index.html';
export const LAZY = { from: 'var sN = h(`<img loading="eager" decoding="async" alt=""/>`)', to: 'var sN = h(`<img loading="lazy" decoding="async" alt=""/>`)' };
export const SETTINGS = { avifenc: ['-q', '68', '-s', '6', '-j', '2'], jpegQ: 90, intermediate: 'sips -s format png [--resampleHeightWidth H W] <src> --out <tmp.png>' };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr || r.stdout}`); return r.stdout; };
export function versions() {
  const av = spawnSync('avifenc', ['--version'], { encoding: 'utf8' }).stdout || '';
  const sv = spawnSync('sips', ['--version'], { encoding: 'utf8' }).stdout || '';
  const os = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout || '';
  const ob = spawnSync('sw_vers', ['-buildVersion'], { encoding: 'utf8' }).stdout || '';
  return { avifenc: (av.split('\n')[0] || '').replace(/^Version:\s*/, '').trim(), sips: sv.trim(), macOS: `${os.trim()} (${ob.trim()})` };
}
/** Apply the manifest's text edits to one code file's text; returns { text, counts } (count per from-string). */
export function applyEdits(text, edits) {
  const counts = {};
  for (const e of edits) { const n = text.split(e.from).length - 1; counts[e.from] = n; text = text.split(e.from).join(e.to); }
  return { text, counts };
}
/** The operation of one built file, from img-build.mjs's build.json entry. */
export function opOf(f, srcFormat) {
  const [W, H] = f.out.split(' ')[0].split('x').map(Number);
  const resize = /x-need/.test(f.why) ? [W, H] : null;
  const encode = /\.avif$/.test(f.to) ? 'avif' : srcFormat === 'png' ? 'png' : 'jpeg';
  return { resize, encode };
}
function mirrorHomeSync() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: WT, encoding: 'utf8' });
  return process.env.FW_MIRROR_HOME || dirname(r.stdout.trim());
}
function walk(d, base = d, out = []) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, base, out); else out.push(relative(base, p)); } return out; }

function makeManifest(from) {
  const B = JSON.parse(readFileSync(join(from, 'build.json'), 'utf8')), OVL = join(from, 'overlay'), SITE = join(mirrorHomeSync(), 'site');
  const PRETTY = join(mirrorHomeSync(), 'site-pretty'), BASE = join(WT, 'fixes/end-bg/overlay');
  const pics = B.files.map((f) => {
    const src = join(SITE, f.path), fmt = /\.png$/i.test(f.path) ? 'png' : 'jpeg', op = opOf(f, fmt);
    const outRel = f.to.slice(1), out = readFileSync(join(OVL, outRel));
    const [sw, shh] = f.from.split(' ')[0].split('x').map(Number);
    return { src: f.path, srcSha256: sha(readFileSync(src)), srcPx: [sw, shh], srcBytes: statSync(src).size, op, out: f.to, outPx: f.out.split(' ')[0].split('x').map(Number), outBytes: out.length, outSha256: sha(out), refs: f.refs ?? 0, why: f.why };
  });
  const edits = pics.filter((p) => p.op.encode === 'avif').map((p) => ({ from: p.src, to: p.out }));
  const code = {};
  for (const [rel, baseFile] of [[JSF, join(BASE, JSF)], [CSSF, join(BASE, CSSF)], [HTML, existsSync(join(BASE, HTML)) ? join(BASE, HTML) : join(PRETTY, HTML)]]) {
    const base = readFileSync(baseFile, 'utf8'); let { text, counts } = applyEdits(base, edits);
    const lazy = rel === JSF ? text.includes(LAZY.from) : false; if (lazy) text = text.split(LAZY.from).join(LAZY.to);
    const built = readFileSync(join(OVL, rel), 'utf8');
    if (text !== built) throw new Error(`text edits do not reproduce ${rel}: the manifest would not rebuild it`);
    code[rel] = { base: relative(WT, baseFile).startsWith('..') ? `site-pretty/${HTML}` : relative(WT, baseFile), baseSha256: sha(base), refs: Object.fromEntries(Object.entries(counts).filter(([, n]) => n)), lazy, outSha256: sha(built) };
  }
  const files = walk(OVL).sort();
  const m = { tool: 'fixes/end-bg/img/rebuild-b.mjs', proposal: 'PR-025 option new-format (B)', builtBy: 'fixes/end-bg/img-build.mjs --option B', versions: versions(), settings: SETTINGS,
    totals: { pictures: pics.length, srcBytes: pics.reduce((s, p) => s + p.srcBytes, 0), outBytes: pics.reduce((s, p) => s + p.outBytes, 0), overlayFiles: files.length },
    skipped: B.skipped, edits: { urls: edits, lazy: LAZY }, code, pictures: pics };
  const want = new Set([...pics.map((p) => p.out.slice(1)), JSF, CSSF, HTML]); const extra = files.filter((f) => !want.has(f));
  if (extra.length) throw new Error(`overlay has files the manifest does not describe: ${extra.join(', ')}`);
  mkdirSync(dirname(MANIFEST), { recursive: true }); writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n');
  console.log(`MANIFEST ${pics.length} pictures, ${m.totals.srcBytes} -> ${m.totals.outBytes} bytes, ${files.length} overlay files; versions ${JSON.stringify(m.versions)}`);
}

export function checkOverlay(m, ovl) {
  const bad = [], want = [...m.pictures.map((p) => [p.out.slice(1), p.outSha256]), ...Object.entries(m.code).map(([rel, c]) => [rel, c.outSha256])];
  for (const [rel, s] of want) { const f = join(ovl, rel); const got = existsSync(f) ? sha(readFileSync(f)) : 'missing'; if (got !== s) bad.push(`${rel} want ${s.slice(0, 12)} got ${got.slice(0, 12)}`); }
  const extra = existsSync(ovl) ? walk(ovl).filter((f) => !want.some(([r]) => r === f)) : [];
  for (const f of extra) bad.push(`${f} not in the manifest`);
  return { n: want.length, bad };
}

function build(dir, baseOvl) {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8')), v = versions(), SITE = join(mirrorHomeSync(), 'site'), PRETTY = join(mirrorHomeSync(), 'site-pretty');
  if (v.avifenc !== m.versions.avifenc || v.sips !== m.versions.sips) { console.log(`REFUSED encoder versions ${JSON.stringify(v)} differ from the manifest's ${JSON.stringify(m.versions)}`); process.exit(4); }
  for (const p of m.pictures) { const s = sha(readFileSync(join(SITE, p.src))); if (s !== p.srcSha256) { console.log(`REFUSED source ${p.src} sha256 ${s.slice(0, 12)} != manifest ${p.srcSha256.slice(0, 12)} (another baseline)`); process.exit(4); } }
  const OVL = join(dir, 'overlay'), TMP = join(dir, 'tmp'); rmSync(dir, { recursive: true, force: true }); mkdirSync(OVL, { recursive: true });
  for (const p of m.pictures) {
    const tmp = join(TMP, p.src.replace(/\.[a-z]+$/i, '.png')), out = join(OVL, p.out.slice(1)); mkdirSync(dirname(tmp), { recursive: true }); mkdirSync(dirname(out), { recursive: true });
    run('sips', ['-s', 'format', 'png', ...(p.op.resize ? ['--resampleHeightWidth', String(p.op.resize[1]), String(p.op.resize[0])] : []), join(SITE, p.src), '--out', tmp]);
    if (p.op.encode === 'avif') run('avifenc', [...m.settings.avifenc, tmp, out]);
    else if (p.op.encode === 'png') copyFileSync(tmp, out);
    else run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(m.settings.jpegQ), tmp, '--out', out]);
  }
  for (const [rel, c] of Object.entries(m.code)) {
    const bf = rel === HTML && !existsSync(join(baseOvl, HTML)) ? join(PRETTY, HTML) : join(baseOvl, rel);
    const base = readFileSync(bf, 'utf8'); let { text, counts } = applyEdits(base, m.edits.urls);
    for (const [from, n] of Object.entries(c.refs)) if (counts[from] !== n) console.log(`NOTE ${rel}: ${from} replaced ${counts[from]} times (manifest ${n})`);
    if (c.lazy) { if (!text.includes(m.edits.lazy.from)) console.log(`NOTE ${rel}: lazy edit target not found`); text = text.split(m.edits.lazy.from).join(m.edits.lazy.to); }
    mkdirSync(dirname(join(OVL, rel)), { recursive: true }); writeFileSync(join(OVL, rel), text);
    if (sha(base) !== c.baseSha256) console.log(`NOTE ${rel}: base ${relative(WT, bf)} differs from the manifest's base (sha ${sha(base).slice(0, 12)}): its output sha is not expected to match`);
  }
  rmSync(TMP, { recursive: true, force: true });
  const r = checkOverlay(m, OVL);
  console.log(`REBUILD ${m.pictures.length} pictures + ${Object.keys(m.code).length} code files into ${relative(WT, OVL)}`);
  report(r);
}
function report(r) {
  if (!r.bad.length) { console.log(`CHECK MATCH ${r.n}/${r.n}`); process.exit(0); }
  for (const b of r.bad) console.log(`CHECK MISMATCH ${b}`); console.log(`CHECK ${r.n - r.bad.length}/${r.n} match`); process.exit(1);
}
function selftest() {
  const ok = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`SELFTEST FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  ok(applyEdits('a /x.jpg b /x.jpg /y.png', [{ from: '/x.jpg', to: '/x.avif' }]), { text: 'a /x.avif b /x.avif /y.png', counts: { '/x.jpg': 2 } }, 'edits');
  ok(opOf({ to: '/a.avif', out: '87x130 2306', why: 'x-need 3.7 + AVIF' }, 'jpeg'), { resize: [87, 130], encode: 'avif' }, 'resize + avif');
  ok(opOf({ to: '/a.avif', out: '800x600 1', why: 'AVIF' }, 'png'), { resize: null, encode: 'avif' }, 'avif only');
  ok(opOf({ to: '/a.jpg', out: '80x60 1', why: 'x-need 2' }, 'jpeg'), { resize: [80, 60], encode: 'jpeg' }, 'resize jpeg');
  ok(opOf({ to: '/a.png', out: '80x60 1', why: 'x-need 2' }, 'png'), { resize: [80, 60], encode: 'png' }, 'resize png');
  console.log('SELFTEST ok (5 checks)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (a[0] === '--selftest') selftest();
  else if (a[0] === '--make-manifest') makeManifest(resolve(WT, arg('--from', 'out/end-bg/opt-B')));
  else if (a[0] === '--build' && a[1]) build(resolve(WT, a[1]), resolve(WT, arg('--base-overlay', 'fixes/end-bg/overlay')));
  else if (a[0] === '--check' && a[1]) report(checkOverlay(JSON.parse(readFileSync(MANIFEST, 'utf8')), resolve(WT, a[1])));
  else { console.log('usage: rebuild-b.mjs --make-manifest [--from d] | --build <dir> [--base-overlay d] | --check <overlay> | --selftest'); process.exit(a[0] === '--help' || a[0] === '-h' ? 0 : 2); }
}
