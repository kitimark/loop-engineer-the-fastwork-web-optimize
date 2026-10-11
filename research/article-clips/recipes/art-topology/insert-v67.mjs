// insert-v67.mjs: copy the live draft (v66) to p1-v67-edit.html and insert the Team 0..11 figures (from figs-out/),
// their first-person lead-ins, the "How I ran the team" box, a CSS rule for that box and source note 31.
// The v66 draft itself is never written.
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const ART = path.join(DIR, '..', 'articles');
const SRC = path.join(ART, 'p1-ten-days-draft.html');
const DST = path.join(ART, 'p1-v67-edit.html');
let h = fs.readFileSync(SRC, 'utf8');
const fig = (n) => fs.readFileSync(path.join(DIR, 'figs-out', `team-${n}.html`), 'utf8');

const P = {
  0: 'Fig. 2 shows what one round did. Who did the work changed almost every day. Here is the whole team I ended up with, in the positions the day diagrams below keep, so any day can be compared with the end. The management layer between the lead and the workers ran from Day 1 to Day 7. By Day 8 the lead talked to the owners directly.',
  1: 'On the first evening I wired the team as a star around the lead. Fix owners worked in their own worktrees and queued for one Chrome lock, toolsmiths took one incident each, and at 23:06 the agents started reporting to mgmt-ops, so the lead could stop answering all of them.',
  2: 'On Day 2 I stepped out of the chat. From 15:12 my steps went to the console, design engineers joined after my first hint, and with timing put off, the Chrome lock got a shared lane for jobs that measure nothing.',
  3: 'On Day 3 the owners started to reach me directly, through proposals in the console. After the camera incident, only ioscap, a recorder that can open nothing but the iPhone screen, could film the phone.',
  4: 'After my note at 16:09, a router sent each thread to the agent that owns its topic, and the lead woke only for decisions, escalations and messages nobody had answered. The rules every agent loads moved into the repo as project memory.',
  5: 'On Day 5 a desk agent ran the queue order and incident dispatch from 10:15 to 18:12, and then mgmt-devices became the steward for every idle-phone alarm, after 18 of them in one day. After my 21:18 note the roles became proactive, so owners sent results straight to the integrator and mgmt-ops landed docs on its own.',
  6: 'At 12:33 we hit a usage limit and switched accounts, and at 12:36 I asked for cheaper models. By 13:02 a sonnet clerk ran operations, one-shot readers did the second reads, mgmt-ops-10 and iphone-runner were parked, and the fix owners held the iPhone themselves.',
  7: 'On Day 7 the clerk and the readers wound down, and the lead talked to the owners directly. At 10:02 I let any agent use a free iPhone, and from 16:04 every breakthrough became a written practice that each owner checks against its own part of the page.',
  8: 'On Day 8 the wiring stayed simple and the direction changed. At 11:08 arch-end-fresh started a review of the end from zero, and after 15:38 each visible flaw of the original end got its own small g0 owner, who brought me a proposal.',
  9: 'Day 9 kept the same wiring with smaller owners, and I probed WebKit myself. At 19:44 I made a dropped phone link the lead’s to repair before any step for me.',
  10: 'After I called the work done at 10:56, the team turned from fixing to filming. A capture agent recorded the worst moments on the phone for the article writers, and five sonnet summarisers built the day log this story follows.',
  11: 'On Day 11 I swiped the phone myself, and a capture agent turned my swipe into a robot replay. A reviewer, a data auditor and an editor joined the writers for this article.',
};
const BOX = `<aside class="teambox" id="team-how">
  <p><strong>How I ran the team</strong></p>
  <ul>
    <li><strong>Day 1, evening.</strong> One agent per problem, each in its own worktree, one lock for Chrome, a lease for the iPhone, rebase-only landing and a toolsmith for every broken tool. I wanted many agents at work without breaking main.</li>
    <li><strong>Day 1, 23:05.</strong> A management layer between the lead and the workers. The lead was being interrupted all the time, and I was the one spotting the team’s problems.</li>
    <li><strong>Day 2.</strong> I left the chat. My steps, threads and proposals went through a console, and timing gave way to counts, so three agents could use Chrome at once.</li>
    <li><strong>Days 4 and 5.</strong> Questions went to their owners. A router sent each thread to the agent that owns its topic, a desk and a device steward took work off the lead, and every role became proactive.</li>
    <li><strong>Day 6.</strong> A usage limit made the team cheaper. A sonnet clerk and one-shot readers replaced the opus hub, and the fix owners held the iPhone themselves.</li>
    <li><strong>Day 8.</strong> The big reset came from a new direction. A from-zero review of the end of the page, then one small owner for each visible flaw.</li>
    <li><strong>Day 10.</strong> With the rendering work done, the team became a crew that films the phone and writes this story.</li>
  </ul>
</aside>`;
const CSS = `/* "How I ran the team" box (v67): on Medium, a bold line and a bulleted list */
.teambox { border-left: 3px solid var(--signal); padding: 0.1rem 0 0.1rem 1rem; }
.teambox > * { margin: 0; }
.teambox > * + * { margin-top: 0.6em; }
`;
const SRC31 = `    <li id="src-31" value="31">Team 0 to Team 11: reconstructed on 11 October from the git history on main (commit subjects carry the rule, the incident and often the agent name; counted by UTC day), the metadata of the shared console, lock and incident stores (created-at times, lock-hold owners and modes, the thread router’s topic map, the desk and steward settings), and the session transcripts, read for agent names, types, models and start times only, never message content. The agents line in each diagram counts the agents the lead started per UTC day: 72, 88, 35, 48, 59, 63, 31, 18, 17, 18 and 20 for Days 1 to 11 (Day 10 over the whole day; the Day 10 heading’s 11 stops at 12:57). ×N in a box counts that role’s agents that day; the 201 helpers on Day 1 were started by other agents. Day 5’s 116 threads and 90 incidents come from the console and incident stores; the 18 idle-phone alarms (204 minutes) from thread T-149, which led to the steward. A box shows a role that had agents that day, or a standing part of the setup (console from Day 2, router from Day 4, the tools band). “new” marks a first appearance or new wiring that day; dashed marks a role parked that day, and in Team 0 a part not used on Day 10 or 11. Steps whose purpose rests only on inference are left out. Drawn by a script from per-day topology notes.</li>
`;

