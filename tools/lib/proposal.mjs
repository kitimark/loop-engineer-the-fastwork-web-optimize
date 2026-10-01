// Proposals for the user console (ts-proposals, user request 2026-10-02): a design engineer's PoC replaces an
// expensive live effect (style recalc, compositing) with a cheaper one that looks the same or nearly so. The user
// reads each proposal on the console's /proposals page, compares the original (A) and the PoC (B) and accepts,
// rejects or asks for a change. Design: research/architecture/console-proposals.md.
//
// Store (local, gitignored, shared by every worktree; Hard rule 3: the screenshots are Fastwork-derived):
//   <git-common-dir>/fastwork-mirror/console/proposals/PR-001.json   one JSON file per proposal
//   <git-common-dir>/fastwork-mirror/console/proposals/PR-001/       its media, copied in: r1-a-1.png, r1-video-b.mp4
// ($FW_STATE_DIR replaces <git-common-dir>/fastwork-mirror in tests.)
//
// Schema "fw-proposal/1" (the author's file; the tool adds id, by, times, rev, state, decision, history):
//   {schema, title, area: hero|middle|end|whole, topic?, thread?, problem, idea, looksSame, visualDiff: [text],
//    gain: [{what, before, after, tag: OBSERVED|CONFIRMED|estimate|UNRESOLVED|REFUTED, how, needsPhone?}], risk,
//    compare: {a: {label, url?}, b: {label, url?}, shots: [{caption, a, b}], video?: {a, b} | {both}, view?}}
// States: draft -> proposed -> accepted | rejected | changes-requested; changes-requested -> (revise) proposed;
//   draft | proposed | changes-requested -> withdrawn. Only `proposed` waits for the user.
// Hard rule 12: compare URLs must be localhost; every text field is scrubbed when stored (progress.mjs sanitize +
// redact.mjs; localhost URLs are kept) and the scrubs are reported. The page renders text as text, never HTML.
import { mkdirSync, readFileSync, statSync, openSync, readSync, closeSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { consoleDir } from './console.mjs';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, readAll, nextId, idParser, iso } from './store.mjs';
import { sanitize, PERSONAL } from './progress.mjs';
import { redact } from './redact.mjs';

export const SCHEMA = 'fw-proposal/1';
export const AREAS = ['hero', 'middle', 'end', 'whole'];
export const STATES = ['draft', 'proposed', 'accepted', 'rejected', 'changes-requested', 'withdrawn'];
export const DECIDED = new Set(['accepted', 'rejected', 'changes-requested']);
export const FINAL = new Set(['accepted', 'rejected', 'withdrawn']);
export const GAIN_TAGS = ['OBSERVED', 'CONFIRMED', 'estimate', 'UNRESOLVED', 'REFUTED'];
export const VIEWS = ['side', 'slider', 'blink'];
/** User words -> state. */
export const DECISION_VALUES = {
  accept: 'accepted', accepted: 'accepted',
  reject: 'rejected', rejected: 'rejected',
  change: 'changes-requested', 'request-change': 'changes-requested', 'changes-requested': 'changes-requested',
};
export const LIMITS = { title: 120, text: 2000, item: 300, items: 12, gainWhat: 120, gainValue: 80, how: 300, caption: 120, label: 60, notes: 4000, note: 300, shots: 12, imageBytes: 15 * 1024 * 1024, videoBytes: 200 * 1024 * 1024 };
const GUARD = 'console-proposals';

export const proposalsDir = () => join(consoleDir(), 'proposals');
const fileOf = (id) => join(proposalsDir(), `${id}.json`);
export const mediaDir = (id) => join(proposalsDir(), id);

/** "3", "pr-3", "PR-003" -> "PR-003". */
export const parseProposalId = idParser('PR', 'proposal');

// ---- text and URLs (Hard rule 12) --------------------------------------------------------------------

