// Vercel Routing Middleware: one shared password (HTTP Basic Auth) in front of every path of the private demo.
//
// Env vars (Vercel project > Settings > Environment Variables; mark both Sensitive):
//   DEMO_PASS_SALT    random hex printed by hash-password.mjs
//   DEMO_PASS_SHA256  hex SHA-256 of UTF-8(DEMO_PASS_SALT + "\n" + password), printed by hash-password.mjs
// Neither the password nor its hash is in the code; there is no database and no session store.
//
// Why Basic Auth and not a login form + cookie: the browser sends the credentials itself with every same-origin
// request (page, JS chunks, CSS, fonts, images, fetches), so one stateless check per request covers the whole site.
// A cookie would need its own signed token (a second secret, expiry, a login page and a logout route); Basic Auth
// needs none of that. The username is ignored: any name works, only the password is checked.
//
// Fails closed: with a missing or malformed env var every request gets 503, never the site.
export const config = { matcher: ['/', '/:path*'] };

declare const process: { env: Record<string, string | undefined> }; // provided by the runtime (Vercel, Node)

const REALM = 'Private demo';
const NOINDEX = 'noindex, nofollow';

function deny(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body + '\n', {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': NOINDEX, ...extra },
  });
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Constant time over the fixed 32-byte digest length: no early exit, the loop always runs 32 times.
function equal32(a: Uint8Array, b: Uint8Array): boolean {
  let diff = (a.length ^ 32) | (b.length ^ 32);
  for (let i = 0; i < 32; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// The submitted password from "Authorization: Basic base64(user:password)", or null.
function passwordFrom(header: string | null): string | null {
  const m = header && /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header);
  if (!m) return null;
  let bin: string;
  try { bin = atob(m[1]); } catch { return null; }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  const i = text.indexOf(':');
  return i < 0 ? null : text.slice(i + 1);
}

export async function sha256Hex(salt: string, password: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '\n' + password));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(request: Request): Promise<Response> {
  const salt = process.env.DEMO_PASS_SALT || '';
  const expected = hexToBytes((process.env.DEMO_PASS_SHA256 || '').trim());
  if (!expected || salt.length < 16) return deny(503, 'Not configured.');

  const password = passwordFrom(request.headers.get('authorization'));
  if (password !== null && password.length <= 1024) {
    const got = hexToBytes(await sha256Hex(salt, password));
    if (got && equal32(got, expected)) {
      // Continue to the static file. This is what next() from @vercel/functions returns.
      return new Response(null, { headers: { 'x-middleware-next': '1' } });
    }
  }
  return deny(401, 'Authentication required.', { 'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"` });
}
