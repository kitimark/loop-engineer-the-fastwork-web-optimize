// usage: node c.mjs step C-038 C-039 | node c.mjs grep <regex> | node c.mjs thread T-082 [maxlen]
import fs from 'node:fs';
const S = '$SCRATCH';
const C = '' + '.git' + '/fastwork-mirror/console';
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'step') {
  for (const id of args) {
    const p = JSON.parse(fs.readFileSync(`${C}/${id}.json`, 'utf8'));
    const { title, answer, answers, state, created, createdAt, by } = p;
    console.log(id, '|', by, '|', state, '|', createdAt || created, '|', title);
    console.log('  answer:', JSON.stringify(answer ?? answers ?? p.result ?? p.parts?.map(x => x.answer)).slice(0, 1200));
  }
} else if (cmd === 'keys') {
  const p = JSON.parse(fs.readFileSync(`${C}/${args[0]}`, 'utf8'));
  console.log(Object.keys(p)); console.log(JSON.stringify(p).slice(0, +(args[1] || 3000)));
} else if (cmd === 'grep') {
  const re = new RegExp(args[0], 'i');
  const who = args[1];
  for (const f of fs.readdirSync(S + '/summary').filter(f => /^day-.*\.tsv$/.test(f)).sort()) {
    for (const line of fs.readFileSync(S + '/summary/' + f, 'utf8').split('\n')) {
      const parts = line.split('\t');
      if (who && !new RegExp(who).test(parts[1] || '')) continue;
      if (re.test(line)) console.log(f.slice(4, 14), line.slice(0, +(args[2] || 400)));
    }
  }
}
