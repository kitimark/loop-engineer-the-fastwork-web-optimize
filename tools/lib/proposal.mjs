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
// Options (I-053, user 2026-10-02: "propose the multiple solution in the same proposal … allow user to decide which
// one"): instead of one solution, `options: [{name, label, idea, looksSame, visualDiff, gain, risk, compare: {b, shots,
// video}}]` (2-6; name: a short id such as "tiles"), all against the shared problem and compare.a (a shared idea,
// looksSame or risk may stand above them), and `recommended?: {option, why}`. Their media are stored as
// r<rev>-o<k>-a-1.png. The user accepts ONE option (decision.option = its name); `decide --option`; the decision
// events and waits carry `option`. A proposal without `options` is stored, served and shown exactly as before.
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
export const LIMITS = { title: 120, text: 2000, item: 300, items: 12, gainWhat: 120, gainValue: 80, how: 300, caption: 120, label: 60, notes: 4000, note: 300, shots: 12, options: 6, imageBytes: 15 * 1024 * 1024, videoBytes: 200 * 1024 * 1024 };
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

/** One "## Section" (or "### Section" inside an option) of the Markdown form into `out`. */
function mdSection(out, head, text) {
  const key = SECTION_KEYS[head.trim().toLowerCase().replace(/[:.]$/, '')];
  if (!key) return;
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

const splitHead = (p) => { const nl = p.indexOf('\n'); return [(nl < 0 ? p : p.slice(0, nl)).trim(), (nl < 0 ? '' : p.slice(nl + 1)).trim()]; };
const labelUrl = (v) => { const [label, url] = v.split('|').map((x) => x.trim()); return { label, ...(url && { url }) }; };

/**
 * The Markdown form: front matter (title, area, topic, thread, a/b: "label | url", view, recommended: "name | why") +
 * "## Section" blocks. Options (I-053): "## Option <name>: <label>" blocks, each with an optional "b: label | url" line
 * and "### Idea", "### Looks the same", "### Visual difference", "### Gain", "### Risk" sections.
 */
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
      if (k === 'a' || k === 'b') out.compare[k] = labelUrl(v);
      else if (k === 'view') out.compare.view = v;
      else if (k === 'looks-same' || k === 'lookssame') out.looksSame = v;
      else if (k === 'recommended') { const [option, ...why] = v.split('|'); out.recommended = { option: option.trim(), why: why.join('|').trim() }; }
      else if (['title', 'area', 'topic', 'thread', 'schema'].includes(k)) out[k] = v;
    }
  }
  for (const p of body.split(/^##\s+/m).slice(1)) {
    const [head, text] = splitHead(p);
    const om = head.match(/^option\s+([^\s:]+)\s*(?::\s*(.*))?$/i);
    if (!om) { mdSection(out, head, text); continue; }
    const o = { name: om[1], ...(om[2] && { label: om[2].trim() }) };
    const [pre, ...subs] = text.split(/^###\s+/m);
    for (const l of pre.split('\n')) {
      const m = l.match(/^\s*(b|label)\s*:\s*(.*?)\s*$/i);
      if (m && m[1].toLowerCase() === 'b') o.compare = { b: labelUrl(m[2]) };
      else if (m) o.label = m[2];
    }
    for (const sp of subs) { const [h, t] = splitHead(sp); mdSection(o, h, t); }
    (out.options ||= []).push(o);
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
// I-053: an option's media carry its 1-based index: r1-o2-a-1.png, r1-o2-video-b.mp4.
export const MEDIA_NAME = /^r\d{1,4}-(?:o\d{1,2}-)?(?:(?:a|b)-\d{1,2}\.(?:png|jpg|webp|gif)|video-(?:a|b|both)\.(?:mp4|mov|webm))$/;
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
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const hasMedia = (m) => !!(m && (m.shots?.length || m.video?.a || m.video?.both));
/** An option name: what `decide --option` and the decision carry. */
export const OPTION_NAME = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/**
 * The author's raw object (+ CLI shots and videos) -> {fields, media: {shots: [{caption, a, b}], video, options?:
 * [{shots, video}]}, errors, scrubbed: ["problem: ip address", …], warnings}. Media paths are absolute (relative to
 * baseDir); nothing is copied. draft: only the title and area are required (and option names), and no media.
 * With `options` (I-053): 2-6 solutions, each {name, label, idea, looksSame, visualDiff, gain, risk, compare: {b, shots,
 * video}} against the shared compare.a; `recommended: {option, why}`; the CLI shots go to the option named by `option`.
 */
export function normalize(raw, { baseDir = process.cwd(), shotsA = [], shotsB = [], captions = [], video = {}, draft = false, option: cliOption } = {}) {
  const E = [], scrubbed = [], warnings = [];
  if (!isObj(raw)) return { errors: ['the proposal must be a JSON object'], scrubbed, warnings };
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

  /** One solution's text (the proposal itself, or one option): idea, looksSame, risk, visualDiff, gain. `p`: path prefix. */
  const solution = (src, p, { looksSameShared = false } = {}) => {
    const s = {};
    s.idea = txt(src.idea, `${p}idea`, LIMITS.text);
    s.looksSame = txt(src.looksSame, `${p}looksSame`, LIMITS.text, { required: !draft && !looksSameShared });
    s.risk = txt(src.risk, `${p}risk`, LIMITS.text);
    const vd = list(src.visualDiff);
    if (vd.length > LIMITS.items) E.push(`${p}visualDiff: at most ${LIMITS.items} items`);
    s.visualDiff = vd.slice(0, LIMITS.items).map((x, i) => txt(x, `${p}visualDiff[${i}]`, LIMITS.item, { required: true })).filter((x) => x !== undefined);
    if (!draft && !s.visualDiff.length) E.push(`${p}visualDiff: at least one item (an honest "what differs, when you would notice it"; "nothing visible" is an item too)`);
    const gain = src.gain === undefined ? [] : Array.isArray(src.gain) ? src.gain : null;
    if (!gain) E.push(`${p}gain: a list of {what, before, after, tag, how}`);
    else {
      if (gain.length > LIMITS.items) E.push(`${p}gain: at most ${LIMITS.items} rows`);
      if (!draft && !gain.length) E.push(`${p}gain: at least one row`);
      s.gain = gain.slice(0, LIMITS.items).map((g, i) => {
        const gp = `${p}gain[${i}]`;
        if (!isObj(g)) { E.push(`${gp}: an object {what, before, after, tag, how}`); return null; }
        const row = {
          what: txt(g.what, `${gp}.what`, LIMITS.gainWhat, { required: true }),
          before: txt(g.before, `${gp}.before`, LIMITS.gainValue, { required: true }),
          after: txt(g.after, `${gp}.after`, LIMITS.gainValue, { required: true }),
          tag: undefined,
          how: txt(g.how, `${gp}.how`, LIMITS.how, { required: !draft }),
        };
        const tag = GAIN_TAGS.find((t) => t.toLowerCase() === String(g.tag ?? '').toLowerCase());
        if (!tag) E.push(`${gp}.tag: one of ${GAIN_TAGS.join(', ')} (got ${JSON.stringify(g.tag)})`);
        else row.tag = tag;
        if (g.needsPhone !== undefined && typeof g.needsPhone !== 'boolean') E.push(`${gp}.needsPhone: true or false`);
        if (g.needsPhone === true) row.needsPhone = true;
        if (row.how === undefined) delete row.how;
        return row;
      }).filter(Boolean);
    }
    return s;
  };
  /** compare.a / compare.b (or an option's b): {label, url?}; localhost URLs only. */
  const side = (s, path, dflt) => {
    s ??= {};
    if (!isObj(s)) { E.push(`${path}: {label, url}`); return undefined; }
    const out = { label: txt(s.label, `${path}.label`, LIMITS.label, { required: false }) || dflt };
    if (s.url !== undefined && s.url !== null && s.url !== '') {
      if (!isLocalUrl(s.url)) E.push(`${path}.url: must be a localhost URL (http(s)://localhost:<port>/…), never a LAN address (Hard rule 12); got a non-localhost URL`);
      else out.url = new URL(String(s.url)).href;
    }
    return out;
  };
  const abs = (p) => (typeof p === 'string' && p ? resolve(baseDir, p) : null);
  /** Screenshot pairs and videos of one solution: `c` its compare object, `p` the path prefix, `cli` the CLI media or null. */
  const media = (c, p, cli) => {
    const shots = [];
    const fileShots = c.shots === undefined ? [] : Array.isArray(c.shots) ? c.shots : (E.push(`${p}compare.shots: a list of {caption, a, b}`), []);
    fileShots.forEach((s, i) => {
      if (!s || typeof s !== 'object' || !abs(s.a) || !abs(s.b)) { E.push(`${p}compare.shots[${i}]: {caption, a: <file>, b: <file>}`); return; }
      shots.push({ caption: txt(s.caption, `${p}compare.shots[${i}].caption`, LIMITS.caption, { required: false }), a: abs(s.a), b: abs(s.b) });
    });
    if (cli) {
      if (cli.shotsA.length !== cli.shotsB.length) E.push(`--shot-a and --shot-b pair up by order: got ${cli.shotsA.length} A and ${cli.shotsB.length} B`);
      else cli.shotsA.forEach((a, i) => shots.push({ caption: txt(cli.captions[i], `--caption ${i + 1}`, LIMITS.caption, { required: false }), a: resolve(a), b: resolve(cli.shotsB[i]) }));
    }
    if (shots.length > LIMITS.shots) E.push(`${p ? `${p.slice(0, -1)}: ` : ''}at most ${LIMITS.shots} screenshot pairs (got ${shots.length})`);
    const vid = {};
    const cv = c.video === undefined ? {} : isObj(c.video) ? c.video : (E.push(`${p}compare.video: {a, b} or {both}`), {});
    for (const k of ['a', 'b', 'both']) if (abs(cv[k])) vid[k] = abs(cv[k]);
    if (cli) for (const k of ['a', 'b', 'both']) if (cli.video[k]) vid[k] = resolve(cli.video[k]);
    if ((vid.a && !vid.b) || (vid.b && !vid.a)) E.push(`${p}video: give both A and B (or one combined clip as "both" / --video)`);
    if (!draft && !shots.length && !vid.a && !vid.both) E.push(`${p}compare: at least one screenshot pair (compare.shots or --shot-a/--shot-b) or a video`);
    // the files themselves
    const sp = p ? `${p.slice(0, -1)} ` : '';
    for (const [i, s] of shots.entries()) {
      for (const ab of ['a', 'b']) {
        try { const m = sniffMedia(s[ab]); if (m.kind !== 'image') E.push(`${sp}shot ${i + 1} ${ab.toUpperCase()}: ${s[ab]} is a video; screenshots are images`); else s[`${ab}Info`] = m; }
        catch (e) { E.push(`${sp}shot ${i + 1} ${ab.toUpperCase()}: ${e.message}`); }
      }
      if (s.aInfo?.width && s.bInfo?.width && (s.aInfo.width !== s.bInfo.width || s.aInfo.height !== s.bInfo.height)) warnings.push(`${sp}shot ${i + 1}: A is ${s.aInfo.width}x${s.aInfo.height}, B is ${s.bInfo.width}x${s.bInfo.height}; the slider and blink views line them up best at the same size`);
    }
    for (const k of Object.keys(vid)) {
      try { const m = sniffMedia(vid[k]); if (m.kind !== 'video') E.push(`${sp}video ${k}: ${vid[k]} is an image`); else vid[`${k}Info`] = m; }
      catch (e) { E.push(`${sp}video ${k}: ${e.message}`); }
    }
    return { shots, video: vid };
  };

  const c = isObj(raw.compare) ? raw.compare : (raw.compare === undefined ? {} : (E.push('compare: an object {a, b, shots, video, view}'), {}));
  const cli = { shotsA, shotsB, captions, video };
  const anyCli = !!(shotsA.length || shotsB.length || Object.values(video).some(Boolean));
  const viewOf = () => { if (c.view !== undefined && c.view !== '') { if (!VIEWS.includes(c.view)) E.push(`compare.view: one of ${VIEWS.join(', ')}`); else f.compare.view = c.view; } };
  const hasOptions = raw.options !== undefined && raw.options !== null;
  if (!hasOptions) {
    if (cliOption !== undefined && cliOption !== null && cliOption !== '') E.push('--option: this proposal has no options (--option names the option that --shot-a/--shot-b/--video belong to)');
    if (raw.recommended !== undefined && raw.recommended !== null) E.push('recommended: only with options (it names the option you recommend)');
    Object.assign(f, solution(raw, ''));
    f.compare = {};
    for (const s of ['a', 'b']) { const v = side(c[s], `compare.${s}`, s === 'a' ? 'Original' : 'PoC'); if (v) f.compare[s] = v; }
    viewOf();
    const m = media(c, '', cli);
    return { fields: f, media: m, errors: E, scrubbed, warnings };
  }
  // ---- options (I-053): the shared problem and original A, then 2-6 solutions ----
  f.idea = txt(raw.idea, 'idea', LIMITS.text, { required: false });
  f.looksSame = txt(raw.looksSame, 'looksSame', LIMITS.text, { required: false });
  f.risk = txt(raw.risk, 'risk', LIMITS.text, { required: false });
  for (const k of ['visualDiff', 'gain']) if (list(raw[k]).length) E.push(`${k}: with options, give it in each option (options[].${k})`);
  f.visualDiff = [];
  f.gain = [];
  f.compare = {};
  const a = side(c.a, 'compare.a', 'Original');
  if (a) f.compare.a = a;
  if (c.b !== undefined && c.b !== null) E.push('compare.b: with options, B goes in each option (options[].compare.b)');
  if (c.shots !== undefined || c.video !== undefined) E.push('compare.shots: with options, B shots and videos go in each option (options[].compare.shots, .video)');
  viewOf();
  const opts = Array.isArray(raw.options) ? raw.options : (E.push('options: a list of {name, label, idea, looksSame, visualDiff, gain, risk, compare: {b, shots, video}}'), []);
  if (Array.isArray(raw.options) && opts.length < 2) E.push('options: at least 2 (one solution: leave out "options")');
  if (opts.length > LIMITS.options) E.push(`options: at most ${LIMITS.options}`);
  const names = opts.map((o) => (isObj(o) && typeof o.name === 'string' ? o.name.trim() : ''));
  const target = cliOption === undefined || cliOption === null || cliOption === '' ? null : findOptionIn(opts.map((o, i) => ({ name: names[i], label: isObj(o) ? o.label : undefined })), String(cliOption));
  if (anyCli && cliOption == null) E.push(`this proposal has options: say which one the --shot-a/--shot-b/--video flags are for (--option <name>: ${names.join(', ')})`);
  if (cliOption != null && cliOption !== '' && !target) E.push(`--option: no option "${cliOption}" (options: ${names.join(', ')})`);
  f.options = [];
  const optMedia = [];
  opts.slice(0, LIMITS.options).forEach((o, i) => {
    const p = `options[${i}].`;
    if (!isObj(o)) { E.push(`options[${i}]: an object {name, label, idea, …}`); return; }
    const name = names[i];
    if (!OPTION_NAME.test(name)) { E.push(`${p}name: a short id (lower-case letters, digits, . _ -; at most 40), e.g. "tiles"`); return; }
    if (names.indexOf(name) !== i) { E.push(`${p}name: "${name}" is used twice`); return; }
    const oc = o.compare === undefined ? {} : isObj(o.compare) ? o.compare : (E.push(`${p}compare: {b, shots, video}`), {});
    const out = { name, label: txt(o.label, `${p}label`, LIMITS.label, { required: false }) || name, ...solution(o, p, { looksSameShared: !!f.looksSame }) };
    const b = side(oc.b, `${p}compare.b`, out.label);
    out.compare = { b };
    f.options.push(out);
    optMedia.push(media(oc, p, target?.name === name ? cli : null));
  });
  if (raw.recommended !== undefined && raw.recommended !== null) {
    const r = raw.recommended;
    if (!isObj(r)) E.push('recommended: {option, why} (the option you recommend, and why)');
    else {
      const o = f.options.find((x) => x.name === r.option);
      if (!o) E.push(`recommended.option: one of ${names.join(', ')} (got ${JSON.stringify(r.option)})`);
      const why = txt(r.why, 'recommended.why', LIMITS.item, { required: true });
      if (o && why) f.recommended = { option: o.name, why };
    }
  }
  return { fields: f, media: { shots: [], video: {}, options: optMedia }, errors: E, scrubbed, warnings };
}

/** The option `want` names: its name, or its label (any case). null if none. */
export function findOptionIn(options, want) {
  const w = String(want ?? '').trim();
  if (!w) return null;
  return options.find((o) => o.name === w) || options.find((o) => o.name?.toLowerCase() === w.toLowerCase() || String(o.label ?? '').toLowerCase() === w.toLowerCase()) || null;
}

/**
 * Copy the media into the store for revision `rev`; returns {shots: [{caption, a, b, w?, h?}], video: {a?, b?, both?}}.
 * `pre`: "o2-" for option 2's media (I-053), "" for the proposal's own.
 */
function storeMedia(id, rev, media, pre = '') {
  const dir = mediaDir(id);
  mkdirSync(dir, { recursive: true });
  const shots = media.shots.map((s, i) => {
    const out = { ...(s.caption && { caption: s.caption }) };
    for (const side of ['a', 'b']) {
      const info = s[`${side}Info`];
      const name = `r${rev}-${pre}${side}-${i + 1}.${info.ext}`;
      copyFileSync(s[side], join(dir, name));
      out[side] = name;
      if (info.width) out[`${side}Size`] = [info.width, info.height];
    }
    return out;
  });
  const video = {};
  for (const k of ['a', 'b', 'both']) {
    if (!media.video[k]) continue;
    const name = `r${rev}-${pre}video-${k}.${media.video[`${k}Info`].ext}`;
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
const OPTION_FIELDS = ['name', 'label', 'idea', 'looksSame', 'visualDiff', 'gain', 'risk'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const MEDIA_MISSING = /^(?:options\[\d+\]\.)?compare: at least one screenshot pair/;
const needBy = (by) => { if (!by || !String(by).trim()) throw new Error('--by <your agent name> is required'); return String(by).slice(0, 80); };
const storedHasMedia = (c) => !!(c && (c.shots?.length || c.video));

/** A stored proposal as the author's raw object again (text, compare a/b/view, options without media): for re-validation. */
function storedRaw(p) {
  const c = p.compare || {};
  return {
    ...pick(p, FIELDS),
    compare: pick({ a: c.a, b: c.b, view: c.view }, ['a', 'b', 'view']),
    ...(p.options && { options: p.options.map((o) => ({ ...pick(o, OPTION_FIELDS), compare: pick({ b: o.compare?.b }, ['b']) })) }),
    ...(p.recommended && { recommended: p.recommended }),
  };
}

/** Store the normalized options with their media for revision `rev`; an option without new media keeps `prev`'s (same name). */
function storeOptions(id, rev, n, prev = []) {
  return n.fields.options.map((o, k) => {
    const nm = n.media.options[k];
    const old = prev.find((x) => x.name === o.name);
    const m = hasMedia(nm) ? storeMedia(id, rev, nm, `o${k + 1}-`) : { shots: old?.compare?.shots || [], video: old?.compare?.video || {} };
    return { ...o, compare: { ...o.compare, shots: m.shots, ...(Object.keys(m.video).length && { video: m.video }) } };
  });
}

/** Errors for options that have no screenshots or video, new (`n`) or kept from `prev` (same name). */
function optionMediaErrors(n, prev = []) {
  return (n.fields.options || []).flatMap((o, k) => (hasMedia(n.media.options[k]) || storedHasMedia(prev.find((x) => x.name === o.name)?.compare)
    ? [] : [`options[${k}] (${o.name}): at least one screenshot pair or a video`]));
}

/**
 * Post a proposal: {by, raw, baseDir, shotsA, shotsB, captions, video, option, draft}. Validates, copies the media into
 * the store, assigns PR-NNN. Returns {proposal, scrubbed, warnings}. `option`: the option the CLI shots belong to.
 */
export async function postProposal({ by, raw, baseDir, shotsA, shotsB, captions, video, option, draft = false }) {
  const who = needBy(by);
  const n = normalize(raw, { baseDir, shotsA, shotsB, captions, video, option, draft });
  failIf(n.errors, 'post');
  return withGuard(GUARD, () => {
    mkdirSync(proposalsDir(), { recursive: true });
    const id = nextId(readAll(proposalsDir(), 'PR'), 'PR');
    const now = iso();
    const media = storeMedia(id, 1, n.media);
    const p = {
      schema: SCHEMA, id, by: who, ...n.fields,
      compare: { ...n.fields.compare, shots: media.shots, ...(Object.keys(media.video).length && { video: media.video }) },
      ...(n.fields.options && { options: storeOptions(id, 1, n) }),
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
 * A new revision: {by, note, raw?, baseDir, shotsA, shotsB, captions, video, option, publish}. From draft (stays a draft
 * unless publish), proposed or changes-requested (-> proposed). Without raw the text stays; shots or videos given
 * replace the old ones, none keep them. rev+1; a decision on the old revision is no longer possible.
 * Options (I-053): raw's options replace the old list (add, change, drop); an option with new shots or a video (in raw,
 * or the CLI's with `option` naming it) gets them, one without keeps the media of the old option of the same name.
 */
export async function reviseProposal(id, { by, note, raw, baseDir, shotsA = [], shotsB = [], captions = [], video = {}, option, publish = false }) {
  const who = needBy(by);
  if (!note || !String(note).trim()) throw new Error('--note "<what changed, for the user>" is required');
  const cur = get(id);
  if (!['draft', 'proposed', 'changes-requested'].includes(cur.state)) throw new Error(`${cur.id} is ${cur.state}: post a new proposal instead`);
  const toDraft = cur.state === 'draft' && !publish;
  // the new file's fields, or the current ones; media: the new ones, or the current ones kept
  const base = raw || storedRaw(cur);
  const hasNewMedia = !!(shotsA.length || shotsB.length || Object.values(video).some(Boolean) || raw?.compare?.shots?.length || raw?.compare?.video);
  const n = normalize(base, { baseDir, shotsA, shotsB, captions, video, option, draft: true });
  let errs = n.errors;
  if (!toDraft) {
    errs = normalize(base, { baseDir, shotsA, shotsB, captions, video, option, draft: false }).errors.filter((e) => !MEDIA_MISSING.test(e));
    if (n.fields.options) errs.push(...optionMediaErrors(n, cur.options));
    else {
      const anyMedia = hasNewMedia ? n.media.shots.length || n.media.video.a || n.media.video.both : cur.compare.shots.length || cur.compare.video;
      if (!anyMedia) errs.push('compare: at least one screenshot pair or a video');
    }
  }
  failIf(errs, `revise ${cur.id}`);
  const nt = scrubText(String(note).trim().slice(0, LIMITS.note));
  const p = await withGuard(GUARD, () => {
    const p = get(cur.id);
    if (p.rev !== cur.rev || p.state !== cur.state) throw new Error(`${p.id} changed while revising (now rev ${p.rev}, ${p.state}); run it again`);
    const rev = p.rev + 1;
    const now = iso();
    const prevOptions = p.options || [];
    if (n.fields.options) {
      const { options, ...rest } = n.fields;
      Object.assign(p, rest);
      p.compare = { ...n.fields.compare, shots: [] };
      p.options = storeOptions(p.id, rev, n, prevOptions);
    } else {
      const media = hasNewMedia ? storeMedia(p.id, rev, n.media) : { shots: p.compare.shots, video: p.compare.video || {} };
      Object.assign(p, n.fields);
      p.compare = { ...n.fields.compare, shots: media.shots, ...(Object.keys(media.video).length && { video: media.video }) };
      delete p.options;
    }
    for (const k of ['topic', 'thread', 'recommended', 'idea', 'looksSame', 'risk']) if (n.fields[k] === undefined) delete p[k];
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
  const n = normalize(storedRaw(cur), { draft: false });
  const errs = n.errors.filter((e) => !MEDIA_MISSING.test(e));
  if (n.fields?.options) errs.push(...optionMediaErrors({ fields: n.fields, media: { options: n.fields.options.map(() => null) } }, cur.options));
  else if (!cur.compare.shots.length && !cur.compare.video) errs.push('compare: at least one screenshot pair or a video (proposal revise --shot-a … --shot-b …)');
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

/** The option of proposal `p` that `want` names (its name, or its label in any case), or null. */
export const findOption = (p, want) => findOptionIn(p.options || [], want);

/**
 * The user's decision (the page), or the lead's for a chat answer: value accept|reject|change (or the state names).
 * rev: the revision the user saw (refused when it was revised since). A change request needs notes.
 * option (I-053): on a proposal with options, accept needs the option picked (its name or label); a change request may
 * name one; reject is for the whole proposal. Stored as decision.option (the name).
 */
export async function decide(id, { value, notes, rev, option, who = 'user' } = {}) {
  const state = DECISION_VALUES[String(value ?? '').trim().toLowerCase()];
  if (!state) throw new Error(`the decision must be accept, reject or change (got ${JSON.stringify(value)})`);
  const nt = notes == null || notes === '' ? undefined : scrubText(String(notes).trim().slice(0, LIMITS.notes)).text || undefined;
  if (state === 'changes-requested' && !nt) throw new Error('say what to change (the notes box)');
  const want = option == null || String(option).trim() === '' ? undefined : String(option).trim().slice(0, 80);
  return change(id, String(who).slice(0, 80), 'decided', (p) => {
    if (rev !== undefined && rev !== null && rev !== '' && Number(rev) !== p.rev) throw new Error(`${p.id} was revised (now revision ${p.rev}, you saw ${rev}): reload the page`);
    if (p.state !== 'proposed') throw new Error(`${p.id} is ${p.state}, not waiting for a decision`);
    let picked;
    if (p.options?.length) {
      const names = p.options.map((o) => o.name).join(', ');
      if (want !== undefined) {
        if (state === 'rejected') throw new Error(`reject is for the whole proposal; to drop one option, request a change (--value change --option ${want})`);
        const o = findOption(p, want);
        if (!o) throw new Error(`no option "${want}" in ${p.id} (options: ${names})`);
        picked = o.name;
      } else if (state === 'accepted') throw new Error(`${p.id} has ${p.options.length} options: say which one you accept (--option <name>: ${names})`);
    } else if (want !== undefined) throw new Error(`${p.id} has no options (--option is for a proposal with options)`);
    const d = { value: state, notes: nt, at: iso(), who: String(who).slice(0, 80), rev: p.rev, ...(picked && { option: picked }) };
    p.state = state;
    p.decision = d;
    p.decisions.push(d);
    return { value: state, rev: p.rev, note: nt, ...(picked && { option: picked }) };
  });
}

/** "Change my decision" on the page: a decided proposal goes back to proposed (the same revision). */
export async function undoDecision(id, { rev, who = 'user' } = {}) {
  return change(id, String(who).slice(0, 80), 'undecided', (p) => {
    if (!DECIDED.has(p.state)) throw new Error(`${p.id} is ${p.state}: nothing to change`);
    if (rev !== undefined && rev !== null && rev !== '' && Number(rev) !== p.rev) throw new Error(`${p.id} was revised (now revision ${p.rev}): reload the page`);
    const was = p.state;
    const wasOption = p.decision?.option;
    p.state = 'proposed';
    p.decision = null;
    return { was, rev: p.rev, ...(wasOption && { wasOption }) };
  });
}

// ---- waits -------------------------------------------------------------------------------------------
// I-045 (2026-10-01): the user rejected PR-001, undid it ("Change my decision") and requested a change; the author's
// `wait --until decided` had exited on "rejected" and nothing watched all proposals, so the change notified nobody.
// The waits below read the decision EVENTS in the history (decided, undecided), not only the standing state:
// `wait --any` (all proposals without --by), `wait <id> --until changed|decided --since`, and the read marks that let
// the lead's `thread wait --as lead` report each event once (proposalNews / commitProposalNews).

/** "Re-arm" hints print the command as an agent types it. */
const CMD = 'node tools/console.mjs proposal wait';

function sinceIso(since) {
  if (since === undefined || since === null || Number.isNaN(Date.parse(since))) throw new Error(`--since must be an ISO time (got ${since})`);
  return new Date(since).toISOString();
}

const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/**
 * Every decision event in a proposal's history, oldest first: {id, n (history index), event: decided|undecided, value
 * (the new state), was (the decision it replaced: for undecided the one undone, for decided the one undone just
 * before it on the same revision, else null), rev, notes, who, at, title, by (the author), option (I-053: the option
 * picked by this decision, else null), wasOption (the option of the decision in `was`, else null)}.
 */
export function decisionEvents(p) {
  const out = [];
  let undone = null, undoneOption = null;
  (p.history || []).forEach((h, n) => {
    const base = { id: p.id, n, rev: h.rev ?? null, who: h.who, at: h.at, title: p.title, by: p.by };
    if (h.action === 'decided') { out.push({ ...base, event: 'decided', value: h.value, was: undone, notes: h.note ?? null, option: h.option ?? null, wasOption: undone ? undoneOption : null }); undone = null; undoneOption = null; }
    else if (h.action === 'undecided') { out.push({ ...base, event: 'undecided', value: 'proposed', was: h.was ?? null, notes: null, option: null, wasOption: h.wasOption ?? null }); undone = h.was ?? null; undoneOption = h.wasOption ?? null; }
    else if (h.action === 'revised' || h.action === 'withdrawn') { undone = null; undoneOption = null; }
  });
  return out;
}

/** The decision events of `items` after `t0` (strictly), in time order. */
export const eventsSince = (items, t0) => items.flatMap(decisionEvents).filter((e) => e.at > t0).sort(byAt);

const decisionDetail = (p) => {
  const last = decisionEvents(p).filter((e) => e.event === 'decided').at(-1);
  return { id: p.id, rev: p.decision.rev, value: p.decision.value, notes: p.decision.notes ?? null, at: p.decision.at, title: p.title, was: last?.was ?? null, option: p.decision.option ?? null };
};

/**
 * `proposal wait <id> [--until decided|changed] [--since ISO]`.
 *   decided            met while it stands decided (accepted / rejected / changes-requested): at once if it already is
 *   decided --since T  met on a decision made after T that still stands (an undo alone does not wake it; the
 *                      re-decision does); detail adds the events after T
 *   changed [--since T, default now]  met on any decision event after T: a decision, an undo, a changed decision
 * NEVER when withdrawn (for changed: only if nothing changed first). rearm(detail): the command that waits for the next
 * change (`--until changed --since <the last event>`).
 */
export function waitCondition(id, { until = 'decided', since } = {}) {
  if (until !== 'decided' && until !== 'changed') throw new Error(`--until must be decided or changed (got ${until})`);
  const pid = parseProposalId(id);
  const t0 = since !== undefined ? sinceIso(since) : until === 'changed' ? iso() : undefined;
  get(pid);
  const what = until === 'changed' ? `proposal ${pid} decision changed after ${t0}` : `proposal ${pid} decided${t0 ? ` after ${t0}` : ''}`;
  const rearm = (d) => `${CMD} ${pid} --until changed --since ${d.events?.at(-1)?.at || d.at || d.decision?.at || t0 || iso()}`;
  const check = () => {
    const p = get(pid);
    if (until === 'changed') {
      const events = eventsSince([p], t0);
      if (events.length) return { met: true, state: `${p.state}, rev ${p.rev}`, detail: JSON.stringify({ id: p.id, title: p.title, state: p.state, rev: p.rev, decision: p.decision ? decisionDetail(p) : null, events }) };
    } else if (DECIDED.has(p.state) && p.decision && (!t0 || p.decision.at > t0)) {
      return { met: true, state: p.state, detail: JSON.stringify({ ...decisionDetail(p), ...(t0 && { events: eventsSince([p], t0) }) }) };
    }
    if (p.state === 'withdrawn') return { met: false, state: p.state, never: 'it was withdrawn' };
    return { met: false, state: `${p.state}, rev ${p.rev}${t0 && DECIDED.has(p.state) ? ` (decided at ${p.decision?.at}, not after ${t0})` : ''}` };
  };
  return { what, check, rearm };
}

/**
 * `proposal wait --any [--by <agent>] [--since ISO]`: met on any decision event (a decision, an undo, a changed
 * decision) after `since` on the agent's proposals, or on ALL proposals without --by (the lead). detail:
 * {decisions: the standing decisions made after since, [{id, rev, value, notes, at, title, was}], events: [every
 * decision event after since, oldest first]}. rearm(detail): the same wait from the last event on.
 */
export function waitAnyCondition({ by, since } = {}) {
  const t0 = sinceIso(since ?? iso());
  return {
    what: by ? `a decision on a proposal by ${by} after ${t0}` : `a decision on any proposal after ${t0}`,
    rearm: (d) => `${CMD} --any${by ? ` --by ${by}` : ''} --since ${d.events?.at(-1)?.at || t0}`,
    check: () => {
      const items = listProposals({ all: true, by });
      const events = eventsSince(items, t0);
      if (events.length) {
        const decisions = items.filter((p) => p.decision && DECIDED.has(p.state) && p.decision.at > t0).map(decisionDetail).sort(byAt);
        return { met: true, state: `${events.length} decision event(s)`, detail: JSON.stringify({ decisions, events }) };
      }
      return { met: false, state: `${items.filter((p) => p.state === 'proposed').length} of ${items.length} waiting` };
    },
  };
}

// ---- read marks: the lead's `thread wait` reports each decision event once (I-045) ---------------------
// <console>/proposal-reads.json: {<reader>: {since: ISO, seen: {PR-001: <history entries reported>}}}. A reader's
// mark starts when its first wait is armed (initProposalMark): earlier decisions are not news. Per proposal, events
// at history index >= seen[id] are news; a proposal not yet in `seen`: events after `since`.
const marksFile = () => join(consoleDir(), 'proposal-reads.json');
const readerName = (r) => { if (!r || !String(r).trim()) throw new Error('--as <agent> is required'); return String(r).slice(0, 80); };

export function proposalMark(reader) { return (readJson(marksFile()) || {})[readerName(reader)] || null; }

/** Start `reader`'s mark at `at` (default now) unless it has one; returns the mark. */
export async function initProposalMark(reader, at = iso()) {
  const r = readerName(reader);
  return withGuard(GUARD, () => {
    const all = readJson(marksFile()) || {};
    if (!all[r]) {
      all[r] = { since: sinceIso(at), seen: {} };
      mkdirSync(consoleDir(), { recursive: true });
      writeJson(marksFile(), all);
    }
    return all[r];
  });
}

/** Decision events not yet reported to `reader` ({all: true}: every proposal, the lead; else the reader's own). */
export function proposalNews(reader, { all = false } = {}) {
  const r = readerName(reader);
  const mark = proposalMark(r);
  if (!mark) return [];
  const items = listProposals({ all: true, ...(!all && { by: r }) });
  return items.flatMap((p) => {
    const seen = mark.seen?.[p.id];
    return decisionEvents(p).filter((e) => (seen !== undefined ? e.n >= seen : e.at > mark.since));
  }).sort(byAt);
}

/** After a MET wait: mark `events` as reported to `reader` (later events stay news). */
export async function commitProposalNews(reader, events) {
  const r = readerName(reader);
  if (!events.length) return proposalMark(r);
  return withGuard(GUARD, () => {
    const all = readJson(marksFile()) || {};
    const m = (all[r] ||= { since: iso(), seen: {} });
    m.seen ||= {};
    for (const e of events) m.seen[e.id] = Math.max(m.seen[e.id] || 0, e.n + 1);
    mkdirSync(consoleDir(), { recursive: true });
    writeJson(marksFile(), all);
    return m;
  });
}

/** Control characters (but newlines) as spaces: one event's text cannot forge another output line. */
const flat = (s) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, ' ');

/** The lines `thread wait` prints for one decision event. */
export function proposalNewsText(e) {
  const opt = (o) => (o ? `, option: ${flat(o)}` : '');
  const was = e.was ? ` (was ${e.was}${opt(e.wasOption)})` : '';
  const head = `PROPOSAL ${e.id} ${e.event === 'decided' ? `decided ${e.value}${opt(e.option)}${was}` : `undecided${was || ` (was ${e.was})`}`} by ${flat(e.who)} at ${e.at}`;
  const notes = e.event === 'decided' ? (e.notes ? flat(e.notes).split('\n') : []) : ['back to proposed, waiting for the user'];
  const L = [notes.length ? `${head}: ${notes[0]}` : head, ...notes.slice(1).map((l) => `  ${l}`)];
  L.push(`  "${flat(e.title).replace(/\n/g, ' ')}" rev ${e.rev} by ${flat(e.by)}; show: node tools/console.mjs proposal show ${e.id}`);
  return L.join('\n');
}

// ---- views -------------------------------------------------------------------------------------------

const media = (id, name) => (name ? `/media/${id}/${name}` : undefined);
const viewShots = (id, c) => (c.shots || []).map((s) => ({ caption: s.caption, a: media(id, s.a), b: media(id, s.b), aSize: s.aSize, bSize: s.bSize }));
const viewVideo = (id, v) => (v ? { a: media(id, v.a), b: media(id, v.b), both: media(id, v.both) } : undefined);

/** What the page gets for one proposal: no history, media as /media/ URLs. Drafts and withdrawn: null. */
export function publicView(p) {
  if (!p || p.state === 'draft' || p.state === 'withdrawn') return null;
  const c = p.compare || {};
  return {
    id: p.id, by: p.by, title: p.title, area: p.area, topic: p.topic, thread: p.thread, state: p.state, rev: p.rev,
    problem: p.problem, idea: p.idea, looksSame: p.looksSame, visualDiff: p.visualDiff, gain: p.gain, risk: p.risk,
    compare: {
      a: c.a, b: c.b, view: c.view || 'side',
      shots: viewShots(p.id, c),
      video: viewVideo(p.id, c.video),
    },
    // I-053: the solutions, each with its own text and B media (A is compare.a); undefined for a single proposal
    options: p.options?.length ? p.options.map((o) => ({
      name: o.name, label: o.label, idea: o.idea, looksSame: o.looksSame, visualDiff: o.visualDiff, gain: o.gain, risk: o.risk,
      compare: { b: o.compare?.b, shots: viewShots(p.id, o.compare || {}), video: viewVideo(p.id, o.compare?.video) },
    })) : undefined,
    recommended: p.options?.length ? p.recommended : undefined,
    decision: p.decision, decisions: p.decisions, revisions: p.revisions,
    createdAt: p.createdAt, proposedAt: p.proposedAt, updatedAt: p.updatedAt,
  };
}

/** The list on the page: the proposals the user sees (not drafts, not withdrawn), waiting first. */
export function pageProposals() {
  return listProposals().filter((p) => p.state !== 'draft').map((p) => ({
    id: p.id, by: p.by, title: p.title, area: p.area, state: p.state, rev: p.rev,
    decision: p.decision ? { value: p.decision.value, at: p.decision.at, ...(p.decision.option && { option: p.decision.option }) } : null,
    shots: (p.compare?.shots || []).length, proposedAt: p.proposedAt, updatedAt: p.updatedAt,
    ...(p.options?.length && { options: p.options.length }),
  }));
}

/** One line for `proposal list`. */
export function line(p) {
  const d = p.decision ? ` -> ${p.decision.value}${p.decision.option ? `, option: ${p.decision.option}` : ''}${p.decision.notes ? ` (notes: ${String(p.decision.notes).split('\n')[0].slice(0, 120)})` : ''}` : '';
  return `${p.id}  [${p.state} rev ${p.rev}]  ${p.area}  by ${p.by}: ${p.title}${p.options?.length ? ` (${p.options.length} options)` : ''}${d}`;
}

/** The text block of one solution (the proposal's own, or an option's) for `proposal show`, indented by `ind`. */
function solutionText(s, ind) {
  const L = [];
  for (const [k, label] of [['idea', 'idea'], ['looksSame', 'looks the same'], ['risk', 'risk']]) if (s[k]) L.push(`${ind}${label}: ${s[k].replace(/\n/g, `\n${ind}  `)}`);
  if (s.visualDiff?.length) { L.push(`${ind}visual difference:`); for (const v of s.visualDiff) L.push(`${ind}  - ${v}`); }
  if (s.gain?.length) { L.push(`${ind}gain:`); for (const g of s.gain) L.push(`${ind}  ${g.what}: ${g.before} -> ${g.after} [${g.tag}]${g.needsPhone ? ' (phone check needed)' : ''}${g.how ? ` (${g.how})` : ''}`); }
  return L;
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
  if (p.options?.length) L.push(`  options: ${p.options.map((o) => o.name).join(', ')}${p.recommended ? `; recommended: ${p.recommended.option} (${p.recommended.why})` : ''}`);
  L.push(`  A: ${c.a?.label}${c.a?.url ? ` ${c.a.url}` : ''}${p.options?.length ? '' : `   B: ${c.b?.label}${c.b?.url ? ` ${c.b.url}` : ''}`}${c.view ? `   view: ${c.view}` : ''}`);
  for (const [i, s] of (c.shots || []).entries()) L.push(`  shot ${i + 1}${s.caption ? ` "${s.caption}"` : ''}: ${s.a} | ${s.b}`);
  if (c.video) L.push(`  video: ${Object.entries(c.video).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  L.push(`  media: ${mediaDir(p.id)}`);
  for (const o of p.options || []) {
    L.push(`  option ${o.name} "${o.label}"${p.recommended?.option === o.name ? ' (recommended)' : ''}:`);
    L.push(...solutionText(o, '    '));
    const oc = o.compare || {};
    const shots = (oc.shots || []).map((s, i) => `shot ${i + 1}${s.caption ? ` "${s.caption}"` : ''}: ${s.a} | ${s.b}`);
    L.push(`    B: ${oc.b?.label}${oc.b?.url ? ` ${oc.b.url}` : ''}${shots.length ? `   ${shots[0]}` : ''}`);
    for (const x of shots.slice(1)) L.push(`    ${x}`);
    if (oc.video) L.push(`    video: ${Object.entries(oc.video).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  if (p.decision) L.push(`  decision: ${p.decision.value}${p.decision.option ? `, option: ${p.decision.option}` : ''} (rev ${p.decision.rev}, ${p.decision.at}, ${p.decision.who})${p.decision.notes ? `: ${p.decision.notes}` : ''}`);
  L.push('  history:');
  for (const h of p.history) L.push(`    ${h.at} ${h.who} ${h.action}${h.rev ? ` rev ${h.rev}` : ''}${h.value ? ` ${h.value}` : ''}${h.option ? `, option: ${h.option}` : ''}${h.note ? `: ${h.note}` : ''}`);
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

