import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
const src = html.split('<script>')[1].split('</script>')[0];
const ids = [...html.matchAll(/data-chart="([^"]+)"/g)].map((m) => m[1]);
for (const W of [360, 900]) {
  const els = ids.map((id) => ({ id, clientWidth: W, attrs: { 'data-chart': id, 'aria-label': 'x' }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; }, innerHTML: '' }));
  globalThis.document = { querySelectorAll: () => els, fonts: null };
  globalThis.window = { addEventListener() {} };
  new Function(src)();
  for (const e of els) {
    if (!e.innerHTML.startsWith('<svg') || /NaN|undefined|Infinity/.test(e.innerHTML)) console.log('BAD', W, e.id, e.innerHTML.slice(0, 300));
  }
  console.log(W, els.map((e) => e.id + ':' + e.innerHTML.length).join(' '));
}
