// cd-roll-ca probes: read a countdown digit's value from the page, for cd-strip's strips and for the cd-roll-ca build
// on them. strip-rb: cell k at top (k - m)*c directly in the strip. strip-rw: an uncomposited wrapper span.cdwrap at top
// -m*c inside the strip, cell k at top k*c inside it. Both: strip transform -(n - m)*c. During a cd-roll-ca roll the
// moved cells carry their own transform (k - n)*c and a top that makes them sit 0 from the strip layer (rb: top 0; rw:
// top m*c, with the wrapper at -m*c), the strip at 0. Cell k's place in the clip is its top + the wrapper's top + its own
// transform + the strip transform; the cell nearest the clip gives n = k - place / c. The probes keep their old record
// shape: ty = -n * c (what the strip alone showed before strip-rb), c = the cell pitch (the spacer's offsetHeight, which
// the bundle uses).
// READ is source text, pasted into each probe's injected script; it defines tyOf, inlOf, pxOf, cell, rollingOf,
// cellsOf (a strip's cells, with or without the wrapper) and stripOf (the strip of a cell or wrapper).
export const READ = String.raw`
  const pxOf = (t) => { const m = /translateY\((-?[\d.e+-]+)px\)/.exec(t || ''); return m ? Number(m[1]) : NaN; };
  const tyNum = (el) => { const m = getComputedStyle(el).transform; if (!m || m === 'none') return 0; const v = m.match(/matrix(3d)?\(([^)]+)\)/); if (!v) return NaN; const p = v[2].split(',').map(Number); return v[1] ? p[13] : p[5]; };
  const cell = (s) => s?.parentElement?.querySelector('.spacer')?.offsetHeight || 0;
  const topOf = (el) => parseFloat(el.style.top) || 0;
  const wrapOf = (s) => (s.firstElementChild && s.firstElementChild.classList.contains('cdwrap') ? s.firstElementChild : null);
  const cellsOf = (s) => [...(wrapOf(s) || s).children];
  const stripOf = (el) => el?.closest?.('.strip') || null;
  const nAt = (s, c, comp) => {
    const w = wrapOf(s), sy = (comp ? tyNum(s) : pxOf(s.style.transform) || 0) + (w ? topOf(w) : 0); let best = null;
    const cs = cellsOf(s);
    for (let k = 0; k < cs.length; k++) { const el = cs[k]; const pos = topOf(el) + (comp ? tyNum(el) : pxOf(el.style.transform) || 0) + sy; if (!best || Math.abs(pos) < Math.abs(best.pos)) best = { k, pos }; }
    if (!best) return NaN; const n = best.k - best.pos / c; return n >= 10 ? n - 10 : n;
  };
  // computed (what the frame shows; for a Web Animation its value at the frame time) and inline/layout (what the code wrote)
  const tyOf = (s) => { const c = cell(s); return c > 0 ? -nAt(s, c, true) * c : NaN; };
  const inlOf = (s) => { const c = cell(s); return c > 0 ? -nAt(s, c, false) * c : NaN; };
  const rollingOf = (s) => cellsOf(s).some((el) => el.getAnimations().some((a) => a.playState === 'running' || a.playState === 'finished'));
`;
