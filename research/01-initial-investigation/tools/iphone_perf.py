#!/usr/bin/env python3
"""Measure page-load render metrics on a real iPhone Safari via safaridriver (WebDriver).

Prereqs: iPhone connected + unlocked, Settings > Apps > Safari > Advanced > Remote Automation ON,
`safaridriver --enable` run once on the Mac, and `safaridriver -p 4444` running.

Usage: python3 iphone_perf.py [--runs 5] [--out results.json] URL [URL ...]
"""
import argparse, json, statistics, sys, time, urllib.request

DRIVER = "http://localhost:4444"

# Installed before navigation is impossible via WebDriver, so we rely on buffered PerformanceObserver
# entries, which WebKit keeps for paint / LCP / layout-shift / resource / navigation.
COLLECT_JS = r"""
const done = arguments[arguments.length - 1];
const out = {ua: navigator.userAgent, supported: PerformanceObserver.supportedEntryTypes || []};
const obs = (type) => new Promise(res => {
  if (!out.supported.includes(type)) return res(null);
  const list = [];
  try {
    const o = new PerformanceObserver(l => list.push(...l.getEntries()));
    o.observe({type, buffered: true});
    setTimeout(() => { o.disconnect(); res(list); }, 300);
  } catch (e) { res(null); }
});
Promise.all(['largest-contentful-paint','layout-shift','longtask','event','first-input'].map(obs)).then(([lcp, ls, lt, ev, fi]) => {
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) out.nav = {
    ttfb: nav.responseStart, domInteractive: nav.domInteractive,
    dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd,
    dns: nav.domainLookupEnd - nav.domainLookupStart, connect: nav.connectEnd - nav.connectStart,
    request: nav.responseStart - nav.requestStart, download: nav.responseEnd - nav.responseStart,
    redirect: nav.redirectEnd - nav.redirectStart, transferSize: nav.transferSize,
    encodedBody: nav.encodedBodySize, decodedBody: nav.decodedBodySize, protocol: nav.nextHopProtocol,
  };
  if (nav) out.navRaw = Object.fromEntries(['startTime','fetchStart','domainLookupStart','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd','workerStart','redirectStart','type'].map(k => [k, nav[k]]));
  out.timeOrigin = performance.timeOrigin;
  const paints = {}; performance.getEntriesByType('paint').forEach(p => paints[p.name] = p.startTime);
  out.fp = paints['first-paint'] ?? null; out.fcp = paints['first-contentful-paint'] ?? null;
  if (lcp && lcp.length) {
    const last = lcp[lcp.length - 1], el = last.element;
    out.lcp = last.startTime;
    out.lcpEl = el ? {tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 80),
      src: last.url || null, size: last.size, text: (el.innerText || '').slice(0, 60)} : {src: last.url, size: last.size};
  } else out.lcp = null;
  if (ls) {
    let cls = 0, win = 0, prev = 0, start = 0;  // session-window CLS
    ls.filter(e => !e.hadRecentInput).forEach(e => {
      if (e.startTime - prev < 1000 && e.startTime - start < 5000) win += e.value; else { win = e.value; start = e.startTime; }
      prev = e.startTime; cls = Math.max(cls, win);
    });
    out.cls = cls;
    out.clsSources = ls.flatMap(e => (e.sources || []).map(s => s.node ? (s.node.tagName || '#text') + (s.node.className ? '.' + String(s.node.className).split(' ')[0] : '') : '?')).slice(0, 10);
  } else out.cls = null;
  out.longtasks = lt ? {count: lt.length, total: lt.reduce((a, e) => a + e.duration, 0)} : null;
  const res = performance.getEntriesByType('resource');
  const byType = {};
  res.forEach(r => {
    const t = r.initiatorType; byType[t] = byType[t] || {count: 0, transfer: 0, decoded: 0};
    byType[t].count++; byType[t].transfer += r.transferSize || 0; byType[t].decoded += r.decodedBodySize || 0;
  });
  out.resources = byType;
  out.origins = [...new Set(res.map(r => { try { return new URL(r.name).origin } catch (e) { return '?' } }))];
  out.slowest = res.sort((a, b) => b.duration - a.duration).slice(0, 12).map(r => ({
    url: r.name.slice(0, 140), type: r.initiatorType, start: Math.round(r.startTime), dur: Math.round(r.duration),
    transfer: r.transferSize, blocking: r.renderBlockingStatus || null}));
  out.images = res.filter(r => r.initiatorType === 'img' || r.initiatorType === 'css').map(r => ({
    url: r.name.replace(location.origin, ''), type: r.initiatorType, start: Math.round(r.startTime),
    end: Math.round(r.responseEnd), transfer: r.transferSize}));
  out.domNodes = document.getElementsByTagName('*').length;
  out.jsHeap = performance.memory ? performance.memory.usedJSHeapSize : null;
  done(out);
});
"""


