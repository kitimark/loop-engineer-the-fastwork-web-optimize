#!/usr/bin/env node
// toolbar-resize page-side arm card: self-test of pgp-inject.mjs (each arm's rule, on a stub DOM), check-pgp.mjs's gate and
// sim-pgp.mjs's first-run gate. No browser, no lock. node fixes/toolbar-resize/pgp-selftest.mjs -> "SELFTEST ok N checks".
import { gateWhy, KEYPINS } from './check-pgp.mjs';
import { firstRunWhy } from './sim-pgp.mjs';
let n = 0, bad = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log(`FAIL ${what}`); } };
// --- stub DOM -------------------------------------------------------------------------------------------------------
const mkEl = (tag, cls, h, cs) => { const el = { tagName: tag.toUpperCase(), id: '', className: cls, h, cs, children: [], querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, bottom: h, height: h }), getClientRects: () => [1], classList: { contains: (c) => cls.split(' ').includes(c) } }; el.style = { setProperty: (p, v) => { el.cs[p] = v; } }; return el; };
async function runArm(arm) {
  const els = {
    trk: mkEl('section', 'hero-track svelte-1p2vpne', 1550, { position: 'static', display: 'block', height: '1550px', contain: 'none' }),
    hero: mkEl('div', 'hero is-preparing svelte-1p2vpne', 775, { position: 'sticky', display: 'flex', height: '775px', 'min-height': '775px' }),
    pain: mkEl('section', 'pain', 2325, { position: 'static', display: 'block', contain: 'none', 'margin-top': '-775px' }),
    ps: mkEl('div', 'pain-sticky', 775, { position: 'sticky', display: 'block', 'min-height': '775px' }),
    hold: mkEl('div', 'pain-hold', 1550, { position: 'static', display: 'block', height: '1550px' }),
    card: mkEl('div', 'start-selling-future-card', 900, { position: 'relative', display: 'block', 'min-height': '775px' }),
    nav: mkEl('nav', 'start-selling-top-nav svelte-1dcozpm', 60, { position: 'fixed', display: 'block' }),
    sc: mkEl('div', 'start-selling-future-showcase', 904, { position: 'relative', display: 'block' }),
    odd: mkEl('div', 'deck-sticky', 40, { position: 'sticky', display: 'block' }),
  };
  const bySel = { '.hero-track.svelte-1p2vpne': [els.trk], 'section.pain': [els.pain], '.hero.svelte-1p2vpne': [els.hero], '.pain-hold': [els.hold], '.start-selling-future-card': [els.card], '.pain-sticky': [els.ps] };
  let sheet = '';
  const applyRules = () => { // crude cascade: only the rules this arm writes
    for (const [sel, el] of [['.hero.svelte-1p2vpne', els.hero], ['.pain-sticky', els.ps], ['.start-selling-top-nav.svelte-1dcozpm', els.nav]]) {
      const m = sheet.match(new RegExp(sel.replace(/\./g, '\\.') + '\\{position:(\\w+)')); if (m) el.cs.position = m[1];
    }
    if (sheet.includes('.hero-track.svelte-1p2vpne{contain:size layout')) els.trk.cs.contain = 'size layout';
    if (sheet.includes('section.pain{contain:size layout')) els.pain.cs.contain = 'size layout';
  };
  const doc = {
    head: { appendChild: (st) => { sheet += st.textContent; doc.byId[st.id] = st; applyRules(); } }, byId: {},
    body: { offsetHeight: 1 }, documentElement: { scrollHeight: 6035, classList: { contains: () => true } },
    createElement: () => ({}), getElementById: (id) => doc.byId[id] || null,
    querySelector: (s) => (s.includes('showcase') ? els.sc : (bySel[s] || [])[0] || null),
    querySelectorAll: (s) => (s === 'body *' ? Object.values(els) : bySel[s] || []),
  };
  const g = { document: doc, innerHeight: 775, scrollY: 0, getComputedStyle: (el) => Object.assign({ getPropertyValue: (p) => el.cs[p] ?? '' }, el.cs), IntersectionObserver: class { observe() {} } };
  process.env.PGP_ARM = arm;
  const mod = await import(`./pgp-inject.mjs?arm=${arm}`);
  const run = (src) => new Function(...Object.keys(g), 'window', `return ${src}`)(...Object.values(g), g);
  ok(run(mod.install()) === 'ok', `${arm}: install returns ok`);
  const v = JSON.parse(run(mod.read()));
  return { v, sheet };
}
// --- inject per arm -------------------------------------------------------------------------------------------------
for (const arm of ['none', 'nvc', 'nvn', 'tps', 'tp', 'trk', 'pbx', 'vu0']) {
  const { v, sheet } = await runArm(arm);
  const run = (arm === 'none' ? 'C' : arm) + '-H1';
  ok(v.arm === arm, `${arm}: arm recorded`);
  ok(arm === 'none' ? sheet === '' && v.applied === false : v.applied === true && sheet.length > 0, `${arm}: rule applied iff not C`);
  const why = gateWhy(run, v);
  ok(why.length === 0, `${arm}: gate passes on a good record (${why.join('; ')})`);
  if (arm === 'nvc') ok(/top-nav[^{]*\{position:absolute/.test(sheet) && /platform\{position:relative!important;top:auto/.test(sheet), 'nvc: fixed -> absolute, platform top reset');
  if (arm === 'nvn') ok(!/absolute/.test(sheet) && /hero\.svelte-1p2vpne\{position:relative/.test(sheet), 'nvn: stickies only');
  if (arm === 'tps') ok(!/\.hero\.svelte-1p2vpne\{/.test(sheet) && /hero-track[^{]*\{contain:size layout/.test(sheet) && /pain-sticky\{position:relative/.test(sheet), 'tps: hero keeps sticky, track contained, others relative');
  if (arm === 'tp') ok(/contain-intrinsic-block-size:2325px/.test(sheet) && !/position/.test(sheet), 'tp: both boundaries, no position change');
  if (['nvc', 'nvn', 'tps'].includes(arm)) ok(v.extra.length === 1 && v.extra[0][0] === 'div.deck-sticky' && v.vc1.every((r) => r[1] !== 'sticky' || /^div\.hero\./.test(r[0])), `${arm}: an unlisted sticky renderer is covered inline`);
  if (arm === 'tps') ok(v.vc1.some((r) => /^div\.hero\./.test(r[0]) && r[1] === 'sticky'), 'tps: the hero stays sticky');
  if (['none', 'tp', 'trk', 'pbx', 'vu0'].includes(arm)) ok(v.extra.length === 0, `${arm}: no inline position change`);
  if (arm === 'vu0') { ok(KEYPINS.every((k) => v.pins.some((p) => `${p[0]} ${p[1]}` === k)), 'vu0: key pins'); ok(!/dvh/.test(sheet), 'vu0: no dvh in the rule'); }
}
// --- gate refusals ----------------------------------------------------------------------------------------------------
const good = { arm: 'nvc', applied: true, css: 'x', ioInstalled: true, vc1: [], docHpre: 6035, docH0: 6035, contain: {}, measured: {} };
ok(gateWhy('nvc-H1', { ...good, vc1: [['nav.start-selling-top-nav', 'fixed', 221]] }).some((w) => /left/.test(w)), 'nvc: a fixed renderer left fails');
ok(gateWhy('nvn-H1', { ...good, arm: 'nvn', vc1: [['div.pain-sticky', 'sticky', 29]] }).some((w) => /sticky left/.test(w)), 'nvn: a sticky left fails');
ok(gateWhy('nvn-H1', { ...good, arm: 'nvn', vc1: [['nav.x', 'fixed', 3]] }).length === 0, 'nvn: fixed may stay');
ok(gateWhy('tps-H1', { ...good, arm: 'tps', vc1: [['div.hero.is-preparing.svelte-1p2vpne', 'sticky', 422]], contain: { trk: 'size layout' }, trkH1: 1550, measured: { trkH: 1550 } }).length === 0, 'tps: hero sticky may stay');
ok(gateWhy('tps-H1', { ...good, arm: 'tps', vc1: [['div.pain-sticky', 'sticky', 29]], contain: { trk: 'size layout' }, trkH1: 1550, measured: { trkH: 1550 } }).length === 1, 'tps: another sticky fails');
ok(gateWhy('tp-H1', { ...good, arm: 'tp', contain: { trk: 'size layout', pain: 'layout' }, trkH1: 1550, painH1: 2325, measured: { trkH: 1550, painH: 2325 } }).some((w) => /pain contain/.test(w)), 'tp: pain without size fails');
ok(gateWhy('tp-H1', { ...good, arm: 'tp', contain: { trk: 'size layout', pain: 'size layout' }, trkH1: 1550, painH1: 2300, measured: { trkH: 1550, painH: 2325 } }).some((w) => /painH/.test(w)), 'tp: a changed pain height fails');
ok(gateWhy('C-H1', { ...good, arm: 'none', docH0: 6100 }).some((w) => /docH/.test(w)), 'docH moved fails');
ok(gateWhy('nvc-H1', { ...good, arm: 'none' }).some((w) => /arm/.test(w)), 'arm mismatch fails');
ok(gateWhy('nvc-H1', null)[0] === 'no inject record', 'missing record fails');
ok(gateWhy('vu0-H1', { ...good, arm: 'vu0', pins: [['.hero-track.svelte-1p2vpne', 'height', '1550px']] }).filter((w) => /pin missing/.test(w)).length === 3, 'vu0: missing key pins fail');
// --- first-run gate ---------------------------------------------------------------------------------------------------
ok(firstRunWhy(null)[0] === 'no inject value', 'first run: no value stops');
ok(firstRunWhy({ ioInstalled: true, vc1: [], docH0: 6035 }).length === 0, 'first run: good value passes');
ok(firstRunWhy({ ioInstalled: false, vc1: [], docH0: 6035 }).length === 1, 'first run: no IO stops');
console.log(bad ? `SELFTEST FAIL ${bad} of ${n}` : `SELFTEST ok ${n} checks`);
process.exit(bad ? 1 : 0);
