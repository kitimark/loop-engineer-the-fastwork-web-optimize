// I-152 (PR-020 N9): which agents ended their run with a hand-back, read from Claude Code's own subagent transcripts, so
// the board shows "owner ended" without anyone writing it (unless the owner has a live, attached wait). A board hint
// only: the thread router does not use it (I-163, the lead's ruling: an agent between turns hands back while its own
// background work runs, and keeps listening); orphan waits come from the process tree (proctree.mjs). Read-only.
//
// The format belongs to Claude Code and may change (OBSERVED in our setup, Claude Code 2.1.x, 2026-10-04):
//   ~/.claude/projects/<slug of the main checkout>/<session>/subagents/agent-<id>.meta.json  {name, agentType, ...}
//   next to agent-<id>.jsonl: one JSON record per line; an assistant record {type: 'assistant', timestamp, message:
//   {content: [{type: 'tool_use', id, name}]}}; a tool's result {type: 'user', message: {content: [{type: 'tool_result',
//   tool_use_id}]}, toolUseResult: {success}}. A hand-back is a tool_use named SubagentHandback with a successful result.
// Ended = the transcript's last successful hand-back has no other tool call after it (a resumed agent calls tools
// again; a second, refused hand-back changes nothing). A name spawned again: its newest transcript counts.
// I-169: also the foreground tool call an agent is still inside (pendingCall, deafNow): the thread router counts such
// an owner as deaf (not listening, busy) and the board names the call. Only names, times and the first CMD_MAX
// characters of the call's command leave this module (callers sanitize them for display): no paths of transcripts,
// no other transcript text. Anything unparsable counts as nothing (the rules before). Tests: $FW_STATE_DIR (a temp state dir)
// means no transcripts at all unless $FW_TRANSCRIPTS_DIR names a directory ("off": none), like I-157's lesson: a test
// never reads the machine's live state.
import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mainCheckout as mainCheckoutPath } from './paths.mjs';

export const HANDBACK_TOOL = 'SubagentHandback';
const TAIL_BYTES = 512 * 1024;
const MAX_AGE_MS = 48 * 3600e3; // transcripts not written for 2 days are not read
const CACHE_MS = 10000; // I-169: deaf after 30 s, so read at most 10 s old (unchanged files are not read again)

/** Claude Code's project directory name for a path (every character but a letter or digit becomes "-"). */
export const projectSlug = (path) => String(path).replace(/[^a-zA-Z0-9]/g, '-');

/** The transcripts directory, or null (see the header). */
export function transcriptsDir({ env = process.env, mainCheckout = null } = {}) {
  if (env.FW_TRANSCRIPTS_DIR) return env.FW_TRANSCRIPTS_DIR === 'off' ? null : env.FW_TRANSCRIPTS_DIR;
  if (env.FW_STATE_DIR) return null;
  return mainCheckout ? join(homedir(), '.claude', 'projects', projectSlug(mainCheckout)) : null;
}

const resultOk = (r, x) => {
  if (x.is_error) return false;
  if (typeof r.toolUseResult?.success === 'boolean') return r.toolUseResult.success;
  const t = Array.isArray(x.content) ? x.content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('') : String(x.content ?? '');
  return /"success"\s*:\s*true/.test(t);
};

/** {ended, at} from a transcript's text (or its tail: a cut first line is skipped). */
export function handbackState(text) {
  const recs = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try { recs.push(JSON.parse(line)); } catch {}
  }
  const ok = new Map();
  for (const r of recs) {
    const c = r?.message?.content;
    if (r?.type === 'user' && Array.isArray(c)) for (const x of c) if (x?.type === 'tool_result' && x.tool_use_id) ok.set(x.tool_use_id, resultOk(r, x));
  }
  let ended = false, at = null;
  for (const r of recs) {
    const c = r?.message?.content;
    if (r?.type !== 'assistant' || !Array.isArray(c)) continue;
    for (const x of c) {
      if (x?.type !== 'tool_use') continue;
      if (x.name === HANDBACK_TOOL) { if (ok.get(x.id) === true) { ended = true; at = typeof r.timestamp === 'string' ? r.timestamp : null; } }
      else { ended = false; at = null; }
    }
  }
  return { ended, at: ended ? at : null };
}

