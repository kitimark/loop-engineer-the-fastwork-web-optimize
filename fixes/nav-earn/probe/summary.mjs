#!/usr/bin/env node
// nav-earn: per-frame summary of earn-probe.mjs output (open and close of the end-of-page morph).
//   node fixes/nav-earn/probe/summary.mjs out/nav-earn/probe-<tag> [...]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const out = [];
for (const d of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(join(d, 'probe.json'), 'utf8'));
  for (const r of j.runs) {
    const S = r.samples, m = (x) => +x.morph || 0, isM = (x) => /is-morphing/.test(x.cls);
    const step = { logo: 0, earn: 0, lang: 0 };
    for (let i = 1; i < S.length; i++) for (const [k, f] of [['logo', 'logoLeft'], ['earn', 'earnW'], ['lang', 'langRight']]) step[k] = Math.max(step[k], +Math.abs(S[i][f] - S[i - 1][f]).toFixed(2));
    const iOpen = S.findIndex((x) => x.t >= r.tOpen && isM(x));
    const open = S.filter((x) => x.t >= r.tOpen && x.t < r.tClose);
    const f02 = open.find((x) => m(x) >= 0.2), w0 = open.find((x) => x.earnW <= 0.5);
    const cl = S.filter((x) => x.t >= r.tClose), iLast = cl.findLastIndex(isM), after = cl[iLast + 1], lastM = cl[iLast];
    const full = S[0].earnW, back = cl.find((x) => x.earnW >= full - 0.5);
    const row = {
      vp: r.vp, arm: r.arm, css: r.served.css,
      earnGoneMs: w0 && Math.round(w0.t - r.tOpen), morph02Ms: f02 && Math.round(f02.t - r.tOpen), lagMs: f02 && w0 ? Math.round(w0.t - f02.t) : null,
      earnWAtMorph02: f02?.earnW, langRightAtMorph02: f02?.langRight, langRightBefore: S[0].langRight,
      firstMorphFrame: { m: +m(S[iOpen]).toFixed(3), logoBefore: S[iOpen - 1].logoLeft, logoAfter: S[iOpen].logoLeft },
      maxStepPx: step,
      close: { lastMorphingM: +m(lastM).toFixed(4), logo: [lastM.logoLeft, after?.logoLeft], earnW: [lastM.earnW, after?.earnW], earnFullAtMs: back ? Math.round(back.t - r.tClose) : null, morphEndMs: after ? Math.round(after.t - r.tClose) : null },
      errors: r.errors.length, http4xx: r.failed404.length,
    };
    out.push(row); console.log(JSON.stringify(row));
  }
}
