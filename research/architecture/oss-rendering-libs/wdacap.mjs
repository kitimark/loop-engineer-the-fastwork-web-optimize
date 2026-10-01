// Screen capture through WebDriverAgent screenshots (no camera permission, no Web Inspector):
// GET http://127.0.0.1:8100/screenshot in a loop (2 in flight), PNGs to <dir>/NNNN.png, times to <dir>/times.json.
// usage: node wdacap.mjs <dir> <seconds>
import { mkdirSync, writeFileSync } from 'node:fs';
const [dir, secs = '20'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const t0 = Date.now(), end = t0 + Number(secs) * 1000;
const times = []; let n = 0;
const one = async () => {
  while (Date.now() < end) {
    const ts = Date.now();
    try {
      const r = await fetch('http://127.0.0.1:8100/screenshot');
      const j = await r.json();
      const te = Date.now();
      const k = n++;
      writeFileSync(`${dir}/${String(k).padStart(4, '0')}.png`, Buffer.from(j.value, 'base64'));
      times.push([k, ts - t0, te - t0]);
    } catch (e) { times.push([-1, ts - t0, String(e)]); }
  }
};
await Promise.all([one(), one()]);
times.sort((a, b) => a[0] - b[0]);
writeFileSync(`${dir}/times.json`, JSON.stringify({ t0, times }));
const ok = times.filter((t) => t[0] >= 0);
console.log(`captured ${ok.length} screenshots in ${secs} s (${(ok.length / Number(secs)).toFixed(1)}/s) -> ${dir}`);
