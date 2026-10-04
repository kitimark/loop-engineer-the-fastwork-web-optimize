#!/usr/bin/env node
// Idle alarm (incident I-105, user T-058 #4): says when the iPhone lease or the chrome-measure lock has stood free for
// more than N minutes (the iPhone also: held with no phone run for that long, I-111, unless the user is on the holder's console step, I-125, or the lease is the user's own hand test: owner `user` or `user-*`, I-144) while work waits for it (queued waiters, or status-board rows waiting on it). Library and rules:
// tools/lib/idle.mjs. Read-only on the locks (never takes, renews or releases one); no iPhone, Chrome or network.
//
//   node tools/idle.mjs check [--by lead] [--phone-min 5] [--chrome-min 10] [--step-min 2] [--json]
//        # one shot, at check-ins (lead, ops). One line per resource:
//        #   IDLE iphone: iPhone free for 14 min (since 03:10Z, released by iphone-runner), over the 5 min limit, while
//        #     work waits: fix-morph-gpu (queued for it), f3-arm-scope (owner fix-nav-morph; its note names the phone)
//        #   IDLE iphone: iPhone held by fix-nav-morph but unused for 6 min (no phone run since 04:00Z, lease taken by
//        #     fix-nav-morph), over the 5 min limit, while work waits: iphone-runner (queued for it)     # I-111
//        #   OK chrome-measure: held by "(shared)" | free for 3 min …, no ready work | … under the 10 min limit; waiting: …
//        # exit 0 nothing idle, 3 alarm (some resource idle over its limit with ready work), 1 usage or error.
//   node tools/idle.mjs watch --by lead [--interval 60] [--phone-min 5] [--chrome-min 10]
//        # long-running (the lead starts it detached: nohup node tools/idle.mjs watch --by lead > out/idle-watch.log 2>&1 &).
//        # Polls every --interval s (at least 30); prints a line only for a new alarm (IDLE …), its post (POSTED T-…
//        # or NOT POSTED: …) and the end of an episode (ENDED …). Exit 0 on SIGINT/SIGTERM.
// Posting (one console thread per idle episode, never one per poll): only with --by lead (only the lead starts threads).
// The thread is assigned to the desk and to the waiting owners (so the T-050 router and their `thread wait` reach
// them) and closed by itself when the slot is taken again. Each pass also checks the disk (I-124, lib/space-watch.mjs):
// under FW_SPACE_ALARM_GB (default 20) free one thread to the desk and the biggest out/ owners; with --by lead the
// auto-clean of `space.mjs prune --apply` every 6 h (hourly while low; FW_SPACE_AUTOPRUNE=0 turns it off). Without --by (or with another name) it only prints; the
// episode stays unposted, so the lead's watch still posts it. Names and minutes only (Hard rule 12).
// Stuck steps (I-123, lib/step-alarm.mjs), in the same passes: an active console step whose current part waits on its
// runner (a gated part not ready, a recorded part started without "recording") with no change for more than --step-min
// minutes (default 2): `STUCK C-037: part 1 (attempt 2) waits on fix-nav-morph for 10 min (…)`, exit 3 in check, one
// thread per stuck period to the step's owner and the desk (--by lead), ENDED / CLOSED when the step moves on.
import { RESOURCES, RESOURCE_NAMES, MIN_INTERVAL_SEC, DEFAULT_INTERVAL_SEC, gather, assess, record, settle, takeToClose, lineFor, threadFor, addressees, notifyLine, readState } from './lib/idle.mjs';
import { createThread, setStatus } from './lib/console-threads.mjs';
import { getDesk } from './lib/thread-routing.mjs';
import { stepPass, STUCK_STEP_MIN } from './lib/step-alarm.mjs';
import { diskPass } from './lib/space-watch.mjs'; // I-124: disk alarm + auto-clean (FW_SPACE_AUTOPRUNE=0 turns the clean off)
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url); // I-152 N10: --help prints the header above and exits before anything runs
const argv = process.argv.slice(2);
const VALUED = ['--by', '--phone-min', '--chrome-min', '--interval', '--step-min'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const EXIT = { ok: 0, usage: 1, alarm: 3 };
// FW_IDLE_NOW: a test-only clock (ISO time); every real run uses the wall clock
const clock = () => (process.env.FW_IDLE_NOW ? Date.parse(process.env.FW_IDLE_NOW) : Date.now());

function minutesOpt(name, def) {
  const v = opt(name);
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) throw new Error(`--${name} must be minutes in (0, 1440] (got "${v}")`);
  return n;
}

const limits = () => ({ iphone: minutesOpt('phone-min', RESOURCES.iphone.defaultMin), 'chrome-measure': minutesOpt('chrome-min', RESOURCES['chrome-measure'].defaultMin), step: minutesOpt('step-min', STUCK_STEP_MIN) });

