// fwreskip r6 (Sim, attribution only; forced sync style+layout, coarse 1 ms clock, relative numbers).
// The ~20 ms flip cost vanished for good after a probe variant in r5, so it is a state. Per action X: reload, jump to
// y3000, wait, flip cost (base), X, flip cost (after). Plus a census of percentage-height boxes in #people (Typed OM
// computed values) with their containing-block chain, taken once before any action.
// usage: PORT=… node cure.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { openTab, sleep } from './simtab.mjs';
import { runAsync } from '../../../tools/lib/wip.mjs';
const out = process.argv[2];
const N = Number(process.env.N || 6);
const ACTIONS = (process.env.ACTIONS || 'none,wait5,peopleH,profileH,peopleHollow,profileHollow').split(',');
const lib = `
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(2); };
const h = document.querySelector(${JSON.stringify(process.env.FLIPSEL || '.hero-track')});
const R = 'data-start-selling-render';
const force = (el) => { const t0 = performance.now(); getComputedStyle(el).contentVisibility; document.documentElement.offsetHeight; return performance.now() - t0; };
const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).filter((k) => !k.startsWith('svelte-')).slice(0, 2).join('.') : '');
const flip = async () => { await raf(); await raf(); force(h); const st0 = h.getAttribute(R); const hs = [];
  for (let i = 0; i < ${N}; i++) { h.setAttribute(R, 'active'); force(h); h.setAttribute(R, 'deferred'); hs.push(force(h)); }
  h.setAttribute(R, st0); force(h); return med(hs); };
const tmp = async (els, props) => { const saved = els.map((e) => [e, e.getAttribute('style')]); for (const e of els) for (const [k, v] of Object.entries(props)) e.style.setProperty(k, v, 'important'); await raf(); await raf(); force(h); for (const [e, st] of saved) st === null ? e.removeAttribute('style') : e.setAttribute('style', st); await raf(); await raf(); force(h); };
const people = document.querySelector('#people'), prof = document.querySelector('#profile-showcase');
// r10: snapshot of every element in #profile-showcase (+ itself, #people): attributes, rect, layout-relevant computed
// values, scroll state; diffed around an action to find what the cure changes.
const CP = ['display', 'position', 'transform', 'translate', 'scale', 'opacity', 'will-change', 'contain', 'content-visibility', 'overflow-x', 'overflow-y', 'width', 'height', 'min-height', 'flex-basis', 'scroll-snap-type', 'scroll-snap-align', 'visibility', 'z-index', 'isolation', 'filter', 'mask-image', 'animation-name', 'animation-play-state', 'transition-property'];
const snap = () => { const m = new Map(); const els = [people, ...people.querySelectorAll('*')];
  els.forEach((e, i) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const o = { attrs: [...e.attributes].map((a) => a.name + '=' + a.value).join(' | ').slice(0, 600), rect: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(2)).join(','), scroll: [e.scrollLeft, e.scrollTop, e.scrollWidth, e.scrollHeight].join(','), anims: e.getAnimations().map((an) => (an.animationName || an.transitionProperty || '?') + ':' + an.playState + '@' + Math.round(an.currentTime ?? -1)).join(' ') };
    for (const p of CP) o[p] = cs.getPropertyValue(p);
    for (const ps of ['::before', '::after']) { const pc = getComputedStyle(e, ps); if (pc.content !== 'none' && pc.content !== 'normal') o[ps] = pc.position + '/' + pc.display + '/' + pc.transform + '/' + pc.width + 'x' + pc.height; }
    m.set(i + ':' + name(e), o); });
  return m; };
const sdiff = (a, b) => { const out = []; for (const [k, o] of a) { const p = b.get(k); if (!p) { out.push(k + ' GONE'); continue; } for (const f of Object.keys({ ...o, ...p })) if (String(o[f]) !== String(p[f])) out.push(k + ' ' + f + ': ' + String(o[f]).slice(0, 160) + ' -> ' + String(p[f]).slice(0, 160)); } for (const k of b.keys()) if (!a.has(k)) out.push(k + ' NEW'); return out; };
`;
const census = `(() => { ${lib}
  const tv = (e, p) => { try { return String(e.computedStyleMap().get(p)); } catch { return '?'; } };
  const rows = [];
  for (const e of people.querySelectorAll('*')) {
    const hs = tv(e, 'height'), mh = tv(e, 'min-height'), xh = tv(e, 'max-height'), fb = tv(e, 'flex-basis');
    if (![hs, mh, xh, fb].some((v) => v.includes('%'))) continue;
    const chain = []; for (let x = e.parentElement, i = 0; x && i < 6; x = x.parentElement, i++) chain.push(name(x) + ':' + tv(x, 'height') + '/' + getComputedStyle(x).display);
    rows.push({ el: name(e), height: hs, minH: mh, maxH: xh, flexBasis: fb, pos: getComputedStyle(e).position, desc: e.querySelectorAll('*').length, chain: chain.join(' < ') });
  }
  return JSON.stringify(rows);
})()`;
const act = {
  none: '',
  wait5: 'await new Promise((r) => setTimeout(r, 5000));',
  peopleH: "await tmp([people], { height: people.getBoundingClientRect().height + 'px' });",
  profileH: "await tmp([prof], { height: prof.getBoundingClientRect().height + 'px' });",
  peopleHollow: "await tmp([...people.children], { display: 'none' });",
  profileHollow: "await tmp([...prof.children], { display: 'none' });",
  heroActive: "h.setAttribute(R, 'active'); await raf(); await raf(); force(h); h.setAttribute(R, 'deferred'); await raf(); force(h);",
  // r9: is it the shells' will-change window (fwWC data-fw-wc) or the re-creation itself?
  wc0: "const els = [...document.querySelectorAll('.start-selling-profile-shell')]; window.__rcN = els.length; els.forEach((e) => e.setAttribute('data-fw-wc', '0')); await raf(); await raf(); force(h);",
  wc1: "const els = [...document.querySelectorAll('.start-selling-profile-shell')]; window.__rcN = els.length; els.forEach((e) => e.setAttribute('data-fw-wc', '1')); await raf(); await raf(); force(h);",
  wcTmp: "const els = [...document.querySelectorAll('.start-selling-profile-shell')]; window.__rcN = els.length; const v = els.map((e) => e.getAttribute('data-fw-wc')); els.forEach((e) => e.setAttribute('data-fw-wc', v[0] === '1' ? '0' : '1')); await raf(); await raf(); force(h); els.forEach((e, i) => v[i] === null ? e.removeAttribute('data-fw-wc') : e.setAttribute('data-fw-wc', v[i])); await raf(); await raf(); force(h);",
  // r11: the r6-r10 "cures" were fwFar re-skipping #people after it shrank. Geometry-preserving variants, kept on:
  deferPeople: "const hh = people.getBoundingClientRect().height; people.style.setProperty('--start-selling-intrinsic-block-size', hh + 'px'); people.setAttribute(R, 'deferred'); await raf(); await raf(); force(h);",
  lockOnly: "people.style.setProperty('height', people.getBoundingClientRect().height + 'px', 'important'); await raf(); await raf(); force(h);",
  rcKeepWc:"const els = [...document.querySelectorAll('.start-selling-profile-shell')]; window.__rcN = els.length; const v = els.map((e) => e.getAttribute('data-fw-wc')); await tmp(els, { display: 'none' }); await raf(); await raf(); await raf(); els.forEach((e, i) => v[i] === null ? e.removeAttribute('data-fw-wc') : e.setAttribute('data-fw-wc', v[i])); await raf(); await raf(); force(h);",
};
let c = await openTab(`localhost:${process.env.PORT}`);
const result = { census: null, runs: [] };
for (const a of ACTIONS) {
  await c.evaluate(`setTimeout(() => location.reload(), 50); 'ok'`); c.close();
  await sleep(3000);
  c = await openTab(`localhost:${process.env.PORT}`);
  for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
  await sleep(1500);
  await c.evaluate(`window.scrollTo(0, ${Number(process.env.Y || 3000)}); 'ok'`);
  await sleep(2500);
  if (!result.census) result.census = JSON.parse(await c.evaluate(census));
  // D:<action> wraps any action in a before/after snapshot diff (window.__diff), taken 3 frames after the action
  const D = a.startsWith('D:');
  const inner = D ? a.slice(2) : a;
  const code0 = innerCode(inner);
  const code = D ? `const s0 = snap(); ${code0} await raf(); await raf(); await raf(); window.__diff = sdiff(s0, snap());` : code0;
  const r = await runAsync(c, `(async () => { ${lib} window.__rcN = null; window.__diff = null; const SS = () => [...document.querySelectorAll(".start-selling-profile-shell")].map((e) => (e.getAttribute("data-fw-wc") ?? "-") + (e.classList.contains("is-active-shell") ? "A" : "") + ":" + getComputedStyle(e).willChange.replace(/[^a-z,]/g, "").slice(0, 9)).join(" "); const pp = () => people.getAttribute(R) + "/" + Math.round(people.getBoundingClientRect().height) + "/nx" + Math.round(people.nextElementSibling ? people.nextElementSibling.getBoundingClientRect().top : -1) + "/y" + Math.round(scrollY); const p0 = pp(); const ss0 = SS(); const t0 = Math.round(performance.now()); const b1 = await flip(); const b2 = await flip(); ${code} const a1 = await flip(); const a2 = await flip(); return { a: ${JSON.stringify(a)}, n: window.__rcN, p0, p1: pp(), diff: window.__diff, ss0, ss1: SS(), anims: document.getAnimations().filter((an) => an.effect && an.effect.target && an.effect.target.closest && an.effect.target.closest(".start-selling-profile")).map((an) => (an.animationName || an.transitionProperty || "?") + ":" + an.playState).join(" "), deckSL: [...document.querySelectorAll(".start-selling-profile-deck")].map((d) => d.scrollLeft).join("/"), t0, y: scrollY, st: h.getAttribute(R), before: [b1, b2], after: [a1, a2] }; })()`, { timeoutMs: 90000, pollMs: 1000 });
  result.runs.push(r);
  console.log(`  ${a.padEnd(14)} n${r.n} people[${r.p0} -> ${r.p1}] ss[${r.ss0}] -> [${r.ss1}] anims[${r.anims}] sl${r.deckSL} t0 ${r.t0} y${r.y} ${r.st}: before ${r.before.join(',')} after ${r.after.join(',')}`);
  if (r.diff) { console.log(`    diff ${r.diff.length} lines`); for (const l of r.diff.slice(0, Number(process.env.DL || 40))) console.log('    ' + l); }
}
function innerCode(a) {
  // rc:<sel> re-creates every match (display:none for two frames, then back); hc:<sel> does that to their children
  // lh:<sel>: lock #people's height (so fwFar never re-skips it), then hide every match for good (display:none)
  if (a.startsWith('lh:')) return `people.style.setProperty('height', people.getBoundingClientRect().height + 'px', 'important'); const els = [...document.querySelectorAll(${JSON.stringify(a.slice(3))})]; window.__rcN = els.length; for (const e of els) e.style.setProperty('display', 'none', 'important'); await raf(); await raf(); force(h);`;
  return act[a] ?? (a.startsWith('rc:') ? `const els = [...document.querySelectorAll(${JSON.stringify(a.slice(3))})]; window.__rcN = els.length; await tmp(els, { display: 'none' });`
    : a.startsWith('hc:') ? `const els = [...document.querySelectorAll(${JSON.stringify(a.slice(3))})].flatMap((e) => [...e.children]); window.__rcN = els.length; await tmp(els, { display: 'none' });`
    // ts:<prop>:<value> / td:<prop>:<value>: that inline !important value on the profile shells / deck for two frames
    : /^t[sd]:/.test(a) ? (() => { const [, p, ...v] = a.slice(3).split(':'); const sel = a[1] === 's' ? '.start-selling-profile-shell' : '.start-selling-profile-deck';
      return `const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; window.__rcN = els.length; await tmp(els, { ${JSON.stringify(p)}: ${JSON.stringify(v.join(':'))} });`; })()
    : 'throw new Error("unknown action")');
}
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`census: ${result.census.length} %-height boxes in #people`);
for (const x of result.census.slice(0, 25)) console.log(`  ${x.el} h=${x.height} min=${x.minH} max=${x.maxH} fb=${x.flexBasis} ${x.pos} desc${x.desc} | ${x.chain}`);
// park the tab on about:blank so the next Sim boot does not restore this session's page (I-050)
try { await c.evaluate(`setTimeout(() => { location.href = 'about:blank'; }, 50); 'ok'`); await sleep(1000); } catch {}
c.close();
