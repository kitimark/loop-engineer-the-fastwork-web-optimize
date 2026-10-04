// Comments on console items (I-090, user T-043: "comments like Claude artifacts"): on every console page the user
// points at an item (hover or click it, or select text in it) and writes a comment; the comment becomes a console
// thread (console-threads.mjs) that carries an anchor: the page, a stable item id and the quoted selection. The thread
// view shows the anchor as a quote with a link back; the item shows a marker with its comment count. The lead triages
// and assigns these threads like any other; `thread wait --as lead` wakes on them (a user message).
//
// This file is the anchor model, pure (no store): which pages, which item ids per page (an allowlist of patterns),
// caps, the link back, and the per-page marker counts from a list of threads. The browser side is console-comments.js.
//
// An anchor: {page, item, quote?, label?}
//   page   steps | proposals | status | progress | build | threads | agents (I-118: /agents and /agent/<name>)
//   item   per page (ITEM): steps "step:C-032"; proposals "PR-009", "PR-009/option:both", "PR-009/option:both/shot:2",
//          "PR-009/video:b", "PR-009/section:gain", "PR-009/option:both/section:risk" (T-048, SECTIONS); status
//          "status:cd-strip"; progress and build "progress:style-recalc"; threads "thread:T-003" or "thread:T-003/msg:4"; agents "agent:wi-stack" (one agent's page, I-118);
//          and on every page "part:page" (I-096): anything on the page that is no item of its own (headings, filters,
//          panels, list lines without an id); its quote is the line pointed at
//   quote  the selected text, plain, one line, at most LIMITS.quote chars (longer selections are cut with "…")
//   label  the item's own title as the page shows it (one line, at most LIMITS.label), for the thread title
// The user's own words: stored as typed (the local store, like any thread text); never HTML (the pages use textContent).

export const PAGES = ['steps', 'proposals', 'status', 'progress', 'build', 'threads', 'agents'];
export const LIMITS = Object.freeze({ item: 120, quote: 300, label: 120 });
const SLUG = '[a-z0-9][a-z0-9-]{0,40}';
const OPTION = '[a-z0-9][a-z0-9._-]{0,39}';
/** T-048: the parts of a proposal a question can be about (the page's section headings), id -> plain words. */
export const SECTIONS = Object.freeze({ problem: 'what costs', idea: 'the idea', 'looks-same': 'why it looks the same', 'visual-diff': 'what looks different', gain: 'what it saves', risk: 'risk' });
const SECTION = `section:(?:${Object.keys(SECTIONS).join('|')})`;
const PR_ITEM = `PR-\\d{1,6}(?:\\/option:${OPTION})?(?:\\/(?:shot:\\d{1,2}|video:(?:a|b|both)|${SECTION}))?`;
// I-096 (user T-043 #6/#8: "comment anywhere"): a part of a page that is no item of its own ("part:page", the whole
// page: headings, filters, panels); the line the user pointed at goes along as the quote.
const PART = `part:${SLUG}`;
const withPart = (re) => new RegExp(`^(?:${re}|${PART})$`);
/** The item ids each page may anchor: a whole-string pattern per page (every page also takes "part:<slug>"). */
export const ITEM = Object.freeze({
  steps: withPart('step:C-\\d{1,6}'),
  proposals: withPart(PR_ITEM),
  status: withPart(`status:${SLUG}`),
  progress: withPart(`progress:${SLUG}`),
  build: withPart(`progress:${SLUG}`),
  threads: withPart('thread:T-\\d{1,6}(?:\\/msg:\\d{1,3})?'),
  agents: withPart('agent:[A-Za-z0-9][A-Za-z0-9_.-]{0,60}'), // I-118: the agent-view.mjs AGENT shape
});
/** The page's own name, as the menu says it. */
export const PAGE_WORDS = Object.freeze({ steps: 'Your steps', proposals: 'Proposals', status: 'Status', progress: 'Progress', build: 'Best build', threads: 'Threads', agents: 'Agents' });
const isPart = (it) => /^part:/.test(it);

/** One line of plain text: control characters and line breaks become spaces, runs of spaces one. */
export const plainLine = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
const cap = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The page's anchor made safe to store: {page, item, quote?, label?}. Throws on an unknown page, an item id outside the
 * page's pattern, or a non-string field. Quote and label are cut to their caps (a long selection is not an error).
 */
