import json
OUT='$SCRATCH/art-topology/topology.json'
def N(id,label,kind,count=None,new=False,changed=False,note=None):
    d={'id':id,'label':label,'kind':kind,'new':new,'changed':changed}
    if count is not None: d['count']=count
    if note: d['note']=note
    return d
def E(f,t,kind,new=False,label=None):
    d={'from':f,'to':t,'kind':kind,'new':new}
    if label: d['label']=label
    return d
def C(text,trigger,evidence,inferred=False):
    d={'text':text,'trigger':trigger,'evidence':evidence}
    if inferred: d['inferred']=True
    return d
days=[]
# ---------------- Day 1
days.append({'day':1,'date':'2026-09-30','title':'One chat becomes a team of worktrees',
 'stats':{'lead_spawns':72,'all_subagents_incl_nested':271,'nested_helpers':201,'commits_on_main_utc':145,'incidents_opened':22,'findings':7,'draft_agents':72,'draft_commits':125},
 'nodes':[N('user','You','user',new=True),N('lead','Lead (main session, orchestrator)','lead',new=True),
  N('fix','Fix owners (wave 1)','role',9,new=True),N('helpers','Unnamed helpers spawned by agents','role',201,new=True),
  N('ts','Toolsmiths, one per incident','role',12,new=True),N('review','Reviewers','role',12,new=True),
  N('arch','Architecture team','role',11,new=True),N('mgmt','Management: mgmt-lead + mgmt-ops (from 23:06)','role',2,new=True),
  N('wt','Worktrees, one per agent','tool',new=True),N('lock','chrome-measure lock (+ short lane)','tool',new=True),
  N('iphone','iPhone (lease; finger tests by you)','device',new=True),N('inc','Incident log + findings board','tool',new=True),
  N('main','main: rebase + fast-forward, git hooks','tool',new=True),N('loops','/goal + /loop check-ins','tool',new=True)],
 'edges':[E('user','lead','command',True,'chat'),E('loops','lead','command',True,'goal, 5/10-min check-ins'),E('lead','fix','command',True,'spawn per topic'),
  E('fix','helpers','command',True),E('fix','wt','lock',True),E('fix','lock','lock',True),E('fix','lead','report',True),
  E('fix','mgmt','report',True,'from 23:06'),E('mgmt','lead','report',True),E('review','fix','review',True),E('ts','inc','message',True),
  E('lead','ts','command',True),E('lead','main','land',True),E('arch','lead','report',True),E('lead','user','report',True,'finger-test asks in chat'),E('user','iphone','command',True,'finger tests, Web Inspector'),E('fix','inc','message',True,'findings, incidents')],
 'changes':[C('Local frozen copy + slowed Chrome as the phone stand-in; mirror and calibration tools','user asks for a simple way to reproduce phone lag on the Mac (17:56, 18:06)','4764e8d0, 4df6461e 19:08-19:19Z'),
  C('One agent per topic, each in its own worktree; chrome-measure lock and iPhone lease','user 19:33/19:38: one subagent per topic, share the one iPhone','a17b6bfb 20:00Z'),
  C('Agent definitions (fix-owner, bundle-mapper, fix-reviewer) + roles guide + lead playbook','user 20:09: instructions for agents, model/effort per task','99f8a2f4 20:20Z'),
  C('Rebase-only landing enforced by git hooks and git-guard; tools guarded by tests','user 20:00 (tests) and 20:15-20:17 (rebase MUST)','971e3437 20:28Z, 23885963 20:33Z, a41f52cc 20:40Z'),
  C('Incident loop: incident.mjs + toolsmith per incident + wave integrator role','user 20:46: full-loop roles','eb4ccbb0 21:02Z, 54a8298c 21:10Z'),
  C('Lead gets standing orchestrator authority; goal set with /goal','user 21:14, 21:21','252008ea 21:24Z; Goal check-in prompts from 21:52Z'),
  C('Short lane so commits/tests do not wait behind A/Bs','I-007, user 21:49 "main is dirty", queueing to commit','25391a22 21:57Z'),
  C('Findings board for cross-agent knowledge; FINDINGS.md playbook','I-013, user 22:23 "the team shares findings"','c2c660c5 22:56Z, 31354c5d 22:24Z'),
  C('Architecture team (experts, all on opus) with a scorecard','user 22:28-22:30','87b849ff 22:28Z, 46a302c9 22:31Z'),
  C('Your finger tests queued in a file instead of blocking agents','user 22:09-22:15: skip the iPhone, ping me later','c15f65e9 22:10Z (FINGER_TESTS.md)'),
  C('Management layer: mgmt-lead (decisions, KPIs) and mgmt-ops (operator hub); agents report to mgmt-ops','user 23:05: lead interrupted a lot, must delegate; Mac load 58','37a3a48c 22:59Z, 6ab6820e 23:06Z; spawns mgmt-lead 22:59, mgmt-ops 23:06'),
  C('Lead check-in (delegated mode) recurring prompt','delegation','first prompt 23:43Z (lead transcript)')]})
