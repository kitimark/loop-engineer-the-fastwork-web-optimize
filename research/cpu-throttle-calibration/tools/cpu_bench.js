/* cpu_bench.js — deterministic main-thread CPU microbenchmark for Chrome-vs-device calibration.
 *
 * Plain browser JS, no dependencies. The file is a single expression that evaluates to a
 * Promise<result>, so it can be run by:
 *   - CDP:  Runtime.evaluate({expression: <file text>, awaitPromise: true, returnByValue: true})
 *   - Safari Web Inspector console / Playwright / WebDriver: paste or `eval(text)` then await
 *   - <script src="cpu_bench.js"> : result lands in window.__cpuBenchResult and a
 *     'cpubench-done' event fires on window (detail = result).
 * Options (optional, set before running): window.__CPU_BENCH_OPTS = {reps: 5, warmup: 1}
 *
 * Sub-benchmarks (each reported as median ms of `reps` timed repetitions after `warmup`):
 *   js_numeric       : fixed-iteration float/int math loop (seeded, no allocation)
 *   js_alloc         : object allocation + sort + map/filter/reduce + JSON round-trip + string building
 *   dom_layout_thrash: subtree built detached, then attached; N x (write style width -> read getBoundingClientRect)
 *   style_recalc_var : 2000 elements styled with calc(var(--x)); N x (set --x on root -> force style via offsetHeight)
 *   dom_create       : innerHTML-free createElement/appendChild of a 1000-card (~6000-node) list + remove (hydration-like)
 * `total_ms` = sum of medians; `geomean_ms` = geometric mean of medians.
 * All test DOM lives in a fixed-size (400px wide) absolutely-positioned container so results do not
 * depend on the host page's viewport; it is removed afterwards.
 */
