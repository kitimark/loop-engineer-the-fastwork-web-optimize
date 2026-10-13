// tools/release/rules.mjs: the scrub rules of the public release (I-269; memory/public-release.md), a library.
//   loadKnown(path)              the known personal values, a JSON file outside any repo, mode 600
//                                (default ~/.cache/fw-release/known.json, or $FW_RELEASE_KNOWN):
//                                {"literals":[{"value":"…","token":"<user>"}…], "lanPrefixes":["a.b.c"],
//                                 "allow":[{"path":"tests/…","pattern":"192\\.168\\.0\\.\\d+"}]}
//   buildRules(known)            -> [{kind:'literal'|'regex', match, token, id}] (literals longest first, then the
//                                generic rules: /Users/<home> -> /Users/<user>, every LAN /24 -> 192.168.0.N keeping
//                                the last octet, claude.ai artifact links and Medium draft links -> placeholders);
//                                refuses a rule that can match bare hex (it would eat commit SHAs)
//   scrubText(text, rules)       -> {text, hits:[{id,count}]}: literals exactly, then regexes (filter-repo's order)
//   scanText(text, rules, {path})-> [{id, line}]: literals in any ASCII letter case, regexes as written; `allow`
//                                entries (path glob + full-match pattern) are skipped
//   scrubAll(text, rules)        -> {text, hits}: scrubText with literals in any ASCII letter case (exports outside git)
//   SECRET_SHAPES, withSecrets(rules), redactSecrets(text): generic secret shapes ([{id, match}]); check.mjs reports
//                                them (never replaced in history), exports replace them with "[secret omitted: <id>]"
// A Buffer works too (bytes, as git and filter-repo see them); {literalsOnly:true} is the binary-file mode.
// Never print a value: errors and reports name the rule id, the token and path:line only. A regex `match` is a
// source string valid in both JS and Python's bytes `re` (filter-repo compiles it); its token uses $1 for a group.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';

export const DEFAULT_KNOWN = join(homedir(), '.cache', 'fw-release', 'known.json');
export const LAN_NET = '192.168.0';
const MIN_LITERAL = 4;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const latin1 = (s) => Buffer.from(s, 'utf8').toString('latin1');   // utf8 text -> one char per byte
const lowerAscii = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
const isHex = (s) => /^[0-9a-f]+$/i.test(s);

/** A path with the user's home shortened to ~ (paths in messages must not carry the home name). */
export function tildify(p, home = homedir()) {
  const s = String(p);
  return home && (s === home || s.startsWith(home + '/')) ? '~' + s.slice(home.length) : s;
}

function insideRepo(file) {
  for (let d = dirname(resolve(file)); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
}

/** Read and validate the known-values file. Throws with the path (~-shortened) and entry index, never a value. */
export function loadKnown(path = process.env.FW_RELEASE_KNOWN || DEFAULT_KNOWN, { requirePrivate = true } = {}) {
  const shown = tildify(path);
  let st;
  try { st = statSync(path); } catch { throw new Error(`known values file ${shown} not found (the lead creates it, mode 600)`); }
  if (requirePrivate && (st.mode & 0o077)) throw new Error(`known values file ${shown} is readable by others (mode ${(st.mode & 0o777).toString(8)}): chmod 600 it`);
  const repo = insideRepo(path);
  if (repo) throw new Error(`known values file ${shown} is inside a git repo (${tildify(repo)}): keep it outside every repo`);
  let k;
  try { k = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`known values file ${shown} is not valid JSON (${e.name})`); }
  return validateKnown(k, shown);
}

