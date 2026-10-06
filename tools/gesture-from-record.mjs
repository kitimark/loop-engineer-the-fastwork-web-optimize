#!/usr/bin/env node
// A human finger record -> a gesture script for the robot finger (WDA), and the score of a replay against the human's
// scroll curve (incident I-218, article clips T-211, research/article-clips/README.md §1). Pure: reads JSON files,
// writes the script; no phone, no lock, no Chrome. Library and rules: tools/lib/gesture-from-record.mjs.
//
//   node tools/gesture-from-record.mjs <record.json> [--out <script.json>] [--name <n>] [--from <s>] [--to <s>]
//        [--overhead-ms <ms>] [--fling-min <px/s>] [--json]
//        # <record.json>: from `iphone.mjs record --touches` (touches + frames). --from/--to: seconds from the record's
//        # first frame; the contacts that START in the window. Writes the script (default <record>.gesture.json) after
//        # checking it with the gesture compiler, then prints:
//        #   SCRIPT <file> strokes N untils U estMs E hash H
//        #   STROKE s1 up 300 px / 296 ms fling (user: 300 px in 300 ms, lift 1900 px/s, starts at 0 ms) ...
//        #   DROPPED <at ms> <why>              (taps, a second finger, a down stroke near the top)
//        #   NOTE <text>                        (trimmed strokes, late strokes, where to position the page first)
//        #   EXPECT {"score":{...},"floor":{...},"tauS":...}   the scroll curve the script should produce (a MODEL: finger
//        #        past a 15 px slop, coast v*tau after a fling lift) against the user's: max/mean/p95 |dy| px; `floor` is
//        #        the user's own finger through the same model (the model's own error). The curve is in the script's
//        #        source.expected (every 100 ms, ms from the first touch).
//        # --overhead-ms: taken off every pause (the robot's per-stroke start latency); --fling-min: lift-off speed
//        # (px/s, default 200) from which a stroke is a fling.
//   node tools/gesture-from-record.mjs --compare <user-record.json> <replay.json> [--script <script.json>]
//        [--align auto|strokes|start] [--cross <y>,<y>...] [--max-dy <px>] [--seg <i>] [--json]
//        # <replay.json>: an `iphone.mjs gesture` (or sim.mjs gesture) output, or another record. Prints
//        #   FIDELITY {"align":..,"score":{"maxAbsDy","atMs","meanAbsDy","p95AbsDy","startDy","endDy"},"peak":..,
//        #             "strokes":[{k,userMs,replayMs,lagMs,userY,replayY,dy}],"crossings":[{y,userMs,replayMs,dMs}],..}
//        #   VERDICT OK|MISS (max |dy| <= --max-dy)   with --max-dy only; MISS exits 3
//        # strokes alignment (default when the touch sequences pair up; --script pairs the converter's strokes with the
//        # replay's touches): each stretch from one touchstart to the next takes its own touchstart's offset, so the
//        # robot's start latency does not count as a position error; `lagMs` per stroke shows it. start: first touch only.
// Exit: 0 ok, 1 error (a bad record, a refused script), 2 usage, 3 MISS.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { exitOnHelp } from './lib/help.mjs';
import { fromRecord, compare } from './lib/gesture-from-record.mjs';
import { compileScript } from './lib/gesture.mjs';
import { runMain } from './lib/exit.mjs';

exitOnHelp(import.meta.url);

const argv = process.argv.slice(2);
const VALUED = new Set(['out', 'name', 'from', 'to', 'overhead-ms', 'fling-min', 'script', 'align', 'cross', 'max-dy', 'seg']);
const opts = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (VALUED.has(k)) { const val = v ?? argv[++i]; if (val === undefined) usage(`--${k} needs a value`); opts[k] = val; }
    else if (k === 'compare' || k === 'json') opts[k] = true;
    else usage(`unknown option --${k}`);
  } else pos.push(a);
}
function usage(msg) { console.error(`${msg}\nusage: node tools/gesture-from-record.mjs <record.json> [--out f] [--name n] [--from s] [--to s] [--overhead-ms ms] [--fling-min px/s] [--json]\n       node tools/gesture-from-record.mjs --compare <user-record.json> <replay.json> [--script f] [--align auto|strokes|start] [--cross y,y] [--max-dy px] [--seg i] [--json]   (--help)`); process.exit(2); }
const num = (k, { min = -Infinity, int = false } = {}) => {
  if (opts[k] === undefined) return null;
  const n = Number(opts[k]);
  if (!Number.isFinite(n) || n < min || (int && !Number.isInteger(n))) usage(`--${k} must be a number${min > -Infinity ? ` >= ${min}` : ''}${int ? ' (integer)' : ''} (got ${opts[k]})`);
  return n;
};
const readJson = (f) => { try { return JSON.parse(readFileSync(resolve(f), 'utf8')); } catch (e) { console.error(`cannot read ${f}: ${e.message}`); process.exit(1); } };

