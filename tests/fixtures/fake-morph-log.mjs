#!/usr/bin/env node
// Stand-in for fixes/morph-webkit/morph-log.mjs (install | read --owner <o> --label <l> --out <file>) in the
// `iphone.mjs gesture --morph-log` test: install logs, read writes a small log in morph-log's frame format
// ([t, dt, scrollY, --morph, nav classes, ...]) to --out.
import { appendFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2);
const opt = (n) => { const i = a.indexOf(`--${n}`); return i < 0 ? null : a[i + 1]; };
if (process.env.FAKE_MORPH_LOG) appendFileSync(process.env.FAKE_MORPH_LOG, JSON.stringify(a) + '\n');
if (!opt('owner')) { console.error('morph-log: --owner required'); process.exit(2); }
if (a[0] === 'install') { console.log('installed on fake'); process.exit(0); }
if (a[0] === 'read') {
  const frames = [[0, 16, 0, null, ''], [16, 17, 5220, 0.4, 'm'], [33, 60, 5220, 1, 'me'], [50, 30, 5220, 1, 'me'], [66, 16, 4000, 0, '']];
  writeFileSync(opt('out'), JSON.stringify({ v: 1, frames, summary: { fake: true }, meta: { label: opt('label') } }));
  console.log('wrote', opt('out'));
  process.exit(0);
}
process.exit(1);
