// Minimal WebKit Inspector Protocol client for iOS Safari via ios_webkit_debug_proxy
// (`ios_webkit_debug_proxy -c null:9221,:9222-9322`). Derived from the session's scratchpad wip.mjs.
// iOS 26 exposes a "page" target and "frame" target(s); commands are routed via Target.sendMessageToTarget.
// Target ids change on every navigation, so reconnect (openTab) after navigating.
// WebKit quirks seen on iOS 26.6.1: Runtime.evaluate ignores awaitPromise (returns the Promise object),
// Page.navigate is not available (navigate with location.href), Timeline timestamps are all 0 over the proxy.
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function connect(wsUrl, {timeoutMs = 15000} = {}) {
  const ws = new WebSocket(wsUrl);
  await Promise.race([
    new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }),
    sleep(timeoutMs).then(() => { throw new Error('websocket open timeout'); }),
  ]);
  let id = 0, innerId = 0;
  const targets = {}, pending = new Map(), listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Target.targetCreated') { targets[m.params.targetInfo.type] = m.params.targetInfo.targetId; return; }
    if (m.method === 'Target.targetDestroyed') { for (const k in targets) if (targets[k] === m.params.targetId) delete targets[k]; return; }
    if (m.method === 'Target.dispatchMessageFromTarget') {
      const inner = JSON.parse(m.params.message);
      if (inner.id && pending.has(inner.id)) { const p = pending.get(inner.id); pending.delete(inner.id); inner.error ? p.rej(inner.error) : p.res(inner.result); }
      else listeners.forEach(l => l(inner, m.params.targetId));
    }
  };
  await sleep(800);
  if (!targets.page) throw new Error('no page target (phone locked / Safari backgrounded?)');
  const send = (method, params = {}, type = 'page', tmo = timeoutMs) => new Promise((res, rej) => {
    const targetId = targets[type] ?? targets.page;
    const iid = ++innerId;
    const timer = setTimeout(() => { pending.delete(iid); rej(new Error(`${method} timed out after ${tmo}ms`)); }, tmo);
    pending.set(iid, {res: v => { clearTimeout(timer); res(v); }, rej: e => { clearTimeout(timer); rej(e); }});
    ws.send(JSON.stringify({id: ++id, method: 'Target.sendMessageToTarget',
      params: {targetId, message: JSON.stringify({id: iid, method, params})}}));
  });
  const evaluate = async (expr, type = 'page', tmo) => {
    const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true}, type, tmo);
    if (r.wasThrown) throw new Error(JSON.stringify(r.result));
    return r.result.value;
  };
  return {ws, targets, send, evaluate, on: (fn) => listeners.push(fn), close: () => ws.close()};
}

// Find the Safari tab whose URL matches `match` and connect, retrying with backoff.
export async function openTab(match, {tries = 6, port = 9222} = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const pages = await (await fetch(`http://localhost:${port}/json`)).json();
      const p = pages.find(p => typeof match === 'function' ? match(p.url) : p.url.includes(match));
      if (!p) throw new Error(`no tab matching ${match}; tabs: ${pages.map(p => p.url).join(', ') || '(none)'}`);
      const c = await connect(p.webSocketDebuggerUrl);
      await c.evaluate('1', 'page', 8000);
      return c;
    } catch (e) { lastErr = e; console.error(`openTab try ${i + 1}: ${e.message || JSON.stringify(e)}`); await sleep(1000 * 2 ** i); }
  }
  throw new Error(`BLOCKED: cannot reach Safari tab (${lastErr?.message}). Unlock the iPhone and bring Safari to the foreground.`);
}

// Navigate the tab (Page.navigate is unavailable on iOS 26) and reconnect once the new URL is listed.
export async function navigate(c, url, match = url) {
  await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 50); 'ok'`);
  c.close();
  await sleep(2500);
  const c2 = await openTab(match);
  for (let i = 0; i < 60; i++) { if (await c2.evaluate('document.readyState') === 'complete') break; await sleep(500); }
  return c2;
}

// Run an async in-page expression that returns a Promise: stash the result on window, then poll.
export async function runAsync(c, expr, {pollMs = 2000, timeoutMs = 180000, key = '__iphRes'} = {}) {
  await c.evaluate(`window.${key} = undefined; Promise.resolve(${expr}).then(v => { window.${key} = JSON.stringify({ok: v}); }, e => { window.${key} = JSON.stringify({err: String(e && e.stack || e)}); }); 'started'`);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(pollMs);
    const v = await c.evaluate(`window.${key} || null`);
    if (v) { const o = JSON.parse(v); if (o.err) throw new Error(o.err); return o.ok; }
  }
  throw new Error('runAsync timed out');
}
