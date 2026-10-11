// Per downward flick in a herouser record: touch start, title-heading 35% crossing (y>=242, derived geometry,
// research/design-engineering/hero.md 2C), card flip (y>=610, phone 0.72 flip seen at 603->622), first rest, the
// page's own settle, next touch; long frames (>34/>50) from the flip to the next touch, bucketed by time since the
// crossing: the 'o' timeline on the original is is-stack at +1300, is-expanded at +1420, width transition to +2340.
import fs from 'node:fs';
const [f, yCross = 242, yFlip = 610] = process.argv.slice(2).map((a, i) => (i ? Number(a) : a));
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const fr = j.frames;
const S = j.touches.filter((t) => t[1] === 's');
const E = j.touches.filter((t) => t[1] === 'e');
const out = [];
for (let k = 0; k < S.length; k++) {
  const s = S[k], e = E.find((x) => x[0] > s[0]);
  if (!e || e[5] <= s[5] + 20) continue; // keep only downward scrolls (scrollY grows)
  const next = S[k + 1]?.[0] ?? fr.at(-1)[0];
  const seg = fr.filter((x) => x[0] > s[0] && x[0] <= next);
  const cross = seg.find((x) => x[2] >= yCross);
  const flip = seg.find((x) => x[2] >= yFlip);
  // first rest: two consecutive frames with equal y after the flip
  let rest = null;
  for (let i = 1; i < seg.length; i++) if (seg[i][2] === seg[i - 1][2] && seg[i][0] > (flip?.[0] ?? 0)) { rest = seg[i - 1]; break; }
  // settle: last y change before the next touch
  let settle = null;
  for (let i = seg.length - 1; i > 0; i--) if (seg[i][2] !== seg[i - 1][2]) { settle = seg[i]; break; }
  const maxY = Math.max(...seg.map((x) => x[2]));
  const tc = cross?.[0];
  const buckets = { flight: [], restPre: [], stack: [], widen: [], after: [] };
  const lf = seg.filter((x) => x[0] > (flip?.[0] ?? s[0]) - 1);
  for (const x of lf) {
    const moving = rest ? x[0] <= rest[0] : true;
    const rel = x[0] - tc;
    const b = moving ? 'flight' : rel < 1300 ? 'restPre' : rel < 1420 ? 'stack' : rel <= 2340 ? 'widen' : 'after';
    buckets[b].push(x);
  }
  const fmt = (a) => {
    const g34 = a.filter((x) => x[1] > 34), g50 = a.filter((x) => x[1] > 50);
    return `${a.length}fr >34 ${g34.length} >50 ${g50.length}${g34.length ? ' [' + g34.map((x) => `${x[1]}@${x[0] - tc}`).join(' ') + ']' : ''}`;
  };
  // per-2 s after first rest
  const w2 = rest ? seg.filter((x) => x[0] > rest[0] && x[0] <= rest[0] + 2000) : [];
  out.push({
    touch: s[0], cross: tc, flip: flip?.[0], flipMinusCross: flip && tc ? flip[0] - tc : null,
    rest: rest && { t: rest[0], y: rest[2], sinceCross: rest[0] - tc }, maxY, settle: settle && { t: settle[0], y: settle[2] },
    nextTouch: next, stillMs: rest ? next - rest[0] : null,
    oStackAt: tc + 1300, oWidenEnd: tc + 2340, oFires: tc + 1300 < next,
    after2s: fmt(w2),
    buckets: Object.fromEntries(Object.entries(buckets).map(([k2, v]) => [k2, fmt(v)])),
  });
}
console.log(JSON.stringify(out, null, 1));
