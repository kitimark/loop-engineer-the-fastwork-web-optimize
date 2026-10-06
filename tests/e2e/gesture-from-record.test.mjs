// tools/gesture-from-record.mjs (incident I-218, article clips): the CLI end to end on a fixture finger record
// (tests/fixtures/finger-record.mjs): it writes a script that `iphone.mjs gesture --dry-run` accepts as is, prints
// SCRIPT / STROKE / DROPPED / NOTE / EXPECT, and --compare prints FIDELITY and a VERDICT (MISS exits 3). No phone, no
// WDA, no lock: iphone.mjs points at ports with nothing listening and a temp FW_STATE_DIR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, freePort } from '../helpers.mjs';
import { makeRecord, SCENE } from '../fixtures/finger-record.mjs';

const GFR = tool('gesture-from-record.mjs');

test('I-218: gesture-from-record.mjs writes a script iphone.mjs gesture --dry-run accepts, and says what it dropped and expects', async () => {
  const d = tempDir('fw-gfr-');
  const rec = join(d, 'me-finger-hero.json');
  writeFileSync(rec, JSON.stringify(makeRecord(SCENE)));
  const r = node(GFR, [rec]);
  assert.equal(r.code, 0, r.out);
  const out = join(d, 'me-finger-hero.gesture.json');
  assert.ok(existsSync(out), 'default output: <record>.gesture.json');
  assert.match(r.stdout, new RegExp(`^SCRIPT ${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} strokes 6 untils 1 estMs \\d+ hash [0-9a-f]{12}$`, 'm'));
  assert.match(r.stdout, /^STROKE s1 up 300 px \/ \d+ ms fling \(user: 300 px in \d+ ms, lift \d+ px\/s; starts at -?\d+ ms\)$/m);
  assert.match(r.stdout, /^STROKE s3 up 350 px \/ \d+ ms drag hold \d+ \(user: 350 px in \d+ ms, part 2\/2; starts at \d+ ms\)$/m);
  assert.match(r.stdout, /^DROPPED \d+ ms short: 3 px of finger travel/m);
  const exp = JSON.parse(r.stdout.match(/^EXPECT (.*)$/m)[1]);
  assert.ok(exp.score.meanAbsDy > 0 && exp.floor.meanAbsDy > 0 && exp.tauS > 0);
  const script = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(script.name, 'me-finger-hero');
  assert.equal(script.source.record, 'me-finger-hero.json');
  assert.ok(script.source.expected.curve.length > 50, 'the expected curve is in the script');
  // the gesture runner's own dry run accepts it (compiles, prints the hash and budget); nothing reaches a phone
  const env = { FW_STATE_DIR: tempDir('fw-gfr-state-'), FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_WDA_URL: `http://127.0.0.1:${await freePort()}` };
  const dry = node(tool('iphone.mjs'), ['gesture', out, '--dry-run'], { env });
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /^GESTURE_HASH [0-9a-f]{64}$/m);
  assert.match(dry.out, /me-finger-hero v1 hash [0-9a-f]{12} .*: 6 strokes/);
  // --out, --name, a window, --json
  const j = node(GFR, [rec, '--out', join(d, 'w.json'), '--name', 'down only', '--from', '7', '--to', '10', '--json']);
  assert.equal(j.code, 0, j.out);
  const jr = JSON.parse(j.stdout);
  assert.equal(jr.strokes.length, 1);
  assert.equal(JSON.parse(readFileSync(join(d, 'w.json'), 'utf8')).name, 'down-only');
  assert.ok(jr.notes.some((n) => /position the page at scrollY \d+/.test(n)));
  // errors: no touches (exit 1, says how to record them), bad usage (exit 2)
  const plain = join(d, 'plain.json');
  const pr = makeRecord(SCENE); delete pr.touches;
  writeFileSync(plain, JSON.stringify(pr));
  const e = node(GFR, [plain]);
  assert.equal(e.code, 1, e.out);
  assert.match(e.stderr, /record --touches/);
  assert.equal(node(GFR, [rec, '--from', 'x']).code, 2);
  assert.equal(node(GFR, [rec, '--bogus']).code, 2);
});

test('I-218: gesture-from-record.mjs --compare prints FIDELITY; --max-dy gives VERDICT OK (exit 0) or MISS (exit 3)', () => {
  const d = tempDir('fw-gfr-');
  const user = makeRecord(SCENE);
  const uf = join(d, 'user.json'), same = join(d, 'same.json'), off = join(d, 'off.json');
  writeFileSync(uf, JSON.stringify(user));
  // a gesture run doc that replays the user's own curve, and one that ends 150 px further
  const doc = (dy) => ({ meta: { kind: 'gesture' }, run: { segments: [{ frames: user.frames.map((f) => [f[0], f[1], f[2] + (f[0] > 17000 ? dy : 0), f[3]]), touches: user.touches, marks: [] }] } });
  writeFileSync(same, JSON.stringify(doc(0)));
  writeFileSync(off, JSON.stringify(doc(150)));
  let r = node(GFR, ['--compare', uf, same, '--max-dy', '20', '--cross', '1000,1500']);
  assert.equal(r.code, 0, r.out);
  const f = JSON.parse(r.stdout.match(/^FIDELITY (.*)$/m)[1]);
  assert.equal(f.align, 'strokes');
  assert.equal(f.score.maxAbsDy, 0);
  assert.deepEqual(f.crossings.map((c) => c.dMs), [0, 0]);
  assert.match(r.stdout, /^VERDICT OK$/m);
  r = node(GFR, ['--compare', uf, off, '--max-dy', '20']);
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^VERDICT MISS$/m);
  assert.match(r.stdout, /max \|dy\| 150 px/);
  r = node(GFR, ['--compare', uf, off, '--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(r.stdout).score.endDy, 150);
  assert.equal(node(GFR, ['--compare', uf]).code, 2);
  assert.equal(node(GFR, ['--compare', uf, same, '--align', 'sideways']).code, 2);
});
