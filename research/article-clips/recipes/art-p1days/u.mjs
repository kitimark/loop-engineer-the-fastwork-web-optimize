import fs from 'node:fs';
const S = '$SCRATCH';
const max = +(process.argv[2] || 450);
for (const f of fs.readdirSync(S + '/summary').filter(f => /^day-.*\.tsv$/.test(f))) {
  const d = f.slice(4, -4);
  const out = [];
  for (const line of fs.readFileSync(S + '/summary/' + f, 'utf8').split('\n')) {
    const [t, who, kind, ...rest] = line.split('\t');
    let text = rest.join('\t');
    if (!/^USER/.test(who || '')) continue;
    if (who === 'USER-PROMPT') continue;
    if (/^<command|^# Workflow|^<local-command|^Base directory|^<task-notification/.test(text)) continue;
    if (text.length > max) text = text.slice(0, max) + '…';
    out.push(`${t} ${who} ${kind} | ${text}`);
  }
  fs.writeFileSync(`${S}/art-p1days/u-${d}.txt`, out.join('\n') + '\n');
  console.log(d, out.length, out.join('\n').length);
}
