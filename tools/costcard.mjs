#!/usr/bin/env node
// Rendering cost card (incident I-083; user T-029 #23; design research/architecture/isolated-measurement/README.md §6).
// Reads records the harnesses already saved and writes <out>.json and <out>.md: one row per animated element/event type,
// five fields (1 thread, 2 layers and memory, 3 repaint area x rate, 4 layout, 5 script) per arm, per element event.
// Counts only: no ms is judged. It drives no browser and takes no lock (it only reads files).
//
//   node tools/costcard.mjs --records <file|dir> [...] [--trace <arm>[/full|/freeze]=<trace.json>] [...]
//        [--timeline <arm>[/full|/freeze]=<timeline.json>] [...] [--spec <spec.json>] [--topic t]
//        [--arms C,V,D] [--control C] [--aa C2] [--element <name>]
//        [--event fire:<url part>:<1-based line> | mark[:<prefix>] | frame | times:<name>]
//        [--instances 1 | C=1,S=2] [--period-ms 1000] [--tolerance-ms 150] [--min-events 4] [--per-frame hold,...]
//        [--code <url part>:<from>-<to>] [--nodes key,...] [--rect-key key] [--script-from-frz "<check that passed>"]
//        [--dpr 3] [--out <prefix>] [--print]
//
// Inputs (a directory means every *.json in it):
//   --records   {loads: [...]} (generic; fix-nav-morph costcard-chrome.mjs output as is), {results: [...]} (P-076
//               tick-probe records: fires0/fires1/cd), or one load object. A load: {arm|build, rep, mode: full|freeze,
//               engine: chrome|sim, void?, error?, hashMismatch?, elementRuns? (FRZ "element still runs" check, alias
//               countdownScreenChanges), timers?, trace?: <path> (Chrome {traceEvents}: verify.mjs --save-trace),
//               timeline?: <path> (Sim {syncT, syncTL, recs}: iphone.mjs/sim.mjs --timeline), windows?: [pre-cut
//               per-event counts], eventTimes?: {name: [stamps]}, census?: <path>|{...}, nodeIds?: {key: [backend node
//               ids]}, rect?|rects?: {x,y,w,h} (Sim root-view CSS px), layerScale?}. Paths resolve against the file.
//   --trace / --timeline   one raw file as one load of <arm> (rep = order given).
// Spec (--spec, flags override): {topic, arms, control, aa, dpr, scriptFromFrz, rows: [{element, event: {kind: fire|
//   mark|frame|times, name, url, line, instances, periodMs, toleranceMs, minEvents, prefix, endKind, perFrame: [kinds]},
//   code: {url, lines: [from, to]}, nodes: [keys], census: [keys], rectKey}]}.
// Event cutting (README §6.3 step 4, ported from judge-tick.mjs perLoad(), P-076): fire events at the element's own
//   callback line, T instances -> spans [f_i, f_(i+T)), partial ends dropped, VOID rules kept; mark events = a probe's
//   console.timeStamp markers (a window runs to the next marker); frame = per main/rendering frame.
// Output default: fixes/<topic>/costcard.{json,md} when --topic names an existing fixes/<topic>/, else out/costcard/
// costcard-<topic|card>.{json,md}. Exit 0 written, 1 no usable load, 2 usage.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, basename, isAbsolute } from 'node:path';
import { buildCard, renderMarkdown, fmt } from './lib/costcard.mjs';