def wd(method, path, body=None, timeout=120):
    req = urllib.request.Request(DRIVER + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}").get("value")


def new_session():
    caps = {"capabilities": {"alwaysMatch": {"browserName": "Safari", "platformName": "iOS"}}}
    try:
        return wd("POST", "/session", caps)["sessionId"]
    except urllib.error.HTTPError as e:
        sys.exit(f"session failed: {e.read().decode()}")


def measure(url, runs, settle):
    samples = []
    for i in range(runs):
        # Fresh session per run => fresh automation window, cold-ish memory cache.
        # (Safari's disk cache can persist; see notes in the report.)
        sid = new_session()
        try:
            wd("POST", f"/session/{sid}/timeouts", {"script": 30000, "pageLoad": 60000})
            wd("POST", f"/session/{sid}/url", {"url": "about:blank"})
            t0 = time.time()
            wd("POST", f"/session/{sid}/url", {"url": url})
            wall = (time.time() - t0) * 1000
            time.sleep(settle)  # let late LCP / shifts / hydration happen
            m = wd("POST", f"/session/{sid}/execute/async", {"script": COLLECT_JS, "args": []})
            m["wallLoad"] = wall
            samples.append(m)
            n = m.get("nav") or {}
            print(f"  run {i+1}: ttfb={n.get('ttfb', 0):.0f} fcp={m.get('fcp') or 0:.0f} "
                  f"lcp={m.get('lcp') or 0:.0f} cls={m.get('cls')} load={n.get('load', 0):.0f}", flush=True)
        finally:
            try: wd("DELETE", f"/session/{sid}")
            except Exception: pass
    return samples


def summarize(samples):
    def pick(f):
        v = [x for x in (f(s) for s in samples) if isinstance(x, (int, float))]
        if not v: return None
        v.sort()
        return {"median": round(statistics.median(v), 1), "p90": round(v[min(len(v) - 1, int(len(v) * 0.9))], 1),
                "min": round(v[0], 1), "max": round(v[-1], 1)}
    return {
        "ttfb": pick(lambda s: (s.get("nav") or {}).get("ttfb")),
        "fcp": pick(lambda s: s.get("fcp")),
        "lcp": pick(lambda s: s.get("lcp")),
        "cls": pick(lambda s: s.get("cls")),
        "dcl": pick(lambda s: (s.get("nav") or {}).get("dcl")),
        "load": pick(lambda s: (s.get("nav") or {}).get("load")),
        "longtaskTotal": pick(lambda s: (s.get("longtasks") or {}).get("total")),
        "domNodes": pick(lambda s: s.get("domNodes")),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--settle", type=float, default=5.0)
    ap.add_argument("--out", default="iphone_results.json")
    a = ap.parse_args()
    report = {}
    for u in a.urls:
        print(f"== {u}", flush=True)
        s = measure(u, a.runs, a.settle)
        report[u] = {"summary": summarize(s), "samples": s}
        print(json.dumps(report[u]["summary"], indent=1))
    json.dump(report, open(a.out, "w"), indent=1)
    print(f"saved {a.out}")
