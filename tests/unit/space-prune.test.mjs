// I-124 auto-clean (tools/lib/space-prune.mjs; user T-049 #27): one test per keep rule. Only three classes may go
// (leftover Chrome profiles, uncited full-frame image files after a record and thumbnails, rebuildable snapshot
// copies); every .json/.md/log, recordings, phone records, cited, fresh or held paths stay. Fixture checkouts in a temp
// dir, injected processes/open files/citations; the prune log goes to a temp $FW_STATE_DIR.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, utimesSync, statSync, chmodSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir, git } from '../helpers.mjs';

const P = await import('../../tools/lib/space-prune.mjs');
const NOW = Date.parse('2026-10-04T12:00:00Z');
const OLD = NOW - 2 * P.DAY_MS;
let root, state, wtA, tmpRoot, scratch;
const saved = {};

beforeEach(() => {
  root = tempDir('fw-prune-');
  state = join(root, 'state');
  wtA = join(root, 'wt-a');
  tmpRoot = join(root, 'tmp');
  scratch = join(root, 'scratch');
  for (const d of [state, join(root, 'main', 'out'), join(wtA, 'out'), tmpRoot, scratch]) mkdirSync(d, { recursive: true });
  for (const k of ['FW_STATE_DIR', 'FW_SPACE_AUTOPRUNE', 'FW_SIPS', 'FW_LSOF']) saved[k] = process.env[k];
  process.env.FW_STATE_DIR = state;
});
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