export function validateKnown(k, shown = 'known') {
  if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error(`${shown}: not an object`);
  const literals = k.literals ?? [], lanPrefixes = k.lanPrefixes ?? [], allow = k.allow ?? [];
  if (!Array.isArray(literals) || !Array.isArray(lanPrefixes) || !Array.isArray(allow)) throw new Error(`${shown}: literals, lanPrefixes and allow must be arrays`);
  const bad = (i, why) => { throw new Error(`${shown}: literals[${i}] ${why}`); };
  literals.forEach((l, i) => {
    if (!l || typeof l.value !== 'string' || typeof l.token !== 'string') bad(i, 'needs a string value and token');
    if (l.value.length < MIN_LITERAL) bad(i, `is shorter than ${MIN_LITERAL} characters`);
    if (/[\r\n]/.test(l.value) || l.value.includes('==>')) bad(i, 'has a line break or "==>"');
    if (isHex(l.value)) bad(i, 'is bare hex (it would match inside commit SHAs)');
    if (!l.token || /[\r\n]/.test(l.token) || l.token.includes('==>')) bad(i, 'has an empty token, a line break or "==>" in its token');
  });
  const lowered = literals.map((l) => lowerAscii(l.value));
  literals.forEach((l, i) => {
    const t = lowerAscii(l.token);
    const j = lowered.findIndex((v) => t.includes(v));
    if (j >= 0) bad(i, `has a token that contains literals[${j}]`);
    const d = literals.findIndex((m, jj) => jj < i && m.value === l.value && m.token !== l.token);
    if (d >= 0) bad(i, `repeats literals[${d}] with another token`);
  });
  lanPrefixes.forEach((p, i) => {
    const m = typeof p === 'string' && p.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m || m.slice(1).some((x) => Number(x) > 255)) throw new Error(`${shown}: lanPrefixes[${i}] is not a /24 prefix a.b.c`);
  });
  allow.forEach((a, i) => {
    if (!a || typeof a.path !== 'string' || typeof a.pattern !== 'string' || !a.path) throw new Error(`${shown}: allow[${i}] needs a path and a pattern`);
    try { new RegExp(a.pattern); } catch { throw new Error(`${shown}: allow[${i}] pattern is not a valid regex`); }
  });
  // fail-closed: an empty or partial file would make the check pass on everything (review of 10cd1810)
  if (!literals.length) throw new Error(`${shown}: no literals (an empty known file would check nothing)`);
  if (!literals.some((l) => l.token === '<user>') && !lanPrefixes.length) throw new Error(`${shown}: neither a "<user>" literal nor a LAN prefix`);
  return { literals, lanPrefixes, allow };
}

/** glob for allow paths: `**` any characters, `*` any but `/`, a trailing `/` a directory prefix, else exact. */
export function globToRegExp(g) {
  let s = '';
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '*' && g[i + 1] === '*') { s += '.*'; i++; }
    else if (g[i] === '*') s += '[^/]*';
    else if (g[i] === '?') s += '[^/]';
    else s += esc(g[i]);
  }
  return new RegExp(`^${s}${g.endsWith('/') ? '.*' : ''}$`);
}

const slug = (t) => t.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'x';

/** Throws when a rule could match a string of bare hex (a commit SHA, or a part of one). */
export function assertNoHexRule(rules) {
  const probes = ['0123456789abcdef0123456789abcdef01234567', 'deadbeef', 'cafe1234', '1234567', 'abcdefa', 'ABCDEF12'];
  for (const r of rules) {
    if (r.kind === 'literal' && isHex(r.match)) throw new Error(`rule ${r.id} is bare hex`);
    if (r.kind === 'regex') {
      const re = new RegExp(r.match, 'i');
      if (probes.some((p) => re.test(p))) throw new Error(`rule ${r.id} can match bare hex`);
    }
  }
}

/**
 * Rules from the known values: one literal per distinct value (longest first, so a value inside another value does
 * not split it), then the generic regexes. `home` (default the current user's home) names /Users/<name> for the
 * generic home rule; a literal with the token "<user>" that looks like a user name counts too.
 */
