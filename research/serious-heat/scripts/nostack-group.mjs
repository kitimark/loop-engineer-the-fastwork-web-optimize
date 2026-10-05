// Groups nostack.json keys by context class: Composite in the chain / RecalculateStyles / ObserverCallback / RenderingFrame only / top-level.
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cls = (k) => { const ctx = k.split(' | ')[1]; return ctx.includes('Composite') ? 'in Composite' : ctx.includes('RecalculateStyles') ? 'in RecalculateStyles' : ctx.includes('ObserverCallback') ? 'in ObserverCallback' : ctx === 'top-level' ? 'top-level' : 'in RenderingFrame only'; };
for (const [lab, s] of Object.entries(j)) {
  const rows = {};
  for (const part of ['heavy', 'control', 'outOfViewStep']) for (const [k, v] of Object.entries(s[part])) { const c = cls(k), n = +v.split(' ')[0]; rows[c] ||= { heavy: 0, control: 0, outOfViewStep: 0 }; rows[c][part] += n; }
  const F = s.frames; console.log(`${lab}: frames heavy ${F.heavy}, control ${F.ctrl}, out-of-view step ${F.outStep}`);
  const tot = { heavy: 0, control: 0, outOfViewStep: 0 };
  for (const [c, r] of Object.entries(rows)) { for (const p in tot) tot[p] += r[p]; console.log(`  ${c}: heavy ${r.heavy} (${(r.heavy / F.heavy).toFixed(2)}/f), control ${r.control} (${(r.control / F.ctrl).toFixed(2)}/f), out-of-view step ${r.outOfViewStep} (${(r.outOfViewStep / F.outStep).toFixed(2)}/f)`); }
  console.log(`  total: heavy ${tot.heavy} (${(tot.heavy / F.heavy).toFixed(2)}/f), control ${tot.control} (${(tot.control / F.ctrl).toFixed(2)}/f), out-of-view ${tot.outOfViewStep} (${(tot.outOfViewStep / F.outStep).toFixed(2)}/f)`);
}
