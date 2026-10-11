// html.mjs: a small HTML parser for the medium-check scripts (no dependencies).
//
// It builds a tree of Element / Text nodes with the few DOM members the scripts and medium-dump.js use:
// nodeType, tagName (upper case), localName, childNodes, children, parentNode, parentElement, nextElementSibling,
// getAttribute, hasAttribute, textContent, nodeValue, className, innerHTML (get and set) and remove() (the last two
// for lib/sources.mjs, which edits captions and drops the Sources section). It is not a full HTML5 parser: it handles what
// the article page and Medium pages contain (void elements, raw-text elements, self-closing SVG tags, the common
// implied end tags of p / li / option / tr / td, comments, doctype, character references) and recovers from a
// stray end tag by ignoring it.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// noscript is raw text, as in a browser with scripts on (the page medium-dump.js runs in)
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'xmp']);
// a start tag of one of these closes an open <p>
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'ul']);

// named character references (code points, so the source stays plain ASCII)
const NAMED = { amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0xa0, mdash: 0x2014, ndash: 0x2013,
  hellip: 0x2026, lsquo: 0x2018, rsquo: 0x2019, ldquo: 0x201c, rdquo: 0x201d, laquo: 0xab, raquo: 0xbb,
  times: 0xd7, rarr: 0x2192, larr: 0x2190, middot: 0xb7, bull: 0x2022, minus: 0x2212, thinsp: 0x2009,
  ensp: 0x2002, emsp: 0x2003, zwj: 0x200d, zwnj: 0x200c, copy: 0xa9, reg: 0xae, deg: 0xb0,
  plusmn: 0xb1, frac12: 0xbd, le: 0x2264, ge: 0x2265, asymp: 0x2248, ne: 0x2260, hairsp: 0x200a };

export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    const v = NAMED[e] ?? NAMED[e.toLowerCase()];
    return v === undefined ? m : String.fromCodePoint(v);
  });
}

export class Node {
  constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get textContent() {
    if (this.nodeType === 3) return this.data;
    if (this.nodeType === 8) return '';
    let s = '';
    for (const c of this.childNodes) s += c.textContent;
    return s;
  }
  // take this node out of its parent (as the DOM's remove(); lib/sources.mjs drops the Sources section with it)
  remove() {
    if (!this.parentNode) return;
    const sib = this.parentNode.childNodes;
    const i = sib.indexOf(this);
    if (i >= 0) sib.splice(i, 1);
    this.parentNode = null;
  }
}

export class Text extends Node {
  constructor(data) { super(3); this.data = data; }
  get nodeValue() { return this.data; }
}

export class Comment extends Node {
  constructor(data) { super(8); this.data = data; }
  get nodeValue() { return this.data; }
}

