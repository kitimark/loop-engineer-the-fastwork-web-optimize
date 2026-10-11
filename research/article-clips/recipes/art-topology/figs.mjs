// figs.mjs: the "Team 0" .. "Team 11" topology figures for the Part 1 article (v67).
// Reads topology.json (per-day nodes/edges/flags from git history, store metadata and transcript metadata),
// maps every topology node onto one of 14 fixed slots plus a 4-cell tools band (same positions every day),
// and writes figs-out/team-N.html (the whole <figure>) and figs-out/team-N.svg.
// Usage: node figs.mjs            -> writes the files, prints a fit/consistency report
// Colours only through the page's custom properties (cap-area tokens: --you, --lead, --agents, --signal, --ink, ...).
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const topo = JSON.parse(fs.readFileSync(path.join(DIR, 'topology.json'), 'utf8'));
const OUT = path.join(DIR, 'figs-out');
fs.mkdirSync(OUT, { recursive: true });

// ---------- geometry (viewBox 1200 x 560) ----------
const W = 1200, H = 560;
const L = (x, y, w, h, kind, col, row) => ({ x, y, w, h, kind, col, row });
const SLOT = {
  you: L(30, 116, 210, 66, 'user', 'A', 1),
  console: L(30, 226, 210, 66, 'tool', 'A', 2),
  router: L(30, 336, 210, 66, 'tool', 'A', 3),
  lead: L(290, 116, 240, 66, 'lead', 'B', 1),
  mgmt: L(290, 226, 240, 66, 'lead', 'B', 2),
  deputy: L(290, 336, 240, 66, 'lead', 'B', 3),
  fix: L(600, 116, 265, 60, 'agents', 'C1', 1),
  review: L(905, 116, 265, 60, 'agents', 'C2', 1),
  ts: L(600, 192, 265, 60, 'agents', 'C1', 2),
  arch: L(905, 192, 265, 60, 'agents', 'C2', 2),
  int: L(600, 268, 265, 60, 'agents', 'C1', 3),
  phone: L(905, 268, 265, 60, 'agents', 'C2', 3),
  helpers: L(600, 344, 265, 60, 'agents', 'C1', 4),
  article: L(905, 344, 265, 60, 'agents', 'C2', 4),
};
const FRAME = { x: 584, y: 84, w: 600, h: 330 };          // the agents group
const BAND = { y: 446, h: 56, cells: { main: [30, 295], boards: [295, 587], lock: [587, 885], iphone: [885, 1170] } };
const BUS = 562;                                           // vertical bus between the lead column and the agents
const cx = (s) => s.x + s.w / 2, cy = (s) => s.y + s.h / 2;

// ---------- topology id -> slot ----------
const SLOT_OF = (id, day) => ({
  user: 'you', console: 'console', router: 'router', lead: 'lead', loops: 'lead', peer: null,
  mgmt: 'mgmt', clerk: 'mgmt', desk: 'deputy', steward: 'deputy',
  fix: 'fix', g0: 'fix', helpers: 'helpers', map: 'helpers', res: 'helpers',
  ts: 'ts', review: 'review', rev: 'review', readers: 'review',
  arch: 'arch', de: 'arch', claims: 'arch', de_arch: 'arch', fresh: 'arch', orig: 'arch', heat: 'arch',
  cm: day === 8 ? 'int' : 'arch', wi: 'int', int: 'int', runner: 'phone', cap: 'phone', art: 'article', sum: 'article',
  wt: 'B:main', main: 'B:main', best: 'B:main', lock: 'B:lock', iphone: 'B:iphone', ioscap: 'B:iphone',
  inc: 'B:boards', memory: 'B:boards', playbook: 'B:boards', cards: 'B:boards', board: 'B:boards', idle: 'B:boards', guards: 'B:boards',
}[id]);

