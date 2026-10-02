// P-056c (c, illustration only): Chrome screencast of #platform's row titles, headless, real clock. Per arm: load,
// 2.5 s, jump to (#platform top - 1 viewport), then scrollBy PX per rAF to (#platform bottom - 1 viewport), hold 2 s.
// Frames come from Page.startScreencast (JPEG, with their timestamps); ffmpeg turns them into an mp4 at 30 fps with
// each frame shown for its real duration. Not a measurement: a Chrome screencast, not Safari.
// usage: node clip.mjs <outdir> <label>=<url>...   env VW=430 VH=932 DPR=2 PX=6 MAXW=860
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const [outdir, ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const E = (k, d) => Number(process.env[k] || d);
const VW = E('VW', 430), VH = E('VH', 932), DPR = E('DPR', 2), PX = E('PX', 6), MAXW = E('MAXW', 860);
const profileDir = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'scene-scope-clip');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg()] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const t of targets) {
    const [label, url] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: VW < 800 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: VW < 800, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await gotoAndSettle(page, url, { quietMs: 1500 }); await sleep(2500);
    if (/^W\d/.test(label)) { await page.close(); continue; }
    const dir = join(outdir, label); mkdirSync(dir, { recursive: true });
    const frames = [];
    const off = page.on((m) => { if (m.method !== 'Page.screencastFrame') return; const p = m.params;
      const f = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`); writeFileSync(f, Buffer.from(p.data, 'base64'));
      frames.push({ f, ts: p.metadata.timestamp }); page.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); });
    const geo = await page.eval(`(() => { const r = document.getElementById('platform').getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; })()`);
    await page.eval(`scrollTo({ top: ${Math.max(0, geo.top - VH)}, behavior: 'instant' })`); await sleep(300);
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: MAXW, everyNthFrame: 1 });
    await page.eval(`new Promise((done) => { const stop = ${geo.bottom - VH}; let last = -1; const step = () => { if (scrollY >= stop || scrollY === last) return done(); last = scrollY; scrollBy({ top: ${PX}, behavior: 'instant' }); requestAnimationFrame(step); }; requestAnimationFrame(step); })`);
    await sleep(2000);
    await page.send('Page.stopScreencast'); await sleep(200); off();
    const lines = []; for (let i = 0; i < frames.length; i++) { lines.push(`file '${frames[i].f.split('/').pop()}'`); const d = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 1 / 30; lines.push(`duration ${Math.max(0.001, d).toFixed(4)}`); }
    lines.push(`file '${frames.at(-1).f.split('/').pop()}'`);
    writeFileSync(join(dir, 'list.txt'), lines.join('\n') + '\n');
    const mp4 = join(outdir, `${label}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', mp4]);
    console.log(`${label}: platform ${geo.top}-${geo.bottom}, ${frames.length} screencast frames over ${(frames.at(-1).ts - frames[0].ts).toFixed(1)} s -> ${mp4}`);
    await page.close();
  }
} finally {
  cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
