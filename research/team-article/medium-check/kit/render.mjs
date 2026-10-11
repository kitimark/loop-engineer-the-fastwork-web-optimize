#!/usr/bin/env node
// kit/render.mjs: write the kit's text files from kit.json (no Chrome): story.md, story.html, alt.txt,
// contact-sheet.html and CHECKLIST.md. kit/build.mjs calls it at the end; run it alone after changing only this file:
//   node research/team-article/medium-check/kit/render.mjs [--out <kit dir>]    (default out/article/medium-kit)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function render(KIT) {
  const kit = JSON.parse(readFileSync(join(KIT, 'kit.json'), 'utf8'));
  const { blocks } = kit;
  const pics = blocks.filter((b) => b.t === 'picture');
  const clips = blocks.filter((b) => b.t === 'clip');

  // ---------- story.md ----------
  const md = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h1': md.push('# ' + b.md); break;
      case 'subtitle': md.push(b.md); break;
      case 'p': md.push(b.md); break;
      case 'h3': md.push('## ' + b.md); break;
      case 'h4': md.push('### ' + b.md); break;
      case 'ul': md.push(b.items.map((i) => '- ' + i.md).join('\n')); break;
      case 'ol': md.push(b.items.map((i, k) => (i.value || k + 1) + '. ' + i.md).join('\n')); break;
      case 'quote': md.push(b.paras.map((p) => '> ' + p.md).join('\n>\n')); break;
      case 'teambox': md.push([...b.paras.map((p) => '> ' + p.md), '>', ...b.items.map((i) => '> - ' + i.md)].join('\n')); break;
      case 'hr': md.push('---'); break;
      case 'picture': md.push(`[PICTURE ${b.n} · ${b.file}]`, 'Caption: ' + (b.cap ? b.cap.md : '')); break;
      case 'clip': md.push(`[CLIP ${b.n} · paste on its own line, then Enter]`, b.url || 'MISSING LINK', 'Caption: ' + (b.cap ? b.cap.md : '')); break;
      default: throw new Error('block ' + b.t);
    }
  }
  const storyMd = md.join('\n\n') + '\n';
  writeFileSync(join(KIT, 'story.md'), storyMd);

  // ---------- story.html (the same text as rich text, for select-all + copy into Medium) ----------
  const hb = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h1': hb.push(`<h1>${b.html}</h1>`); break;
      case 'subtitle': hb.push(`<p class="sub">${b.html}</p>`); break;
      case 'p': hb.push(`<p>${b.html}</p>`); break;
      case 'h3': hb.push(`<h3>${b.html}</h3>`); break;
      case 'h4': hb.push(`<h4>${b.html}</h4>`); break;
      case 'ul': hb.push('<ul>' + b.items.map((i) => `<li>${i.html}</li>`).join('') + '</ul>'); break;
      case 'ol': hb.push('<ol>' + b.items.map((i, k) => `<li value="${i.value || k + 1}">${i.html}</li>`).join('') + '</ol>'); break;
      case 'quote': hb.push(b.paras.map((p) => `<blockquote>${p.html}</blockquote>`).join('')); break;
      case 'teambox': hb.push([...b.paras.map((p) => `<blockquote>${p.html}</blockquote>`), ...b.items.map((i) => `<blockquote>• ${i.html}</blockquote>`)].join('')); break;
      case 'hr': hb.push('<hr>'); break;
      case 'picture': hb.push(`<p class="mark">[PICTURE ${b.n} · ${h(b.file)}]</p><p class="capt">Caption: ${b.cap ? b.cap.html : ''}</p>`); break;
      case 'clip': hb.push(`<p class="mark">[CLIP ${b.n} · paste on its own line, then Enter]</p><p>${h(b.url)}</p><p class="capt">Caption: ${b.cap ? b.cap.html : ''}</p>`); break;
    }
  }
  writeFileSync(join(KIT, 'story.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Medium kit: story (copy source)</title>
<style>body{max-width:680px;margin:2rem auto;padding:0 16px;font:18px/1.6 Georgia,serif;color:#111;background:#fff}
.mark{font:600 14px/1.4 Menlo,monospace;background:#fff4c2;padding:4px 6px}.capt{font-size:15px;color:#555}
blockquote{border-left:3px solid #111;margin:0;padding-left:1em;font-style:italic}.sub{font-size:22px;color:#555}</style></head><body>
${hb.join('\n')}
</body></html>
`);

  // ---------- alt.txt ----------
  writeFileSync(join(KIT, 'alt.txt'), pics.map((p) => `${p.n}\t${p.file}\t${p.alt}`).join('\n') + '\n');

  // ---------- contact-sheet.html ----------
  const size = (p) => (p.px ? `${p.px.w}×${p.px.h} px` : p.w ? `${p.w}×${p.h} px (copied)` : '');
  writeFileSync(join(KIT, 'contact-sheet.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Medium kit: contact sheet</title>
<style>:root{color-scheme:light}body{margin:0;padding:1.5rem max(16px,3vw);background:#e9ecea;font:14px/1.45 system-ui,sans-serif;color:#17221e}
h1{font-size:1.4rem;margin:0 0 .3rem}.meta{color:#55625d;margin:0 0 1.2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:18px}
.card{background:#fff;border-radius:8px;padding:12px;display:grid;gap:6px;align-content:start}
.card img{width:100%;height:auto;border:1px solid #d3ddd8;background:repeating-conic-gradient(#f4f4f4 0 25%,#fff 0 50%) 0 0/16px 16px}
.n{font:700 13px/1.2 ui-monospace,Menlo,monospace}.n span{font-weight:400;color:#55625d}
.cap{margin:0}.alt{margin:0;color:#55625d;font-size:12.5px}
table{border-collapse:collapse;background:#fff;width:100%}td,th{border-bottom:1px solid #d3ddd8;padding:6px 8px;text-align:left;vertical-align:top;font-size:13px}
.wrap{overflow-x:auto;margin-top:1rem}code{font-size:12px;overflow-wrap:anywhere}</style></head><body>
<h1>Medium kit: ${pics.length} pictures, ${clips.length} clips</h1>
<p class="meta">Local check page, built ${h(kit.builtAt || '')} from ${h(kit.page || '')}. Pictures in paste order; the caption under each is what goes into Medium's caption line, the grey line is the alt text.</p>
<div class="grid">
${pics.map((p) => `<figure class="card"><div class="n">${p.n} · ${h(p.file)} <span>${size(p)}${p.kind === 'cap' ? ' · #' + h(p.id) : ' · copied'}${p.missing ? ' · <b>MISSING FILE</b>' : ''}</span></div>
<a href="${h(p.file)}"><img src="${h(p.file)}" alt="" loading="lazy"></a>
<p class="cap">${p.cap ? p.cap.html : '<b>NO CAPTION</b>'}</p><p class="alt">Alt: ${h(p.alt)}</p></figure>`).join('\n')}
</div>
<h2>Clips (Cloudflare Stream links)</h2>
<div class="wrap"><table><tr><th>#</th><th>Stream link</th><th>Caption</th></tr>
${clips.map((c) => `<tr><td>${c.n}</td><td><code>${h(c.url)}</code></td><td>${c.cap ? c.cap.html : ''}</td></tr>`).join('\n')}
</table></div>
</body></html>
`);

  // ---------- CHECKLIST.md ----------
  const title = blocks.find((b) => b.t === 'h1');
  const sub = blocks.find((b) => b.t === 'subtitle');
  const byline = blocks.find((b) => b.t === 'p' && b.cls === 'byline');
  const disc = [];
  for (let i = blocks.indexOf(byline) + 1; byline && i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === 'p' && /^\*[^*][\s\S]*\*$/.test(b.md)) disc.push(b.text); else break;
  }
  const pulls = blocks.filter((b) => b.t === 'quote' && b.pull).map((b) => b.paras.map((p) => p.text).join(' '));
  const words = storyMd.split(/\s+/).filter(Boolean).length;
  let heading = '(top)';
  const picRows = [];
  for (const b of blocks) {
    if (b.t === 'h3') heading = b.text;
    if (b.t === 'picture') picRows.push(`| ${b.n} | ${b.file} | ${heading.replace(/\|/g, '/')} |`);
    if (b.t === 'clip') picRows.push(`| clip ${b.n} | (Stream link) | ${heading.replace(/\|/g, '/')} |`);
  }
  const notes = [];
  for (const f of [...new Set((kit.overflow || []).map((x) => x.fig))]) {
    const p = pics.find((x) => x.id === f);
    const lines = [...new Set((kit.overflow || []).filter((x) => x.fig === f).map((x) => `"...${x.text.slice(-30)}", ${x.over} px`))];
    notes.push(`- **Text past the edge in ${p ? p.n + ' (`' + p.file + '`)' : '#' + f}?** A text box reaches past the drawing's viewBox (${lines.join('; ')}). Rotated axis labels can be false alarms: look at the picture; if text is cut, fix the article and rebuild.`);
  }
  for (const p of pics.filter((x) => /p\.note/.test(x.capFrom || ''))) notes.push(`- **${p.n} (\`${p.file}\`)** has no caption line on the page; its caption here is the note paragraph under it.`);
  for (const p of pics.filter((x) => x.missing)) notes.push(`- **${p.n} (\`${p.file}\`) is missing:** the picture file was not found (pass --gifs to kit/build.mjs).`);
  const longAlt = pics.filter((x) => (x.alt || '').length > 500);
  if (longAlt.length) notes.push(`- **${longAlt.length} alt texts are over 500 characters** (${longAlt.map((p) => `${p.n}: ${p.alt.length}`).join(', ')}); Medium may keep only the first 500 (UNVERIFIED limit; check.mjs notes a cut alt as ALT-CUT).`);
  const fig2 = pics.find((x) => x.id === 'fig-2');
  if (fig2) notes.push(`- ${fig2.n} (Fig. 2) is an animation on the page; the picture is one frame with the dots spread apart.`);
  if ((kit.warn || []).length) notes.push(`- Walker warnings: ${kit.warn.join('; ')}`);

  writeFileSync(join(KIT, 'CHECKLIST.md'), `# Medium kit: checklist

Everything here is local. Nothing has been uploaded, published or logged in to. Built ${kit.builtAt || ''} from \`${kit.page || ''}\`.

## The story

- **Title:** ${title ? title.text : ''}
- **Subtitle:** ${sub ? sub.text : ''}
- **Byline line (first paragraph after the subtitle):** ${byline ? byline.text : ''}
- **Disclaimer lines** (the first italic paragraphs; keep them italic, right under the byline):
${disc.map((d) => `  - ${d}`).join('\n')}

## Suggested tags (Medium allows 5)

1. Web Performance
2. AI Agents
3. Claude
4. Frontend Development
5. Software Engineering

(Alternatives if one doesn't fit: Safari, iOS, Web Animation, Loop Engineering.)

## Counts

- Pictures: **${pics.length}** (${pics.filter((p) => p.kind === 'cap').length} figures captured as PNG, ${pics.filter((p) => p.kind === 'img').length} existing pictures copied unchanged), files \`01-…\` to \`${pics.length ? pics.at(-1).n : '00'}-…\` in this folder.
- Clips: **${clips.length}** Cloudflare Stream links (\`[CLIP 01]\` to \`[CLIP ${clips.length ? clips.at(-1).n : '00'}]\` in the story).
- story.md: about ${words.toLocaleString('en')} words (markers and captions included).

Medium has no tables and no SVG, so every figure (charts, diagrams, the team maps, the tables) is a picture.
The figure pictures are 2,400 px wide (1,200 CSS px at 2x), light colours. The alt text for every picture is in
\`alt.txt\` (one line per picture: number, file, alt text).

## Paste steps

1. **Text.** Open \`story.html\` in a browser, select all, copy, paste into a new Medium draft. Medium keeps headings,
   bold, italic, links, lists and quotes from rich text. (\`story.md\` is the same text as Markdown; Medium does not
   turn pasted Markdown into formatting, so use it as the readable source, not for pasting.) After the paste:
   make the first line the title and the second line the subtitle (Medium's "T" / small "T"), and check that
   "## " sections became big headings and "### " small ones.
2. **Pictures, in order.** Every \`[PICTURE NN · file]\` line marks a picture. Click on the empty line, press the
   "+" and upload the file of that name from this folder (or drag it in). Then delete the marker line.
3. **Clips.** Every \`[CLIP NN · …]\` line is followed by its Stream link alone on a line. Delete the marker line,
   put the cursor at the end of the link and press Enter: Medium turns the link into an embedded player.
4. **Captions.** Each picture and clip has a \`Caption: …\` line under it. Cut the text after "Caption: ", click the
   picture or player, click its caption line ("Type caption for image") and paste. Delete the leftover line.
5. **Alt text.** Click each picture, choose "Alt text" in its toolbar and paste the matching line from \`alt.txt\`.
6. **Pull quotes.** These ${pulls.length} quotes are pull quotes on the page (Medium: press the quote button twice):
${pulls.map((p) => `   - "${p}"`).join('\n')}
7. **Links inside the page** (to a day or a source, e.g. "Day 8", "source") can't work on Medium: the words stay,
   the link is gone. The numbered Sources list at the end stays as it is.
8. **Check.** Run \`medium-dump.js\` in the browser console on the draft, save the JSON, and run
   \`node research/team-article/medium-check/check.mjs --dump <file>\` (README in that folder). Done means
   \`CHECK CLEAN\`. \`contact-sheet.html\` shows every picture in order with its caption, for the look.

The Medium editor behaviour in these steps (rich-text paste, Enter on a link to embed, quote button twice, the
alt-text button) is from general knowledge of Medium, not tried in a draft yet: check it on the first picture and clip.

## Things to know before pasting

${notes.join('\n') || '- Nothing special.'}

## Where each picture and clip goes

| # | file | section |
|---|---|---|
${picRows.join('\n')}
`);

  return { pictures: pics.length, clips: clips.length, words, pulls: pulls.length, disclaimer: disc.length, notes: notes.length };
}

if (process.argv[1] && process.argv[1].endsWith('/render.mjs')) {
  const { REPO } = await import('../lib/cli.mjs');
  const i = process.argv.indexOf('--out');
  const KIT = i > 0 ? process.argv[i + 1] : join(REPO, 'out', 'article', 'medium-kit');
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  if (!existsSync(join(KIT, 'kit.json'))) { console.error(`usage: no kit.json in ${KIT} (run kit/build.mjs first)`); process.exit(2); }
  console.log(JSON.stringify(render(KIT)));
}