# ---------------- Day 2
days.append({'day':2,'date':'2026-10-01','title':'You leave the chat: console, protocol, deferral',
 'stats':{'lead_spawns':88,'all_subagents_incl_nested':103,'commits_on_main_utc':525,'incidents_opened':29,'findings':107,'threads_opened':11,'steps_posted':16,'draft_agents':88,'draft_commits':542},
 'nodes':[N('user','You','user'),N('lead','Lead','lead',changed=True),N('console','User console: steps, threads, proposals, status, progress','tool',new=True),
  N('mgmt','mgmt-ops hub (ops-3..6, re-spawned)','role',5,changed=True),N('fix','Fix owners (wave 1 continues)','role'),
  N('de','Design engineers (de-*)','role',13,new=True),N('claims','Claim verifiers (arch-claims, ver-*)','role',5,new=True),
  N('runner','iphone-runner (dedicated phone agent)','role',1,new=True),N('ts','Toolsmiths','role',25),N('review','Reviewers','role',22),
  N('lock','chrome-measure: timing deferred, shared lane','tool',changed=True),N('iphone','iPhone + Simulator','device',changed=True),
  N('cards','Protocol v2 cards (R-I-D-F-V-L; lead signs D)','tool',new=True),N('loops','Check-ins: phone 5 min, agents 10 min, usage 30 min','tool',changed=True)],
 'edges':[E('user','console','thread',True,'steps, answers'),E('console','lead','thread',True),E('user','lead','command',False,'hints in chat'),
  E('lead','mgmt','command'),E('fix','mgmt','report'),E('de','mgmt','report',True),E('mgmt','lead','report'),E('lead','de','command',True),
  E('runner','iphone','lock',True),E('runner','console','thread',True,'posts finger steps'),E('fix','lock','lock'),E('claims','lead','review',True),
  E('review','fix','review'),E('ts','lead','report'),E('loops','lead','command',True),E('lead','cards','review',True,'signs D')],
 'changes':[C('Frozen baseline snapshot committed and pinned','user 07:20: a new release must never change results','01db2994 07:57Z, 4edb872e 08:46Z'),
  C('Dedicated phone agent (iphone-runner)','phone work serialised through the lead (inferred)','spawn 06:49Z',True),
  C('Design engineers who know rendering maths join (de-morph, de-hero, de-middle, ...)','user hint 1 at 08:50','spawns 08:51Z'),
  C('Protocol v2: every topic R-I-D-F-V-L, closed by cards; lead signs D','arch-lead review (inferred trigger: noisy A/B verdicts)','5c14781f 10:46Z, d62014ce 10:47Z',True),
  C('Platform claims stay OBSERVED until a reference confirms; verifier role','user 12:05 challenged "Chrome 154 limitation"','71ad57d3 12:08Z, 35df837d 12:17Z; arch-claims 12:09Z'),
  C('User console for your steps (Start/Done/answers)','user 14:19: main chat too long to follow','46982189 15:12Z; CLAUDE.md 9666bbac 15:16Z'),
  C('Status board, console threads (one per topic), proposals page','user requests (T-0xx) after the console','12770f79 19:11Z, 545cf850 19:23Z, 7a4ffeea 20:42Z'),
  C('Timing deferred: Chrome call-tree counts + Safari attribution; 3 Chrome agents in parallel','24 h retrospective: one Chrome slot + phone serialised everything','user direction 19:27Z (memory defer-timing); c220e829 19:03Z'),
  C('Shared lock lane for jobs that time nothing; headless checks','deferral','4a903b23 21:44Z, 14806cb4 20:04Z'),
  C('iOS Simulator driven like the phone (sim.mjs)','scarce phone (inferred)','3c28521d 15:31Z',True),
  C('Recurring check-ins: iPhone connection (5 min), agents (10 min), usage meter (30 min, T-010)','user loops','first prompts 10:32Z, 17:23Z, 22:23Z')]})
