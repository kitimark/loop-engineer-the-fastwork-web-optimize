#!/usr/bin/env node
// gpu-props compositor census (de-gpu, T-030). COUNTS ONLY, no timing claim.
//
// Parks a mobile-emulated Chrome (430x932, DPR 3, touch, no CPU throttle) at a series of scroll positions on
// an already running mirror and, per position, over a fixed idle window:
//   - main-thread lifecycle frames: trace PrePaint / UpdateLayoutTree / Layout / Paint / Layerize event counts
//     (a frame that ran the main-thread lifecycle has one PrePaint);
//   - compositor frames: BeginFrame / DrawFrame (disabled-by-default-devtools.timeline.frame);
//   - running animations from document.getAnimations(): type (CSSAnimation / CSSTransition), name or property,
//     target, in-viewport or not;
//   - Blink's own compositing decision for each animation: the `Animation` trace events (blink.animations)
//     carry args.data.compositeFailed (CompositorAnimations::FailureReasons bit mask) and unsupportedProperties.
// rAF-driven style writes are not animations: they show up only as main-thread frames with no running
// non-composited animation to explain them.
//
// Run inside a shared-lane hold (functional, times nothing):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner de-gpu -- \
//     sh -c 'node tools/serve.mjs --root site --port auto --https --vendors=local --state out/gpu-props/serve.json & S=$!; \
//            node tools/wait.mjs serve out/gpu-props/serve.json --pid $S && \
//            node research/gpu-props/tools/comp-census.mjs --state out/gpu-props/serve.json --out out/gpu-props/census.json; \
//            kill $S'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../../tools/lib/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const statePath = arg('--state', 'out/gpu-props/serve.json');
const outPath = arg('--out', 'out/gpu-props/census.json');
const idleMs = Number(arg('--idle', '3000'));
const settleMs = Number(arg('--settle', '1500'));
const step = Number(arg('--step', '932'));
const maxPositions = Number(arg('--max', '40'));
const width = Number(arg('--width', '430')), height = Number(arg('--height', '932')), dpr = Number(arg('--dpr', '3'));
const mobile = arg('--mobile', '1') === '1';
const matrixOnly = process.argv.includes('--matrix-only'); // phase 2 only: no page, no server needed
const ablate = process.argv.includes('--ablate'); // two more idle windows per position: main-thread CSS paused, then SMIL too
const skipMatrix = process.argv.includes('--no-matrix');

