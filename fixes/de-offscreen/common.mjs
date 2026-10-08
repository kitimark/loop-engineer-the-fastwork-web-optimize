// de-offscreen (T-228 #87/#89): shared pieces of the Chrome and Simulator layer-owner probes. Diagnostic only, not tooling.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const G0 = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-afabe5bf71361298f/out/g0box';
// arms: v0 = the plain baseline; e = g0.0e; f = g0.0f (fix-g0-box's overlays, read only)
export const ARMS = {
  v0: { overlay: null, js: '4606120cf392', css: '27776f3d4138' },
  e: { overlay: join(G0, 'g00e'), js: '5c39f7a96e41', css: 'd4e684032482' },
  f: { overlay: join(G0, 'snap4/V'), js: '30fd80ccbb3f', css: '1d1e5d62a2c4' },
};
export const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
export const sha12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start serve.mjs for an arm on a free port (plain http, --vendors=local, --latency 150, as P-167's servers). */
export async function serveArm(arm, stateFile, owner = 'de-offscreen') {
  const a = ARMS[arm];
  rmSync(stateFile, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', 'site-pretty', ...(a.overlay ? ['--overlay', a.overlay] : []),
    '--port', '0', '--quiet', '--state', stateFile, '--vendors=local', '--latency', '150', '--owner', owner, '--doing', `de-offscreen layer census ${arm}`];
  const p = spawn(process.execPath, args, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(stateFile)) try { s = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(`server ${arm} did not start`); }
  return { proc: p, port: s.port, url: `http://localhost:${s.port}/` };
}

/** Served bytes check: fetch both pinned files from the arm's server, compare against ARMS. */
export async function checkServed(arm, port) {
  const js = sha12(Buffer.from(await (await fetch(`http://localhost:${port}/${NODE}`)).arrayBuffer()));
  const css = sha12(Buffer.from(await (await fetch(`http://localhost:${port}/${CSSF}`)).arrayBuffer()));
  return { js, css, ok: js === ARMS[arm].js && css === ARMS[arm].css };
}

// Runs in the page with `this` = the layer's owner node (Runtime.callFunctionOn). Engine-neutral (Chrome and WebKit).
// Returns selector, a short ancestor path, the viewport rect, the compositing-relevant computed style, and the
// animations on the element itself and in its subtree (CSS animations/transitions and WAAPI, with their timeline kind).
export const OWNER_INFO_FN = `function () {
  const el = this && this.nodeType === 1 ? this : (this && this.parentElement) || null;
  if (!el) return { sel: this && this.nodeName || '?', none: true };
  const cls = (e) => { const c = e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className; return String(c || '').split(/\\s+/).filter((x) => x && !/^svelte-/.test(x)).slice(0, 3); };
  const one = (e) => e.localName + (e.id ? '#' + e.id : '') + cls(e).map((c) => '.' + c).join('');
  const path = []; for (let p = el.parentElement, i = 0; p && i < 3 && p !== document.body; p = p.parentElement, i++) path.unshift(one(p));
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const pick = ['will-change', 'transform', 'opacity', 'filter', 'backdrop-filter', '-webkit-backdrop-filter', 'position', 'contain', 'content-visibility', 'animation-name', 'animation-timeline', 'isolation', 'mix-blend-mode', 'clip-path', 'mask-image', '-webkit-mask-image', 'overflow', 'z-index', 'visibility', 'display', 'translate', 'scale', 'rotate'];
  const style = {}; for (const k of pick) { const v = cs.getPropertyValue(k); if (v && !['none', 'auto', 'normal', 'visible', 'static', '1', '0', ''].includes(v.trim())) style[k] = v.trim().slice(0, 60); }
  const tl = (a) => { const t = a.timeline; if (!t) return 'none'; if (t === document.timeline) return 'doc'; const n = t.constructor && t.constructor.name; return n || 'other'; };
  const desc = (a) => { const e = a.effect; let props = ''; try { props = [...new Set((e.getKeyframes() || []).flatMap((f) => Object.keys(f).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))].join('+'); } catch (x) {}
    let it = null; try { it = e.getComputedTiming().iterations; } catch (x) {}
    const t = e && e.target; return { kind: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '', props, state: a.playState, timeline: tl(a), inf: it === Infinity, target: t ? one(t) + (e.pseudoElement ? e.pseudoElement : '') : '?' }; };
  let own = [], sub = [];
  try { own = el.getAnimations().map(desc); } catch (x) {}
  try { sub = el.getAnimations({ subtree: true }).filter((a) => a.effect && a.effect.target !== el).map(desc); } catch (x) {}
  const run = (xs) => xs.filter((a) => a.state === 'running');
  const data = {}; for (const k of ['fwWc', 'startSellingRender', 'fwMnt']) if (el.dataset && el.dataset[k] !== undefined) data[k] = el.dataset[k];
  // what the user can see of it: the rect clipped by every ancestor that clips (overflow / clip-path / contain paint),
  // and the first ancestor (or self) that hides it (opacity 0, visibility hidden, content-visibility hidden)
  let cx0 = r.left, cy0 = r.top, cx1 = r.right, cy1 = r.bottom, hidden = null;
  for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
    const s = p === el ? cs : getComputedStyle(p);
    if (!hidden && (s.opacity === '0' || s.visibility === 'hidden' || s.contentVisibility === 'hidden' || s.display === 'none')) hidden = one(p) + ' ' + (s.opacity === '0' ? 'opacity:0' : s.visibility === 'hidden' ? 'visibility:hidden' : s.display === 'none' ? 'display:none' : 'cv:hidden');
    if (p !== el && (s.overflowX !== 'visible' || s.overflowY !== 'visible' || (s.clipPath && s.clipPath !== 'none') || /paint|strict|content/.test(s.contain || ''))) {
      const q = p.getBoundingClientRect(); cx0 = Math.max(cx0, q.left); cy0 = Math.max(cy0, q.top); cx1 = Math.min(cx1, q.right); cy1 = Math.min(cy1, q.bottom);
    }
  }
  const clipped = [cx0, cy0, Math.max(0, cx1 - cx0), Math.max(0, cy1 - cy0)].map((v) => Math.round(v));
  return { sel: one(el), path: path.join(' > '), tag: el.localName, rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v)), clipped, hidden, style, data,
    own: own.slice(0, 6), ownRunning: run(own).length, sub: run(sub).slice(0, 6), subRunning: run(sub).length, subAll: sub.length,
    connected: el.isConnected, vis: typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true, opacityProperty: false }) : null };
}`;

/** Viewport relation of a box {x,y,w,h} (viewport CSS px) to the viewport vw x vh: on / partial / off, and the gap. */
export function relate(b, vw, vh) {
  if (!b || !(b.w > 0) || !(b.h > 0)) return { where: 'empty', gap: null, frac: 0 };
  const ix = Math.max(0, Math.min(b.x + b.w, vw) - Math.max(b.x, 0)), iy = Math.max(0, Math.min(b.y + b.h, vh) - Math.max(b.y, 0));
  const frac = (ix * iy) / (b.w * b.h);
  if (frac >= 0.999) return { where: 'on', gap: 0, frac: 1 };
  if (frac > 0) return { where: 'partial', gap: 0, frac: Math.round(frac * 1000) / 1000 };
  const gy = b.y >= vh ? b.y - vh : b.y + b.h <= 0 ? -(b.y + b.h) : 0, gx = b.x >= vw ? b.x - vw : b.x + b.w <= 0 ? -(b.x + b.w) : 0;
  const dir = gy ? (b.y >= vh ? 'below' : 'above') : gx ? (b.x >= vw ? 'right' : 'left') : '?';
  return { where: 'off', gap: Math.round(Math.max(gx, gy)), dir, frac: 0 };
}
