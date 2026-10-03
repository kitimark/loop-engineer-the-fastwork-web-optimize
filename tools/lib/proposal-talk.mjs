// Talk inside a proposal (ts-proposal-talk, user T-048, 2026-10-03: "allow us to talk in proposal for clarify my question
// and understand more about each proposal"). Built on the I-090 comments: a question or comment on a proposal is a
// console thread with an anchor on the proposals page ("PR-009", "PR-009/option:tiles", "PR-009/section:gain", …;
// console-comments.mjs). One store, the threads. What this adds:
//   - routing: a user's comment on a proposal is assigned at once to the proposal's author (talkRoute), so the author's
//     `console.mjs thread wait --as <author>` wakes on it; the lead's wakes too (it reads every thread) and answers when
//     the author is gone (or reassigns with `thread assign`). A proposal by the lead, a draft or a withdrawn one routes
//     to nobody but the lead.
//   - the conversation on the proposal page: GET /api/proposals/<id>/talk (talkView: every thread anchored on that
//     proposal, oldest first, as the threads page gets them, images included); the page shows them under the
//     proposal with a reply box each and an "Ask a question" box; the list carries a count per proposal (talkIndex).
//   - the agent side: `console.mjs proposal talk [<id>] …` (proposal-cli.mjs) lists and shows them; answers go with
//     `console.mjs thread reply <T-id> --by <you>` (the author is assigned; the lead may always reply).
// No decision semantics change: a question is never a decision or a change request (memory/proposal-decision-is-the-spec.md);
// only decide / undo change a proposal's state. Text: the user's as typed (local store), agents' scrubbed (console-threads.mjs).
import { get, publicView, listProposals, decisionRecipients, parseProposalId } from './proposal.mjs';
import { listThreads, pageThread, threadState, unreadFor, threadLine, anchorLine, imageLines, oneLine, markRead, USER, LEAD } from './console-threads.mjs';
import { proposalOf } from './console-comments.mjs';

/** The proposal a thread is about (its anchor), or null. */
export const threadProposal = (t) => proposalOf(t?.anchor);

/**
 * Where a user's comment with this anchor goes besides the lead: {id, to: [the author], note} for a proposal the page
 * shows (not a draft, not withdrawn) whose author is not the lead; {id, to: [], note} for one by the lead; null for
 * other pages and unknown or hidden proposals.
 */
export function talkRoute(anchor) {
  const id = proposalOf(anchor);
  if (!id) return null;
  let p = null;
  try { p = get(id); } catch { return null; }
  if (!publicView(p)) return null;
  return { id, to: decisionRecipients(p).filter((n) => n !== LEAD), note: `author of ${id}` };
}

/** Every thread anchored on proposal `id`, oldest first. */
export function talkThreads(id, threads = listThreads()) {
  const pid = parseProposalId(id);
  return threads.filter((t) => threadProposal(t) === pid);
}

/** What the page shows under proposal `id`: who answers, and the threads; null when the page does not show it. */
export function talkView(id) {
  const pid = parseProposalId(id);
  let p = null;
  try { p = get(pid); } catch { return null; }
  if (!publicView(p)) return null;
  return { id: pid, to: decisionRecipients(p), threads: talkThreads(pid).map((t) => pageThread(t)) };
}

/**
 * Per proposal with talk: {count, open, waiting (open threads whose last word is the user's: an answer is due),
 * unread (agents' messages the user has not seen), yourTurn (an agent asked the user)}. For the page's list.
 */
export function talkIndex(threads = listThreads()) {
  const out = {};
  for (const t of threads) {
    const id = threadProposal(t);
    if (!id) continue;
    const s = threadState(t);
    const r = (out[id] ||= { count: 0, open: 0, waiting: 0, unread: 0, yourTurn: 0 });
    r.count++;
    if (s !== 'closed') r.open++;
    if (s === 'open') r.waiting++;
    if (s === 'waiting-on-you') r.yourTurn++;
    r.unread += unreadFor(t, USER).length;
  }
  return out;
}

const STATE_WORDS = { open: 'waiting for an answer', answered: 'answered', 'waiting-on-you': 'asks the user', closed: 'closed' };

/** `proposal talk <id>`: the threads on one proposal, every message, and how to answer. */
export function talkText(id, reader) {
  const pid = parseProposalId(id);
  const p = get(pid);
  const ts = talkThreads(pid);
  const L = [`${pid} "${oneLine(p.title)}" by ${p.by} [${p.state} rev ${p.rev}]: ${ts.length ? `${ts.length} thread(s) of questions and comments` : 'no questions or comments yet'}`];
  for (const t of ts) {
    L.push(`${threadLine(t, reader)}  (${STATE_WORDS[threadState(t)] || threadState(t)})`);
    L.push(`  ${anchorLine(t.anchor)}`);
    for (const m of t.messages) {
      L.push(`  #${m.n} ${m.by}${m.ask ? ' (asks the user)' : ''} at ${m.at}:`);
      if (m.text || !m.images?.length) for (const l of String(m.text).split('\n')) L.push(`    ${l}`);
      for (const l of imageLines(t, m)) L.push(`    ${l}`);
    }
  }
  if (ts.length) L.push(`answer: node tools/console.mjs thread reply <T-id> --by ${reader || '<you>'} --text "…" [--ask] [--image <png> --caption "…"]   (the user reads it under the proposal; a question is no decision: revise only after the user requests a change)`);
  return L.join('\n');
}

/** `proposal talk [--by <author>] [--unanswered]`: one line per proposal with talk. */
export function talkList({ by, unanswered = false } = {}) {
  const idx = talkIndex();
  const items = listProposals({ all: true, ...(by && { by }) }).filter((p) => idx[p.id] && (!unanswered || idx[p.id].waiting));
  return items.map((p) => {
    const r = idx[p.id];
    return `${p.id}  ${r.count} thread(s), ${r.waiting} waiting for an answer${r.yourTurn ? `, ${r.yourTurn} asking the user` : ''}  by ${p.by}: ${oneLine(p.title)}`;
  });
}

/** `proposal talk <id> --as <agent>`: mark every thread on it read for the agent. */
export async function markTalkRead(id, reader) {
  for (const t of talkThreads(id)) if (t.messages.length) await markRead(t.id, reader);
}
