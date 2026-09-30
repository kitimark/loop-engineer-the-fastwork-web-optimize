#!/usr/bin/env python3
"""trace_summary.py — summarise a Chrome trace (from chrome_scroll.mjs --trace) per thread and per phase.

Handles both the streamed one-event-per-line format written by chrome_scroll.mjs and a plain
{"traceEvents":[...]} JSON file (loaded whole). Only interval events on "interesting" threads are
kept in memory. Phases are taken from performance.mark('phase:idle'|'phase:scroll'|'phase:bottom'|'phase:end').

Per thread and phase it reports: busy time of top-level tasks, task count > 50/100 ms, longest tasks,
top event names by self time, and, for a watch-list of names (FinishPaintRenderPass, DoEndRasterCHROMIUM,
FunctionCall, UpdateLayoutTree, Layout, Paint, ...), count / total / max duration.

Usage: python3 trace_summary.py TRACE.json [OUT.json]
"""
import json, sys, collections

# exact-name watch list (renderer main-thread work) ...
WATCH = ['FunctionCall', 'EvaluateScript', 'v8.compile', 'v8.run', 'TimerFire', 'FireAnimationFrame', 'EventDispatch',
         'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'PaintImage', 'Decode Image', 'ImageDecodeTask',
         'MajorGC', 'MinorGC', 'BlinkGC.AtomicPhase', 'ProxyMain::BeginMainFrame', 'ProxyImpl::ScheduledActionCommit',
         'LayerTreeHostImpl::PrepareToDraw', 'TileManager::AssignGpuMemoryToTiles', 'RasterTask', 'DirectRenderer::DrawFrame',
         'DirectRenderer::DrawRenderPass', 'Display::DrawAndSwap']
# ... and substring watch list (GPU-process raster / present work; full names vary between Chrome versions)
WATCH_SUB = ['DoEndRasterCHROMIUM::Flush', 'FinishPaintRenderPass', 'DoRasterCHROMIUM', 'DoBeginRasterCHROMIUM',
             'SwapBuffers', 'WaitForCommandsToBeScheduled', 'ApplyBackpressure', 'CommitPresentedFrameToCA']
TOPLEVEL = {'ThreadControllerImpl::RunTask', 'RunTask', 'ThreadPool_RunTask', 'MessageLoop::RunTask'}
THREADS = {'CrRendererMain', 'Compositor', 'CrGpuMain', 'VizCompositorThread', 'CrBrowserMain', 'CompositorTileWorker',
           'ThreadPoolForegroundWorker', 'CompositorGpuThread'}


def iter_events(path):
    with open(path, 'rb') as f:
        head = f.read(4096); f.seek(0)
        if not head.startswith(b'{"traceEvents":[') or b'\n' not in head:
            data = json.load(f)
            yield from (data['traceEvents'] if isinstance(data, dict) else data); return
        f.seek(len(b'{"traceEvents":['))
        for line in f:
            s = line.strip()
            if s.startswith(b','): s = s[1:]
            if s.endswith(b']}'): s = s[:-2]
            if s.endswith(b','): s = s[:-1]
            if not s: continue
            try: yield json.loads(s)
            except json.JSONDecodeError: continue


