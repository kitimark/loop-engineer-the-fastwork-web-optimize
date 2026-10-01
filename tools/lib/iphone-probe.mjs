// The in-page side of `node tools/iphone.mjs run` (tools/lib/iphone-run.mjs): the standard probe (`--probe std`,
// measurement protocol v2 §5.5, research/architecture/measurement-protocol-v2.md), the three drivers
// (S scroll, W window, M morph, §5.4), and the pure Node-side functions that turn what the page recorded into
// the run JSON (schema `fw-iphone-run/1`).
//
// Std probe, per rAF frame (the gap from the previous rAF timestamp to this one):
//   frames[k] = [t, dt, yStart, yEnd, innerHeight, m, rafJsMs, probeMs]
//     t        rAF timestamp (page clock = performance.now(), 0.1 ms)
//     dt       t[k] - t[k-1]; ticks are k = round(dt / 8.333) at 120 Hz (analysis: T3, not here)
//     yStart   yEnd of the previous frame (scrollY at the probe's previous rAF callback)
//     yEnd     scrollY at the probe's rAF callback
//     m        the `--morph` inline custom property of the nav / morph element, or null (no layout read)
//     rafJsMs  sync time of the PAGE's own rAF callbacks that ran at t[k-1] (wrapped requestAnimationFrame),
//              i.e. the rAF JS inside this gap. NOT scroll, IO, timer or message handlers (WebKit Timeline
//              RenderingFrame "Script" is the full figure, attribution runs only).
//     probeMs  the probe's own callback time (rAF loop + MutationObserver + cv listener) since the previous row
//   mutations: every MutationObserver record on the whole document (subtree, attributes with old values,
//     childList, characterData), counted by type with NO cap (F-044: a first-N cap hid the inert flip behind
//     an img src burst). Attribute writes that leave the value unchanged count as `same`, not under their type
//     (F-020). A batch is placed in the frame whose gap contains its delivery time: t[k-1] <= delivery < t[k].
//     A mutation made in a rAF callback at t[k-1] therefore lands in row k, whose dt includes its rendering;
//     one made in a task after that frame rendered also lands in row k but renders in row k+1, so read rows
//     k-1 and k together for a slow row k.
//   crossings (code-threshold log): the EFFECTS of IO edges and scene gates, each [t, kind, id, value, y] in
//     the page, placed like mutations: scene / render (data-start-selling-scene|render values), inert
//     (present/removed), class (+token / -token, svelte-* hash classes ignored), cv
//     (contentvisibilityautostatechange skipped|rendered). `src: "effect"`: an IO callback that changes
//     nothing is not seen here (wrapping the page's IO callbacks needs a bootstrap script: T1b, `src: "io"`).
//   marks: {phase: [t0, t1]} on the frames' clock, also performance.mark('fwr:<phase>:start|end').
//   anims: document.getAnimations() counts by timeline type before the driver starts.
//   tops (--tops id=selector,...): document top (getBoundingClientRect().top + scrollY, a layout read) of each
//     element before the probe starts (`tops`) and after the driver ends (`topsPost`), outside the timed window,
//     for crossing placement y_i = top_i - f_i * vh (protocol §3.4) with the top of the same run.
// Probe cost: one MutationObserver on the whole document (WebKit then builds a record for every mutation, which
// probeMs does not see), a wrapped requestAnimationFrame, one rAF loop, one capture listener. No layout reads.

export const SCHEMA = 'fw-iphone-run/1';
export const FIELDS = ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'rafJsMs', 'probeMs'];
export const MUT_TYPES = ['src', 'class', 'style', 'inert', 'tabindex', 'scene', 'render', 'other', 'childList', 'text', 'same'];
export const TICK_MS = 1000 / 120;
export const DRIVERS = { scroll: 'S', window: 'W', morph: 'M' };

