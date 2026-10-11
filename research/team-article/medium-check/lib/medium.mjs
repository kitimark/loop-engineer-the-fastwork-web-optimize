// medium.mjs: a Medium story -> the article model (the same shape lib/article.mjs makes from the article page).
//
// Two inputs:
//   - a dump: the JSON that medium-dump.js returns in the browser (draft editor or published page);
//   - a saved HTML page (the published post's public HTML, or "Save page as" of the editor): parsed here and run
//     through the same fwMediumDump function from medium-dump.js, so both paths read Medium's markup the same way.
// Medium's markup is not documented; see medium-dump.js and the README for what is assumed (UNVERIFIED) and what the
// reader does when an assumption fails (it reports, it does not guess silently).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { parseHTML } from './html.mjs';
import { norm } from './text.mjs';
import { parseStreamUrl, addSections, SCHEMA } from './article.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DUMP_JS = join(HERE, '..', 'medium-dump.js');

let _dumpFn;
/** fwMediumDump from medium-dump.js, loaded without a window (its browser part does not run). */
export function dumpFunction() {
  if (!_dumpFn) {
    const ctx = vm.createContext({ URL, console });
    vm.runInContext(readFileSync(DUMP_JS, 'utf8'), ctx, { filename: 'medium-dump.js' });
    _dumpFn = ctx.fwMediumDump;
    if (typeof _dumpFn !== 'function') throw new Error('medium-dump.js does not define fwMediumDump');
  }
  return _dumpFn;
}

// ---- saved HTML -> dump ----------------------------------------------------------------------------------------------
// Medium's published page also carries its data as JSON (window.__APOLLO_STATE__, UNVERIFIED key names). An embed
// iframe that points at medium.com/media/<id> says nothing about its target, so the reader adds every string found
// under that media id in the JSON as evidence.
export function apolloMedia(html) {
  const out = new Map();
  const m = /window\.__APOLLO_STATE__\s*=\s*/.exec(html);
  if (!m) return out;
  const start = m.index + m[0].length;
  const end = html.indexOf('</script>', start);
  let state = null;
  try { state = JSON.parse(html.slice(start, end < 0 ? undefined : end).trim().replace(/;\s*$/, '')); } catch { state = null; }
  if (!state || typeof state !== 'object') return out;
  const strings = (v, acc) => {
    if (typeof v === 'string') acc.push(v);
    else if (Array.isArray(v)) v.forEach((x) => strings(x, acc));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, acc));
    return acc;
  };
  for (const [k, v] of Object.entries(state)) {
    const mm = /^MediaResource:(.+)$/.exec(k);
    if (mm) out.set(mm[1], strings(v, []));
  }
  return out;
}

export function dumpFromHtml(html, { host = null, page = 'saved-html' } = {}) {
  const doc = parseHTML(html);
  const dump = dumpFunction()(doc, { host, page, now: null });
  const media = apolloMedia(html);
  if (media.size) {
    for (const b of dump.blocks) {
      if (b.type !== 'figure') continue;
      for (const e of b.embeds) {
        const id = /\/media\/([0-9a-f]{8,})/i.exec(e.src || '');
        if (id && media.has(id[1])) e.nested = [...e.nested, ...media.get(id[1]).filter((s) => /https?:|videodelivery|cloudflarestream/i.test(s))];
      }
    }
    dump.apolloMedia = media.size;
  }
  return dump;
}

// ---- dump transfer check -----------------------------------------------------------------------------------------------
export function parseDump(raw) {
  let d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof d === 'string') d = JSON.parse(d); // a JSON string saved as JSON
  if (!d || !Array.isArray(d.blocks)) throw new Error('not a medium-dump.js result (no "blocks" array)');
  return d;
}
export function checkTransfer(d) {
  if (!d.transfer) return { state: 'ABSENT', line: 'TRANSFER not checked (no length/sha256 in the dump: a saved page, or a hand-made file)' };
  const { transfer, ...rest } = d;
  const payload = JSON.stringify(rest);
  const got = { length: payload.length, sha256: createHash('sha256').update(payload, 'utf8').digest('hex') };
  if (got.length === transfer.length && got.sha256 === transfer.sha256) return { state: 'OK', line: `TRANSFER OK (length ${got.length}, sha256 ${got.sha256.slice(0, 12)})` };
  return { state: 'MISMATCH', line: `TRANSFER MISMATCH: the page sent length ${transfer.length}, the file has ${got.length} (a part lost, doubled or changed while copying?)` };
}

// ---- clip evidence -----------------------------------------------------------------------------------------------------
// Every URL seen in an embed figure, plus the URLs packed inside them (Embedly's src= / url= parameters, %-encoded
// once or twice); the first Cloudflare Stream address with a 32-hex uid wins.
export function streamEvidence(fig) {
  const seen = new Set();
  const queue = [...(fig.urls || []), ...(fig.embeds || []).flatMap((e) => [e.src, ...(e.nested || [])])].filter(Boolean);
  const found = [];
  while (queue.length) {
    let s = String(queue.shift());
    if (seen.has(s) || seen.size > 200) continue;
    seen.add(s);
    if (s.startsWith('//')) s = 'https:' + s;
    let u = null;
    try { u = new URL(s, 'https://medium.com/'); } catch { u = null; }
    if (u) for (const [, v] of u.searchParams) if (/^(https?:|\/\/|https?%3A)/i.test(v)) queue.push(v.startsWith('http') || v.startsWith('//') ? v : decodeURIComponent(v));
    if (/%3A%2F%2F/i.test(s)) { try { queue.push(decodeURIComponent(s)); } catch { /* not encoded */ } }
    if (u && /(^|\.)(videodelivery\.net|cloudflarestream\.com)$/i.test(u.host)) {
      const p = parseStreamUrl(u.href);
      if (p) found.push({ ...p, url: u.href });
    }
  }
  // prefer the address that carries the player parameters
  found.sort((a, b) => Object.keys(b.params).length - Object.keys(a.params).length);
  const embedHosts = [...new Set((fig.embeds || []).map((e) => { try { return new URL(e.src, 'https://medium.com/').host; } catch { return ''; } }).filter(Boolean))];
  return { stream: found[0] || null, all: found, embedHosts };
}