const state = matrixOnly ? {} : JSON.parse(readFileSync(join(root, statePath), 'utf8'));
const url = matrixOnly ? null : (state.url || `https://localhost:${state.port}/`);
const profileDir = tempProfileDir(join(root, 'out', 'gpu-props', 'chrome'), 'de-gpu-census');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: `${width},${height}`, args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
try {
  if (matrixOnly) {
    const matrix = await runMatrix(page);
    mkdirSync(dirname(join(root, outPath)), { recursive: true });
    writeFileSync(join(root, outPath), JSON.stringify({ tool: 'research/gpu-props/tools/comp-census.mjs --matrix-only', browser: chrome.browser, matrix }, null, 1));
    console.log(`matrix: ${matrix.length} animations -> ${outPath}`);
  } else {
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await sleep(2000);
  const docH = await page.eval('document.documentElement.scrollHeight');
  const ys = [];
  for (let y = 0; y < docH - height / 2 && ys.length < maxPositions; y += step) ys.push(Math.min(y, docH - height));

  const events = [];
  const offData = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 300 * 1024,
    includedCategories: ['devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', '__metadata'] },
  transferMode: 'ReportEvents' });

  const positions = [];
  for (const y of ys) {
    await page.eval(`window.scrollTo({top: ${y}, behavior: 'instant'})`);
    await sleep(settleMs);
    await page.eval(`performance.mark('gp-start-${y}')`);
    await sleep(idleMs);
    await page.eval(`performance.mark('gp-end-${y}')`);
    const anims = await page.eval(`(() => {
      const vh = innerHeight, out = [];
      for (const a of document.getAnimations()) {
        const t = a.effect && a.effect.target; if (!t) continue;
        const r = t.getBoundingClientRect();
        const props = a.effect.getKeyframes ? [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(p => !['offset','computedOffset','easing','composite'].includes(p))))] : [];
        const timing = a.effect.getTiming ? a.effect.getTiming() : {};
        const cls = (t.getAttribute && (t.getAttribute('class') || '')).split(/\\s+/).filter(c => c && !/^svelte-/.test(c)).slice(0, 3).join('.');
        out.push({ type: a.constructor.name, name: a.animationName || a.transitionProperty || '', id: a.id || '',
          props, state: a.playState, iterations: timing.iterations, duration: timing.duration, easing: timing.easing,
          target: (t.tagName || '').toLowerCase() + (cls ? '.' + cls : '') + (a.effect.pseudoElement || ''),
          inView: r.bottom > 0 && r.top < vh && r.width > 0 && r.height > 0 });
      }
      return out;
    })()`);
    if (ablate) {
      // Window a1: pause every running animation whose keyframes are not all transform/opacity/translate/rotate/scale
      // (Chrome's compositable set minus filter, which a blur keyframe takes off the compositor). Window a2: also pause
      // SMIL (svg.pauseAnimations). Main frames left in a2 come from script (rAF, timers) or animations started later.
      const paused = await page.eval(`(() => {
        const ok = new Set(['transform', 'opacity', 'translate', 'rotate', 'scale']); window.__gpPaused = [];
        for (const a of document.getAnimations()) {
          if (a.playState !== 'running') continue;
          const props = a.effect && a.effect.getKeyframes ? [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(p => !['offset','computedOffset','easing','composite'].includes(p))))] : [];
          if (!props.every(p => ok.has(p))) { a.pause(); window.__gpPaused.push(a); }
        }
        return window.__gpPaused.length;
      })()`);
      await page.eval(`performance.mark('gp-a1start-${y}')`);
      await sleep(idleMs);
      await page.eval(`performance.mark('gp-a1end-${y}')`);
      const svgs = await page.eval(`(() => { let n = 0; for (const s of document.querySelectorAll('svg')) if (s.pauseAnimations && s.querySelector('animate, animateTransform, animateMotion, set')) { s.pauseAnimations(); n++; } return n; })()`);
      await page.eval(`performance.mark('gp-a2start-${y}')`);
      await sleep(idleMs);
      await page.eval(`performance.mark('gp-a2end-${y}')`);
      await page.eval(`(() => { for (const a of window.__gpPaused || []) a.play(); for (const s of document.querySelectorAll('svg')) if (s.unpauseAnimations) s.unpauseAnimations(); })()`);
      positions.push({ y, anims, ablation: { pausedAnimations: paused, pausedSmilSvgs: svgs } });
    } else positions.push({ y, anims });
  }
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
  offData();

  // Bucket trace events by the user-timing marks.
  const marks = new Map();
  for (const e of events) if (e.cat && e.cat.includes('blink.user_timing') && /^gp-(a[12])?(start|end)-/.test(e.name)) marks.set(e.name, e.ts);
  const count = (names, a, b, filt) => events.filter((e) => names.includes(e.name) && e.ts >= a && e.ts < b && (!filt || filt(e))).length;
  // Animation compositing decisions (any phase) per animation id, whole trace.
  const animDecisions = new Map();
  for (const e of events) {
    if (e.name !== 'Animation' || !e.args) continue;
    const d = e.args.data || {};
    const key = e.id2?.local || e.id || d.id;
    const prev = animDecisions.get(key) || {};
    animDecisions.set(key, { ...prev, ...(d.name !== undefined ? { name: d.name } : {}), ...(d.nodeName ? { node: d.nodeName } : {}),
      ...(d.compositeFailed !== undefined ? { compositeFailed: d.compositeFailed } : {}),
      ...(d.unsupportedProperties ? { unsupportedProperties: d.unsupportedProperties } : {}), ...(d.state ? { state: d.state } : {}), firstTs: prev.firstTs ?? e.ts });
  }
  const win = (a, b) => (a === undefined || b === undefined) ? null : { seconds: Math.round((b - a) / 1e4) / 100,
    prePaint: count(['PrePaint'], a, b), styleRecalc: count(['UpdateLayoutTree'], a, b), layout: count(['Layout'], a, b),
    paint: count(['Paint'], a, b), layerize: count(['Layerize'], a, b),
    beginFrame: count(['BeginFrame'], a, b), drawFrame: count(['DrawFrame'], a, b),
    animationEvents: count(['Animation'], a, b) };
  for (const p of positions) {
    p.trace = win(marks.get(`gp-start-${p.y}`), marks.get(`gp-end-${p.y}`));
    if (p.ablation) {
      p.ablation.a1 = win(marks.get(`gp-a1start-${p.y}`), marks.get(`gp-a1end-${p.y}`));
      p.ablation.a2 = win(marks.get(`gp-a2start-${p.y}`), marks.get(`gp-a2end-${p.y}`));
    }
  }
  const result = { tool: 'research/gpu-props/tools/comp-census.mjs', url, browser: chrome.browser, headless: chrome.headless,
    viewport: { width, height, dpr, mobile }, idleMs, settleMs, docH, positions,
    animDecisions: [...animDecisions.entries()].map(([id, v]) => ({ id, ...v })), traceEventCount: events.length };
  // Phase 2: a synthetic matrix, one element per animated property/easing, to read Chrome's own decision
  // (compositeFailed) for each row of the reference table on this exact Chrome build.
  if (!skipMatrix) result.matrix = await runMatrix(page);
  mkdirSync(dirname(join(root, outPath)), { recursive: true });
  writeFileSync(join(root, outPath), JSON.stringify(result, null, 1));
  console.log(`census: ${positions.length} positions, ${events.length} trace events, ${animDecisions.size} animations seen -> ${outPath}`);
  }
} finally {
  await finish();
}

