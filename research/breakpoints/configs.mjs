// Viewport configurations of the breakpoint sweep (de-breakpoints, T-034); shared by sweep.mjs and the probes.
// name: { width, height, dpr, touch (mobile + touch emulation), screenWidth/Height, reduce (prefers-reduced-motion), ge (GestureEvent stub) }
export const CONFIGS = {
  c375: { width: 375, height: 812, dpr: 3, touch: true },
  c430: { width: 430, height: 932, dpr: 3, touch: true },
  c600: { width: 600, height: 960, dpr: 1, touch: false },
  c601: { width: 601, height: 960, dpr: 1, touch: false },
  c768t: { width: 768, height: 1024, dpr: 2, touch: true },
  c900: { width: 900, height: 900, dpr: 1, touch: false },
  c1024t: { width: 1024, height: 768, dpr: 2, touch: true },
  c1024: { width: 1024, height: 768, dpr: 1, touch: false },
  c1280: { width: 1280, height: 800, dpr: 1, touch: false },
  c1440: { width: 1440, height: 900, dpr: 1, touch: false },
  c1920: { width: 1920, height: 1080, dpr: 1, touch: false },
  // iPhone landscape: iOS reports the portrait screen as device-width, so screen 430x932 (max-device-width:500 holds)
  c932l: { width: 932, height: 430, dpr: 3, touch: true, screenWidth: 430, screenHeight: 932 },
  rm430: { width: 430, height: 932, dpr: 3, touch: true, reduce: true },
  rm1440: { width: 1440, height: 900, dpr: 1, touch: false, reduce: true },
  // ge*: a stub window.GestureEvent before any page script, in every arm, so a WebKit-gated path (hero-exit-threaded's
  // .he-css mode keys on `'GestureEvent' in window`) runs in Blink: its logic and frozen pixels at widths the phone
  // never had (Blink blends composited layers slightly differently, <= 6 levels per its README; the diff counts > 8)
  ge430: { width: 430, height: 932, dpr: 3, touch: true, ge: true },
  ge932l: { width: 932, height: 430, dpr: 3, touch: true, screenWidth: 430, screenHeight: 932, ge: true },
  ge1440: { width: 1440, height: 900, dpr: 1, touch: false, ge: true },
  germ1440: { width: 1440, height: 900, dpr: 1, touch: false, reduce: true, ge: true },
};
