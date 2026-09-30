// Minimal WebKit Inspector Protocol client via ios_webkit_debug_proxy.
// iOS 26 exposes a "page" target and "frame" target(s); commands are routed via Target.sendMessageToTarget.
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0, innerId = 0;
  const targets = {}, pending = new Map(), listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Target.targetCreated') { targets[m.params.targetInfo.type] ??= m.params.targetInfo.targetId; return; }
    if (m.method === 'Target.dispatchMessageFromTarget') {
      const inner = JSON.parse(m.params.message);
      if (inner.id && pending.has(inner.id)) { const p = pending.get(inner.id); pending.delete(inner.id); inner.error ? p.rej(inner.error) : p.res(inner.result); }
      else listeners.forEach(l => l(inner, m.params.targetId));
    }
  };
  await new Promise(r => setTimeout(r, 800));
  const send = (method, params = {}, type = 'frame') => new Promise((res, rej) => {
    const targetId = targets[type] ?? targets.page;
    const iid = ++innerId;
    pending.set(iid, {res, rej});
    ws.send(JSON.stringify({id: ++id, method: 'Target.sendMessageToTarget',
      params: {targetId, message: JSON.stringify({id: iid, method, params})}}));
  });
  const evaluate = async (expr, type = 'frame') => {
    const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true}, type);
    if (r.wasThrown) throw new Error(JSON.stringify(r.result));
    return r.result.value;
  };
  return {ws, targets, send, evaluate, on: (fn) => listeners.push(fn), close: () => ws.close()};
}