async function runMatrix(page) {
  const rows = [
    ['m-transform', 'transform: translateX(0)', 'transform: translateX(40px)'],
    ['m-transform-pct', 'transform: translateX(0)', 'transform: translateX(50%)'],
    ['m-translate', 'translate: 0', 'translate: 40px'],
    ['m-scale', 'scale: 1', 'scale: 1.2'],
    ['m-rotate', 'rotate: 0deg', 'rotate: 90deg'],
    ['m-opacity', 'opacity: 1', 'opacity: 0.2'],
    ['m-filter-blur', 'filter: blur(0px)', 'filter: blur(8px)'],
    ['m-filter-none-blur', 'filter: none', 'filter: blur(8px)'],
    ['m-filter-brightness', 'filter: brightness(1)', 'filter: brightness(0.5)'],
    ['m-backdrop', 'backdrop-filter: blur(0px)', 'backdrop-filter: blur(8px)'],
    ['m-bgcolor', 'background-color: rgb(255,0,0)', 'background-color: rgb(0,0,255)'],
    ['m-clip-inset', 'clip-path: inset(0 0 0 0)', 'clip-path: inset(0 50% 0 0)'],
    ['m-offset', 'offset-distance: 0%', 'offset-distance: 100%'],
    ['m-custom-reg', '--m-reg: 0', '--m-reg: 1'],
    ['m-width', 'width: 60px', 'width: 90px'],
    ['m-mixed-op-width', 'opacity: 1; width: 60px', 'opacity: 0.2; width: 90px'],
    ['m-mixed-op-blur', 'opacity: 1; filter: blur(0px)', 'opacity: 0.2; filter: blur(8px)'],
    ['m-bgpos', 'background-position: 0% 0', 'background-position: 100% 0'],
    ['m-mask-pos', 'mask-position: 0% 0', 'mask-position: 100% 0'],
    ['m-dashoffset', 'stroke-dashoffset: 0', 'stroke-dashoffset: 100'],
  ];
  const easings = [['m-ease-steps', 'step-end'], ['m-ease-linearfn', 'linear(0, 0.3 20%, 1)'], ['m-ease-cubic', 'cubic-bezier(0.16, 1, 0.3, 1)']];
  let css = '@property --m-reg { syntax: "<number>"; inherits: false; initial-value: 0; }\n'
    + '.b { width: 60px; height: 40px; margin: 4px; background: linear-gradient(90deg, #f00, #00f); background-size: 200% 100%; color: #fff; font: 12px sans-serif; }\n'
    + '.b.m-offset { offset-path: path("M0,0 L40,0"); } .b.m-mask-pos { mask-image: linear-gradient(90deg, #000, transparent); mask-size: 200% 100%; }\n'
    + '.b.m-custom-reg { opacity: calc(1 - var(--m-reg) * 0.5); }\n'
    + 'body { margin: 0; } .sc { height: 120px; overflow: auto; } .sc > .tall { height: 1200px; }\n';
  let html = '';
  for (const [n, a, b] of rows) {
    css += `@keyframes ${n} { from { ${a} } to { ${b} } } .b.${n}.go { animation: ${n} 2s linear infinite alternate; }\n`;
    html += n === 'm-dashoffset' ? `<svg width="80" height="20"><path class="b ${n}" d="M0 10 H80" stroke="#000" stroke-dasharray="10 10"/></svg>` : `<div class="b ${n}">${n}</div>`;
  }
  for (const [n, e] of easings) { css += `@keyframes ${n} { from { transform: translateX(0) } to { transform: translateX(40px) } } .b.${n}.go { animation: ${n} 2s ${e} infinite alternate; }\n`; html += `<div class="b ${n}">${n}</div>`; }
  css += '@keyframes m-sda { from { transform: translateX(0) } to { transform: translateX(40px) } } .b.m-sda-scroll.go { animation: m-sda linear both; animation-timeline: scroll(nearest block); }\n';
  html += '<div class="sc"><div class="tall"><div class="b m-sda-scroll">m-sda-scroll</div></div></div>';
  html += '<div class="b m-waapi-transform">waapi</div><div class="b m-transition-op">tr</div>';
  // Rows start one by one, 120 ms apart, in this order: Blink's Animation trace event names no CSS animation,
  // so the order of first appearance in the trace is what names each row.
  const order = [...rows.map((r) => r[0]), ...easings.map((e) => e[0]), 'm-sda-scroll', 'm-waapi-transform', 'm-transition-op'];
  const doc = `<!doctype html><meta name=viewport content="width=device-width"><style>${css}</style>${html}<script>
    const order = ${JSON.stringify(order)};
    order.forEach((n, i) => setTimeout(() => {
      const el = document.querySelector('.' + n);
      if (n === 'm-waapi-transform') el.animate([{transform:'translateX(0)'},{transform:'translateX(40px)'}], {duration: 2000, iterations: Infinity, id: n});
      else if (n === 'm-transition-op') { el.style.transition = 'opacity 3s'; el.getBoundingClientRect(); el.style.opacity = '0.2'; }
      else el.classList.add('go');
    }, 300 + i * 120));
  <\/script>`;
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', includedCategories: ['blink.animations', 'devtools.timeline', '__metadata'] }, transferMode: 'ReportEvents' });
  await page.send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(doc).toString('base64') });
  await sleep(300 + order.length * 120 + 1500);
  await page.eval(`document.querySelector('.sc').scrollTop = 300`);
  await sleep(1000);
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  off();
  const byId = new Map();
  for (const e of events) {
    if (e.name !== 'Animation' || !e.args) continue;
    const d = e.args.data || {};
    const key = e.id2?.local || e.id || d.id;
    const prev = byId.get(key) || {};
    byId.set(key, { ...prev, ...(d.name ? { traceName: d.name } : {}), ...(d.compositeFailed !== undefined ? { compositeFailed: d.compositeFailed } : {}),
      ...(d.unsupportedProperties ? { unsupportedProperties: d.unsupportedProperties } : {}), firstTs: prev.firstTs ?? e.ts });
  }
  const seen = [...byId.values()].sort((x, y) => x.firstTs - y.firstTs);
  // Name by order only when the counts match; otherwise leave rows unnamed rather than guess.
  return seen.map(({ firstTs, ...v }, i) => ({ ...(seen.length === order.length ? { name: order[i] } : {}), composited: !v.compositeFailed, ...v }));
}

async function finish() {
  await page.close().catch(() => {});
  cdp.close();
  await chrome.close();
}
