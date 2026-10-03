// carousel-leaver P-087 paint-order probe (Chrome headless, 430x932 DPR 3 mobile + touch, as clp.mjs). No timing.
// Per arm: load, centre the carousel at 0.5 vh (VOID if not in view), catch a slide whose leaver has the target pathname
// (the first arm names it, F-176), pause every carousel animation and hold the rotator's 220 ms timer (as clp.mjs), then
// for t in TS: currentTime = t, two rAFs, and
//   (a) DOMSnapshot.captureSnapshot with includePaintOrder: every layout node whose bounds overlap the carousel's border
//       box (> 0.5 x 0.5 CSS px) and whose own computed opacity is not 0, with its global paint-order index; `rel` keeps
//       only nodes that can paint inside the carousel box (VIS below; text: its parent), `relAll` keeps all. Carousel
//       imgs are keyed by role (slot index: L F1 F2 F3 N during the slide, P0-P4 after it), every other node by its
//       DOM path (nodeName[k] per level, k = index among same-named siblings). Relation of a pair = sign(paint order a
//       - paint order b): +1 a paints after (over) b, 0 painted together, -1 under. Pairs with at least one carousel img
//       whose two boxes overlap each other (> 0.5 x 0.5 CSS px). overLead: the overlapping nodes painted after the leaver.
//   (b) lens crop: the leaver forced opaque (inline opacity 0.999 !important, which outranks the animation, CSS Cascade
//       5 §6.1), two rAFs, a crop of the carousel border box +- 4 CSS px (full-viewport capture cropped in Node, as
//       clp.mjs), then the inline opacity is removed. Shows which face is on top in every overlap lens at full strength.
// then the held timer is released (swap), two rAFs, and (a) once more as t = post.
// At the end every arm pair is compared: relations that differ per t (rel), and lens crops per t (lens: n8/any/max).
// node pord.mjs --arms A=serve-a.json,F=serve-f.json,... --out dir [--target /path.jpg]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngPixels, pngEncode, crop, cmp } from './png.mjs';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((s) => { const [k, f] = s.split('='); const st = JSON.parse(readFileSync(f, 'utf8')); return { k, url: st.url || `https://localhost:${st.port}/` }; });
const OUT = arg('--out'); if (OUT) mkdirSync(OUT, { recursive: true });
let TARGET = arg('--target', null);
// --view WxHxDPR, optional trailing d = desktop (mobile false, no touch); default the phone setting all P-086 runs used
const VIEW = arg('--view', '430x932x3'), DESK = VIEW.endsWith('d'); const [VW, VH, VD] = VIEW.replace(/d$/, '').split('x').map(Number);
const TS = [0, 17, 33, 50, 67, 83, 100, 133, 167, 200, 220];
const HOLD = `(() => { const st = window.setTimeout.bind(window); window.__hold = false; window.__held = [];
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st(fn, ms, ...a);
    return st(() => { if (window.__hold) window.__held.push(() => fn(...a)); else fn(...a); }, ms); }; })()`;
const CAR = `document.querySelector('#people .start-selling-avatars.is-carousel')`;
const PATH = `(i) => { try { return new URL(i.currentSrc || i.src).pathname; } catch { return ''; } }`;
const SLIDING = `((c) => !!(c && (c.querySelector('img.is-exit') || c.classList.contains('is-sliding'))))(${CAR})`;
const LEAD = `((c) => c && c.querySelector('img.is-exit, img.st5-lead'))(${CAR})`;
const CATCH = (target, timeout) => `new Promise((res) => { const P = ${PATH}; const t0 = performance.now(); let was = ${SLIDING};
  const tick = () => { const on = ${SLIDING}; const lead = ${LEAD};
    if (on && !was && lead && (${JSON.stringify(target)} === null || P(lead) === ${JSON.stringify(target)})) {
      const c = ${CAR}; window.__hold = true; window.__lead = lead;
      window.__anims = [...c.querySelectorAll('img')].flatMap((i) => i.getAnimations()); window.__anims.forEach((a) => a.pause());
      return res({ ok: true, lead: P(lead), srcs: [...c.querySelectorAll('img')].map(P), cls: [...c.querySelectorAll('img')].map((i) => i.className), n: window.__anims.length, waited: Math.round(performance.now() - t0) }); }
    was = on; if (performance.now() - t0 > ${timeout}) return res({ ok: false }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })`;