/** Installs window.__fwr (idempotent while running). Returns 'installed' | 'already installed'. */
export const PROBE_STD_JS = `(() => {
  if (window.__fwr && !window.__fwr.stopped) return 'already installed';
  const R1 = (v) => Math.round(v * 10) / 10, R2 = (v) => Math.round(v * 100) / 100;
  const now = () => performance.now();
  const TYPES = ${JSON.stringify(MUT_TYPES)};
  const TI = {}; TYPES.forEach((k, i) => { TI[k] = i; });
  const rAF0 = window.requestAnimationFrame;
  const rAF = rAF0.bind(window);
  const P = window.__fwr = { v: 1, probe: 'std', t0: R1(now()), frames: [], batches: [], crossings: [], marks: {}, stopped: false };
  let self = 0;
  const desc = (e) => {
    if (!e || !e.tagName) return String(e && e.nodeName || '?');
    if (e.id) return '#' + e.id;
    let c = ''; for (const x of e.classList || []) if (!/^svelte-/.test(x)) { c = x; break; }
    return (e.tagName.toLowerCase() + (c ? '.' + c : '')).slice(0, 60);
  };
  // page rAF JS: sum the sync time of the page's own callbacks per rAF timestamp
  const js = new Map();
  window.requestAnimationFrame = function (cb) {
    return rAF((ts) => { const a = now(); try { return cb(ts); } finally { js.set(ts, (js.get(ts) || 0) + now() - a); } });
  };
  // mutations: one row per observer batch, [deliveredAt, ...counts by TYPES, otherAttrs|0]
  const mo = new MutationObserver((recs) => {
    const a = now();
    const c = new Array(TYPES.length).fill(0);
    let other = 0;
    const next = new Map(); // target -> {attr: value after this record}: walk backwards to know each record's new value
    const y = Math.round(scrollY), cr = [];
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      if (r.type === 'childList') { c[TI.childList] += r.addedNodes.length + r.removedNodes.length; continue; }
      if (r.type === 'characterData') { c[TI.text]++; continue; }
      const el = r.target, name = r.attributeName;
      let m = next.get(el); if (!m) next.set(el, (m = {}));
      const nv = name in m ? m[name] : el.getAttribute(name);
      m[name] = r.oldValue;
      if (nv === r.oldValue) { c[TI.same]++; continue; }
      let k;
      if ((name === 'src' || name === 'srcset') && (el.tagName === 'IMG' || el.tagName === 'SOURCE')) k = 'src';
      else if (name === 'class') k = 'class';
      else if (name === 'style') k = 'style';
      else if (name === 'inert') k = 'inert';
      else if (name === 'tabindex') k = 'tabindex';
      else if (name === 'data-start-selling-scene') k = 'scene';
      else if (name === 'data-start-selling-render') k = 'render';
      else { k = 'other'; (other ||= {})[name] = (other[name] || 0) + 1; }
      c[TI[k]]++;
      if (k === 'scene' || k === 'render') cr.push([R1(a), k, desc(el), nv, y]);
      else if (k === 'inert') cr.push([R1(a), k, desc(el), nv === null ? 'removed' : 'set', y]);
      else if (k === 'class') {
        const was = new Set((r.oldValue || '').split(/\\s+/).filter(Boolean)), is = new Set((nv || '').split(/\\s+/).filter(Boolean));
        for (const t of is) if (!was.has(t) && !/^svelte-/.test(t)) cr.push([R1(a), 'class', desc(el), '+' + t, y]);
        for (const t of was) if (!is.has(t) && !/^svelte-/.test(t)) cr.push([R1(a), 'class', desc(el), '-' + t, y]);
      }
    }
    for (let i = cr.length - 1; i >= 0; i--) P.crossings.push(cr[i]); // record order
    P.batches.push([R1(a), ...c, other]);
    self += now() - a;
  });
  mo.observe(document, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
  const onCv = (e) => { const a = now(); P.crossings.push([R1(a), 'cv', desc(e.target), e.skipped ? 'skipped' : 'rendered', Math.round(scrollY)]); self += now() - a; };
  document.addEventListener('contentvisibilityautostatechange', onCv, true);
  // nav / morph element for m (cached; re-queried when it leaves the document)
  let mEl = [];
  const morphEls = () => {
    if (!mEl.length || mEl.some((e) => !e.isConnected)) mEl = [document.querySelector('header.start-selling-top-nav'), document.querySelector('.start-selling-morph-backdrop') || document.querySelector('.start-selling-morph')].filter(Boolean);
    return mEl;
  };
  let lastT = null, lastY = Math.round(scrollY);
  const loop = (t) => {
    if (P.stopped) return;
    const a = now();
    let m = null;
    for (const e of morphEls()) { const v = e.style.getPropertyValue('--morph'); if (v !== '') { m = Math.round(parseFloat(v) * 1000) / 1000; break; } }
    const y = Math.round(scrollY);
    const j = lastT === null ? null : js.get(lastT) || 0;
    if (lastT !== null) js.delete(lastT);
    P.frames.push([R1(t), lastT === null ? null : R1(t - lastT), lastY, y, innerHeight, m, j === null ? null : R2(j), R2(self + now() - a)]);
    self = 0; lastT = t; lastY = y;
    rAF(loop);
  };
  rAF(loop);
  P.mark = (name, edge) => { const t = now(); try { performance.mark('fwr:' + name + ':' + edge); } catch (e) {} if (edge === 'start') P.marks[name] = [R1(t)]; else if (P.marks[name]) P.marks[name][1] = R1(t); return t; };
  P.stop = () => { P.stopped = true; mo.disconnect(); document.removeEventListener('contentvisibilityautostatechange', onCv, true); window.requestAnimationFrame = rAF0; };
  return 'installed';
})()`;

