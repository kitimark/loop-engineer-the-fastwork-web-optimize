// Per fast swipe (touch <= 150 ms) in a finger capture: how much of the finger's travel the page had scrolled by
// touchend, and whether any rAF frame during the touch saw the page move (rev 6/7's settle read its speed from rAF
// frames, so with none it decided on a page "at rest"). D card for rev 7c.
// Usage: node fixes/morph-scroll/finger-liftdelay.mjs out/morph-scroll/cap/C-052-p1-a2.json [...]
import { readFileSync } from 'node:fs';
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2) : null; };
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8')), fr = j.frames;
  let s = null, n = 0, noFrame = 0; const share = [], firstMove = [];
  for (const t of j.touches) {
    if (t[1] === 's' && s == null) s = t;
    if ((t[1] === 'e' || t[1] === 'c') && t[2] === 0 && s) {
      const dur = t[0] - s[0], finger = Math.abs(t[6] - s[6]);
      if (dur <= 150 && finger >= 40) {
        n++;
        share.push(Math.abs(t[5] - s[5]) / finger);
        const during = fr.filter((x) => x[0] > s[0] && x[0] <= t[0]);
        if (!during.some((x) => x[2] !== s[5])) noFrame++;
        // the first touch event (move or end) whose scrollY differs from the start: ms before touchend
        const mv = j.touches.find((x) => x[0] >= s[0] && x[0] <= t[0] && x[5] !== s[5]);
        if (mv) firstMove.push(t[0] - mv[0]);
      }
      s = null;
    }
  }
  console.log(`${j.label}: fast swipes ${n}; no rAF frame saw the page move before lift: ${noFrame}; page travel at touchend / finger travel: median ${q(share, 0.5)} p90 ${q(share, 0.9)}; page first moved ms before touchend: median ${q(firstMove, 0.5)} max ${q(firstMove, 1)}`);
}
