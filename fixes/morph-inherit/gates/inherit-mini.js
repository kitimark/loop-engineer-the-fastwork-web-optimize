const $ = (id) => document.getElementById(id);
const cs = (id, p) => getComputedStyle($(id)).getPropertyValue(p).trim();
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
window.__run = async () => {
  const out = [];
  const steps = [0.1, 0.5, 0.9, 0];
  for (const v of steps) {
    // A: inline write of the registered non-inheriting property only (C's case)
    $('A').style.setProperty('--r', v);
    // B: the same plus an inline change of an ordinary non-inherited property on the parent
    $('B').style.setProperty('--r', v); $('B').style.outlineOffset = `${v * 10}px`;
    // C: the value comes from a class rule, not inline
    $('C').classList.toggle('v1', v === 0.5); $('C').classList.toggle('v2', v === 0.9);
    if (v === 0.1) $('C').setAttribute('style', '--r: 0.1'); else $('C').removeAttribute('style');
    // D: registered inheriting property, explicit inherit; E: unregistered, explicit inherit
    $('D').style.setProperty('--ri', v); $('E').style.setProperty('--u', v);
    void getComputedStyle($('A')).getPropertyValue('--r');
    const sync = { A1: cs('A1', '--r'), A2: cs('A2', '--r'), Aw: Math.round($('A1').getBoundingClientRect().width), B1: cs('B1', '--r'), C1: cs('C1', '--r'), D1: cs('D1', '--ri'), E1: cs('E1', '--u') };
    await raf2();
    const later = { A1: cs('A1', '--r'), A2: cs('A2', '--r'), Aw: Math.round($('A1').getBoundingClientRect().width), B1: cs('B1', '--r'), C1: cs('C1', '--r'), D1: cs('D1', '--ri'), E1: cs('E1', '--u') };
    out.push({ v, parentA: cs('A', '--r'), sync, later });
  }
  window.__out = JSON.stringify({ ua: navigator.userAgent, out });
  return window.__out;
};
