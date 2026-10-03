// OPT-IN (npm run test:chrome, test:chrome:fn): the cost card's field 1 on a real Chrome (incident I-083). A tiny page
// runs a CSS width animation (main thread: a non-compositable property) and a transform animation (compositable); a
// trace with verify.mjs's categories must carry the "Animation" events, and chromeAnimations() must name the width
// animation's failure (UnsupportedCSSProperty, property width) and give the transform animation none. This is the
// decisive local check behind the card's "Status of the sources" line for field 1. Functional only: no timing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { chromeLock } from '../helpers.mjs';
import { launchChrome, CDP, tempProfileDir, sleep } from '../../tools/lib/cdp.mjs';
import { TRACE_START } from '../../tools/lib/trace-frames.mjs';
import { chromeAnimations } from '../../tools/lib/costcard.mjs';

const lock = chromeLock(`test-chrome-costcard-${process.pid}`, { cmd: 'costcard.chrome test' }, { shared: true, weight: 1, maxSec: 300 });
before(() => lock.acquire(), { timeout: Infinity });
after(() => lock.release());

const PAGE = `<!doctype html><style>
@keyframes grow { from { width: 10px } to { width: 200px } }
@keyframes slide { from { transform: translateX(0) } to { transform: translateX(200px) } }
#w { height: 20px; background: #c00; animation: grow 1s linear infinite alternate }
#t { width: 20px; height: 20px; background: #00c; animation: slide 1s linear infinite alternate }
</style><div id="w"></div><div id="t"></div>`;

test('real Chrome trace: Animation events give the width animation a failure reason and the transform none', async () => {
  const profileDir = tempProfileDir(tmpdir(), 'costcard-chrome');
  const chrome = await launchChrome({ port: 0, profileDir, headless: true });
  let cdp;
  try {
    cdp = await CDP.connect(chrome.wsUrl);
    const page = await cdp.newIsolatedPage();
    const events = [];
    page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
    await page.send('Tracing.start', TRACE_START);
    await page.send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(PAGE).toString('base64') });
    await sleep(2000);
    const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
    await page.send('Tracing.end');
    await done;
    const anims = chromeAnimations(events);
    const grow = anims.find((a) => a.displayName === 'grow'), slide = anims.find((a) => a.displayName === 'slide');
    assert.ok(grow && slide, `both animations in the trace (${chrome.browser}): ${JSON.stringify(anims.map((a) => [a.displayName, a.phases.join('')]))}`);
    assert.ok(grow.hasCompositeInstant, `width animation: a compositeFailed instant event (${chrome.browser})`);
    assert.ok(grow.compositeFailed > 0, 'width animation not composited');
    assert.ok(grow.reasons.includes('UnsupportedCSSProperty'), `reasons ${grow.reasons}`);
    assert.deepEqual(grow.unsupportedProperties, ['width']);
    assert.equal(slide.compositeFailed, 0, `transform animation: no failure reason (${slide.reasons})`);
    // the composited animation gets no compositeFailed instant at all: absence is not proof, hence "never read as composited"
    assert.ok(/^DIV id='w'/.test(grow.nodeName) && Number.isInteger(grow.nodeId), 'node attribution for --nodes');
  } finally {
    cdp?.close();
    await chrome.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
