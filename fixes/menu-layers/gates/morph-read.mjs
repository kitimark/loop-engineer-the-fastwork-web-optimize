#!/usr/bin/env node
// de-offscreen (T-228 #110): reads out/menu-layers/morph-<arm>.json (morph-sim.mjs) and prints, per arm and state, the
// composited layers grouped as nav / panel / platform / other, with owner, compositing reasons, size, backing MB and
// paints; then the open and close steps: layer count, layers created / destroyed per step (churn), and per-layer
// repaints per step net of the null-step control (census + idle paints). --json <file> writes a compact export.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const arms = args.filter((a) => !a.startsWith('--') && a !== jsonOut);
const ARMS = arms.length ? arms : ['v0', 'f'];
const MB = (b) => Math.round(b / 1e5) / 10;

function group(o) {
  const s = `${o?.path || ''} > ${o?.sel || ''}`;
  if (/morph-panel|morph-col|morph-/.test(s)) return 'panel';
  if (/top-nav|fw-bx/.test(s)) return 'nav';
  if (/start-selling-platform/.test(s)) return 'platform';
  if (o?.sel === 'html' || /^html/.test(o?.sel || '')) return 'root';
  return 'other';
}
const short = (o) => (o?.sel || '?').replace(/start-selling-/g, '').slice(0, 46);
const rs = (r) => (r || []).map((x) => x.replace(/WithCompositedDescendants/, 'W/CD')).join(',');