const argv = process.argv.slice(2);
const usage = () => { console.error('usage: node tools/costcard.mjs --records <file|dir>... | --trace <arm>=<file> | --timeline <arm>=<file> [--spec f] [--topic t] [--arms C,V] [--control C] [--aa C2] [--element name] [--event fire:<url>:<line>|mark[:<prefix>]|frame|times:<name>] [--code <url>:<a>-<b>] [--out prefix] (see the header of tools/costcard.mjs)'); process.exit(2); };
const all = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : a.startsWith(`--${n}=`) ? [a.slice(n.length + 3)] : []));
const opt = (n, d) => { const v = all(n); return v.length ? v[v.length - 1] : d; };
if (argv.includes('--help') || argv.includes('-h')) usage();
for (const n of ['records', 'trace', 'timeline', 'spec', 'topic', 'arms', 'control', 'aa', 'element', 'event', 'instances', 'period-ms', 'tolerance-ms', 'min-events', 'per-frame', 'code', 'nodes', 'rect-key', 'script-from-frz', 'dpr', 'out']) {
  const i = argv.indexOf(`--${n}`);
  if (i >= 0 && (argv[i + 1] == null || argv[i + 1].startsWith('--'))) { console.error(`--${n} needs a value`); usage(); }
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
// card inputs name files relative to the cwd (never an absolute home path: Hard rule 12)
const shown = (f) => { const r = relative(process.cwd(), f); return r && !r.startsWith('..') && !isAbsolute(r) ? r : basename(f); };
const filesOf = (p) => {
  if (!existsSync(p)) { console.error(`not found: ${p}`); process.exit(2); }
  return statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => join(p, f)) : [p];
};

// ---- spec -------------------------------------------------------------------------------------------------------------
let spec = {};
if (opt('spec')) { try { spec = readJson(opt('spec')); } catch (e) { console.error(`--spec: ${e.message}`); process.exit(2); } }
const list = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
if (opt('topic')) spec.topic = opt('topic');
if (opt('arms')) spec.arms = list(opt('arms'));
if (opt('control')) spec.control = opt('control');
if (opt('aa')) spec.aa = opt('aa');
if (opt('dpr')) spec.dpr = Number(opt('dpr'));
if (opt('script-from-frz')) spec.scriptFromFrz = opt('script-from-frz');
function parseEvent(s) {
  const [kind, ...rest] = String(s).split(':');
  if (kind === 'fire') {
    const line = Number(rest.pop()), url = rest.join(':');
    if (!url || !Number.isInteger(line) || line < 1) { console.error(`--event fire:<url part>:<1-based line> (got "${s}")`); process.exit(2); }
    return { kind, name: 'tick', url, line };
  }
  if (kind === 'mark') return { kind, ...(rest.length ? { prefix: rest.join(':') } : {}) };
  if (kind === 'frame') return { kind, name: 'frame' };
  if (kind === 'times' && rest.length) return { kind, name: rest.join(':') };
  console.error(`--event: fire:<url>:<line> | mark[:<prefix>] | frame | times:<name> (got "${s}")`); process.exit(2);
}
if (opt('event') || opt('element') || !spec.rows) {
  const row = { ...(spec.rows?.[0] || {}) };
  if (opt('element')) row.element = opt('element');
  row.element ??= 'element';
  if (opt('event')) row.event = parseEvent(opt('event'));
  row.event ??= { kind: 'mark' };
  const ev = row.event;
  if (opt('instances')) { const v = opt('instances'); ev.instances = /^\d+$/.test(v) ? Number(v) : Object.fromEntries(list(v).map((p) => { const [a, n] = p.split('='); return [a, Number(n)]; })); }
  if (opt('period-ms')) ev.periodMs = Number(opt('period-ms'));
  if (opt('tolerance-ms')) ev.toleranceMs = Number(opt('tolerance-ms'));
  if (opt('min-events')) ev.minEvents = Number(opt('min-events'));
  if (opt('per-frame')) ev.perFrame = list(opt('per-frame'));
  if (opt('code')) {
    const m = /^(.+):(\d+)-(\d+)$/.exec(opt('code'));
    if (!m) { console.error(`--code <url part>:<from>-<to> (got "${opt('code')}")`); process.exit(2); }
    row.code = { url: m[1], lines: [Number(m[2]), Number(m[3])] };
  }
  if (opt('nodes')) row.nodes = list(opt('nodes'));
  if (opt('rect-key')) row.rectKey = opt('rect-key');
  spec.rows = [row, ...(spec.rows || []).slice(1)];
}

