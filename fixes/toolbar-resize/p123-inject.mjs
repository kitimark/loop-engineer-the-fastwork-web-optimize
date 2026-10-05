// toolbar-resize P-123 (D's S5: which viewport-dependent value or read inside the showcase changes on a toolbar step).
// COUNT-ONLY in-page probe, applied by `sim.mjs gesture --count-only --inject` after every page load. No arm, no rule:
// it only reads. No time value is recorded (frame indices and counts only).
//   1. audit (static, at install): the CSS rules that match the box (showcase + its 315 descendants) or its ancestors and
//      whose declarations use a viewport unit (vh/vw/vi/vb/vmin/vmax with s/l/d prefixes) or env(); inline styles with
//      them; custom properties whose value holds one; running animations whose keyframes hold one. WebKit re-resolves the
//      style of every element whose style "usesViewportUnits" when the viewport size changes (StyleScope.cpp,
//      Scope::didChangeViewportSize, WebKit/WebKit main 00a0acf5, lines 760-807), whatever the unit and whether the value
//      changes: this set is the box's share of that invalidation.
//   2. values (dynamic): full computed-style snapshots of the same elements at A (load, ih0), A2 (ih0 again >= 30 frames
//      later, before any step: the no-step noise control), B (first new innerHeight >= ih0+20 held 3 frames), C (back at
//      ih0, 3 frames), B2 (high again, 3 frames). A property "flips with the toolbar" when A == A2 == C, B == B2, A != B.
//   3. writes (dynamic): MutationObserver records (attributes incl. style diffs, childList) on the box or its ancestors,
//      split by whether innerHeight had changed since the previous rAF ("step") or not.
//   4. sizes (dynamic): ResizeObserver entries on the box, its element children and its two nearest ancestors, split
//      the same way.
// read() returns the audit, the diff (computed in the page), the write and size tallies, and the frame counts.
export const name = 'p123';
export const install = () => `(() => { try {
  if (window.__p123) return 'again';
  const SEL = '#people .start-selling-future-card > .start-selling-future-showcase';
  const sc = document.querySelector(SEL);
  if (!sc) { window.__p123 = { error: 'no showcase' }; return 'no showcase'; }
  const VU = /(?:\\d|\\.)(?:[sld]?v(?:h|w|i|b|min|max))(?![a-z-])|env\\(/;
  const box = [sc, ...sc.querySelectorAll('*')];
  const anc = []; for (let p = sc.parentElement; p; p = p.parentElement) anc.push(p);
  const els = box.concat(anc);
  const lab = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const idx = new Map(els.map((e, i) => [e, i]));
  const where = (el) => (el === sc ? 'box' : sc.contains(el) ? 'in' : el.contains(sc) ? 'anc' : 'out');
  const key = (el) => (idx.has(el) ? idx.get(el) + ':' : '') + lab(el);
  // 1. audit
  const rules = [], customVU = new Set(), skipped = [];
  const walk = (list, cond) => {
    for (const r of list) {
      if (r.type === 1) {
        const decl = []; for (let i = 0; i < r.style.length; i++) { const p = r.style[i], v = r.style.getPropertyValue(p); if (VU.test(v)) { decl.push(p + ':' + v.slice(0, 60)); if (p.startsWith('--')) customVU.add(p); } }
        if (decl.length) rules.push({ sel: r.selectorText, cond, decl });
      } else if (r.cssRules) {
        const c = r.media ? r.media.mediaText : r.conditionText !== undefined ? r.conditionText : r.type === 7 ? 'keyframes' : '';
        if (r.type === 7) continue;
        let on = true; if (r.media) { try { on = matchMedia(r.media.mediaText).matches; } catch { on = true; } }
        if (on) walk(r.cssRules, cond ? cond + ' & ' + c : c);
      }
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules, ''); } catch (e) { skipped.push(String(s.href).slice(-40)); } }
  const hits = [];
  for (const r of rules) {
    for (const part of r.sel.split(',')) {
      const pseudo = /::?(before|after|marker|placeholder|selection|first-line|first-letter|backdrop)/.test(part);
      const base = part.replace(/::?(before|after|marker|placeholder|selection|first-line|first-letter|backdrop)\\b/g, '').trim() || '*';
      let m = []; try { m = els.filter((e) => e.matches(base)); } catch { continue; }
      for (const e of m) hits.push({ el: key(e), where: where(e), sel: part.trim().slice(0, 120), cond: r.cond.slice(0, 80), pseudo, decl: r.decl.slice(0, 6) });
    }
  }
  const inline = els.filter((e) => VU.test(e.getAttribute('style') || '')).map((e) => ({ el: key(e), where: where(e), style: e.getAttribute('style').slice(0, 160) }));
  const custom = [];
  for (const e of els) { const cs = getComputedStyle(e); for (const p of customVU) { const v = cs.getPropertyValue(p); if (v && VU.test(v)) custom.push({ el: key(e), where: where(e), prop: p, v: v.trim().slice(0, 60) }); } }
  const anims = [];
  try { for (const a of sc.getAnimations({ subtree: true }).concat(anc.flatMap((e) => e.getAnimations()))) { const kf = JSON.stringify(a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : []); anims.push({ el: a.effect && a.effect.target ? key(a.effect.target) : '?', name: a.animationName || a.transitionProperty || a.id || a.constructor.name, vu: VU.test(kf) }); } } catch {}
  const qc = []; for (const e of els) { const c = getComputedStyle(e); const ct = c.containerType || c.getPropertyValue('container-type'), an = c.getPropertyValue('anchor-name'), pa = c.getPropertyValue('position-anchor'); if ((ct && ct !== 'normal') || (an && an !== 'none') || (pa && pa !== 'auto' && pa !== '')) qc.push({ el: key(e), where: where(e), ct, an: an || null, pa: pa || null }); }
  const vuEls = new Set(hits.filter((h) => !h.pseudo).map((h) => h.el).concat(inline.map((h) => h.el))); // custom properties alone are not counted (reported apart)
  const audit = { nBox: box.length, nAnc: anc.length, nRulesVU: rules.length, skipped, hits: hits.slice(0, 80), nHits: hits.length, inline, custom: custom.slice(0, 40), nCustom: custom.length, anims: anims.slice(0, 30), nAnims: anims.length, qc: qc.slice(0, 30), nQc: qc.length,
    nVuBox: [...vuEls].filter((k) => { const e = els[Number(k.split(':')[0])]; return e && where(e) !== 'anc'; }).length, nVuAnc: [...vuEls].filter((k) => { const e = els[Number(k.split(':')[0])]; return e && where(e) === 'anc'; }).length };
  // 2. snapshots
  const names = []; { const cs0 = getComputedStyle(sc); for (let i = 0; i < cs0.length; i++) names.push(cs0[i]); for (const p of customVU) if (!names.includes(p)) names.push(p); }
  const snap = (tag) => { const vals = els.map((e) => { const cs = getComputedStyle(e); return names.map((p) => cs.getPropertyValue(p)); }); const r = sc.getBoundingClientRect(); return { tag, ih: innerHeight, sy: Math.round(scrollY), top: Math.round(r.top), bottom: Math.round(r.bottom), f: st.f, vals }; };
  const st = { f: 0, ih: innerHeight, ih0: innerHeight, ihMin: innerHeight, ihMax: innerHeight, stable: 0, steps: 0, stepF: -1, snaps: {} };
  st.snaps.A = snap('A');
  // 3. writes
  const mo = new Map(), bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const isStep = () => innerHeight !== st.ih || st.stepF === st.f;
  const parseStyle = (s) => { const o = {}; for (const d of (s || '').split(';')) { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); } return o; };
  new MutationObserver((recs) => {
    const s = isStep() ? 'step' : 'rest';
    for (const r of recs) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement; if (!t) continue;
      const w = where(t); if (w === 'out') continue;
      if (r.type === 'attributes' && r.attributeName === 'style') {
        const a = parseStyle(r.oldValue), b = parseStyle(t.getAttribute('style'));
        const ch = [...new Set(Object.keys(a).concat(Object.keys(b)))].filter((p) => a[p] !== b[p]);
        for (const p of ch.length ? ch : ['(same)']) bump(mo, s + '|' + w + '|' + key(t) + '|style:' + p);
      } else bump(mo, s + '|' + w + '|' + key(t) + '|' + r.type + (r.attributeName ? ':' + r.attributeName + (r.attributeName === 'class' ? '=' + (r.oldValue || '').slice(0, 40) + '>' + (t.getAttribute('class') || '').slice(0, 40) : '') : ''));
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, childList: true });
  // 4. sizes
  const ro = new Map();
  const roEls = [sc, ...sc.children, anc[0], anc[1]].filter(Boolean);
  const last = new Map();
  const rob = new ResizeObserver((es) => { const s = isStep() ? 'step' : 'rest'; for (const e of es) { const h = Math.round(e.contentRect.height * 10) / 10, p = last.get(e.target); last.set(e.target, h); if (p === undefined) continue; bump(ro, s + '|' + where(e.target) + '|' + key(e.target) + '|' + (h > p ? 'grow' : h < p ? 'shrink' : 'same')); } });
  for (const e of roEls) rob.observe(e);
  const tick = () => { try {
    st.f++;
    const ih = innerHeight;
    if (ih !== st.ih) { st.steps++; st.stepF = st.f; st.stable = 0; st.ih = ih; st.ihMin = Math.min(st.ihMin, ih); st.ihMax = Math.max(st.ihMax, ih); } else st.stable++;
    const S = st.snaps;
    if (st.stable >= 3) {
      const hi = ih >= st.ih0 + 20, lo = ih === st.ih0;
      if (lo && !S.A2 && !S.B && st.f >= 30 && st.steps === 0) S.A2 = snap('A2');
      else if (hi && !S.B) S.B = snap('B');
      else if (lo && S.B && !S.C) S.C = snap('C');
      else if (hi && S.C && !S.B2) S.B2 = snap('B2');
    }
  } catch (e) { st.err = String(e).slice(0, 200); }
    if (st.f < 200000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__p123 = { sel: SEL, audit, names, els: els.map(key), st, mo, ro };
  return 'ok';
  } catch (e) { window.__p123 = { error: String((e && e.stack) || e).slice(0, 400) }; return 'error'; }
})()`;
export const read = () => `(() => {
  const P = window.__p123; if (!P || P.error) return JSON.stringify(P || { error: 'not installed' });
  const S = P.st.snaps, order = ['A', 'A2', 'B', 'C', 'B2'];
  const diffs = []; let nAny = 0;
  if (S.A && S.B) {
    for (let e = 0; e < P.els.length; e++) for (let p = 0; p < P.names.length; p++) {
      const v = order.map((k) => (S[k] ? S[k].vals[e][p] : null));
      const [a, a2, b, c, b2] = v;
      if (a === b && (c === null || c === a) && (b2 === null || b2 === b) && (a2 === null || a2 === a)) continue;
      nAny++;
      const noise = a2 !== null && a2 !== a;
      const flip = !noise && a !== b && c !== null && c === a && b2 !== null && b2 === b;
      const flipPartial = !noise && a !== b && (c === null || c === a) && (b2 === null || b2 === b) && !flip;
      if (diffs.length < 400) diffs.push({ el: P.els[e], prop: P.names[p], v: v.map((x) => (x === null ? null : String(x).slice(0, 70))), flip, flipPartial, noise });
    }
  }
  const tally = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 60);
  const snapMeta = Object.fromEntries(order.filter((k) => S[k]).map((k) => [k, { ih: S[k].ih, sy: S[k].sy, top: S[k].top, bottom: S[k].bottom, f: S[k].f }]));
  const sum = (m, pre) => [...m.entries()].filter(([k]) => k.startsWith(pre)).reduce((s, [, n]) => s + n, 0);
  return JSON.stringify({ sel: P.sel, audit: P.audit, nNames: P.names.length, frames: { err: P.st.err || null, f: P.st.f, steps: P.st.steps, ih0: P.st.ih0, ihMin: P.st.ihMin, ihMax: P.st.ihMax }, snaps: snapMeta,
    diff: { nAny, nFlip: diffs.filter((d) => d.flip).length, nFlipPartial: diffs.filter((d) => d.flipPartial).length, nNoise: diffs.filter((d) => d.noise).length, truncated: nAny > diffs.length, list: diffs },
    mo: { stepBoxIn: sum(P.mo, 'step|box') + sum(P.mo, 'step|in'), stepAnc: sum(P.mo, 'step|anc'), restBoxIn: sum(P.mo, 'rest|box') + sum(P.mo, 'rest|in'), restAnc: sum(P.mo, 'rest|anc'), top: tally(P.mo) },
    ro: { step: sum(P.ro, 'step'), rest: sum(P.ro, 'rest'), top: tally(P.ro) } });
})()`;