const put = (p, body = 'x') => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); return p; };
/** Set every mtime under `p` (files first, then folders) to `t`. */
function age(p, t = OLD) {
  const st = statSync(p);
  if (st.isDirectory()) for (const e of readdirSync(p)) age(join(p, e), t);
  utimesSync(p, t / 1000, t / 1000);
}
const wts = () => [{ path: join(root, 'main'), head: null, branch: 'main', main: true }, { path: wtA, head: null, branch: 'worktree-a', main: false }];
const plan = (o = {}) => P.planPrune({ mainRoot: join(root, 'main'), now: NOW, wts: wts(), cites: new Map(), procs: [], open: [], scratchRoots: [scratch], tmpRoot, committed: new Set(), ...o });
const paths = (pl, cls) => pl.candidates.filter((c) => !cls || c.cls === cls).map((c) => c.path).sort();
const keptWhy = (pl, p) => pl.kept.find((k) => k.path === p)?.why;
const copyThumb = (src, dst) => { copyFileSync(src, dst); return true; };
const shots = (dir, n = 5, extra = true) => {
  for (let i = 0; i < n; i++) put(join(dir, `frame-${String(i).padStart(3, '0')}.png`), 'P'.repeat(1000 + i));
  if (extra) { put(join(dir, 'result.json'), '{"ok":true}'); put(join(dir, 'notes.md'), '# notes'); put(join(dir, 'run.log'), 'log'); put(join(dir, 'sub', 'deep.png'), 'D'); }
  age(dir);
  return dir;
};
const inside = (p, d) => p === d || p.startsWith(d + '/');
const logLines = () => readFileSync(P.pruneLogFile(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('auto-clean is on by default; FW_SPACE_AUTOPRUNE=0 turns it off', () => {
  assert.equal(P.autoPruneEnabled({}), true);
  assert.equal(P.autoPruneEnabled({ FW_SPACE_AUTOPRUNE: '1' }), true);
  assert.equal(P.autoPruneEnabled({ FW_SPACE_AUTOPRUNE: '0' }), false);
  assert.equal(P.pruneLogFile(), join(state, 'space', 'prune.log'));
});

test('frames: old, uncited image files go after a record and thumbnails; JSON, Markdown, logs and subfolders stay; the log keeps size', () => {
  const d = shots(join(wtA, 'out', 'cd-strip', 'simpx', '20261001-0101'));
  const pl = plan();
  assert.deepEqual(paths(pl, 'frames'), [d]);
  const c = pl.candidates[0];
  assert.equal(c.bytes, 5 * 1000 + 10);
  const res = P.applyPrune(pl, { by: 'test', now: NOW, thumb: copyThumb });
  assert.equal(res.removed.length, 1);
  for (let i = 0; i < 5; i++) assert.equal(existsSync(join(d, `frame-00${i}.png`)), false);
  for (const f of ['result.json', 'notes.md', 'run.log', 'sub/deep.png']) assert.ok(existsSync(join(d, f)), `${f} stays`);
  const rec = JSON.parse(readFileSync(join(d, P.RECORD), 'utf8'));
  assert.equal(rec.images.length, 5);
  assert.deepEqual(rec.images.map((x) => x.bytes), [1000, 1001, 1002, 1003, 1004]);
  assert.equal(rec.thumbs.files.length, P.THUMBS);
  for (const f of rec.thumbs.files) assert.ok(existsSync(join(d, P.THUMB_DIR, f)));
  const [l] = logLines();
  assert.deepEqual([l.cls, l.bytes, l.files, l.by, l.record, l.thumbs], ['frames', 5010, 5, 'test', P.RECORD, 4]);
  assert.match(l.path, /wt-a\/out\/cd-strip\/simpx\/20261001-0101$/);
  // the next plan finds nothing there (the thumbnails folder is never a frames folder)
  assert.deepEqual(paths(plan(), 'frames'), []);
});

test('keep: a folder with only JSON, Markdown and logs, or fewer than MIN_FRAMES images, is no frames folder', () => {
  const d = join(wtA, 'out', 'ab', 'run1');
  put(join(d, 'verify.json'), '{}'); put(join(d, 'results.json'), '{}'); put(join(d, 'README.md'), 'x'); put(join(d, 'serve.log'), 'x');
  put(join(d, 'a.png')); put(join(d, 'b.png'));
  age(join(wtA, 'out'));
  assert.deepEqual(paths(plan()), []);
});

test('keep: frames cited by committed text (the folder, a file in it, or a folder above it)', () => {
  const a = shots(join(wtA, 'out', 'pixels', 'a'));
  const b = shots(join(wtA, 'out', 'pixels', 'b'));
  const c = shots(join(wtA, 'out', 'check', 'c'));
  const cites = new Map([['out/pixels/a', ['fixes/x/README.md']], ['out/pixels/b/frame-002.png', ['research/y/README.md']], ['out/check', ['fixes/z/results.json']]]);
  const pl = plan({ cites });
  assert.deepEqual(paths(pl), []);
  assert.match(keptWhy(pl, a), /^cited by fixes\/x\/README\.md/);
  assert.match(keptWhy(pl, b), /^cited by research\/y\/README\.md/);
  assert.match(keptWhy(pl, c), /^cited by fixes\/z\/results\.json/);
});

test('keep: anything written within the last day (a live agent\'s fresh output)', () => {
  const d = shots(join(wtA, 'out', 'sim', 'shots'));
  utimesSync(join(d, 'result.json'), (NOW - 3600e3) / 1000, (NOW - 3600e3) / 1000);
  const pl = plan();
  assert.deepEqual(paths(pl), []);
  assert.match(keptWhy(pl, d), /written 1 h ago/);
  assert.deepEqual(paths(plan({ now: NOW + 2 * P.DAY_MS }), 'frames'), [d], 'a day later it may go');
});

test('keep: a folder a running process holds open, or names on its command line; everything when lsof failed', () => {
  const d = shots(join(wtA, 'out', 'bench', 'shots'));
  assert.match(keptWhy(plan({ open: [join(d, 'frame-001.png')] }), d), /^held open by a process/);
  assert.match(keptWhy(plan({ procs: [{ pid: 999999, command: `node probe.mjs --out out/bench/shots --x 1` }] }), d), /a running process names it/);
  assert.match(keptWhy(plan({ open: null }), d), /lsof failed/);
  assert.deepEqual(paths(plan()), [d]);
});

test('I-192: a process naming the same out/ folder of ANOTHER checkout (absolute path) does not keep this one; relative and own absolute names still do', () => {
  const d = shots(join(wtA, 'out', 'bench', 'shots'));
  // the other npm test run's prune makes thumbnails from its own temp repo's frames
  const foreign = [{ pid: 999998, command: `sips -Z 320 /private/var/folders/x/T/fw-other-repo/.claude/worktrees/px-wt/out/bench/shots/frame-001.png --out /t/a.png` }];
  assert.deepEqual(paths(plan({ procs: foreign })), [d], 'another checkout\'s folder of the same name');
  assert.deepEqual(paths(plan({ procs: [{ pid: 999997, command: 'node probe.mjs --out other/out/bench/shots' }] })), [d]);
  for (const command of [`node probe.mjs --out ./out/bench/shots/x.png`, `node probe.mjs --out=out/bench/shots`, `node probe.mjs "out/bench/shots"`, `sips ${join(d, 'frame-001.png')}`, `node probe.mjs out/bench/shots`]) {
    assert.match(keptWhy(plan({ procs: [{ pid: 999996, command }] }), d), /a running process names it/, command);
  }
});

test('keep: recordings and phone records (iphone-screen, ioscap, iphone), certs, Try-it pages', () => {
  for (const top of ['iphone-screen', 'ioscap', 'iphone', 'certs', 'tryit']) shots(join(join(root, 'main', 'out'), top, 'x'));
  put(join(root, 'main', 'out', 'iphone-screen', 'run.mov'), 'MOV');
  put(join(root, 'main', 'out', 'iphone-screen', 'run.result.json'), '{}');
  put(join(root, 'main', 'out', 'iphone-screen', 'run.frames.json'), '{}');
  age(join(root, 'main', 'out'));
  const pl = plan();
  assert.deepEqual(paths(pl), []);
  P.applyPrune(pl, { now: NOW, thumb: copyThumb });
  for (const f of ['run.mov', 'run.result.json', 'run.frames.json']) assert.ok(existsSync(join(root, 'main', 'out', 'iphone-screen', f)));
});

test('I-275: deploy sources, article material and archives are never frames; only known measurement-frame folders are', () => {
  const out = join(root, 'main', 'out');
  const real = shots(join(out, 'v10', 'px-mobile-2026-10-06T05-06-24-000Z'));
  const tool = shots(join(wtA, 'out', 'check', 'gpu-preview', '2026-10-05T01-02-03-004Z'));
  // the 2026-10-12 deletions: named top-level trees (in every checkout's out/)
  const named = ['cf-review/original/notes', 'pages-export/builds/v7', 'pages-repo/console/proposals/PR-022', 'article/medium-kit', 'article-shots',
    'people-blink', 'lead/shots', 'tryit/a/sim', 'archive/agent-x/out/sim', 'pruned-records/pages-export/shared'].map((r) => shots(join(out, r)));
  named.push(shots(join(wtA, 'out', 'cf-review', 'optimized', 'px-sim')));
  // a dir holding a deploy marker, or under one, whatever its name
  const deploy = [];
  for (const m of ['wrangler.jsonc', 'wrangler.toml', '_headers', 'index.html', 'package.json']) {
    const top = join(out, `demo-${m.replace(/\W/g, '')}`);
    deploy.push(shots(join(top, 'public', 'shots')));
    put(join(top, m), 'x');
    const self = join(out, `self-${m.replace(/\W/g, '')}`, 'sim');
    put(join(self, m), 'x');
    deploy.push(shots(self));
  }
  const unknown = shots(join(out, 'misc', 'gallery'));
  age(out); age(join(wtA, 'out'));
  const pl = plan();
  assert.deepEqual(paths(pl, 'frames'), [real, tool].sort());
  for (const d of [...named, ...deploy, unknown]) assert.equal(pl.candidates.some((c) => inside(c.path, d) || inside(d, c.path)), false, d);
  for (const d of deploy) assert.match(keptWhy(pl, d) || 'not listed', /deploy tree|not listed/, d);
  assert.match(keptWhy(pl, unknown), /not a known measurement-frame folder/);
  const res = P.applyPrune(pl, { now: NOW, thumb: copyThumb });
  assert.equal(res.removed.length, 2);
  for (const d of [...named, ...deploy, unknown]) assert.equal(readdirSync(d).filter((f) => f.endsWith('.png')).length, 5, `${d} keeps its images`);
});

test('I-275: frameScope names why a folder is out of scope; applyPrune re-checks it before deleting', () => {
  const out = join(root, 'main', 'out');
  assert.equal(P.frameScope(out, join(out, 'sim', 'shots')), null);
  assert.equal(P.frameScope(out, join(out, 'g0-gpu', 'seek-a-c3')), null);
  assert.match(P.frameScope(out, join(out, 'pages-export', 'sim')), /never cleaned/);
  assert.match(P.frameScope(out, join(out, 'article-gifs', 'px')), /never cleaned/);
  assert.match(P.frameScope(out, join(out, 'notes')), /not a known measurement-frame folder/);
  assert.match(P.frameScope(out, out), /not inside/);
  assert.match(P.frameScope(out, join(root, 'elsewhere', 'sim')), /not inside/);
  const site = shots(join(out, 'cf2', 'public', 'px-sim'));
  put(join(out, 'cf2', 'wrangler.jsonc'), '{}');
  assert.match(P.frameScope(out, site), /deploy tree \(out\/cf2\/wrangler\.jsonc\)/);
  // a stale or hand-made plan entry for it is skipped, nothing deleted
  const pl = plan();
  pl.candidates.push({ cls: 'frames', path: site, show: 'cf2', bytes: 1, images: readdirSync(site).filter((f) => f.endsWith('.png')) });
  const res = P.applyPrune(pl, { now: NOW, thumb: copyThumb });
  assert.deepEqual(res.skipped.map((s) => s.why), ['deploy tree (out/cf2/wrangler.jsonc)']);
  assert.equal(readdirSync(site).filter((f) => f.endsWith('.png')).length, 5);
  assert.equal(existsSync(join(site, P.RECORD)), false);
});

test('keep: no thumbnail could be made, so no image is removed', () => {
  const d = shots(join(wtA, 'out', 'pixels', 'n'));
  const res = P.applyPrune(plan(), { now: NOW, thumb: () => false });
  assert.deepEqual([res.removed.length, res.skipped.length], [0, 1]);
  assert.match(res.skipped[0].why, /no thumbnail/);
  assert.equal(readdirSync(d).filter((f) => f.endsWith('.png')).length, 5);
  assert.equal(existsSync(join(d, P.RECORD)), false);
  assert.equal(existsSync(join(d, P.THUMB_DIR)), false);
});

test('sipsThumb runs $FW_SIPS (-Z px src --out dst) and needs dst to exist', () => {
  const fake = put(join(root, 'fake-sips.sh'), '#!/bin/sh\ncp "$3" "$5"\n');
  chmodSync(fake, 0o755);
  const src = put(join(root, 'a.png'), 'PNG');
  assert.equal(P.sipsThumb(src, join(root, 'b.png'), 320, { FW_SIPS: fake }), true);
  assert.equal(readFileSync(join(root, 'b.png'), 'utf8'), 'PNG');
  assert.equal(P.sipsThumb(src, join(root, 'c.png'), 320, { FW_SIPS: '/usr/bin/false' }), false);
  assert.deepEqual(P.spread([1, 2, 3, 4, 5, 6, 7, 8, 9]), [1, 4, 6, 9]);
  assert.deepEqual(P.spread([1, 2]), [1, 2]);
});

test('profiles: an old leftover temp profile goes (out/, scratch, our marked one in the temp dir); reused, in-use, unmarked temp-dir ones stay', () => {
  const mk = (d, marker = true) => { put(join(d, 'Local State'), '{}'); put(join(d, 'Default', 'Cache', 'big.bin'), 'C'.repeat(4096)); if (marker) put(join(d, '.fw-temp-profile.json'), JSON.stringify({ schema: 'fw-temp-profile/1', dir: d, pid: 999999 })); age(d); return d; };
  const leftover = mk(join(wtA, 'out', 'chrome-ab-123-0a1b2c3d'));
  const probe = mk(join(wtA, 'out', 'probe-profile'), false);
  const reused = mk(join(root, 'main', 'out', 'chrome-verify-profile'), false);
  const inUse = mk(join(wtA, 'out', 'chrome-x-77-deadbeef'));
  const scr = mk(join(scratch, 'topic', 'chrome-p'));
  const tmpOurs = mk(join(tmpRoot, 'fw-chrome-1-aaaa0000'));
  const tmpOther = mk(join(tmpRoot, 'someone-elses'), false);
  const procs = [{ pid: 4242, command: `/Applications/Chrome --user-data-dir=${inUse} --headless` }];
  const pl = plan({ procs });
  assert.deepEqual(paths(pl, 'profile'), [leftover, probe, scr, tmpOurs].sort());
  assert.match(keptWhy(pl, reused), /reuses it on purpose/);
  assert.match(keptWhy(pl, inUse), /in use by pid 4242/);
  assert.equal(pl.kept.some((k) => k.path === tmpOther) || pl.candidates.some((c) => c.path === tmpOther), false, 'an unmarked temp-dir folder is not even looked at');
  const res = P.applyPrune(pl, { now: NOW, thumb: copyThumb });
  assert.equal(res.removed.length, 4);
  for (const d of [leftover, probe, scr, tmpOurs]) assert.equal(existsSync(d), false);
  for (const d of [reused, inUse, tmpOther]) assert.ok(existsSync(d));
  assert.ok(logLines().every((l) => l.cls === 'profile' && l.bytes > 0));
});

test('profiles: fresh ones and cited ones stay', () => {
  const d = join(wtA, 'out', 'chrome-q-1-00000000');
  put(join(d, 'Local State'), '{}');
  assert.match(keptWhy(plan(), d), /written/);
  age(d);
  assert.match(keptWhy(plan({ cites: new Map([['out/chrome-q-1-00000000', ['research/r/README.md']]]) }), d), /^cited by/);
  assert.match(keptWhy(plan({ cites: new Map([['out/chrome-q-1-00000000/Default/x.json', ['research/r/README.md']]]) }), d), /^cited by/, 'a file in it');
  // a profile is a browser cache: a citation of a folder above it does not keep it (frames, by contrast, are kept)
  const p2 = join(wtA, 'out', 'rest', 'chrome', 'rest-rot-1-22222222');
  put(join(p2, 'Local State'), '{}'); age(p2);
  assert.deepEqual(paths(plan({ cites: new Map([['out/rest', ['fixes/rest/README.md']]]) }), 'profile'), [d, p2].sort());
});

const snapshot = (name, body = 'console.log(1)') => {
  const h = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const d = join(root, 'main', 'out', 'snapshots', `${name}-${h}`);
  put(join(d, '_app', 'immutable', 'nodes', '2.js'), body);
  put(join(d, 'index.html'), '<html>');
  age(d);
  return { d, h };
};

test('snapshots: a rebuildable copy (hash pinned in committed text, a file matches it) goes; mismatch, unpinned, served, cited, fresh stay', () => {
  const ok = snapshot('best');
  const unpinned = snapshot('wip', 'other');
  const bad = join(root, 'main', 'out', 'snapshots', 'liar-0123456789ab');
  put(join(bad, 'x.js'), 'nope'); age(bad);
  const committed = new Set([ok.h, '0123456789ab']);
  let pl = plan({ committed });
  assert.deepEqual(paths(pl, 'snapshot'), [ok.d]);
  assert.match(keptWhy(pl, unpinned.d), /appears in no committed/);
  assert.match(keptWhy(pl, bad), /no file in it hashes/);
  const rel = `out/snapshots/best-${ok.h}`;
  assert.match(keptWhy(plan({ committed, procs: [{ pid: 31337, command: `node tools/serve.mjs --root ${rel} --port auto` }] }), ok.d), /running process names it/);
  assert.match(keptWhy(plan({ committed, cites: new Map([[rel, ['research/p/PREDICTIONS.md']]]) }), ok.d), /^cited by research\/p\/PREDICTIONS\.md/);
  assert.match(keptWhy(plan({ committed, now: OLD + 3600e3 }), ok.d), /written 1 h ago/);
  const res = P.applyPrune(pl, { now: NOW, thumb: copyThumb });
  assert.equal(res.removed.length, 1);
  assert.equal(existsSync(ok.d), false);
  assert.ok(existsSync(unpinned.d) && existsSync(bad));
});

test('committedHashes: finds pinned snapshot hashes in committed fixes/ and research/ text only', () => {
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  put(join(repo, 'research', 'p', 'PREDICTIONS.md'), 'build best-65052c4a3902 was measured\n');
  put(join(repo, 'tools', 'x.md'), 'aaaaaaaaaaaa\n');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'x');
  assert.deepEqual([...P.committedHashes(repo, ['65052c4a3902', 'aaaaaaaaaaaa', 'bbbbbbbbbbbb'])], ['65052c4a3902']);
  assert.deepEqual([...P.committedHashes(repo, [])], []);
});

test('applyPrune checks again: a path outside the scanned roots, or gone, or no longer a profile, is skipped', () => {
  const d = join(wtA, 'out', 'chrome-z-1-11111111');
  put(join(d, 'Local State'), '{}'); age(d);
  const pl = plan();
  const outside = join(root, 'elsewhere', 'chrome-y');
  put(join(outside, 'Local State'), '{}');
  pl.candidates.push({ cls: 'profile', path: outside, show: 'elsewhere', bytes: 1 });
  pl.candidates.push({ cls: 'profile', path: join(wtA, 'out', 'gone'), show: 'gone', bytes: 1 });
  const notProfile = put(join(wtA, 'out', 'plain', 'a.txt'));
  pl.candidates.push({ cls: 'profile', path: dirname(notProfile), show: 'plain', bytes: 1 });
  pl.candidates.push({ cls: 'profile', path: join(wtA, 'out'), show: 'out', bytes: 1 });
  const res = P.applyPrune(pl, { now: NOW, thumb: copyThumb });
  assert.deepEqual(res.removed.map((x) => x.cls), ['profile']);
  assert.deepEqual(res.skipped.map((x) => x.why).sort(), ['gone already', 'no longer a Chrome profile', 'outside the scanned roots', 'outside the scanned roots']);
  assert.ok(existsSync(outside) && existsSync(notProfile) && existsSync(join(wtA, 'out')));
});

test('runPrune: a dry run deletes nothing; --apply takes the run file, refuses beside a live prune, takes over a dead one', () => {
  const d = shots(join(wtA, 'out', 'pixels', 'q'));
  const o = { mainRoot: join(root, 'main'), now: NOW, wts: wts(), cites: new Map(), procs: [], open: [], scratchRoots: [scratch], tmpRoot, committed: new Set(), thumb: copyThumb };
  const dry = P.runPrune(o);
  assert.deepEqual([dry.plan.candidates.length, dry.result], [1, null]);
  assert.ok(existsSync(join(d, 'frame-000.png')) && !existsSync(P.pruneLogFile()));
  mkdirSync(dirname(P.runFile()), { recursive: true });
  writeFileSync(P.runFile(), JSON.stringify({ pid: process.ppid, by: 'other' }));
  assert.equal(P.runPrune({ ...o, apply: true }).busy.by, 'other');
  assert.ok(existsSync(join(d, 'frame-000.png')));
  writeFileSync(P.runFile(), JSON.stringify({ pid: 2 ** 22 + 12345, by: 'dead' }));
  const r = P.runPrune({ ...o, apply: true, by: 'lead' });
  assert.equal(r.result.removed.length, 1);
  assert.equal(existsSync(P.runFile()), false);
  assert.deepEqual(JSON.parse(readFileSync(P.lastFile(), 'utf8')).removed, 1);
});

test('renderPlan: a dry-run text with the classes, sizes and why things stay', () => {
  shots(join(wtA, 'out', 'pixels', 'r'));
  const kept = shots(join(wtA, 'out', 'pixels', 's'));
  const txt = P.renderPlan(plan({ cites: new Map([['out/pixels/s', ['fixes/a/README.md']]]) }));
  assert.match(txt, /^PRUNE PLAN 2026-10-04T12:00Z: 1 item\(s\)/);
  assert.match(txt, /full-frame image files .*: 1 = 5 KB/);
  assert.match(txt, /kept \(why\):\n\s+1\s+frames: cited/);
  assert.ok(existsSync(join(kept, 'frame-000.png')));
});