const RAF2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;
// the sliding variant at this width? (desktop pass: a carousel that is missing, not displayed or 0-size replaces the pass, README P-087 C4/C5)
const VARIANT = `JSON.stringify(((c) => { if (!c) return { exists: false }; const cs = getComputedStyle(c), r = c.getBoundingClientRect(); return { exists: true, display: cs.display, visibility: cs.visibility, w: r.width, h: r.height, imgs: c.querySelectorAll("img").length, cls: c.className, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio }; })(${CAR}))`;
// VIS (page side): DOM path keys (pord's scheme) of the elements that can paint inside the carousel box right now:
// effective opacity (product over ancestors) > 0, visibility visible, and the border-box rect clipped by every ancestor
// with overflow other than visible or contain paint (up to a position: fixed element) overlaps the carousel's clipped
// rect by > 0.5 x 0.5 CSS px. Paint order between nodes that cannot paint there draws nothing (smoke run: hero columns
// under an opacity-0 / clipped ancestor were listed over the leaver).
const VIS = `JSON.stringify((() => { const car = ${CAR};
  const key = (n) => { const parts = []; for (let c = n; c; c = c.parentNode) { const p = c.parentNode; const k = p ? [...p.childNodes].filter((s) => s.nodeName === c.nodeName).indexOf(c) : 0; parts.push(c.nodeName + '[' + k + ']'); } return parts.reverse().join('/'); };
  const clipped = (el) => { const r0 = el.getBoundingClientRect(); let r = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom }; let fixed = getComputedStyle(el).position === 'fixed';
    for (let a = el.parentElement; a && !fixed; a = a.parentElement) { const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || /paint|strict|content/.test(cs.contain)) { const q = a.getBoundingClientRect(); r = { l: Math.max(r.l, q.left), t: Math.max(r.t, q.top), r: Math.min(r.r, q.right), b: Math.min(r.b, q.bottom) }; }
      if (cs.position === 'fixed') fixed = true; }
    return r; };
  const op = (el) => { let o = 1; for (let a = el; a; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o; };
  const C = clipped(car); const out = [];
  for (const el of document.querySelectorAll('*')) { const r0 = el.getBoundingClientRect(); if (r0.right - r0.left <= 0 || r0.bottom - r0.top <= 0) continue;
    if (Math.min(r0.right, C.r) - Math.max(r0.left, C.l) <= 0.5 || Math.min(r0.bottom, C.b) - Math.max(r0.top, C.t) <= 0.5) continue;
    const r = clipped(el); if (Math.min(r.r, C.r) - Math.max(r.l, C.l) <= 0.5 || Math.min(r.b, C.b) - Math.max(r.t, C.t) <= 0.5) continue;
    if (getComputedStyle(el).visibility !== 'visible' || op(el) <= 0) continue; out.push(key(el)); }
  out.push(key(document), key(document.documentElement));
  return out; })())`;

export function relations(snap, visKeys = null) {
  const d = snap.documents[0], S = snap.strings, N = d.nodes, Lo = d.layout;
  const n = N.parentIndex.length, name = (i) => S[N.nodeName[i]] || '';
  const attr = (i, k) => { const a = (N.attributes && N.attributes[i]) || []; for (let j = 0; j < a.length; j += 2) if (S[a[j]] === k) return S[a[j + 1]]; return null; };
  const kids = Array.from({ length: n }, () => []); for (let i = 0; i < n; i++) if (N.parentIndex[i] >= 0) kids[N.parentIndex[i]].push(i);
  const isAnc = (a, i) => { for (let p = N.parentIndex[i]; p >= 0; p = N.parentIndex[p]) if (p === a) return true; return false; };
  const people = [...Array(n).keys()].find((i) => attr(i, 'id') === 'people');
  const car = [...Array(n).keys()].find((i) => /\bstart-selling-avatars\b/.test(attr(i, 'class') || '') && /\bis-carousel\b/.test(attr(i, 'class') || '') && people != null && isAnc(people, i));
  if (car == null) throw new Error('pord: carousel node not found');
  const imgs = kids[car].filter((i) => name(i) === 'IMG');
  const sliding = imgs.some((i) => /\b(is-exit)\b/.test(attr(i, 'class') || '')) || /\bis-sliding\b/.test(attr(car, 'class') || '');
  const ROLES = sliding ? ['L', 'F1', 'F2', 'F3', 'N'] : ['P0', 'P1', 'P2', 'P3', 'P4'];
  const role = new Map(imgs.map((i, k) => [i, ROLES[k] || `X${k}`]));
  const pathKey = (i) => { const parts = [];
    for (let c = i; c >= 0; c = N.parentIndex[c]) { const p = N.parentIndex[c]; const nm = name(c); const k = p >= 0 ? kids[p].filter((s) => name(s) === nm).indexOf(c) : 0; parts.push(`${nm}[${k}]`); }
    return parts.reverse().join('/'); };
  const key = (i) => (role.has(i) ? role.get(i) : pathKey(i));
  // visible: the page-side VIS check passed this element (text: its parent element), or no check was given
  const visible = (i) => !visKeys || visKeys.has(pathKey(name(i) === '#text' ? N.parentIndex[i] : i));
  const li = new Map(Lo.nodeIndex.map((ni, k) => [ni, k]));
  const st = (k, j) => (Lo.styles[k] && Lo.styles[k][j] >= 0 ? S[Lo.styles[k][j]] : null);
  const cb = Lo.bounds[li.get(car)];
  const nodes = [];
  for (let k = 0; k < Lo.nodeIndex.length; k++) {
    const b = Lo.bounds[k], ni = Lo.nodeIndex[k];
    const ox = Math.min(b[0] + b[2], cb[0] + cb[2]) - Math.max(b[0], cb[0]), oy = Math.min(b[1] + b[3], cb[1] + cb[3]) - Math.max(b[1], cb[1]);
    if (ox <= 0.5 || oy <= 0.5) continue;
    if (st(k, 0) === '0') continue;
    nodes.push({ key: key(ni), vis: visible(ni), po: Lo.paintOrders ? Lo.paintOrders[k] : null, opacity: st(k, 0), z: st(k, 1), position: st(k, 2), transform: st(k, 3), bounds: b.map((v) => +v.toFixed(2)), img: role.has(ni), inCar: ni === car || isAnc(car, ni), anc: isAnc(ni, car) });
  }
  const rel = {}, relAll = {};
  for (const a of nodes) for (const b of nodes) {
    if (a.key >= b.key || a.po == null || b.po == null) continue;
    if (!(a.img || b.img)) continue;
    // only pairs whose layout boxes overlap each other: paint order between disjoint boxes draws nothing
    const ax = Math.min(a.bounds[0] + a.bounds[2], b.bounds[0] + b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]), ay = Math.min(a.bounds[1] + a.bounds[3], b.bounds[1] + b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]);
    if (ax <= 0.5 || ay <= 0.5) continue;
    relAll[`${a.key} | ${b.key}`] = Math.sign(a.po - b.po);
    if (a.vis && b.vis) rel[`${a.key} | ${b.key}`] = Math.sign(a.po - b.po);
  }
  const lead = nodes.find((x) => x.key === (sliding ? 'L' : 'P0'));
  return { sliding, carBounds: cb, nodes, rel, relAll, overLead: lead ? Object.entries(rel).filter(([k, v]) => (k.startsWith(lead.key + ' | ') && v < 0) || (k.endsWith(' | ' + lead.key) && v > 0)).map(([k]) => k) : null };
}

