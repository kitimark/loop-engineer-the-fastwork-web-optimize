// medium-dump.js: READ-ONLY dump of a Medium story (the draft editor or the published page) for check.mjs.
//
// How to use: open the story in your own browser (logged in for a draft), open the developer console
// (Chrome: View > Developer > JavaScript Console; Safari: Develop > Show JavaScript Console), paste this whole
// file and press Enter. It reads the story's blocks in order and copies one JSON text to the clipboard (Chrome's
// console `copy()`; elsewhere it prints the JSON, then select and copy it). Save it as a .json file and run:
//   node research/team-article/medium-check/check.mjs --dump <file.json>
// The result also stays in window.__fwMediumDump (long text: read it in parts with .slice(0, 100000) ...).
//
// What it reads: title, subtitle, headings, paragraphs (text, whole-italic or not, link targets), list items,
// quotes and pull quotes, separators, and for each figure: caption, the image's alt text, size and host, and for
// embeds every URL it can see (iframe src, data-* attributes, links, and the src of iframes nested inside a
// same-origin medium.com/media/... iframe). It makes no network request, clicks nothing, changes nothing, and
// reads nothing outside the story body (no account name, no stats, no comments). The page address is reduced to
// its host and whether it is an editor page.
//
// The same function runs in Node on a saved page (check.mjs --html; tests), so the code below avoids
// querySelector and uses only tagName, getAttribute, childNodes, nodeType and data/nodeValue.
//
// Medium's markup is not documented. What this file expects is UNVERIFIED unless the README says otherwise:
// editor blocks carry class "graf graf--<kind>" (graf--title, graf--subtitle, graf--h3, graf--h4, graf--p,
// graf--li, graf--blockquote, graf--pullquote, graf--figure, graf--iframe; the story body is .postArticle-content);
// published blocks carry data-selectable-paragraph (title h1.pw-post-title, subtitle .pw-subtitle-paragraph).
// When neither is found it falls back to plain HTML block tags inside <article>, <main> or <body>.

