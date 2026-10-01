// Visible-tab picker for the Simulator (de-counts-sim). Shared by wkcounts.mjs and the W-driver copy used for the
// Sim-vs-phone check.
import { connect, isBlankUrl, sleep } from '../../../tools/lib/wip.mjs';
export { sleep };

// The tab to drive: among the listed web views whose url matches, the one whose document is visible. A cross-origin
// navigation (each arm has its own port) can leave the previous page listed for a while (OBSERVED on the Simulator,
// hold n1: openTab threw at once after the first cross-port navigation), so pickTab's one-match rule is too strict here.
const PORT = Number(process.env.FW_IPHONE_PORT || 9222);
export async function openTab(match, tries = 8) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    const pages = (await (await fetch(`http://localhost:${PORT}/json`)).json()).filter((p) => p.webSocketDebuggerUrl && !isBlankUrl(p.url) && (typeof match === 'function' ? match(p.url) : String(p.url).includes(match)));
    const vis = [];
    for (const p of pages) {
      let c;
      try { c = await connect(p.webSocketDebuggerUrl, { timeoutMs: 4000 }); const v = await c.evaluate('document.visibilityState', 'page', 3000); if (v === 'visible') { vis.push(c); continue; } } catch (e) { last = String(e.message || e); }
      try { c && c.close(); } catch {}
    }
    if (vis.length === 1) return vis[0];
    for (const c of vis) c.close();
    last = `${pages.length} listed, ${vis.length} visible ${last}`;
    console.error(`tab try ${i + 1}: ${last}`);
    await sleep(1000 + 500 * i);
  }
  throw new Error(`no single visible tab: ${last}`);
}
