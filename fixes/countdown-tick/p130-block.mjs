// countdown-tick P-130: build block.json for p130-read.mjs from the holds' manifest (phone/hold.sh writes one line per
// run and one end line per part). A run takes its part's end line: VOID part -> holdVoid <why>; valid part -> thermal
// start/end "serious" (hold.sh's gates are --expect serious --accept-induced, exit 0 = Serious and induced). The logger
// value is the gesture result's inject[0].value (phone-logger.mjs read()). A run whose part never wrote an end line
// (killed) gets holdVoid "no end line".
//   node fixes/countdown-tick/p130-block.mjs [out/countdown-tick/p130/runs/manifest.jsonl] > out/countdown-tick/p130/block.json
//   node fixes/countdown-tick/p130-block.mjs --selftest
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO } from '../../tools/lib/paths.mjs';

export function build(lines, readJson) {
  const runs = [];
  lines.forEach((l, i) => {
    if (l.end) return;
    const end = lines.slice(i + 1).find((e) => e.end && e.hold === l.hold);
    let logger = null, why = null;
    try {
      const g = readJson(l.file), inj = g?.inject ?? g?.run?.inject ?? [];
      const v = inj[0]?.value;
      logger = typeof v === 'string' ? JSON.parse(v) : v ?? null;
      if (!logger) why = 'no logger value in the gesture result';
    } catch (e) { why = `gesture result unreadable: ${e.message}`; }
    const ok = end && end.void === null;
    runs.push({ item: l.item, hold: l.hold, arm: l.arm, counted: l.counted, startedAt: l.startedAt,
      thermal: ok ? { start: 'serious', end: 'serious' } : { start: end ? 'see holdVoid' : 'unknown', end: end ? 'see holdVoid' : 'unknown' },
      holdVoid: !end ? 'no end line' : end.void, gestureExit: l.exit, idleRafFps: end?.idleRafFps ?? null,
      ...(why ? { note: why } : {}), logger: logger ?? {} });
  });
  return { ticket: 'P-130', runs };
}

function selftest() {
  const lines = [
    { hold: 'H1', item: 'wC', arm: 'C', counted: false, startedAt: 'x', file: 'a', exit: 0 },
    { hold: 'H1', item: 'gC1', arm: 'C', counted: true, startedAt: 'x', file: 'b', exit: 0 },
    { hold: 'H1', end: true, void: null, idleRafFps: 59.9, gateStart: 0, gateEnd: 0 },
    { hold: 'H2', item: 'gV2', arm: 'V', counted: true, startedAt: 'x', file: 'c', exit: 0 },
    { hold: 'H2', end: true, void: 'end gate exit 2' },
    { hold: 'H3', item: 'gV3', arm: 'V', counted: true, startedAt: 'x', file: 'd', exit: 1 },
  ];
  const files = { a: { inject: [{ value: '{"n":1}' }] }, b: { inject: [{ value: { n: 2 } }] }, c: { run: { inject: [{ value: { n: 3 } }] } }, d: {} };
  const b = build(lines, (f) => files[f]);
  const checks = [
    ['4 runs', b.runs.length === 4],
    ['string value parsed', b.runs[0].logger.n === 1 && b.runs[0].counted === false],
    ['valid part -> serious/serious, no holdVoid', b.runs[1].thermal.start === 'serious' && b.runs[1].holdVoid === null],
    ['void part -> holdVoid', b.runs[2].holdVoid === 'end gate exit 2' && b.runs[2].logger.n === 3],
    ['no end line -> holdVoid, no logger -> note', b.runs[3].holdVoid === 'no end line' && /no logger/.test(b.runs[3].note)],
    ['idle sentinel fps carried from the end line (null without one)', b.runs[1].idleRafFps === 59.9 && b.runs[2].idleRafFps === null && b.runs[3].idleRafFps === null],
  ];
  let pass = 0; for (const [n, ok] of checks) { pass += ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); }
  console.log(`SELFTEST ${pass}/${checks.length}`); process.exit(pass === checks.length ? 0 : 1);
}

if (process.argv[2] === '--selftest') selftest();
else {
  const f = resolve(REPO, process.argv[2] || 'out/countdown-tick/p130/runs/manifest.jsonl');
  if (!existsSync(f)) { console.error(`no manifest ${f}`); process.exit(4); }
  const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log(JSON.stringify(build(lines, (p) => JSON.parse(readFileSync(resolve(REPO, p), 'utf8'))), null, 1));
}