def main(path, out=None):
    pname, tname = {}, {}
    marks = {}
    raw = collections.defaultdict(list)          # (pid,tid) -> [(ts,dur,name)]
    open_b = collections.defaultdict(list)       # B/E stacks
    all_x = collections.defaultdict(int)
    for ev in iter_events(path):
        ph = ev.get('ph'); pid, tid = ev.get('pid'), ev.get('tid')
        if ph == 'M':
            if ev.get('name') == 'process_name': pname[pid] = ev['args'].get('name')
            elif ev.get('name') == 'thread_name': tname[(pid, tid)] = ev['args'].get('name')
            continue
        name = ev.get('name', '')
        if name.startswith('phase:') and ev.get('cat', '').find('user_timing') >= 0:
            marks.setdefault(name, (ev['ts'], pid))
            continue
        if ph == 'X':
            raw[(pid, tid)].append((ev['ts'], ev.get('dur', 0), name)); all_x[(pid, tid)] += 1
        elif ph == 'B':
            open_b[(pid, tid)].append((ev['ts'], name))
        elif ph == 'E':
            st = open_b[(pid, tid)]
            if st:
                ts, nm = st.pop(); raw[(pid, tid)].append((ts, ev['ts'] - ts, nm))

    def thread_label(k):
        t = tname.get(k, '?'); base = t.rstrip('0123456789').rstrip()
        return f"{pname.get(k[0], '?')}:{t}", base

    if not all(p in marks for p in ('phase:idle', 'phase:scroll', 'phase:bottom', 'phase:end')):
        print('WARNING: phase marks missing', marks)
    rpid = marks.get('phase:scroll', (0, None))[1]
    if rpid is None:  # fall back to the renderer whose main thread has the most events
        cands = [(len(v), k[0]) for k, v in raw.items() if tname.get(k) == 'CrRendererMain']
        rpid = max(cands)[1] if cands else None
    ph_win = {}
    names = ['phase:idle', 'phase:scroll', 'phase:bottom', 'phase:end']
    for a, b in zip(names, names[1:]):
        if a in marks and b in marks: ph_win[a.split(':')[1]] = (marks[a][0], marks[b][0])

    if not ph_win:  # no marks: treat the whole trace as one window
        allts = [e[0] for evs in raw.values() for e in evs]
        ph_win['scroll'] = (min(allts), max(allts))
    result = {'trace': path, 'phases_ms': {k: round((v[1] - v[0]) / 1000) for k, v in ph_win.items()}, 'threads': {}}
    for k, evs in raw.items():
        label, base = thread_label(k)
        if base not in THREADS: continue
        proc = pname.get(k[0], '?')
        if base in ('CrRendererMain', 'Compositor', 'CompositorTileWorker') and proc == 'Renderer' and k[0] != rpid: continue
        evs.sort(key=lambda e: (e[0], -e[1]))
        # self time via nesting stack
        selfs = []
        stack = []
        for ts, dur, nm in evs:
            end = ts + dur
            while stack and stack[-1][1] <= ts: stack.pop()
            rec = [ts, end, nm, dur, len(stack) == 0]
            if stack: stack[-1][3] -= min(dur, stack[-1][1] - ts)
            stack.append(rec); selfs.append(rec)
        for ph, (a, b) in ph_win.items():
            inwin = [r for r in selfs if a <= r[0] < b]
            if not inwin: continue
            top = [r for r in inwin if r[4]]
            toptask = [r for r in top if r[2] in TOPLEVEL] or top
            busy = sum(r[1] - r[0] for r in toptask)
            selfagg = collections.Counter()
            for r in inwin: selfagg[r[2]] += r[3]
            watch = {}
            for r in inwin:
                key = r[2] if r[2] in WATCH else next((x for x in WATCH_SUB if x in r[2]), None)
                if key:
                    w = watch.setdefault(key, {'count': 0, 'total_ms': 0.0, 'max_ms': 0.0, 'gt50': 0})
                    d = (r[1] - r[0]) / 1000; w['count'] += 1; w['total_ms'] += d; w['max_ms'] = max(w['max_ms'], d); w['gt50'] += d > 50
            for w in watch.values(): w['total_ms'] = round(w['total_ms'], 1); w['max_ms'] = round(w['max_ms'], 1)
            longest = sorted(toptask, key=lambda r: r[0] - r[1])[:5]
            # dominant child (largest self time event) inside each longest task
            lt = []
            for r in longest:
                kids = collections.Counter()
                for c in inwin:
                    if r[0] <= c[0] < r[1]: kids[c[2]] += c[3]
                lt.append({'dur_ms': round((r[1] - r[0]) / 1000, 1), 'at_ms': round((r[0] - a) / 1000),
                           'top_self': [(n, round(v / 1000, 1)) for n, v in kids.most_common(4)]})
            dst = result['threads'].setdefault(label + (f' [{k[1]}]' if base in ('CompositorTileWorker', 'ThreadPoolForegroundWorker') else ''), {})
            dst[ph] = {
                'busy_ms': round(busy / 1000, 1), 'busy_pct': round(100 * busy / (b - a), 1),
                'tasks': len(toptask), 'tasks_gt50': sum(1 for r in toptask if r[1] - r[0] > 50000),
                'tasks_gt100': sum(1 for r in toptask if r[1] - r[0] > 100000),
                'max_task_ms': round(max((r[1] - r[0] for r in toptask), default=0) / 1000, 1),
                'longest': lt,
                'top_self_ms': [(n, round(v / 1000, 1)) for n, v in selfagg.most_common(12)],
                'watch': watch,
            }
    # merge worker threads into pooled summaries to keep output small
    pools = collections.defaultdict(lambda: collections.defaultdict(lambda: {'busy_ms': 0, 'max_task_ms': 0, 'threads': 0}))
    for lbl in list(result['threads']):
        if '[' in lbl:
            base = lbl.split(' [')[0]
            for ph, d in result['threads'][lbl].items():
                p = pools[base + ' (pool)'][ph]; p['busy_ms'] = round(p['busy_ms'] + d['busy_ms'], 1)
                p['max_task_ms'] = max(p['max_task_ms'], d['max_task_ms']); p['threads'] += 1
                for n, v in d['watch'].items():
                    w = p.setdefault('watch', {}).setdefault(n, {'count': 0, 'total_ms': 0, 'max_ms': 0})
                    w['count'] += v['count']; w['total_ms'] = round(w['total_ms'] + v['total_ms'], 1); w['max_ms'] = max(w['max_ms'], v['max_ms'])
            del result['threads'][lbl]
    for k, v in pools.items(): result['threads'][k] = dict(v)
    js = json.dumps(result, indent=1)
    if out: open(out, 'w').write(js)
    return result


if __name__ == '__main__':
    r = main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    for lbl, d in r['threads'].items():
        s = d.get('scroll')
        if not s: continue
        w = s.get('watch', {})
        keys = ['FinishPaintRenderPass', 'DoEndRasterCHROMIUM::Flush', 'FunctionCall', 'UpdateLayoutTree', 'Layout', 'Paint']
        print(f"{lbl:55s} busy {s.get('busy_ms')}ms max {s.get('max_task_ms')}ms " +
              ' '.join(f"{k}={w[k]['total_ms']}/{w[k]['max_ms']}" for k in keys if k in w))