function fwMediumDump(doc, env) {
  env = env || {};
  var DUMP_SCHEMA = 'fw-medium-dump/1';
  var tag = function (e) { return e && e.nodeType === 1 ? String(e.tagName).toLowerCase() : ''; };
  var attr = function (e, n) { var v = e && e.nodeType === 1 ? e.getAttribute(n) : null; return v == null ? '' : String(v); };
  var classes = function (e) { return attr(e, 'class').split(/\s+/).filter(Boolean); };
  var hasClass = function (e, c) { return classes(e).indexOf(c) >= 0; };
  var kids = function (e) { var out = []; var c = e.childNodes || []; for (var i = 0; i < c.length; i++) if (c[i].nodeType === 1) out.push(c[i]); return out; };
  var ws = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  function each(e, fn) { var k = kids(e); for (var i = 0; i < k.length; i++) { if (fn(k[i]) !== false && SKIP_TAGS.indexOf(tag(k[i])) < 0) each(k[i], fn); } }
  function findFirst(e, pred) { var hit = null; each(e, function (x) { if (hit) return false; if (pred(x)) { hit = x; return false; } }); return hit; }
  function findAll(e, pred) { var out = []; each(e, function (x) { if (pred(x)) out.push(x); }); return out; }
  function ancestor(e, stop, pred) { for (var p = e.parentNode; p && p !== stop && p.nodeType === 1; p = p.parentNode) if (pred(p)) return p; return null; }

  // things that are never story content: placeholders, browser-extension nodes, controls, drawings
  var SKIP_TAGS = ['script', 'style', 'button', 'svg', 'noscript', 'template', 'grammarly-extension', 'grammarly-mirror', 'textarea', 'input', 'select'];
  function skipped(e) {
    var t = tag(e);
    if (SKIP_TAGS.indexOf(t) >= 0) return true;
    if (hasClass(e, 'defaultValue') || hasClass(e, 'is-defaultValue')) return true;
    if (attr(e, 'data-grammarly-part')) return true;
    if (attr(e, 'aria-hidden') === 'true' && t !== 'figure') return true;
    return false;
  }

  // ---- the story root ---------------------------------------------------------------------------------------------
  function findRoot() {
    var body = findFirst(doc, function (e) { return tag(e) === 'body'; }) || doc;
    var graf = findFirst(body, function (e) { return hasClass(e, 'postArticle-content'); });
    if (graf) return { root: graf, why: '.postArticle-content' };
    var editables = findAll(body, function (e) { return attr(e, 'contenteditable') === 'true'; });
    if (editables.length) {
      editables.sort(function (a, b) { return String(b.textContent).length - String(a.textContent).length; });
      return { root: editables[0], why: 'largest contenteditable' };
    }
    var articles = findAll(body, function (e) { return tag(e) === 'article'; });
    if (articles.length) {
      articles.sort(function (a, b) { return String(b.textContent).length - String(a.textContent).length; });
      return { root: articles[0], why: 'article' };
    }
    var main = findFirst(body, function (e) { return tag(e) === 'main'; });
    if (main) return { root: main, why: 'main' };
    return { root: body, why: 'body' };
  }
  var found = findRoot();
  var root = found.root;
  var graf = !!findFirst(root, function (e) { return hasClass(e, 'graf'); });
  var selectable = !graf && !!findFirst(root, function (e) { return e.nodeType === 1 && e.getAttribute('data-selectable-paragraph') != null; });
  var mode = graf ? 'graf' : selectable ? 'selectable' : 'generic';

  // ---- text of one block ------------------------------------------------------------------------------------------
  function textOf(el) {
    var s = '', italic = 0, plain = 0, links = [];
    (function rec(n, em) {
      var c = n.childNodes || [];
      for (var i = 0; i < c.length; i++) {
        var x = c[i];
        if (x.nodeType === 3) { var v = x.nodeValue != null ? x.nodeValue : x.data; s += v; if (ws(v)) { if (em) italic++; else plain++; } continue; }
        if (x.nodeType !== 1 || skipped(x)) continue;
        var t = tag(x);
        if (t === 'br') { s += ' '; continue; }
        if (t === 'a') { var h = attr(x, 'href'); if (/^https?:/i.test(h)) links.push(h); }
        rec(x, em || t === 'em' || t === 'i' || hasClass(x, 'markup--em'));
      }
    })(el, false);
    s = ws(s);
    if (s && s === ws(attr(el, 'data-default-value'))) s = '';
    return { text: s, em: italic > 0 && plain === 0, links: links };
  }

  var KEEP_CLASS = /^(graf--|pw-|section-divider|is-|markup--quote|graf$)/;
  function keptClasses(e) { return classes(e).filter(function (c) { return KEEP_CLASS.test(c); }); }

  // ---- figures ----------------------------------------------------------------------------------------------------
  var URLISH = /(https?:\/\/|\/\/|videodelivery|cloudflarestream|embedly|\/media\/)/i;
  function figureOf(fig) {
    var cap = findFirst(fig, function (e) { return tag(e) === 'figcaption'; });
    // images: aria-hidden wrappers are kept (Medium may hide a wrapper from screen readers), controls are not
    var imgs = findAll(fig, function (e) { return tag(e) === 'img' && !ancestor(e, fig, function (p) { return SKIP_TAGS.indexOf(tag(p)) >= 0; }); });
    var img = null;
    if (imgs.length) {
      imgs.sort(function (a, b) { return (Number(b.naturalWidth || attr(b, 'width') || 0) - Number(a.naturalWidth || attr(a, 'width') || 0)); });
      var im = imgs[0], src = attr(im, 'src') || (typeof im.currentSrc === 'string' ? im.currentSrc : '');
      var host = '', file = '';
      try { var u = new URL(src, 'https://medium.com/'); host = src.indexOf('data:') === 0 ? 'data:' : src.indexOf('blob:') === 0 ? 'blob:' : u.host; file = src.indexOf('data:') === 0 ? '' : u.pathname.split('/').pop(); } catch (e) { /* keep empty */ }
      img = { alt: ws(attr(im, 'alt')), host: host, file: file.slice(-60), width: Number(attr(im, 'width')) || null, height: Number(attr(im, 'height')) || null,
        naturalWidth: im.naturalWidth || null, complete: typeof im.complete === 'boolean' ? im.complete : null };
    } else {
      // no <img> (a page saved without scripts may keep it inside <noscript>, which browsers read as text)
      var ns = findFirst(fig, function (e) { return tag(e) === 'noscript'; });
      var nsText = ns ? String(ns.textContent || '') : '';
      var m = /<img\b[^>]*\balt="([^"]*)"/i.exec(nsText);
      if (m) img = { alt: ws(m[1].replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')), host: 'noscript', file: '', width: null, height: null, naturalWidth: null, complete: null };
    }
    var embeds = findAll(fig, function (e) { return tag(e) === 'iframe' || tag(e) === 'embed' || tag(e) === 'object' || tag(e) === 'video'; }).map(function (f) {
      var nested = [];
      if (env.nestedFrames) { try { nested = env.nestedFrames(f) || []; } catch (e) { nested = ['(nested frame not readable)']; } }
      return { tag: tag(f), src: attr(f, 'src') || attr(f, 'data-src') || attr(f, 'data'), title: attr(f, 'title'), nested: nested };
    });
    // every attribute value in the figure that looks like a URL: the evidence for an embed's target
    var urls = [];
    each(fig, function (e) {
      if (tag(e) === 'figcaption') return false;
      var at = e.attributes || [];
      for (var i = 0; i < at.length; i++) { var v = String(at[i].value || ''); if (URLISH.test(v) && urls.indexOf(v) < 0 && v.length < 4000) urls.push(v); }
    });
    if (fig.attributes) for (var j = 0; j < fig.attributes.length; j++) { var fv = String(fig.attributes[j].value || ''); if (URLISH.test(fv) && urls.indexOf(fv) < 0) urls.push(fv); }
    var capText = cap ? textOf(cap) : { text: '', links: [] };
    return { type: 'figure', cls: keptClasses(fig), caption: capText.text, captionLinks: capText.links, img: img, embeds: embeds, urls: urls };
  }

  // ---- block selection --------------------------------------------------------------------------------------------
  var BLOCK_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'figure', 'hr', 'pre'];
  function isSeparator(e) { return tag(e) === 'hr' || attr(e, 'role') === 'separator'; }
  function isBlock(e) {
    var t = tag(e);
    if (t === 'figure' || isSeparator(e)) return true;
    if (mode === 'graf') return hasClass(e, 'graf') && BLOCK_TAGS.indexOf(t) >= 0;
    if (mode === 'selectable') return e.getAttribute('data-selectable-paragraph') != null || hasClass(e, 'pw-post-title') || hasClass(e, 'pw-subtitle-paragraph');
    if (t === 'blockquote') return !findFirst(e, function (x) { return ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].indexOf(tag(x)) >= 0; });
    return BLOCK_TAGS.indexOf(t) >= 0 && t !== 'figure';
  }

  var blocks = [];
  (function walk(e) {
    var k = kids(e);
    for (var i = 0; i < k.length; i++) {
      var x = k[i];
      if (tag(x) !== 'figure' && skipped(x)) continue;
      if (!isBlock(x)) { walk(x); continue; }
      var t = tag(x);
      if (t === 'figure') { blocks.push(figureOf(x)); continue; }
      if (isSeparator(x)) { blocks.push({ type: 'hr', tag: t, cls: keptClasses(x), sectionDivider: !!ancestor(x, root, function (p) { return hasClass(p, 'section-divider'); }) || hasClass(x, 'section-divider') }); continue; }
      var q = t === 'blockquote' ? x : ancestor(x, root, function (p) { return tag(p) === 'blockquote'; });
      var list = t === 'li' ? ancestor(x, root, function (p) { return tag(p) === 'ul' || tag(p) === 'ol'; }) : null;
      var r = textOf(x);
      var b = { type: t, cls: keptClasses(x), text: r.text, em: r.em, links: r.links };
      if (q) b.quote = { cls: keptClasses(q) };
      if (list) b.list = tag(list);
      blocks.push(b);
    }
  })(root);

  var counts = {};
  for (var c = 0; c < blocks.length; c++) counts[blocks[c].type] = (counts[blocks[c].type] || 0) + 1;
  var rootName = tag(root) + (classes(root).length ? '.' + classes(root).slice(0, 2).join('.') : '');
  return { schema: DUMP_SCHEMA, takenAt: env.now || null, host: env.host || null, page: env.page || 'unknown', mode: mode,
    root: rootName, rootWhy: found.why, counts: counts, blocks: blocks };
}

