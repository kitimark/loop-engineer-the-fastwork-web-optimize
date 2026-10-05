// P-149 stop procedure, shared by px149-chrome.mjs and px149-sim.mjs (same steps in both engines). It reuses P-148's
// instrument unchanged: the motion hold (px148-gate.js), the in-page snippets and masks of px148-run.mjs, the settle
// step. What changes is the shot order (rev of P-148's triple, N4): every A/A pair is taken BEFORE any real arm.
// One stop = one position x mode:
//   1. release any earlier hold; position the page (rest: scrollTo + 700 ms; swipe: the 10-frame scripted step);
//   2. hold on; 2 frames; settle as P-148 (shots 250 ms apart until two in a row are equal outside the masks, at most
//      8); the settled shot is f1;
//   3. fresh A/A: N0 (an empty <style id=dc-arm>) on, 2 frames, armWait, re-pause, shot f2; N0 off ... f3; on ... f4;
//      off ... f5; on ... f6. Pairs (f1,f2), (f3,f4), (f5,f6): each is "shot, then a style toggle on, then shot",
//      the R3 pair's steps exactly;
//   4. part R only: N0 off ... shot f7 (R3's base); R3 on, 2 frames, armWait, re-pause, shot a (R3's arm); R3 off;
//   5. locator reads (elementFromPoint at the envelope's strongest tiles), hold counters, hold off.
// Geometry is read at every shot. Saved shots: an unstable stop's pair with the most A/A pixels (both shots); R3's f7
// and a when its tier is not T0.
import { GEO, ARM, geoDiff } from './geo.mjs';
import { CLOCK, STEP_TO, pngPixels } from './px.mjs';
import { sameImages } from './px148.mjs';
import { HOLD_ON, REPAUSE, HOLD_OFF, RAF2G, STAT_RESET, DECK, SETTLE_MAX, SETTLE_MS, footRect, applyFoot } from './px148-run.mjs';
import { envelope, judgeEnv, stopStable, envTiles } from './px149.mjs';

export const N0_CSS = '/* P-149 null arm: an empty style element, toggled like an arm */';
export const WHO = (pts) => `(() => ${JSON.stringify(pts)}.map(([x, y]) => { const e = document.elementFromPoint(x, y); if (!e) return null;
  const d = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + [...n.classList].slice(0, 2).map((c) => '.' + c).join('');
  return [d(e), e.parentElement ? d(e.parentElement) : null]; }))()`;

