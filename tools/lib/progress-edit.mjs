// `console.mjs progress set` and `progress best` (ts-threads, the lead after the T-104 team measurement: mgmt-ops'
// slowest work was hand-editing the compact fixes/PROGRESS.json). Pure functions on the file's text: every edit keeps
// the hand layout outside the changed values (tools/lib/json-edit.mjs), stamps updatedAt/updatedBy, and returns the
// validation errors of the result (and of the input, so the CLI can say which problems are new). The CLI writes only a
// result without errors ("both run --check before writing").
//
// best <versionId> (the T-103 rule, validateProgress): "best": true moves to that version (right after its id) and the
// build block moves with it: build.since = the version's since, build.name = its name (or --name), build.fixes = the
// fixes of every landed version from the first up to it (a page to try is skipped: versions[i].landed false, or "to
// try"/"not landed" in its name or verdict, see toTry), build.summary = --summary or removed (it described the
// previous build; a build block already on that version keeps its name and summary), build.combined keeps only rows measured on this build (when >= its since, moving forward; none when
// moving back), and every item's inBuild flag that is present follows build.fixes.
import { validateProgress, toTry } from './progress.mjs';
import { editJson, parsePath, pathText } from './json-edit.mjs';

/** ISO UTC without milliseconds, like the file's times. */
export const stamp = (now = Date.now()) => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** A CLI value: JSON when it parses (true, 42, "x", {...}, [...]), else the words as a string; string: the raw text. */
export function parseValue(raw, { string = false } = {}) {
  const s = String(raw).replace(/\r?\n$/, '');
  if (string) return s;
  try { return JSON.parse(s); } catch { return s; }
}

function getAt(data, segs) {
  let v = data;
  for (const g of segs) {
    if (v === null || typeof v !== 'object') return undefined;
    if (g.key !== undefined) v = v[g.key];
    else if (g.index !== undefined) v = v[g.index];
    else if (g.id !== undefined) v = Array.isArray(v) ? v.find((x) => x && String(x.id) === g.id) : undefined;
    else return undefined;
  }
  return v;
}

const short = (v, max = 120) => { const s = v === undefined ? 'nothing' : JSON.stringify(v); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };

function finish(text, edits, { by, now, before, applied = false }) {
  if (!by) throw new Error('needs --by <agent> (or $FW_AGENT): it goes into updatedBy');
  const paths = new Set(edits.map((e) => pathText(typeof e.path === 'string' ? parsePath(e.path) : e.path)));
  const all = applied ? [] : [...edits]; // applied: the edits are in the text already, only the stamp is left
  if (!paths.has('updatedAt')) all.push({ path: 'updatedAt', value: stamp(now) });
  if (!paths.has('updatedBy')) all.push({ path: 'updatedBy', value: by });
  const out = editJson(text, all);
  const data = JSON.parse(out);
  return { text: out, data, errors: validateProgress(data), before };
}

/**
 * sets: [{path, value} | {path, delete: true}], applied in order. -> {text, data, errors, before, notes}.
 * Throws on a bad path, a missing parent or a file that is not JSON (nothing to write then).
 */
export function progressSet(text, sets, { by, now = Date.now() } = {}) {
  if (!sets.length) throw new Error('nothing to set: progress set <json-path> <value> [<json-path> <value> …]');
  if (!by) throw new Error('needs --by <agent> (or $FW_AGENT): it goes into updatedBy');
  const before = validateProgress(JSON.parse(text)), notes = [];
  let cur = text;
  for (const s of sets) { // one at a time: a later path sees the earlier edits (a new first change row, then [30] out)
    const segs = typeof s.path === 'string' ? parsePath(s.path) : s.path, p = pathText(segs), last = segs.at(-1);
    const was = last.append || last.prepend ? undefined : getAt(JSON.parse(cur), segs);
    cur = editJson(cur, [{ ...s, path: segs }]);
    if (last.append || last.prepend) notes.push(`${p}: added ${short(s.value)}`);
    else if (s.delete) notes.push(`${p}: deleted (was ${short(was)})`);
    else notes.push(was === undefined ? `${p}: new ${short(s.value)}` : `${p}: ${short(was)} -> ${short(s.value)}`);
  }
  return { ...finish(cur, sets, { by, now, before, applied: true }), notes };
}

