import { chip } from './_lib.mjs';

export default {
  key: 'intro',
  html: `<aside class="howto" aria-labelledby="howto-h">
<h2 id="howto-h">How to read the math</h2>
<p>Each section and most lessons carry a box marked <span class="mx-tag">The math</span>. It holds one plain sentence, the formula,
a worked example with our own numbers, a chart drawn to scale from those numbers, and the repo path the numbers come from.</p>
<ul>
<li>A frame is one picture. At 60 Hz the phone has <span class="num">1000 / 60 = 16.67 ms</span> per picture; a frame over
<span class="num">34 ms</span> loses at least one picture, over <span class="num">50 ms</span> at least two.</li>
<li>The chip says how far to trust a line: ${chip('CONFIRMED')} a spec, engine source or bug agrees; ${chip('OBSERVED')} our own runs
only, in our setup; ${chip('DERIVED')} arithmetic or a model built on our numbers; ${chip('UNRESOLVED')} no reference settles it.</li>
<li>In the charts, <span class="k a-orig">orange</span> is the original page, <span class="k a-mid">green</span> an intermediate build and
<span class="k a-fix">blue</span> the fix or final build, unless a chart's own legend says otherwise. Every bar carries its value, so the colour is never the only cue.
In frame splits the stages have their own colours: <span class="k g-style">Style</span>, <span class="k g-layout">Layout</span>,
<span class="k g-comp">Composite</span>, with <span class="k g-paint">Paint</span> hatched inside Composite.</li>
</ul>
<div class="row"><button type="button" id="mx-all-hide" data-mx="hide">Fold every math box</button><button type="button" id="mx-all-show" data-mx="show">Open every math box</button></div>
<script>
document.querySelectorAll('[data-mx]').forEach((b) => b.addEventListener('click', () => {
  const open = b.dataset.mx === 'show';
  document.querySelectorAll('details.mx').forEach((d) => { d.open = open; });
}));
</script>
</aside>`,
};