// ---------- per-day display text (short labels; facts from topology.json / topology-timeline.md) ----------
// labels: slot -> [label, sub]; band: cell -> [label, sub]; flags override topology flags where the evidence says so.
const DAYS = {
  1: { date: 'Wed 30 Sep', title: 'Day 1 · One chat becomes a team',
    sub: '72 agents started by the lead, 201 more started by those agents. All of it was set up that evening.',
    noTags: true,
    labels: { you: ['You', 'chat with the lead'], lead: ['Lead', 'orchestrator + check-ins'],
      mgmt: ['mgmt-lead + mgmt-ops', 'agents report here from 23:06'], fix: ['Fix owners ×9', 'wave 1, one topic each'],
      review: ['Reviewers ×12', 'read each finished fix'], ts: ['Toolsmiths ×12', 'one per incident'],
      arch: ['Architecture ×11', 'experts, all on opus'], helpers: ['Helpers ×201', 'started by the agents'] },
    band: { main: ['main + worktrees', 'rebase + ff only, hooks'], boards: ['Incidents + findings', 'every agent posts'],
      lock: ['chrome-measure lock', '+ short lane (21:57)'], iphone: ['iPhone lease', 'finger tests by you'] },
    edgeLabels: { 'you>lead': 'chat' } },
  2: { date: 'Thu 1 Oct', title: 'Day 2 · I leave the chat',
    sub: '88 agents started by the lead. My steps and answers move to a console; timing gives way to counts.',
    labels: { you: ['You', 'steps in the console'], console: ['Console', 'steps, threads, proposals'],
      lead: ['Lead', 'threads; signs D cards'], mgmt: ['mgmt-ops hub', 'agents report here'],
      fix: ['Fix owners', 'wave 1 continues'], review: ['Reviewers ×22', 'read each finished fix'],
      ts: ['Toolsmiths ×25', 'one per incident'], arch: ['Design engineers ×13', '+ claim verifiers ×5'],
      phone: ['iphone-runner', 'the first phone agent, 06:49'] },
    band: { main: ['main + snapshot', 'frozen, pinned 07:57'], boards: ['Boards + v2 cards', 'R-I-D-F-V-L; lead signs D'],
      lock: ['chrome-measure lock', 'shared lane; timing deferred'], iphone: ['iPhone + Simulator', 'held by iphone-runner'] },
    flags: { 'B:main': 'changed' },
    edgeLabels: { 'you>console': 'steps, answers', 'phone>console': ['finger steps', 612, 300] } },
  3: { date: 'Fri 2 Oct', title: 'Day 3 · Owners reach me with proposals',
    sub: '35 agents started by the lead. 6 proposals decided in the console.',
    labels: { you: ['You', 'decide proposals'], console: ['Console', '+ proposals with Try-it'],
      lead: ['Lead', 'lands, spawns, priorities'], mgmt: ['mgmt-ops hub', 'ops-6, then ops-7'],
      fix: ['Fix owners', 'send proposals to you'], review: ['Reviewers ×11', 'mostly re-reviews'],
      ts: ['Toolsmiths ×14', 'one per incident'], arch: ['Design engineers ×5', 'heat, GPU, countdown'],
      int: ['wi-stack', 'first wave integrator'], phone: ['iphone-runner', 'records only via ioscap'] },
    band: { main: ['main + worktrees', 'rebase + ff only'], boards: ['Status board', 'shows waits and holds'],
      lock: ['chrome-measure lock', 'mostly shared holds'], iphone: ['iPhone + ioscap', 'unplugged 12:03'] },
    edgeLabels: { 'fix>console': 'proposals' } },
  4: { date: 'Sat 3 Oct', title: 'Day 4 · Questions go to their owners',
    sub: '48 agents started by the lead. A router sends each thread to the agent that owns its topic.',
    labels: { you: ['You', 'threads, comments'], console: ['Console', 'comments, proposal talk'],
      router: ['Thread router', 'topic map set 18:28'], lead: ['Lead', 'wakes for decisions only'],
      mgmt: ['mgmt-ops hub', 'ops-9, then ops-10'], fix: ['Fix owners ×8', 'answer your threads'],
      review: ['Reviewers ×8', 'read each finished fix'], ts: ['Toolsmiths ×19', 'one per incident'],
      arch: ['Design + arch. ×7', 'memory, thread routing'], phone: ['iphone-runner', 'owns countdown threads'] },
    band: { main: ['main + worktrees', 'rebase + ff only'], boards: ['Boards + memory', 'rules every agent loads'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'tests at Serious heat'] },
    edgeLabels: { 'router>fix': 'to the topic owner', 'fix>console': 'answers' } },
  5: { date: 'Sun 4 Oct', title: 'Day 5 · Deputies and a device steward',
    sub: '59 agents started by the lead, 116 threads opened. Roles become proactive at 21:25.',
    labels: { you: ['You', 'threads, proposals'], console: ['Console', 'listeners stay on'],
      router: ['Thread router', 'owner, else the desk'], lead: ['Lead', 'priorities, landing, issues'],
      mgmt: ['mgmt-ops-10', 'lands docs from 21:59'], deputy: ['Desk, then steward', 'desk to 18:12; steward 18:38'],
      fix: ['Fix owners ×7', 'pull their next step'], int: ['Integrators ×2', 'int-v8, wave-v7'],
      ts: ['Toolsmiths ×26', '90 incidents opened'], arch: ['Design + arch. ×13', 'GPU lessons, phone hold'] },
    band: { main: ['main + worktrees', 'mgmt-ops lands docs too'], boards: ['Alarms + guards', 'idle alarm; fg-guard hook'],
      lock: ['chrome-measure lock', 'steward moves the queue'], iphone: ['iPhone', 'Xcode Serious by default'] },
    flags: { 'B:main': 'changed', 'B:lock': 'changed', router: 'changed' },
    edgeLabels: { 'console>deputy': ['desk', 268, 330] } },
  6: { date: 'Mon 5 Oct', title: 'Day 6 · A cheaper team after a usage limit',
    sub: '63 agents started by the lead. Usage limit and account switch at 12:33; new wiring by 13:02.',
    labels: { you: ['You', 'threads, steps'], console: ['Console', 'threads + steps'],
      router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'lands, spawns, priorities'],
      mgmt: ['mgmt-clerk-1', 'sonnet; mgmt-ops-10 parked'], deputy: ['Device steward', 'mgmt-devices'],
      review: ['Second readers ×25', 'one-shot, per phone ticket'], fix: ['Fix owners ×8', 'hold the iPhone themselves'],
      int: ['int-v8', 'combines and measures'], ts: ['Toolsmiths ×9', 'some on sonnet'],
      article: ['Article crew ×10', 'clips, visuals, pages'], phone: ['iphone-runner', 'parked 13:02'] },
    band: { main: ['main + worktrees', 'rebase + ff only'], boards: ['Boards + memory', 'incidents, findings, rules'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'process hold; heat by tool'] },
    addSlots: ['phone'], flags: { phone: 'parked' },
    edgeLabels: { 'mgmt>review': ['second reads', 1000, 104], 'AG>B:iphone': 'owners hold it' } },
  7: { date: 'Tue 6 Oct', title: 'Day 7 · Management winds down; owners take the phone',
    sub: '31 agents started by the lead. The lead talks to the owners directly; any agent may use a free iPhone.',
    labels: { you: ['You', 'threads, proposals'], console: ['Console', 'threads to the lead'],
      router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'talks to owners directly'],
      mgmt: ['Clerk + readers', 'last commits 09:50, 13:07'], arch: ['arch-compositor-morph', 'owns the GPU end of page'],
      fix: ['Fix owners ×4', 'hydrate, panel, People GPU'], int: ['int-v11', 'wave-integrator type'],
      review: ['Reviewers ×4', 'fix-reviewer type'], helpers: ['Mappers ×7', 'on sonnet'], ts: ['Toolsmiths ×4', 'gesture capture'] },
    band: { main: ['main + worktrees', 'rebase + ff only'], boards: ['Practices + memory', 'GPU playbook, 16:10'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'free for any agent, 10:02'] },
    flags: { mgmt: 'parked' },
    edgeLabels: { 'AG>B:boards': 'practices' } },
  8: { date: 'Wed 7 Oct', title: 'Day 8 · One small owner per flaw',
    sub: '18 agents started by the lead. A from-zero review at 11:08; the g0 line after 15:38.',
    labels: { you: ['You', 'reject 2 proposals'], console: ['Console', 'a proposal per flaw'],
      router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'keeps the best-builds list'],
      arch: ['Fresh look + original', 'arch-end-fresh, gpu-original'], fix: ['g0 owners ×6', 'one per visible flaw'],
      int: ['Integrator + GPU owner', 'int-v11, compositor-morph'], helpers: ['Mappers ×3', 'on sonnet'],
      ts: ['Toolsmiths ×7', 'USB link, test flakes'] },
    band: { main: ['main + BEST_BUILDS', 'one list, newest first'], boards: ['Boards + memory', 'incidents, findings, rules'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'USB-link watchdog'] },
    edgeLabels: { 'fix>console': 'proposals' } },
  9: { date: 'Thu 8 Oct', title: 'Day 9 · Same wiring, smaller owners',
    sub: '17 agents started by the lead. I probe WebKit myself; the lead repairs the phone link first.',
    labels: { you: ['You', 'WebKit borders, heat'], console: ['Console', 'proposals, threads'],
      router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'repairs the phone first'],
      fix: ['g0 polish owners ×4', 'box, menu, scroll, return'], arch: ['Heat + off-screen ×3', 'de-offscreen, heat owners'],
      helpers: ['Mappers ×6', 'on sonnet'], ts: ['Toolsmiths ×5', 'USB link, flakes'] },
    band: { main: ['main + BEST_BUILDS', '+ proposals by build'], boards: ['Boards + memory', 'heat probe kept'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'lead fixes the link first'] },
    flags: { 'B:iphone': 'changed' },
    edgeLabels: {} },
  10: { date: 'Fri 9 Oct', title: 'Day 10 · From fixing to filming',
    sub: '18 agents started by the lead over the full UTC day (the day line counts 11 up to 12:57).',
    labels: { you: ['You', 'call it done, 10:56'], console: ['Console', 'threads, proposals'],
      router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'spawns the film crew'],
      fix: ['Fix owners ×2', 'deck chrome, reveal paint'], phone: ['cap-worst', 'films the worst moments'],
      article: ['Article crew ×10', 'writers + day summarisers'], helpers: ['Mappers ×3', 'on sonnet'],
      ts: ['Toolsmiths ×2', 'small fixes'] },
    band: { main: ['main + BEST_BUILDS', 'g0.0l best that day'], boards: ['Boards + memory', 'incidents, findings, rules'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'recordings; pictures allowed'] },
    edgeLabels: { 'phone>article': 'recordings' } },
  11: { date: 'Sat 10 Oct', title: 'Day 11 · My own thumb, then a film crew',
    sub: '20 agents started by the lead. The epilogue: g0.0m lands, my swipe becomes a robot replay.',
    labels: { you: ['You', 'your own swipes (C-146)'], console: ['Console', 'swipes as steps'],
      router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'spawns, lands'],
      fix: ['fix-reveal-paint', 'lands g0.0m'], phone: ['Capture agents ×3', 'replay your swipe'],
      article: ['Article crew ×11', 'clips, histograms, GIFs'], helpers: ['Researchers ×3', 'video hosting (sonnet)'],
      review: ['Review, audit, edit ×3', 'for the article'] },
    band: { main: ['main + BEST_BUILDS', 'g0.0m, 03:38'], boards: ['Boards + memory', 'incidents, findings, rules'],
      lock: ['chrome-measure lock', 'shared lane'], iphone: ['iPhone', 'your swipe, then the robot'] },
    flags: { 'B:iphone': 'changed' },
    edgeLabels: { 'phone>article': 'replays' } },
};

