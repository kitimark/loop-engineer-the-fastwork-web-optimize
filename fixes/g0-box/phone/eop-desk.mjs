#!/usr/bin/env node
// ws2 scope check in Chrome (fix-g0-box, lead's ws2 condition 3, 2026-10-09): on a desktop-width page the head script
// must register nothing (its media query is false) and wheel scrolling must have no window wheel listener before te, as
// on g0.0h; on a phone-emulated page (430x932, touch) the head listener is there from the load. Functional, headless,
// no timing (tools/check.mjs's launch: own temp profile, port 0). Per arm and viewport, a fresh isolated page:
// at the top 3 s after load, and 1 s after scrollTo(0, 2400) (past te's 200 % crossing): window.__fwWheelOn,
// window.__fwWheel set, the media query, and window's wheel / touch listeners from DOMDebugger.getEventListeners.
// Run in the shared lane: node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 200 --owner fix-g0-box -- \
//   node fixes/g0-box/phone/eop-desk.mjs <label>=<url>...
import { join } from 'node:path';
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir, eventListeners } from '../../../tools/lib/cdp.mjs';

const REPO = new URL('../../..', import.meta.url).pathname;
const VP = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true } };
const Q = '(hover: none) and (pointer: coarse) and (max-width: 640px) and (prefers-reduced-motion: no-preference)';
const targets = process.argv.slice(2).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
const READ = `JSON.stringify({ on: window.__fwWheelOn ?? null, fn: typeof window.__fwWheel === 'function', mq: matchMedia(${JSON.stringify(Q)}).matches, y: Math.round(scrollY) })`;
const ch = await launchChrome({ port: 0, profileDir: tempProfileDir(join(REPO, 'out', 'chrome-fn'), 'fix-g0-box'), headless: true, args: [screenInfoArg()] });
const ua = ch.userAgent ? headedUA(ch.userAgent) : null;
let cdp; const out = [];
try {
  cdp = await CDP.connect(ch.wsUrl);
  for (const vp of ['desktop', 'mobile']) for (const t of targets) {
    const page = await cdp.newIsolatedPage();
    const errs = [];
    page.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') errs.push('exception: ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 160));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(`${m.params.entry.source}: ${String(m.params.entry.text).slice(0, 200)}`);
    });
    await page.send('Log.enable');
    if (ua) await page.send('Emulation.setUserAgentOverride', { userAgent: ua });
    await page.send('Emulation.setDeviceMetricsOverride', VP[vp]);
    if (VP[vp].mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, t.url, { quietMs: 1500 }); await sleep(3000);
    const ls = async () => (await eventListeners(page, 'window')).filter((l) => /^(wheel|touch)/.test(l.type)).map((l) => `${l.type}${l.passive ? ':passive' : ':active'}${l.useCapture ? ':capture' : ''}`).sort();
    const top = { ...JSON.parse(await page.eval(READ)), listeners: await ls() };
    top.inline = await page.eval("[...document.querySelectorAll('head script:not([src])')].map((x) => x.textContent.length).join(',')");
    // past te on either layout: 1.5 viewports above the platform's bottom (inside the jack's zone on both widths)
    await page.eval("(() => { const p = document.querySelector('.start-selling-platform'); const b = p ? p.getBoundingClientRect().bottom + scrollY : document.documentElement.scrollHeight; scrollTo(0, Math.max(0, b - 1.5 * innerHeight)); return 1; })()"); await sleep(1500);
    const past = { ...JSON.parse(await page.eval(READ)), listeners: await ls() };
    await page.close();
    out.push({ vp, label: t.label, top, past });
    console.log(`DESK ${vp} ${t.label}: top mq ${top.mq} head-on ${top.on} fn ${top.fn} inline scripts ${top.inline || '-'} window ${top.listeners.join(',') || '-'} | after y ${past.y}: fn ${past.fn} window ${past.listeners.join(',') || '-'} | errors ${errs.length ? errs.join(' / ') : 0}`);
  }
} finally { cdp?.close(); await ch.close(); }
