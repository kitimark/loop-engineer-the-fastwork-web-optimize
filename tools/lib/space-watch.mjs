// Disk watch for idle.mjs watch (incident I-124; user T-049 #22/#27). One call per watch pass: diskPass().
//
//   - Alarm: free space under alarmGb() (FW_SPACE_ALARM_GB, default 20) opens an episode; the lead's watch posts ONE
//     console thread to the desk and the owners of the biggest out/ folders, with those folders (sizes from one du of
//     every checkout's out/ entries, skipped beside someone's exclusive chrome-measure hold). Under the timing floor
//     (lib/disk.mjs timingMinGb, default 8) it adds one reply: new timing holds are now refused. The episode ends (thread
//     closed) when free space is back over the alarm + 2 GB.
//   - Auto-clean: with --by lead and FW_SPACE_AUTOPRUNE not 0 (default on, user T-049 #27), runs `space.mjs prune
//     --apply` (lib/space-prune.mjs: only leftover Chrome profiles, uncited full-frame images after a record, rebuildable
//     snapshot copies, each unused for a day; never JSON/Markdown/logs/records) every FW_SPACE_PRUNE_EVERY_H hours
//     (default 6), hourly while the alarm is on; never beside someone's exclusive chrome-measure hold or queued waiter
//     (its du/lsof/git would load the Mac under a measurement).
// State: <git-common-dir>/fastwork-mirror/space/watch.json. Names, sizes and repo-relative paths only (Hard rule 12).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { diskFree, alarmGb, timingMinGb, fmtGb, GiB } from './disk.mjs';
import { sharedStateDir, mainCheckout } from './paths.mjs';
import { worktrees, duBytes, fmtSize, spaceRunRefusalNow, worktreeTopics, boardRowsFor } from './space.mjs';
import { autoPruneEnabled, runPrune, spaceDir } from './space-prune.mjs';
import { status as lockStatus } from './lock.mjs';
import { createThread, replyAgent, setStatus } from './console-threads.mjs';
import { getDesk } from './thread-routing.mjs';
import { list as boardList } from './status.mjs';

export const END_MARGIN_GB = 2;
let quietSince = null;
export const watchFile = () => join(spaceDir(), 'watch.json');
const readJsonSafe = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const save = (s) => { mkdirSync(spaceDir(), { recursive: true }); writeFileSync(watchFile(), JSON.stringify(s, null, 1) + '\n'); };
const isDir = (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } };
export const pruneEveryMs = (env = process.env) => { const h = Number(env.FW_SPACE_PRUNE_EVERY_H); return (Number.isFinite(h) && h > 0 ? h : 6) * 3600e3; };

/** Why the automatic prune must not run now (someone's exclusive hold, or a queued exclusive waiter), or null. */
export function pruneBusy(env = process.env) {
  const r = spaceRunRefusalNow(env);
  if (r) return r.split('.')[0];
  let st; try { st = lockStatus('chrome-measure'); } catch { return null; }
  const w = (st.queue || []).find((x) => !x.shared && !x.short);
  return w ? `"${w.owner}" waits for chrome-measure` : null;
}

/** The biggest out/ entries over every checkout: [{show, bytes, branch, owners[]}] (one du call), and the owners. */
export function topFolders({ mainRoot = mainCheckout(), rows = [], top = 8 } = {}) {
  const wts = worktrees(mainRoot);
  const entries = [];
  for (const w of wts) {
    const out = join(w.path, 'out');
    if (!isDir(out)) continue;
    const owners = w.main ? ['lead'] : [...new Set(boardRowsFor(worktreeTopics(w, mainRoot, 'main'), rows).map((r) => r.owner).filter(Boolean))];
    let es = []; try { es = readdirSync(out); } catch {}
    for (const e of es) entries.push({ path: join(out, e), show: relative(mainRoot, join(out, e)) || 'out', branch: w.branch || null, owners });
  }
  const sizes = duBytes(entries.map((e) => e.path));
  return entries.map((e) => ({ show: e.show, bytes: sizes.get(e.path) || 0, branch: e.branch, owners: e.owners })).sort((a, b) => b.bytes - a.bytes).slice(0, top);
}

function alarmText({ free, alarm, floor, folders, sizesWhy }) {
  const L = [`Only ${fmtGb(free)} free on the Mac's disk (alarm under ${alarm} GB; under ${floor} GB new timing holds are refused). Auto-clean (space.mjs prune) removes only leftover Chrome profiles, uncited full-frame images (a record and thumbnails stay) and rebuildable snapshot copies; every JSON, Markdown, log, phone record and recording stays.`];
  if (folders.length) {
    L.push('', 'Biggest out/ folders:');
    for (const f of folders) L.push(`- ${fmtSize(f.bytes)} ${f.show}${f.branch ? ` (${f.branch}${f.owners.length ? `, ${f.owners.join(', ')}` : ''})` : ''}`);
  } else L.push('', `Folder sizes skipped: ${sizesWhy}.`);
  L.push('', 'Owners: keep fewer full frames (write them only on a diff, or behind a --keep-frames flag). See what can go: node tools/space.mjs prune (dry run), node tools/space.mjs report.');
  return L.join('\n');
}