# ---------------- Day 3
days.append({'day':3,'date':'2026-10-02','title':'Proposals go live; privacy hardening',
 'stats':{'lead_spawns':35,'all_subagents_incl_nested':36,'commits_on_main_utc':223,'incidents_opened':26,'findings':30,'threads_opened':20,'proposals_decided':6,'draft_agents':35,'draft_commits':225},
 'nodes':[N('user','You','user'),N('lead','Lead','lead'),N('console','Console: proposals + Try-it pages','tool',changed=True),
  N('mgmt','mgmt-ops hub (ops-6, ops-7)','role',2),N('fix','Fix owners','role',1),N('de','Design engineers','role',5),
  N('wi','Wave integrator (wi-stack)','role',1,new=True),N('runner','iphone-runner','role',1),N('ts','Toolsmiths','role',14),N('review','Reviewers','role',11),
  N('lock','chrome-measure: mostly shared holds','tool'),N('iphone','iPhone (unplugged 12:03) + Simulator','device',changed=True),
  N('ioscap','ioscap: phone-screen-only recorder','tool',new=True),N('board','Status board + waits shown','tool',changed=True)],
 'edges':[E('user','console','thread',False,'6 proposal decisions'),E('fix','console','thread',True,'proposal'),E('de','console','thread',True,'proposal'),
  E('lead','mgmt','command'),E('mgmt','lead','report'),E('fix','mgmt','report'),E('wi','lead','report',True),E('runner','iphone','lock'),
  E('runner','ioscap','lock',True),E('ts','lead','report'),E('review','fix','review'),E('fix','board','message',True),E('lead','main','land')],
 'changes':[C('Proposals: visible changes go to you first; first one accepted 06:31','proposal page (Day 2 evening)','console proposals store, PR-001..PR-007'),
  C('Camera incident -> hardened recorder that can open only the iPhone screen; never open the Mac camera','user 08:49 (green camera light), 10:05','39786a2c 10:39Z (I-062); memory no-camera-access'),
  C('Waits appear on the status board; every hold says what it is for','user T-016; I-058, I-060','29e0cca0 08:41Z, 8fd53a19 10:20Z'),
  C('Keep the Mac awake only during measurements','user C-024 / I-070','ts-i070 14:55Z; memory keep-awake'),
  C('Try-it: both pages inside a proposal so you can scroll them','user 22:07','47b38a05 22:41Z (I-074)'),
  C('LAN address resolved at run time, never typed','I-073, user T-026','9975a9ae 22:04Z'),
  C('Heat and GPU research agents (de-heat, de-gpu)','user hints 4-5 at 22:15, 23:00','spawns 22:16Z, 23:01Z')]})