// Team 0 labels (whole run). Day ranges are computed from the per-day presence below.
const OVERVIEW = {
  title: 'Who talks to whom: the team by Day 11',
  sub: 'Same positions as the day diagrams. Tags: first and last day each part was in use (Day 1 = 30 Sep, Day 11 = 10 Oct).',
  labels: { you: ['You', 'chat, then console'], console: ['Console', 'steps, threads, proposals'],
    router: ['Thread router', 'to the topic owner'], lead: ['Lead', 'priorities, landing, spawns'],
    mgmt: ['Management hub', 'mgmt-ops, later a clerk'], deputy: ['Desk + steward', 'deputy lead; alarms'],
    fix: ['Fix owners', 'one topic or flaw each'], review: ['Reviewers + readers', 'fixes, later the article'],
    ts: ['Toolsmiths', 'one per incident'], arch: ['Architecture + design', 'experts, fresh looks'],
    int: ['Integrators', 'combine and measure'], phone: ['Phone + capture agents', 'iphone-runner, then cap-*'],
    helpers: ['Helpers + mappers', 'light jobs, cheaper models'], article: ['Article crew', 'clips, writers, summaries'] },
  band: { main: ['main + worktrees', 'rebase + ff; best builds'], boards: ['Boards + memory', 'incidents, findings, rules'],
    lock: ['chrome-measure lock', 'timing, then shared lane'], iphone: ['iPhone', 'one hold at a time'] },
};

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// rough advance widths (em) for fit checks: display bold ~0.56, body ~0.5, mono ~0.6
const tw = (s, size, f = 0.56) => [...s].length * size * f;
const warnings = [];

