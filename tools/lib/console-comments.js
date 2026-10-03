// Comments on console items (I-090, user T-043: "comments like Claude artifacts"), loaded on every console page as
// /console-comments.js (the server adds it with the menu, `data-page` naming the page). The pages mark what can be
// commented with `data-anchor="<item id>"` (and `data-anchor-label="<its title>"`; an inner `data-comment-slot`
// element, when present, takes the marker). This script adds:
//   - a small "Comment" button by the item under the pointer (hover), the item tapped or clicked (touch), or the text
//     selected inside one item (the selection becomes the quote);
//   - the comment box next to it: the quote, a text field, "Your comment goes to: lead" (I-084), Send / Cancel
//     (Esc cancels, Ctrl/⌘+Enter sends). Sending POSTs /api/comments {anchor: {page, item, quote?, label?}, text};
//     the server checks the anchor (console-comments.mjs) and starts a thread the lead reads;
//   - a marker on every item that has comments ("2 comments"), linking to its newest thread, from GET
//     /api/comments?page=<page>; re-placed when the page redraws its items.
// I-096 (user T-043: "comment anywhere"): each page's main wrapper is the anchor "part:page", so every line on the page
// takes a comment; the innermost anchor wins (a row inside the page stays a comment on that row). In a page part the
// button sits by the line pointed at and that line's text is the quote. A page that redrew its items while the box was
// opening gets the item's new node (same id).
// Text is set with textContent only; nothing loads from outside; only this server is asked.
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  var me = document.currentScript;
  var PAGE = (me && me.getAttribute('data-page')) || '';
  if (!/^(steps|proposals|status|progress|build|threads)$/.test(PAGE)) return;
  var TID = /^T-\d{1,6}$/;
  var QUOTE_MAX = 300;
  var INTERACTIVE = 'a,button,input,textarea,select,summary,label,video,[contenteditable]';

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function anchorOf(node) {
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (node && node.closest && node.closest('[data-no-comment]')) return null; // where the user writes to the agents (I-096)
    var a = node && node.closest ? node.closest('[data-anchor]') : null;
    return a && !a.closest('.cmt-box') ? a : null;
  }
  function itemOf(a) { return a.getAttribute('data-anchor'); }
  /** The marker's place: the item's own [data-comment-slot] (not one of an item inside it), else the item. */
  function slotOf(a) {
    var s = a.querySelectorAll('[data-comment-slot]');
    for (var i = 0; i < s.length; i++) if (s[i].closest('[data-anchor]') === a) return s[i];
    return a;
  }
  // I-096: a page part ("part:page", the page's fallback) is big; the line pointed at in it is what the comment is
  // about: the button sits by that line and its text goes along as the quote.
  var BLOCK = 'li,tr,p,h1,h2,h3,h4,dt,dd,summary,figcaption,label,blockquote,pre,div,section,article,header,footer,details,table,ul,ol';
  var TYPING = 'input,textarea,select,[contenteditable]';
  function isPart(a) { return /^part:/.test(itemOf(a) || ''); }
  function blockOf(node, a) {
    while (node && node.nodeType !== 1) node = node.parentNode;
    var b = node && node.closest ? node.closest(BLOCK) : null;
    return b && a.contains(b) ? b : a;
  }
  function lineText(n) { var t = String((n && n.textContent) || '').replace(/\s+/g, ' ').trim(); return t.length > QUOTE_MAX ? t.slice(0, QUOTE_MAX - 1) + '…' : t; }
  /** The item now on the page with this id: pages redraw their items (Status every 5 s), the old node is gone. */
  function live(a) {
    if (a.isConnected !== false) return a;
    var id = itemOf(a), all = document.querySelectorAll('[data-anchor]');
    for (var i = 0; i < all.length; i++) if (itemOf(all[i]) === id) return all[i];
    return a;
  }

  // ---- the floating "Comment" button ----
  var btn = el('button', 'cmt-btn', 'Comment');
  btn.type = 'button'; btn.hidden = true; btn.setAttribute('aria-label', 'Comment on this item');
  var target = null, quote = '', line = null;
  function place(node, rect) {
    var r = rect || node.getBoundingClientRect();
    node.style.top = Math.max(0, (root.scrollY || 0) + r.top - 4) + 'px';
    node.style.left = Math.max(0, (root.scrollX || 0) + Math.min(r.right, document.documentElement.clientWidth - 16) - 90) + 'px';
  }
  function showBtn(a, q, rect, at) {
    if (box && !box.hidden) return; // one comment at a time
    target = a; quote = q || ''; line = at || null;
    btn.textContent = quote ? 'Comment on the selection' : 'Comment';
    btn.hidden = false;
    place(btn, rect || (line || a).getBoundingClientRect());
  }
  function hideBtn() { btn.hidden = true; target = null; quote = ''; line = null; }
  /** Point at `node` (hover or tap): its item; in a page part, the line in it. */
  function pointAt(node) {
    var a = anchorOf(node);
    if (!a) return false;
    var el0 = node; while (el0 && el0.nodeType !== 1) el0 = el0.parentNode;
    if (el0 && el0.closest && el0.closest(TYPING)) return true; // the user's own typing field is no line to comment on
    if (!isPart(a)) { if (a !== target || line) showBtn(a); return true; }
    var b = blockOf(node, a);
    if (b === a && target === a) return true; // the gap between two lines: the button stays by the last line
    if (a !== target || b !== line) showBtn(a, '', null, b);
    return true;
  }
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the selection
  btn.addEventListener('click', function () { if (target) openBox(target, quote || (line && isPart(target) ? lineText(line) : '')); });

  // ---- the comment box ----
  var box = null, boxAnchor = null, boxQuote = '', sending = false;
  function openBox(a, q) {
    if (!box) build();
    var at = line && isPart(a) && line.isConnected !== false ? line : null;
    a = live(a);
    boxAnchor = a; boxQuote = (q || '').replace(/\s+/g, ' ').trim();
    if (boxQuote.length > QUOTE_MAX) boxQuote = boxQuote.slice(0, QUOTE_MAX - 1) + '…';
    box.querySelector('.cmt-what').textContent = 'Comment on ' + (a.getAttribute('data-anchor-label') || itemOf(a));
    var qn = box.querySelector('.cmt-quote'); qn.textContent = boxQuote; qn.hidden = !boxQuote;
    box.querySelector('.cmt-msg').textContent = '';
    box.hidden = false; btn.hidden = true;
    place(box, (at || a).getBoundingClientRect());
    box.style.left = Math.max(8, Math.min(parseFloat(box.style.left) - 220, document.documentElement.clientWidth - 360)) + 'px';
    var ta = box.querySelector('textarea'); ta.focus();
  }
  function closeBox() { if (box) { box.hidden = true; box.querySelector('textarea').value = ''; } boxAnchor = null; boxQuote = ''; }
  function build() {
    box = el('div', 'cmt-box'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Comment');
    var what = el('div', 'cmt-what');
    var q = el('blockquote', 'cmt-quote');
    var ta = el('textarea'); ta.maxLength = 8000; ta.rows = 3; ta.placeholder = 'Your comment';
    var to = el('p', 'cmt-to'); to.appendChild(document.createTextNode('Your comment goes to: ')); to.appendChild(el('b', null, 'lead'));
    var msg = el('p', 'cmt-msg'); msg.setAttribute('role', 'status');
    var row = el('div', 'cmt-row');
    var cancel = el('button', 'cmt-cancel', 'Cancel'); cancel.type = 'button';
    var send = el('button', 'cmt-send', 'Send'); send.type = 'button';
    row.appendChild(cancel); row.appendChild(send);
    [what, q, ta, to, msg, row].forEach(function (n) { box.appendChild(n); });
    cancel.addEventListener('click', closeBox);
    send.addEventListener('click', submit);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeBox(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });
    document.body.appendChild(box);
  }
  function submit() {
    if (sending || !boxAnchor) return;
    var ta = box.querySelector('textarea'), msg = box.querySelector('.cmt-msg');
    var text = ta.value.trim();
    if (!text) { msg.textContent = 'Write your comment first.'; return; }
    var anchor = { page: PAGE, item: itemOf(boxAnchor) };
    if (boxQuote) anchor.quote = boxQuote;
    var label = boxAnchor.getAttribute('data-anchor-label');
    if (label) anchor.label = label;
    sending = true;
    fetch('/api/comments', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-console': '1' }, body: JSON.stringify({ anchor: anchor, text: text }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        closeBox();
        var t = j.thread || {};
        note('Sent to ' + ((t.to && t.to.length ? t.to : ['lead']).join(', ')) + (TID.test(t.id || '') ? ' as ' + t.id : '') + '.');
        load();
      }, function (e) { msg.textContent = e.message; })
      .then(function () { sending = false; });
  }
  var noteEl = null;
  function note(text) {
    if (!noteEl) { noteEl = el('div', 'cmt-note'); noteEl.setAttribute('role', 'status'); document.body.appendChild(noteEl); }
    noteEl.textContent = text; noteEl.hidden = false;
    clearTimeout(note.h); note.h = setTimeout(function () { noteEl.hidden = true; }, 4000);
  }

  // ---- pointer, touch and selection ----
  document.addEventListener('mouseover', function (e) {
    if (e.target === btn || (box && !box.hidden)) return;
    if (!hasSelection()) pointAt(e.target);
  });
  document.addEventListener('click', function (e) {
    if (e.target === btn || (box && box.contains(e.target))) return;
    if (box && !box.hidden) { closeBox(); return; }
    var a = anchorOf(e.target);
    if (!a) { if (!hasSelection()) hideBtn(); return; }
    if (e.target.closest && e.target.closest(INTERACTIVE)) return; // the item's own buttons and links work as before
    if (!hasSelection()) pointAt(e.target);
  });
  function hasSelection() { var s = root.getSelection ? root.getSelection() : null; return !!(s && !s.isCollapsed && String(s).trim()); }
  function onSelect() {
    var s = root.getSelection ? root.getSelection() : null;
    if (!s || s.isCollapsed || !s.rangeCount) return;
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/i.test(ae.tagName || '')) return; // text picked in the user's own typing is no quote
    var text = String(s).trim();
    if (!text) return;
    var a = anchorOf(s.anchorNode), b = anchorOf(s.focusNode);
    if (!a || a !== b) return; // a selection across two items has no single anchor
    var rect = null;
    try { rect = s.getRangeAt(0).getBoundingClientRect(); } catch (x) { rect = null; }
    showBtn(a, text, rect && rect.width ? rect : null);
  }
  document.addEventListener('mouseup', function () { setTimeout(onSelect, 0); });
  document.addEventListener('keyup', function (e) { if (e.shiftKey) onSelect(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (box && !box.hidden) closeBox(); else hideBtn(); } });

  // ---- markers ----
  var markers = {};
  function markerText(m) { return m.count + (m.count === 1 ? ' comment' : ' comments'); }
  function apply() {
    var nodes = document.querySelectorAll('[data-anchor]');
    Array.prototype.forEach.call(nodes, function (a) {
      var m = markers[itemOf(a)], slot = slotOf(a);
      var cur = null;
      Array.prototype.forEach.call(slot.children, function (c) { if (c.className === 'cmt-marker') cur = c; });
      if (!m || !m.count) { if (cur) cur.remove(); return; }
      var last = m.threads[m.threads.length - 1];
      var href = TID.test(last && last.id) ? '/threads#' + last.id : '/threads';
      if (!cur) { cur = el('a', 'cmt-marker'); slot.appendChild(cur); }
      if (cur.textContent !== markerText(m)) cur.textContent = markerText(m);
      if (cur.getAttribute('href') !== href) cur.setAttribute('href', href);
      var title = 'Comments: ' + m.threads.map(function (t) { return t.id; }).join(', ') + (m.open < m.count ? ' (' + (m.count - m.open) + ' closed)' : '');
      if (cur.title !== title) cur.title = title;
    });
  }
  var applyTimer = null;
  function schedule() { if (!applyTimer) applyTimer = setTimeout(function () { applyTimer = null; apply(); }, 50); }
  function load() {
    return fetch('/api/comments?page=' + PAGE, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.items && typeof j.items === 'object') { markers = j.items; apply(); }
    }).catch(function () {});
  }

  function start() {
    document.body.appendChild(btn);
    if (root.MutationObserver) new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t && t.className !== 'cmt-marker' && !(box && box.contains(t)) && t !== btn) { schedule(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
    load();
    setInterval(load, 15000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  root.ConsoleComments = { page: PAGE, load: load, apply: apply, open: function (a, q) { openBox(a, q); }, markers: function () { return markers; } };
})(typeof window !== 'undefined' ? window : this);