export function buildRules(known, { home = homedir() } = {}) {
  const k = validateKnown(known);
  const rules = [];
  const seen = new Set();
  k.literals.forEach((l, i) => {
    if (seen.has(l.value)) return;
    seen.add(l.value);
    rules.push({ kind: 'literal', match: l.value, token: l.token, id: `lit${i}-${slug(l.token)}` });
  });
  rules.sort((a, b) => b.match.length - a.match.length);
  const homes = new Set();
  if (home && dirname(home) === '/Users' && basename(home) !== 'Shared') homes.add(basename(home));
  for (const l of k.literals) if (l.token === '<user>' && /^[A-Za-z0-9._-]+$/.test(l.value)) homes.add(l.value);
  if (homes.size) rules.push({ kind: 'regex', match: `/Users/(?:${[...homes].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![A-Za-z0-9._-])`, token: '/Users/<user>', id: 'users-home' });
  // ids name the prefix's index only: a LAN address is personal (Hard rule 12)
  k.lanPrefixes.forEach((p, i) => {
    if (p === LAN_NET || k.lanPrefixes.indexOf(p) !== i) return;   // the replacement net itself: nothing to hide
    rules.push({ kind: 'regex', match: `\\b${esc(p)}\\.(\\d{1,3})\\b`, token: `${LAN_NET}.$1`, id: `lan${i}` });
    // the same address as a host name (a-b-c-d, e.g. nip.io, mDNS) and URL-encoded (%2E)
    const o = p.split('.');
    rules.push({ kind: 'regex', match: `\\b${o.join('-')}-(\\d{1,3})\\b`, token: `${LAN_NET.replace(/\./g, '-')}-$1`, id: `lan${i}-dash` });
    rules.push({ kind: 'regex', match: `(?<![0-9])${o.join('%2[Ee]')}%2[Ee](\\d{1,3})\\b`, token: `${LAN_NET.replace(/\./g, '%2E')}%2E$1`, id: `lan${i}-pct` });
  });
  // private links, anchored to their host: a claude.ai artifact, a Medium draft (a published post's slug URL stays).
  // Artifact ids in the history are 22 characters (OBSERVED, 2026-10-13); the tests' made-up ids are shorter or the
  // RFC 4122 example UUID 123e4567-e89b-12d3-a456-…, and stay, so the released tests still pass (as with the LAN net)
  rules.push({ kind: 'regex', match: 'https?://claude\\.ai/(?:code/)?artifact/(?!(?i:123e4567-e89b-12d3-a456-))[A-Za-z0-9_-]{16,}', token: 'https://claude.ai/artifact/<private-artifact>', id: 'link-artifact' });
  rules.push({ kind: 'regex', match: '\\bmedium\\.com/p/[0-9a-f]{6,}(?:/edit)?(?![A-Za-z0-9_-])', token: 'medium.com/p/<draft>', id: 'link-medium-draft' });
  assertNoHexRule(rules);
  Object.defineProperty(rules, 'allow', { value: k.allow.map((a) => ({ path: globToRegExp(a.path), pattern: new RegExp(`^(?:${a.pattern})$`) })), enumerable: false });
  return rules;
}

/**
 * Generic secret shapes, one list for the checker (check.mjs reports them; the history rewrite never replaces them,
 * since a token in its place would hide that one was ever committed) and the exports (redactSecrets). ids name the
 * kind; a hit prints the id and path:line only. `match` is a JS RegExp source (compile with flag 'g').
 */
export const SECRET_SHAPES = [
  { id: 'secret-github', match: '\\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})' },
  { id: 'secret-sk', match: '\\bsk-(?:ant-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{20,})' },
  { id: 'secret-aws', match: '\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b' },
  { id: 'secret-bearer', match: '\\bBearer [A-Za-z0-9._~+/=-]{20,}' },
  { id: 'secret-pem', match: '-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----' },
  { id: 'secret-kv', match: '(?i:key|token|secret)["\']?[ \\t]*[:=][ \\t]*["\']?[A-Za-z0-9+/]{24,}={0,2}' },   // key=v, key: v, "token": "v"
];

// redactSecrets only: a whole PEM private key block (to its END line, or to the end of the text) and a key/token/secret
// value without its name and separator
const REDACT = {
  'secret-pem': { re: '-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----[\\s\\S]*?(?:-----END \\1PRIVATE KEY-----|$)', keep: '' },
  'secret-kv': { re: '((?i:key|token|secret)["\']?[ \\t]*[:=][ \\t]*["\']?)[A-Za-z0-9+/]{24,}={0,2}', keep: '$1' },
};

/** Every secret-shape match replaced by "[secret omitted: <id>]" (exports outside git: console, chat; it matches no
 *  shape): a PEM key block as a whole, a key=value keeping its name. Returns {text, hits:[{id,count}]}. */
export function redactSecrets(text) {
  let s = String(text);
  const hits = [];
  for (const sh of SECRET_SHAPES) {
    let n = 0;
    const r = REDACT[sh.id];
    const marker = `[secret omitted: ${sh.id}]`;
    s = s.replace(new RegExp(r ? r.re : sh.match, 'g'), (...m) => { n++; return (r && r.keep ? m[1] : '') + marker; });
    if (n) hits.push({ id: sh.id, count: n });
  }
  return { text: s, hits };
}

/** The rules plus the secret shapes (kind 'regex', token '<secret>'), keeping the rules' `allow` list. */
export function withSecrets(rules) {
  const out = [...rules, ...SECRET_SHAPES.map((s) => ({ kind: 'regex', match: s.match, token: '<secret>', id: s.id }))];
  Object.defineProperty(out, 'allow', { value: rules.allow || [], enumerable: false });
  return out;
}