function dayModel(dn) {
  const d = topo.days.find((x) => x.day === dn);
  const cfg = DAYS[dn];
  const slots = new Map();   // slot -> {flag, ids:[], count}
  const band = { main: null, boards: null, lock: null, iphone: null };
  const flagOf = (n) => (n.new ? 'new' : n.changed ? 'changed' : null);
  const merge = (a, b) => (a === 'new' || b === 'new' ? 'new' : a === 'changed' || b === 'changed' ? 'changed' : null);
  for (const n of d.nodes) {
    const s = SLOT_OF(n.id, dn);
    if (s === undefined) throw new Error(`day ${dn}: no slot for node ${n.id}`);
    if (s === null) continue;
    if (s.startsWith('B:')) { const c = s.slice(2); band[c] = merge(band[c], flagOf(n)); continue; }
    if (dn === 6 && n.id === 'mgmt') continue; // "mgmt-ops-10 + iphone-runner (parked)": shown as clerk's sub + parked phone slot
    if (n.id === 'loops') { const e = slots.get('lead') || { flag: null, ids: [] }; e.ids.push(n.id); slots.set('lead', e); continue; }
    const e = slots.get(s) || { flag: null, ids: [] };
    e.flag = merge(e.flag, flagOf(n)); e.ids.push(n.id); slots.set(s, e);
  }
  // standing infrastructure: console from Day 2, router from Day 4 (they stayed in use)
  if (dn >= 2 && !slots.has('console')) slots.set('console', { flag: null, ids: ['(standing)'] });
  if (dn >= 4 && !slots.has('router')) slots.set('router', { flag: null, ids: ['(standing)'] });
  for (const s of cfg.addSlots || []) if (!slots.has(s)) slots.set(s, { flag: null, ids: ['(override)'] });
  const flags = cfg.flags || {};
  for (const [k, v] of Object.entries(flags)) {
    if (k.startsWith('B:')) band[k.slice(2)] = v; else if (slots.has(k)) slots.get(k).flag = v;
    else throw new Error(`day ${dn}: flag for absent slot ${k}`);
  }
  if (cfg.noTags) { for (const e of slots.values()) e.flag = null; for (const k in band) band[k] = null; }
  for (const s of slots.keys()) if (!cfg.labels[s]) throw new Error(`day ${dn}: no label for slot ${s} (${slots.get(s).ids})`);
  for (const s of Object.keys(cfg.labels)) if (!slots.has(s)) throw new Error(`day ${dn}: label for absent slot ${s}`);

  // edges
  const edges = new Map();
  for (const e of d.edges) {
    let a = SLOT_OF(e.from, dn), b = SLOT_OF(e.to, dn);
    if (a == null || b == null) continue;                       // the browser session is left out
    if (a === 'mgmt' && dn === 6 && e.from === 'mgmt') continue;
    if (b === 'you' && a !== 'lead') b = 'console';             // owners answer you in console threads
    if (dn >= 4 && a === 'console' && SLOT[b] && SLOT[b].col.startsWith('C')) a = 'router'; // routed threads
    if (a === 'you' && b === 'B:iphone') continue;             // shown as a band label
    if (a === b) continue;
    const aB = a.startsWith('B:'), bB = b.startsWith('B:');
    if (aB && bB) continue;
    const agent = (s) => SLOT[s] && SLOT[s].col.startsWith('C');
    // band connectors: agents <-> lock/iphone/boards, steward -> lock/iphone, boards -> steward; the rest are labels
    if (aB || bB) {
      const other = aB ? a : b, cell = (aB ? a : b).slice(2), side = aB ? b : a;
      if (!(agent(side) || side === 'deputy') || cell === 'main') continue;
      if (agent(side)) { a = 'AG'; b = 'B:' + cell; } // all agents share one connector per cell
      else { a = side; b = 'B:' + cell; }
      void other;
    }
    const fromBand = SLOT_OF(e.from, dn)?.startsWith?.('B:') && a === 'AG';
    const key = `${a}>${b}`, rev = `${b}>${a}`;
    if (edges.has(rev)) { const r = edges.get(rev); r.both = true; r.isNew = r.isNew || !!e.new; continue; }
    const cur = edges.get(key) || { a, b, isNew: false, both: false, kind: e.kind };
    cur.isNew = cur.isNew || !!e.new; if (fromBand) cur.both = true; edges.set(key, cur);
  }
  if (dn === 7) for (const e of edges.values()) if (e.a === 'mgmt' || e.b === 'mgmt') e.parked = true;
  if (cfg.noTags) for (const e of edges.values()) e.isNew = false;
  // AG connectors: drop the boards one unless new (every agent posts there; the line only marks a change)
  for (const [k, e] of edges) if (e.a === 'AG' && e.b === 'B:boards' && !e.isNew) edges.delete(k);
  return { dn, cfg, slots, band, edges: [...edges.values()] };
}

