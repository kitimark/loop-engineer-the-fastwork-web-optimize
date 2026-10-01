// Stand-in for an in-page logger module in the `iphone.mjs gesture --inject` test (I-038): install starts a rAF
// logger in morph-log's frame format ([t, dt, scrollY, --morph, nav classes]) on the run's own connection, read stops
// it and returns {frames, summary} as a JSON string. morph: true feeds run.morph / summary.morph.
export const name = 'fake-mlog';
export const morph = true;
export const install = ({ seg, label }) => `(() => {
  const r = window.__inj = { seg: ${seg}, label: ${JSON.stringify(label)}, frames: [], stop: false };
  let last = performance.now();
  const loop = (t) => { if (r.stop) return; r.frames.push([Math.round(t), Math.round(t - last), Math.round(scrollY), 1, 'm']); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return 'ok';
})()`;
export const read = `(() => { const r = window.__inj; if (!r) return null; r.stop = true; return JSON.stringify({ frames: r.frames, summary: { frames: r.frames.length, seg: r.seg, label: r.label } }); })()`;
