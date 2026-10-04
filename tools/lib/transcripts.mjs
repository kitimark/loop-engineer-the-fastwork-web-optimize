// I-152 (PR-020 N9): which agents ended their run with a hand-back, read from Claude Code's own subagent transcripts, so
// the board shows "owner ended" and the thread router stops counting their recent reads, without anyone writing it; an
// owner with a live wait (a persistent Monitor listener) stays listening and unflagged. Read-only.
//
// The format belongs to Claude Code and may change (OBSERVED in our setup, Claude Code 2.1.x, 2026-10-04):
//   ~/.claude/projects/<slug of the main checkout>/<session>/subagents/agent-<id>.meta.json  {name, agentType, ...}
//   next to agent-<id>.jsonl: one JSON record per line; an assistant record {type: 'assistant', timestamp, message:
//   {content: [{type: 'tool_use', id, name}]}}; a tool's result {type: 'user', message: {content: [{type: 'tool_result',
//   tool_use_id}]}, toolUseResult: {success}}. A hand-back is a tool_use named SubagentHandback with a successful result.
// Ended = the transcript's last successful hand-back has no other tool call after it (a resumed agent calls tools
// again; a second, refused hand-back changes nothing). A name spawned again: its newest transcript counts.
// Only {name -> {ended, at}} leaves this module: no paths, no transcript text. Tests: $FW_STATE_DIR (a temp state dir)
// means no transcripts at all unless $FW_TRANSCRIPTS_DIR names a directory ("off": none), like I-157's lesson: a test
// never reads the machine's live state.
import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mainCheckout as mainCheckoutPath } from './paths.mjs';

export const HANDBACK_TOOL = 'SubagentHandback';
const TAIL_BYTES = 512 * 1024;
const MAX_AGE_MS = 48 * 3600e3; // transcripts not written for 2 days are not read
const CACHE_MS = 30000;

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

/** Map name -> {ended: true, at} for every agent whose newest transcript ended with a hand-back. */
export function endedOwners({ dir = null, now = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  const out = new Map();
  if (!dir) return out;
  const newest = new Map();
  for (const s of list(dir)) {
    const sub = join(dir, s, 'subagents');
    for (const f of list(sub)) {
      if (!f.endsWith('.meta.json')) continue;
      const jf = join(sub, f.slice(0, -'.meta.json'.length) + '.jsonl');
      let mtime;
      try { mtime = statSync(jf).mtimeMs; } catch { continue; }
      if (now - mtime > maxAgeMs) continue;
      let name = null;
      try { const m = JSON.parse(readFileSync(join(sub, f), 'utf8')); if (typeof m?.name === 'string' && m.name) name = m.name; } catch {}
      if (!name) continue;
      const cur = newest.get(name);
      if (!cur || mtime > cur.mtime) newest.set(name, { file: jf, mtime });
    }
  }
  for (const [name, { file }] of newest) {
    const st = handbackState(tail(file));
    if (st.ended) out.set(name, st);
  }
  return out;
}

let cache = null;
export const clearCache = () => { cache = null; };
/** endedOwners for this repo's transcripts, cached for 30 s (the board and the router ask often). */
export function endedNow({ now = Date.now(), mainCheckout = null } = {}) {
  const env = process.env;
  const dir = transcriptsDir({ mainCheckout: mainCheckout ?? (env.FW_TRANSCRIPTS_DIR || env.FW_STATE_DIR ? null : mainCheckoutPath()) });
  if (cache && cache.dir === dir && now - cache.at < CACHE_MS) return cache.value;
  const value = endedOwners({ dir, now });
  cache = { dir, at: now, value };
  return value;
}