// ---------- routing ----------
function anchorRight(s, dy = 0) { return [s.x + s.w, cy(s) + dy]; }
function laneFromLeft(name, dy = 0) {
  const s = SLOT[name];
  if (s.col === 'B') { const [x, y] = anchorRight(s, dy); return [[x, y], [BUS, y]]; }
  if (name === 'console') return [[240, 262], [266, 262], [266, 314], [BUS, 314]];
  if (name === 'router') return [[240, 394], [252, 394], [252, 424], [BUS, 424]];
  if (name === 'you') return [[240, 172], [252, 172], [252, 204], [BUS, 204]];
  throw new Error('no lane for ' + name);
}
function busToAgent(y0, t) {
  const s = SLOT[t];
  if (s.col === 'C1') return [[BUS, cy(s)], [s.x, cy(s)]];
  const gy = s.y - 8; return [[BUS, gy], [s.x + 40, gy], [s.x + 40, s.y]];
}
const LEFT = new Set(['you', 'console', 'router', 'lead', 'mgmt', 'deputy']);
const AGENT = (n) => SLOT[n] && SLOT[n].col.startsWith('C');
const LEFT_PAIRS = {
  'you|lead': [[240, 149], [290, 149]],
  'you|console': [[135, 182], [135, 226]],
  'console|router': [[135, 292], [135, 336]],
  'console|lead': [[240, 244], [258, 244], [258, 170], [290, 170]],
  'router|lead': [[240, 356], [274, 356], [274, 160], [290, 160]],
  'console|deputy': [[240, 282], [262, 282], [262, 372], [290, 372]],
  'lead|mgmt': [[410, 182], [410, 226]],
  'mgmt|deputy': [[410, 292], [410, 336]],
  'deputy|lead': [[290, 392], [281, 392], [281, 134], [290, 134]],
};
const offsets = { lead: -8, mgmt: 0, deputy: 0 };
function route(a, b) {
  const k1 = `${a}|${b}`, k2 = `${b}|${a}`;
  if (LEFT_PAIRS[k1]) return LEFT_PAIRS[k1];
  if (LEFT_PAIRS[k2]) return [...LEFT_PAIRS[k2]].reverse();
  if (LEFT.has(a) && AGENT(b)) { const p = laneFromLeft(a, offsets[a] || 0); return [...p, ...busToAgent(p.at(-1)[1], b)]; }
  if (AGENT(a) && LEFT.has(b)) return route(b, a).slice().reverse();
  if (AGENT(a) && AGENT(b)) {
    const s = SLOT[a], t = SLOT[b];
    if (s.row === t.row) return s.col === 'C2' ? [[s.x, cy(s)], [t.x + t.w, cy(t)]] : [[s.x + s.w, cy(s)], [t.x, cy(t)]];
    if (s.col === t.col && Math.abs(s.row - t.row) === 1) return s.row < t.row ? [[cx(s), s.y + s.h], [cx(t), t.y]] : [[cx(s), s.y], [cx(t), t.y + t.h]];
    if (s.col === 'C1' && t.col === 'C1') return [[s.x + s.w, cy(s)], [880, cy(s)], [880, cy(t)], [t.x + t.w, cy(t)]];
    if (s.col === 'C2' && t.col === 'C2') return [[s.x, cy(s) + 6], [891, cy(s) + 6], [891, cy(t) + 6], [t.x, cy(t) + 6]];
    if (s.col === 'C2') return [[s.x, cy(s)], [885, cy(s)], [885, cy(t)], [t.x + t.w, cy(t)]];
    return [[s.x + s.w, cy(s)], [885, cy(s)], [885, cy(t)], [t.x, cy(t)]];
  }
  if (a === 'AG') {
    const c = b.slice(2);
    if (c === 'lock') return [[733, FRAME.y + FRAME.h], [733, BAND.y]];
    if (c === 'iphone') return [[1037, FRAME.y + FRAME.h], [1037, BAND.y]];
    if (c === 'boards') return [[620, FRAME.y + FRAME.h], [620, 430], [520, 430], [520, BAND.y]];
  }
  if (a === 'deputy' && b.startsWith('B:')) {
    const c = b.slice(2);
    if (c === 'boards') return [[410, 402], [410, BAND.y]];
    const x = c === 'lock' ? 700 : 1000; return [[500, 402], [500, 437], [x, 437], [x, BAND.y]];
  }
  if (b === 'deputy' && a.startsWith('B:')) return route(b, a).slice().reverse();
  throw new Error(`no route ${a} -> ${b}`);
}
const pathD = (pts) => 'M ' + pts.map((p) => p.map((v) => Math.round(v * 10) / 10).join(' ')).join(' L ');
function labelPos(pts) {
  let best = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > best) { best = l; bi = i; } }
  const [x1, y1] = pts[bi], [x2, y2] = pts[bi + 1];
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, vertical: Math.abs(x2 - x1) < 1 };
}

