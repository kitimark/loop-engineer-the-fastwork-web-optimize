// P-100 helpers: a minimal XML reader for `xctrace export --xpath .../table[@schema=...]` output (elements, attributes,
// text; xctrace's id/ref sharing resolved) and the per-record numbers the scorer uses. No dependencies.
export function parseXml(s) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' }, stack = [root];
  const re = /<\?[^>]*\?>|<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) { stack.pop(); continue; }
    if (m[2]) {
      const attrs = Object.fromEntries([...m[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map((x) => [x[1], unesc(x[2])]));
      const el = { tag: m[2], attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(el);
      if (!m[4]) stack.push(el);
      continue;
    }
    if (m[5] && stack.length > 1) stack[stack.length - 1].text += unesc(m[5]);
  }
  return root;
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const walk = (el, f) => { f(el); el.children.forEach((c) => walk(c, f)); };

// -> { schema, cols: [mnemonic...], rows: [[{fmt, raw} | null, ...]] } (raw: the element's own text, e.g. ns)
export function readTable(xml) {
  const root = parseXml(xml), byId = new Map();
  walk(root, (e) => e.attrs.id && byId.set(e.attrs.id, e));
  let schema = null, cols = [], rows = [];
  walk(root, (e) => {
    if (e.tag === 'schema' && !schema) { schema = e.attrs.name; cols = e.children.filter((c) => c.tag === 'col').map((c) => (c.children.find((x) => x.tag === 'mnemonic')?.text || '').trim()); }
    if (e.tag === 'row') rows.push(e.children.map((c) => { if (c.tag === 'sentinel') return null; const r = c.attrs.ref ? byId.get(c.attrs.ref) : c; return r ? { fmt: r.attrs.fmt ?? null, raw: r.text.trim() || null } : null; }));
  });
  return { schema, cols, rows };
}

// numbers per record from a table set {schema: readTable(...)}: all times in ms
export function summarize(tables) {
  const col = (t, name) => t.cols.indexOf(name);
  const out = {};
  const vs = tables['display-vsyncs-interval'];
  if (vs) {
    const ts = col(vs, 'timestamp'), du = col(vs, 'duration'), dn = col(vs, 'display-name');
    const names = [...new Set(vs.rows.map((r) => r[dn]?.fmt ?? null))];
    const main = names.length === 1 ? names[0] : names.find((n) => /built-?in|internal|main|display 1/i.test(n ?? '')) ?? names[0];
    const d = vs.rows.filter((r) => (r[dn]?.fmt ?? null) === main).map((r) => Number(r[du]?.raw) / 1e6).filter((x) => x > 0);
    const starts = vs.rows.filter((r) => (r[dn]?.fmt ?? null) === main).map((r) => Number(r[ts]?.raw) / 1e6).filter(Number.isFinite).sort((a, b) => a - b);
    const gaps = starts.slice(1).map((x, i) => x - starts[i]).filter((x) => x > 0);
    const vspan = starts.length > 1 ? (starts[starts.length - 1] - starts[0]) / 1000 : null;
    out.vsync = { display: main, displays: names.length, n: d.length, perSec: vspan ? +(starts.length / vspan).toFixed(1) : null, ...hist(gaps.length ? gaps : d) };
  }
  const ds = tables['displayed-surfaces-interval'];
  if (ds) {
    const st = col(ds, 'start'), dn = col(ds, 'display-name');
    const names = [...new Set(ds.rows.map((r) => r[dn]?.fmt ?? null))];
    const main = names.length === 1 ? names[0] : names.find((n) => /built-?in|internal|main|display 1/i.test(n ?? '')) ?? names[0];
    const starts = ds.rows.filter((r) => (r[dn]?.fmt ?? null) === main).map((r) => Number(r[st]?.raw) / 1e6).filter(Number.isFinite).sort((a, b) => a - b);
    const gaps = starts.slice(1).map((x, i) => x - starts[i]).filter((x) => x > 0);
    const span = starts.length > 1 ? (starts[starts.length - 1] - starts[0]) / 1000 : null;
    out.surfaces = { display: main, n: starts.length, perSec: span ? +(starts.length / span).toFixed(1) : null, fastPerSec: span ? +(gaps.filter((x) => x < 12.5).length / span).toFixed(2) : null, ...hist(gaps) };
  }
  const fp = tables['core-animation-fps-estimate'];
  if (fp) {
    const f = col(fp, 'fps');
    const v = fp.rows.map((r) => parseFloat(r[f]?.fmt ?? r[f]?.raw)).filter(Number.isFinite).sort((a, b) => a - b);
    out.caFps = { n: v.length, median: v.length ? v[v.length >> 1] : null, max: v.length ? v[v.length - 1] : null, over62: v.filter((x) => x > 62).length };
  }
  const th = tables['device-thermal-state-intervals'];
  if (th) out.thermal = [...new Set(th.rows.flat().map((c) => c?.fmt).filter((x) => /^(Nominal|Fair|Serious|Critical)$/.test(x ?? '')))];
  return out;
}
// interval histogram in ms: share under 12.5 ms (> 80 Hz), in [12.5, 15) (~ 66-80 Hz), around 16.7 ([15, 18.5)), longer
function hist(g) {
  const n = g.length, s = [...g].sort((a, b) => a - b), sh = (f) => (n ? +(g.filter(f).length / n).toFixed(3) : null);
  return { gaps: n, median: n ? +s[n >> 1].toFixed(2) : null, lt12_5: sh((x) => x < 12.5), b12_5_15: sh((x) => x >= 12.5 && x < 15), b15_18_5: sh((x) => x >= 15 && x < 18.5), ge18_5: sh((x) => x >= 18.5) };
}