// ---- dump -> model -----------------------------------------------------------------------------------------------------
const hasCls = (b, re) => (b.cls || []).some((c) => re.test(c));

export function readDump(raw, opts = {}) {
  const d = parseDump(raw);
  const transfer = checkTransfer(d);
  const model = { schema: SCHEMA, source: opts.source || null, medium: { host: d.host, page: d.page, mode: d.mode, root: d.root, rootWhy: d.rootWhy, takenAt: d.takenAt, transfer },
    title: null, subtitle: null, byline: null, disclaimer: [], blocks: [], warnings: [], empties: [] };
  let list = d.blocks.slice();

  // title and subtitle: Medium's own markers first, then the first heading at the very top
  let ti = list.findIndex((b) => hasCls(b, /^(graf--title|pw-post-title)$/));
  if (ti < 0) {
    const firstText = list.findIndex((b) => b.type !== 'hr' && b.type !== 'figure' && (b.text || '').trim());
    if (firstText >= 0 && /^h[1-4]$/.test(list[firstText].type)) { ti = firstText; model.warnings.push('title found by position (no graf--title / pw-post-title class)'); }
  }
  if (ti >= 0) { model.title = norm(list[ti].text); model.medium.titleTag = list[ti].type; list.splice(ti, 1); }
  let si = list.findIndex((b) => hasCls(b, /^(graf--subtitle|pw-subtitle-paragraph)$/));
  if (si >= 0) { model.subtitle = norm(list[si].text); list.splice(si, 1); }

  // Medium opens a story with a section divider and keeps an empty last line (graf--trailing): not content
  while (list.length && list[0].type === 'hr') list.shift();
  const last = list[list.length - 1];
  if (last && last.type !== 'figure' && !(last.text || '').trim() && hasCls(last, /^graf--trailing$/)) list.pop();

  // heading levels: graf--h3 = big, graf--h4 = small; else rank the heading tags used in the body
  const htags = [...new Set(list.filter((b) => /^h[1-6]$/.test(b.type) && !b.quote).map((b) => b.type))].sort();
  const levelOf = (b) => {
    if (hasCls(b, /^graf--h3$/)) return [1, 'graf--h3'];
    if (hasCls(b, /^graf--h4$/)) return [2, 'graf--h4'];
    const r = htags.indexOf(b.type);
    return [r <= 0 ? 1 : 2, `tag rank (${b.type} of ${htags.join(',')})`];
  };

  let pn = 0, cn = 0;
  for (const b of list) {
    if (b.type === 'figure') {
      const ev = streamEvidence(b);
      if ((b.embeds && b.embeds.length) || ev.stream) {
        cn++;
        model.blocks.push({ kind: 'clip', n: String(cn).padStart(2, '0'), uid: ev.stream ? ev.stream.uid : null, params: ev.stream ? ev.stream.params : {},
          url: ev.stream ? ev.stream.url : null, embedHosts: ev.embedHosts, caption: norm(b.caption), links: b.captionLinks || [],
          evidence: ev.stream ? 'stream address in the embed' : `no Stream address visible (embed ${ev.embedHosts.join(', ') || 'without src'})` });
      } else {
        pn++;
        model.blocks.push({ kind: 'picture', n: String(pn).padStart(2, '0'), caption: norm(b.caption), links: b.captionLinks || [],
          alt: b.img ? norm(b.img.alt) : '', img: b.img ? { host: b.img.host, width: b.img.width, height: b.img.height, naturalWidth: b.img.naturalWidth, complete: b.img.complete } : null });
      }
      continue;
    }
    if (b.type === 'hr') { model.blocks.push({ kind: 'hr', text: '' }); continue; }
    const text = norm(b.text);
    if (!text) { model.empties.push(model.blocks.length); continue; }
    const base = { text, em: !!b.em, links: b.links || [], tag: b.type, cls: b.cls };
    if (b.type === 'blockquote' || b.quote) {
      const qc = b.type === 'blockquote' ? b.cls : (b.quote.cls || []);
      const pull = (qc || []).some((c) => /pullquote/i.test(c)) ? true : (d.mode === 'graf' ? false : null);
      model.blocks.push({ kind: 'quote', pull, ...base });
    } else if (b.type === 'li') model.blocks.push({ kind: 'li', list: b.list || null, ...base });
    else if (/^h[1-6]$/.test(b.type)) { const [level, levelFrom] = levelOf(b); model.blocks.push({ kind: 'heading', level, levelFrom, ...base }); }
    else model.blocks.push({ kind: 'p', ...base });
  }
  model.blocks.forEach((b, i) => { b.i = i; });
  addSections(model);
  return model;
}

export function readDumpFile(file) {
  return readDump(readFileSync(file, 'utf8'), { source: file });
}
export function readHtmlFile(file, opts = {}) {
  const html = readFileSync(file, 'utf8');
  return readDump(dumpFromHtml(html, opts), { source: file });
}

// the published page's address, checked before any fetch: plain https on medium.com (or a custom domain the caller
// names), no query string, no credentials
export function publicUrlOk(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && !x.username && !x.password && !x.search;
  } catch { return false; }
}