// ---------- drawing ----------
const STRIPE = { user: 'var(--you)', lead: 'var(--lead)', agents: 'var(--agents)', tool: 'var(--ink-soft)' };
function tag(x, y, text, kind) {
  const w = tw(text, 11, 0.62) + 14;
  const fill = kind === 'parked' ? 'var(--paper)' : kind === 'range' ? 'var(--paper-2)' : 'var(--signal)';
  const stroke = kind === 'parked' ? 'var(--ink-soft)' : kind === 'range' ? 'var(--ink-soft)' : 'var(--signal)';
  const tf = kind === 'parked' || kind === 'range' ? 'var(--ink)' : 'var(--sheet)';
  return `<rect x="${(x - w).toFixed(1)}" y="${y - 10}" width="${w.toFixed(1)}" height="20" rx="10" style="fill:${fill};stroke:${stroke};stroke-width:1"></rect>` +
    `<text x="${(x - w / 2).toFixed(1)}" y="${y + 4}" font-size="11" text-anchor="middle" class="bold" style="fill:${tf}">${esc(text)}</text>`;
}
function box(name, label, sub, flag, rangeTag) {
  const s = SLOT[name];
  const hi = flag === 'new' || flag === 'changed', parked = flag === 'parked' || flag === 'dashed';
  const stroke = hi ? 'var(--signal)' : 'var(--ink-soft)';
  const sw = hi ? 3 : 1.4;
  const dash = parked ? ' stroke-dasharray="7 5"' : '';
  const op = parked ? ' opacity="0.62"' : '';
  const ls = 19, ss = 14.5;
  const maxw = s.w - 26;
  if (tw(label, ls) > maxw) warnings.push(`label overflow ${name}: "${label}" ~${tw(label, ls).toFixed(0)} > ${maxw}`);
  if (tw(sub, ss, 0.5) > maxw) warnings.push(`sub overflow ${name}: "${sub}" ~${tw(sub, ss, 0.5).toFixed(0)} > ${maxw}`);
  let g = `<g${op}><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="8" style="fill:var(--paper);stroke:${stroke};stroke-width:${sw}"${dash}></rect>` +
    `<rect x="${s.x + 1}" y="${s.y + 8}" width="5" height="${s.h - 16}" rx="2" style="fill:${STRIPE[s.kind]}"></rect>` +
    `<text x="${s.x + 16}" y="${s.y + 27}" font-size="${ls}" class="ttl">${esc(label)}</text>` +
    `<text x="${s.x + 16}" y="${s.y + s.h - 13}" font-size="${ss}" class="sub">${esc(sub)}</text></g>`;
  if (flag === 'new') g += tag(s.x + s.w - 6, s.y, 'new', 'new');
  else if (flag === 'changed') g += tag(s.x + s.w - 6, s.y, 'changed', 'new');
  else if (flag === 'parked') g += tag(s.x + s.w - 6, s.y, 'parked', 'parked');
  if (rangeTag) g += tag(s.x + s.w - 6, s.y, rangeTag, flag === 'dashed' ? 'parked' : 'range');
  return g;
}
function bandSvg(labels, flags, ranges = {}) {
  let g = `<rect x="30" y="${BAND.y}" width="1140" height="${BAND.h}" rx="8" style="fill:var(--paper-2);stroke:var(--ink-soft);stroke-width:1.2"></rect>`;
  for (const [c, [x0, x1]] of Object.entries(BAND.cells)) {
    if (x0 > 30) g += `<line x1="${x0}" y1="${BAND.y + 8}" x2="${x0}" y2="${BAND.y + BAND.h - 8}" style="stroke:var(--ink-soft);stroke-width:1"></line>`;
    const f = flags[c];
    if (f === 'new' || f === 'changed') g += `<rect x="${x0 + 4}" y="${BAND.y + 4}" width="${x1 - x0 - 8}" height="${BAND.h - 8}" rx="6" style="fill:none;stroke:var(--signal);stroke-width:3"></rect>`;
    const [l, s] = labels[c];
    const mw = x1 - x0 - 24;
    if (tw(l, 16) > mw) warnings.push(`band label overflow ${c}: "${l}"`);
    if (tw(s, 13, 0.5) > mw - (f ? 0 : 0)) warnings.push(`band sub overflow ${c}: "${s}"`);
    g += `<text x="${x0 + 14}" y="${BAND.y + 24}" font-size="16" class="ttl">${esc(l)}</text>` +
      `<text x="${x0 + 14}" y="${BAND.y + 45}" font-size="13" class="sub">${esc(s)}</text>`;
    const ty = BAND.y + 18; // band tags sit inside the cell, clear of the connectors above it
    if (f === 'new') g += tag(x1 - 10, ty, 'new', 'new');
    else if (f === 'changed') g += tag(x1 - 10, ty, 'changed', 'new');
    if (ranges[c]) g += tag(x1 - 10, ty, ranges[c], 'range');
    const room = (x1 - 10 - (f ? tw(f, 11, 0.62) + 14 : ranges[c] ? tw(ranges[c], 11, 0.62) + 14 : 0)) - (x0 + 14);
    if (tw(l, 16) > room - 6) warnings.push(`band label hits tag ${c}: "${l}"`);
  }
  return g;
}
function edgeSvg(e, mid, labelText) {
  const pts = route(e.a, e.b);
  const color = e.isNew ? 'var(--signal)' : 'var(--ink-soft)';
  const w = e.isNew ? 2.6 : 1.6;
  const dash = e.parked ? ' stroke-dasharray="6 5"' : '';
  const m = e.isNew ? `${mid}-as` : `${mid}-ar`;
  const toBand = e.b.startsWith('B:');
  const start = e.both ? ` marker-start="url(#${m})"` : '';
  let g = `<path d="${pathD(pts)}" style="fill:none;stroke:${color};stroke-width:${w};stroke-linejoin:round"${dash}${start} marker-end="url(#${m})"${e.isNew ? '' : ' opacity="0.85"'}></path>`;
  void toBand;
  if (Array.isArray(labelText)) {
    const [t, x, y, anchor = 'start'] = labelText;
    g += `<text x="${x}" y="${y}" font-size="12.5" text-anchor="${anchor}" class="${e.isNew ? 'sig bold' : 'ink'}">${esc(t)}</text>`;
  } else if (labelText) {
    const p = labelPos(pts);
    const cls = e.isNew ? 'sig bold' : 'ink';
    if (p.vertical) g += `<text x="${(p.x + 7).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-size="12.5" class="${cls}">${esc(labelText)}</text>`;
    else g += `<text x="${p.x.toFixed(1)}" y="${(p.y - 6).toFixed(1)}" font-size="12.5" text-anchor="middle" class="${cls}">${esc(labelText)}</text>`;
  }
  return g;
}
function defs(mid) {
  const mk = (id, col) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:${col}"></path></marker>`;
  return `<defs>${mk(mid + '-ar', 'var(--ink-soft)')}${mk(mid + '-as', 'var(--signal)')}</defs>`;
}
function frameSvg() {
  return `<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="12" style="fill:none;stroke:var(--grid);stroke-width:1.5"></rect>` +
    `<text x="600" y="104" font-size="12" class="bold">AGENTS · EACH IN ITS OWN WORKTREE</text>`;
}
function legend(overview) {
  const y = 532;
  let g = '';
  if (overview) {
    g += `<rect x="30" y="${y - 12}" width="30" height="16" rx="4" style="fill:var(--paper);stroke:var(--ink-soft);stroke-width:1.4"></rect><text x="68" y="${y + 1}" font-size="12.5">in use at the end</text>`;
    g += `<rect x="232" y="${y - 12}" width="30" height="16" rx="4" style="fill:var(--paper);stroke:var(--ink-soft);stroke-width:1.4" stroke-dasharray="5 4" opacity="0.62"></rect><text x="270" y="${y + 1}" font-size="12.5">not used on Day 10 or 11</text>`;
  } else {
    g += `<rect x="30" y="${y - 12}" width="30" height="16" rx="4" style="fill:var(--paper);stroke:var(--signal);stroke-width:3"></rect><text x="68" y="${y + 1}" font-size="12.5">new or changed that day</text>`;
    g += `<rect x="262" y="${y - 12}" width="30" height="16" rx="4" style="fill:var(--paper);stroke:var(--ink-soft);stroke-width:1.4" stroke-dasharray="5 4" opacity="0.62"></rect><text x="300" y="${y + 1}" font-size="12.5">parked that day</text>`;
  }
  g += `<text x="${overview ? 520 : 452}" y="${y + 1}" font-size="12.5">×N agents in that role that day · stripe: <tspan style="fill:var(--you)" class="bold">you</tspan>, <tspan style="fill:var(--lead)" class="bold">lead + deputies</tspan>, <tspan style="fill:var(--agents)" class="bold">agents</tspan></text>`;
  if (overview) g = g.replace('×N agents in that role that day · ', '');
  return g;
}