// ---- loads ------------------------------------------------------------------------------------------------------------
const inputs = [];
const loads = [];
const hydrate = (l, dir) => {
  const out = { ...l };
  const res = (p) => (isAbsolute(p) ? p : resolve(dir, p));
  if (typeof l.trace === 'string') { const f = res(l.trace); const t = readJson(f); out.traceEvents = Array.isArray(t) ? t : t.traceEvents; inputs.push(shown(f)); }
  if (typeof l.timeline === 'string') { const f = res(l.timeline); const t = readJson(f); out.timelineRecs = Array.isArray(t) ? t : t.recs; out.engine ??= 'sim'; inputs.push(shown(f)); }
  if (typeof l.census === 'string') { const f = res(l.census); out.census = readJson(f); inputs.push(shown(f)); }
  if (l.engine == null && out.timelineRecs) out.engine = 'sim';
  return out;
};
for (const p of all('records')) for (const f of filesOf(p)) {
  let j;
  try { j = readJson(f); } catch (e) { console.error(`${shown(f)}: not JSON (${e.message})`); process.exit(2); }
  inputs.push(shown(f));
  const arr = Array.isArray(j.loads) ? j.loads : Array.isArray(j.results) ? j.results : Array.isArray(j) ? j : [j];
  for (const l of arr) loads.push(hydrate(l, dirname(f)));
}
for (const [flag, key] of [['trace', 'trace'], ['timeline', 'timeline']]) {
  const reps = {};
  for (const s of all(flag)) {
    const m = /^([^=/]+)(?:\/(full|freeze))?=(.+)$/.exec(s);
    if (!m) { console.error(`--${flag} <arm>[/full|/freeze]=<file> (got "${s}")`); process.exit(2); }
    const [, arm, mode = 'full', file] = m;
    const k = `${arm}/${mode}`; reps[k] = (reps[k] || 0) + 1;
    loads.push(hydrate({ arm, mode, rep: reps[k], [key]: resolve(file) }, process.cwd()));
  }
}
if (!loads.length) { console.error('no loads: give --records, --trace or --timeline'); usage(); }

// ---- card ---------------------------------------------------------------------------------------------------------------
const card = buildCard(spec, loads, { inputs: [...new Set(inputs)] });
const md = renderMarkdown(card);
let prefix = opt('out');
if (!prefix) {
  const fx = spec.topic ? join(process.cwd(), 'fixes', spec.topic) : null;
  prefix = fx && existsSync(fx) ? join(fx, 'costcard') : join(process.cwd(), 'out', 'costcard', `costcard-${spec.topic || 'card'}`);
}
mkdirSync(dirname(resolve(prefix)), { recursive: true });
writeFileSync(`${prefix}.json`, JSON.stringify(card, null, 1) + '\n');
writeFileSync(`${prefix}.md`, md + '\n');
console.log(`COSTCARD ${shown(resolve(prefix))}.json + .md: ${card.rows.length} row(s), arms ${card.arms.join(',')} (control ${card.control}${card.aa ? `, A/A ${card.aa}` : ''}), ${loads.length} load(s), ${card.voids.length} VOID`);
for (const R of card.rows) {
  const head = (f) => { const [metric, per] = Object.entries(R.fields[f])[0] || []; return metric ? `${metric} ${card.arms.filter((a) => per[a]).map((a) => `${a} ${fmt(per[a].median)}`).join(' ')}` : '-'; };
  console.log(`  ${R.element} / ${R.event} (${R.engine}, ${R.modes.map((m) => (m === 'freeze' ? 'FRZ' : 'FULL')).join('+')}): script ${head(5)} | layout ${head(4)} | paint ${head(3)}`);
}
for (const v of card.voids) console.log(`  VOID ${v.element} ${v.load}: ${v.void}`);
if (argv.includes('--print')) console.log('\n' + md);
if (!card.rows.length) { console.error('no usable load: every load was VOID or matched no arm'); process.exit(1); }