// ---- in the browser: run, add a transfer check, copy --------------------------------------------------------------
(function () {
  if (typeof window === 'undefined' || !window.document || typeof module !== 'undefined') return;
  // plain synchronous SHA-256 (crypto.subtle would make the result a promise), so check.mjs can prove that a
  // JSON text copied in parts was joined back exactly (TRANSFER OK / TRANSFER MISMATCH)
  function sha256(bytes) {
    var K = [], H = [], prime = function (n) { for (var d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
    for (var n = 2, i = 0; i < 64; n++) if (prime(n)) { if (i < 8) H[i] = ((Math.pow(n, 0.5)) % 1) * 4294967296 | 0; K[i++] = (Math.cbrt(n) % 1) * 4294967296 | 0; }
    var len = bytes.length, w = new Uint32Array(((len + 72) >> 6) << 4), W = new Uint32Array(64), r = function (x, k) { return (x >>> k) | (x << (32 - k)); };
    for (var q = 0; q < len; q++) w[q >> 2] |= bytes[q] << (24 - (q & 3) * 8);
    w[len >> 2] |= 0x80 << (24 - (len & 3) * 8); w[w.length - 1] = len * 8; w[w.length - 2] = Math.floor(len / 536870912);
    for (var o = 0; o < w.length; o += 16) {
      for (var t = 0; t < 64; t++) W[t] = t < 16 ? w[o + t] : (r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ (W[t - 2] >>> 10)) + W[t - 7] + (r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ (W[t - 15] >>> 3)) + W[t - 16];
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var u = 0; u < 64; u++) {
        var t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[u] + W[u]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
  }
  var out = fwMediumDump(window.document, {
    host: location.host, now: new Date().toISOString(),
    page: /\/edit\b|\/new-story/.test(location.pathname) ? 'editor' : 'published',
    // medium.com/media/... embed frames are same-origin: read the src of the provider frame inside (no request)
    nestedFrames: function (f) {
      var d = f.contentDocument; if (!d) return [];
      var list = []; var fr = d.getElementsByTagName('iframe');
      for (var i = 0; i < fr.length; i++) list.push(fr[i].getAttribute('src') || '');
      return list;
    },
  });
  var payload = JSON.stringify(out);
  var text = JSON.stringify(Object.assign({}, out, { transfer: { length: payload.length, sha256: sha256(new TextEncoder().encode(payload)) } }));
  window.__fwMediumDump = text;
  var copied = false;
  try { if (typeof copy === 'function') { copy(text); copied = true; } } catch (e) { copied = false; }
  console.log('medium-dump: ' + out.blocks.length + ' blocks (' + out.mode + ' mode, root ' + out.root + ', ' + text.length + ' characters). ' +
    (copied ? 'Copied to the clipboard: paste it into a .json file.' : 'Copy the text below (or window.__fwMediumDump) into a .json file.'));
  if (!copied) console.log(text);
})();