/** Page facts before the driver starts (no layout beyond scrollHeight). clock maps the page's performance.now()
 *  (frames, marks) to its wall clock (U7, research/architecture/unknowns-validity.md); settings: what a page can
 *  read of the device settings (U9; the rest is filled in as 'unknown' by iphone-run.mjs). */
export const PRE_JS = `(() => {
  let anims = null;
  try { const a = document.getAnimations(); const by = {}; for (const x of a) { const k = x.timeline ? x.timeline.constructor.name : 'none'; by[k] = (by[k] || 0) + 1; } anims = { total: a.length, byTimeline: by }; } catch (e) { anims = { error: String(e) }; }
  const mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return 'unknown'; } };
  const settings = { reducedMotion: mm('(prefers-reduced-motion: reduce)'), reducedTransparency: mm('(prefers-reduced-transparency: reduce)'), contrastMore: mm('(prefers-contrast: more)'), dark: mm('(prefers-color-scheme: dark)'), hardwareConcurrency: navigator.hardwareConcurrency ?? 'unknown' };
  return { href: location.href, ua: navigator.userAgent, vw: innerWidth, vh0: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight, maxY: document.documentElement.scrollHeight - innerHeight, y0: Math.round(scrollY), anims,
    clock: { wallMs: Date.now(), perfMs: Math.round(performance.now() * 10) / 10 }, settings };
})()`;

/** State at scroll start (just before the probe and the driver; may read layout). This page's morph panel by
 *  default (iphone-runner's winrun: mounted? how many of its images have a src?); `--state <file.js>` adds the
 *  value of an owner's own expression as `stateAtStart.custom`. */
export const STATE_START_JS = `(() => {
  const p = document.querySelector('.start-selling-morph-panel');
  return { panel: !!p, panelInert: p ? p.hasAttribute('inert') : null, panelImg: p ? p.querySelectorAll('img').length : 0, panelImgSrc: p ? p.querySelectorAll('img[src]').length : 0 };
})()`;

/** Load-frame log from the reconnect after the reload through the settle (winrun's `early`): [t, dt, y] per rAF. */
export const EARLY_JS = `(() => { const E = window.__fwrEarly = { t0nav: Math.round(performance.now()), frames: [] }; let l = performance.now();
  const f = (t) => { if (E.stop) return; E.frames.push([Math.round(t * 10) / 10, Math.round((t - l) * 10) / 10, Math.round(scrollY)]); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); return 'ok'; })()`;

/** Same-origin scripts and stylesheets the page loaded (for the served-hash record, read after the run). */
export const RESOURCES_JS = `(() => { const u = new Set(); try { for (const e of performance.getEntriesByType('resource')) if (/\\.(m?js|css)$/.test(new URL(e.name).pathname)) u.add(e.name); } catch (e) {}
  for (const s of document.querySelectorAll('script[src]')) u.add(s.src); for (const l of document.querySelectorAll('link[rel=stylesheet][href], link[rel=modulepreload][href]')) u.add(l.href);
  return [...u].filter((x) => { try { return new URL(x).origin === location.origin; } catch (e) { return false; } }).sort(); })()`;

