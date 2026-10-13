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
// no other transcript text. I-265: also who runs now with no other trace (sessionsNow: working, idle teammate, deaf),
// from transcript write times and Claude Code's team configs; names, times and plain reasons only (no prompts, no
// paths). Anything unparsable counts as nothing (the rules before). Tests: $FW_STATE_DIR (a temp state dir)
// means no transcripts at all unless $FW_TRANSCRIPTS_DIR names a directory ("off": none), and no teams unless
// $FW_TEAMS_DIR does, like I-157's lesson: a test never reads the machine's live state. I-274: also an agent whose
// background job finished while it slept between turns, the notice unread (stalledAgents): ids, statuses and times only.
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

// I-274 (2026-10-13): an agent that ended its turn while a Bash of its ran in the background (run_in_background) is not
// woken when the job finishes: Claude Code stores the job's <task-notification> in its transcript as an attachment
// {type: 'queued_command', prompt: '<task-notification>…<task-id>ID</task-id>…<status>S</status>…'} and starts no turn,
// so it sleeps until a message arrives (OBSERVED, 2.1.x: four teammates lost 84-103 min each). Unread = queued after the
// transcript's last assistant record (a turn that started has read it); any other record counts as nothing.
export const STALL_AFTER_MS = 60e3;
const tagOf = (p, tag, max) => String(p.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, max);
/** The task notifications queued after the transcript's last assistant record, oldest first: [{taskId, status, at}]. */
export function unreadNotices(text) {
  const out = [];
  try {
    const recs = parseRecs(text);
    let last = -1;
    for (let i = recs.length - 1; i >= 0; i--) if (recs[i].type === 'assistant') { last = i; break; }
    for (const r of recs.slice(last + 1)) {
      const p = r.attachment?.type === 'queued_command' ? r.attachment.prompt : null;
      if (typeof p !== 'string' || !p.includes('<task-notification>')) continue;
      out.push({ taskId: tagOf(p, 'task-id', 40) || '?', status: tagOf(p, 'status', 20) || '?', at: typeof r.timestamp === 'string' ? r.timestamp : null });
    }
  } catch {}
  return out;
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
  const state = { ...handbackState(text), call: pendingCall(text), notices: unreadNotices(text) };
  memo.set(jf, { mtime: st.mtimeMs, size: st.size, state });
  return state;
}

/** Map name -> {ended, at, call, notices, sessionMs} from every agent's newest transcript (see the header). */
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
      let name = null, teammate = false, team = null;
      try {
        const m = JSON.parse(readFileSync(join(sub, f), 'utf8'));
        if (typeof m?.name === 'string' && m.name) name = m.name;
        teammate = m?.taskKind === TEAMMATE;
        if (typeof m?.teamName === 'string' && m.teamName) team = m.teamName;
      } catch {}
      if (!name) continue;
      const cur = newest.get(name);
      if (!cur || st.mtimeMs > cur.st.mtimeMs) newest.set(name, { file: jf, st, session: s, teammate, team });
    }
  }
  const sessionMs = new Map(); // I-274: when the agent's session wrote its own transcript (<dir>/<session>.jsonl), or null
  const sessionAt = (s) => {
    if (!sessionMs.has(s)) { let t = null; try { t = statSync(join(dir, `${s}.jsonl`)).mtimeMs; } catch {} sessionMs.set(s, t); }
    return sessionMs.get(s);
  };
  for (const [name, { file, st, session, teammate, team }] of newest) {
    try { out.set(name, { ...fileState(file, st), lastMs: st.mtimeMs, session, teammate, team, sessionMs: sessionAt(session) }); } catch {}
  }
  return out;
}

// I-265 (user T-276 #3): agents that run with no lock, wait or status row (read-only helpers, agent-team teammates)
// read running from their transcripts. Agent teams (OBSERVED, Claude Code 2.1.x, 2026-10-12): a teammate's meta has
// taskKind "in_process_teammate" and teamName; it lives in the lead session's subagents dir; ~/.claude/teams/<team>/
// config.json is {name, leadSessionId, members: [{name, ...}]}. A teammate ends each turn with plain text (no hand-back)
// and sleeps until a message wakes it, so a quiet transcript is no end: it is "idle" (alive, counted as running) while
// its team is live: the config lists it, its meta is in the team's lead session, and that lead session's transcript
// (<projects dir>/<leadSessionId>.jsonl) was written within TEAM_LIVE_MS. No shutdown record was seen in a transcript,
// so a teammate shut down by the lead reads idle until its team is over (a member dropped from the config is not).
export const TEAMMATE = 'in_process_teammate';
export const ACTIVE_MS = 10 * 60e3; // written this recently, not ended: working
export const TEAM_LIVE_MS = 6 * 3600e3; // a team whose lead session wrote this recently is live
export const CALL_RUNNING_MS = 2 * 3600e3; // a foreground call older than this (a crashed session) counts for nothing here

/** ~/.claude/teams, or null: $FW_TEAMS_DIR ("off": none); with $FW_STATE_DIR or $FW_TRANSCRIPTS_DIR (tests) only that. */
export function teamsDir({ env = process.env } = {}) {
  if (env.FW_TEAMS_DIR) return env.FW_TEAMS_DIR === 'off' ? null : env.FW_TEAMS_DIR;
  if (env.FW_STATE_DIR || env.FW_TRANSCRIPTS_DIR) return null;
  return join(homedir(), '.claude', 'teams');
}