export class Element extends Node {
  constructor(name, attrs) { super(1); this.localName = name; this.attrs = attrs || {}; }
  get tagName() { return this.localName.toUpperCase(); }
  get nodeValue() { return null; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get className() { return this.attrs.class || ''; }
  get id() { return this.attrs.id || ''; }
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const sib = this.parentNode.childNodes;
    for (let i = sib.indexOf(this) + 1; i < sib.length; i++) if (sib[i].nodeType === 1) return sib[i];
    return null;
  }
  getAttribute(n) { const v = this.attrs[n.toLowerCase()]; return v === undefined ? null : v; }
  hasAttribute(n) { return this.attrs[n.toLowerCase()] !== undefined; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  // the inner HTML, re-serialized (attributes in source order); used to compare a figure between versions
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  // replace the children with a parsed fragment (lib/sources.mjs rewrites a caption or paragraph this way)
  set innerHTML(html) {
    for (const c of this.childNodes) c.parentNode = null;
    const frag = parseHTML(String(html ?? ''));
    this.childNodes = frag.childNodes;
    for (const c of this.childNodes) c.parentNode = this;
  }
}

export class Document extends Element {
  constructor() { super('#document', {}); this.nodeType = 9; }
  get documentElement() { return this.children.find((c) => c.localName === 'html') || this.children[0] || null; }
  get body() { return find(this, (e) => e.localName === 'body'); }
}

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
export function serialize(n) {
  if (n.nodeType === 3) return RAW.has(n.parentNode?.localName) ? n.data : escText(n.data);
  if (n.nodeType === 8) return `<!--${n.data}-->`;
  const a = Object.entries(n.attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join('');
  if (VOID.has(n.localName)) return `<${n.localName}${a}>`;
  return `<${n.localName}${a}>${n.childNodes.map(serialize).join('')}</${n.localName}>`;
}

const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function parseAttrs(src) {
  const attrs = {};
  ATTR.lastIndex = 0;
  for (let m; (m = ATTR.exec(src));) {
    const k = m[1].toLowerCase();
    if (attrs[k] !== undefined) continue;
    const v = m[2] ?? m[3] ?? m[4];
    attrs[k] = v === undefined ? '' : decodeEntities(v);
  }
  return attrs;
}

const END = /<\/([a-zA-Z][^\s>\/]*)[^>]*>/y;
const START = /<([a-zA-Z][^\s\/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;

/** Parse an HTML string into a Document. */
export function parseHTML(html) {
  const doc = new Document();
  const stack = [doc];
  const top = () => stack[stack.length - 1];
  const append = (n) => { n.parentNode = top(); top().childNodes.push(n); };
  const openHas = (name) => { for (let i = stack.length - 1; i > 0; i--) if (stack[i].localName === name) return i; return -1; };
  const closeTo = (i) => { stack.length = i; };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { append(new Text(decodeEntities(html.slice(i)))); break; }
    if (lt > i) append(new Text(decodeEntities(html.slice(i, lt))));
    i = lt;
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4);
      const end = e < 0 ? n : e;
      append(new Comment(html.slice(i + 4, end)));
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') { // doctype, CDATA, processing instruction
      const e = html.indexOf('>', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (html[i + 1] === '/') {
      END.lastIndex = i;
      const m = END.exec(html);
      if (!m) { append(new Text('<')); i++; continue; }
      const name = m[1].toLowerCase();
      i += m[0].length;
      if (name === 'p' && openHas('p') < 0) { append(new Element('p', {})); continue; } // </p> without <p>: empty p
      const at = openHas(name);
      if (at > 0) closeTo(at);
      continue;
    }
    START.lastIndex = i;
    const m = START.exec(html);
    if (!m) { append(new Text('<')); i++; continue; }
    const name = m[1].toLowerCase();
    let rest = m[2];
    const selfClose = /\/\s*$/.test(rest);
    if (selfClose) rest = rest.replace(/\/\s*$/, '');
    i += m[0].length;
    // implied end tags
    if (CLOSES_P.has(name)) { const p = openHas('p'); if (p > 0 && !hasBoundary(stack, p)) closeTo(p); }
    if (name === 'li') { const l = openHas('li'); if (l > 0 && !listBetween(stack, l)) closeTo(l); }
    if (name === 'option') { const o = openHas('option'); if (o > 0) closeTo(o); }
    if (name === 'tr') { const t = openHas('tr'); if (t > 0 && openHas('table') < t) closeTo(t); }
    if (name === 'td' || name === 'th') { const t = Math.max(openHas('td'), openHas('th')); if (t > 0 && openHas('tr') < t) closeTo(t); }
    const el = new Element(name, parseAttrs(rest));
    append(el);
    if (VOID.has(name) || selfClose) continue;
    if (RAW.has(name)) {
      const re = new RegExp(`</${name}\\s*>`, 'ig');
      re.lastIndex = i;
      const e = re.exec(html);
      const body = html.slice(i, e ? e.index : n);
      if (body) { const t = new Text(name === 'title' || name === 'textarea' ? decodeEntities(body) : body); t.parentNode = el; el.childNodes.push(t); }
      i = e ? e.index + e[0].length : n;
      continue;
    }
    stack.push(el);
  }
  return doc;
}

// a <p> inside a button/table cell etc. is not closed by a block start outside it: stop at these scope markers
function hasBoundary(stack, from) {
  for (let i = stack.length - 1; i > from; i--) if (['button', 'td', 'th', 'caption', 'svg', 'foreignobject'].includes(stack[i].localName)) return true;
  return false;
}
function listBetween(stack, from) {
  for (let i = stack.length - 1; i > from; i--) if (stack[i].localName === 'ul' || stack[i].localName === 'ol') return true;
  return false;
}

// ---- tiny query helpers (predicate based; no CSS selector engine) --------------------------------------------------
export function* walk(node) {
  for (const c of node.childNodes) {
    if (c.nodeType !== 1) continue;
    yield c;
    yield* walk(c);
  }
}
export const findAll = (node, pred) => [...walk(node)].filter(pred);
export function find(node, pred) { for (const e of walk(node)) if (pred(e)) return e; return null; }
export const hasClass = (el, c) => !!el && el.nodeType === 1 && (' ' + (el.getAttribute('class') || '') + ' ').replace(/\s+/g, ' ').includes(' ' + c + ' ');
export function closest(el, pred) { for (let e = el; e && e.nodeType === 1; e = e.parentNode) if (pred(e)) return e; return null; }
export const isTag = (...names) => (e) => e.nodeType === 1 && names.includes(e.localName);