# ---------------- Day 4
days.append({'day':4,'date':'2026-10-03','title':'Questions go to their owners',
 'stats':{'lead_spawns':48,'all_subagents_incl_nested':49,'commits_on_main_utc':293,'incidents_opened':24,'findings':56,'threads_opened':23,'proposals_decided':4,'draft_agents':48,'draft_commits':221},
 'nodes':[N('user','You','user'),N('lead','Lead (triage wait)','lead',changed=True),N('router','Thread router + topic owners map','tool',new=True),
  N('console','Console: comments, proposal talk','tool',changed=True),N('mgmt','mgmt-ops hub (ops-9, ops-10)','role',2,changed=True),
  N('fix','Fix owners (countdown, hero, carousel, morph...)','role',8,new=True),N('de','Design engineers','role',4),N('arch','Architecture (memory, isolated-measure, thread-routing)','role',3),
  N('runner','iphone-runner','role',1),N('ts','Toolsmiths','role',19),N('review','Reviewers','role',8),
  N('memory','memory/ in the repo (rules every agent loads)','tool',new=True),N('lock','chrome-measure (shared lane)','tool'),N('iphone','iPhone at Serious heat','device',changed=True)],
 'edges':[E('user','console','thread'),E('console','router','thread',True),E('router','fix','thread',True,'to the listening owner'),E('router','lead','thread',True,'fallback/triage'),
  E('fix','user','thread',True,'answers in its own threads'),E('lead','mgmt','command'),E('mgmt','lead','report'),E('fix','mgmt','report'),
  E('memory','fix','command',True,'loaded rules'),E('runner','iphone','lock'),E('ts','lead','report'),E('review','fix','review'),E('fix','lock','lock')],
 'changes':[C('Project memory moved into the repo, loaded by every agent','user OK T-032; arch-memory','630c700d 00:18Z'),
  C('Phone tests at Serious heat; milestone 2','heat test result; user hint 6 at 09:29','memory notes 09:36-10:09Z (42e3170b.., 2f4f0035)'),
  C('Answer panels name who receives your answer','user 09:09: could not tell which agent gets it','7d9dd50b 09:58Z (I-084)'),
  C('Comments on console items; talk under each proposal routed to its author','user T-043, T-048','28da5bc2 12:12Z, 54661948 18:00Z'),
  C('PR-010 pixel rule: look-alike fixes land within limits, bigger ones are proposals','user 10:31, accepted 15:21','21b70e6c 15:22Z'),
  C('Thread routing: a thread goes to the agent that owns its topic; lead wakes only for decisions/escalations','user 16:09 (T-050/T-051)','df03d806 16:05Z design, 3dfc627e 18:21Z, topic map set 18:28Z'),
  C('Rendering cost card for per-element work','user 07:26: measure each element, the full page less often','f574713b 09:40Z (I-083)')]})
# ---------------- Day 5
days.append({'day':5,'date':'2026-10-04','title':'Deputies, steward, proactive roles',
 'stats':{'lead_spawns':59,'all_subagents_incl_nested':61,'commits_on_main_utc':480,'incidents_opened':90,'findings':55,'threads_opened':116,'proposals_decided':9,'user_thread_msgs':330,'draft_agents':59,'draft_commits':532},
 'nodes':[N('user','You','user'),N('lead','Lead (priorities, landing, issue loop)','lead',changed=True),N('console','Console threads (Monitor listeners)','tool',changed=True),
  N('desk','Desk: mgmt-desk-1/-2 (deputy lead, 10:15-18:12)','role',2,new=True),N('steward','Device steward: mgmt-devices (from 18:38)','role',1,new=True),
  N('mgmt','mgmt-ops-10 (tickets, second reads; lands docs from 21:59)','role',1,changed=True),N('fix','Fix owners (proactive R1-R3)','role',7,changed=True),
  N('int','Integrator int-v8 (+ wave-v7)','role',2,new=True),N('de_arch','Design eng. + architecture','role',13),N('ts','Toolsmiths','role',26),
  N('idle','Idle/stuck alarms (idle.mjs watch)','tool',new=True),N('guards','fg-guard hook; deaf/orphan detection','tool',new=True),
  N('lock','chrome-measure','tool'),N('iphone','iPhone (Xcode Serious default)','device',changed=True)],
 'edges':[E('user','console','thread'),E('console','fix','thread',False,'routed'),E('console','desk','thread',True),E('desk','lead','report',True),
  E('idle','steward','message',True,'alarm threads'),E('steward','iphone','lock',True,'nudge/release idle holds'),E('steward','lock','lock',True,'queue moves'),
  E('fix','int','report',True,'results to consumers (R2)'),E('fix','mgmt','report'),E('mgmt','main','land',True,'docs-only'),E('lead','main','land'),
  E('lead','fix','command'),E('ts','lead','report'),E('guards','fix','command',True)],
 'changes':[C('Idle alarm: nobody noticed an idle iPhone or Chrome slot while work waited','I-105','71190916 04:02Z'),
  C('Desk split: a deputy lead takes queue order, stale rows, incident dispatch','user T-104','b0e72c32 10:18Z; spawns mgmt-desk-1 10:15Z, -2 13:40Z'),
  C('Thread listeners as one persistent Monitor; no work, no listener; light jobs on sonnet/haiku','user T-109','d1744c56 11:10Z, fac2fd6e 11:25Z'),
  C('Delegated authority per role; every user-reported problem gets workaround + long-term fix from its thread owner','user T-134 #11, T-140','bb4592b0 14:48Z, b27768af 15:03Z'),
  C('Busy workers are not pulled off for your questions; deaf/orphan waits detected','user T-147, T-152; I-163, I-169','f99c1a94 18:19Z, 3e7efb06 18:48Z, ab9ef99e 19:40Z'),
  C('Device steward mgmt-devices replaces the desk; alarm threads go to it, never to workers','user T-149, T-155; 18 idle alarms, 204 min','desk cleared 18:12Z; spawn 18:38Z; bb13e23a 18:51Z; steward set 22:35Z'),
  C('Long commands must run in the background (enforced hook)','user T-152; I-170','29d6f2cd 20:02Z'),
  C('Roles v3, proactive by default (R1-R8): pull next step, results to consumers, mgmt-ops lands docs','user 13:37 (lead is the bottleneck), 21:18 (T-160)','2c689554 21:25Z, b0cb43f3 21:59Z'),
  C('Phone tests at Xcode-induced Serious by default, no hand warm-up','user 21:35 (T-162)','2564dc9f 21:46Z'),
  C('Hourly team-measures report (proactive-measures.mjs)','user T-163','2f3ec0ea 21:57Z; prompts from 22:25Z')]})
