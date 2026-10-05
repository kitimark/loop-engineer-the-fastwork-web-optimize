// I-191 (user T-170 #9): the claude.ai artifact links an agent may leave in a console text. The scrubbers (Hard rule 12:
// console-threads.mjs scrubAgentText for thread messages and notes, proposal.mjs scrubText for proposal texts) replace
// every other web link with <link>; these two forms are stored as written, and the Threads page and the Proposals
// page's talk make them clickable (the same rule is copied into threads-page.html and proposals-page.html):
//   https://claude.ai/artifact/<id>             id: 6-64 of [A-Za-z0-9_-]
//   https://claude.ai/code/artifact/<uuid>      a standard 8-4-4-4-12 hex UUID
// Exactly that: https, the host claude.ai in lower case, no user info, port, other path, query or fragment. Sentence
// punctuation after the link is not part of it (TRAILING). An artifact id names a document, no person; the store stays
// local. Everything else (other hosts, http, raw IPs, .local/.lan hosts, other claude.ai paths) is scrubbed as before.

/** Sentence punctuation after a link is not part of it. */
export const TRAILING = /[.,;:!?)\]}'"]+$/;
/** A candidate: `https://claude.ai/` and the rest of its token, at the start of a word (not inside another URL). */
export const ARTIFACT_CANDIDATE = /(?<![^\s(\[{<'"`*|])https:\/\/claude\.ai\/\S*/g;
export const ARTIFACT_VALID = /^https:\/\/claude\.ai\/(?:artifact\/[A-Za-z0-9_-]{6,64}|code\/artifact\/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$/;

/** For a candidate token: {url, rest} when it is an artifact link (plus trailing punctuation), else null. */
export function artifactLink(token) {
  const url = String(token).replace(TRAILING, '');
  return ARTIFACT_VALID.test(url) ? { url, rest: token.slice(url.length) } : null;
}

/**
 * `text` with every artifact link replaced by mark(url) (a placeholder the caller puts back after scrubbing); invalid
 * candidates are left as they are, for the scrubber to replace whole.
 */
export function keepArtifactLinks(text, mark) {
  return String(text).replace(ARTIFACT_CANDIDATE, (m) => {
    const p = artifactLink(m);
    return p ? mark(p.url) + p.rest : m;
  });
}