/** One pass: assess, record (de-duplicated per episode), post / close as the lead. Returns {results, alarm}. */
async function pass({ by, min, log, quietOk, watching = false }) {
  const now = clock();
  const state = readState();
  const as = gather({ now, state }).map((x) => assess(x.r, { ...x, min: min[x.r] }));
  const lead = by === 'lead';
  const results = await record(as, { now, claim: lead });
  for (const res of results) {
    const { a } = res;
    if (res.ended) {
      const why = res.ended.kind === 'held' ? res.ended.note : a.held ? `now held by ${a.holder}` : 'a new free period began'; // I-111: a held-idle episode says how it ended
      log(`ENDED ${a.resource}: idle period from ${res.ended.since.slice(11, 16)}Z is over (${why})${res.ended.thread ? `; thread ${res.ended.thread}` : ''}`);
    }
    if (a.alarm ? (res.news || !quietOk) : !quietOk) log(`${lineFor(a)}${a.alarm && res.thread ? ` [posted in ${res.thread}]` : ''}`);
    // I-155: whom a new alarm concerns, one line each (their /status rows carry a red alert while it stands)
    if (a.alarm && res.news) for (const n of addressees(a)) log(notifyLine(a, n));
    if (!res.post) {
      if (a.alarm && res.news && !lead) log(`NOT POSTED ${a.resource}: posting needs --by lead (only the lead starts threads); the lead's watch posts it`);
      continue;
    }
    const desk = getDesk()?.agent || null;
    const { title, text } = threadFor(a, { desk });
    const since = new Date(a.since).toISOString();
    try {
      const to = addressees(a, desk);
      const r = await createThread({ by, title, text, ...(to.length ? { to: to.join(',') } : {}) });
      await settle(a.resource, since, { thread: r.thread.id, by, now });
      log(`POSTED ${r.thread.id} ${a.resource}: ${title}${to.length ? ` (to ${to.join(', ')})` : ''}`);
    } catch (e) {
      await settle(a.resource, since, { error: e.message, now });
      log(`NOT POSTED ${a.resource}: ${e.message}`);
    }
  }
  if (lead) {
    for (const c of await takeToClose()) {
      try { await setStatus(c.thread, { status: 'closed', by, note: c.note }); log(`CLOSED ${c.thread} (${c.resource}: ${c.note})`); } catch (e) { log(`NOT CLOSED ${c.thread}: ${e.message}`); }
    }
  }
  const steps = await stepPass({ by, log, quietOk, now, min: min.step }); // I-123 (c): steps stuck on their runner
  // I-124: the disk (alarm thread under FW_SPACE_ALARM_GB, default 20; with --by lead the auto-clean of lib/space-prune.mjs)
  let disk = null;
  try { disk = await diskPass({ by, log, now, autoClean: watching }); } catch (e) { log(`DISK ERROR ${e.message}`); }
  return { results, alarm: as.some((a) => a.alarm) || steps.alarm, disk };
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log('usage: node tools/idle.mjs check|watch … (see the header of tools/idle.mjs)'); return cmd ? EXIT.ok : EXIT.usage; }
  const by = opt('by');
  if (by !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(by)) throw new Error(`bad --by "${by}" (an agent name, e.g. lead)`);
  const min = limits();
  if (cmd === 'check') {
    const lines = [];
    const { results, alarm } = await pass({ by, min, log: (s) => lines.push(s), quietOk: false });
    if (flag('json')) console.log(JSON.stringify({ alarm, resources: results.map((x) => x.a), log: lines }, null, 1));
    else for (const l of lines) console.log(l);
    return alarm ? EXIT.alarm : EXIT.ok;
  }
  if (cmd === 'watch') {
    const iv = opt('interval') === undefined ? DEFAULT_INTERVAL_SEC : Number(opt('interval'));
    if (!Number.isFinite(iv) || iv < MIN_INTERVAL_SEC) throw new Error(`--interval must be at least ${MIN_INTERVAL_SEC} s (got "${opt('interval')}")`);
    const log = (s) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${s}`);
    log(`WATCH idle alarm every ${iv} s: ${RESOURCE_NAMES.map((r) => `${r} > ${min[r]} min`).join(', ')}; ${by === 'lead' ? 'posting as the lead' : 'print only (posting needs --by lead)'}`);
    let stop = false, wake = null;
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop = true; if (wake) wake(); });
    while (!stop) {
      try { await pass({ by, min, log, quietOk: true, watching: true }); } catch (e) { log(`ERROR ${e.message}`); }
      if (stop) break;
      await new Promise((res) => { const t = setTimeout(res, iv * 1000); wake = () => { clearTimeout(t); res(); }; });
    }
    log('STOPPED');
    return EXIT.ok;
  }
  throw new Error(`unknown command "${cmd}" (check or watch; see the header of tools/idle.mjs)`);
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message || e); process.exitCode = EXIT.usage; });
