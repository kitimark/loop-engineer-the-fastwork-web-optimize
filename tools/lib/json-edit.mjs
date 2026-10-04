// Edits of a hand-laid-out JSON file that keep every byte outside the changed value (ts-threads, the lead after the
// T-104 team measurement: mgmt-ops' slowest work was hand-editing the compact fixes/PROGRESS.json). Used by
// `console.mjs progress set|best` (tools/lib/progress-edit.mjs), so an edit makes a diff of the changed lines only.
//
// Paths: `build.since`, `items[3].state`, `items[id=cd-strip].checks[0].result`, `changes[^]` (a new first entry),
// `versions[+]` (a new last entry). Keys are [A-Za-z0-9_$-]+.
// Layout of a new value: the value it replaces is the template (else a sibling: the last entry for [+], the first
// for [^]); a container whose template spans several lines gets one member per line (the file's indent, children
// templated by key or position), otherwise one line, with the template's padding (`{ "a": 1 }` or `{"a": 1}`).
// A new key goes last in its object (or right after the key named by `after`); delete removes the member and its comma.
// Every edit is checked: the new text must parse to exactly the edited object, or editJson throws.

const SEG = /^(?:([A-Za-z0-9_$-]+)|\[(\d+)\]|\[id=([^\]\s]+)\]|\[(\+|\^)\])/;

/** 'items[id=x].best[0]' -> [{key:'items'}, {id:'x'}, {key:'best'}, {index:0}]. Throws on a bad path. */
export function parsePath(s) {
  const bad = (why) => new Error(`bad path ${JSON.stringify(s)}: ${why} (like build.since, items[id=cd-strip].next, changes[^], versions[+])`);
  if (typeof s !== 'string' || !s) throw bad('empty');
  const out = [];
  let rest = s;
  while (rest) {
    if (out.length && !rest.startsWith('[')) { if (!rest.startsWith('.')) throw bad(`unexpected "${rest[0]}"`); rest = rest.slice(1); if (rest.startsWith('[')) throw bad('"." before "["'); }
    const m = SEG.exec(rest);
    if (!m) throw bad(`cannot read "${rest}"`);
    if (m[1] !== undefined) out.push({ key: m[1] });
    else if (m[2] !== undefined) out.push({ index: Number(m[2]) });
    else if (m[3] !== undefined) out.push({ id: m[3] });
    else out.push(m[4] === '+' ? { append: true } : { prepend: true });
    if (!out.length || (out.length === 1 && m[1] === undefined)) throw bad('starts with a key');
    rest = rest.slice(m[0].length);
  }
  if (out.slice(0, -1).some((g) => g.append || g.prepend)) throw bad('[+] and [^] only at the end');
  return out;
}

export const pathText = (segs) => segs.map((g, i) => (g.key !== undefined ? `${i ? '.' : ''}${g.key}` : g.index !== undefined ? `[${g.index}]` : g.id !== undefined ? `[id=${g.id}]` : g.append ? '[+]' : '[^]')).join('');

/** The value tree with offsets: {type: object|array|scalar, start, end, members: [{key, start, node}] | items: [{start, node}]}. */
export function parseTree(text) {
  let i = 0;
  const fail = (m) => { throw new Error(`not JSON at offset ${i}: ${m}`); };
  const ws = () => { while (i < text.length && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i++; };
  const str = () => {
    i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; else if (text[i] === '\n') fail('newline in a string'); i++; }
    if (text[i] !== '"') fail('unterminated string');
    return ++i;
  };
  function value() {
    ws();
    const start = i, c = text[i];
    if (c === '{' || c === '[') {
      const obj = c === '{', close = obj ? '}' : ']', list = [];
      i++; ws();
      if (text[i] === close) { i++; return obj ? { type: 'object', start, end: i, members: list } : { type: 'array', start, end: i, items: list }; }
      for (;;) {
        ws();
        const s = i;
        if (obj) {
          if (text[i] !== '"') fail('expected a key');
          const key = JSON.parse(text.slice(s, str()));
          ws(); if (text[i] !== ':') fail('expected ":"'); i++;
          list.push({ key, start: s, node: value() });
        } else list.push({ start: s, node: value() });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === close) { i++; break; }
        fail(`expected "," or "${close}"`);
      }
      return obj ? { type: 'object', start, end: i, members: list } : { type: 'array', start, end: i, items: list };
    }
    if (c === '"') return { type: 'scalar', start, end: str() };
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 400));
    if (!m) fail('unexpected character');
    i += m[0].length;
    return { type: 'scalar', start, end: i };
  }
  const root = value();
  ws();
  if (i !== text.length) fail('text after the end');
  JSON.parse(text); // the scanner is lenient on escapes and numbers; JSON.parse is the judge
  return root;
}

