// One GET of a file from a local mirror server, for fix.mjs ab's served-file check (which file each server
// serves, by hash). ts-lock-bundle (d): under host load a request to the fixture server sometimes got no answer
// within the 20 s socket timeout (tests/e2e/baseline-snapshot.test.mjs, 'timeout …/2.fixture.js') and failed the
// whole A/B before it measured anything. The cause is not reproduced (it needs the loaded host), so a failure now
// names how far the request got (the address it connected to, TLS, response headers, bytes) for the next report,
// and a transport failure (timeout, reset, refused) is retried on a fresh connection (agent: false, no reused
// keep-alive socket), up to `attempts` tries, each retry logged. What the check compares does not change: any HTTP
// answer (any status) is returned as is, never retried, and the caller still hashes the body and checks status
// and source.
import http from 'node:http';
import https from 'node:https';

function once(url, timeoutMs) {
  return new Promise((res, rej) => {
    const mod = url.startsWith('https:') ? https : http;
    const st = { addr: null, tls: false, headers: false, bytes: 0 };
    const phase = () => `${st.addr ? `connected to ${st.addr}` : 'not connected'}${url.startsWith('https:') ? `, TLS ${st.tls ? 'done' : 'not done'}` : ''}, ${st.headers ? `headers received, ${st.bytes} body bytes` : 'no response headers'}`;
    const req = mod.get(url, { agent: false, rejectUnauthorized: false, headers: { 'accept-encoding': 'identity' } }, (r) => {
      st.headers = true;
      const chunks = [];
      r.on('data', (c) => { st.bytes += c.length; chunks.push(c); });
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
      r.on('error', (e) => rej(Object.assign(e, { message: `${e.message} (${phase()})` })));
    });
    req.on('socket', (s) => {
      s.once('connect', () => { st.addr = `${s.remoteAddress}:${s.remotePort}`; });
      s.once('secureConnect', () => { st.tls = true; });
    });
    req.on('error', (e) => rej(Object.assign(e, { message: `${e.message || e.code} (${phase()})` })));
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${url}`)));
  });
}

/**
 * GET `url` (http or https, self-signed accepted, no compression): {status, headers, body}. A transport error or
 * a socket idle past `timeoutMs` is retried on a new connection, up to `attempts` tries in all; the last error
 * is thrown with the number of tries. Every error message says how far that try got. `log(line)` hears each retry.
 */
export async function servedGet(url, { timeoutMs = 20000, attempts = 3, log = (s) => console.error(s) } = {}) {
  let err;
  for (let i = 1; i <= attempts; i++) {
    try { return await once(url, timeoutMs); } catch (e) {
      err = e;
      if (i < attempts) log(`[served-file check] ${e.message}: retry ${i + 1}/${attempts} on a new connection`);
    }
  }
  err.message = `${err.message} [${attempts} tries]`;
  throw err;
}
