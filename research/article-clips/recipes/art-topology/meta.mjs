// names/types/timestamps only; no message content
import fs from 'node:fs'; import readline from 'node:readline';
const [f, since] = process.argv.slice(2);
const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
const out = { spawns: [], msgs: {}, reports: {}, userTurnsByDay: {}, crossSession: 0 };
for await (const line of rl) {
  if (line.length > 3e6) continue; let j; try { j = JSON.parse(line); } catch { continue; }
  const t = j.timestamp; if (!t || (since && t < since)) continue; const m = j.message; if (!m) continue;
  const d = t.slice(0, 10);
  if (j.type === 'assistant' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use') {
    const i = b.input || {};
    if (b.name === 'Agent') out.spawns.push(`${t.slice(5,16)} ${i.name || '-'} (${i.subagent_type || 'gp'}${i.model ? ','+i.model : ''})`);
    if (b.name === 'SendMessage') { const k = d + ' ' + String(i.to).replace(/-.*/, '-*'); out.msgs[k] = (out.msgs[k] || 0) + 1; }
  }
  if (j.type === 'user') { const c = m.content; const s = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : '';
    const a = s.match(/<agent-message from="([^"]+)"/); if (a) { const k = d + ' ' + a[1].replace(/-.*/, '-*'); out.reports[k] = (out.reports[k] || 0) + 1; }
    else if (/<cross-session-message/.test(s)) out.crossSession++;
    else if (typeof c === 'string' || (Array.isArray(c) && c.some(x => x.type === 'text'))) out.userTurnsByDay[d] = (out.userTurnsByDay[d] || 0) + 1; }
}
console.log(JSON.stringify(out, null, 1));