/** filter-repo --replace-text / --replace-message lines for the rules (values inside: write it mode 600, delete it). */
export function filterRepoExpressions(rules) {
  const lines = [];
  for (const r of rules) {
    if (r.kind === 'literal') lines.push(`literal:${r.match}==>${r.token}`);
    else lines.push(`regex:${r.match}==>${r.token.replace(/\$(\d)/g, '\\$1')}`);
  }
  return lines.join('\n') + '\n';
}

function view(text, rules) {
  const bytes = Buffer.isBuffer(text);
  const s = bytes ? text.toString('latin1') : String(text);
  const conv = bytes ? latin1 : (x) => x;
  return { bytes, s, conv };
}

/** Replace every rule's matches with its token. Returns {text, hits:[{id,count}]} (only rules that hit). */
export function scrubText(text, rules, { literalsOnly = false } = {}) {
  const v0 = view(text, rules), { bytes, conv } = v0;
  let s = v0.s;
  const hits = [];
  for (const r of rules) {
    if (r.kind !== 'literal') continue;
    const v = conv(r.match);
    const parts = s.split(v);
    if (parts.length > 1) { hits.push({ id: r.id, count: parts.length - 1 }); s = parts.join(conv(r.token)); }
  }
  if (!literalsOnly) for (const r of rules) {
    if (r.kind !== 'regex') continue;
    let n = 0;
    s = s.replace(new RegExp(r.match, 'g'), (...m) => { n++; return conv(r.token).replace(/\$(\d)/g, (_, g) => m[Number(g)] ?? ''); });
    if (n) hits.push({ id: r.id, count: n });
  }
  return { text: bytes ? Buffer.from(s, 'latin1') : s, hits };
}

/** scrubText with literals matched in any ASCII letter case (what scanText finds), for exports outside git. */
export function scrubAll(text, rules, { literalsOnly = false } = {}) {
  const v0 = view(text, rules), { bytes, conv } = v0;
  let s = v0.s;
  const hits = [];
  for (const r of rules) {
    if (r.kind !== 'literal') continue;
    const v = lowerAscii(conv(r.match)), tok = conv(r.token);
    let low = lowerAscii(s), n = 0, out = '', at = 0;
    for (let i = low.indexOf(v); i >= 0; i = low.indexOf(v, i + v.length)) { out += s.slice(at, i) + tok; at = i + v.length; n++; }
    if (n) { s = out + s.slice(at); hits.push({ id: r.id, count: n }); }
  }
  const rest = scrubText(bytes ? Buffer.from(s, 'latin1') : s, rules.filter((r) => r.kind !== 'literal'), { literalsOnly });
  return { text: rest.text, hits: [...hits, ...rest.hits] };
}

function lineAt(starts, idx) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

/**
 * Where the rules still match: [{id, line}] (1-based lines, one entry per rule and line), no values. Literals match in
 * any ASCII letter case (fail-closed: "JaneDoe" and "janedoe" are the same name); a hit is skipped when an `allow` entry's path glob
 * matches opts.path and its pattern matches the whole hit.
 */
export function scanText(text, rules, { path = '', allow = rules.allow || [], literalsOnly = false } = {}) {
  const { s, conv } = view(text, rules);
  const low = lowerAscii(s);
  const starts = [0];
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) starts.push(i + 1);
  const allowHere = allow.filter((a) => a.path.test(path));
  const out = [], seen = new Set();
  const add = (id, idx, hit) => {
    if (allowHere.some((a) => a.pattern.test(hit))) return;
    const line = lineAt(starts, idx), key = `${id}\0${line}`;
    if (!seen.has(key)) { seen.add(key); out.push({ id, line }); }
  };
  for (const r of rules) {
    if (r.kind === 'literal') {
      const v = lowerAscii(conv(r.match));
      for (let i = low.indexOf(v); i >= 0; i = low.indexOf(v, i + 1)) add(r.id, i, s.slice(i, i + v.length));
    } else if (!literalsOnly) {
      for (const m of s.matchAll(new RegExp(r.match, 'g'))) add(r.id, m.index, m[0]);
    }
  }
  return out.sort((a, b) => a.line - b.line || (a.id < b.id ? -1 : 1));
}

/** A string safe to print: every rule match (literals in any case) replaced by its token. */
export function safeText(text, rules) {
  let s = String(text);
  for (const r of rules) {
    if (r.kind === 'literal') {
      const v = lowerAscii(r.match);
      let low = lowerAscii(s);
      for (let i = low.indexOf(v); i >= 0; i = low.indexOf(v, i + r.token.length)) { s = s.slice(0, i) + r.token + s.slice(i + v.length); low = lowerAscii(s); }
    }
  }
  return scrubText(s, rules).text;
}