runMain(async () => {
  if (opts.compare) {
    if (pos.length !== 2) usage('--compare wants <user-record.json> <replay.json>');
    const align = opts.align ?? 'auto';
    if (!['auto', 'strokes', 'start'].includes(align)) usage(`--align must be auto, strokes or start (got ${align})`);
    const cross = opts.cross === undefined ? [] : opts.cross.split(',').map((x) => { const n = Number(x); if (!Number.isFinite(n)) usage(`--cross wants scrollY values, e.g. 4000,5200 (got ${opts.cross})`); return n; });
    const script = opts.script ? readJson(opts.script) : null;
    if (script) compileScript(script);
    const res = compare(readJson(pos[0]), readJson(pos[1]), { script, align, cross, maxDy: num('max-dy', { min: 0 }), seg: num('seg', { min: 0, int: true }) });
    if (opts.json) console.log(JSON.stringify(res, null, 1));
    else {
      console.log(`FIDELITY ${JSON.stringify(res)}`);
      const s = res.score;
      console.log(`aligned on ${res.alignedOn} (${res.anchors} anchor${res.anchors === 1 ? '' : 's'}): max |dy| ${s.maxAbsDy} px at ${s.atMs} ms, mean ${s.meanAbsDy} px, p95 ${s.p95AbsDy} px, end ${s.endDy} px over ${s.n} frames; duration user ${res.durationMs.user} ms, replay ${res.durationMs.replay} ms`);
      for (const n of res.notes) console.log(`NOTE ${n}`);
    }
    if (res.verdict) console.log(`VERDICT ${res.verdict}`);
    return res.verdict === 'MISS' ? 3 : 0;
  }
  if (pos.length !== 1) usage('one record file, or --compare <user> <replay>');
  const file = resolve(pos[0]);
  const rec = readJson(file);
  const out = resolve(opts.out ?? file.replace(/\.json$/i, '') + '.gesture.json');
  const r = fromRecord(rec, {
    name: opts.name ?? basename(file).replace(/\.json$/i, ''), fromS: num('from', { min: 0 }), toS: num('to', { min: 0 }),
    overheadMs: num('overhead-ms', { min: 0, int: true }) ?? 0, flingMin: num('fling-min', { min: 1 }) ?? undefined, recordName: basename(file),
  });
  r.script.source.expected = { tauS: r.expected.tauS, tauFrom: r.expected.tauFrom, score: r.expected.score, floor: r.expected.floor, curve: r.expected.curve };
  const prog = compileScript(r.script);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(r.script, null, 1)}\n`);
  if (opts.json) { console.log(JSON.stringify({ out, hash: prog.hash, estMs: prog.estMs, strokes: r.strokes, dropped: r.dropped, notes: r.notes, expected: { tauS: r.expected.tauS, score: r.expected.score, floor: r.expected.floor } }, null, 1)); return 0; }
  console.log(`SCRIPT ${out} strokes ${prog.strokes.length} untils ${r.script.steps.filter((s) => s.type === 'until').length} estMs ${prog.estMs} hash ${prog.hash.slice(0, 12)}`);
  for (const s of r.strokes) console.log(`STROKE ${s.id} ${s.dir} ${s.px} px / ${s.ms} ms ${s.profile}${s.holdMs ? ` hold ${s.holdMs}` : ''} (user: ${s.userPx} px in ${s.userMs} ms${s.userLiftPxPerS ? `, lift ${s.userLiftPxPerS} px/s` : ''}${s.split ? `, part ${s.split}` : ''}${s.reversal ? `, turn ${s.reversal}` : ''}; starts at ${s.scriptStartMs} ms${s.lateMs > 0 ? `, ${s.lateMs} ms late` : ''}${s.until ? `, after until y>=${s.until}` : ''})`);
  for (const d of r.dropped) console.log(`DROPPED ${d.atMs} ms ${d.why}`);
  for (const n of r.notes) console.log(`NOTE ${n}`);
  console.log(`EXPECT ${JSON.stringify({ score: r.expected.score, floor: r.expected.floor, tauS: r.expected.tauS, tauFrom: r.expected.tauFrom })}`);
  return 0;
});