/**
 * One disk pass. {by, log, now, env, mainRoot, rows, folders (tests), prune (tests: replaces runPrune), autoClean (false:
 * alarm only, e.g. `idle.mjs check`)}.
 * Returns {free, alarm (bool), posted, ended, pruned}.
 */
export async function diskPass({ by, log = () => {}, now = Date.now(), env = process.env, mainRoot, rows, folders, prune = runPrune, autoClean = true } = {}) {
  const lead = by === 'lead';
  const d = diskFree(sharedStateDir(), env);
  if (!d) return { free: null, alarm: false };
  const alarm = alarmGb(env), floor = timingMinGb(env);
  const s = readJsonSafe(watchFile()) || {};
  const out = { free: d.freeBytes, alarm: !!(alarm && d.freeBytes < alarm * GiB) };
  const ep = s.episode;
  if (!out.alarm) quietSince = null;
  if (out.alarm && !ep && (lead || !quietSince)) {
    quietSince = now; // without --by lead nothing is saved: say it once per low period of this process
    log(`DISK-LOW ${fmtGb(d.freeBytes)} free, under the ${alarm} GB alarm`);
    if (lead) {
      const busy = pruneBusy(env);
      let fs = folders, rws = rows;
      if (!rws) { try { rws = boardList(); } catch { rws = []; } }
      if (!fs) fs = busy ? [] : topFolders({ mainRoot: mainRoot || mainCheckout(), rows: rws });
      const desk = getDesk()?.agent || null;
      const to = [...new Set([desk, ...fs.flatMap((f) => f.owners)].filter((a) => a && a !== 'lead'))].slice(0, 8);
      const episode = { since: new Date(now).toISOString(), freeAtStart: d.freeBytes };
      try {
        const r = await createThread({ by: 'lead', title: `Disk nearly full: ${fmtGb(d.freeBytes)} free (I-124)`, text: alarmText({ free: d.freeBytes, alarm, floor, folders: fs, sizesWhy: busy || 'no out/ folders' }), ...(to.length ? { to: to.join(',') } : {}) });
        episode.thread = r.thread.id;
        out.posted = r.thread.id;
        log(`POSTED ${r.thread.id} disk: ${fmtGb(d.freeBytes)} free${to.length ? ` (to ${to.join(', ')})` : ''}`);
      } catch (e) { episode.error = e.message; log(`NOT POSTED disk: ${e.message}`); }
      s.episode = episode;
    }
  }
  if (lead && s.episode && floor && d.freeBytes < floor * GiB && !s.episode.floorNoted) {
    s.episode.floorNoted = new Date(now).toISOString();
    log(`DISK-LOW ${fmtGb(d.freeBytes)} free, under the ${floor} GB timing floor: new timing holds are refused`);
    if (s.episode.thread) try { await replyAgent(s.episode.thread, { by: 'lead', text: `Now ${fmtGb(d.freeBytes)} free, under ${floor} GB: lock.mjs refuses new timing holds (DISK-LOW) until space is freed. Shared, short and --no-timing holds still run.` }); } catch (e) { log(`NOT REPLIED ${s.episode.thread}: ${e.message}`); }
  }
  if (s.episode && (!alarm || d.freeBytes >= (alarm + END_MARGIN_GB) * GiB)) {
    log(`ENDED disk: ${fmtGb(d.freeBytes)} free again${s.episode.thread ? `; thread ${s.episode.thread}` : ''}`);
    if (lead && s.episode.thread) try { await setStatus(s.episode.thread, { status: 'closed', by: 'lead', note: `${fmtGb(d.freeBytes)} free again` }); } catch (e) { log(`NOT CLOSED ${s.episode.thread}: ${e.message}`); }
    out.ended = s.episode.thread || true;
    if (lead) delete s.episode;
  }
  if (lead && autoClean && autoPruneEnabled(env)) {
    const every = out.alarm ? Math.min(3600e3, pruneEveryMs(env)) : pruneEveryMs(env);
    if (!s.lastPrune || now - Date.parse(s.lastPrune) >= every) {
      const busy = pruneBusy(env);
      if (busy) { if (!s.pruneDeferred) log(`PRUNE deferred: ${busy}`); s.pruneDeferred = new Date(now).toISOString(); }
      else {
        s.lastPrune = new Date(now).toISOString();
        delete s.pruneDeferred;
        try {
          const r = prune({ apply: true, by: 'lead', log, now, ...(mainRoot ? { mainRoot } : { mainRoot: mainCheckout() }) });
          if (r.busy) log(`PRUNE skipped: another prune runs (pid ${r.busy.pid})`);
          else { out.pruned = r.result; log(`PRUNE removed ${r.result.removed.length} item(s), ${fmtSize(r.result.bytes)}; kept ${r.plan.kept.length} (space.mjs prune shows why)`); }
        } catch (e) { log(`PRUNE ERROR ${e.message}`); }
      }
    }
  }
  if (lead) save(s);
  return out;
}