# ---------------- Day 6
days.append({'day':6,'date':'2026-10-05','title':'Budget cut-over: one-shot readers, cheaper models',
 'stats':{'lead_spawns':63,'all_subagents_incl_nested':75,'commits_on_main_utc':367,'incidents_opened':22,'findings':47,'threads_opened':39,'proposals_decided':4,'draft_agents':63,'draft_commits':372},
 'nodes':[N('user','You','user'),N('lead','Lead','lead'),N('peer','Second session driving your browser','lead',1,new=True,note='inferred purpose: article pages'),
  N('console','Console threads + steps','tool'),N('clerk','mgmt-clerk-1 (sonnet ops, from 12:40)','role',1,new=True),
  N('readers','ops-reader-<ticket> one-shot second reads','role',25,new=True),N('mgmt','mgmt-ops-10 + iphone-runner (parked 13:02)','role',2,changed=True),
  N('steward','mgmt-devices steward','role',1),N('fix','Fix owners (fix-owner type)','role',8,changed=True),N('int','int-v8','role',1),
  N('art','Article crew (art-*, story, pages, export)','role',10,new=True),N('ts','Toolsmiths','role',9),
  N('iphone','iPhone: process hold, thermal.mjs','device',changed=True),N('lock','chrome-measure','tool')],
 'edges':[E('user','console','thread'),E('user','peer','command',True),E('peer','lead','message',True,'cross-session'),E('lead','clerk','command',True),
  E('clerk','readers','command',True),E('readers','clerk','review',True,'second read'),E('clerk','lead','report',True),E('fix','iphone','lock',True,'own phone holds'),
  E('fix','int','report'),E('lead','art','command',True),E('steward','iphone','lock'),E('ts','lead','report'),E('lead','main','land')],
 'changes':[C('A second interactive session that drives the browser, linked to the lead by cross-session messages','article publishing work (inferred)','peer transcript starts 02:40Z; Claude-in-Chrome tool calls; cross-session messages',True),
  C('iPhone hold becomes a process hold (held only while the command runs)','I-168: leases outlived phone parts','4b2991f3 01:12Z, 04ee2e9f 03:04Z'),
  C('A tool sets the iPhone thermal condition','I-199','386580b3 05:32Z'),
  C('Article crew starts (before/after clips, Medium visuals, worst cases)','user T-170 (article)','6d55810a 02:50Z ..; spawns art-* from 02:10Z'),
  C('Cheaper models: ops moves to a sonnet clerk; second reads by one-shot readers per phone ticket; mgmt-ops-10 and iphone-runner parked','rate limit + account switch 12:33-12:34; user 12:36 asks for cheaper models','06c7219d 13:02Z (peer directory); db7bb9f2 12:51Z (model cut-over handover); 13 sonnet spawns that day'),
  C('End of the page becomes the only priority','user 22:40','3c7e7d82 22:46Z')]})
