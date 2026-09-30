#!/usr/bin/env node
// Score every run in data/runs-index.tsv (task, arm, rep, agentId) against tasks.json ground truth.
//   NAV_BENCH_TASKS=<dir with <agentId>.output transcripts> node tools/score.mjs [--write]
// Writes data/runs.json (per-run metrics + answer) and prints a per-run table.
// Scores are 0..1. List answers: F1 of (credit-weighted recall, precision). `offByOne` counts answered
// lines that are exactly one below a ground-truth line and match nothing (0-based leakage).
import fs from 'node:fs';
import path from 'node:path';
import { summarise } from './transcript.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const { tasks } = JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8'));
const T = Object.fromEntries(tasks.map((t) => [t.id, t]));
const dir = process.env.NAV_BENCH_TASKS;
const base = (f) => String(f || '').replace(/^.*?(site-pretty\/_app\/immutable\/|immutable\/)/, '').replace(/^\/?(Users\/.*?fastwork-com-web-optimize\/)/, '').replace(/^\/+/, '');
const fileEq = (a, b) => { a = base(a); b = base(b); return a === b || a.endsWith('/' + b) || b.endsWith('/' + a) || path.basename(a) === path.basename(b); };
const num = (x) => (typeof x === 'number' ? x : parseInt(x, 10));
const f1 = (p, r) => (p + r ? (2 * p * r) / (p + r) : 0);
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/['"]/g, '').toLowerCase();

function listScore(gt, ans, match, credit = () => 1) {
  const used = new Set(); let tp = 0, matched = 0; const misses = [];
  for (const g of gt) {
    const i = ans.findIndex((a, k) => !used.has(k) && match(g, a));
    if (i >= 0) { used.add(i); matched++; tp += credit(g, ans[i]); } else misses.push(g);
  }
  const extras = ans.filter((_, k) => !used.has(k));
  const recall = gt.length ? tp / gt.length : 1, precision = ans.length ? matched / ans.length : (gt.length ? 0 : 1);
  return { score: f1(precision, recall), recall, precision, misses, extras };
}
function offByOne(gtLines, ansLines) { return ansLines.filter((l) => !gtLines.includes(l) && gtLines.includes(l + 1)).length; }
const rng = (x, [a, b]) => x >= a && x <= b;

const scorers = {
  T01(a, g) {
    const r = (k) => (Array.isArray(a[k]) ? (num(a[k][0]) === g[k][0] ? (num(a[k][1]) === g[k][1] ? 1 : 0.5) : 0) : 0);
    const items = [r('iE'), r('dE'), r('uE'), /100%\s*0px/.test(a.defaultRootMargin || '') ? 1 : 0];
    const ob = offByOne([2670, 2749, 2719], ['iE', 'dE', 'uE'].map((k) => num(a[k]?.[0])));
    return { score: items.reduce((x, y) => x + y) / 4, offByOne: ob };
  },
  T02(a, g) {
    const fn = (x, y) => (x && x.name === y.name && num(x.start) === y.start ? (num(x.end) === y.end ? 1 : 0.5) : 0);
    const p = a.springParams || {};
    const items = [fn(a.digitComponent, g.digitComponent), num(a.rafCallbackLine) === g.rafCallbackLine ? 1 : 0, fn(a.springStep, g.springStep),
      (p.name === 'UE' && num(p.line) === 3789 ? 0.5 : 0) + (p.stiffness == 280 && p.damping == 18 && p.mass == 0.3 ? 0.5 : 0)];
    return { score: items.reduce((x, y) => x + y) / 4, offByOne: offByOne([3823, 3836, 3791, 3789], [a.digitComponent?.start, a.rafCallbackLine, a.springStep?.start, p.line].map(num)) };
  },
  T03(a, g) {
    const ans = a.callers || [];
    const s = listScore(g.callers, ans, (x, y) => num(y.line) === x.line, (x, y) => ((y.component === x.component) + (y.callback === x.callback)) / 2);
    return { ...s, offByOne: offByOne(g.callers.map((c) => c.line), ans.map((c) => num(c.line))) };
  },
  T04(a, g) {
    // 3420 (namespace getter `onMount: () => Ra`) and 3530 (export) are neutral: neither required nor penalised.
    // CzkAa0og.js:540 (`var { onMount: ze } = s`, namespace destructure, ze unused) was missed by the TS-based GT
    // and found by some runs: neutral too, reported as found540.
    const neutral = (u) => (fileEq(u.file, 'chunks/BSBv9QXB.js') && [3420, 3530, 3430].includes(num(u.line))) || (fileEq(u.file, 'chunks/CzkAa0og.js') && num(u.line) === 540);
    const ans = (a.uses || []).filter((u) => !neutral(u));
    const s = listScore(g.uses.filter((u) => !neutral(u)), ans, (x, y) => fileEq(y.file, x.file) && num(y.line) === x.line, (x, y) => (y.localName === x.localName ? 1 : 0.5));
    const found540 = (a.uses || []).some((u) => fileEq(u.file, 'chunks/CzkAa0og.js') && num(u.line) === 540);
    return { ...s, found540, offByOne: offByOne(g.uses.map((u) => u.line), ans.map((u) => num(u.line))) };
  },
  T05(a, g) {
    const ans = a.calls || [];
    const s = listScore(g.calls, ans, (x, y) => fileEq(y.file, x.file) && num(y.line) === x.line);
    return { ...s, offByOne: offByOne(g.calls.map((c) => c.line), ans.map((c) => num(c.line))) };
  },
  T06(a, g) {
    const gt = [...g.exitOpacity.map((x) => ({ k: 'exit', line: x.line })), ...g.morph.map((x) => ({ k: 'morph', line: x.line }))];
    const ans = [...(a.exitOpacity || []).map((x) => ({ k: 'exit', line: num(x.line) })), ...(a.morph || []).map((x) => ({ k: 'morph', line: num(x.line) }))];
    const s = listScore(gt, ans, (x, y) => x.k === y.k && x.line === y.line);
    return { ...s, offByOne: offByOne(gt.map((x) => x.line), ans.map((x) => x.line)) };
  },
  T07(a, g) {
    const ans = (a.perScrollFrame || []).map((x) => num(x.line));
    const s = listScore(g.perScrollFrame.map((x) => x.line), ans, (x, y) => x === y);
    const not = (a.notFromScrollCallback || []).map((x) => num(x.line));
    const notOk = not.includes(13044) && !ans.includes(13044) ? 1 : 0;
    return { ...s, score: 0.8 * s.score + 0.2 * notOk, notOk, offByOne: offByOne(g.perScrollFrame.map((x) => x.line), ans) };
  },
  T08(a) {
    const R = (a.reads || []).map((x) => ({ line: num(x.line), what: String(x.what || '') }));
    const W = (a.writes || []).map((x) => ({ line: num(x.line), what: String(x.what || '') }));
    const has = (list, lines, re) => list.some((x) => (!lines || lines.includes(x.line)) && (!re || re.test(x.what)));
    const keys = {
      R1: has(R, [11305, 11306, 11307], /hero-track|getBoundingClientRect|rect/i),
      R2: has(R, [11313], /\bg\b|getBoundingClientRect|rect/i),
      R3: has(R, [11323], /\bv\b|getBoundingClientRect|rect/i),
      R4: has(R, null, /innerHeight/),
      R5: has(R, [11321], /pain|querySelector/i),
      R6: has(R, null, /matches|matchMedia|media|reduced|860/i),
      W1: has(W, [11317], /future-shrink/),
      W2: has(W, [11324], /is-pain-dark/),
      W3: has(W, [11310, 11311, 11318], null),
      W4: has(W, [11319], /requestAnimationFrame|rAF|schedul/i),
    };
    const n = Object.values(keys).filter(Boolean).length;
    return { score: n / 10, keys, offByOne: 0 }; // adjacent lines are legitimate answers here, so no off-by-one check
  },
  T09(a, g) {
    const ans = a.rules || [];
    const s = listScore(g.rules, ans, (x, y) => fileEq(y.file, x.file) && (num(y.line) === x.line || num(y.line) === x.line - 1),
      (x, y) => (num(y.line) === x.line ? 1 : 0.75) * (norm(y.selector).includes(norm(x.selector).split('(in')[0]) ? 1 : 0.75));
    return { ...s, offByOne: 0 };
  },
  T10(a, g) {
    const gt = [...g.keyframes.map((x) => ({ ...x, k: 'kf', r: x.range || [x.line, x.line] })), ...g.transitions.map((x) => ({ ...x, k: 'tr', r: x.range || [x.line - 1, x.line + 1] }))];
    const ans = [...(a.keyframes || []).map((x) => ({ ...x, k: 'kf' })), ...(a.transitions || []).map((x) => ({ ...x, k: 'tr' }))];
    const s = listScore(gt, ans, (x, y) => x.k === y.k && fileEq(y.file, x.file) && rng(num(y.line), x.r));
    return { ...s, offByOne: 0 };
  },
  T11(a, g) {
    const ans = (a.references || []).map((x) => num(x.line)).filter((l) => l !== 3106);
    const s = listScore(g.references.map((x) => x.line), ans, (x, y) => x === y);
    return { ...s, offByOne: offByOne([3125, 3128, 3142], ans) };
  },
  T12(a, g) {
    const items = [num(a.declaredLine) === 12946, num(a.assignedLine) === 13218, /nav|header|root|element/i.test(a.holds || ''), a.sameAsRafT === false, num(a.otherTLine) === 13020];
    return { score: items.filter(Boolean).length / 5, items, offByOne: offByOne([12946, 13218, 13020], [a.declaredLine, a.assignedLine, a.otherTLine].map(num)) };
  },
  T13(a, g) {
    const items = [a.name === 'ai', num(a.start) === 2054, num(a.end) === 2110, num(a.attachLine) === 2275, /\bbi\b/.test(a.attachFunction || '')];
    return { score: items.filter(Boolean).length / 5, items, offByOne: offByOne([2054, 2110, 2275], [a.start, a.end, a.attachLine].map(num)) };
  },
  T14(a, g) {
    const ans = (a.uses || []).filter((x) => num(x.line) !== 2663);
    const s = listScore(g.uses, ans, (x, y) => num(y.line) === x.line, (x, y) => (String(y.access).startsWith(x.access) ? 1 : 0.5));
    const head = a.variable === '$T' && num(a.declLine) === 2663 ? 1 : 0;
    return { ...s, score: 0.2 * head + 0.8 * s.score, offByOne: offByOne([2663, ...g.uses.map((u) => u.line)], [num(a.declLine), ...ans.map((u) => num(u.line))]) };
  },
  T15(a, g) {
    const ans = a.lines || [];
    const s = listScore(g.lines, ans, (x, y) => num(y.line) === x.line, (x, y) => (String(y.topLevelFunction).replace(/[^\w$].*$/, '') === x.topLevelFunction ? 1 : 0.5));
    return { ...s, offByOne: offByOne(g.lines.map((x) => x.line), ans.map((x) => num(x.line))) };
  },
  T17(a, g) {
    const ans = (a.references || []).map((x) => num(x.line)).filter((l) => l !== 10914);
    const s = listScore(g.references.map((x) => x.line), ans, (x, y) => x === y);
    return { ...s, offByOne: offByOne(g.references.map((x) => x.line), ans) };
  },
  T18(a, g) {
    const ans = (a.references || []).filter((x) => num(x.line) !== 10920);
    const s = listScore(g.references, ans, (x, y) => num(y.line) === x.line, (x, y) => (String(y.access).toLowerCase().startsWith(x.access) || (x.access === 'both' && /read.*write|write.*read/i.test(y.access)) ? 1 : 0.5));
    return { ...s, offByOne: offByOne(g.references.map((x) => x.line), ans.map((x) => num(x.line))) };
  },
  T19(a, g) {
    const h = a.perPropertyHelper || {};
    const items = [fileEq(a.file || '', g.file), a.name === '$i', num(a.start) === 2861, num(a.end) === 2870,
      h.name === 'Qi' && num(h.start) === 2855, a.onlyChanged === true];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([2861, 2855], [num(a.start), num(h.start)]) };
  },
  T20(a, g) {
    const ans = a.calls || [];
    const s = listScore(g.calls, ans, (x, y) => num(y.line) === x.line, (x, y) => (String(y.component).startsWith(x.component) ? 1 : 0.5));
    return { ...s, offByOne: offByOne(g.calls.map((c) => c.line), ans.map((c) => num(c.line))) };
  },
  T21(a) {
    const w = (a.writes || []).map(num);
    const items = [num(a.classBindingLine) === 11469, a.stateVar === 'y', num(a.stateDeclLine) === 11274, w.includes(11310), w.includes(11311),
      w.every((x) => [11310, 11311].includes(x))];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([11469, 11274, 11310, 11311], [num(a.classBindingLine), num(a.stateDeclLine), ...w]) };
  },
  T22(a, g) {
    const items = g.classes.map((c) => { const x = (a.classes || []).find((y) => y.name === c.name || String(y.name).replace(/^\./, '') === c.name);
      return !!x && x.used === c.used; });
    return { score: items.filter(Boolean).length / items.length, items, offByOne: 0 };
  },
  T23(a) {
    const r = (n) => (a.refs || []).find((x) => x.name === n) || {};
    const c = r('c'), u = r('u');
    const items = [num(c.assignLine) === 3281, /^\W*section/i.test(c.element || ''),
      num(u.assignLine) === 3267, /commission-card/.test(u.element || '')];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([3281, 3267], [num(c.assignLine), num(u.assignLine)]) };
  },
  T24(a) {
    const e = a.equalityCheckIn || {};
    const items = [fileEq(a.file || '', 'chunks/BSBv9QXB.js'), a.name === 'F', num(a.start) === 1229, num(a.end) === 1234, e.name === 'wn' && [1235, 1236].includes(num(e.line))];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([1229, 1235], [num(a.start), num(e.line)]) };
  },
  T25(a) {
    const items = [num(a.start) === 10782, num(a.end) === 10784, a.excludesPhones === true, /861/.test(a.returns || '')];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([10782], [num(a.start)]) };
  },
  T26(a) {
    const x = a.line5700 || {}, y = a.line11090 || {};
    const items = [num(x.mediaLine) === 5672, /860/.test(x.condition || ''), num(y.mediaLine) === 11081, /no-preference/.test(y.condition || '')];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([5672, 11081], [num(x.mediaLine), num(y.mediaLine)]) };
  },
  T27(a) {
    const items = [num(a.line) === 2590, /^JT\b/.test(a.component || ''), /S\(|set_?style|style directive|inline/i.test(a.mechanism || '')];
    return { score: items.filter(Boolean).length / items.length, items, offByOne: offByOne([2590], [num(a.line)]) };
  },
  T16(a) {
    const ch = (a.chain || []).map((x) => ({ ...x, line: num(x.line) }));
    const has = (file, lines, re) => ch.some((x) => fileEq(x.file, file) && (lines.includes(x.line) || (re && re.test(`${x.function} ${x.what}`))));
    const keys = {
      C1: has('tools/fix.mjs', [336], /cmdAb/),
      C2: has('tools/fix.mjs', [372, 373], /spawn/i),
      C3: has('tools/verify.mjs', [219, 220, 221], null),
      C4: ch.some((x) => fileEq(x.file, 'tools/lib/lock.mjs') && (rng(x.line, [170, 197]) || /^\s*acquire\b/.test(x.function || ''))),
    };
    const wrong = ch.some((x) => fileEq(x.file, 'tools/fix.mjs') && /acquire\(/.test(x.what || '') && !/spawn|verify/i.test(x.what || ''));
    return { score: Object.values(keys).filter(Boolean).length / 4, keys, wrongClaim: wrong, offByOne: 0 };
  },
};

// Committed data keeps names and line numbers only (Hard rule 3): drop the agents' prose, free-text answer
// fields and tool-call arguments, which can quote Fastwork code.
const FREE = new Set(['what', 'use', 'how', 'mechanism', 'holds', 'raw']);
const strip = (v) => (Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, FREE.has(k) ? '<omitted>' : strip(x)])) : v);
const idx = fs.readFileSync(path.join(root, 'data/runs-index.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'));
const out = [];
const manual = fs.existsSync(path.join(root, 'data/manual-answers.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/manual-answers.json'), 'utf8')) : {};
for (const [task, arm, rep, id, flag] of idx) {
  // Raw per-run record: data/raw/<agentId>.json (written below from the transcript on first scoring, so later
  // re-scoring works after the session's transcripts are gone). The transcript wins when it is available.
  const rawFile = path.join(root, 'data/raw', `${id}.json`);
  // NAV_BENCH_TASKS: the session's tasks dir (<id>.output) or its subagents dir
  // (~/.claude/projects/<project>/<session>/subagents, agent-<id>.jsonl, which persists after the session).
  const f = !dir ? '' : [path.join(dir, `${id}.output`), path.join(dir, `agent-${id}.jsonl`)].find((x) => fs.existsSync(x)) || '';
  let s;
  if (f && fs.existsSync(f)) {
    s = summarise(f); s.fromTranscript = true;
  } else if (fs.existsSync(rawFile)) {
    // Raw records drop free-text answer fields (Hard rule 3), so reuse the score stored from the transcript.
    s = { finalText: '', ...JSON.parse(fs.readFileSync(rawFile, 'utf8')) };
  } else { console.error(`missing ${task} ${arm} ${rep} ${id}`); continue; }
  let sc;
  if (!s.fromTranscript && s.stored) sc = s.stored;
  else {
    if ((!s.answer || s.answer.parseError) && manual[id]) { s.answer = manual[id].answer; s.formatFail = manual[id].note; }
    if (!s.answer || s.answer.parseError) sc = { score: 0, note: 'no parsable answer' };
    else sc = scorers[task](s.answer, T[task].gt);
  }
  if (s.fromTranscript && s.allAnswers.length > 1 && sc.score !== undefined) {
    const first = scorers[task](s.allAnswers[0], T[task].gt);
    if (first.score !== sc.score) { sc.firstAnswerScore = first.score; sc.firstAnswerOffByOne = first.offByOne; }
  }
  const { finalText, allAnswers = [], stored, fromTranscript, ...rest } = s; // calls kept for latency stats
  if (fromTranscript) {
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, JSON.stringify({ task, arm, rep: Number(rep), agentId: id, ...strip({ ...rest, calls: undefined }),
      calls: rest.calls.map(({ arg, ...c }) => c), stored: strip(sc) }, null, 1));
  }
  out.push({ task, type: T[task].type, arm, rep: Number(rep), agentId: id, invalid: flag?.startsWith('invalid:') ? flag.slice(8) : undefined, ...sc, ...rest, finalText });
  console.log([task, arm, rep, sc.score.toFixed(2), `P${(sc.precision ?? NaN).toFixed?.(2)} R${(sc.recall ?? NaN).toFixed?.(2)}`, `obo${sc.offByOne ?? ''}`,
    `calls${s.toolCalls}`, `ser${s.serenaCalls}`, `${s.wallSec}s`, `${Math.round(s.tokens.total / 1000)}k`, `peak${Math.round(s.tokens.ctxPeak / 1000)}k`].join('\t'));
}
const clean = out.map(({ finalText, ...r }) => ({ ...strip(r), calls: r.calls.map(({ arg, ...c }) => c) }));
if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'data/runs.json'), JSON.stringify(clean, null, 1));