const entries = (n) => (n.type === 'object' ? n.members : n.items);

/**
 * Apply edits in order: [{path, value, after?} | {path, delete: true}]. path: a string or parsePath() segments.
 * Returns the new text. Throws (naming the path) on a missing parent, an index out of range, no or several [id=x]
 * matches, or a file that is not JSON.
 */
export function editJson(text, edits) {
  for (const e of edits) text = editOne(text, e);
  return text;
}

function editOne(text, e) {
  const segs = typeof e.path === 'string' ? parsePath(e.path) : e.path;
  if (!e.delete && e.value === undefined) throw new Error(`${pathText(segs)}: no value`);
  const root = parseTree(text);
  const data = JSON.parse(text);
  const unit = lineIndent(text, root.type === 'object' && root.members.length ? root.members[0].start : 0) || ' ';
  // walk to the parent
  let node = root, val = data;
  for (let k = 0; k < segs.length - 1; k++) {
    const r = step(node, val, segs[k], segs.slice(0, k + 1), false);
    node = r.entry.node; val = r.val;
  }
  const last = segs.at(-1), at = pathText(segs);
  const fmtCtx = { text, unit };
  let out, expected;
  if (last.append || last.prepend) {
    if (node.type !== 'array') throw new Error(`${pathText(segs.slice(0, -1))}: [${last.append ? '+' : '^'}] needs an array`);
    if (e.delete) throw new Error(`${at}: nothing to delete`);
    out = addEntry(fmtCtx, node, null, e.value, last.prepend ? 'first' : null);
    expected = () => { last.prepend ? val.unshift(e.value) : val.push(e.value); };
  } else {
    const r = step(node, val, last, segs, true);
    if (r.entry) {
      if (e.delete) { out = removeEntry(text, node, r.pos); expected = () => { if (Array.isArray(val)) val.splice(r.pos, 1); else delete val[last.key]; }; }
      else { out = text.slice(0, r.entry.node.start) + fmt(fmtCtx, e.value, r.entry.node, lineIndent(text, r.entry.node.start)) + text.slice(r.entry.node.end); expected = () => { if (Array.isArray(val)) val[r.pos] = e.value; else val[last.key] = e.value; }; }
    } else {
      if (e.delete) throw new Error(`${at}: no such key`);
      out = addEntry(fmtCtx, node, last.key, e.value, e.after);
      expected = () => {
        const ks = Object.keys(val), ai = e.after !== undefined ? ks.indexOf(e.after) : -1;
        if (ai < 0) { val[last.key] = e.value; return; }
        const copy = { ...val };
        for (const k of ks) delete val[k];
        ks.forEach((k, j) => { val[k] = copy[k]; if (j === ai) val[last.key] = e.value; });
      };
    }
  }
  expected();
  let got;
  try { got = JSON.parse(out); } catch (err) { throw new Error(`${at}: internal error, the edit made invalid JSON (${err.message}); nothing written`); }
  if (JSON.stringify(got) !== JSON.stringify(data)) throw new Error(`${at}: internal error, the edited text does not match the edited object; nothing written`);
  return out;
}