// I-169 (user T-152 #3): a foreground tool call the agent is still inside. Claude Code writes the model's tool_use
// records (one per call; the calls of one response share its requestId) and a user record with the tool_result when a
// call returns (OBSERVED, 2.1.x). Background Bash (input.run_in_background) and Monitor return at once and are not
// counted; a call of an older response with no result (an interrupted call) is not either.
export const DEAF_AFTER_MS = 30000;
const NOT_FOREGROUND = new Set(['Monitor']);
const CMD_MAX = 40;
const parts = (r) => (Array.isArray(r?.message?.content) ? r.message.content : []);
function parseRecs(text) {
  const recs = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r && typeof r === 'object') recs.push(r); } catch {}
  }
  return recs;
}
const cmdOf = (x) => {
  const c = typeof x?.input?.command === 'string' ? x.input.command.split('\n')[0].trim() : '';
  return (c || String(x?.name || 'a tool')).slice(0, CMD_MAX);
};
/** The oldest unanswered foreground call of the transcript's last model response: {tool, cmd, since} or null. */
export function pendingCall(text) {
  try {
    const recs = parseRecs(text);
    let last = -1;
    for (let i = recs.length - 1; i >= 0; i--) if (recs[i].type === 'assistant' && parts(recs[i]).length) { last = i; break; }
    if (last < 0) return null;
    const lr = recs[last];
    if (!parts(lr).some((x) => x?.type === 'tool_use')) return null; // talking or thinking: past its calls
    const answered = new Set();
    for (const r of recs) if (r.type === 'user') for (const x of parts(r)) if (x?.type === 'tool_result' && x.tool_use_id) answered.add(x.tool_use_id);
    const batch = recs.filter((r, i) => r.type === 'assistant' && (i === last || (lr.requestId && r.requestId === lr.requestId)));
    for (const r of batch) {
      for (const x of parts(r)) {
        if (x?.type !== 'tool_use' || !x.id || !x.name || answered.has(x.id)) continue;
        if (NOT_FOREGROUND.has(x.name) || (x.name === 'Bash' && x.input?.run_in_background === true)) continue;
        return { tool: String(x.name).slice(0, 40), cmd: cmdOf(x), since: typeof r.timestamp === 'string' ? r.timestamp : null };
      }
    }
  } catch {}
  return null;
}

const list = (d) => { try { return readdirSync(d); } catch { return []; } };
function tail(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const size = statSync(file).size;
    const n = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    return buf.toString('utf8');
  } catch { return ''; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

// a transcript's state, memoized by file (path, mtime, size): only changed transcripts are read again
const memo = new Map();
function fileState(jf, st) {
  const m = memo.get(jf);
  if (m && m.mtime === st.mtimeMs && m.size === st.size) return m.state;
  const text = tail(jf);
  const state = { ...handbackState(text), call: pendingCall(text) };
  memo.set(jf, { mtime: st.mtimeMs, size: st.size, state });
  return state;
}

/** Map name -> {ended, at, call} from every agent's newest transcript (see the header). */
export function agentStates({ dir = null, now = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  const out = new Map();
  if (!dir) return out;
  const newest = new Map();
  for (const s of list(dir)) {
    const sub = join(dir, s, 'subagents');
    for (const f of list(sub)) {
      if (!f.endsWith('.meta.json')) continue;
      const jf = join(sub, f.slice(0, -'.meta.json'.length) + '.jsonl');
      let st;
      try { st = statSync(jf); } catch { continue; }
      if (now - st.mtimeMs > maxAgeMs) continue;
      let name = null;
      try { const m = JSON.parse(readFileSync(join(sub, f), 'utf8')); if (typeof m?.name === 'string' && m.name) name = m.name; } catch {}
      if (!name) continue;
      const cur = newest.get(name);
      if (!cur || st.mtimeMs > cur.st.mtimeMs) newest.set(name, { file: jf, st });
    }
  }
  for (const [name, { file, st }] of newest) { try { out.set(name, fileState(file, st)); } catch {} }
  return out;
}

/** Map name -> {ended: true, at} for every agent whose newest transcript ended with a hand-back. */
export function endedOwners(opts = {}) {
  const out = new Map();
  for (const [name, s] of agentStates(opts)) if (s.ended) out.set(name, { ended: true, at: s.at });
  return out;
}

let cache = null;
export const clearCache = () => { cache = null; memo.clear(); };
function statesNow(now, mainCheckout) {
  const env = process.env;
  const dir = transcriptsDir({ mainCheckout: mainCheckout ?? (env.FW_TRANSCRIPTS_DIR || env.FW_STATE_DIR ? null : mainCheckoutPath()) });
  if (cache && cache.dir === dir && Math.abs(now - cache.at) < CACHE_MS) return cache.value;
  let value;
  try { value = agentStates({ dir, now }); } catch { value = new Map(); }
  cache = { dir, at: now, value };
  return value;
}
/** endedOwners for this repo's transcripts, cached CACHE_MS (the board and the router ask often). */
export function endedNow({ now = Date.now(), mainCheckout = null } = {}) {
  const out = new Map();
  for (const [name, s] of statesNow(now, mainCheckout)) if (s.ended) out.set(name, { ended: true, at: s.at });
  return out;
}
/**
 * I-169: Map name -> {tool, cmd, since, min} for every agent inside a foreground call for longer than DEAF_AFTER_MS
 * (a hand-back is no call). cmd: the first line of the command, CMD_MAX characters (callers sanitize it for display).
 */
export function deafNow({ now = Date.now(), mainCheckout = null } = {}) {
  const out = new Map();
  for (const [name, s] of statesNow(now, mainCheckout)) {
    const c = s.call;
    const t = c && Date.parse(c.since);
    if (!c || !Number.isFinite(t) || now - t <= DEAF_AFTER_MS || s.ended) continue;
    out.set(name, { tool: c.tool, cmd: c.cmd, since: c.since, min: Math.floor((now - t) / 60000) });
  }
  return out;
}
/** "deaf: in <cmd> for N min" (under a minute: "for under 1 min"). */
export const deafText = (d) => (d ? `deaf: in ${d.cmd} for ${d.min >= 1 ? `${d.min} min` : 'under 1 min'}` : '');
