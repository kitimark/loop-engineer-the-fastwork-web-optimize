#!/usr/bin/env node
// v10 (int-v8): which of em-px's four loads (A V A2 V2) a split gate folder still lacks (none yet, or a load that
// ended in error). Prints them comma-separated, or nothing when all four are in. Read only.
//   node fixes/v10/pxmissing.mjs <em-px --out folder>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
if (!dir) { console.error('usage: pxmissing.mjs <folder>'); process.exit(2); }
const f = join(dir, 'px.json');
const have = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).loads.filter((l) => !l.void).map((l) => l.arm) : [];
console.log(['A', 'V', 'A2', 'V2'].filter((a) => !have.includes(a)).join(','));