# ---------------- Day 7
days.append({'day':7,'date':'2026-10-06','title':'Owners take the phone; practices',
 'stats':{'lead_spawns':31,'all_subagents_incl_nested':40,'commits_on_main_utc':161,'incidents_opened':14,'findings':19,'threads_opened':18,'proposals_decided':4,'draft_agents':31,'draft_commits':138},
 'nodes':[N('user','You','user'),N('lead','Lead','lead'),N('console','Console','tool'),N('clerk','mgmt-clerk-1 + readers (wind down)','role',6,changed=True),
  N('cm','arch-compositor-morph (GPU end-of-page owner)','role',1,new=True),N('fix','Fix owners (hydrate, panel height, People GPU, end-morph)','role',4),
  N('int','Integrator int-v11','role',1,new=True),N('review','Reviewers (fix-reviewer type)','role',4),N('map','Mappers on sonnet','role',7),
  N('ts','Toolsmiths','role',4),N('playbook','GPU compositor playbook (practice)','tool',new=True),N('iphone','iPhone (free for any end-of-page test)','device',changed=True),
  N('lock','chrome-measure','tool')],
 'edges':[E('user','console','thread'),E('console','lead','thread'),E('lead','cm','command',True),E('lead','fix','command'),E('cm','iphone','lock',True),
  E('fix','iphone','lock'),E('cm','int','report',True),E('fix','int','report'),E('review','fix','review'),E('fix','map','command'),E('cm','playbook','message',True,'breakthrough written up'),
  E('playbook','fix','message',True,'every owner checks its area'),E('lead','main','land')],
 'changes':[C('Any agent may use the iPhone while it is free (end-of-page tests)','user T-204 #35 10:02','7c24c6e8 10:04Z'),
  C('Phone captured gesture -> robot script tool','I-218','6179d922 04:47Z'),
  C('Read the engine source before guessing','user 14:33 (T-221)','80bdf9a4 14:35Z'),
  C('Breakthroughs become practices; GPU compositor checklist for every owner','user 15:52/16:04 (T-224)','1694b44f 16:10Z, 647fbf1a 16:04Z, 3ccd4266 16:13Z'),
  C('Management layer winds down: clerk last commit 09:50, readers last 13:07; lead talks to owners directly','inferred: fewer phone tickets, budget','git log --grep mgmt-clerk / ops-reader',True)]})
# ---------------- Day 8
days.append({'day':8,'date':'2026-10-07','title':'Step back: fresh look and the g0 line',
 'stats':{'lead_spawns':18,'all_subagents_incl_nested':31,'commits_on_main_utc':89,'incidents_opened':18,'findings':25,'threads_opened':18,'proposals_decided':6,'draft_agents':18,'draft_commits':128},
 'nodes':[N('user','You','user'),N('lead','Lead','lead'),N('console','Console (2 proposals rejected)','tool'),
  N('fresh','arch-end-fresh (from-zero review)','role',1,new=True),N('orig','arch-gpu-original','role',1,new=True),
  N('g0','g0 fix owners, one per flaw','role',6,new=True),N('cm','arch-compositor-morph + int-v11','role',2),
  N('map','Mappers on sonnet','role',3),N('ts','Toolsmiths (USB link, flakes)','role',7),
  N('best','BEST_BUILDS.md (one list, newest first)','tool',new=True),N('iphone','iPhone + USB-link watchdog','device',changed=True),N('lock','chrome-measure','tool')],
 'edges':[E('user','console','thread'),E('console','lead','thread'),E('lead','fresh','command',True),E('fresh','lead','report',True),
  E('lead','orig','command',True),E('orig','g0','command',True),E('lead','g0','command',True),E('g0','console','thread',True,'proposal per flaw'),
  E('g0','iphone','lock',True),E('g0','map','command'),E('lead','best','land',True),E('ts','lead','report'),E('lead','main','land')],
 'changes':[C('One best-builds list, newest first, kept by the lead','user T-228 #3 (00:14)','91c49d1f 00:17Z'),
  C('USB link watchdog for the phone','I-222','d0439a26 05:57Z'),
  C('Fresh look at the end of the page, from zero, by an agent that reads our mistakes','user 11:08 (T-228 #33)','spawn arch-end-fresh 11:08Z; 1484df40 11:29Z'),
  C('Return to the original end-of-page behaviour, made cheap on the GPU: g0 line with one small owner per flaw','user 15:36-15:38 (rejected PR-029, PR-033)','spawns arch-gpu-original 15:40Z, fix-g0-revert/gpu 16:02Z, g0-box 17:43Z, corners 18:09Z, join-fade 19:04Z, logo-close 19:51Z')]})
