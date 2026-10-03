# Rendering cost card: hero-exit-threaded

Arms C, F3; control C; A/A C vs C2. Counts per element event, median over page loads [min-max]. In brackets after an arm: its change against the control. "within A/A" means |change| ≤ tol = max(2·|C−C2|, 2). "low-power" means tol > C/2. FRZ = the rest of the page frozen, FULL = the page as served. ms are printed, never judged.

| Element / event | Engine | 1 Thread | 2 Layers, memory | 3 Repaint per event | 4 Layout per event | 5 Script per event | Page around it (FULL only) | A/A source |
|---|---|---|---|---|---|---|---|---|
| hero-exit / ts-top | sim | C: no element script per event (UNRESOLVED)<br>F3: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 0 · F3 0 (+0, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · F3 0 (+0, within A/A, low-power) | layouts, FULL: C 0 · F3 0 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 0 · F3 1 (+1, within A/A, low-power)<br>style recalcs, FULL: C 0 · F3 0 (+0, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 4 · F3 5 (+1, within A/A) | rendering frames: C 3 · F3 3 (+0, within A/A, low-power)<br>frame rate Hz: C 43.8 · F3 50.8 (+7, within A/A)<br>rAF rate Hz: C 58.4 · F3 67.7 (+9.3, within A/A)<br>Composite: C 3 · F3 3 (+0, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / scroll-top | sim | C: main thread per event (1 element code calls per event) (OBSERVED)<br>F3: main thread per event (3 element code calls per event) (OBSERVED) | - | paints, FULL: C 55 · F3 105 (+50)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.37 · F3 0.56 (+0.19) | layouts, FULL: C 2 · F3 4 (+2, within A/A, low-power) | element code FunctionCalls, FULL: C 1 · F3 3 (+2, within A/A, low-power)<br>style recalcs, FULL: C 1 · F3 4 (+3, low-power)<br>FunctionCalls (all scripts), FULL: C 11 · F3 13 (+2, within A/A) | rendering frames: C 5 · F3 5 (+0, within A/A)<br>frame rate Hz: C 37.6 · F3 33.4 (-4.2)<br>rAF rate Hz: C 67.7 · F3 66.7 (-1, within A/A)<br>Composite: C 5 · F3 5 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move | sim | C: main thread every frame (element code in 21 of 27 frames per event) (OBSERVED)<br>F3: main thread every frame (element code in 24 of 26 frames per event) (OBSERVED) | - | paints, FULL: C 57 · F3 49 (-8, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 3.68 · F3 1.01 (-2.67) | layouts, FULL: C 145 · F3 146 (+1, within A/A) | element code FunctionCalls, FULL: C 47 · F3 49 (+2, within A/A)<br>style recalcs, FULL: C 50 · F3 53 (+3)<br>FunctionCalls (all scripts), FULL: C 317 · F3 319 (+2, within A/A) | rendering frames: C 27 · F3 26 (-1, within A/A)<br>frame rate Hz: C 13 · F3 13.1 (+0.1, within A/A)<br>rAF rate Hz: C 115 · F3 96.4 (-18.9)<br>Composite: C 50 · F3 50 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move-frame | sim | C: main thread per event (1.7 element code calls per event) (OBSERVED)<br>F3: main thread per event (1.9 element code calls per event) (OBSERVED) | - | paints, FULL: C 2.11 · F3 1.88 (-0.23, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.14 · F3 0.04 (-0.1) | layouts, FULL: C 5.37 · F3 5.62 (+0.25, within A/A) | element code FunctionCalls, FULL: C 1.74 · F3 1.88 (+0.14, within A/A, low-power)<br>style recalcs, FULL: C 1.85 · F3 2.04 (+0.19, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 11.7 · F3 12.3 (+0.53, within A/A) | rendering frames: C 27 · F3 26 (-1, within A/A)<br>frame rate Hz: C 13 · F3 13.1 (+0.1, within A/A)<br>rAF rate Hz: C 115 · F3 96.4 (-18.9)<br>Composite: C 1.85 · F3 1.92 (+0.07, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / rest | sim | C: main thread per event (2 element code calls per event) (OBSERVED)<br>F3: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 3 · F3 59 (+56, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.03 · F3 0.73 (+0.7, within A/A, low-power) | layouts, FULL: C 5 · F3 5 (+0, within A/A) | element code FunctionCalls, FULL: C 2 · F3 2 (+0, within A/A, low-power)<br>style recalcs, FULL: C 6 · F3 9 (+3)<br>FunctionCalls (all scripts), FULL: C 11 · F3 10 (-1, within A/A) | rendering frames: C 7 · F3 7 (+0, within A/A)<br>frame rate Hz: C 9.8 · F3 9.9 (+0.1, within A/A)<br>rAF rate Hz: C 9.8 · F3 7 (-2.8)<br>Composite: C 8 · F3 8 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / ts-mid | sim | C: no element script per event (UNRESOLVED)<br>F3: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 2 · F3 2 (+0, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · F3 0 (0, within A/A) | layouts, FULL: C 3 · F3 3 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 0 · F3 1 (+1, within A/A, low-power)<br>style recalcs, FULL: C 3 · F3 3 (+0, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 4 · F3 5 (+1, within A/A) | rendering frames: C 4 · F3 4 (+0, within A/A)<br>frame rate Hz: C 64.5 · F3 53.6 (-10.9)<br>rAF rate Hz: C 64.5 · F3 53.6 (-10.9)<br>Composite: C 3 · F3 3 (+0, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / scroll-mid | sim | C: main thread per event (1 element code calls per event) (OBSERVED)<br>F3: main thread per event (3 element code calls per event) (OBSERVED) | - | paints, FULL: C 6 · F3 59 (+53)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.36 · F3 0.6 (+0.24) | layouts, FULL: C 7 · F3 7 (+0, within A/A) | element code FunctionCalls, FULL: C 1 · F3 3 (+2, within A/A, low-power)<br>style recalcs, FULL: C 6 · F3 6 (+0, within A/A)<br>FunctionCalls (all scripts), FULL: C 11 · F3 13 (+2, within A/A) | rendering frames: C 5 · F3 5 (+0, within A/A)<br>frame rate Hz: C 38.1 · F3 29.3 (-8.8, within A/A, low-power)<br>rAF rate Hz: C 68.6 · F3 58.7 (-9.9, within A/A)<br>Composite: C 5 · F3 5 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move2 | sim | C: main thread every frame (element code in 17 of 26 frames per event) (OBSERVED)<br>F3: main thread every frame (element code in 21 of 25 frames per event) (OBSERVED) | - | paints, FULL: C 82 · F3 40 (-42)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 14.9 · F3 0.83 (-14.1) | layouts, FULL: C 136 · F3 136 (+0, within A/A) | element code FunctionCalls, FULL: C 38 · F3 40 (+2, within A/A)<br>style recalcs, FULL: C 61 · F3 43 (-18)<br>FunctionCalls (all scripts), FULL: C 262 · F3 263 (+1, within A/A) | rendering frames: C 26 · F3 25 (-1, within A/A)<br>frame rate Hz: C 13.1 · F3 13.6 (+0.5, within A/A)<br>rAF rate Hz: C 97.4 · F3 85 (-12.4)<br>Composite: C 41 · F3 41 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move2-frame | sim | C: main thread per event (1.5 element code calls per event) (OBSERVED)<br>F3: main thread per event (1.6 element code calls per event) (OBSERVED) | - | paints, FULL: C 3.15 · F3 1.6 (-1.55, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.57 · F3 0.03 (-0.54) | layouts, FULL: C 5.23 · F3 5.44 (+0.21, within A/A) | element code FunctionCalls, FULL: C 1.46 · F3 1.6 (+0.14, within A/A, low-power)<br>style recalcs, FULL: C 2.35 · F3 1.72 (-0.63, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 10.1 · F3 10.5 (+0.44, within A/A) | rendering frames: C 26 · F3 25 (-1, within A/A)<br>frame rate Hz: C 13.1 · F3 13.6 (+0.5, within A/A)<br>rAF rate Hz: C 97.4 · F3 85 (-12.4)<br>Composite: C 1.58 · F3 1.64 (+0.06, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / rest2 | sim | C: main thread every frame (element code in 2 of 3 frames per event) (OBSERVED)<br>F3: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 0 · F3 54 (+54, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · F3 0.35 (+0.35, within A/A, low-power) | layouts, FULL: C 0 · F3 1 (+1, within A/A, low-power) | element code FunctionCalls, FULL: C 2 · F3 2 (+0, within A/A, low-power)<br>style recalcs, FULL: C 0 · F3 5 (+5, low-power)<br>FunctionCalls (all scripts), FULL: C 9 · F3 9 (+0, within A/A, low-power) | rendering frames: C 3 · F3 5 (+2, within A/A, low-power)<br>frame rate Hz: C 4.3 · F3 7.1 (+2.8)<br>rAF rate Hz: C 10 · F3 7.1 (-2.9, within A/A, low-power)<br>Composite: C 3 · F3 5 (+2, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |

Frame-driven counts (main or rendering frames, Layerize, Composite, frame and rAF rates) come from the FULL page only and are never the element's alone (README §6.2, H9). They stand beside every per-event number so a per-time reading can be checked against them.

## Details per row

### hero-exit / ts-top (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.07 | 0.06 | 0.06 |
| rendering frames | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| rAF callbacks | 4 | 4, change +0 tol 2 (within A/A) | 4 |
| rendering frames running the element code | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| element code FunctionCalls | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| FunctionCalls (all scripts) | 4 | 5, change +1 tol 2 (within A/A) | 4 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| layouts | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paints | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paint clip area, whole page (CSS px², not element-attributed) | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 43.8 | 50.8, change +7 tol 8.2 (within A/A) | 47.9 |
| rAF rate Hz | 58.4 | 67.7, change +9.3 tol 11 (within A/A) | 63.9 |
| script ms (unjudged) | 0 | 0.02 | 0 |
| style ms (unjudged) | 0 | 0 | 0 |
| layout ms (unjudged) | 0 | 0 | 0 |
| paint ms (unjudged) | 0 | 0 | 0 |

### hero-exit / scroll-top (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.13 | 0.15 | 0.13 |
| rendering frames | 5 | 5, change +0 tol 2 (within A/A) | 5 |
| rAF callbacks | 9 | 10, change +1 tol 2 (within A/A) | 9 |
| rendering frames running the element code | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 1 | 3, change +2 tol 2 (within A/A) (low-power) | 1 |
| FunctionCalls (all scripts) | 11 | 13, change +2 tol 2 (within A/A) | 12 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 1 | 4, change +3 tol 2 (low-power) | 1 |
| layouts | 2 | 4, change +2 tol 2 (within A/A) (low-power) | 2 |
| paints | 55 | 105, change +50 tol 2 | 55 |
| paint clip area, whole page (CSS px², not element-attributed) | 367751 | 555125, change +187374 tol 2 | 367751 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 5 | 5, change +0 tol 2 (within A/A) | 5 |
| frame rate Hz | 37.6 | 33.4, change -4.2 tol 2 | 37.6 |
| rAF rate Hz | 67.7 | 66.7, change -1 tol 2 (within A/A) | 67.6 |
| script ms (unjudged) | 0.04 | 3.06 | 0.04 |
| style ms (unjudged) | 3.18 | 8.65 | 3.29 |
| layout ms (unjudged) | 34 | 19.9 | 34.8 |
| paint ms (unjudged) | 0.65 | 1.3 | 0.78 |

### hero-exit / move (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 2.07 | 1.99 | 2.18 |
| rendering frames | 27 | 26, change -1 tol 10 (within A/A) | 32 |
| rAF callbacks | 239 | 192, change -47 tol 2 | 239 |
| rendering frames running the element code | 21 | 24, change +3 tol 6 (within A/A) | 24 |
| element code FunctionCalls | 47 | 49, change +2 tol 2 (within A/A) | 47 |
| FunctionCalls (all scripts) | 317 | 319, change +2 tol 10 (within A/A) | 322 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 50 | 53, change +3 tol 2 | 50 |
| layouts | 145 | 146, change +1 tol 6 (within A/A) | 148 |
| paints | 57 | 49, change -8 tol 108 (within A/A) (low-power) | 111 |
| paint clip area, whole page (CSS px², not element-attributed) | 3680104 | 1014104, change -2666000 tol 456368 | 3908288 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 50 | 50, change +0 tol 2 (within A/A) | 50 |
| frame rate Hz | 13 | 13.1, change +0.1 tol 3.4 (within A/A) | 14.7 |
| rAF rate Hz | 115 | 96.4, change -18.9 tol 11.4 | 110 |
| script ms (unjudged) | 846 | 1.84 | 857 |
| style ms (unjudged) | 121 | 34.6 | 127 |
| layout ms (unjudged) | 1769 | 1755 | 1808 |
| paint ms (unjudged) | 1.15 | 0.83 | 2.36 |

### hero-exit / move-frame (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 2.07 | 1.99 | 2.18 |
| rendering frames | 27 | 26, change -1 tol 10 (within A/A) | 32 |
| rAF callbacks | 8.85 | 7.38, change -1.47 tol 2.77 (within A/A) | 7.47 |
| rendering frames running the element code | 0.78 | 0.92, change +0.15 tol 2 (within A/A) (low-power) | 0.75 |
| element code FunctionCalls | 1.74 | 1.88, change +0.14 tol 2 (within A/A) (low-power) | 1.47 |
| FunctionCalls (all scripts) | 11.7 | 12.3, change +0.53 tol 3.36 (within A/A) | 10.1 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 1.85 | 2.04, change +0.19 tol 2 (within A/A) (low-power) | 1.56 |
| layouts | 5.37 | 5.62, change +0.25 tol 2 (within A/A) | 4.63 |
| paints | 2.11 | 1.88, change -0.23 tol 2.72 (within A/A) (low-power) | 3.47 |
| paint clip area, whole page (CSS px², not element-attributed) | 136300 | 39004, change -97296 tol 28332 | 122134 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 1.85 | 1.92, change +0.07 tol 2 (within A/A) (low-power) | 1.56 |
| frame rate Hz | 13 | 13.1, change +0.1 tol 3.4 (within A/A) | 14.7 |
| rAF rate Hz | 115 | 96.4, change -18.9 tol 11.4 | 110 |
| script ms (unjudged) | 846 | 1.84 | 857 |
| style ms (unjudged) | 121 | 34.6 | 127 |
| layout ms (unjudged) | 1769 | 1755 | 1808 |
| paint ms (unjudged) | 1.15 | 0.83 | 2.36 |

### hero-exit / rest (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.71 | 0.71 | 0.71 |
| rendering frames | 7 | 7, change +0 tol 2 (within A/A) | 7 |
| rAF callbacks | 7 | 5, change -2 tol 2 (within A/A) | 7 |
| rendering frames running the element code | 2 | 1, change -1 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| FunctionCalls (all scripts) | 11 | 10, change -1 tol 2 (within A/A) | 11 |
| timer fires | 3 | 4, change +1 tol 2 (within A/A) (low-power) | 3 |
| style recalcs | 6 | 9, change +3 tol 2 | 7 |
| layouts | 5 | 5, change +0 tol 2 (within A/A) | 6 |
| paints | 3 | 59, change +56 tol 6 (low-power) | 6 |
| paint clip area, whole page (CSS px², not element-attributed) | 33346 | 734293, change +700947 tol 710155 (within A/A) (low-power) | 388423 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 8 | 8, change +0 tol 2 (within A/A) | 8 |
| frame rate Hz | 9.8 | 9.9, change +0.1 tol 2 (within A/A) | 9.9 |
| rAF rate Hz | 9.8 | 7, change -2.8 tol 2 | 9.9 |
| script ms (unjudged) | 0.04 | 0.2 | 0.06 |
| style ms (unjudged) | 4.99 | 8.16 | 5.4 |
| layout ms (unjudged) | 89.1 | 63.7 | 111 |
| paint ms (unjudged) | 0.06 | 0.95 | 0.3 |

### hero-exit / ts-mid (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.06 | 0.07 | 0.07 |
| rendering frames | 4 | 4, change +0 tol 2 (within A/A) | 4 |
| rAF callbacks | 4 | 4, change +0 tol 2 (within A/A) | 4 |
| rendering frames running the element code | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| element code FunctionCalls | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| FunctionCalls (all scripts) | 4 | 5, change +1 tol 2 (within A/A) | 4 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| layouts | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| paints | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| paint clip area, whole page (CSS px², not element-attributed) | 2292 | 2270, change -21.9 tol 167 (within A/A) | 2376 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 64.5 | 53.6, change -10.9 tol 6.6 | 61.2 |
| rAF rate Hz | 64.5 | 53.6, change -10.9 tol 6.6 | 61.2 |
| script ms (unjudged) | 0 | 0 | 0 |
| style ms (unjudged) | 1.4 | 1.29 | 1.5 |
| layout ms (unjudged) | 53 | 51.4 | 53.2 |
| paint ms (unjudged) | 0.01 | 0.01 | 0.02 |

### hero-exit / scroll-mid (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.13 | 0.17 | 0.15 |
| rendering frames | 5 | 5, change +0 tol 2 (within A/A) | 4 |
| rAF callbacks | 9 | 10, change +1 tol 2 (within A/A) | 9 |
| rendering frames running the element code | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 1 | 3, change +2 tol 2 (within A/A) (low-power) | 1 |
| FunctionCalls (all scripts) | 11 | 13, change +2 tol 2 (within A/A) | 11 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 6 | 6, change +0 tol 2 (within A/A) | 6 |
| layouts | 7 | 7, change +0 tol 2 (within A/A) | 8 |
| paints | 6 | 59, change +53 tol 2 | 5 |
| paint clip area, whole page (CSS px², not element-attributed) | 358777 | 595484, change +236706 tol 2327 | 357614 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 5 | 5, change +0 tol 2 (within A/A) | 5 |
| frame rate Hz | 38.1 | 29.3, change -8.8 tol 23 (within A/A) (low-power) | 26.6 |
| rAF rate Hz | 68.6 | 58.7, change -9.9 tol 17.6 (within A/A) | 59.8 |
| script ms (unjudged) | 20.1 | 20.9 | 18.2 |
| style ms (unjudged) | 5.63 | 64.4 | 4.79 |
| layout ms (unjudged) | 109 | 107 | 127 |
| paint ms (unjudged) | 0.07 | 0.97 | 0.1 |

### hero-exit / move2 (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 1.99 | 1.84 | 1.94 |
| rendering frames | 26 | 25, change -1 tol 2 (within A/A) | 25 |
| rAF callbacks | 194 | 156, change -38 tol 2 | 194 |
| rendering frames running the element code | 17 | 21, change +4 tol 4 (within A/A) | 19 |
| element code FunctionCalls | 38 | 40, change +2 tol 2 (within A/A) | 38 |
| FunctionCalls (all scripts) | 262 | 263, change +1 tol 2 (within A/A) | 262 |
| timer fires | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| style recalcs | 61 | 43, change -18 tol 2 | 60 |
| layouts | 136 | 136, change +0 tol 4 (within A/A) | 134 |
| paints | 82 | 40, change -42 tol 2 | 81 |
| paint clip area, whole page (CSS px², not element-attributed) | 14912787 | 827840, change -14084947 tol 2443 | 14911565 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 41 | 41, change +0 tol 2 (within A/A) | 41 |
| frame rate Hz | 13.1 | 13.6, change +0.5 tol 2 (within A/A) | 12.9 |
| rAF rate Hz | 97.4 | 85, change -12.4 tol 4.8 | 99.8 |
| script ms (unjudged) | 683 | 1.2 | 676 |
| style ms (unjudged) | 112 | 273 | 111 |
| layout ms (unjudged) | 1687 | 1642 | 1654 |
| paint ms (unjudged) | 2.18 | 0.66 | 2.08 |

### hero-exit / move2-frame (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 1.99 | 1.84 | 1.94 |
| rendering frames | 26 | 25, change -1 tol 2 (within A/A) | 25 |
| rAF callbacks | 7.46 | 6.24, change -1.22 tol 2 (within A/A) | 7.76 |
| rendering frames running the element code | 0.65 | 0.84, change +0.19 tol 2 (within A/A) (low-power) | 0.76 |
| element code FunctionCalls | 1.46 | 1.6, change +0.14 tol 2 (within A/A) (low-power) | 1.52 |
| FunctionCalls (all scripts) | 10.1 | 10.5, change +0.44 tol 2 (within A/A) | 10.5 |
| timer fires | 0.08 | 0.08, change +0 tol 2 (within A/A) (low-power) | 0.08 |
| style recalcs | 2.35 | 1.72, change -0.63 tol 2 (within A/A) (low-power) | 2.4 |
| layouts | 5.23 | 5.44, change +0.21 tol 2 (within A/A) | 5.36 |
| paints | 3.15 | 1.6, change -1.55 tol 2 (within A/A) (low-power) | 3.24 |
| paint clip area, whole page (CSS px², not element-attributed) | 573569 | 33114, change -540455 tol 45788 | 596463 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 1.58 | 1.64, change +0.06 tol 2 (within A/A) (low-power) | 1.64 |
| frame rate Hz | 13.1 | 13.6, change +0.5 tol 2 (within A/A) | 12.9 |
| rAF rate Hz | 97.4 | 85, change -12.4 tol 4.8 | 99.8 |
| script ms (unjudged) | 683 | 1.2 | 676 |
| style ms (unjudged) | 112 | 273 | 111 |
| layout ms (unjudged) | 1687 | 1642 | 1654 |
| paint ms (unjudged) | 2.18 | 0.66 | 2.08 |

### hero-exit / rest2 (sim)

FULL: loads C 1, F3 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F3 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.7 | 0.7 | 0.7 |
| rendering frames | 3 | 5, change +2 tol 2 (within A/A) (low-power) | 3 |
| rAF callbacks | 7 | 5, change -2 tol 8 (within A/A) (low-power) | 11 |
| rendering frames running the element code | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 3 |
| FunctionCalls (all scripts) | 9 | 9, change +0 tol 10 (within A/A) (low-power) | 14 |
| timer fires | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| style recalcs | 0 | 5, change +5 tol 4 (low-power) | 2 |
| layouts | 0 | 1, change +1 tol 6 (within A/A) (low-power) | 3 |
| paints | 0 | 54, change +54 tol 8 (low-power) | 4 |
| paint clip area, whole page (CSS px², not element-attributed) | 0 | 347055, change +347055 tol 1758064 (within A/A) (low-power) | 879032 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 3 | 5, change +2 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 4.3 | 7.1, change +2.8 tol 2 | 4.3 |
| rAF rate Hz | 10 | 7.1, change -2.9 tol 11.4 (within A/A) (low-power) | 15.7 |
| script ms (unjudged) | 0.05 | 0.46 | 0.08 |
| style ms (unjudged) | 0 | 11.3 | 5.16 |
| layout ms (unjudged) | 0 | 1.86 | 20.8 |
| paint ms (unjudged) | 0 | 1.78 | 0.24 |

## What this card cannot say

- Frame time, smoothness, finger feel and hot-only behaviour: those stay with the phone (V stage).
- Raster and GPU time. Memory and area are proxies, and Chrome memory is an estimate.
- Costs merged in from neighbours (H9). The FULL context hints at them but does not measure them.

## Status of the sources

- Field 3, Sim: a Timeline Paint clip is in root-view coordinates (CONFIRMED, WebKit PageTimelineAgent::didPaint); that it matches getBoundingClientRect on iOS at scrollY > 0 is UNRESOLVED. Field 1, Sim: the behavioural reading (no element script per moving frame) is a method, OBSERVED; WebKit has no per-animation "accelerated" flag.

