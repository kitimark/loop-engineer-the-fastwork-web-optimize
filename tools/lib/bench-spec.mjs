// The per-topic benchmark contract: fixes/<topic>/bench.json (research/architecture/automated-benchmarks.md
// §4). Data only: selectors, property names, media queries, numbers and prose. The runner
// (tools/bench.mjs + lib/bench-*.mjs) owns every line of probe code, so a bench.json can't carry
// Fastwork code (Hard rule 3) and every probe is under tests (Hard rule 6).
//
// This module: the schema, the expectation grammar (parse + evaluate) and the lint. No I/O except
// lintTopic(), which reads the file and checks that experiment variant diffs exist.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEMA = 1;
export const VIEWPORTS = ['mobile', 'desktop'];
export const STATUS = ['authored', 'superseded'];
export const GAIN_STATUS = ['authored', 'pending-quiet-host'];
export const GAIN_DEVICES = ['chrome', 'iphone'];
export const DIRECTIONS = ['lower', 'higher'];
// Tier B metrics (per scenario, per run). styleLayoutMs etc. come from Performance.getMetrics deltas;
// frame buckets from the rAF logger (informational: the most load-sensitive).
export const GAIN_METRICS = ['styleLayoutMs', 'layoutMs', 'recalcStyleMs', 'scriptMs', 'taskMs', 'layoutCount', 'recalcStyleCount', 'gt20', 'p95'];
export const PERF_METRICS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'];
export const LAYOUT_READS = ['getBoundingClientRect', 'getClientRects', 'Range.getBoundingClientRect', 'Range.getClientRects', 'getComputedStyle',
  'offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent', 'clientTop', 'clientLeft', 'clientWidth', 'clientHeight',
  'scrollWidth', 'scrollHeight', 'elementFromPoint', 'elementsFromPoint'];
export const EXPERIMENT_GAIN = ['better', 'within-noise', 'worse', 'broke'];

// Probe kinds and their parameters: [name, type, required]. Types: sel (CSS selector), prop (CSS property
// or custom property), accessor (CSSStyleDeclaration accessor, camelCase), query (media query), str,
// bool, enum:<a|b>, list:<type>.
export const PROBE_KINDS = {
  setProperty: [['prop', 'prop', true], ['selector', 'sel', false], ['noop', 'bool', false]],
  inlineProp: [['prop', 'prop', true], ['selector', 'sel', true]],
  styleWrite: [['prop', 'accessor', true], ['selector', 'sel', false]],
  layoutRead: [['method', `enum:${LAYOUT_READS.join('|')}`, false], ['selector', 'sel', false]],
  readAfterWrite: [['selector', 'sel', false]],
  matchMedia: [['query', 'query', true]],
  querySelector: [['selector', 'sel', true]],
  raf: [],
  timer: [['type', 'enum:setTimeout|setInterval', false]],
  animations: [['selector', 'sel', false], ['props', 'list:prop', false], ['name', 'str', false], ['state', 'enum:running|any', false], ['offscreen', 'bool', false]],
  listeners: [['target', 'enum:window|document', true], ['type', 'str', true], ['passive', 'bool', false]],
  perfMetrics: [['metric', `enum:${PERF_METRICS.join('|')}`, true]],
  layoutsPerFrame: [['metric', 'enum:LayoutCount|RecalcStyleCount', true]],
};
/** Probe kinds whose counters are exact in-page counts (quiescence watches the write kinds). */
export const WRITE_KINDS = ['setProperty', 'inlineProp', 'styleWrite'];

// ---- expectation grammar ------------------------------------------------------------------------------
// `== n`, `>= n`, `<= n`, `> n`, `< n`, `<= f * baseline`, `>= f * baseline`, `equal`.
// Only a patched expectation may refer to the baseline value (from the same session).
const NUM = '(\\d+(?:\\.\\d+)?)';
export function parseExpectation(s, { allowBaseline = true } = {}) {
  const x = String(s ?? '').trim();
  let m;
  if (x === 'equal') { if (!allowBaseline) throw new Error(`"${s}": a baseline expectation can't refer to the baseline`); return { op: '==', ref: 'baseline', f: 1, text: x }; }
  if ((m = x.match(new RegExp(`^(==|>=|<=|>|<)\\s*${NUM}$`)))) return { op: m[1], n: Number(m[2]), text: x };
  if ((m = x.match(new RegExp(`^(>=|<=)\\s*${NUM}\\s*\\*\\s*baseline$`)))) {
    if (!allowBaseline) throw new Error(`"${s}": a baseline expectation can't refer to the baseline`);
    return { op: m[1], ref: 'baseline', f: Number(m[2]), text: x };
  }
  throw new Error(`"${s}" is not an expectation (== n, >= n, <= n, > n, < n, <= f * baseline, >= f * baseline, equal)`);
}
/** Does `value` meet expectation `e` (parsed or text)? `baseline` is the same session's baseline value. */
export function meets(e, value, baseline) {
  const p = typeof e === 'string' ? parseExpectation(e) : e;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  let rhs = p.n;
  if (p.ref === 'baseline') { if (typeof baseline !== 'number' || !Number.isFinite(baseline)) return false; rhs = p.f * baseline; }
  const eps = 1e-9;
  switch (p.op) {
    case '==': return Math.abs(value - rhs) <= eps;
    case '>=': return value >= rhs - eps;
    case '<=': return value <= rhs + eps;
    case '>': return value > rhs;
    case '<': return value < rhs;
  }
  return false;
}

