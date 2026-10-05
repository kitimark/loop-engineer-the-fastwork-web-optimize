// draft-snapshot.js: READ-ONLY snapshot of the Medium draft open in this tab (user T-170 #84).
// Paste the whole file into the Claude in Chrome javascript tool, in the Medium editor tab. It reads the editor's
// blocks in order and returns them as a JSON string. It makes no network call and changes nothing on the page:
// no clicks, no edits, no cloned images (a cloned <img> would fetch). The result also stays in
// window.__fwDraftSnapshot, so a long result can be read in parts: window.__fwDraftSnapshot.slice(0, 20000), ...
// Save it as out/lead/medium-audit/draft-<UTC>.json in the main checkout, then run medium-verify.mjs on it.
(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // The editor root: Medium's story body, else the largest contenteditable, else <article>, else <body>.
  const editable = [...document.querySelectorAll('[contenteditable="true"]')].sort((a, b) => b.textContent.length - a.textContent.length)[0];
  const root = document.querySelector('.postArticle-content') || editable || document.querySelector('article') || document.body;
  // Text of a block without placeholders ("Type caption for image (optional)") or extension nodes (Grammarly).
  const SKIP = '.defaultValue, .is-defaultValue, grammarly-extension, grammarly-mirror, [data-grammarly-part], script, style, button, svg, noscript';
  const textOf = (el) => {
    if (el.matches('.is-defaultValue')) return '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let s = '';
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest(SKIP)) s += n.nodeValue;
    s = norm(s);
    return s && s === norm(el.getAttribute('data-default-value')) ? '' : s;
  };
  // GIF or not, from evidence we can read; null when nothing tells (be honest, the verifier shows "?").
  const lastSeg = (u) => { try { return new URL(u, location.href).pathname.split('/').pop(); } catch { return ''; } };
  const gifOf = (img, src) => {
    const id = img.getAttribute('data-image-id') || '';
    if (/^data:image\/gif/i.test(src)) return [true, 'data: mime'];
    if (/^data:image\//i.test(src)) return [false, 'data: mime'];
    if (/\.gif$/i.test(id)) return [true, 'data-image-id ' + id.slice(-12)];
    if (/\.(png|jpe?g|webp|avif)$/i.test(id)) return [false, 'data-image-id ' + id.slice(-12)];
    const seg = lastSeg(src);
    if (/\.gif$/i.test(seg)) return [true, 'src file name'];
    if (/\.(png|jpe?g|webp|avif)$/i.test(seg)) return [false, 'src file name'];
    return [null, src.startsWith('blob:') ? 'blob: src (upload not finished?)' : 'no mime, id or file extension'];
  };
  // The figure's main image: Medium may stack a blurred thumbnail and the full image; take the widest one.
  const imgOf = (fig) => {
    const imgs = [...fig.querySelectorAll('img')].filter((i) => !i.closest(SKIP));
    if (!imgs.length) return { present: false, other: fig.querySelector('iframe, video, canvas') ? 'embed/video/canvas' : null };
    const img = imgs.sort((a, b) => (b.naturalWidth - a.naturalWidth) || (+b.matches('.graf-image, .progressiveMedia-image') - +a.matches('.graf-image, .progressiveMedia-image')))[0];
    const src = img.currentSrc || img.getAttribute('src') || '';
    const [gif, gifWhy] = gifOf(img, src);
    let host = null; try { host = src.startsWith('data:') ? 'data:' : new URL(src, location.href).host; } catch {}
    return { present: !!src, host, file: src.startsWith('data:') ? null : lastSeg(src).slice(-40), complete: img.complete,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      dataWidth: +img.getAttribute('data-width') || null, dataHeight: +img.getAttribute('data-height') || null,
      gif, gifWhy, alt: norm(img.getAttribute('alt')) };
  };
  const BLOCK = 'h1, h2, h3, h4, h5, h6, p, blockquote, ul, ol, figure, pre, hr';
  const blocks = [];
  for (const el of root.querySelectorAll(BLOCK)) {
    const outer = el.parentElement && el.parentElement.closest(BLOCK);
    if (el.closest(SKIP) || (outer && root.contains(outer))) continue; // an inner part of a block that is read whole
    const type = el.tagName.toLowerCase(), cls = (el.className && String(el.className).match(/graf--\w+/g)) || [];
    if (type === 'ul' || type === 'ol') { for (const li of el.querySelectorAll(':scope > li')) blocks.push({ type: 'li', list: type, text: textOf(li) }); continue; }
    if (type === 'figure') {
      const img = imgOf(el), cap = el.querySelector('figcaption');
      blocks.push({ type, caption: cap ? textOf(cap) : '', alt: img.alt || '', img, cls }); continue;
    }
    if (type === 'hr') { blocks.push({ type, text: '', sectionDivider: !!el.closest('.section-divider') }); continue; }
    blocks.push({ type, text: textOf(el), cls });
  }
  const counts = blocks.reduce((o, b) => ((o[b.type] = (o[b.type] || 0) + 1), o), {});
  const rootName = root.tagName.toLowerCase() + (root.className ? '.' + String(root.className).trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = { schema: 'fw-medium-draft/1', takenAt: new Date().toISOString(), host: location.host,
    editor: /\/edit\b/.test(location.pathname) || !!editable, root: rootName, counts, blocks };
  window.__fwDraftSnapshot = JSON.stringify(out);
  return window.__fwDraftSnapshot;
})();
