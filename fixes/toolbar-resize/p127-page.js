// toolbar-resize P-127 test page script (rev 3: moved out of p127-page.html, unchanged otherwise). Served from the
// overlay as /p127/p127.js: the mirror server sends every HTML page with CSP script-src 'self', which blocks inline
// scripts (rev 2's first run: __p127 undefined, no data). Function names p127write, p127round, p127io, p127raf, p127timer
// and the frame url (/p127/) are what the reader matches.
(() => {
  const tsel = document.getElementById('tsel'), tnosel = document.getElementById('tnosel'), iotarget = document.getElementById('iotarget');
  const parse = (spec) => { const [cause, kind, attr] = spec.split('-'); return { cause, kind, attr: attr || null }; };
  function p127write(s, i) {
    if (s.kind === 'none') return;
    const el = s.attr === 'sel' ? tsel : tnosel, name = s.attr === 'sel' ? 'data-sel' : 'data-nosel';
    el.setAttribute(name, s.kind === 'change' ? (i % 2 ? 'a' : 'b') : 'a');
  }
  function p127round(spec, s, i, done) {
    performance.mark(`p127:${spec}:${i}`);
    p127write(s, i);
    performance.mark(`p127end:${spec}:${i}`);
    done();
  }
  window.__p127 = {
    reset() { tsel.setAttribute('data-sel', 'a'); tnosel.setAttribute('data-nosel', 'a'); return 'reset'; },
    run(spec, rounds, gapMs) {
      const s = parse(spec);
      if (!['io', 'raf', 'timer'].includes(s.cause) || !['change', 'same', 'none'].includes(s.kind) || (s.kind !== 'none' && !['sel', 'nosel'].includes(s.attr))) return Promise.reject(new Error(`bad spec ${spec}`));
      let fired = 0;
      return new Promise((resolve) => {
        const done = () => { fired++; };
        const next = (i) => {
          if (i >= rounds) { setTimeout(() => resolve({ spec, rounds, fired }), 300); return; }
          if (s.cause === 'io') {
            const o = new IntersectionObserver(function p127io() { o.disconnect(); p127round(spec, s, i, done); });
            o.observe(iotarget);
          } else if (s.cause === 'raf') {
            requestAnimationFrame(function p127raf() { p127round(spec, s, i, done); });
          } else {
            setTimeout(function p127timer() { p127round(spec, s, i, done); }, 0);
          }
          setTimeout(() => next(i + 1), gapMs);
        };
        next(0);
      });
    },
  };
})();
