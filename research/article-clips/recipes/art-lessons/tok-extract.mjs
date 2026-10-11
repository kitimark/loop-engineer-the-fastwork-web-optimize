// Extract per-request usage numbers (no message content) from Claude Code transcripts of this project.
// Output: requests.ndjson with {f (agent key), t, model, in, cw, cw1h, cw5m, cr, out}
// Usage: node tok-extract.mjs <projectDir> <outFile>
import { createReadStream, readdirSync, statSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import readline from 'node:readline';

const dir = process.argv[2], out = process.argv[3];
writeFileSync(out, '');
function* walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n); const s = statSync(p);
    if (s.isDirectory()) yield* walk(p); else if (n.endsWith('.jsonl')) yield p;
  }
}
const files = [...walk(dir)];
let nReq = 0;
for (const f of files) {
  // agent key: main session file -> "lead:<session8>", subagent -> its name from .meta.json if present
  let key = basename(f, '.jsonl'), kind = 'session', agentType = '';
  if (f.includes('/subagents/')) {
    kind = 'subagent';
    const meta = f.replace(/\.jsonl$/, '.meta.json');
    if (existsSync(meta)) { try { const m = JSON.parse(readFileSync(meta, 'utf8')); key = (m.name || key); agentType = m.agentType || ''; } catch {} }
    key = key + '#' + basename(f, '.jsonl').slice(-6);
  } else key = 'session:' + key.slice(0, 8);
  const byId = new Map();
  const rl = readline.createInterface({ input: createReadStream(f), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || !o.message?.usage) continue;
    const m = o.message, u = m.usage;
    if (m.model === '<synthetic>') continue;
    const id = m.id || o.requestId || o.uuid;
    const rec = { f: key, kind, agentType, side: !!o.isSidechain, t: o.timestamp, model: m.model,
      in: u.input_tokens || 0, cw: u.cache_creation_input_tokens || 0,
      cw1h: u.cache_creation?.ephemeral_1h_input_tokens || 0, cw5m: u.cache_creation?.ephemeral_5m_input_tokens || 0,
      cr: u.cache_read_input_tokens || 0, out: u.output_tokens || 0 };
    const prev = byId.get(id);
    if (!prev) byId.set(id, rec);
    else { prev.out = Math.max(prev.out, rec.out); if (rec.t < prev.t) prev.t = rec.t; }
  }
  if (byId.size) appendFileSync(out, [...byId.values()].map(r => JSON.stringify(r)).join('\n') + '\n');
  nReq += byId.size;
}
console.log('files', files.length, 'requests', nReq);