/** One path step: {entry, pos, val}. `final`: a missing key is not an error (it is added). */
function step(node, val, seg, segs, final) {
  const here = pathText(segs), parent = pathText(segs.slice(0, -1)) || 'the top level';
  if (node.type === 'scalar') throw new Error(`${parent}: not an object or array`);
  if (seg.key !== undefined) {
    if (node.type !== 'object') throw new Error(`${here}: ${parent} is an array (use [n] or [id=x])`);
    const pos = node.members.findIndex((m) => m.key === seg.key);
    if (pos < 0) { if (final) return { entry: null, pos }; throw new Error(`${here}: no such key`); }
    return { entry: node.members[pos], pos, val: val[seg.key] };
  }
  if (node.type !== 'array') throw new Error(`${here}: ${parent} is not an array`);
  let pos;
  if (seg.index !== undefined) {
    pos = seg.index;
    if (pos >= node.items.length) throw new Error(`${here}: index out of range (${node.items.length} entries)`);
  } else {
    const hits = val.map((x, i) => (x && typeof x === 'object' && String(x.id) === seg.id ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) throw new Error(`${here}: no entry with "id": "${seg.id}" (ids: ${val.map((x) => x?.id).filter((x) => x !== undefined).join(', ') || 'none'})`);
    if (hits.length > 1) throw new Error(`${here}: ${hits.length} entries with "id": "${seg.id}" (${hits.map((i) => `[${i}]`).join(', ')})`);
    pos = hits[0];
  }
  return { entry: node.items[pos], pos, val: val[pos] };
}

function lineIndent(text, pos) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(ls, pos))[0];
}

const multiLine = (text, n) => text.slice(n.start, n.end).includes('\n');

/** The JSON text of v, laid out like template node t (or on one line without one). */
function fmt(ctx, v, t, ind) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const arr = Array.isArray(v), tt = t && t.type === (arr ? 'array' : 'object') ? t : null;
  const [open, close] = arr ? ['[', ']'] : ['{', '}'];
  const list = arr ? v.map((x, i) => [null, x]) : Object.entries(v).filter(([, x]) => x !== undefined);
  if (!list.length) return open + close;
  const childT = (k, i) => {
    if (!tt) return null;
    if (!arr) return tt.members.find((m) => m.key === k)?.node || null;
    return (tt.items[i] || tt.items.at(-1))?.node || null;
  };
  const kv = (k, x, i, cind) => (k === null ? '' : `${JSON.stringify(k)}: `) + fmt(ctx, x, childT(k, i), cind);
  if (tt && multiLine(ctx.text, tt) && entries(tt).length) {
    const inner = lineIndent(ctx.text, entries(tt)[0].start);
    const cind = inner.length > ind.length ? inner : ind + ctx.unit;
    return `${open}\n${list.map(([k, x], i) => cind + kv(k, x, i, cind)).join(',\n')}\n${ind}${close}`;
  }
  const pad = tt && entries(tt).length ? (ctx.text[tt.start + 1] === ' ' ? ' ' : '') : arr ? '' : ' ';
  return open + pad + list.map(([k, x], i) => kv(k, x, i, ind)).join(', ') + pad + close;
}

/** Add a member (key) or an entry (key null) to container node: last, after the key named by `after`, or 'first'. */
function addEntry(ctx, node, key, v, after) {
  const { text } = ctx, list = entries(node), arr = node.type === 'array';
  const head = key === null ? '' : `${JSON.stringify(key)}: `;
  if (!list.length) {
    if (!multiLine(text, node)) return text.slice(0, node.start) + fmt(ctx, arr ? [v] : { [key]: v }, null, '') + text.slice(node.end);
    const ind = lineIndent(text, node.start), inner = ind + ctx.unit;
    const close = text.slice(node.end - 1, node.end);
    return text.slice(0, node.start) + `${arr ? '[' : '{'}\n${inner}${head}${fmt(ctx, v, null, inner)}\n${ind}${close}` + text.slice(node.end);
  }
  const multi = text.slice(node.start, list[0].start).includes('\n');
  if (after === 'first') {
    const first = list[0], ind = lineIndent(text, first.start);
    return text.slice(0, first.start) + head + fmt(ctx, v, first.node, ind) + (multi ? `,\n${ind}` : ', ') + text.slice(first.start);
  }
  let ref = list.at(-1);
  if (!arr && after !== undefined && after !== null) ref = list.find((m) => m.key === after) || ref;
  const ind = lineIndent(text, ref.start);
  const tmpl = arr ? list.at(-1).node : null;
  return text.slice(0, ref.node.end) + (multi ? `,\n${ind}` : ', ') + head + fmt(ctx, v, tmpl, ind) + text.slice(ref.node.end);
}

function removeEntry(text, node, pos) {
  const list = entries(node);
  if (list.length === 1) return text.slice(0, node.start + 1) + text.slice(node.end - 1);
  if (pos < list.length - 1) return text.slice(0, list[pos].start) + text.slice(list[pos + 1].start);
  return text.slice(0, list[pos - 1].node.end) + text.slice(list[pos].node.end);
}