// ---------- assemble ----------
function svgFor(model, n) {
  const mid = `team${n}`;
  const { cfg } = model;
  const parts = [defs(mid)];
  parts.push(`<text class="ttl" x="30" y="40" font-size="26">${esc(cfg.title)}</text>`);
  parts.push(`<text class="sub" x="30" y="66" font-size="15">${esc(cfg.sub)}</text>`);
  if (tw(cfg.sub, 15, 0.5) > 1140) warnings.push(`subtitle long day ${n}`);
  parts.push(frameSvg());
  // edges first (old, then new on top), boxes over them
  const el = cfg.edgeLabels || {};
  const sorted = [...model.edges].sort((x, y) => (x.isNew ? 1 : 0) - (y.isNew ? 1 : 0));
  const used = new Set();
  for (const e of sorted) {
    const k = `${e.a}>${e.b}`, kr = `${e.b}>${e.a}`;
    const t = el[k] ?? el[kr];
    if (t !== undefined) used.add(el[k] !== undefined ? k : kr);
    parts.push(edgeSvg(e, mid, t));
  }
  for (const k of Object.keys(el)) if (!used.has(k)) warnings.push(`day ${n}: edge label for missing edge ${k}`);
  for (const [s, v] of model.slots) parts.push(box(s, cfg.labels[s][0], cfg.labels[s][1], v.flag, v.range));
  parts.push(bandSvg(cfg.band, model.band, model.bandRanges || {}));
  parts.push(legend(!!model.overview));
  return parts.join('\n');
}
function ariaFor(model, n) {
  const { cfg } = model;
  const names = (filter) => [...model.slots].filter(filter).map(([s]) => `${cfg.labels[s][0]} (${cfg.labels[s][1]})`);
  const all = names(() => true);
  const hi = names(([, v]) => v.flag === 'new' || v.flag === 'changed');
  const pk = names(([, v]) => v.flag === 'parked' || v.flag === 'dashed');
  const bandHi = Object.entries(model.band).filter(([, f]) => f === 'new' || f === 'changed').map(([c]) => `${cfg.band[c][0]} (${cfg.band[c][1]})`);
  const nm = (x) => (x === 'AG' ? 'the agents' : x.startsWith('B:') ? cfg.band[x.slice(2)][0] : cfg.labels[x][0]);
  const links = model.edges.map((e) => `${nm(e.a)} ${e.both ? 'and' : 'to'} ${nm(e.b)}${e.isNew ? ' (new)' : ''}${e.parked ? ' (parked)' : ''}`);
  let t = `${cfg.title}. ${cfg.sub} Boxes: ${all.join('; ')}. Shared tools: ${Object.values(cfg.band).map(([l, s]) => `${l} (${s})`).join('; ')}.`;
  if (model.overview) t += ` Dashed: ${pk.join('; ') || 'none'}.`;
  else if (!cfg.noTags) { t += ` New or changed that day: ${[...hi, ...bandHi].join('; ') || 'none'}.`; if (pk.length) t += ` Parked that day: ${pk.join('; ')}.`; }
  t += ` Links: ${links.join('; ')}.`;
  return t;
}
const CAPTIONS = {
  0: 'The whole team as it grew over the eleven days, in the same positions as the day diagrams. Each tag gives the first and last day a part was in use; dashed parts were not used on Day 10 or 11',
  1: 'How the team was wired at the end of Day 1, 30 September. All of it was new that day',
  2: 'Day 2, 1 October: the console between me and the lead, design engineers and claim verifiers, the first phone agent',
  3: 'Day 3, 2 October: proposals give the owners a direct line to me; the first wave integrator',
  4: 'Day 4, 3 October: the thread router sends my threads to the agent that owns the topic; project memory in the repo',
  5: 'Day 5, 4 October: a desk, then a device steward, beside the lead; results go straight to the integrator',
  6: 'Day 6, 5 October: a sonnet clerk and one-shot readers replace the opus hub; iphone-runner parked; owners hold the phone',
  7: 'Day 7, 6 October: the clerk and readers wind down; a GPU owner and written practices',
  8: 'Day 8, 7 October: a from-zero review and one small g0 owner per visible flaw',
  9: 'Day 9, 8 October: the same wiring with smaller owners; the lead repairs the phone link first',
  10: 'Day 10, 9 October: a capture agent, article writers and day summarisers',
  11: 'Day 11, 10 October: my own swipes, capture agents, and reviewers for the article',
};
function figureHtml(model, n) {
  const svg = svgFor(model, n);
  const aria = ariaFor(model, n);
  return `<figure class="cap" data-capture="ready" id="team-${n}">
  <div class="cap-bar"><span class="ready">capture-ready · 1200 px · Team ${n}</span></div>
  <div class="cap-area">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">
${svg}
</svg>
  </div>
  <figcaption class="note">${esc(CAPTIONS[n])} (Team ${n}; <a href="#src-31">source</a>)</figcaption>
</figure>`;
}