// ---- drivers: async (P, o) => driverResult; P = window.__fwr ------------------------------------------
const SLEEP = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms));`;
// The calibrated `iphone.mjs scroll` steps (research/cpu-throttle-calibration): scrollBy 250 px smooth every 300 ms.
const STEPS = `const steps = async (stopAt) => { const s = performance.now(); while (scrollY < stopAt && performance.now() - s < o.maxScrollMs) { window.scrollBy({ top: 250, behavior: 'smooth' }); await sleep(300); } };`;
export const DRIVER_JS = {
  scroll: `async (P, o) => { ${SLEEP} ${STEPS}
    P.mark('idle', 'start'); await sleep(o.idleMs); P.mark('idle', 'end');
    const maxY = document.documentElement.scrollHeight - innerHeight;
    P.mark('scroll', 'start'); await steps(maxY - 5); P.mark('scroll', 'end');
    P.mark('bottom', 'start'); await sleep(o.bottomMs); P.mark('bottom', 'end');
    return { maxY, finalY: Math.round(scrollY) };
  }`,
  window: `async (P, o) => { ${SLEEP} ${STEPS}
    if (o.from > 0) { window.scrollTo({ top: o.from, behavior: 'instant' }); await sleep(o.settleAtMs); }
    P.mark('idle', 'start'); await sleep(o.idleMs); P.mark('idle', 'end');
    const maxY = document.documentElement.scrollHeight - innerHeight;
    const stopAt = Math.min(o.to, maxY - 5);
    P.mark('scroll', 'start'); await steps(stopAt); P.mark('scroll', 'end');
    P.mark('hold', 'start'); await sleep(o.holdMs); P.mark('hold', 'end');
    const yHold = Math.round(scrollY);
    if (o.sentinelMs > 0) { window.scrollTo({ top: maxY, behavior: 'instant' }); P.mark('sentinel', 'start'); await sleep(o.sentinelMs); P.mark('sentinel', 'end'); }
    return { maxY, stopAt, yHold, finalY: Math.round(scrollY) };
  }`,
  morph: `async (P, o) => { ${SLEEP}
    if (typeof window.__fwMorphDrive !== 'function') throw new Error('no window.__fwMorphDrive on this page (' + typeof window.__fwMorphDrive + '): the morph driver needs a build that defines it (fix-nav-morph overlays)');
    window.__fwMD = null;
    P.mark('drive', 'start');
    window.__fwMorphDrive({ hold: o.holdMs, cycles: o.cycles });
    const s = performance.now();
    while (!window.__fwMD && performance.now() - s < o.maxDriveMs) await sleep(250);
    P.mark('drive', 'end');
    if (!window.__fwMD) throw new Error('__fwMorphDrive did not finish in ' + Math.round(o.maxDriveMs / 1000) + ' s');
    const r = typeof window.__fwMD === 'string' ? JSON.parse(window.__fwMD) : window.__fwMD;
    return { driver: r, finalY: Math.round(scrollY) };
  }`,
};

/** The whole timed part as one expression: install the probe, record PRE, run the driver, stop, stash the result
 *  as a JSON string in window.__fwrOut (read in chunks: RESULT_LEN_JS / resultChunkJs). Returns 'started'. */
export function startJs(driver, opts, { customStateJs = null } = {}) {
  if (!DRIVER_JS[driver]) throw new Error(`unknown driver ${driver}`);
  return `(() => {
  window.__fwrOut = undefined; window.__fwrState = 'running';
  const E = window.__fwrEarly; let early = null; if (E) { E.stop = true; early = { t0nav: E.t0nav, frames: E.frames }; }
  const pre = ${PRE_JS};
  const stateAtStart = ${STATE_START_JS};
  ${customStateJs ? `try { stateAtStart.custom = (${customStateJs}); } catch (e) { stateAtStart.custom = { error: String(e && e.message || e) }; }` : ''}
  const topsOf = (list) => { const o = {}; for (const [id, sel] of list) { try { const e = document.querySelector(sel); o[id] = e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; } catch (x) { o[id] = null; } } return o; };
  const o = ${JSON.stringify(opts)};
  const tops = o.tops && o.tops.length ? topsOf(o.tops) : null;
  ${PROBE_STD_JS};
  const P = window.__fwr;
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  (async () => {
    let res = null, err = null;
    try { res = await (${DRIVER_JS[driver]})(P, o); } catch (e) { err = String(e && e.message || e); }
    await settle();
    P.stop();
    const topsPost = tops ? topsOf(o.tops) : null;
    const post = { docH: document.documentElement.scrollHeight, vh: innerHeight, finalY: Math.round(scrollY), href: location.href };
    window.__fwrOut = JSON.stringify({ err, pre, stateAtStart, early, post, tops, topsPost, driverResult: res, frames: P.frames, batches: P.batches, crossings: P.crossings, marks: P.marks, t0: P.t0 });
    window.__fwrState = err ? 'error' : 'done';
  })();
  return 'started';
})()`;
}
export const STATE_JS = `window.__fwrState || null`;
export const RESULT_LEN_JS = `(window.__fwrOut || '').length`;
export const CHUNK = 400000;
export const resultChunkJs = (i) => `window.__fwrOut.slice(${i}, ${i + CHUNK})`;

// ---- Node side: pure -------------------------------------------------------------------------------
/** Row index k with t[k-1] <= x < t[k] (frames sorted by t); null before the first frame's gap or after the last. */
export function frameIndexAt(frames, x) {
  let lo = 1, hi = frames.length - 1, ans = null;
  if (frames.length < 2 || x < frames[0][0] || x >= frames[frames.length - 1][0]) return null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (frames[mid][0] > x) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
  return ans;
}

/** Observer batches -> sparse per-frame counts: {types, counts: [[k, ...n]], otherAttrs: [[k, {attr: n}]], outside}. */
export function bucketMutations(frames, batches) {
  const n = MUT_TYPES.length, rows = new Map(), other = new Map();
  const outside = new Array(n).fill(0);
  for (const b of batches) {
    const k = frameIndexAt(frames, b[0]);
    const c = b.slice(1, 1 + n), o = b[1 + n];
    if (k === null) { c.forEach((v, i) => { outside[i] += v; }); continue; }
    const row = rows.get(k) || new Array(n).fill(0);
    c.forEach((v, i) => { row[i] += v; });
    rows.set(k, row);
    if (o) { const m = other.get(k) || {}; for (const [a, v] of Object.entries(o)) m[a] = (m[a] || 0) + v; other.set(k, m); }
  }
  const keys = [...rows.keys()].sort((a, b) => a - b);
  return { types: MUT_TYPES, counts: keys.map((k) => [k, ...rows.get(k)]), otherAttrs: [...other.keys()].sort((a, b) => a - b).map((k) => [k, other.get(k)]), outside };
}

/** Page crossing rows [t, kind, id, value, y] (record order) -> [{frame, t, y, kind, id, value, src}] in time order. */
export function placeCrossings(frames, rows) {
  return [...rows].sort((a, b) => a[0] - b[0]) // stable: same-time rows keep their record order
    .map(([t, kind, id, value, y]) => ({ frame: frameIndexAt(frames, t), t, y, kind, id, value, src: 'effect' }));
}

export const ticks = (dt) => Math.round(dt / TICK_MS);
function phaseSum(fr) {
  const d = fr.map((f) => f[1]);
  const tot = d.reduce((a, b) => a + b, 0);
  let max = 0, maxY = null;
  for (const f of fr) if (f[1] > max) { max = f[1]; maxY = f[3]; }
  return { frames: d.length, fps: d.length ? Math.round((10 * d.length) / (tot / 1000 || 1)) / 10 : null, k5: d.filter((x) => ticks(x) >= 5).length, k7: d.filter((x) => ticks(x) >= 7).length,
    gt34: d.filter((x) => x > 34).length, gt50: d.filter((x) => x > 50).length, max, maxY };
}
/** The worst frame of a phase and its +-2 neighbours (dt and yEnd), by row index into frames. */
function worstWithNeighbours(frames, a, b) {
  let w = null;
  frames.forEach((f, k) => { if (f[1] !== null && f[0] >= a && f[0] <= b && (w === null || f[1] > frames[w][1])) w = k; });
  if (w === null) return null;
  const nb = [];
  for (let k = Math.max(1, w - 2); k <= Math.min(frames.length - 1, w + 2); k++) nb.push([k - w, frames[k][1], frames[k][3]]);
  return { frame: w, dt: frames[w][1], y: frames[w][3], neighbours: nb };
}
/** Morph tweens: the first 3 dts after each m leaves a held state (0 or 1). From our frames' m, else the driver's
 *  own frames ([t, dt, y, m]). */
export function tweenStarts(frames, driverFrames = null) {
  // an unset --morph (null) is m = 0: the nav has no inline value until the first tween
  let src = frames.some((f) => f[5] !== null) ? frames.filter((f) => f[1] !== null).map((f) => [f[1], f[5] ?? 0]) : [];
  if (!src.length && driverFrames) src = driverFrames.slice(1).map((f) => [f[1], f[3]]);
  const out = [];
  for (let i = 1; i < src.length; i++) {
    const p = src[i - 1][1], m = src[i][1];
    if ((p <= 0.001 || p >= 0.999) && m > 0.001 && m < 0.999) out.push({ from: p >= 0.999 ? 1 : 0, dts: src.slice(i, i + 3).map((x) => x[0]) });
  }
  return out;
}

/** Counts per phase (frames whose t lies in the mark window) and every k>=5 frame with what landed in its gap and
 *  the previous one. Medians, tick histograms, IQR, HL shifts: tools/lib T3, not here. */
export function summarize(doc) {
  const fr = doc.frames.filter((f) => f[1] !== null);
  const phases = {};
  for (const [name, [a, b]] of Object.entries(doc.marks)) if (b !== undefined) phases[name] = { ...phaseSum(fr.filter((f) => f[0] >= a && f[0] <= b)), worst: worstWithNeighbours(doc.frames, a, b) };
  const counts = new Map(doc.mutations.counts.map(([k, ...c]) => [k, c]));
  const named = (k) => { const c = counts.get(k); if (!c) return {}; const o = {}; c.forEach((v, i) => { if (v) o[MUT_TYPES[i]] = v; }); return o; };
  const phaseOf = (t) => Object.entries(doc.marks).find(([, [a, b]]) => b !== undefined && t >= a && t <= b)?.[0] ?? null;
  const slow = [];
  doc.frames.forEach((f, k) => {
    if (f[1] === null || ticks(f[1]) < 5) return;
    slow.push({ frame: k, t: f[0], dt: f[1], ticks: ticks(f[1]), yStart: f[2], yEnd: f[3], phase: phaseOf(f[0]), rafJsMs: f[6], probeMs: f[7],
      mut: named(k), mutPrev: named(k - 1), crossings: doc.crossings.filter((c) => c.frame === k || c.frame === k - 1).map((c) => `${c.frame === k ? '' : '<'}${c.kind} ${c.id} ${c.value}`) });
  });
  const tot = new Array(MUT_TYPES.length).fill(0);
  for (const [, ...c] of doc.mutations.counts) c.forEach((v, i) => { tot[i] += v; });
  const probeMax = Math.max(0, ...doc.frames.map((f) => f[7] || 0));
  const early = doc.early ? (() => { const d = doc.early.frames.slice(1).map((x) => x[1]); return { t0nav: doc.early.t0nav, frames: d.length, k5: d.filter((x) => ticks(x) >= 5).length, k7: d.filter((x) => ticks(x) >= 7).length, max: Math.max(0, ...d), slow: doc.early.frames.slice(1).filter((x) => ticks(x[1]) >= 5).map((x) => `${x[1]}@t${x[0]}`) }; })() : null;
  const tweens = doc.morph ? tweenStarts(doc.frames, doc.morph.frames) : null;
  return { phases, early, tweens, slow, mutationTotals: Object.fromEntries(MUT_TYPES.map((k, i) => [k, tot[i]])), crossings: doc.crossings.length, probeMsMax: probeMax, framesProbeOver1ms: doc.frames.filter((f) => (f[7] || 0) > 1).length };
}

/** Raw page result -> the run document's measurement part. */
export function buildDoc(raw) {
  const frames = raw.frames;
  const doc = { fields: FIELDS, frames, marks: raw.marks, mutations: bucketMutations(frames, raw.batches), crossings: placeCrossings(frames, raw.crossings) };
  doc.summary = summarize({ ...doc, early: raw.early, morph: raw.driverResult?.driver || null });
  return doc;
}
