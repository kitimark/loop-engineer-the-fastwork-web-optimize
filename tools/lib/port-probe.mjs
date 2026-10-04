// Is a TCP port taken on this Mac? Moved from tools/serve.mjs (T-106) so the Try-it host (lib/tryit.mjs) picks ports by
// the same rule. A port counts as free only when nothing listens on it at ANY local address (I-065): Node sets
// SO_REUSEADDR, and on macOS a listen on 0.0.0.0:p succeeds beside another process's 127.0.0.1:p, after which
// "localhost" reaches that process, not this server. The LAN addresses too (the iPhone reaches the server by one).
import net from 'node:net';
import { lanInterfaces } from './lan.mjs';

/** The hosts a port is probed on: loopback, the wildcards, and every LAN address. */
export const probeHosts = () => ['127.0.0.1', '0.0.0.0', '::1', '::', ...lanInterfaces().map((a) => a.address)];

/** Resolves the first host where `port` is in use (EADDRINUSE), or null when it is free everywhere. */
export function portBusy(port, hosts = probeHosts()) {
  return hosts.reduce((prev, host) => prev.then((busy) => busy || new Promise((done) => {
    const probe = net.createServer();
    probe.once('error', (e) => done(e.code === 'EADDRINUSE' ? host : null)); // others (no IPv6 here, EACCES): the real listen reports them
    probe.listen({ port, host, exclusive: true }, () => probe.close(() => done(null)));
  })), Promise.resolve(null));
}
