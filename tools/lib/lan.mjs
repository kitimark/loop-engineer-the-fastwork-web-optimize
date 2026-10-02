// This Mac's LAN address, resolved at run time (incident I-073; user T-026). The address changes when the Wi-Fi
// reconnects, so nobody types it: phone URLs name the placeholder host `lan` (or `lan-host`, the redacted form of
// lib/iphone-url.mjs lanSafeUrl), e.g. http://lan:5231/, and the tools that hand a URL to the phone (iphone.mjs open,
// safari-restart --url, the lease URL of lock.mjs acquire iphone --url, console.mjs post --url) substitute the
// current address before use. `node tools/lan.mjs` prints it. Never write the real address into a committed file
// (Hard rule 12): records keep the redacted form.
//
// One rule, shared with serve.mjs (which prints the same addresses as its LAN: / iPhone: lines):
//   lanInterfaces()  every non-internal IPv4 address with its interface name (serve.mjs: cert SANs, probe hosts)
//   isPhoneLan(a)    a private-range address (10/8, 172.16/12, 192.168/16) on a non-tunnel interface (not utun, tun,
//                    tap, ppp, wg): one the iPhone on the same Wi-Fi can reach
//   lanAddress()     the one to use: en0 first (the Mac's Wi-Fi), then by interface name (en1 < en2 < en10), then by
//                    address; FW_LAN_ADDRESS (an IPv4 literal) overrides it (tests, or a pinned address), and
//                    FW_LAN_IFACES (JSON in os.networkInterfaces() shape) stands in for the interfaces (tests)
import os from 'node:os';

/** Placeholder hosts a phone URL may name instead of the address (lower case). */
export const LAN_PLACEHOLDERS = ['lan', 'lan-host'];

/** [{name, address}] for every non-internal IPv4 address of `ifaces` (os.networkInterfaces() shape), in its order. */
export function lanInterfaces(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces || {}))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  return out;
}

/** Is {name, address} a private LAN address on a non-tunnel interface (what the iPhone can reach)? */
export function isPhoneLan(a) {
  return /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) && !/^(utun|tun|tap|ppp|wg)/.test(a.name);
}

const ifaceKey = (name) => { const m = /^(\D*)(\d*)$/.exec(name) || [name, name, '']; return [m[1], m[2] === '' ? -1 : Number(m[2])]; };
const ipKey = (ip) => ip.split('.').map(Number);
function cmpArr(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] === b[i]) continue; return a[i] < b[i] ? -1 : 1; } return 0; }

/** The phone-reachable candidates of `ifaces`, best first: en0, then by interface name (natural order), then address. */
export function lanCandidates(ifaces = os.networkInterfaces()) {
  return lanInterfaces(ifaces).filter(isPhoneLan).sort((x, y) =>
    (x.name === 'en0' ? 0 : 1) - (y.name === 'en0' ? 0 : 1) || cmpArr(ifaceKey(x.name), ifaceKey(y.name)) || cmpArr(ipKey(x.address), ipKey(y.address)));
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** {address, name, source: 'env'|'interface', candidates}; throws a clear Error when there is none. */
export function lanChoice({ ifaces, env = process.env } = {}) {
  const pinned = env.FW_LAN_ADDRESS;
  if (pinned != null && pinned !== '') {
    if (!IPV4.test(pinned)) throw new Error(`FW_LAN_ADDRESS must be an IPv4 address like 192.168.1.20 (got "${pinned}")`);
    return { address: pinned, name: null, source: 'env', candidates: [] };
  }
  let list = ifaces;
  if (list === undefined && env.FW_LAN_IFACES) { // tests: a JSON stand-in for os.networkInterfaces() (CLI and e2e)
    try { list = JSON.parse(env.FW_LAN_IFACES); } catch { throw new Error('FW_LAN_IFACES is not JSON (an os.networkInterfaces() stand-in)'); }
  }
  if (list === undefined) list = os.networkInterfaces();
  const candidates = lanCandidates(list);
  if (!candidates.length) {
    const names = [...new Set(lanInterfaces(list).map((a) => a.name))];
    throw new Error(`no LAN address: no private IPv4 address (10/8, 172.16/12, 192.168/16) on a non-tunnel interface${names.length ? ` (other interfaces up: ${names.join(', ')})` : ' (no network interface up)'}. Is the Wi-Fi on and connected to the iPhone's network?`);
  }
  return { ...candidates[0], source: 'interface', candidates };
}

/** The Mac's LAN address now (see the header); throws when there is none. */
export const lanAddress = (o) => lanChoice(o).address;

/** Is `hostname` a LAN placeholder (lan, lan-host)? */
export const isLanPlaceholder = (hostname) => LAN_PLACEHOLDERS.includes(String(hostname ?? '').toLowerCase());

/**
 * `url` with a placeholder host (http://lan:5231/, http://lan-host:5231/) replaced by the current LAN address; any
 * other URL (and a non-URL) comes back unchanged. Throws when the placeholder can't be resolved (no LAN address).
 * `address` (or `ifaces` / `env`) for the tests.
 */
export function resolveLanUrl(url, { address, ifaces, env } = {}) {
  if (typeof url !== 'string' || !url) return url;
  let u; try { u = new URL(url); } catch { return url; }
  if (!isLanPlaceholder(u.hostname)) return url;
  u.hostname = address ?? lanAddress({ ifaces, env });
  return u.href;
}

/** resolveLanUrl, but on failure the URL comes back unchanged (for warnings and comparisons, never for navigation). */
export function tryResolveLanUrl(url, o) {
  try { return resolveLanUrl(url, o); } catch { return url; }
}