// ---- lint -------------------------------------------------------------------------------------------
const PROSE = new Set(['why', 'evidence', 'reason', 'notes']);
const NAME = /^[a-z][a-zA-Z0-9_-]{0,40}$/;
const MAX_STR = 200;
// code-like tokens: never outside prose
const CODE_TOKENS = [[/=>/, '=>'], [/\bfunction\b/, 'function'], [/\breturn\b/, 'return'], [/;/, ';'], [/[\n\r]/, 'newline'], [/`/, 'backtick'], [/\$\{/, '${'], [/\b(?:const|let|var)\s+[\w$]/, 'declaration'], [/\)\s*\{/, ') {'], [/\bnew\s+[A-Z]/, 'new']];
// in prose, words are fine; code fragments are not
const PROSE_CODE = [[/=>/, '=>'], [/\bfunction\s*[\w$]*\s*\([^)]*\)\s*\{/, 'function body'], [/\{[^{}]*;[^{}]*\}/, 'block with ;'], [/[\n\r]/, 'newline'], [/```/, 'code fence']];

function typeOk(type, v) {
  if (type === 'bool') return typeof v === 'boolean';
  if (type.startsWith('enum:')) return type.slice(5).split('|').includes(v);
  if (type.startsWith('list:')) return Array.isArray(v) && v.length > 0 && v.every((x) => typeOk(type.slice(5), x));
  if (typeof v !== 'string' || !v.trim()) return false;
  if (type === 'prop') return /^(--[A-Za-z0-9_-]+|[a-z][a-z-]*)$/.test(v);
  if (type === 'accessor') return /^[a-z][A-Za-z]*$/.test(v);
  if (type === 'query') return /^[\w\s():.,<>=-]+$/.test(v) && /\(/.test(v);
  if (type === 'sel') return isSelectorLike(v);
  return true; // str
}
/** A plausible CSS selector (no braces, no code): the runner validates for real in the page. */
export function isSelectorLike(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= MAX_STR && !/[{};`\n]/.test(s) && /^[\w\s.#\-[\]="'~^$*|:(),>+@%]+$/.test(s);
}

/**
 * Lint a parsed bench.json. `topic`: the directory name it must match. `hasFile(rel)`: does
 * fixes/<topic>/<rel> exist (for experiment variants). Returns {errors: [], warnings: []}.
 */
export function lintSpec(spec, { topic, hasFile = () => true } = {}) {
  const errors = [], warnings = [];
  const err = (p, m) => errors.push(`${p}: ${m}`);
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { errors: ['bench.json must be a JSON object'], warnings };

  // every string: length, and code-like tokens (prose fields get the lighter check)
  (function walk(v, path, key) {
    if (typeof v === 'string') {
      if (v.length > MAX_STR) err(path, `string longer than ${MAX_STR} characters`);
      for (const [re, name] of PROSE.has(key) ? PROSE_CODE : CODE_TOKENS) if (re.test(v)) { err(path, `code-like token "${name}" (bench.json is data only: selectors, property names, numbers and prose)`); break; }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, k);
  })(spec, 'bench', '');

  const known = (obj, keys, p) => { for (const k of Object.keys(obj)) if (!keys.includes(k)) err(p, `unknown key "${k}"`); };
  known(spec, ['schema', 'topic', 'status', 'supersededBy', 'reason', 'evidence', 'notes', 'segments', 'spots', 'probes', 'mechanism', 'parity', 'gain', 'experiments'], 'bench');
  if (spec.schema !== SCHEMA) err('bench.schema', `must be ${SCHEMA}`);
  if (typeof spec.topic !== 'string' || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(spec.topic)) err('bench.topic', 'must be the kebab-case topic');
  else if (topic && spec.topic !== topic) err('bench.topic', `"${spec.topic}" does not match the directory fixes/${topic}/`);
  if (!STATUS.includes(spec.status)) err('bench.status', `must be one of ${STATUS.join(', ')}`);
  if (spec.status === 'superseded') {
    if (typeof spec.supersededBy !== 'string' || !spec.supersededBy) err('bench.supersededBy', 'a superseded bench names the superseding topic');
    if (typeof spec.reason !== 'string' || !spec.reason) err('bench.reason', 'a superseded bench says why');
  } else if (spec.supersededBy != null) err('bench.supersededBy', 'only with status "superseded"');
  if (typeof spec.evidence !== 'string' || !spec.evidence) err('bench.evidence', 'required: the README numbers this bench protects');

  const segments = spec.segments ?? {}, spots = spec.spots ?? {}, probes = spec.probes ?? {};
  for (const [what, obj] of [['segments', segments], ['spots', spots], ['probes', probes]]) if (typeof obj !== 'object' || Array.isArray(obj)) err(`bench.${what}`, 'must be an object');
  for (const [n, s] of Object.entries(segments)) {
    const p = `bench.segments.${n}`;
    if (!NAME.test(n)) err(p, 'bad name');
    if (!s || typeof s !== 'object') { err(p, 'must be an object'); continue; }
    known(s, ['from', 'to', 'step', 'before', 'why'], p);
    if (s.from !== 'top' && !isSelectorLike(s.from)) err(`${p}.from`, 'a selector or "top"');
    if (s.to !== 'end' && !isSelectorLike(s.to)) err(`${p}.to`, 'a selector or "end"');
    if (!Number.isInteger(s.step) || s.step < 20 || s.step > 2000) err(`${p}.step`, 'integer px, 20-2000');
    if (s.before !== undefined && (typeof s.before !== 'number' || s.before < 0 || s.before > 5)) err(`${p}.before`, 'viewports above "from", 0-5');
  }
  for (const [n, s] of Object.entries(spots)) {
    const p = `bench.spots.${n}`;
    if (!NAME.test(n)) err(p, 'bad name');
    if (segments[n]) err(p, `name clashes with segment "${n}"`);
    if (!s || typeof s !== 'object') { err(p, 'must be an object'); continue; }
    known(s, ['at', 'offset', 'wait', 'window', 'why'], p);
    if (s.at !== 'top' && !isSelectorLike(s.at)) err(`${p}.at`, 'a selector or "top"');
    if (s.offset !== undefined && (typeof s.offset !== 'number' || Math.abs(s.offset) > 5)) err(`${p}.offset`, 'viewports, -5..5');
    if (s.wait !== undefined && (typeof s.wait !== 'number' || s.wait < 0 || s.wait > 10)) err(`${p}.wait`, 'seconds, 0-10');
    if (typeof s.window !== 'number' || s.window < 1 || s.window > 20) err(`${p}.window`, 'seconds, 1-20');
  }
  for (const [id, pr] of Object.entries(probes)) {
    const p = `bench.probes.${id}`;
    if (!NAME.test(id)) err(p, 'bad probe id');
    if (!pr || typeof pr !== 'object') { err(p, 'must be an object'); continue; }
    const params = PROBE_KINDS[pr.kind];
    if (!params) { err(`${p}.kind`, `unknown probe kind "${pr.kind}" (${Object.keys(PROBE_KINDS).join(', ')}); a missing kind is an incident for a toolsmith, not inline code`); continue; }
    known(pr, ['kind', 'why', ...params.map((x) => x[0])], p);
    for (const [name, type, req] of params) {
      if (pr[name] === undefined) { if (req) err(`${p}.${name}`, `required for kind ${pr.kind}`); continue; }
      if (!typeOk(type, pr[name])) err(`${p}.${name}`, `bad value ${JSON.stringify(pr[name])} (${type})`);
    }
  }
  const where = (c, p) => {
    const has = [c.segment !== undefined, c.spot !== undefined].filter(Boolean).length;
    if (has !== 1) return err(p, 'exactly one of "segment" or "spot"');
    if (c.segment !== undefined && !segments[c.segment]) err(`${p}.segment`, `no segment "${c.segment}"`);
    if (c.spot !== undefined && !spots[c.spot]) err(`${p}.spot`, `no spot "${c.spot}"`);
  };
  const ids = new Set();
  const mech = spec.mechanism ?? [];
  if (!Array.isArray(mech)) err('bench.mechanism', 'must be an array');
  else mech.forEach((c, i) => {
    const p = `bench.mechanism[${i}]`;
    if (!c || typeof c !== 'object') return err(p, 'must be an object');
    known(c, ['id', 'viewport', 'segment', 'spot', 'probe', 'baseline', 'patched', 'why'], p);
    if (!NAME.test(c.id ?? '')) err(`${p}.id`, 'kebab/camel id');
    else if (ids.has(c.id)) err(`${p}.id`, `duplicate id "${c.id}"`);
    ids.add(c.id);
    if (!VIEWPORTS.includes(c.viewport)) err(`${p}.viewport`, VIEWPORTS.join(' or '));
    where(c, p);
    if (!probes[c.probe]) err(`${p}.probe`, `no probe "${c.probe}"`);
    try { parseExpectation(c.baseline, { allowBaseline: false }); } catch (e) { err(`${p}.baseline`, e.message); }
    try { parseExpectation(c.patched); } catch (e) { err(`${p}.patched`, e.message); }
    if (typeof c.why !== 'string' || !c.why) err(`${p}.why`, 'required: what the check asserts and why');
  });
  const parity = spec.parity ?? [];
  if (!Array.isArray(parity)) err('bench.parity', 'must be an array');
  else parity.forEach((c, i) => {
    const p = `bench.parity[${i}]`;
    if (!c || typeof c !== 'object') return err(p, 'must be an object');
    known(c, ['viewport', 'segment', 'spot', 'classes', 'props', 'attrs', 'why'], p);
    if (!VIEWPORTS.includes(c.viewport)) err(`${p}.viewport`, VIEWPORTS.join(' or '));
    where(c, p);
    if (!c.classes && !c.props && !c.attrs) err(p, 'needs classes, props or attrs');
    if (c.classes !== undefined && !(Array.isArray(c.classes) && c.classes.length && c.classes.every(isSelectorLike))) err(`${p}.classes`, 'a list of selectors');
    if (c.props !== undefined && !(Array.isArray(c.props) && c.props.every((x) => Array.isArray(x) && x.length >= 2 && x.length <= 3 && isSelectorLike(x[0]) && typeOk('prop', x[1]) && (x[2] === undefined || (typeof x[2] === 'number' && x[2] >= 0))))) err(`${p}.props`, 'a list of [selector, property, tolerance?]');
    if (c.attrs !== undefined && !(Array.isArray(c.attrs) && c.attrs.every((x) => Array.isArray(x) && x.length === 2 && isSelectorLike(x[0]) && /^[a-z][a-z0-9-]*$/.test(x[1])))) err(`${p}.attrs`, 'a list of [selector, attribute]');
  });
  if (spec.gain !== undefined) {
    const g = spec.gain, p = 'bench.gain';
    if (!g || typeof g !== 'object') err(p, 'must be an object');
    else {
      known(g, ['scenario', 'metric', 'direction', 'device', 'status', 'dwellFrames', 'why'], p);
      if (!g.scenario || typeof g.scenario !== 'object') err(`${p}.scenario`, 'required');
      else { known(g.scenario, ['viewport', 'segment', 'spot'], `${p}.scenario`); if (!VIEWPORTS.includes(g.scenario.viewport)) err(`${p}.scenario.viewport`, VIEWPORTS.join(' or ')); where(g.scenario, `${p}.scenario`); }
      if (!GAIN_METRICS.includes(g.metric)) err(`${p}.metric`, `one of ${GAIN_METRICS.join(', ')}`);
      if (!DIRECTIONS.includes(g.direction)) err(`${p}.direction`, DIRECTIONS.join(' or '));
      if (!GAIN_DEVICES.includes(g.device ?? 'chrome')) err(`${p}.device`, GAIN_DEVICES.join(' or '));
      if (g.status !== undefined && !GAIN_STATUS.includes(g.status)) err(`${p}.status`, GAIN_STATUS.join(' or '));
      if (g.dwellFrames !== undefined && (!Number.isInteger(g.dwellFrames) || g.dwellFrames < 2 || g.dwellFrames > 120)) err(`${p}.dwellFrames`, 'integer 2-120');
    }
  }
  const exps = spec.experiments ?? [];
  if (!Array.isArray(exps)) err('bench.experiments', 'must be an array');
  else {
    const seen = new Set();
    exps.forEach((x, i) => {
      const p = `bench.experiments[${i}]`;
      if (!x || typeof x !== 'object') return err(p, 'must be an object');
      known(x, ['id', 'variant', 'expect', 'device', 'why'], p);
      const m = String(x.id ?? '').match(/^([a-z0-9][a-z0-9-]{1,60})\/(\d{2,3})$/);
      if (!m) err(`${p}.id`, 'must be "<topic>/<nn>"');
      else if (spec.topic && m[1] !== spec.topic) err(`${p}.id`, `must start with "${spec.topic}/"`);
      if (seen.has(x.id)) err(`${p}.id`, `duplicate id "${x.id}"`);
      seen.add(x.id);
      if (x.variant !== 'final') {
        if (!m || x.variant !== `variants/${m[2]}.diff`) err(`${p}.variant`, `"final" or "variants/${m ? m[2] : '<nn>'}.diff"`);
        else if (!hasFile(x.variant)) err(`${p}.variant`, `fixes/${spec.topic}/${x.variant} does not exist (keep the variant diff: node tools/fix.mjs diff of that overlay)`);
      }
      if (x.device !== undefined && !GAIN_DEVICES.includes(x.device)) err(`${p}.device`, GAIN_DEVICES.join(' or '));
      const e = x.expect;
      if (!e || typeof e !== 'object') return err(`${p}.expect`, 'required: {mech, parity, gain}');
      known(e, ['mech', 'parity', 'gain'], `${p}.expect`);
      if (e.mech === undefined && e.parity === undefined && e.gain === undefined) err(`${p}.expect`, 'needs mech, parity or gain');
      const fails = [];
      if (e.mech !== undefined) {
        if (typeof e.mech === 'string') { if (!['pass', 'fail'].includes(e.mech)) err(`${p}.expect.mech`, '"pass", "fail" or {checkId: "pass"|"fail"}'); else if (e.mech === 'fail') fails.push('mech'); }
        else if (e.mech && typeof e.mech === 'object') for (const [cid, v] of Object.entries(e.mech)) {
          if (!ids.has(cid)) err(`${p}.expect.mech.${cid}`, `no mechanism check "${cid}"`);
          if (!['pass', 'fail'].includes(v)) err(`${p}.expect.mech.${cid}`, '"pass" or "fail"'); else if (v === 'fail') fails.push(cid);
        } else err(`${p}.expect.mech`, '"pass", "fail" or {checkId: "pass"|"fail"}');
      }
      if (e.parity !== undefined) { if (!['pass', 'fail'].includes(e.parity)) err(`${p}.expect.parity`, '"pass" or "fail"'); else if (e.parity === 'fail') fails.push('parity'); }
      if (e.gain !== undefined && !EXPERIMENT_GAIN.includes(e.gain)) err(`${p}.expect.gain`, EXPERIMENT_GAIN.join(', '));
      if (e.gain === 'broke' && !fails.length) err(`${p}.expect`, 'a variant that broke something needs a mech or parity check expected to "fail" (it must still detect the break)');
      if (e.gain !== undefined && e.gain !== 'broke' && !spec.gain) err(`${p}.expect.gain`, 'needs the top-level "gain" scenario');
    });
  }
  if (!mech.length && !parity.length && Array.isArray(mech)) warnings.push('no mechanism or parity checks: Tier A guards nothing');
  const used = new Set([...(Array.isArray(mech) ? mech.map((c) => c?.probe) : [])]);
  for (const id of Object.keys(probes)) if (!used.has(id)) warnings.push(`probe "${id}" is not used by any check`);
  return { errors, warnings };
}

/** Read and lint fixes/<topic>/bench.json under `fixesDir`. Returns {topic, file, spec, errors, warnings}. */
export function lintTopic(fixesDir, topic) {
  const file = join(fixesDir, topic, 'bench.json');
  if (!existsSync(file)) return { topic, file, spec: null, errors: [`${file}: missing`], warnings: [] };
  let spec;
  try { spec = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { topic, file, spec: null, errors: [`not valid JSON: ${e.message}`], warnings: [] }; }
  return { topic, file, spec, ...lintSpec(spec, { topic, hasFile: (rel) => existsSync(join(fixesDir, topic, rel)) }) };
}

/** Load a bench.json and throw if the lint finds errors. */
export function loadSpec(fixesDir, topic) {
  const r = lintTopic(fixesDir, topic);
  if (r.errors.length) throw new Error(`fixes/${topic}/bench.json fails the lint:\n  ${r.errors.join('\n  ')}`);
  return r.spec;
}