# ---------------- Day 9
days.append({'day':9,'date':'2026-10-08','title':'Small owners polish; you probe yourself',
 'stats':{'lead_spawns':17,'all_subagents_incl_nested':24,'commits_on_main_utc':90,'incidents_opened':11,'findings':21,'threads_opened':13,'proposals_decided':4,'draft_agents':17,'draft_commits':89},
 'nodes':[N('user','You (WebKit borders, heat by hand)','user',changed=True),N('lead','Lead (fixes phone problems first)','lead',changed=True),N('console','Console','tool'),
  N('g0','g0 polish owners (box, menu-layers, scroll-cb, cm-return)','role',4),N('heat','Heat owners (fix-heat-fling on sonnet, de-heat-trace)','role',2,new=True),
  N('de','de-offscreen','role',1,new=True),N('map','Mappers on sonnet','role',6),N('ts','Toolsmiths','role',5),
  N('best','BEST_BUILDS + PR_BY_VERSION','tool',changed=True),N('iphone','iPhone','device'),N('lock','chrome-measure','tool')],
 'edges':[E('user','console','thread'),E('console','lead','thread'),E('user','lead','command',False,'order: drag first, menu second'),E('lead','g0','command'),
  E('lead','heat','command',True),E('lead','de','command',True),E('g0','iphone','lock'),E('g0','console','thread',False,'proposals'),E('g0','map','command'),
  E('lead','iphone','lock',True,'repairs link first'),E('ts','lead','report'),E('lead','main','land')],
 'changes':[C('Heat probe kept reproducible for blog posts','user 07:17 (T-247 #10)','bfc16ccc 07:17Z'),
  C('Off-screen rendering investigated by a design engineer','user 13:47','spawn de-offscreen 13:48Z'),
  C('Accepted proposals tracked by build','user T-252 #1','06d59f47 17:17Z'),
  C('Phone link/driver problems: the lead repairs before any user step','user 19:44 (T-256 #1)','09c4f272 19:45Z'),
  C('Usage limit and account switch; several recurring check-ins stop after','rate limit 18:22Z','/login 18:24-18:26Z; last phone/agent check-ins 16:24-17:37Z',True)]})
# ---------------- Day 10
days.append({'day':10,'date':'2026-10-09','title':'Done; the team turns to evidence',
 'stats':{'lead_spawns':18,'all_subagents_incl_nested':23,'commits_on_main_utc':45,'incidents_opened':7,'findings':8,'threads_opened':10,'proposals_decided':2,'draft_agents':11,'draft_commits':40},
 'nodes':[N('user','You','user'),N('lead','Lead','lead'),N('console','Console','tool'),N('fix','Fix owners (deck-chrome, reveal-paint)','role',2),
  N('cap','cap-worst (worst-case capture)','role',1,new=True),N('sum','Day summarisers sum-d1..d5 (sonnet)','role',5,new=True),
  N('art','Article writers (art-loop, art-tech, art-loopdeep, art-p1days, art-gif-pb)','role',5,new=True),N('map','Mappers on sonnet','role',3),
  N('ts','Toolsmiths','role',2),N('peer','Browser session','lead',1),N('iphone','iPhone (recordings: pictures allowed)','device',changed=True),N('lock','chrome-measure','tool')],
 'edges':[E('user','console','thread'),E('console','lead','thread'),E('lead','fix','command'),E('fix','iphone','lock'),E('lead','cap','command',True),
  E('cap','iphone','lock',True),E('cap','art','report',True),E('lead','sum','command',True),E('sum','lead','report',True),E('lead','art','command',True),
  E('peer','lead','message'),E('lead','main','land')],
 'changes':[C('Pictures allowed from the People card (deck) and worst-case recordings, focus mode on','user 06:42','e97ff499 06:52Z, b7d92c14 14:29Z'),
  C('Rendering work called done (thread "SOOO ULTRA SMOOTHHHHHHH")','g0.0l passed its phone check','user 10:56 (draft Day 10)'),
  C('Worst-case capture crew and article writers spawned','user 11:16 (three posts), 11:54 (film the worst moments)','spawns art-* 11:18Z, cap-worst 11:56Z; 717f2751 14:57Z'),
  C('The day log built by five sonnet summarisers','user 12:54: summary of the whole conversation','spawns sum-d1..d5 12:58Z')]})
