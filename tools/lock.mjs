#!/usr/bin/env node
// Cross-worktree locks for the shared physical resources (see tools/lib/lock.mjs).
//
//   node tools/lock.mjs status [resource] [--json]
//   node tools/lock.mjs acquire iphone --owner <topic> [--ttl 900] [--wait 0] [--url https://192.168.0.55:5231/] [--note "..."]
//   node tools/lock.mjs renew   iphone --owner <topic> [--ttl 900]
//   node tools/lock.mjs release iphone --owner <topic> [--force]
//   node tools/lock.mjs dequeue iphone --owner <topic>          # stop waiting
//   node tools/lock.mjs run chrome-measure --owner <topic> -- <cmd> [args...]   # hold while cmd runs
//
// acquire exit codes: 0 = you hold it (prints the holder JSON), 3 = busy (you are queued; prints
// holder + your queue position; call acquire again later to keep your place, every <= 5 min).
// --wait N blocks up to N seconds (polling with backoff) before giving up with exit code 3.
// Resources: chrome-measure (verify.mjs takes it automatically), iphone (lease, TTL default 900 s).
import { spawn } from 'node:child_process';
import { tryAcquire, acquire, release, renew, dequeue, status, allStatus, staleReason, RESOURCES } from './lib/lock.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const rest = dd >= 0 ? argv.slice(dd + 1) : [];
const opt = (n, d) => { const i = own.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = own[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : own[i + 1]; };
const flag = (n) => own.includes(`--${n}`);
const VALUED = ['--owner', '--ttl', '--wait', '--url', '--note', '--timeout'];
const [cmd, resource] = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
const owner = opt('owner', process.env.FW_LOCK_OWNER);

function fmt(s) {
  const h = s.holder;
  let line = `${s.resource.padEnd(15)} `;
  if (!h) line += 'free';
  else line += `${s.stale ? 'STALE (' + s.stale + ') ' : ''}held by "${h.owner}" [${h.kind}${h.pid ? ' pid ' + h.pid : ''}] since ${h.acquiredAt}${h.expiresAt ? ' until ' + h.expiresAt : ''}\n${' '.repeat(16)}checkout ${h.checkout}${h.meta && Object.keys(h.meta).length ? '\n' + ' '.repeat(16) + JSON.stringify(h.meta) : ''}`;
  if (s.queue.length) line += `\n${' '.repeat(16)}queue: ${s.queue.map((w, i) => `${i + 1}. ${w.owner} (since ${w.since})`).join(', ')}`;
  return line;
}

async function main() {
  if (!cmd || cmd === 'help' || flag('help')) { console.log(Object.entries(RESOURCES).map(([k, v]) => `  ${k}: ${v}`).join('\n')); console.log('\nsee header of tools/lock.mjs for usage'); return 0; }
  if (cmd === 'status') {
    const list = resource ? [status(resource)] : allStatus();
    if (flag('json')) console.log(JSON.stringify(list, null, 1)); else for (const s of list) console.log(fmt(s));
    return 0;
  }
  if (!resource) throw new Error(`usage: node tools/lock.mjs ${cmd} <resource> --owner <name>`);
  if (!owner && cmd !== 'release') throw new Error('--owner <name> is required (use your fix topic)');
  const meta = {};
  if (opt('url')) meta.url = opt('url');
  if (opt('note')) meta.note = opt('note');
  if (cmd === 'acquire') {
    const ttlSec = Number(opt('ttl', resource === 'iphone' ? 900 : 0)) || undefined;
    const waitSec = Number(opt('wait', 0));
    let res = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta });
    const t0 = Date.now();
    let pause = 5000;
    while (!res.ok && (Date.now() - t0) / 1000 < waitSec) {
      await new Promise((r) => setTimeout(r, Math.min(pause, waitSec * 1000 - (Date.now() - t0) + 10)));
      pause = Math.min(30000, pause * 1.5);
      res = await tryAcquire(resource, { owner, kind: 'lease', ttlSec, meta });
    }
    if (res.ok) { console.log(`ACQUIRED ${resource} for "${owner}"${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}${res.reentrant ? ' (renewed)' : ''}`); console.log(JSON.stringify(res.holder, null, 1)); return 0; }
    const who = res.holder ? `held by "${res.holder.owner}" since ${res.holder.acquiredAt}${res.holder.expiresAt ? ' until ' + res.holder.expiresAt : ''}` : `free, but "${res.queue[0].owner}" queued first`;
    console.log(`BUSY ${resource}: ${who}. You ("${owner}") are #${res.position} in the queue; run acquire again within 10 min to keep your place.`);
    return 3;
  }
  if (cmd === 'renew') { const h = await renew(resource, { owner, ttlSec: Number(opt('ttl', 900)) }); console.log(`RENEWED ${resource} for "${owner}" until ${h.expiresAt}`); return 0; }
  if (cmd === 'release') {
    const h = await release(resource, { owner, force: flag('force') });
    console.log(h ? `RELEASED ${resource} (was "${h.owner}"${staleReason(h) ? ', stale' : ''})` : `${resource} was not held`);
    return 0;
  }
  if (cmd === 'dequeue') { const q = await dequeue(resource, owner); console.log(`left the ${resource} queue; ${q.length} waiting`); return 0; }
  if (cmd === 'run') {
    if (!rest.length) throw new Error('usage: node tools/lock.mjs run <resource> --owner X -- <cmd> [args]');
    const { release: rel } = await acquire(resource, { owner, kind: 'process', meta, timeoutSec: Number(opt('timeout', 3600)) });
    const child = spawn(rest[0], rest.slice(1), { stdio: 'inherit' });
    const code = await new Promise((r) => child.on('exit', (c, s) => r(c ?? (s ? 1 : 0))));
    rel();
    return code;
  }
  throw new Error(`unknown command ${cmd}`);
}

main().then((c) => process.exit(c), (e) => { console.error(e.message || e); process.exit(1); });
