// Per-frame tags for frames over 34 ms (incident I-032, protocol v2 §6.2 "Per-frame tags for frames >34:
// scrollY, trace class, top LoAF script / paint source, layer delta"), verify.json run.longFrames.<phase>.
//
// Opt-in by construction: a default run's logger keeps frame durations only (no timestamps), so tags are built
// only from a source that has them: --frame-log ([t, dt, scrollY] per frame: the only scrollY source; reading
// scrollY in rAF is why --frame-log is opt-in), --trace-frames (the trace recorder's rAF timestamps; it does
// NOT read scrollY, so a traced run without --frame-log has scrollY null), --paint-rects (the binding recorder).
// The base list is the first source present in that order; the others are joined by start time and duration
// (within 0.6 ms: the frame log rounds to 0.1 ms).
//
// Selection: dt > 34 ms, the legacy threshold, a superset of the tick rule; `ticks` (k = round(dt / 8.333),
// §3.2) lets analysis keep k >= 5 only.
import { ticksOf } from './trace-frames.mjs';

const r1 = (x) => Math.round(x * 10) / 10;
const near = (a, b) => Math.abs(a.t - b.t) <= 0.6 && Math.abs(a.dur - b.dur) <= 0.6;

/** The LoAF entry overlapping [t, t + dur] most (null if none): {dur, script, scriptMs, forcedMs, renderMs, styleLayoutMs}. */
export function loafFor(frame, loaf, scriptKey = (s) => `${s.url}:${s.pos} ${s.fn || ''}`) {
  let best = null, bestOv = 0;
  for (const e of loaf || []) {
    const ov = Math.min(frame.t + frame.dur, e.start + e.duration) - Math.max(frame.t, e.start);
    if (ov > bestOv) { best = e; bestOv = ov; }
  }
  if (!best) return null;
  const top = [...(best.scripts || [])].sort((a, b) => b.dur - a.dur)[0];
  return { dur: Math.round(best.duration), script: top ? scriptKey(top) : null, scriptMs: top ? Math.round(top.dur) : 0, forcedMs: top ? Math.round(top.forced || 0) : 0,
    renderMs: Math.round(best.render || 0), styleLayoutMs: Math.round(best.styleLayout || 0) };
}

/**
 * One phase. frameLog: [[tEnd, dt, scrollY]] | null; trace: attributeFrames().frames (frames > 20 ms) | null;
 * paint: analyzePaints().tagFrames[phase] | null; loaf: the phase's LoAF entries; layerNodes: {layerId: label}.
 * Returns [{t, dur, ticks, scrollY, class, top, layerMs, dropped, partial, loaf, paint, layers, layersDelta}] or
 * null when no source has frame timestamps.
 */
export function longFrameTags({ frameLog = null, trace = null, paint = null, loaf = [], minMs = 34, scriptKey, layerNodes = {} } = {}) {
  let base = null, source = null;
  if (frameLog) { base = frameLog.map(([tEnd, dt, y]) => ({ t: tEnd - dt, dur: dt, scrollY: y })); source = 'frame-log'; }
  else if (paint) { base = paint.map((f) => ({ t: f.t, dur: f.dur, scrollY: null })); source = 'paint-rects'; }
  else if (trace) { base = trace.map((f) => ({ t: f.t, dur: f.dur, scrollY: null })); source = 'trace-frames'; }
  if (!base) return null;
  const out = [];
  for (const f of base) {
    if (!(f.dur > minMs)) continue;
    const tf = trace ? trace.find((x) => near(x, f)) : null;
    const pf = paint ? paint.find((x) => near(x, f)) : null;
    out.push({
      t: r1(f.t), dur: r1(f.dur), ticks: ticksOf(f.dur), scrollY: f.scrollY ?? null,
      class: tf ? tf.dominant : null, top: tf ? tf.top[0]?.[0] ?? null : null,
      ...(tf ? { layerMs: tf.layerMs, dropped: tf.dropped, partial: tf.partial } : {}),
      loaf: loafFor(f, loaf, scriptKey),
      paint: pf ? { paints: pf.paints, mpx: pf.mpx, layerMpx: pf.layerMpx ?? null, topLayer: pf.topLayer ? { ...pf.topLayer, node: layerNodes[pf.topLayer.layerId] ?? null } : null } : null,
      layers: pf ? pf.layers : null, layersDelta: pf ? pf.layersDelta : null,
      source,
    });
  }
  return out;
}
