// countdown-faces X1 stage 2: the phone block driver (README "Stage 2 block plan"). Runs one part of the block inside
// the caller's own `lock.mjs run chrome-measure --no-timing` hold, with the iphone lease held by countdown-faces.
//   node fixes/countdown-faces/x1-block.mjs A   warm-ups C, V; heat check (open); counted runs 1 C, 2 V, 3 V, 4 C
//   node fixes/countdown-faces/x1-block.mjs B   counted runs 5 C, 6 V, 7 V, 8 C; heat check (end)
//   node fixes/countdown-faces/x1-block.mjs C   attribution runs C, V (--lt --resume-check), after the end heat check
// The two servers (one per arm, started at the block start) write out/countdown-faces/x1/serve-{C,V}.json; the phone
// opens each one's plain-http twin on host `lan` (I-003, I-073; never resolved in a file). A failing heat check stops
// the part (exit 4): every counted run since the last passing check is void (protocol v2 §5.2).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT } from '../../tools/lib/paths.mjs';

const OWNER = 'countdown-faces';
const OUT = join(WT, 'out/countdown-faces/x1');
const PART = process.argv[2];
const BUILD = { C: 'base', V: 'poc' };
const twin = (arm) => { const f = join(OUT, `serve-${arm}.json`); if (!existsSync(f)) throw new Error(`no server state ${f}`); const s = JSON.parse(readFileSync(f, 'utf8')); if (!s.httpTwin) throw new Error(`${f}: no http twin`); return s.httpTwin; };
const url = (arm) => `http://lan:${twin(arm)}/`;
const node = (args, stdio = 'inherit') => execFileSync(process.execPath, args, { cwd: WT, stdio });
const doing = (text) => { try { node([join(WT, 'tools/lock.mjs'), 'doing', 'chrome-measure', '--owner', OWNER, '--text', text, '--for', 'countdown-faces X1'], 'ignore'); } catch {} };
const stamp = () => new Date().toISOString().slice(11, 19) + 'Z';
const open = (arm) => node([join(WT, 'tools/iphone.mjs'), 'open', url(arm), '--owner', OWNER]);

function x1(arm, label, extra = []) {
  doing(`countdown X1 phone: ${label}`);
  console.log(`[${stamp()}] ${label}`);
  open(arm);
  node([join(WT, 'fixes/countdown-faces/x1.mjs'), 'phone', '--url', url(arm), '--arm', arm, '--build', BUILD[arm], '--label', label, ...extra]);
  const r = JSON.parse(readFileSync(join(OUT, `${label}.json`), 'utf8'));
  const ticks = Object.fromEntries(Object.entries(r.positions || {}).map(([p, v]) => [p, v.ticksInWindow]));
  const few = Object.entries(ticks).filter(([, k]) => !(k >= 3));
  console.log(`[${stamp()}] ${label} ticks ${JSON.stringify(ticks)} battery ${JSON.stringify(r.batteryStart)} -> ${JSON.stringify(r.batteryEnd)}${few.length ? ' VOID-RUN (< 3 ticks)' : ''}`);
}

function heat(tag) {
  const label = `X1-heat-${tag}`;
  doing(`countdown X1 phone: heat check (${tag})`);
  console.log(`[${stamp()}] ${label}`);
  open('C');
  const out = join(OUT, `${label}.json`);
  node([join(WT, 'tools/iphone.mjs'), 'run', '--driver', 'scroll', '--probe', 'std', '--owner', OWNER, '--arm', 'C', '--block', 'X1', '--build', 'base', '--low-power', 'off', '--label', label, '--out', out]);
  const s = JSON.parse(readFileSync(out, 'utf8'));
  const sen = s.meta?.sentinel || s.sentinel;
  console.log(`[${stamp()}] ${label} sentinel ${JSON.stringify(sen)}`);
  if (!sen || sen.pass !== true) { console.log(`HEAT-FAIL ${tag}: counted runs since the last passing check are void; cool and redo`); process.exit(4); }
}

const renew = () => node([join(WT, 'tools/lock.mjs'), 'renew', 'iphone', '--owner', OWNER, '--ttl', '900', '--doing', `countdown X1 phone block, part ${PART}`]);

if (PART === 'A') {
  renew();
  x1('C', 'X1-wC', ['--warmup']);
  x1('V', 'X1-wV', ['--warmup']);
  heat('open');
  [['C', 1], ['V', 2], ['V', 3], ['C', 4]].forEach(([a, n]) => x1(a, `X1-${n}${a}`, ['--run', String(n)]));
} else if (PART === 'B') {
  renew();
  [['C', 5], ['V', 6], ['V', 7], ['C', 8]].forEach(([a, n]) => x1(a, `X1-${n}${a}`, ['--run', String(n)]));
  heat('end');
} else if (PART === 'C') {
  renew();
  x1('C', 'X1-attrC', ['--lt', '--resume-check']);
  x1('V', 'X1-attrV', ['--lt', '--resume-check']);
} else { console.error('usage: x1-block.mjs A|B|C'); process.exit(2); }
doing(`countdown X1 phone: part ${PART} done`);
console.log(`[${stamp()}] PART ${PART} DONE`);
