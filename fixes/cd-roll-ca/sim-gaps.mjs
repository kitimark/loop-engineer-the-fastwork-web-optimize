// cd-roll-ca: when rAF stops and resumes around the visibilitychange events, per hide cycle, from a sim-hide.mjs JSON.
// Usage: node fixes/cd-roll-ca/sim-gaps.mjs out/cd-roll-ca/sim-hide-<stamp>.json
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const arm of Object.keys(j.arms)) {
  const L = j.arms[arm].log, F = L.frames;
  const hides = L.vis.filter((v) => v.hidden), shows = L.vis.filter((v) => !v.hidden);
  hides.forEach((h, k) => {
    const s = shows.find((v) => v.now > h.now);
    const last = [...F].reverse().find((f) => f.cb < h.now);
    const resumed = F.find((f) => f.cb > h.now);
    console.log(arm, k, JSON.stringify({
      hideEvent: h.now, timelineAtHide: h.tl, lastFrameBeforeHide: last?.t,
      rafStopBeforeHideMs: Math.round(h.now - last?.cb), timelineMinusLastFrame: Math.round(h.tl - last?.t),
      showEvent: s.now, timelineAtShow: s.tl, firstFrameAfterHide: resumed?.t, resumedBeforeShowMs: Math.round(s.now - resumed?.cb),
      framesBetween: F.filter((f) => f.cb > h.now && f.cb < s.now).map((f) => f.t),
    }));
  });
}