const exp = {};
for (const arm of ARMS) {
  const f = join(WT, `out/menu-layers/morph-${arm}.json`);
  if (!existsSync(f)) { console.log(`no ${f}`); continue; }
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const own = new Map(); // id -> latest owner record (with reasons)
  const addOwn = (m) => { for (const [id, v] of Object.entries(m || {})) if (!v.gone) own.set(id, { ...(own.get(id) || {}), ...v }); };
  for (const k of ['a', 'b']) addOwn(r.states[k]?.owners);
  for (const S of r.open?.steps || []) addOwn(S.owners);
  addOwn(r.states.d?.owners);
  for (const S of r.close?.steps || []) addOwn(S.owners);
  addOwn(r.states.e?.owners);
  const E = (exp[arm] = { page: r.page, served: r.served, errors: r.errors, states: {}, open: [], close: [] });
  console.log(`\n=== ${arm} page ${JSON.stringify(r.page)} served ${r.served?.js}/${r.served?.css} errors ${JSON.stringify(r.errors)}`);
  const stateRows = (name, C, owners) => {
    const rows = C.layers.map((l) => { const o = owners?.[l.id] || own.get(l.id) || {}; return { id: l.id, g: group(o.owner), sel: short(o.owner), reasons: o.reasons || [], wh: [Math.round(l.b?.[2] || 0), Math.round(l.b?.[3] || 0)], xy: [Math.round(l.b?.[0] || 0), Math.round(l.b?.[1] || 0)], mb: MB(l.mem), paints: l.paints, hidden: o.owner?.hidden || null, rect: o.owner?.rect || null, style: o.owner?.style || null }; });
    const by = {}; for (const x of rows) { const b = (by[x.g] ||= { n: 0, mb: 0 }); b.n++; b.mb = Math.round((b.mb + x.mb) * 10) / 10; }
    console.log(`-- ${name}: y ${C.y} m ${C.m || 0} nav "${(C.nav || '').slice(0, 90)}" ${C.layers.length} layers ${MB(C.layers.reduce((s, l) => s + l.mem, 0))} MB  ${JSON.stringify(by)}`);
    for (const x of rows.filter((x) => x.g !== 'other')) console.log(`   ${x.g.padEnd(8)} ${String(x.id).padStart(4)} ${x.sel.padEnd(46)} ${String(x.wh.join('x')).padEnd(10)} ${String(x.mb).padStart(5)}MB p${String(x.paints).padStart(4)} [${rs(x.reasons)}]${x.hidden ? ' HIDDEN ' + x.hidden : ''}`);
    const ov = rows.filter((x) => x.reasons.length && x.reasons.every((q) => q === 'overlap' || q === 'stacking'));
    if (ov.length) console.log(`   overlap/stacking-only: ${ov.map((x) => `${x.g}:${x.sel} ${x.wh.join('x')} ${x.mb}MB [${rs(x.reasons)}]`).join(' | ')}`);
    return { y: C.y, m: C.m, nav: C.nav, n: C.layers.length, mb: MB(C.layers.reduce((s, l) => s + l.mem, 0)), by, rows };
  };
  for (const k of ['a', 'b']) if (r.states[k]) E.states[k] = stateRows(k, r.states[k].Cb, r.states[k].owners);
  // null-step control: paints per layer per interval with no morph step (two censuses per interval, as in a step)
  const nulDelta = (st) => { const out = new Map(); if (!st?.nul) return out; let prev = st.Cb; for (const N of st.nul) { const pm = new Map(prev.layers.map((l) => [l.id, l.paints])); for (const l of N.Cs.layers) { const d = l.paints - (pm.get(l.id) ?? l.paints); out.set(l.id, Math.max(out.get(l.id) || 0, d)); } prev = N.Cs; } return out; };
  const steps = (P, base, ctl, name) => {
    let prev = base; const seen = new Set(base.layers.map((l) => l.id)); const born = new Map(); const rows = [];
    for (const S of P?.steps || []) {
      const ids = new Set(S.Cs.layers.map((l) => l.id)), idsF = new Set(S.Cf.layers.map((l) => l.id)), prevIds = new Set(prev.layers.map((l) => l.id));
      const add = [...new Set([...idsF, ...ids])].filter((id) => !prevIds.has(id));
      const del = [...prevIds].filter((id) => !ids.has(id));
      const fOnly = [...idsF].filter((id) => !ids.has(id) && !prevIds.has(id));
      for (const id of add) if (!born.has(id)) born.set(id, S.dt);
      const pm = new Map(prev.layers.map((l) => [l.id, l.paints]));
      const rep = S.Cs.layers.map((l) => ({ id: l.id, d: l.paints - (pm.get(l.id) ?? 0) - (pm.has(l.id) ? (ctl.get(l.id) || 0) : 0) })).filter((x) => x.d > 0);
      const nm = (id) => { const o = own.get(id); return `${group(o?.owner)}:${short(o?.owner)}`; };
      const row = { dt: S.dt, m: S.Cs.m || '0', n: S.Cs.layers.length, nF: S.Cf.layers.length, mb: MB(S.Cs.layers.reduce((s, l) => s + l.mem, 0)), add: add.map(nm), del: del.map(nm), fOnly: fOnly.map(nm), repaint: rep.map((x) => `${nm(x.id)}+${x.d}`), nav: S.Cs.nav };
      rows.push(row);
      console.log(`   ${name} dt ${String(S.dt).padStart(3)} m ${String(row.m).slice(0, 5).padEnd(5)} L ${row.nF}/${row.n} ${row.mb}MB${add.length ? ' +[' + row.add.join(', ') + ']' : ''}${del.length ? ' -[' + row.del.join(', ') + ']' : ''}${fOnly.length ? ' Cf-only[' + row.fOnly.join(', ') + ']' : ''} repaint[${row.repaint.join(', ')}]`);
      prev = S.Cs; for (const id of ids) seen.add(id);
    }
    return rows;
  };
  if (r.open) { console.log(`-- open (stepped; repaint = paints since previous step minus the null-step control at b)`); E.open = steps(r.open, r.states.b.nul?.at(-1)?.Cs || r.states.b.Cb, nulDelta(r.states.b), 'open'); }
  const c = (r.open?.steps || []).find((S) => S.dt === 50), c5 = (r.open?.steps || []).find((S) => S.dt === 140);
  if (c) E.states.c02 = stateRows('c m~0.2 (open dt 50, Cs)', c.Cs, c.owners);
  if (c5) E.states.c05 = stateRows('c m~0.5 (open dt 140, Cs)', c5.Cs, c5.owners);
  if (r.states.d) E.states.d = stateRows('d', r.states.d.Cb, r.states.d.owners);
  if (r.close) { console.log(`-- close (stepped; control = null steps at d)`); E.close = steps(r.close, r.states.d.nul?.at(-1)?.Cs || r.states.d.Cb, nulDelta(r.states.d), 'close'); }
  if (r.states.e) E.states.e = stateRows('e', r.states.e.Cb, r.states.e.owners);
  const ctl = (st) => [...nulDelta(st)].filter(([, d]) => d > 0).map(([id, d]) => `${group(own.get(id)?.owner)}:${short(own.get(id)?.owner)}+${d}`);
  console.log(`-- null-step control paints: b [${ctl(r.states.b).join(', ')}] d [${ctl(r.states.d).join(', ')}]`);
  E.control = { b: ctl(r.states.b), d: ctl(r.states.d) };
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(exp)); console.log(`wrote ${jsonOut}`); }