/** The build's fixes: every landed version's fixes from versions[0] up to versions[i], in order, once each. */
export function buildFixes(versions, i) {
  const out = [];
  versions.slice(0, i + 1).forEach((v, j) => {
    if (j < i && toTry({ ...v, best: undefined })) return;
    for (const id of Array.isArray(v.fixes) ? v.fixes : []) if (!out.includes(id)) out.push(id);
  });
  return out;
}

/** Make versionId today's best build and move the build block with it. -> {text, data, errors, before, notes}. */
export function progressBest(text, versionId, { by, now = Date.now(), name, summary } = {}) {
  const p = JSON.parse(text);
  const vs = p.versions;
  if (!Array.isArray(vs) || !vs.length) throw new Error('no versions in this file: add one first (progress set versions[+] …)');
  const i = vs.findIndex((v) => v?.id === versionId);
  if (i < 0) throw new Error(`no version "${versionId}" (versions: ${vs.map((v) => v?.id).join(', ')})`);
  const v = vs[i], edits = [], notes = [];
  const was = vs.map((x, j) => (x?.best === true && j !== i ? j : -1)).filter((j) => j >= 0);
  for (const j of was) edits.push({ path: `versions[${j}].best`, delete: true });
  if (v.best !== true) {
    edits.push(v.best === undefined ? { path: `versions[${i}].best`, value: true, after: 'id' } : { path: `versions[${i}].best`, value: true });
    notes.push(`versions[${i}] "${v.id}": "best": true${was.length ? ` (was ${was.map((j) => `versions[${j}] "${vs[j].id}"`).join(', ')})` : ''}`);
  }
  const fixes = buildFixes(vs, i), b = p.build && typeof p.build === 'object' && !Array.isArray(p.build) ? p.build : null;
  const moving = !b || Date.parse(b.since) !== Date.parse(v.since); // the build block already on this version keeps its own name and summary
  const newName = name || (moving ? v.name : b.name);
  if (!b) {
    edits.push({ path: 'build', value: { name: newName, since: v.since, ...(summary ? { summary } : {}), fixes } });
    notes.push(`build: new, "${newName}" since ${v.since}, fixes ${fixes.join(', ') || 'none'}`);
  } else {
    const forward = !(Date.parse(v.since) < Date.parse(b.since));
    if (b.since !== v.since) { edits.push({ path: 'build.since', value: v.since }); notes.push(`build.since: ${b.since} -> ${v.since}`); }
    if (b.name !== newName) { edits.push({ path: 'build.name', value: newName }); notes.push(`build.name: ${short(b.name)} -> ${short(newName)}`); }
    const oldFixes = Array.isArray(b.fixes) ? b.fixes : [];
    if (JSON.stringify(oldFixes) !== JSON.stringify(fixes)) {
      edits.push({ path: 'build.fixes', value: fixes });
      const add = fixes.filter((f) => !oldFixes.includes(f)), rm = oldFixes.filter((f) => !fixes.includes(f));
      notes.push(`build.fixes: ${[...add.map((f) => `+${f}`), ...rm.map((f) => `-${f}`)].join(', ') || 'reordered'}`);
    }
    if (summary !== undefined && summary !== b.summary) { edits.push({ path: 'build.summary', value: summary }); notes.push('build.summary: set'); }
    else if (summary === undefined && b.summary !== undefined && moving) {
      edits.push({ path: 'build.summary', delete: true });
      notes.push('build.summary: removed (it described the previous build); set it with --summary or progress set build.summary');
    }
    const rows = Array.isArray(b.combined) ? b.combined : [];
    const drop = rows.map((c, j) => (!forward || !(Date.parse(c?.when) >= Date.parse(v.since)) ? j : -1)).filter((j) => j >= 0);
    for (const j of drop.reverse()) edits.push({ path: `build.combined[${j}]`, delete: true });
    if (drop.length) notes.push(`build.combined: dropped ${drop.length} row${drop.length === 1 ? '' : 's'} ${forward ? `measured before ${v.since}` : `(measured on a later build than ${v.id})`}`);
  }
  (Array.isArray(p.items) ? p.items : []).forEach((it, k) => {
    if (typeof it?.inBuild !== 'boolean') return;
    const want = fixes.includes(it.id);
    if (it.inBuild !== want) { edits.push({ path: `items[${k}].inBuild`, value: want }); notes.push(`items[${k}] "${it.id}".inBuild: ${it.inBuild} -> ${want}`); }
  });
  return { ...finish(text, edits, { by, now, before: validateProgress(p) }), notes };
}
