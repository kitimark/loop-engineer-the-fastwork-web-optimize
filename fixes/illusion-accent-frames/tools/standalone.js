// de-illusion-style stall probe (d), see standalone.html
(async () => {
  const q = new URLSearchParams(location.search), MODE = q.get('mode') || 'one', base = q.get('base') || '/_app/immutable/assets/accent-frames/';
  const S = (window.__sa = { raf: 0, gaps: [], wins: [], origin: performance.timeOrigin, mode: MODE, ready: false, err: null });
  let lt = 0;
  const loop = (ts) => { S.raf++; if (lt && ts - lt > 50 && S.gaps.length < 80) S.gaps.push([Math.round(ts), Math.round(ts - lt)]); lt = ts; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  addEventListener('error', (e) => (S.err = String(e.message)));
  addEventListener('unhandledrejection', (e) => (S.err = String(e.reason)));
  const man = await (await fetch(base + 'manifest.json')).json();
  const im = new Image(); im.src = base + man.words[0].src; await im.decode();
  const img = q.get('src') === 'img' ? im : await createImageBitmap(im);
  const cv = document.getElementById('cv'), W = man.canvas.w + 3, H = man.canvas.h + 3;
  cv.width = W; cv.height = H; cv.style.width = W / 3 + 'px'; cv.style.height = H / 3 + 'px';
  const ctx = cv.getContext('2d', { willReadFrequently: q.get('wrf') !== '0' });
  ctx.imageSmoothingEnabled = false;
  S.ready = true;
  const run = () => {
    const c = man.words[0][S.wins.length % 2 ? 'in' : 'out'], w = { at: Math.round(performance.now()), ticks: 0, k: 0 };
    S.wins.push(w); ctx.clearRect(0, 0, W, H);
    const t0 = document.timeline.currentTime;
    let k0 = -1;
    const tick = () => {
      const el = document.timeline.currentTime - t0;
      w.ticks++;
      const k = Math.min(man.n, Math.round(el));
      if (MODE === 'patches') {
        for (let j = k0 + 1; j <= k; j++) for (const p of c.f[j] || []) { ctx.clearRect(c.ox + p[0], c.oy + p[1], p[2], p[3]); ctx.drawImage(img, p[4], p[5], p[2], p[3], c.ox + p[0], c.oy + p[1], p[2], p[3]); }
      } else {
        const sy = Math.min(img.height - man.canvas.h, (k * 2) % (img.height - man.canvas.h));
        ctx.clearRect(0, 0, W, H); ctx.drawImage(img, 0, sy, man.canvas.w, man.canvas.h, 0, 0, man.canvas.w, man.canvas.h);
      }
      k0 = k; w.k = k;
      if (el < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  run(); setInterval(run, 2000);
})().catch((e) => (window.__sa.err = String(e)));
