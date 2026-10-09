// people-blink phone reader (attribution, descriptive only): one row per fling (gesture segment) per arm from
//   out/pbp/g-<ARM>-<TS>.json   gesture record: marks, sync [macBefore, pageT, macAfter], inject (pb-log.mjs), timeline
//   out/pbp/tl-<ARM>-<TS>[-seg<i>].json   WebKit Timeline per segment (Timeline ms = page ms + offsetMs)
//   out/iphone-screen/*pb-<ARM>-<TS>-*.frames.json   ioscap frame PTS (host uptime seconds) + per-frame hash
// Usage: node fixes/people-blink/phone/pb-phone-read.mjs <TS> [ARM...] [--mono-off <ms>]
// --mono-off: wall ms = PTS s * 1000 + off (mach uptime clock to wall; measure with python3 time.monotonic() next to
// time.time() on the same Mac with no sleep in between; the default is the 2026-10-09 06:45Z reading).
// Times in the table are page ms after the fling mark (the WDA stroke is sent right after it).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const oi = args.indexOf('--mono-off');
const MONO_OFF = oi >= 0 ? Number(args.splice(oi, 2)[1]) : 1790444203298;
const [TS, ...armsArg] = args;
if (!TS) { console.error('usage: pb-phone-read.mjs <TS> [ARM...] [--mono-off ms]'); process.exit(2); }
const ARMS = armsArg.length ? armsArg : ['V', 'B', 'K'];
const OUT = 'out/pbp', SCR = 'out/iphone-screen';
const DECK_TOP = 1182; // document y of .start-selling-profile-deck on the phone (pb-log geom, all arms)
const r1 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x));
const rows = [];
for (const arm of ARMS) {
  const gf = join(OUT, `g-${arm}-${TS}.json`);
  if (!existsSync(gf)) { console.log(`${arm}: no gesture record ${gf}`); continue; }
  const g = JSON.parse(readFileSync(gf, 'utf8'));
  const scrF = readdirSync(SCR).find((f) => f.includes(`pb-${arm}-${TS}`) && f.endsWith('.frames.json'));
  const scr = scrF ? JSON.parse(readFileSync(join(SCR, scrF), 'utf8')).frames.map(([pts, h]) => [pts * 1000 + MONO_OFF, h]) : [];
  for (const seg of g.run.segments) {
    const si = g.run.segments.indexOf(seg);
    const inj = g.run.inject.find((x) => x.seg === si)?.value;
    const mk = Object.fromEntries((seg.marks || []).map(([t, n]) => [n, t]));
    if (!inj || mk.fling == null) continue;
    const tF = mk.fling;
    const s0 = seg.sync[0], toWall = (t) => t - s0[1] + (s0[0] + s0[2]) / 2;
    const f = inj.f.filter(([t]) => t >= tF - 500);
    const y0 = f.find(([t]) => t >= tF)?.[1] ?? 0;
    const mv = f.find(([t, y]) => t >= tF && y > y0 + 1);
    let tStop = null, yLand = null;
    for (let i = f.length - 1; i > 0; i--) if (Math.abs(f[i][1] - f[i - 1][1]) >= 1) { tStop = f[i][0]; yLand = f[i][1]; break; }
    const tNear = yLand != null ? (f.find(([t, y]) => t >= tF && y >= yLand - 20)?.[0] ?? null) : null; // within 20 px of the landing
    const vh = inj.geom?.vh || 815;
    const deckIn = f.find(([t, y]) => t >= tF && y + vh > DECK_TOP)?.[0] ?? null;
    const yAt = (t) => { let y = null; for (const [ft, fy] of inj.f) { if (ft <= t) y = fy; else break; } return y; };
    const flip = inj.m.find(([t, n, a, d]) => t >= tF && /section#people/.test(n) && a === 'class' && /\+is-visible/.test(d));
    const ev = inj.ev.filter(([t]) => t >= tF);
    const tr = (k, p) => ev.find(([, e, n, pp]) => e === k && /future-card/.test(n) && pp === p)?.[0] ?? null;
    const fadeStart = tr('transitionstart', 'opacity'), opEnd = tr('transitionend', 'opacity'), blurEnd = tr('transitionend', 'filter');
    const tEnd = (tStop ?? tF + 3000) + 1500;
    const imgs = ev.filter(([t, e]) => e === 'imgload' && t <= tEnd);
    const imgsDeck = imgs.filter(([t]) => deckIn != null && t >= deckIn);
    const wc = inj.m.filter(([t, n, a]) => t >= tF && t <= tEnd && a === 'data-fw-wc');
    const ww = inj.f.filter(([t]) => t >= (mv?.[0] ?? tF) - 100 && t <= tEnd);
    const gaps = []; for (let i = 1; i < ww.length; i++) gaps.push([ww[i][0] - ww[i - 1][0], ww[i][0]]);
    const flipGap = flip ? Math.max(0, ...gaps.filter(([, t]) => t >= flip[0] && t <= flip[0] + 200).map(([d]) => d)) : null;
    // Timeline
    const tl = g.run.timeline?.find((x) => x.seg === si);
    let tlr = null;
    if (tl && existsSync(tl.file)) {
      const T = JSON.parse(readFileSync(tl.file, 'utf8')), off = T.offsetMs;
      const pg = (s) => s * 1000 - off;
      const acc = { frames: 0, f34: 0, f50: 0, fMax: 0, paintN: 0, paintMs: 0, layoutMs: 0, styleMs: 0, compMs: 0, fMaxAt: null, fAtFlip: null };
      const walk = (r) => {
        const a = pg(r.startTime), b = r.endTime != null ? pg(r.endTime) : a, d = b - a;
        const inW = a >= (mv?.[0] ?? tF) - 100 && a <= tEnd;
        if (inW) {
          if (r.type === 'RenderingFrame') { acc.frames++; if (d > 34) acc.f34++; if (d > 50) acc.f50++; if (d > acc.fMax) { acc.fMax = d; acc.fMaxAt = a - tF; } if (flip && a <= flip[0] + 200 && a >= flip[0] - 20) acc.fAtFlip = Math.max(acc.fAtFlip ?? 0, d); }
          else if (r.type === 'Paint') { acc.paintN++; acc.paintMs += d; }
          else if (r.type === 'Layout') acc.layoutMs += d;
          else if (r.type === 'RecalculateStyles') acc.styleMs += d;
          else if (r.type === 'Composite') acc.compMs += d;
        }
        (r.children || []).forEach(walk);
      };
      T.recs.forEach(walk);
      tlr = acc;
    }
    // screen (ioscap) in the same window, mapped to wall ms
    const wa = toWall((mv?.[0] ?? tF) - 100), wb = toWall(tEnd);
    const sf = scr.filter(([w]) => w >= wa && w <= wb);
    const sg = []; for (let i = 1; i < sf.length; i++) sg.push(sf[i][0] - sf[i - 1][0]);
    let rep = 0; for (let i = 1; i < sf.length; i++) if (sf[i][1] === sf[i - 1][1]) rep++;
    const rel = (t) => (t == null ? null : r1(t - tF));
    rows.push({ arm, seg: si, ko: inj.ko, y0: r1(y0), yLand: r1(yLand), move: rel(mv?.[0]), near: rel(tNear), stop: rel(tStop), deckIn: rel(deckIn),
      flip: rel(flip?.[0]), flipY: r1(flip ? yAt(flip[0]) : null), fadeStart: rel(fadeStart), opEnd: rel(opEnd), blurEnd: rel(blurEnd),
      blurAfterStop: blurEnd != null && tStop != null ? r1(blurEnd - tStop) : null, blurAfterNear: blurEnd != null && tNear != null ? r1(blurEnd - tNear) : null, yAtBlurEnd: r1(blurEnd != null ? yAt(blurEnd) : null),
      unrevealedMs: deckIn != null ? r1((fadeStart ?? deckIn) - deckIn) : null,
      imgs: imgs.length, imgsAfterDeckIn: imgsDeck.length, lastImg: rel(imgs.at(-1)?.[0]), wcFlips: wc.length,
      raf: { n: ww.length, gt34: gaps.filter(([d]) => d > 34).length, gt50: gaps.filter(([d]) => d > 50).length, max: r1(Math.max(0, ...gaps.map(([d]) => d))), atFlip: r1(flipGap) },
      tl: tlr && { frames: tlr.frames, gt34: tlr.f34, gt50: tlr.f50, max: r1(tlr.fMax), maxAt: r1(tlr.fMaxAt), atFlip: r1(tlr.fAtFlip), paintN: tlr.paintN, paintMs: r1(tlr.paintMs), layoutMs: r1(tlr.layoutMs), styleMs: r1(tlr.styleMs) },
      screen: scr.length ? { n: sf.length, gt34: sg.filter((d) => d > 34).length, gt50: sg.filter((d) => d > 50).length, max: r1(Math.max(0, ...sg)), repeats: rep, spanMs: r1(wb - wa) } : null });
  }
}
console.log('arm seg | y0->land | move near20 stop deckIn | flip@y fadeStart opEnd blurEnd@y | blur after near20 | deck unrevealed | imgs (after deck in) last | wc | rAF n >34 >50 max atFlip | TL frames >34 >50 max@t atFlip paintN/ms layout style | screen n >34 >50 max rep');
for (const r of rows) console.log(`${r.arm}${r.ko ? '(KO)' : ''} ${r.seg} | ${r.y0}->${r.yLand} | ${r.move} ${r.near} ${r.stop} ${r.deckIn} | ${r.flip}@${r.flipY} ${r.fadeStart} ${r.opEnd} ${r.blurEnd}@${r.yAtBlurEnd} | ${r.blurAfterNear} | ${r.unrevealedMs} | ${r.imgs} (${r.imgsAfterDeckIn}) ${r.lastImg} | ${r.wcFlips} | ${r.raf.n} ${r.raf.gt34} ${r.raf.gt50} ${r.raf.max} ${r.raf.atFlip} | ${r.tl ? `${r.tl.frames} ${r.tl.gt34} ${r.tl.gt50} ${r.tl.max}@${r.tl.maxAt} ${r.tl.atFlip} ${r.tl.paintN}/${r.tl.paintMs} ${r.tl.layoutMs} ${r.tl.styleMs}` : '-'} | ${r.screen ? `${r.screen.n} ${r.screen.gt34} ${r.screen.gt50} ${r.screen.max} ${r.screen.repeats}` : '-'}`);
const of = join(OUT, `read-${TS}.json`);
writeFileSync(of, JSON.stringify({ tool: 'fixes/people-blink/phone/pb-phone-read.mjs', ts: TS, monoOff: MONO_OFF, rows }, null, 1));
console.log('wrote', of);
