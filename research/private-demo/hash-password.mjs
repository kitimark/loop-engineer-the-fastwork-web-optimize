#!/usr/bin/env node
// hash-password.mjs: turn the private demo's password into the two Vercel env vars, without the password ever
// touching argv, the shell history or the disk.
//
//   node hash-password.mjs
//
// It asks for the password twice on the terminal with echo off, makes a fresh random salt, and prints:
//   DEMO_PASS_SALT=<32 hex>
//   DEMO_PASS_SHA256=<64 hex>   = hex SHA-256 of UTF-8(salt + "\n" + password), the same as middleware.ts computes
// Paste both into Vercel (Settings > Environment Variables, mark them Sensitive). Running it again gives a new
// salt and hash for the same password; both pairs work, but always set the two values from ONE run together.
//
// SHA-256 is fast, so the hash only protects a strong password: use 16+ random characters or 5+ random words.
// The script refuses fewer than 12 characters.
// Non-interactive use (tests only): `--stdin` reads one line from a pipe instead of the terminal.
import { randomBytes, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function sha256Hex(salt, password) {
  const d = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '\n' + password));
  return Buffer.from(d).toString('hex');
}
export const newSalt = () => randomBytes(16).toString('hex');

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let s = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') { done(); resolve(s); return; }
        if (ch === '\u0003') { done(); reject(new Error('cancelled')); return; }
        if (ch === '\u007f' || ch === '\b') { s = [...s].slice(0, -1).join(''); continue; }
        if (ch >= ' ') s += ch;
      }
    };
    function done() { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stderr.write('\n'); }
    stdin.on('data', onData);
  });
}

async function readStdinLine() {
  let buf = '';
  for await (const c of process.stdin) { buf += c; if (buf.includes('\n')) break; }
  return buf.split(/\r?\n/)[0];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log('usage: node hash-password.mjs   (asks twice, no echo; prints DEMO_PASS_SALT and DEMO_PASS_SHA256)'); return 0; }
  const unknown = args.filter((a) => a !== '--stdin');
  if (unknown.length) { console.error('The password is never taken from the command line. Run: node hash-password.mjs'); return 2; }
  let pw;
  if (args.includes('--stdin')) {
    pw = await readStdinLine();
  } else {
    if (!process.stdin.isTTY) { console.error('Run it in a terminal (it reads the password with echo off), or pass --stdin for a pipe.'); return 2; }
    pw = await readHidden('Password: ');
    const again = await readHidden('Again:    ');
    if (pw !== again) { console.error('The two entries differ. Nothing printed.'); return 1; }
  }
  if ([...pw].length < 12) { console.error('Too short: use at least 12 characters (16+ random characters or 5+ random words recommended).'); return 1; }
  const salt = newSalt();
  const hash = await sha256Hex(salt, pw);
  pw = null;
  process.stdout.write(`DEMO_PASS_SALT=${salt}\nDEMO_PASS_SHA256=${hash}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
