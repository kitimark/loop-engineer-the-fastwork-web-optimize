// menu-layers (T-253 #10, item 2): de-offscreen's probe pieces (fixes/de-offscreen/common.mjs) with this topic's arms
// added. Diagnostic only, not tooling. Arms: v0 = the plain baseline; f = g0.0f; b = f-B2 (PR-039 keep-phase)
// = g0.0h, landed 55f5cacd, built by fix.mjs apply g0-0h --reset; c = g0.0h + the panel
// clock layer (fixes/menu-layers/overlay).
import { join } from 'node:path';
import { ARMS, WT } from '../../de-offscreen/common.mjs';
export * from '../../de-offscreen/common.mjs';
Object.assign(ARMS, {
  b: { overlay: join(WT, 'fixes/g0-0h/overlay'), js: '9162843e750f', css: '26d28a0a263b' },
  c: { overlay: join(WT, 'fixes/menu-layers/overlay'), js: '9162843e750f', css: process.env.ML_C_CSS || 'adb875d94c1f' },
});