const fullKept = new Set();
async function shot(page, file) {
  const r = JSON.parse(await page.eval(`JSON.stringify((() => { const r = ${CAR}.getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, vw: innerWidth }; })())`));
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64'); const P = pngPixels(buf); const k = P.w / r.vw;
  const C = crop(P, Math.floor(r.x * k), Math.floor(r.y * k), Math.ceil((r.x + r.width) * k), Math.ceil((r.y + r.height) * k), 'carousel');
  writeFileSync(file, pngEncode(C.w, C.h, C.bpp, C.px));
  const pre = file.replace(/-[^-]*\.png$/, ''); if (!fullKept.has(pre)) { fullKept.add(pre); writeFileSync(file.replace(/\.png$/, '.full.png'), buf); }
  return { k, crop: [C.w, C.h], blank: C.blank };
}

if (ARMS.length) {
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/carousel-leaver'), 'pord'), headless: true, windowSize: '1440,900', args: ['--ignore-certificate-errors'] });
  const cdp = await CDP.connect(chrome.wsUrl);
  const res = { tool: 'carousel-leaver pord (P-087)', at: new Date().toISOString(), browser: chrome.browser, view: VIEW, ts: TS, arms: {} };
  const save = () => writeFileSync(join(OUT, 'pord.json'), JSON.stringify(res, null, 1));
  try {
    for (const arm of ARMS) {
      const R = (res.arms[arm.k] = { url: arm.url, rel: {}, nodes: {}, overLead: {}, lens: {} });
      const page = await cdp.newIsolatedPage();
      await page.send('Network.enable');
      await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: VD, mobile: !DESK });
      if (!DESK) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD });
      await gotoAndSettle(page, arm.url, { quietMs: 1500, maxMs: 45000 }); await sleep(1000);
      const center = `(() => { const c = ${CAR}; const r = c.getBoundingClientRect(); window.scrollBy({ top: r.top + r.height / 2 - 0.5 * innerHeight, behavior: 'instant' }); const q = c.getBoundingClientRect(); return { y: scrollY, carTop: q.top, carBottom: q.bottom, vh: innerHeight, inView: q.top >= 0 && q.bottom <= innerHeight }; })()`;
      // repair 1 (C3/C5 void, 2026-10-03): the variant is judged after centring; before it the section is scroll-revealed
      // later and reads visibility hidden at every width. Before centring only existence is required (centring needs it).
      R.variant0 = JSON.parse(await page.eval(VARIANT)); console.log(arm.k, 'variant before centring', JSON.stringify(R.variant0));
      if (!R.variant0.exists) { R.void = 'NOT-VARIANT: no carousel element at this width'; console.log(arm.k, R.void); save(); await page.close(); continue; }
      R.pos = await page.eval(center); await sleep(1500); R.pos2 = await page.eval(center); await sleep(600);
      R.variant = JSON.parse(await page.eval(VARIANT)); console.log(arm.k, 'variant', JSON.stringify(R.variant));
      if (R.variant.display === 'none' || R.variant.visibility !== 'visible' || !(R.variant.w > 0 && R.variant.h > 0)) { R.void = 'NOT-VARIANT: no visible carousel at this width'; console.log(arm.k, R.void); save(); await page.close(); continue; }
      if (!R.pos2.inView) { R.void = 'VOID: carousel not in view'; console.log(arm.k, R.void); save(); await page.close(); continue; }
      const c = await page.eval(CATCH(TARGET, 25000), { timeout: 35000 });
      R.catch = c; console.log(arm.k, 'catch', JSON.stringify(c));
      if (!c.ok) { R.void = 'VOID: no slide caught'; save(); await page.close(); continue; }
      if (TARGET === null) TARGET = c.lead;
      for (const t of TS) {
        R.nodes[t] = await page.eval(`(() => { window.__anims.forEach((a) => { a.currentTime = ${t}; }); return window.__anims.map((a) => a.animationName + ':' + Math.round(a.currentTime)).join(','); })()`);
        await page.eval(RAF2);
        const vis = new Set(JSON.parse(await page.eval(VIS)));
        const snap = await page.send('DOMSnapshot.captureSnapshot', { computedStyles: ['opacity', 'z-index', 'position', 'transform'], includePaintOrder: true });
        const r = relations(snap, vis); R.rel[t] = r.rel; R.relAll = R.relAll || {}; R.relAll[t] = r.relAll; R.overLead[t] = r.overLead; R.nodes[t] = { anims: R.nodes[t], nodes: r.nodes };
        await page.eval(`(window.__lead.style.setProperty('opacity', '0.999', 'important'), 1)`); await page.eval(RAF2);
        R.lens[t] = await shot(page, join(OUT, `lens-${arm.k}-${t}.png`));
        await page.eval(`(window.__lead.style.removeProperty('opacity'), 1)`);
      }
      await page.eval(`(() => { window.__anims.forEach((a) => { a.currentTime = 220; }); window.__hold = false; const h = window.__held.splice(0); h.forEach((f) => f()); window.__hold = true; return h.length; })()`);
      await page.eval(RAF2);
      const vis = new Set(JSON.parse(await page.eval(VIS)));
      const snap = await page.send('DOMSnapshot.captureSnapshot', { computedStyles: ['opacity', 'z-index', 'position', 'transform'], includePaintOrder: true });
      const r = relations(snap, vis); R.rel.post = r.rel; R.relAll.post = r.relAll; R.overLead.post = r.overLead; R.nodes.post = { nodes: r.nodes };
      console.log(arm.k, 'overLead', JSON.stringify(R.overLead), 'blank lens', Object.values(R.lens).filter((x) => x.blank).length);
      save(); await page.close();
    }
  } finally { save(); cdp.close(); await chrome.close(); }
  const keys = ARMS.map((a) => a.k).filter((k) => !res.arms[k].void); res.cmp = {};
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = res.arms[keys[i]], b = res.arms[keys[j]], P = `${keys[i]}~${keys[j]}`; const out = (res.cmp[P] = { rel: {}, lens: {} });
    for (const t of [...TS, 'post']) {
      const ra = a.rel[t] || {}, rb = b.rel[t] || {}; const diff = [];
      for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) if (ra[k] !== rb[k]) diff.push(`${k}: ${ra[k] ?? 'absent'} vs ${rb[k] ?? 'absent'}`);
      const xa = (a.relAll || {})[t] || {}, xb = (b.relAll || {})[t] || {}; let dAll = 0;
      for (const k of new Set([...Object.keys(xa), ...Object.keys(xb)])) if (xa[k] !== xb[k]) dAll++;
      out.rel[t] = { pairs: Object.keys(ra).length, differ: diff.length, diff, differAllNodes: dAll };
      if (t !== 'post') try { out.lens[t] = cmp(join(OUT, `lens-${keys[i]}-${t}.png`), join(OUT, `lens-${keys[j]}-${t}.png`)); } catch (e) { out.lens[t] = { error: String(e.message || e) }; }
    }
    console.log(P, 'rel differ', [...TS, 'post'].map((t) => out.rel[t].differ).join('/'), '| lens n8', TS.map((t) => out.lens[t]?.n8 ?? '-').join('/'));
  }
  save(); console.log('EXIT-OK');
}