// io = { ev(expr), shot() -> png Buffer, sleep(ms), cal: { scale, ox, oy }, dpr, extraMasks: [], armWait, save(tag, {name: buf}) }
// arm: null (part L, A/A only) or { name: 'R3', css }
export async function stop(io, { cfg, pos, y, mode, arm = null }) {
  const t0 = Date.now();
  await io.ev(HOLD_OFF);
  if (mode === 'rest') { await io.ev(`scrollTo({ top: ${y}, behavior: 'instant' })`); await io.sleep(700); } else await io.ev(STEP_TO(y));
  const hold = await io.ev(HOLD_ON); await io.ev(RAF2G);
  const clock = await io.ev(CLOCK), deck = await io.ev(DECK);
  const masks0 = [...(clock ? [{ kind: 'clock', r: clock.map((v, i) => Math.round(v * io.cal.scale + (i % 2 ? io.cal.oy : io.cal.ox))) }] : []), ...io.extraMasks];
  const foot = footRect(deck, io.cal), { kept, dropped } = applyFoot(masks0, foot), masks = kept.map((m) => m.r);
  let curBuf = await io.shot(), prev = pngPixels(curBuf), cur = prev, settled = false, shots = 1, repaused = 0;
  for (; shots < SETTLE_MAX; ) {
    await io.sleep(SETTLE_MS); repaused += await io.ev(REPAUSE);
    curBuf = await io.shot(); cur = pngPixels(curBuf); shots++;
    if (sameImages(prev, cur, masks)) { settled = true; break; }
    prev = cur;
  }
  const stat = { settle: await io.ev(STAT_RESET), n0on: [], n0off: [] };
  const geos = [await io.ev(GEO)], bufs = [curBuf];
  const step = async (css, name) => {
    await io.ev(ARM(css, name)); await io.ev(RAF2G); await io.sleep(io.armWait); repaused += await io.ev(REPAUSE);
    geos.push(await io.ev(GEO)); bufs.push(await io.shot());
    return io.ev(STAT_RESET);
  };
  for (let k = 1; k < 6; k++) (k % 2 ? stat.n0on : stat.n0off).push(await step(k % 2 ? N0_CSS : null, 'N0'));
  const E = envelope(bufs.slice(0, 6), masks);
  const geoFresh = geos.slice(1, 6).flatMap((g, i) => geoDiff(geos[0], g).map((d) => `f${i + 2}: ${d}`));
  const rec = { cfg, pos, mode, y: geos[0].sy, settled, settleShots: shots, hold, masks, maskKinds: kept.map((m) => m.kind), maskDropped: dropped.map((m) => m.kind),
    foot, frame: E.frame, pairs: E.pairs, envPixels: E.envPixels, envBlind: E.envBlind, envMax: E.envMax, geoFresh };
  if (arm) {
    stat.n0off.push(await step(null, 'N0'));
    stat.arm = await step(arm.css, arm.name);
    await io.ev(ARM(null)); await io.ev(RAF2G);
    const j = judgeEnv(pngPixels(bufs[6]), pngPixels(bufs[7]), E.env, masks, io.dpr, foot);
    const geoArm = geoDiff(geos[6], geos[7]); if (Math.abs(geos[6].sy - geos[7].sy) > 0.02) geoArm.push(`sy ${geos[6].sy} -> ${geos[7].sy}`);
    // descriptive: the first fresh shot against R3's base (both off, about 6 steps apart)
    const span = envelope([bufs[0], bufs[6]], masks).pairs[0];
    Object.assign(rec, { arm: arm.name, judge: j, geoArm, spanAA: { aaAny: span.aaAny, aa8: span.aa8, max: span.max }, deckH: [geos[6].deck.h, geos[7].deck.h], docH: [geos[6].docH, geos[7].docH] });
    if (j.tier !== 'T0') io.save(`${cfg}-${pos}-${mode}-R3`.replace(/[^\w.-]/g, '_'), { f7: bufs[6], a: bufs[7] });
  } else await io.ev(ARM(null));
  rec.stable = stopStable(rec);
  if (E.envPixels) {
    const tiles = envTiles(E.env, E.w, io.cal);
    const who = await io.ev(WHO(tiles.map((t) => t.at)));
    rec.locator = tiles.map((t, i) => ({ ...t, who: who?.[i] ?? null }));
  }
  rec.stat = stat; rec.repaused = repaused; rec.flushed = await io.ev(HOLD_OFF);
  if (!rec.stable) {
    const worst = E.pairs.reduce((m, q, i) => (q.aaAny > (E.pairs[m]?.aaAny ?? -1) ? i : m), 0);
    io.save(`${cfg}-${pos}-${mode}-aa`.replace(/[^\w.-]/g, '_'), { [`f${2 * worst + 1}`]: bufs[2 * worst], [`f${2 * worst + 2}`]: bufs[2 * worst + 1] });
  }
  rec.ms = Date.now() - t0;
  return rec;
}
export const line = (r) => `${String(r.cfg).padEnd(12)} ${r.pos.padEnd(6)} ${r.mode.padEnd(5)} ${r.stable ? 'STABLE' : 'unstable'} settled ${r.settled ? 'y' : 'N'}(${r.settleShots}) pairs ${r.pairs.map((q) => `${q.aaAny}/${q.aa8}/${q.max}`).join(' ')} env ${r.envPixels} blind ${r.envBlind} geo ${r.geoFresh.length}`
  + (r.judge ? ` R3 ${r.judge.tier} ab ${r.judge.abAny} aboveEnv ${r.judge.aboveEnv} beyond ${r.judge.beyond} shade ${r.judge.largestShadeAboveEnv} geoArm ${r.geoArm.length}` : '')
  + (r.locator?.length ? ` at ${r.locator[0].who?.[0] ?? '?'}` : '') + (r.maskDropped.length ? ` DROPPED ${r.maskDropped.join(',')}` : '');