/** http(s)://localhost|127.0.0.1|[::1][:port][/…]: the only URLs a proposal may carry. */
export const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:[/?#][^\s<>"')\]]*)?/gi;

export function isLocalUrl(u) {
  let p;
  try { p = new URL(String(u)); } catch { return false; }
  return /^https?:$/.test(p.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(p.hostname) && !p.username && !p.password;
}

/**
 * Scrub one text: URLs other than localhost, IP addresses, *.local/*.lan hosts, e-mail, device ids, home paths
 * (progress.mjs PERSONAL) and account/device ids (redact.mjs). Localhost URLs are kept. Returns {text, found: [kind]}.
 */
export function scrubText(s) {
  if (s == null) return { text: s, found: [] };
  const keep = [];
  let t = String(s).replace(/[\u0001\u0002]/g, '').replace(LOCAL_URL, (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0002`; });
  const found = [];
  for (const [name, re] of PERSONAL) { re.lastIndex = 0; const n = (t.match(re) || []).length; for (let i = 0; i < n; i++) found.push(name); }
  // Other URLs become <link> here, keeping closing punctuation that follows them ("(seen on http://…/)" keeps
  // its ")"); sanitize's own url shape would swallow it. What is kept is punctuation only, never address text.
  t = t.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (m) => '<link>' + (m.match(/[)\]}>.,;:!?'"]+$/) || [''])[0]);
  t = sanitize(t, Number.MAX_SAFE_INTEGER);
  const r = redact(t);
  if (r !== t) found.push('account or device id');
  t = r.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[Number(i)] ?? '');
  return { text: t, found };
}

// ---- reading an author's file ------------------------------------------------------------------------

const SECTION_KEYS = {
  problem: 'problem', idea: 'idea', 'looks the same': 'looksSame', 'why it looks the same': 'looksSame', 'looks same': 'looksSame',
  'visual difference': 'visualDiff', 'visual differences': 'visualDiff', 'what looks different': 'visualDiff', 'visual diff': 'visualDiff',
  gain: 'gain', gains: 'gain', risk: 'risk', risks: 'risk',
};

/** The Markdown form: front matter (title, area, topic, thread, a/b: "label | url", view) + "## Section" blocks. */
export function parseMarkdown(src) {
  const out = { schema: SCHEMA, compare: {} };
  let body = String(src).replace(/\r\n/g, '\n');
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = body.slice(fm[0].length);
    for (const l of fm[1].split('\n')) {
      const m = l.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
      if (!m) continue;
      const k = m[1].toLowerCase(), v = m[2].replace(/^["']|["']$/g, '');
      if (k === 'a' || k === 'b') { const [label, url] = v.split('|').map((x) => x.trim()); out.compare[k] = { label, ...(url && { url }) }; }
      else if (k === 'view') out.compare.view = v;
      else if (k === 'looks-same' || k === 'lookssame') out.looksSame = v;
      else if (['title', 'area', 'topic', 'thread', 'schema'].includes(k)) out[k] = v;
    }
  }
  const parts = body.split(/^##\s+/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = (nl < 0 ? p : p.slice(0, nl)).trim().toLowerCase().replace(/[:.]$/, '');
    const text = (nl < 0 ? '' : p.slice(nl + 1)).trim();
    const key = SECTION_KEYS[head];
    if (!key) continue;
    if (key === 'visualDiff') out.visualDiff = text.split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean);
    else if (key === 'gain') {
      const rows = text.split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const data = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      const [hdr, ...rest] = data;
      if (hdr) {
        const idx = (n) => hdr.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, '') === n);
        const col = { what: idx('what'), before: idx('before'), after: idx('after'), tag: idx('tag'), how: [idx('how'), idx('howmeasured')].find((i) => i >= 0) ?? -1, needsPhone: [idx('phone'), idx('needsphone')].find((i) => i >= 0) ?? -1 };
        out.gain = rest.map((r) => {
          const g = {};
          for (const k of ['what', 'before', 'after', 'tag', 'how']) if (col[k] >= 0 && r[col[k]] !== undefined) g[k] = r[col[k]];
          if (col.needsPhone >= 0 && /^(yes|true|needed|x)$/i.test(r[col.needsPhone] || '')) g.needsPhone = true;
          return g;
        });
      }
    } else out[key] = text;
  }
  return out;
}

/** A proposal file (.json or .md) -> the raw object. */
export function loadProposalFile(file) {
  const src = readFileSync(file, 'utf8');
  if (/\.(md|markdown)$/i.test(file)) return parseMarkdown(src);
  try { return JSON.parse(src); } catch (e) { throw new Error(`${file}: not JSON (${e.message}); a Markdown proposal needs the .md extension`); }
}

// ---- media -------------------------------------------------------------------------------------------

/** What a file is, by its first bytes (never by its name): {kind: image|video, ext, size, width?, height?}. */
export function sniffMedia(file) {
  let st;
  try { st = statSync(file); } catch { throw new Error(`no such file: ${file}`); }
  if (!st.isFile()) throw new Error(`not a file: ${file}`);
  const b = Buffer.alloc(32);
  const fd = openSync(file, 'r');
  try { readSync(fd, b, 0, 32, 0); } finally { closeSync(fd); }
  const asc = (i, n) => b.toString('latin1', i, i + n);
  let kind, ext, width, height;
  if (b[0] === 0x89 && asc(1, 3) === 'PNG') { kind = 'image'; ext = 'png'; if (asc(12, 4) === 'IHDR') { width = b.readUInt32BE(16); height = b.readUInt32BE(20); } }
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { kind = 'image'; ext = 'jpg'; }
  else if (asc(0, 4) === 'GIF8') { kind = 'image'; ext = 'gif'; width = b.readUInt16LE(6); height = b.readUInt16LE(8); }
  else if (asc(0, 4) === 'RIFF' && asc(8, 4) === 'WEBP') { kind = 'image'; ext = 'webp'; }
  else if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) { kind = 'video'; ext = 'webm'; }
  else if (['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(asc(4, 4))) { kind = 'video'; ext = asc(4, 4) === 'ftyp' && asc(8, 4) === 'qt  ' ? 'mov' : asc(4, 4) === 'ftyp' ? 'mp4' : 'mov'; }
  else throw new Error(`${file}: not a PNG, JPEG, WebP or GIF image, nor an MP4, MOV or WebM video`);
  const max = kind === 'image' ? LIMITS.imageBytes : LIMITS.videoBytes;
  if (st.size > max) throw new Error(`${file}: ${(st.size / 1048576).toFixed(1)} MB is over the ${max / 1048576} MB limit for a ${kind === 'image' ? 'screenshot' : 'video'}`);
  return { kind, ext, size: st.size, ...(width && { width, height }) };
}

/** Stored media names: what the server may serve (no path, no traversal). */
export const MEDIA_NAME = /^r\d{1,4}-(?:(?:a|b)-\d{1,2}\.(?:png|jpg|webp|gif)|video-(?:a|b|both)\.(?:mp4|mov|webm))$/;
export const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

/** The stored file for GET /media/<id>/<name>, or null (bad id, bad name, missing). */
export function mediaFile(id, name) {
  let pid;
  try { pid = parseProposalId(id); } catch { return null; }
  if (pid !== id || !MEDIA_NAME.test(name)) return null;
  const f = join(mediaDir(pid), name);
  return existsSync(f) ? { file: f, type: MEDIA_TYPES[extname(name).slice(1)] } : null;
}

// ---- normalize and validate --------------------------------------------------------------------------

const list = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);

/**
 * The author's raw object (+ CLI shots and videos) -> {fields, media: {shots: [{caption, a, b}], video}, errors,
 * scrubbed: ["problem: ip address", …], warnings}. Media paths are absolute (relative to baseDir); nothing is copied.
 * draft: only the title and area are required, and no media.
 */
export function normalize(raw, { baseDir = process.cwd(), shotsA = [], shotsB = [], captions = [], video = {}, draft = false } = {}) {
  const E = [], scrubbed = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['the proposal must be a JSON object'], scrubbed, warnings };
  if (raw.schema !== undefined && raw.schema !== SCHEMA) E.push(`schema: must be "${SCHEMA}" (got ${JSON.stringify(raw.schema)})`);
  const txt = (v, path, max, { required = !draft } = {}) => {
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) { if (required) E.push(`${path}: required`); return undefined; }
    if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') { E.push(`${path}: must be text`); return undefined; }
    const s = v.replace(/\r\n/g, '\n').trim();
    if (s.length > max) { E.push(`${path}: ${s.length} characters, at most ${max}`); return undefined; }
    const r = scrubText(s);
    for (const k of r.found) scrubbed.push(`${path}: ${k}`);
    return r.text;
  };
  const f = {};
  f.title = txt(raw.title, 'title', LIMITS.title, { required: true });
  if (f.title && /\n/.test(f.title)) E.push('title: one line');
  if (!AREAS.includes(raw.area)) E.push(`area: one of ${AREAS.join(', ')} (got ${JSON.stringify(raw.area)})`);
  else f.area = raw.area;
  for (const k of ['topic', 'thread']) {
    if (raw[k] === undefined || raw[k] === null || raw[k] === '') continue;
    if (typeof raw[k] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(raw[k])) E.push(`${k}: a short id (letters, digits, . _ -)`);
    else f[k] = raw[k];
  }
  f.problem = txt(raw.problem, 'problem', LIMITS.text);
  f.idea = txt(raw.idea, 'idea', LIMITS.text);
  f.looksSame = txt(raw.looksSame, 'looksSame', LIMITS.text);
  f.risk = txt(raw.risk, 'risk', LIMITS.text);
  const vd = list(raw.visualDiff);
  if (vd.length > LIMITS.items) E.push(`visualDiff: at most ${LIMITS.items} items`);
  f.visualDiff = vd.slice(0, LIMITS.items).map((x, i) => txt(x, `visualDiff[${i}]`, LIMITS.item, { required: true })).filter((x) => x !== undefined);
  if (!draft && !f.visualDiff.length) E.push('visualDiff: at least one item (an honest "what differs, when you would notice it"; "nothing visible" is an item too)');
  const gain = raw.gain === undefined ? [] : Array.isArray(raw.gain) ? raw.gain : null;
  if (!gain) E.push('gain: a list of {what, before, after, tag, how}');
  else {
    if (gain.length > LIMITS.items) E.push(`gain: at most ${LIMITS.items} rows`);
    if (!draft && !gain.length) E.push('gain: at least one row');
    f.gain = gain.slice(0, LIMITS.items).map((g, i) => {
      const p = `gain[${i}]`;
      if (!g || typeof g !== 'object' || Array.isArray(g)) { E.push(`${p}: an object {what, before, after, tag, how}`); return null; }
      const row = {
        what: txt(g.what, `${p}.what`, LIMITS.gainWhat, { required: true }),
        before: txt(g.before, `${p}.before`, LIMITS.gainValue, { required: true }),
        after: txt(g.after, `${p}.after`, LIMITS.gainValue, { required: true }),
        tag: undefined,
        how: txt(g.how, `${p}.how`, LIMITS.how, { required: !draft }),
      };
      const tag = GAIN_TAGS.find((t) => t.toLowerCase() === String(g.tag ?? '').toLowerCase());
      if (!tag) E.push(`${p}.tag: one of ${GAIN_TAGS.join(', ')} (got ${JSON.stringify(g.tag)})`);
      else row.tag = tag;
      if (g.needsPhone !== undefined && typeof g.needsPhone !== 'boolean') E.push(`${p}.needsPhone: true or false`);
      if (g.needsPhone === true) row.needsPhone = true;
      if (row.how === undefined) delete row.how;
      return row;
    }).filter(Boolean);
  }
  // compare
  const c = raw.compare && typeof raw.compare === 'object' && !Array.isArray(raw.compare) ? raw.compare : (raw.compare === undefined ? {} : (E.push('compare: an object {a, b, shots, video, view}'), {}));
  f.compare = {};
  for (const side of ['a', 'b']) {
    const s = c[side] ?? {};
    if (typeof s !== 'object' || Array.isArray(s)) { E.push(`compare.${side}: {label, url}`); continue; }
    const label = txt(s.label, `compare.${side}.label`, LIMITS.label, { required: false }) || (side === 'a' ? 'Original' : 'PoC');
    const out = { label };
    if (s.url !== undefined && s.url !== null && s.url !== '') {
      if (!isLocalUrl(s.url)) E.push(`compare.${side}.url: must be a localhost URL (http(s)://localhost:<port>/…), never a LAN address (Hard rule 12); got a non-localhost URL`);
      else out.url = new URL(String(s.url)).href;
    }
    f.compare[side] = out;
  }
  if (c.view !== undefined && c.view !== '') { if (!VIEWS.includes(c.view)) E.push(`compare.view: one of ${VIEWS.join(', ')}`); else f.compare.view = c.view; }
  const abs = (p) => (typeof p === 'string' && p ? resolve(baseDir, p) : null);
  const shots = [];
  const fileShots = c.shots === undefined ? [] : Array.isArray(c.shots) ? c.shots : (E.push('compare.shots: a list of {caption, a, b}'), []);
  fileShots.forEach((s, i) => {
    if (!s || typeof s !== 'object' || !abs(s.a) || !abs(s.b)) { E.push(`compare.shots[${i}]: {caption, a: <file>, b: <file>}`); return; }
    shots.push({ caption: txt(s.caption, `compare.shots[${i}].caption`, LIMITS.caption, { required: false }), a: abs(s.a), b: abs(s.b) });
  });
  if (shotsA.length !== shotsB.length) E.push(`--shot-a and --shot-b pair up by order: got ${shotsA.length} A and ${shotsB.length} B`);
  else shotsA.forEach((a, i) => shots.push({ caption: txt(captions[i], `--caption ${i + 1}`, LIMITS.caption, { required: false }), a: resolve(a), b: resolve(shotsB[i]) }));
  if (shots.length > LIMITS.shots) E.push(`at most ${LIMITS.shots} screenshot pairs (got ${shots.length})`);
  const vid = {};
  const cv = c.video === undefined ? {} : c.video && typeof c.video === 'object' ? c.video : (E.push('compare.video: {a, b} or {both}'), {});
  for (const k of ['a', 'b', 'both']) if (abs(cv[k])) vid[k] = abs(cv[k]);
  for (const k of ['a', 'b', 'both']) if (video[k]) vid[k] = resolve(video[k]);
  if ((vid.a && !vid.b) || (vid.b && !vid.a)) E.push('video: give both A and B (or one combined clip as "both" / --video)');
  if (!draft && !shots.length && !vid.a && !vid.both) E.push('compare: at least one screenshot pair (compare.shots or --shot-a/--shot-b) or a video');
  // the files themselves
  for (const [i, s] of shots.entries()) {
    for (const side of ['a', 'b']) {
      try { const m = sniffMedia(s[side]); if (m.kind !== 'image') E.push(`shot ${i + 1} ${side.toUpperCase()}: ${s[side]} is a video; screenshots are images`); else s[`${side}Info`] = m; }
      catch (e) { E.push(`shot ${i + 1} ${side.toUpperCase()}: ${e.message}`); }
    }
    if (s.aInfo?.width && s.bInfo?.width && (s.aInfo.width !== s.bInfo.width || s.aInfo.height !== s.bInfo.height)) warnings.push(`shot ${i + 1}: A is ${s.aInfo.width}x${s.aInfo.height}, B is ${s.bInfo.width}x${s.bInfo.height}; the slider and blink views line them up best at the same size`);
  }
  for (const k of Object.keys(vid)) {
    try { const m = sniffMedia(vid[k]); if (m.kind !== 'video') E.push(`video ${k}: ${vid[k]} is an image`); else vid[`${k}Info`] = m; }
    catch (e) { E.push(`video ${k}: ${e.message}`); }
  }
  return { fields: f, media: { shots, video: vid }, errors: E, scrubbed, warnings };
}

/** Copy the media into the store for revision `rev`; returns {shots: [{caption, a, b, w?, h?}], video: {a?, b?, both?}}. */
function storeMedia(id, rev, media) {
  const dir = mediaDir(id);
  mkdirSync(dir, { recursive: true });
  const shots = media.shots.map((s, i) => {
    const out = { ...(s.caption && { caption: s.caption }) };
    for (const side of ['a', 'b']) {
      const info = s[`${side}Info`];
      const name = `r${rev}-${side}-${i + 1}.${info.ext}`;
      copyFileSync(s[side], join(dir, name));
      out[side] = name;
      if (info.width) out[`${side}Size`] = [info.width, info.height];
    }
    return out;
  });
  const video = {};
  for (const k of ['a', 'b', 'both']) {
    if (!media.video[k]) continue;
    const name = `r${rev}-video-${k}.${media.video[`${k}Info`].ext}`;
    copyFileSync(media.video[k], join(dir, name));
    video[k] = name;
  }
  return { shots, video };
}

function failIf(errors, what) {
  if (errors.length) throw new Error(`${what}: the proposal is not valid:\n  ${errors.join('\n  ')}`);
}

// ---- store -------------------------------------------------------------------------------------------

export function get(id) {
  const p = readJson(fileOf(parseProposalId(id)));
  if (!p) throw new Error(`no proposal ${parseProposalId(id)} (node tools/console.mjs proposal list)`);
  return p;
}

/**
 * Every proposal: waiting (proposed) ones first, oldest first; then the rest, newest change first.
 * {all: include withdrawn, waiting: only proposed, by: only this author's}.
 */
export function listProposals({ all = false, waiting = false, by } = {}) {
  let items = readAll(proposalsDir(), 'PR');
  if (waiting) items = items.filter((p) => p.state === 'proposed');
  else if (!all) items = items.filter((p) => p.state !== 'withdrawn');
  if (by) items = items.filter((p) => p.by === by);
  const w = items.filter((p) => p.state === 'proposed').sort((a, b) => (a.proposedAt < b.proposedAt ? -1 : a.proposedAt > b.proposedAt ? 1 : 0));
  const rest = items.filter((p) => p.state !== 'proposed').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return [...w, ...rest];
}

async function change(id, who, action, fn) {
  const pid = parseProposalId(id);
  return withGuard(GUARD, () => {
    const p = get(pid);
    const extra = fn(p) || {};
    const now = iso();
    p.updatedAt = now;
    p.history.push({ at: now, who, action, ...extra });
    writeJson(fileOf(pid), p);
    return p;
  });
}

const FIELDS = ['schema', 'title', 'area', 'topic', 'thread', 'problem', 'idea', 'looksSame', 'visualDiff', 'gain', 'risk'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const MEDIA_MISSING = /^compare: at least one screenshot pair/;
const needBy = (by) => { if (!by || !String(by).trim()) throw new Error('--by <your agent name> is required'); return String(by).slice(0, 80); };

/**
 * Post a proposal: {by, raw, baseDir, shotsA, shotsB, captions, video, draft}. Validates, copies the media into the
 * store, assigns PR-NNN. Returns {proposal, scrubbed, warnings}.
 */
export async function postProposal({ by, raw, baseDir, shotsA, shotsB, captions, video, draft = false }) {
  const who = needBy(by);
  const n = normalize(raw, { baseDir, shotsA, shotsB, captions, video, draft });
  failIf(n.errors, 'post');
  return withGuard(GUARD, () => {
    mkdirSync(proposalsDir(), { recursive: true });
    const id = nextId(readAll(proposalsDir(), 'PR'), 'PR');
    const now = iso();
    const media = storeMedia(id, 1, n.media);
    const p = {
      schema: SCHEMA, id, by: who, ...n.fields,
      compare: { ...n.fields.compare, shots: media.shots, ...(Object.keys(media.video).length && { video: media.video }) },
      state: draft ? 'draft' : 'proposed', rev: 1, decision: null, decisions: [],
      revisions: [{ rev: 1, at: now, by: who, note: 'first version' }],
      createdAt: now, updatedAt: now, ...(!draft && { proposedAt: now }),
      history: [{ at: now, who, action: draft ? 'drafted' : 'proposed', rev: 1 }],
    };
    writeJson(fileOf(id), p);
    return { proposal: p, scrubbed: n.scrubbed, warnings: n.warnings };
  });
}

/**
 * A new revision: {by, note, raw?, baseDir, shotsA, shotsB, captions, video, publish}. From draft (stays a draft
 * unless publish), proposed or changes-requested (-> proposed). Without raw the text stays; shots or videos given
 * replace the old ones, none keep them. rev+1; a decision on the old revision is no longer possible.
 */
export async function reviseProposal(id, { by, note, raw, baseDir, shotsA = [], shotsB = [], captions = [], video = {}, publish = false }) {
  const who = needBy(by);
  if (!note || !String(note).trim()) throw new Error('--note "<what changed, for the user>" is required');
  const cur = get(id);
  if (!['draft', 'proposed', 'changes-requested'].includes(cur.state)) throw new Error(`${cur.id} is ${cur.state}: post a new proposal instead`);
  const toDraft = cur.state === 'draft' && !publish;
  // the new file's fields, or the current ones; media: the new ones, or the current ones kept
  const base = raw || { ...pick(cur, FIELDS), compare: { a: cur.compare.a, b: cur.compare.b, view: cur.compare.view } };
  const hasNewMedia = !!(shotsA.length || shotsB.length || Object.values(video).some(Boolean) || raw?.compare?.shots?.length || raw?.compare?.video);
  const n = normalize(base, { baseDir, shotsA, shotsB, captions, video, draft: true });
  let errs = n.errors;
  if (!toDraft) {
    errs = normalize(base, { baseDir, shotsA, shotsB, captions, video, draft: false }).errors.filter((e) => !MEDIA_MISSING.test(e));
    const anyMedia = hasNewMedia ? n.media.shots.length || n.media.video.a || n.media.video.both : cur.compare.shots.length || cur.compare.video;
    if (!anyMedia) errs.push('compare: at least one screenshot pair or a video');
  }
  failIf(errs, `revise ${cur.id}`);
  const nt = scrubText(String(note).trim().slice(0, LIMITS.note));
  const p = await withGuard(GUARD, () => {
    const p = get(cur.id);
    if (p.rev !== cur.rev || p.state !== cur.state) throw new Error(`${p.id} changed while revising (now rev ${p.rev}, ${p.state}); run it again`);
    const rev = p.rev + 1;
    const now = iso();
    const media = hasNewMedia ? storeMedia(p.id, rev, n.media) : { shots: p.compare.shots, video: p.compare.video || {} };
    Object.assign(p, n.fields);
    p.compare = { ...n.fields.compare, shots: media.shots, ...(Object.keys(media.video).length && { video: media.video }) };
    for (const k of ['topic', 'thread']) if (n.fields[k] === undefined) delete p[k];
    p.rev = rev;
    p.state = toDraft ? 'draft' : 'proposed';
    if (!toDraft) p.proposedAt = now;
    p.decision = null;
    p.revisions.push({ rev, at: now, by: who, note: nt.text });
    p.updatedAt = now;
    p.history.push({ at: now, who, action: 'revised', rev, note: nt.text });
    writeJson(fileOf(p.id), p);
    return p;
  });
  return { proposal: p, scrubbed: [...n.scrubbed, ...nt.found.map((k) => `note: ${k}`)], warnings: n.warnings };
}

/** draft -> proposed (validated in full). */
export async function publishProposal(id, { by }) {
  const who = needBy(by);
  const cur = get(id);
  if (cur.state !== 'draft') throw new Error(`${cur.id} is ${cur.state}, not a draft`);
  const errs = normalize({ ...pick(cur, FIELDS), compare: { a: cur.compare.a, b: cur.compare.b, view: cur.compare.view } }, { draft: false }).errors
    .filter((e) => !MEDIA_MISSING.test(e));
  if (!cur.compare.shots.length && !cur.compare.video) errs.push('compare: at least one screenshot pair or a video (proposal revise --shot-a … --shot-b …)');
  failIf(errs, `publish ${cur.id}`);
  return change(cur.id, who, 'published', (p) => {
    if (p.state !== 'draft') throw new Error(`${p.id} is ${p.state}, not a draft`);
    p.state = 'proposed'; p.proposedAt = iso();
    return { rev: p.rev };
  });
}

/** The author withdraws it (no longer offered); a waiting `proposal wait` gets NEVER. */
export async function withdrawProposal(id, { by, note }) {
  const who = needBy(by);
  return change(id, who, 'withdrawn', (p) => {
    if (FINAL.has(p.state)) throw new Error(`${p.id} is ${p.state}`);
    p.state = 'withdrawn';
    return { note: note ? scrubText(String(note).slice(0, LIMITS.note)).text : undefined };
  });
}

/**
 * The user's decision (the page), or the lead's for a chat answer: value accept|reject|change (or the state names).
 * rev: the revision the user saw (refused when it was revised since). A change request needs notes.
 */
export async function decide(id, { value, notes, rev, who = 'user' } = {}) {
  const state = DECISION_VALUES[String(value ?? '').trim().toLowerCase()];
  if (!state) throw new Error(`the decision must be accept, reject or change (got ${JSON.stringify(value)})`);
  const nt = notes == null || notes === '' ? undefined : scrubText(String(notes).trim().slice(0, LIMITS.notes)).text || undefined;
  if (state === 'changes-requested' && !nt) throw new Error('say what to change (the notes box)');
  return change(id, String(who).slice(0, 80), 'decided', (p) => {
    if (rev !== undefined && rev !== null && rev !== '' && Number(rev) !== p.rev) throw new Error(`${p.id} was revised (now revision ${p.rev}, you saw ${rev}): reload the page`);
    if (p.state !== 'proposed') throw new Error(`${p.id} is ${p.state}, not waiting for a decision`);
    const d = { value: state, notes: nt, at: iso(), who: String(who).slice(0, 80), rev: p.rev };
    p.state = state;
    p.decision = d;
    p.decisions.push(d);
    return { value: state, rev: p.rev, note: nt };
  });
}

/** "Change my decision" on the page: a decided proposal goes back to proposed (the same revision). */
export async function undoDecision(id, { rev, who = 'user' } = {}) {
  return change(id, String(who).slice(0, 80), 'undecided', (p) => {
    if (!DECIDED.has(p.state)) throw new Error(`${p.id} is ${p.state}: nothing to change`);
    if (rev !== undefined && rev !== null && rev !== '' && Number(rev) !== p.rev) throw new Error(`${p.id} was revised (now revision ${p.rev}): reload the page`);
    const was = p.state;
    p.state = 'proposed';
    p.decision = null;
    return { was, rev: p.rev };
  });
}

// ---- waits -------------------------------------------------------------------------------------------

const decisionDetail = (p) => ({ id: p.id, rev: p.decision.rev, value: p.decision.value, notes: p.decision.notes ?? null, at: p.decision.at, title: p.title });

/** `proposal wait <id> --until decided`: met on accepted / rejected / changes-requested; never when withdrawn. */
export function waitCondition(id, { until = 'decided' } = {}) {
  if (until !== 'decided') throw new Error(`--until must be decided (got ${until})`);
  const pid = parseProposalId(id);
  get(pid);
  return {
    what: `proposal ${pid} decided`,
    check: () => {
      const p = get(pid);
      if (DECIDED.has(p.state) && p.decision) return { met: true, state: p.state, detail: JSON.stringify(decisionDetail(p)) };
      if (p.state === 'withdrawn') return { met: false, state: p.state, never: 'it was withdrawn' };
      return { met: false, state: `${p.state}, rev ${p.rev}` };
    },
  };
}

/** `proposal wait --any --by <agent> [--since ISO]`: the first decision on any of the agent's proposals after `since`. */
export function waitAnyCondition({ by, since = iso() } = {}) {
  if (!by) throw new Error('--any needs --by <agent> (whose proposals to watch)');
  if (Number.isNaN(Date.parse(since))) throw new Error(`--since must be an ISO time (got ${since})`);
  const t0 = new Date(since).toISOString();
  return {
    what: `a decision on a proposal by ${by} after ${t0}`,
    check: () => {
      const mine = listProposals({ all: true, by });
      const hits = mine.filter((p) => p.decision && DECIDED.has(p.state) && p.decision.at > t0).map(decisionDetail).sort((a, b) => (a.at < b.at ? -1 : 1));
      if (hits.length) return { met: true, state: `${hits.length} decided`, detail: JSON.stringify({ decisions: hits }) };
      return { met: false, state: `${mine.filter((p) => p.state === 'proposed').length} of ${mine.length} waiting` };
    },
  };
}

// ---- views -------------------------------------------------------------------------------------------

const media = (id, name) => (name ? `/media/${id}/${name}` : undefined);

/** What the page gets for one proposal: no history, media as /media/ URLs. Drafts and withdrawn: null. */
export function publicView(p) {
  if (!p || p.state === 'draft' || p.state === 'withdrawn') return null;
  const c = p.compare || {};
  return {
    id: p.id, by: p.by, title: p.title, area: p.area, topic: p.topic, thread: p.thread, state: p.state, rev: p.rev,
    problem: p.problem, idea: p.idea, looksSame: p.looksSame, visualDiff: p.visualDiff, gain: p.gain, risk: p.risk,
    compare: {
      a: c.a, b: c.b, view: c.view || 'side',
      shots: (c.shots || []).map((s) => ({ caption: s.caption, a: media(p.id, s.a), b: media(p.id, s.b), aSize: s.aSize, bSize: s.bSize })),
      video: c.video ? { a: media(p.id, c.video.a), b: media(p.id, c.video.b), both: media(p.id, c.video.both) } : undefined,
    },
    decision: p.decision, decisions: p.decisions, revisions: p.revisions,
    createdAt: p.createdAt, proposedAt: p.proposedAt, updatedAt: p.updatedAt,
  };
}

/** The list on the page: the proposals the user sees (not drafts, not withdrawn), waiting first. */
export function pageProposals() {
  return listProposals().filter((p) => p.state !== 'draft').map((p) => ({
    id: p.id, by: p.by, title: p.title, area: p.area, state: p.state, rev: p.rev,
    decision: p.decision ? { value: p.decision.value, at: p.decision.at } : null,
    shots: (p.compare?.shots || []).length, proposedAt: p.proposedAt, updatedAt: p.updatedAt,
  }));
}

/** One line for `proposal list`. */
export function line(p) {
  const d = p.decision ? ` -> ${p.decision.value}${p.decision.notes ? ` (notes: ${String(p.decision.notes).split('\n')[0].slice(0, 120)})` : ''}` : '';
  return `${p.id}  [${p.state} rev ${p.rev}]  ${p.area}  by ${p.by}: ${p.title}${d}`;
}

/** The text of `proposal show`. */
export function showText(p) {
  const L = [line(p)];
  if (p.topic) L.push(`  topic: ${p.topic}`);
  if (p.thread) L.push(`  thread: ${p.thread}`);
  for (const [k, label] of [['problem', 'problem'], ['idea', 'idea'], ['looksSame', 'looks the same'], ['risk', 'risk']]) if (p[k]) L.push(`  ${label}: ${p[k].replace(/\n/g, '\n    ')}`);
  if (p.visualDiff?.length) { L.push('  visual difference:'); for (const v of p.visualDiff) L.push(`    - ${v}`); }
  if (p.gain?.length) { L.push('  gain:'); for (const g of p.gain) L.push(`    ${g.what}: ${g.before} -> ${g.after} [${g.tag}]${g.needsPhone ? ' (phone check needed)' : ''}${g.how ? ` (${g.how})` : ''}`); }
  const c = p.compare || {};
  L.push(`  A: ${c.a?.label}${c.a?.url ? ` ${c.a.url}` : ''}   B: ${c.b?.label}${c.b?.url ? ` ${c.b.url}` : ''}${c.view ? `   view: ${c.view}` : ''}`);
  for (const [i, s] of (c.shots || []).entries()) L.push(`  shot ${i + 1}${s.caption ? ` "${s.caption}"` : ''}: ${s.a} | ${s.b}`);
  if (c.video) L.push(`  video: ${Object.entries(c.video).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  L.push(`  media: ${mediaDir(p.id)}`);
  if (p.decision) L.push(`  decision: ${p.decision.value} (rev ${p.decision.rev}, ${p.decision.at}, ${p.decision.who})${p.decision.notes ? `: ${p.decision.notes}` : ''}`);
  L.push('  history:');
  for (const h of p.history) L.push(`    ${h.at} ${h.who} ${h.action}${h.rev ? ` rev ${h.rev}` : ''}${h.value ? ` ${h.value}` : ''}${h.note ? `: ${h.note}` : ''}`);
  return L.join('\n');
}

/** The badge model: proposals waiting for the user (proposed), ids and scrubbed one-line titles only. */
export function waitingProposals() {
  return listProposals({ waiting: true }).map((p) => ({
    id: /^PR-\d{1,6}$/.test(p.id) ? p.id : 'PR-?',
    title: String(sanitize(p.title, 160)).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim(),
    status: p.state, yourTurn: true, updatedAt: p.proposedAt || p.updatedAt, queuedAt: p.proposedAt || p.createdAt,
  }));
}