// ---------- run ----------
const models = {};
for (let n = 1; n <= 11; n++) models[n] = dayModel(n);

// Team 0: presence ranges from the day models
const present = {}, bandPresent = {};
for (let n = 1; n <= 11; n++) {
  for (const [s, v] of models[n].slots) if (!v.ids.includes('(override)')) (present[s] ||= []).push(n);
}
const fmt = (days) => { const a = Math.min(...days), b = Math.max(...days); return a === b ? `Day ${a}` : `Days ${a}–${b}`; };
const ov = { dn: 0, overview: true, cfg: OVERVIEW, slots: new Map(), band: { main: null, boards: null, lock: null, iphone: null },
  bandRanges: { main: 'Days 1–11', boards: 'Days 1–11', lock: 'Days 1–11', iphone: 'Days 1–11' } };
for (const s of Object.keys(SLOT)) {
  const days = present[s]; if (!days) throw new Error('overview: never present ' + s);
  ov.slots.set(s, { flag: Math.max(...days) < 10 ? 'dashed' : null, range: fmt(days), days }); // in use at the end = seen on Day 10 or 11
}
ov.edges = [
  { a: 'you', b: 'lead', both: true }, { a: 'you', b: 'console', both: true }, { a: 'console', b: 'lead' }, { a: 'console', b: 'router' },
  { a: 'router', b: 'fix' }, { a: 'lead', b: 'mgmt', both: true, parked: true }, { a: 'mgmt', b: 'deputy', both: true, parked: true },
  { a: 'lead', b: 'fix' }, { a: 'lead', b: 'ts' }, { a: 'lead', b: 'arch' }, { a: 'lead', b: 'phone' }, { a: 'lead', b: 'article' },
  { a: 'fix', b: 'console' }, { a: 'review', b: 'fix' }, { a: 'fix', b: 'int', parked: true }, { a: 'phone', b: 'article' },
  { a: 'AG', b: 'B:lock' }, { a: 'AG', b: 'B:iphone' }, { a: 'deputy', b: 'B:iphone', parked: true },
].map((e) => ({ isNew: false, both: false, parked: false, ...e }));
OVERVIEW.edgeLabels = { 'you>console': 'steps, answers', 'router>fix': ['threads to owners', 400, 418, 'middle'], 'fix>console': ['proposals', 480, 308, 'middle'] };

const report = [];
const all = [[0, ov], ...Object.entries(models).map(([k, v]) => [Number(k), v])];
for (const [n, m] of all) {
  const html = figureHtml(m, n);
  fs.writeFileSync(path.join(OUT, `team-${n}.html`), html);
  const svgOnly = html.slice(html.indexOf('<svg'), html.indexOf('</svg>') + 6).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  fs.writeFileSync(path.join(OUT, `team-${n}.svg`), svgOnly);
  const boxes = m.slots.size + 1; // + the band
  report.push(`Team ${n}: ${m.slots.size} boxes + band, ${m.edges.length} links${n ? `, highlighted: ${[...m.slots].filter(([, v]) => v.flag === 'new' || v.flag === 'changed').map(([s]) => s).join(',') || '-'}; band: ${Object.entries(m.band).filter(([, f]) => f).map(([c, f]) => c + ':' + f).join(',') || '-'}; parked: ${[...m.slots].filter(([, v]) => v.flag === 'parked').map(([s]) => s).join(',') || '-'}` : `; ranges: ${[...m.slots].map(([s, v]) => s + ' ' + v.range + (v.flag ? ' (dashed)' : '')).join('; ')}`}`);
  void boxes;
}
console.log(report.join('\n'));
if (warnings.length) console.log('WARNINGS:\n' + warnings.join('\n')); else console.log('no fit warnings');
