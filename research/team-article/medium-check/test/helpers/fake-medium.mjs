// fake-medium.mjs (tests only): render an article model as a Medium-like page, so the whole chain
// (medium-dump.js -> lib/medium.mjs -> lib/compare.mjs) runs on known input. Two flavours:
//   editor:    the classic editor markup (graf classes, sections with section-divider hr, graf--trailing line)
//   published: the reader page markup (data-selectable-paragraph, h1.pw-post-title, role=separator, Apollo state)
// Both are modelled on what medium-dump.js expects, not on a captured Medium page (see the README: UNVERIFIED).
import { createHash } from 'node:crypto';

const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BULLET = String.fromCharCode(0x2022);

// links: the first wraps the whole text, the others are empty anchors (no text), so the text reads back unchanged
function inline(b) {
  const [first, ...rest] = b.links || [];
  let t = first ? `<a href="${h(first)}" class="markup--anchor">${h(b.text)}</a>` : h(b.text);
  for (const href of rest) t += `<a href="${h(href)}" class="markup--anchor"></a>`;
  return b.em ? `<em class="markup--em markup--p-em">${t}</em>` : t;
}

function streamSrc(c, style) {
  const q = Object.entries(c.params || {}).map(([k, v]) => `${k}=${v}`).join('&');
  const direct = `https://iframe.videodelivery.net/${c.uid}${q ? '?' + q : ''}`;
  if (style === 'embedly') return `https://cdn.embedly.com/widgets/media.html?src=${encodeURIComponent(direct)}&url=${encodeURIComponent(direct)}&type=text%2Fhtml&schema=videodelivery`;
  return direct;
}

export function editorHtml(model, opts = {}) {
  const out = [];
  out.push('<!doctype html><html><head><title>Edit story</title></head><body>');
  out.push('<div class="metabar"><p>Draft in Someone</p><button>Publish</button></div>');
  out.push('<div class="postArticle-content js-postField" contenteditable="true">');
  const section = () => out.push('<section class="section section--body"><div class="section-divider"><hr class="section-divider"></div><div class="section-content"><div class="section-inner">');
  const endSection = () => out.push('</div></div></section>');
  section();
  if (model.title !== null) out.push(`<h3 class="graf graf--h3 graf--leading graf--title">${h(model.title)}</h3>`);
  if (model.subtitle) out.push(`<h4 class="graf graf--h4 graf--subtitle">${h(model.subtitle)}</h4>`);
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const b of model.blocks) {
    if (b.kind !== 'li') closeList();
    switch (b.kind) {
      case 'p': out.push(`<p class="graf graf--p">${inline(b)}</p>`); break;
      case 'heading': out.push(`<h${b.level === 1 ? 3 : 4} class="graf graf--h${b.level === 1 ? 3 : 4}">${inline(b)}</h${b.level === 1 ? 3 : 4}>`); break;
      case 'li':
        if (list !== (b.list || 'ul')) { closeList(); list = b.list || 'ul'; out.push(`<${list} class="postList">`); }
        out.push(`<li class="graf graf--li">${inline(b)}</li>`); break;
      case 'quote': out.push(`<blockquote class="graf graf--${b.pull ? 'pullquote' : 'blockquote'}">${inline(b)}</blockquote>`); break;
      case 'hr': endSection(); section(); break;
      case 'picture':
        out.push(`<figure class="graf graf--figure"><div class="aspectRatioPlaceholder is-locked"><div class="aspectRatioPlaceholder-fill"></div>` +
          `<img class="graf-image" data-image-id="1*${b.n}.png" data-width="2400" data-height="1200" alt="${h(b.alt)}" src="https://cdn-images-1.medium.com/max/800/1*${b.n}.png"></div>` +
          `<figcaption class="imageCaption">${b.caption ? h(b.caption) : '<span class="defaultValue">Type caption for image (optional)</span>'}</figcaption></figure>`);
        break;
      case 'clip':
        out.push(`<figure class="graf graf--iframe"><div class="iframeContainer"><iframe width="700" height="393" src="${h(streamSrc(b, opts.clipStyle || 'embedly'))}" frameborder="0" allowfullscreen></iframe></div>` +
          `<figcaption class="imageCaption">${h(b.caption)}</figcaption></figure>`);
        break;
      default: throw new Error('fake editor: block ' + b.kind);
    }
  }
  closeList();
  out.push('<p class="graf graf--p graf--empty graf--trailing"><br></p>');
  endSection();
  out.push('</div><div class="responses"><p>Responses</p></div></body></html>');
  return out.join('\n');
}

