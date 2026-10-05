#!/usr/bin/env node
// toolbar-resize P-141 (single-sticky card) self-test: ss-inject.mjs's arms on a stub DOM (pgp-selftest.mjs's stub plus #platform),
// check-ss.mjs's gate, sim-ss.mjs's plan, step check constants and host-load rule. No browser, no lock, no Simulator.
// node fixes/toolbar-resize/ss-selftest.mjs -> "SELFTEST ok N checks".
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gateWhy } from './check-ss.mjs';
import { PLAN, HOLDS, MAX_STEPS, ARMS, HOST_MAX, hostWhy, firstRunWhy } from './sim-ss.mjs';
let n = 0, bad = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log(`FAIL ${what}`); } };
// --- stub DOM -------------------------------------------------------------------------------------------------------
const mkEl = (tag, cls, h, cs, id = '') => { const el = { tagName: tag.toUpperCase(), id, className: cls, h, cs, children: [], querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, bottom: h, height: h }), getClientRects: () => [1], classList: { contains: (c) => cls.split(' ').includes(c) } }; el.style = { setProperty: (p, v) => { el.cs[p] = v; } }; return el; };
async function runArm(arm) {
  const els = {
    trk: mkEl('section', 'hero-track svelte-1p2vpne', 1630, { position: 'static', display: 'block', contain: 'none' }),
    hero: mkEl('div', 'hero is-ring-splash-done svelte-1p2vpne', 775, { position: 'sticky', display: 'flex' }),
    pain: mkEl('section', 'pain', 2325, { position: 'static', display: 'block', contain: 'none' }),
    ps: mkEl('div', 'pain-sticky', 775, { position: 'sticky', display: 'block' }),
    plat: mkEl('section', 'start-selling-platform is-platform-shrink-track', 600, { position: 'sticky', display: 'block' }, 'platform'),
    nav: mkEl('header', 'start-selling-top-nav svelte-1dcozpm', 60, { position: 'fixed', display: 'block' }),
    sc: mkEl('div', 'start-selling-future-showcase', 904, { position: 'relative', display: 'block' }),
    odd: mkEl('div', 'deck-sticky', 40, { position: 'sticky', display: 'block' }),
  };
  const bySel = { '.hero-track.svelte-1p2vpne': [els.trk], 'section.pain': [els.pain], '.hero.svelte-1p2vpne': [els.hero], '.pain-sticky': [els.ps] };
  let sheet = '';
  const applyRules = () => {
    for (const [sel, el] of [['.hero.svelte-1p2vpne', els.hero], ['.pain-sticky', els.ps], ['html.fw-ms .start-selling-platform', els.plat], ['.start-selling-top-nav.svelte-1dcozpm', els.nav]]) {
      const m = sheet.match(new RegExp(sel.replace(/\./g, '\\.') + '\\{position:(\\w+)')); if (m) el.cs.position = m[1];
    }
  };
  const doc = {
    head: { appendChild: (st) => { sheet += st.textContent; doc.byId[st.id] = st; applyRules(); } }, byId: {},
    body: { offsetHeight: 1 }, documentElement: { scrollHeight: 6814, classList: { contains: () => true } },
    createElement: () => ({}), getElementById: (id) => doc.byId[id] || null,
    querySelector: (s) => (s.includes('showcase') ? els.sc : (bySel[s] || [])[0] || null),
    querySelectorAll: (s) => (s === 'body *' ? Object.values(els) : bySel[s] || []),
  };
  const g = { document: doc, innerHeight: 775, scrollY: 0, getComputedStyle: (el) => Object.assign({ getPropertyValue: (p) => el.cs[p] ?? '' }, el.cs), IntersectionObserver: class { observe() {} } };
  process.env.PGP_ARM = arm;
  const mod = await import(`./ss-inject.mjs?arm=${arm}`);
  const run = (src) => new Function(...Object.keys(g), 'window', `return ${src}`)(...Object.values(g), g);
  ok(run(mod.install()) === 'ok', `${arm}: install returns ok`);
  return { v: JSON.parse(run(mod.read())), sheet, els };
}
// --- inject per arm -------------------------------------------------------------------------------------------------
const stickyNames = (v) => v.vc1.filter((r) => r[1] === 'sticky').map((r) => r[0]);
for (const arm of ['none', 'nvc', 'nvn', 'hso', 'pso', 'fso']) {
  const { v, sheet } = await runArm(arm);
  const runName = (arm === 'none' ? 'C' : arm) + '-H1';
  ok(v.arm === arm, `${arm}: arm recorded`);
  ok(arm === 'none' ? sheet === '' && v.applied === false : v.applied === true && sheet.length > 0, `${arm}: rule applied iff not C`);
  const why = gateWhy(runName, v);
  ok(why.length === 0, `${arm}: gate passes on a good record (${why.join('; ')})`);
  if (arm === 'none') ok(stickyNames(v).length === 4 && v.extra.length === 0, 'C: all four stickies stay, no inline change');
  if (arm === 'nvc') ok(stickyNames(v).length === 0 && !v.vc1.some((r) => r[1] === 'fixed'), 'nvc: no fixed or sticky left');
  if (arm === 'nvn') ok(stickyNames(v).length === 0 && v.vc1.some((r) => r[1] === 'fixed'), 'nvn: no sticky left, the fixed nav stays');
  if (['hso', 'pso', 'fso'].includes(arm)) {
    const want = { hso: /^div\.hero\./, pso: /^div\.pain-sticky/, fso: /^section#platform\./ }[arm];
    ok(stickyNames(v).length === 1 && want.test(stickyNames(v)[0]), `${arm}: exactly the kept sticky stays (${stickyNames(v).join(', ')})`);
    ok(v.vc1.some((r) => r[1] === 'fixed'), `${arm}: the fixed nav stays`);
    ok(v.extra.length === 1 && v.extra[0][0] === 'div.deck-sticky', `${arm}: an unlisted sticky renderer is covered inline`);
    ok(!/position:absolute/.test(sheet) && !/contain/.test(sheet), `${arm}: positions only, no fixed change, no containment`);
    ok(v.keep === { hso: 'hero', pso: 'pain-sticky', fso: '#platform' }[arm], `${arm}: kept renderer recorded`);
  }
  if (['hso', 'pso'].includes(arm)) ok(/platform\{position:relative!important;top:auto/.test(sheet), `${arm}: #platform relative with top reset`);
  if (arm === 'fso') ok(!/platform\{/.test(sheet) && /hero\.svelte-1p2vpne\{position:relative/.test(sheet) && /pain-sticky\{position:relative/.test(sheet), 'fso: #platform keeps sticky, hero and pain relative');
  if (arm === 'hso') ok(!/\.hero\.svelte-1p2vpne\{/.test(sheet), 'hso: no rule on the hero');
  if (arm === 'pso') ok(!/\.pain-sticky\{/.test(sheet), 'pso: no rule on pain-sticky');
}
// --- gate refusals ----------------------------------------------------------------------------------------------------
const good = { arm: 'hso', applied: true, css: 'x', ioInstalled: true, docHpre: 6814, docH0: 6814, contain: {}, measured: {}, vc1: [['header.start-selling-top-nav.svelte-1dcozpm', 'fixed', 25], ['div.hero.svelte-1p2vpne.is-ring-splash-done', 'sticky', 423]] };
ok(gateWhy('hso-H1', good).length === 0, 'gate: hso with only the hero sticky passes');
ok(gateWhy('hso-H1', { ...good, vc1: [...good.vc1, ['div.pain-sticky', 'sticky', 29]] }).some((w) => /want only the kept one/.test(w)), 'gate: hso with pain still sticky fails');
ok(gateWhy('hso-H1', { ...good, vc1: [good.vc1[0]] }).some((w) => /want only the kept one/.test(w)), 'gate: hso with the hero no longer sticky fails');
ok(gateWhy('pso-H1', { ...good, arm: 'pso' }).some((w) => /want only/.test(w)), 'gate: pso keeping the hero instead fails');
ok(gateWhy('pso-H1', { ...good, arm: 'pso', vc1: [['div.pain-sticky', 'sticky', 29]] }).length === 0, 'gate: pso with only pain-sticky passes');
ok(gateWhy('fso-H1', { ...good, arm: 'fso', vc1: [['section#platform.start-selling-platform.is-platform-shrink-track', 'sticky', 363]] }).length === 0, 'gate: fso with only #platform passes');
ok(gateWhy('fso-H1', { ...good, arm: 'fso', applied: false }).some((w) => /applied/.test(w)), 'gate: not applied fails');
ok(gateWhy('fso-H1', { ...good, arm: 'hso' }).some((w) => /arm/.test(w)), 'gate: arm mismatch fails');
ok(gateWhy('hso-H1', { ...good, docH0: 6900 }).some((w) => /docH/.test(w)), 'gate: docH moved fails');
ok(gateWhy('nvn-H1', { ...good, arm: 'nvn', vc1: [['div.pain-sticky', 'sticky', 29]] }).some((w) => /sticky left/.test(w)), 'gate: nvn keeps check-pgp rule');
ok(gateWhy('C-H1', { ...good, arm: 'none', applied: false, css: '' }).length === 0, 'gate: C passes');
// --- plan, budget, host rule, first-run gate ----------------------------------------------------------------------------
const all = HOLDS.flatMap((h) => PLAN[h]);
ok(ARMS.join() === 'C,nvc,nvn,hso,pso,fso' && HOLDS.join() === 'S1,S2,S3,S4', 'arms and holds');
ok(HOLDS.every((h) => PLAN[h].length <= MAX_STEPS && MAX_STEPS === 5), 'at most 5 steps per hold');
ok(HOLDS.every((h) => PLAN[h][0].startsWith('C:') && PLAN[h].at(-1).startsWith('C:') && PLAN[h][1].startsWith('nvc:')), 'every hold: own C at both ends, own nvc second');
for (const a of ['hso', 'pso', 'fso', 'nvn']) { const hs = HOLDS.filter((h) => PLAN[h].some((s) => s.startsWith(a + ':'))); ok(all.filter((s) => s.startsWith(a + ':')).length === 2 && hs.length === 2, `${a}: two runs in two different holds`); }
ok(new Set(all).size === all.length && all.filter((s) => s.startsWith('C:')).length === 8 && all.length === 20, 'unique names, 8 C, 20 steps');
ok(5 * 78.35 + 30 <= 500, 'a 5-step hold fits 500 s at the P-133 dry-run estimate');
ok(HOST_MAX === 200 && hostWhy(154).length === 0 && hostWhy(200).length === 0 && hostWhy(200.1).length === 1, 'host rule (rev 1.1): load1 > 200 stops; P-133 ~154 passes');
ok(firstRunWhy({ ioInstalled: true, vc1: [], docH0: 6814 }, 12).length === 0 && firstRunWhy({ ioInstalled: true, vc1: [], docH0: 6814 }, 7).length === 1, 'first-run gate: n >= 8');
const sha = (p) => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex').slice(0, 12);
ok(sha('./cycle-hero-v2.json') === '59420d90ed02' && sha('./check-n133.mjs') === '96a1dc5fe288' && sha('./score-bisect.mjs') === 'cb6f0c97b81b' && sha('./check-pgp.mjs') === 'da32f37117f6', 'reused files unchanged (stimulus, n check, scorer, pgp gate)');
console.log(bad ? `SELFTEST FAIL ${bad} of ${n}` : `SELFTEST ok ${n} checks`);
process.exit(bad ? 1 : 0);