# ---------------- Day 11
days.append({'day':11,'date':'2026-10-10','title':'Epilogue: one more frame, then a film crew',
 'stats':{'lead_spawns':20,'all_subagents_incl_nested':19,'commits_on_main_utc':13,'incidents_opened':1,'threads_opened':4},
 'nodes':[N('user','You (your own thumb)','user',changed=True),N('lead','Lead','lead'),N('console','Console steps (your swipes)','tool'),
  N('fix','fix-reveal-paint (g0.0m)','role',1),N('cap','Capture agents (cap-worst, cap-finger-hero, cap-end-openclose)','role',3,changed=True),
  N('art','Article crew (clips, histograms, strips, GIFs)','role',11,changed=True),N('res','Video-hosting researchers (sonnet)','role',3,new=True),
  N('rev','Article review / data audit / edit','role',3,new=True),N('peer','Browser session','lead',1),N('iphone','iPhone','device'),N('best','BEST_BUILDS (g0.0m)','tool')],
 'edges':[E('user','console','thread'),E('user','iphone','command',True,'own swipe C-146'),E('lead','fix','command'),E('fix','iphone','lock'),
  E('fix','best','land'),E('lead','cap','command'),E('cap','iphone','lock'),E('cap','art','report'),E('lead','art','command'),E('lead','res','command',True),
  E('rev','art','review',True),E('peer','lead','message')],
 'changes':[C('g0.0m becomes the best build (People card painted early)','P-175 passed','138b075c 03:34Z, 37fec7c9 03:38Z'),
  C('Lines you must type in chat become console steps','user T-170 #149','c0f28a57 03:54Z'),
  C('Your own swipe recorded and turned into a robot replay','article: show the hero under a real thumb','8a470bee 11:24Z (C-146)'),
  C('Article review, data audit and edit agents','draft ready','spawns 13:05-13:21Z')]})
for d in days:
    assert len(d['nodes'])<=14, (d['day'],len(d['nodes']))
    ids={n['id'] for n in d['nodes']}
    for e in d['edges']:
        for k in ('from','to'):
            if e[k] not in ids and e[k]!='main': raise SystemExit(f"day {d['day']} bad edge {e}")
    if any(e['from']=='main' or e['to']=='main' for e in d['edges']) and 'main' not in ids:
        d['nodes'].append(N('main','main (rebase + ff)','tool'))
    assert len(d['nodes'])<=15, (d['day'],len(d['nodes']))
doc={'schema':'fw-agent-topology/1','timezone':'UTC','note':'Day N = 29 Sep + N days. Counts: lead_spawns = Agent calls in the lead transcript (names/types only); all_subagents_incl_nested = subagent transcripts by first timestamp (incl. helpers spawned by agents); commits_on_main_utc = git log on main by UTC day; draft_* = figures quoted in the article draft (its own log page). Items with "inferred": true are not directly evidenced.',
 'node_kinds':['user','lead','role','tool','device'],'edge_kinds':['command','report','message','lock','thread','review','land'],'days':days}
json.dump(doc,open(OUT,'w'),indent=1,ensure_ascii=False)
print('ok', [len(d['nodes']) for d in days])
