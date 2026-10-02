// T-011 functional part (WebKit: phone, or the Simulator for a probe check): does RBi40pti's JS line hold the 4 row-title
// sweeps paused off screen and start them in view, like today's build (RB)? No timing verdict: this runs after the
// Timeline block's end sentinel (never inside a timed block), one load per arm.
// Sequence, all in the page (one runAsync, polled every 2 s): the tab already shows the arm's page, loaded and settled
// (the caller navigates and waits 8 s). (1) Off screen, at the top: per title, data-sweep-paused present, computed
// animation-play-state, and each animation's playState / currentTime; #platform's data-start-selling-scene. (2) Per
// title in page order: an instant scroll that puts it at the viewport middle, then a rAF log for 1200 ms of its sweep's
// currentTime; reports the state after 2 rAFs, the onset (first rAF whose currentTime advanced, ms after the scroll)
// and currentTime at +600 ms. (3) Back to the top, 1200 ms, state again (expected: paused again in both arms).
// usage: node sweepstate.mjs <out.json> <label>   env FW_IPHONE_PORT (9222 phone, 9232 Simulator session), FW_TAB_HOST
import { writeFileSync } from 'node:fs';
import { openTab, runAsync } from '../../../tools/lib/wip.mjs';

const [out, label] = process.argv.slice(2);
if (!out || !label) { console.error('usage: node sweepstate.mjs <out.json> <label>'); process.exit(1); }
const PROBE = `(async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = document.getElementById('platform');
  const names = ['doc', 'earn', 'secure', 'organized'];
  const titles = names.map((n) => [n, document.querySelector('.start-selling-platform-row-title-' + n)]).filter(([, e]) => e);
  const anim = (e) => (e.getAnimations ? e.getAnimations() : []).filter((a) => a.effect && a.effect.target === e);
  const state = (e) => ({ attr: e.hasAttribute('data-sweep-paused'), cssPlay: getComputedStyle(e).animationPlayState,
    anims: anim(e).map((a) => ({ name: a.animationName || '', ps: a.playState, ct: a.currentTime == null ? null : Math.round(a.currentTime) })) });
  const res = { ua: navigator.userAgent.replace(/\\(.*?\\)/, '(…)'), vw: innerWidth, vh: innerHeight, y0: Math.round(scrollY),
    found: titles.map(([n]) => n), scene0: P && P.getAttribute('data-start-selling-scene'), off: {}, inView: {}, back: {} };
  for (const [n, e] of titles) res.off[n] = state(e);
  for (const [n, e] of titles) {
    const r = e.getBoundingClientRect(); const y = Math.max(0, Math.round(r.top + scrollY - innerHeight / 2 + r.height / 2));
    scrollTo({ top: y, behavior: 'instant' }); const t0 = performance.now();
    const log = []; let s2 = null;
    for (let i = 0; ; i++) {
      await raf(); const t = performance.now() - t0; const a = anim(e)[0];
      log.push([Math.round(t), a && a.currentTime != null ? Math.round(a.currentTime) : null, a ? a.playState : 'none']);
      if (i === 1) s2 = state(e);
      if (t > 1200) break;
    }
    const first = log.find((x) => x[1] != null)?.[1];
    const onset = log.find((x) => x[1] != null && first != null && x[1] > first);
    const at600 = log.find((x) => x[0] >= 600);
    res.inView[n] = { y, scene: P && P.getAttribute('data-start-selling-scene'), after2raf: s2, onsetMs: onset ? onset[0] : null,
      ctAt600: at600 ? at600[1] : null, frames: log.length, log: log.filter((x, i) => i < 12 || i % 10 === 0) };
  }
  scrollTo({ top: 0, behavior: 'instant' }); await sleep(1200);
  for (const [n, e] of titles) res.back[n] = state(e);
  res.sceneBack = P && P.getAttribute('data-start-selling-scene');
  return res;
})()`;
const c = await openTab((u) => /^https?:/.test(u) && (!process.env.FW_TAB_HOST || u.includes(process.env.FW_TAB_HOST)));
try {
  const r = await runAsync(c, PROBE, { pollMs: 2000, timeoutMs: 60000 });
  writeFileSync(out, JSON.stringify({ label, at: new Date().toISOString(), ...r }, null, 1));
  const s = (o) => Object.entries(o).map(([n, v]) => `${n}:${v.attr ? 'A' : '-'}/${v.cssPlay}/${v.anims.map((a) => a.ps).join('+') || 'none'}`).join(' ');
  console.log(`${label}: scene ${r.scene0}; off ${s(r.off)}`);
  console.log(`${label}: in view ` + Object.entries(r.inView).map(([n, v]) => `${n}: ${v.after2raf.anims.map((a) => a.ps).join('+') || 'none'} onset ${v.onsetMs} ms ct600 ${v.ctAt600}`).join('; '));
  console.log(`${label}: back at top (scene ${r.sceneBack}) ${s(r.back)}`);
} finally { c.close(); }