(async () => {
  const VERSION = 'cpu_bench v1 (2026-10-01)';
  const opts = Object.assign({reps: 5, warmup: 1}, (typeof window !== 'undefined' && window.__CPU_BENCH_OPTS) || {});
  const now = () => performance.now();
  const tick = () => new Promise(r => setTimeout(r, 30)); // let the event loop breathe between reps
  let sink = 0; // prevents dead-code elimination

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // (a1) pure numeric compute
  function jsNumeric() {
    let acc = 0, h = 2166136261 | 0;
    for (let i = 0; i < 3000000; i++) {
      acc += Math.sqrt(i) * Math.sin(i * 0.001) - (i % 7) * 0.5;
      h = Math.imul(h ^ i, 16777619);
    }
    return acc + h;
  }

  // (a2) allocation-heavy "app logic" work
  function jsAlloc() {
    const rnd = mulberry32(42);
    const items = new Array(60000);
    for (let i = 0; i < items.length; i++) {
      items[i] = {id: i, name: 'item-' + i, score: rnd(), tags: [i % 7, i % 13, i % 31], meta: {a: i & 255, b: 'x' + (i % 97)}};
    }
    items.sort((p, q) => p.score - q.score);
    const picked = items.filter(o => o.tags[0] !== 3).map(o => ({k: o.name, v: o.score * 100 | 0, t: o.tags.join(',')}));
    const sum = picked.reduce((s, o) => s + o.v, 0);
    const json = JSON.stringify(picked.slice(0, 8000));
    const back = JSON.parse(json);
    let html = '';
    for (let i = 0; i < 4000; i++) html += `<div class="c-${i % 10}" data-id="${back[i].k}">${back[i].t}</div>`;
    const m = new Map();
    for (let i = 0; i < 40000; i++) m.set('k' + (i % 5000), (m.get('k' + (i % 5000)) || 0) + 1);
    return sum + back.length + html.length + m.size;
  }

  function makeHost() {
    const host = document.createElement('div');
    host.id = '__cpu_bench_host';
    host.style.cssText = 'position:absolute;left:0;top:0;width:400px;font:14px/1.4 -apple-system,system-ui,Helvetica,Arial,sans-serif;background:#fff;color:#111;z-index:2147483647;overflow:hidden;';
    return host;
  }
  const words = 'freelance design logo website marketing video writing translation photo app ux consult'.split(' ');

  // (b) layout thrash: build detached, attach, then write-style/read-layout loop
  async function domLayoutThrash() {
    const host = makeHost();
    const rnd = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'padding:4px 6px;margin:2px 0;border:1px solid #ccc;';
      let t = '';
      for (let w = 0; w < 12; w++) t += words[(rnd() * words.length) | 0] + ' ';
      d.textContent = t;
      host.appendChild(d);
    }
    document.body.appendChild(host);
    host.getBoundingClientRect(); // initial layout not timed
    const kids = host.children;
    const t0 = now();
    let acc = 0;
    for (let i = 0; i < 150; i++) {
      host.style.width = (300 + ((i * 37) % 100)) + 'px';
      acc += kids[(i * 13) % kids.length].getBoundingClientRect().height;
    }
    const dt = now() - t0;
    host.remove();
    sink += acc;
    return dt;
  }

  // (c) style recalc via custom property on a 2000-element subtree
  async function styleRecalcVar() {
    const host = makeHost();
    const style = document.createElement('style');
    style.textContent = `#__cpu_bench_host{--x:0}
#__cpu_bench_host .sv{display:inline-block;width:16px;height:8px;margin:1px;
 color:hsl(calc(var(--x) * 3deg) 60% 40%);background-color:hsl(calc(var(--x) * 5deg + 90deg) 50% 60%);
 transform:translateX(calc(var(--x) * 0.01px)) rotate(calc(var(--x) * 0.1deg));
 opacity:calc(0.5 + var(--x) * 0.001);border-radius:calc(var(--x) * 0.05px)}
#__cpu_bench_host .sv:nth-child(3n){outline:1px solid hsl(calc(var(--x) * 7deg) 40% 50%)}`;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 2000; i++) { const s = document.createElement('span'); s.className = 'sv'; frag.appendChild(s); }
    host.appendChild(frag);
    document.head.appendChild(style);
    document.body.appendChild(host);
    host.offsetHeight; // initial style+layout not timed
    const t0 = now();
    let acc = 0;
    for (let i = 1; i <= 40; i++) {
      host.style.setProperty('--x', String(i));
      acc += host.offsetHeight; // forces style recalc (+ trivial layout)
    }
    const dt = now() - t0;
    host.remove(); style.remove();
    sink += acc;
    return dt;
  }

  // (d) DOM creation, attach, layout, remove (hydration/render-like)
  async function domCreate() {
    const host = makeHost();
    document.body.appendChild(host);
    const rnd = mulberry32(99);
    const t0 = now();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 1000; i++) {
      const card = document.createElement('article');
      card.className = 'card';
      card.style.cssText = 'display:flex;gap:6px;padding:6px;border-bottom:1px solid #eee';
      const img = document.createElement('div'); img.style.cssText = 'width:48px;height:48px;background:#ddd;flex:none';
      const body = document.createElement('div');
      const h = document.createElement('h3'); h.style.cssText = 'margin:0;font-size:14px'; h.textContent = words[(rnd() * 12) | 0] + ' ' + i;
      const p = document.createElement('p'); p.style.cssText = 'margin:2px 0'; p.textContent = words[(rnd() * 12) | 0] + ' ' + words[(rnd() * 12) | 0];
      const a = document.createElement('a'); a.href = '#c' + i; a.textContent = '฿' + ((rnd() * 5000) | 0);
      body.append(h, p, a); card.append(img, body); frag.appendChild(card);
    }
    host.appendChild(frag);
    sink += host.offsetHeight; // style + layout of the new subtree
    host.remove();
    return now() - t0;
  }

  const benches = [
    ['js_numeric', jsNumeric],
    ['js_alloc', jsAlloc],
    ['dom_layout_thrash', domLayoutThrash],
    ['style_recalc_var', styleRecalcVar],
    ['dom_create', domCreate],
  ];
  const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const r2 = x => Math.round(x * 100) / 100;

  const tStart = now();
  const results = {};
  for (const [name, fn] of benches) {
    const samples = [];
    for (let i = 0; i < opts.warmup + opts.reps; i++) {
      await tick();
      let dt;
      if (name.startsWith('js_')) { const t0 = now(); sink += fn(); dt = now() - t0; }
      else dt = await fn();
      if (i >= opts.warmup) samples.push(r2(dt));
    }
    results[name] = {median_ms: r2(median(samples)), min_ms: Math.min(...samples), max_ms: Math.max(...samples), samples_ms: samples};
  }
  const meds = Object.values(results).map(r => r.median_ms);
  const out = {
    version: VERSION,
    reps: opts.reps, warmup: opts.warmup,
    results,
    total_ms: r2(meds.reduce((a, b) => a + b, 0)),
    geomean_ms: r2(Math.exp(meds.reduce((a, b) => a + Math.log(Math.max(b, 0.01)), 0) / meds.length)),
    wall_ms: r2(now() - tStart),
    env: {
      ua: navigator.userAgent, dpr: window.devicePixelRatio, vw: innerWidth, vh: innerHeight,
      hwConcurrency: navigator.hardwareConcurrency, url: location.href.slice(0, 120),
      timerResolutionHintMs: (() => { let a = now(), b; do { b = now(); } while (b === a); return r2(b - a); })(),
      date: new Date().toISOString(),
    },
    _sink: typeof sink === 'number' ? sink % 1000 : 0,
  };
  try { window.__cpuBenchResult = out; window.dispatchEvent(new CustomEvent('cpubench-done', {detail: out})); } catch (e) {}
  return out;
})()