/** Map team name -> {session, members: Set} for every live team (see above); unreadable configs count as nothing. */
export function liveTeams({ dir = null, transcripts = null, now = Date.now(), liveMs = TEAM_LIVE_MS } = {}) {
  const out = new Map();
  if (!dir || !transcripts) return out;
  for (const t of list(dir)) {
    try {
      const c = JSON.parse(readFileSync(join(dir, t, 'config.json'), 'utf8'));
      const session = typeof c?.leadSessionId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(c.leadSessionId) ? c.leadSessionId : null;
      if (!session || !Array.isArray(c.members)) continue;
      if (!(now - statSync(join(transcripts, `${session}.jsonl`)).mtimeMs <= liveMs)) continue;
      const members = new Set(c.members.map((m) => m?.name).filter((n) => typeof n === 'string' && n));
      out.set(typeof c.name === 'string' && c.name ? c.name : t, { session, members });
    } catch {}
  }
  return out;
}

const minText = (min) => (min >= 1 ? `${min} min` : 'under 1 min');
/**
 * Map name -> {state: working|idle|deaf, at (last write), min, text} from agentStates and liveTeams (pure): deaf = in a
 * foreground call for more than DEAF_AFTER_MS (min: in the call); working = written within ACTIVE_MS; idle = a quiet
 * teammate of a live team. A run ended with a hand-back is none of them.
 */
export function sessionsOf(states, teams, now = Date.now()) {
  const out = new Map();
  for (const [name, st] of states) {
    if (st.ended || !Number.isFinite(st.lastMs)) continue;
    const at = new Date(st.lastMs).toISOString();
    const quiet = Math.max(0, Math.floor((now - st.lastMs) / 60000));
    const c = st.call, t = c && Date.parse(c.since);
    if (c && Number.isFinite(t) && now - t > DEAF_AFTER_MS && now - t <= CALL_RUNNING_MS) {
      const min = Math.floor((now - t) / 60000);
      out.set(name, { state: 'deaf', at, min, text: deafText({ cmd: c.cmd, min }) });
    } else if (now - st.lastMs <= ACTIVE_MS) {
      out.set(name, { state: 'working', at, min: quiet, text: `working (last step ${minText(quiet)} ago)` });
    } else if (st.teammate && st.team) {
      const tm = teams.get(st.team);
      if (tm && tm.session === st.session && tm.members.has(name)) out.set(name, { state: 'idle', at, min: quiet, text: `idle between steps, waiting for messages (last step ${minText(quiet)} ago)` });
    }
  }
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
  const tdir = teamsDir({ env });
  if (cache && cache.dir === dir && cache.tdir === tdir && Math.abs(now - cache.at) < CACHE_MS) return cache.value;
  let value, teams;
  try { value = agentStates({ dir, now }); } catch { value = new Map(); }
  try { teams = liveTeams({ dir: tdir, transcripts: dir, now }); } catch { teams = new Map(); }
  cache = { dir, tdir, at: now, value, teams };
  return value;
}
/** I-265: sessionsOf for this repo's transcripts and teams, cached CACHE_MS like the rest. */
export function sessionsNow({ now = Date.now(), mainCheckout = null } = {}) {
  const states = statesNow(now, mainCheckout);
  return sessionsOf(states, cache?.teams || new Map(), now);
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

/**
 * I-274: [{agent, taskId, status, at, sinceMs}] (longest first), one per unread task notification older than minAgeMs, from
 * agentStates (pure): not an agent that handed back, nor one inside a foreground call (it reads the notice when the call
 * returns: I-169 deaf), nor one whose session's own transcript was not written for liveMs (the session is over), nor one
 * of an older session than the newest (by its own transcript's write time) that has agents: a new lead session (a new
 * session id) ends the previous one's teammates, unread notices and all.
 */
export function stalledOf(states, { now = Date.now(), minAgeMs = STALL_AFTER_MS, liveMs = TEAM_LIVE_MS } = {}) {
  const out = [];
  let current = null, currentMs = -Infinity;
  for (const st of states.values()) if (Number.isFinite(st.sessionMs) && st.sessionMs > currentMs) { currentMs = st.sessionMs; current = st.session; }
  for (const [agent, st] of states) {
    if (st.ended || !st.notices?.length) continue;
    if (current !== null && st.session !== current) continue;
    const c = st.call, t = c && Date.parse(c.since);
    if (c && Number.isFinite(t) && now - t <= CALL_RUNNING_MS) continue;
    if (Number.isFinite(st.sessionMs) && now - st.sessionMs > liveMs) continue;
    for (const n of st.notices) {
      const sinceMs = now - (Date.parse(n.at) || st.lastMs);
      if (sinceMs >= minAgeMs) out.push({ agent, taskId: n.taskId, status: n.status, at: n.at, sinceMs });
    }
  }
  return out.sort((a, b) => b.sinceMs - a.sinceMs);
}
/** I-274: stalledOf for the transcripts in `dir`. */
export const stalledAgents = ({ dir = null, now = Date.now(), minAgeMs = STALL_AFTER_MS } = {}) => stalledOf(agentStates({ dir, now }), { now, minAgeMs });
/** I-274: stalledOf for this repo's transcripts, cached CACHE_MS like the rest. */
export const stalledNow = ({ now = Date.now(), mainCheckout = null, minAgeMs = STALL_AFTER_MS } = {}) => stalledOf(statesNow(now, mainCheckout), { now, minAgeMs });
/** I-274: {agent: {taskId, status, at, min}} with each agent's oldest stall (the board's live.stalled). */
export function stalledByAgent(stalls) {
  const out = {};
  for (const s of stalls) if (!out[s.agent] || Date.parse(s.at) < Date.parse(out[s.agent].at)) out[s.agent] = { taskId: s.taskId, status: s.status, at: s.at, min: Math.floor(s.sinceMs / 60000) };
  return out;
}
/** "stalled: job done N min ago, not picked up". */
export const stallText = (s) => (s ? `stalled: job done ${minText(s.min)} ago, not picked up` : '');
