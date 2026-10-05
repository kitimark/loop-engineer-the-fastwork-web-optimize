// end-bg P-144: in-page arm for `sim.mjs gesture --inject`, applied after every page load before the Timeline starts.
// Arm from $EB_ARM (the driver sets it): C and C2 (no rule: the A/A pair) | nob (fixes/end-bg/nobg.css, P-137's V) |
// pic (sim/pictures-off.css) | tit (sim/titles-off.css). The CSS file's text is appended as one <style id="eb-arm">.
// Paint only by construction (background-image none, mix-blend-mode normal, visibility hidden on img boxes): no size,
// position, display or animation property.
// Recorded (counts and booleans only, no time): arm, css sha, docH right after the rule, and the APPLIED PROBES at install
// and at read (end of run): the computed background-image of the stage grain (.start-selling-platform-stage-grain) and
// of the secure row title (.start-selling-platform-row-title-secure), whether each was found, and whether the style
// element is still in <head>. Plus a band-step counter: every innerHeight change seen by a passive resize listener,
// with whether scrollY was in the last-screen band (scrollY >= docH - 2 innerHeight) at that moment.
// read() returns everything as a JSON string (gesture file `run.inject[0].value`).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const name = 'eb';
const DIR = new URL('..', import.meta.url).pathname; // fixes/end-bg/
export const CSS_FILE = { C: null, C2: null, nob: 'nobg.css', pic: 'sim/pictures-off.css', tit: 'sim/titles-off.css' };
export function armCss(arm) {
  if (!(arm in CSS_FILE)) throw new Error(`eb-inject: unknown arm ${arm}`);
  const f = CSS_FILE[arm];
  if (!f) return { css: '', sha: null };
  const css = readFileSync(DIR + f, 'utf8');
  return { css, sha: createHash('sha256').update(css).digest('hex').slice(0, 12) };
}
const ARM = process.env.EB_ARM || 'C';
const { css: CSS, sha: CSS_SHA } = armCss(ARM);
// A probe is "on" when the element's own background-image or its ::after's is not none (the sweep titles draw their
// gradient on ::after under @supports (-webkit-mask-clip: text), on the span itself otherwise; Chrome inventory
// out/end-bg/inv-2026-10-05T11-23-24-796Z.json, OBSERVED). null = element not found.
export const PROBES = { grain: '.start-selling-platform-stage-grain', title: '.start-selling-platform-row.is-payment .start-selling-platform-row-title-secure' };
export const install = () => `(() => {
  const arm = ${JSON.stringify(ARM)}, css = ${JSON.stringify(CSS)}, P = ${JSON.stringify(PROBES)};
  if (css) { const st = document.createElement('style'); st.id = 'eb-arm'; st.textContent = css; document.head.appendChild(st); }
  const on = (el) => getComputedStyle(el).backgroundImage !== 'none' || getComputedStyle(el, '::after').backgroundImage !== 'none';
  const probe = () => { const o = {}; for (const k of Object.keys(P)) { const el = document.querySelector(P[k]); o[k] = el ? on(el) : null; } o.style = !!document.getElementById('eb-arm'); return o; };
  const steps = []; let ih = innerHeight;
  addEventListener('resize', () => { if (innerHeight === ih) return; ih = innerHeight; const d = document.documentElement.scrollHeight; steps.push([Math.round(scrollY), ih, scrollY >= d - 2 * ih ? 1 : 0]); }, { passive: true });
  window.__eb = { arm, cssSha: ${JSON.stringify(CSS_SHA)}, cssLen: css.length, docH0: document.documentElement.scrollHeight, at0: probe(), probe, steps };
  return 'ok';
})()`;
export const read = () => `(() => { const e = window.__eb; if (!e) return 'null'; const { probe, ...rest } = e; return JSON.stringify(Object.assign({}, rest, { at1: probe(), docH1: document.documentElement.scrollHeight, bandSteps: e.steps.filter((s) => s[2]).length })); })()`;
/** The applied-arm rule on a read() value: the bg-on probes expected per arm (at1, end of run). */
export const EXPECT = { C: { grain: true, title: true }, C2: { grain: true, title: true }, nob: { grain: false, title: false }, pic: { grain: false, title: true }, tit: { grain: true, title: false } };
export function appliedWhy(arm, v) {
  const why = [];
  if (!v || typeof v !== 'object') return ['no inject value'];
  if (v.arm !== (arm === 'C2' ? 'C2' : arm)) why.push(`arm ${v.arm} != ${arm}`);
  const e = EXPECT[arm], a = v.at1 || {};
  for (const k of Object.keys(e)) if (a[k] !== e[k]) why.push(`${k} ${a[k]} (want ${e[k]})`);
  if ((arm === 'C' || arm === 'C2') ? a.style : !a.style) why.push(`style element ${a.style}`);
  return why;
}
