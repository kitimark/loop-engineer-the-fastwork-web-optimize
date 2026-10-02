// Which URL can iOS Safari actually open, and did it land there? (incident I-003)
// The mirror's --https uses an auto-created self-signed certificate; iOS Safari stops at its
// "This Connection Is Not Private" page for it on every new port, and nothing over the WebKit proxy
// can click through. serve.mjs --https therefore also serves the same files over plain http on a
// "twin" port (reported as `httpTwin` in /__mirror/info); tools/iphone.mjs `open` switches a
// self-signed https mirror URL to that twin, and after navigating checks that Safari really shows
// the mirror page (not the warning page) before anyone measures it.
import http from 'node:http';
import https from 'node:https';

/** GET <origin>/__mirror/info (self-signed certs accepted). The JSON, or null: not a mirror / unreachable. */
export function mirrorInfo(url, { timeoutMs = 3000 } = {}) {
  return new Promise((res) => {
    let u;
    try { u = new URL('/__mirror/info', url); } catch { return res(null); }
    if (!/^https?:$/.test(u.protocol)) return res(null);
    const req = (u.protocol === 'https:' ? https : http).get(u, { rejectUnauthorized: false, agent: false, timeout: timeoutMs }, (r) => {
      let body = '';
      r.setEncoding('utf8');
      r.on('data', (d) => (body += d));
      r.on('end', () => { try { const j = JSON.parse(body); res(r.statusCode === 200 && j && typeof j === 'object' && 'vendors' in j ? j : null); } catch { res(null); } });
      r.on('error', () => res(null));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => res(null));
  });
}

/** `url` with protocol http: and the given port (path and query kept). */
export function twinUrl(url, port) {
  const u = new URL(url);
  u.protocol = 'http:';
  u.port = String(port);
  return u.href;
}

const selfSignedMirror = (url, info) => new URL(url).protocol === 'https:' && !!info?.selfSigned;
function httpAdvice(url, info) {
  return info?.httpTwin ? `open its plain-http twin ${twinUrl(url, info.httpTwin)}`
    : 'serve it without --https (serve.mjs, or fix.mjs serve <topic> -- --vendors=local --latency 150) and open the http:// URL';
}

/**
 * Where to point Safari for `url`, given its /__mirror/info (null: not a mirror). A self-signed https
 * mirror URL becomes its plain-http twin ({url, note}); without a twin it is refused (throws), since
 * Safari would only show the certificate warning. `keepHttps` (a phone that trusts the cert) opts out.
 */
export function iphoneTarget(url, info, { keepHttps = false } = {}) {
  if (keepHttps || !selfSignedMirror(url, info)) return { url, note: null };
  if (info.httpTwin) {
    const t = twinUrl(url, info.httpTwin);
    return { url: t, note: `${url} uses the mirror's self-signed certificate, which stops iOS Safari at its certificate warning page (incident I-003); opening the server's plain-http twin ${t} instead (same files; --keep-https forces https)` };
  }
  throw new Error(`refusing to open ${url} on the iPhone: it uses the mirror's self-signed certificate, so iOS Safari would stop at its certificate warning page (incident I-003), and this server has no plain-http twin (--no-http-twin, or started before serve.mjs had one). Restart it, or ${httpAdvice(url, null)}. --keep-https forces https.`);
}

/** Runs in Safari after navigating: where it is, its title, and whether same-origin /__mirror/info answers. */
export const LANDED_JS = `(() => { let mirror = 0; try { const x = new XMLHttpRequest(); x.open('GET', '/__mirror/info', false); x.send(); mirror = x.status; } catch (e) {} return {href: location.href, title: document.title, mirror}; })()`;

export const CERT_WARNING_TITLE = /connection (is not|isn.t) private|not a private connection|certificate (is )?(not valid|invalid)|invalid certificate/i;

/**
 * Did Safari land on `target`? `landed` is LANDED_JS's result, `info` the target's /__mirror/info
 * (null: not a mirror, then only a certificate-warning title counts). Returns an error message or null.
 */
export function landedProblem(landed, target, info) {
  const title = landed?.title ?? '';
  let origin = null;
  try { origin = new URL(landed?.href).origin; } catch {}
  const warning = CERT_WARNING_TITLE.test(title);
  const wrong = warning || (info && (origin !== new URL(target).origin || landed?.mirror !== 200));
  if (!wrong) return null;
  const why = warning || new URL(target).protocol === 'https:'
    ? `This is Safari's certificate warning page, not the mirror (self-signed https, incident I-003): ${httpAdvice(target, info)}.`
    : 'Check that the server is running and reachable from the iPhone (same Wi-Fi, LAN URL, not localhost).';
  return `Safari did not load ${target}: it shows "${title}" at ${landed?.href}${info ? ` (same-origin /__mirror/info: ${landed?.mirror || 'failed'})` : ''}. ${why}`;
}

/** A URL with a LAN host (private / link-local / CGNAT IPv4, private / link-local IPv6, *.local or a dotless
 *  name) gets the placeholder host `lan-host`; scheme, port, path and query stay. Loopback and public hosts stay.
 *  Run, scroll and record files are committed under research/ (Hard rule 12: no LAN addresses; review-t1a B4). */
export const LAN_HOST = 'lan-host';
/** Is `hostname` (a URL's; IPv6 with or without brackets) a LAN host in lanSafeUrl's sense? Loopback is not. */
export function isLanHost(hostname) {
  const h = String(hostname ?? '').replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  return v4 ? (+v4[1] === 10 || (+v4[1] === 172 && +v4[2] >= 16 && +v4[2] <= 31) || (+v4[1] === 192 && +v4[2] === 168) || (+v4[1] === 169 && +v4[2] === 254) || (+v4[1] === 100 && +v4[2] >= 64 && +v4[2] <= 127))
    : h.includes(':') ? /^(fc|fd|fe[89ab])/.test(h)
    : h.endsWith('.local') || (!h.includes('.') && h !== 'localhost');
}
/** Loopback: localhost (and *.localhost), 127.0.0.0/8, ::1. */
export function isLoopbackHost(hostname) {
  const h = String(hostname ?? '').replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(h) || h === '::1';
}
export function lanSafeUrl(u) {
  if (typeof u !== 'string' || !u) return u;
  let x; try { x = new URL(u); } catch { return u; }
  if (!isLanHost(x.hostname)) return u;
  x.hostname = LAN_HOST;
  return x.href;
}
/** Free text with every URL through lanSafeUrl and every bare LAN host, a private / link-local / CGNAT IPv4 literal or
 *  a *.local name (a host:port tab matcher; also one inside a public URL's path or query), as lan-host. For error text
 *  that may be saved or printed: pickTab's messages, gesture-run's scrub (Hard rule 12; review-t1a N1).
 *  Bare dotless names and bare IPv6 literals stay. */
export function lanSafeText(t) {
  if (typeof t !== 'string' || !t) return t;
  return t
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`\\]+/gi, (u) => {
      const tail = (u.match(/[),.;:\]]+$/) || [''])[0];
      const core = tail ? u.slice(0, -tail.length) : u;
      return lanSafeUrl(core) + tail;
    })
    .replace(/(?<![\w.-])(\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local)(?![\w-]|\.\w)/gi,
      (h) => (lanSafeUrl(`http://${h}/`) === `http://${LAN_HOST}/` ? LAN_HOST : h));
}
/** A scroll / record result with its top-level href through lanSafeUrl (tools/iphone.mjs writes both through it). */
export function lanSafeRecord(res) {
  return res && typeof res === 'object' && 'href' in res ? { ...res, href: lanSafeUrl(res.href) } : res;
}