function insertAfterLine(marker, html) {
  const i = h.indexOf(marker); if (i < 0) throw new Error('marker not found: ' + marker);
  if (h.indexOf(marker, i + 1) >= 0) throw new Error('marker not unique: ' + marker);
  const e = h.indexOf('\n', i); h = h.slice(0, e + 1) + html + '\n' + h.slice(e + 1);
}
function insertAfterFigure(id, html) {
  const i = h.indexOf(`id="${id}"`); if (i < 0) throw new Error('no ' + id);
  const e = h.indexOf('</figure>\n', i) + '</figure>\n'.length; h = h.slice(0, e) + html + '\n' + h.slice(e);
}
function insertBeforeLine(marker, html) {
  const i = h.indexOf(marker); if (i < 0 || h.indexOf(marker, i + 1) >= 0) throw new Error('marker: ' + marker);
  const s = h.lastIndexOf('\n', i) + 1; h = h.slice(0, s) + html + '\n' + h.slice(s);
}
const block = (n) => `<p>${P[n]}</p>\n${fig(n)}`;

if (h.includes('id="team-')) throw new Error('source already has Team figures');
h = h.replace('</style>', CSS + '</style>');
insertAfterFigure('fig-2', `${block(0)}\n${BOX}\n${block(1)}`);
insertAfterLine('<figure class="gif"><img src="gifs/day2-console.png"', block(2));
insertAfterLine('<figure class="gif"><img src="gifs/day3-proposal-decision.png"', block(3));
insertAfterLine('At 16:09 I suggested sending each thread to the agent that owns its topic.</p>', block(4));
insertAfterFigure('fig-7', block(5));
insertAfterLine('<figure class="gif"><img src="gifs/day6-end-bg.png"', block(6));
insertAfterLine('<figure class="gif"><video src="videos/end-openclose-take-2x-strip.mp4"', block(7));
insertAfterLine('<figure class="gif"><img src="gifs/day8-menu-strip.png"', block(8));
insertAfterLine('<figure class="gif"><video src="videos/day9-logo-closeup-2x-hq.mp4"', block(9));
insertAfterLine('<figure class="gif"><img src="gifs/day10-people-pb-strip.jpg"', block(10));
insertBeforeLine('<p><em>[My thoughts. Write over this. Prompts: You had already called it done.', block(11));
insertAfterLine('<li id="src-30" value="30">', SRC31.trimEnd());
fs.writeFileSync(DST, h);
console.log('wrote', DST, h.length, 'bytes');