export function normAnchor(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('anchor must be an object {page, item, quote?}');
  const page = String(a.page ?? '');
  if (!PAGES.includes(page)) throw new Error(`anchor.page must be one of ${PAGES.join(', ')} (got ${JSON.stringify(page.slice(0, 40))})`);
  if (typeof a.item !== 'string' || a.item.length > LIMITS.item || !ITEM[page].test(a.item)) throw new Error(`anchor.item is not an item of the ${page} page (got ${JSON.stringify(String(a.item ?? '').slice(0, 60))})`);
  for (const k of ['quote', 'label']) if (a[k] != null && typeof a[k] !== 'string') throw new Error(`anchor.${k} must be text`);
  const quote = cap(plainLine(a.quote), LIMITS.quote);
  const label = cap(plainLine(a.label), LIMITS.label);
  return { page, item: a.item, ...(quote && { quote }), ...(label && { label }) };
}

/** Where the item lives: the page and its hash (each page opens its item from the hash). */
export function anchorUrl(a) {
  if (!a || !PAGES.includes(a.page) || !ITEM[a.page]?.test(a.item)) return null;
  const it = a.item;
  if (isPart(it)) return a.page === 'steps' ? '/' : `/${a.page}`; // a part: the page itself
  switch (a.page) {
    case 'steps': return `/#${it.slice('step:'.length)}`;
    case 'proposals': return `/proposals#${it.split('/')[0]}`;
    case 'status': return `/status#${it.slice('status:'.length)}`;
    case 'progress': return `/progress#${it.slice('progress:'.length)}`;
    case 'build': return `/build#${it.slice('progress:'.length)}`;
    case 'threads': return `/threads#${it.slice('thread:'.length).split('/')[0]}`;
    case 'agents': return `/agent/${it.slice('agent:'.length)}`;
    default: return null;
  }
}

/** Words for the item in a title or a chip: "C-032", "PR-009 option both, shot 2", "status cd-strip", "T-003 #4". */
export function itemText(a) {
  const it = String(a?.item ?? '');
  if (isPart(it) && PAGE_WORDS[a?.page]) return it === 'part:page' ? `the ${PAGE_WORDS[a.page]} page` : `${PAGE_WORDS[a.page]}: ${it.slice('part:'.length).replace(/-/g, ' ')}`;
  if (a?.page === 'steps') return it.slice('step:'.length);
  if (a?.page === 'threads') return it.slice('thread:'.length).replace('/msg:', ' #');
  if (a?.page === 'proposals') return it.split('/').map((p, i) => (!i ? p : p.startsWith('section:') ? SECTIONS[p.slice(8)] || p : p.replace(':', ' '))).join(', ').replace(', option ', ' option ');
  return it.replace(':', ' ');
}

/** T-048: the proposal a comment is about ("PR-009" for "PR-009/option:x/section:gain"), or null for other pages. */
export function proposalOf(a) {
  return a && a.page === 'proposals' && /^PR-/.test(String(a.item)) && ITEM.proposals.test(String(a.item)) ? String(a.item).split('/')[0] : null; // not "part:page"
}

/** The thread title for a comment: "Comment on <label or item>: <the first words of the comment>". */
export function commentTitle(a, text, max = 160) {
  const what = a.label ? `${itemText(a)} "${cap(a.label, 60)}"` : itemText(a);
  return cap(plainLine(`Comment on ${what}: ${plainLine(text)}`), max);
}

/** The anchor as the page shows it (adds the link back). */
export function anchorView(a) {
  return a ? { ...a, url: anchorUrl(a), itemText: itemText(a) } : undefined;
}

/**
 * The markers of one page: {items: {<item>: {count, open, threads: [{id, state}]}}} from the threads that carry an
 * anchor on `page` (newest last; closed threads count, `open` counts the rest). Proposal sub-items also count for the
 * proposal ("PR-009/option:both/shot:2" adds to "PR-009"), so a collapsed card still shows that it has comments.
 */
export function markersFor(page, threads, stateOf) {
  const items = {};
  const add = (key, t) => {
    const m = (items[key] ||= { count: 0, open: 0, threads: [] });
    m.count++;
    if (t.status !== 'closed') m.open++;
    m.threads.push({ id: t.id, state: stateOf ? stateOf(t) : t.status });
  };
  for (const t of threads) {
    const a = t.anchor;
    if (!a || a.page !== page || !ITEM[page]?.test(a.item)) continue;
    add(a.item, t);
    if (page === 'proposals' && a.item.includes('/')) add(a.item.split('/')[0], t);
  }
  return { page, items };
}