export function publishedHtml(model, opts = {}) {
  const out = [];
  const media = {};
  out.push('<!doctype html><html><head><title>Story</title></head><body><div id="root"><nav><p>Sign in</p></nav>');
  out.push('<article><div><section><div class="ab"><div class="ac">');
  if (model.title !== null) out.push(`<h1 id="t1" class="pw-post-title xy" data-testid="storyTitle" data-selectable-paragraph="">${h(model.title)}</h1>`);
  if (model.subtitle) out.push(`<h2 id="t2" class="pw-subtitle-paragraph xy" data-selectable-paragraph="">${h(model.subtitle)}</h2>`);
  out.push('<div class="speechify-ignore"><p class="be b">Author Name</p><button>Follow</button><p>12 min read</p></div>');
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  let k = 0;
  for (const b of model.blocks) {
    if (b.kind !== 'li') closeList();
    const id = `p${++k}`;
    switch (b.kind) {
      case 'p': out.push(`<p id="${id}" class="pw-post-body-paragraph zz" data-selectable-paragraph="">${inline(b)}</p>`); break;
      case 'heading': out.push(`<h${b.level} id="${id}" class="qq" data-selectable-paragraph="">${inline(b)}</h${b.level}>`); break;
      case 'li':
        if (list !== (b.list || 'ul')) { closeList(); list = b.list || 'ul'; out.push(`<${list} class="">`); }
        out.push(`<li id="${id}" class="rr" data-selectable-paragraph="">${inline(b)}</li>`); break;
      case 'quote': out.push(`<blockquote class="ss"><p id="${id}" class="pw-post-body-paragraph" data-selectable-paragraph="">${inline(b)}</p></blockquote>`); break;
      case 'hr': out.push('<div role="separator" class="tt"><span class="uu"></span><span class="uu"></span><span class="uu"></span></div>'); break;
      case 'picture':
        out.push(`<figure class="vv"><div role="button" tabindex="0" class="ww"><span class="xx"><picture><source srcset="https://miro.medium.com/v2/resize:fit:640/1*${b.n}.png 640w" type="image/webp">` +
          `<img alt="${h(b.alt)}" class="yy" width="700" height="350" loading="lazy" role="presentation" src="https://miro.medium.com/v2/resize:fit:1400/1*${b.n}.png"></picture></span></div>` +
          (b.caption ? `<figcaption class="zz" data-selectable-paragraph="">${h(b.caption)}</figcaption>` : '') + '</figure>');
        break;
      case 'clip': {
        const mid = createHash('md5').update(String(b.uid) + b.n).digest('hex');
        media[`MediaResource:${mid}`] = { __typename: 'MediaResource', id: mid, iframeSrc: '', href: streamSrc(b, 'direct'), title: '' };
        out.push(`<figure class="vv"><div class="ab"><iframe src="https://${opts.host || 'medium.com'}/media/${mid}" allowfullscreen="" frameborder="0" height="393" width="700" title="" class="ef" scrolling="no"></iframe></div>` +
          `<figcaption class="zz" data-selectable-paragraph="">${h(b.caption)}</figcaption></figure>`);
        break;
      }
      default: throw new Error('fake published: block ' + b.kind);
    }
  }
  closeList();
  out.push('</div></div></section></div></article><div class="responses"><p>More from the author</p></div></div>');
  if (opts.apollo !== false) out.push(`<script>window.__APOLLO_STATE__ = ${JSON.stringify(media)}</script>`);
  out.push('</body></html>');
  return out.join('\n');
}

// a dump as the browser part of medium-dump.js returns it: the object plus transfer {length, sha256}
export function withTransfer(dump) {
  const payload = JSON.stringify(dump);
  return JSON.stringify({ ...dump, transfer: { length: payload.length, sha256: createHash('sha256').update(payload, 'utf8').digest('hex') } });
}

export const deepCopy = (x) => JSON.parse(JSON.stringify(x));
export { BULLET };
