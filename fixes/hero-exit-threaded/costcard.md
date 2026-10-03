# Rendering cost card: hero-exit-threaded

Arms C, V, F; control C; A/A C vs C2. Counts per element event, median over page loads [min-max]. In brackets after an arm: its change against the control. "within A/A" means |change| ≤ tol = max(2·|C−C2|, 2). "low-power" means tol > C/2. FRZ = the rest of the page frozen, FULL = the page as served. ms are printed, never judged.

| Element / event | Engine | 1 Thread | 2 Layers, memory | 3 Repaint per event | 4 Layout per event | 5 Script per event | Page around it (FULL only) | A/A source |
|---|---|---|---|---|---|---|---|---|
| hero-exit / ts-top | sim | C: no element script per event (UNRESOLVED)<br>V: main thread per event (1 element code calls per event) (OBSERVED)<br>F: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power) | layouts, FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 0 · V 1 (+1, within A/A, low-power) · F 1 (+1, within A/A, low-power)<br>style recalcs, FULL: C 0 · V 4 (+4, low-power) · F 3 (+3, low-power)<br>FunctionCalls (all scripts), FULL: C 4 · V 5 (+1, within A/A) · F 5 (+1, within A/A) | rendering frames: C 3 · V 3 (+0, within A/A, low-power) · F 3 (+0, within A/A, low-power)<br>frame rate Hz: C 47.5 · V 42.8 (-4.7) · F 45.4 (-2.1)<br>rAF rate Hz: C 63.4 · V 57.1 (-6.3) · F 60.6 (-2.8)<br>Composite: C 3 · V 3 (+0, within A/A, low-power) · F 3 (+0, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / scroll-top | sim | C: main thread per event (1 element code calls per event) (OBSERVED)<br>V: main thread per event (1 element code calls per event) (OBSERVED)<br>F: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 55 · V 55 (+0, within A/A) · F 55 (+0, within A/A)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.37 · V 0.37 (0, within A/A) · F 0.37 (0, within A/A) | layouts, FULL: C 2 · V 2 (+0, within A/A, low-power) · F 2 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 1 · V 1 (+0, within A/A, low-power) · F 1 (+0, within A/A, low-power)<br>style recalcs, FULL: C 1 · V 5 (+4, low-power) · F 5 (+4, low-power)<br>FunctionCalls (all scripts), FULL: C 12 · V 12 (+0, within A/A) · F 12 (+0, within A/A) | rendering frames: C 5 · V 5 (+0, within A/A) · F 5 (+0, within A/A)<br>frame rate Hz: C 37.5 · V 37.6 (+0.1, within A/A) · F 33.3 (-4.2, within A/A)<br>rAF rate Hz: C 67.5 · V 60.2 (-7.3, within A/A) · F 53.3 (-14.2, within A/A)<br>Composite: C 5 · V 5 (+0, within A/A) · F 5 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move | sim | C: main thread every frame (element code in 24 of 30 frames per event) (OBSERVED)<br>V: main thread every frame (element code in 24 of 28 frames per event) (OBSERVED)<br>F: main thread every frame (element code in 25 of 29 frames per event) (OBSERVED) | - | paints, FULL: C 111 · V 49 (-62) · F 49 (-62)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 3.91 · V 1.01 (-2.89) · F 1.01 (-2.89) | layouts, FULL: C 148 · V 147 (-1, within A/A) · F 147 (-1, within A/A) | element code FunctionCalls, FULL: C 47 · V 49 (+2, within A/A) · F 49 (+2, within A/A)<br>style recalcs, FULL: C 50 · V 53 (+3) · F 53 (+3)<br>FunctionCalls (all scripts), FULL: C 320 · V 322 (+2, within A/A) · F 322 (+2, within A/A) | rendering frames: C 30 · V 28 (-2, within A/A) · F 29 (-1, within A/A)<br>frame rate Hz: C 13.4 · V 13.2 (-0.2, within A/A) · F 13.6 (+0.2, within A/A)<br>rAF rate Hz: C 107 · V 90.7 (-16) · F 89.7 (-17)<br>Composite: C 50 · V 50 (+0, within A/A) · F 50 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move-frame | sim | C: main thread per event (1.6 element code calls per event) (OBSERVED)<br>V: main thread per event (1.8 element code calls per event) (OBSERVED)<br>F: main thread per event (1.7 element code calls per event) (OBSERVED) | - | paints, FULL: C 3.7 · V 1.75 (-1.95, within A/A, low-power) · F 1.69 (-2.01, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.13 · V 0.04 (-0.09) · F 0.03 (-0.1) | layouts, FULL: C 4.93 · V 5.25 (+0.32, within A/A) · F 5.07 (+0.14, within A/A) | element code FunctionCalls, FULL: C 1.57 · V 1.75 (+0.18, within A/A, low-power) · F 1.69 (+0.12, within A/A, low-power)<br>style recalcs, FULL: C 1.67 · V 1.89 (+0.23, within A/A, low-power) · F 1.83 (+0.16, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 10.7 · V 11.5 (+0.83, within A/A) · F 11.1 (+0.44, within A/A) | rendering frames: C 30 · V 28 (-2, within A/A) · F 29 (-1, within A/A)<br>frame rate Hz: C 13.4 · V 13.2 (-0.2, within A/A) · F 13.6 (+0.2, within A/A)<br>rAF rate Hz: C 107 · V 90.7 (-16) · F 89.7 (-17)<br>Composite: C 1.67 · V 1.79 (+0.12, within A/A, low-power) · F 1.72 (+0.06, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / rest | sim | C: main thread per event (2 element code calls per event) (OBSERVED)<br>V: main thread per event (2 element code calls per event) (OBSERVED)<br>F: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 5 · V 5 (+0, within A/A, low-power) · F 6 (+1, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.04 · V 0.06 (+0.02, within A/A, low-power) · F 0.06 (+0.02, within A/A, low-power) | layouts, FULL: C 7 · V 6 (-1, within A/A) · F 6 (-1, within A/A) | element code FunctionCalls, FULL: C 2 · V 2 (+0, within A/A, low-power) · F 2 (+0, within A/A, low-power)<br>style recalcs, FULL: C 8 · V 14 (+6) · F 14 (+6)<br>FunctionCalls (all scripts), FULL: C 12 · V 11 (-1, within A/A) · F 11 (-1, within A/A) | rendering frames: C 10 · V 10 (+0, within A/A) · F 10 (+0, within A/A)<br>frame rate Hz: C 14.1 · V 14.2 (+0.1, within A/A) · F 14.2 (+0.1, within A/A)<br>rAF rate Hz: C 9.9 · V 7.1 (-2.8) · F 7.1 (-2.8)<br>Composite: C 11 · V 11 (+0, within A/A) · F 11 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / ts-mid | sim | C: no element script per event (UNRESOLVED)<br>V: main thread per event (1 element code calls per event) (OBSERVED)<br>F: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 2 · V 3 (+1, within A/A, low-power) · F 3 (+1, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power) | layouts, FULL: C 3 · V 3 (+0, within A/A, low-power) · F 3 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 0 · V 1 (+1, within A/A, low-power) · F 1 (+1, within A/A, low-power)<br>style recalcs, FULL: C 3 · V 4 (+1, within A/A, low-power) · F 3 (+0, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 4 · V 5 (+1, within A/A) · F 5 (+1, within A/A) | rendering frames: C 4 · V 4 (+0, within A/A) · F 4 (+0, within A/A)<br>frame rate Hz: C 61.3 · V 56.7 (-4.6) · F 58.4 (-2.9)<br>rAF rate Hz: C 61.3 · V 56.7 (-4.6) · F 58.4 (-2.9)<br>Composite: C 3 · V 3 (+0, within A/A, low-power) · F 3 (+0, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / scroll-mid | sim | C: main thread per event (1 element code calls per event) (OBSERVED)<br>V: main thread per event (1 element code calls per event) (OBSERVED)<br>F: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 5 · V 5 (+0, within A/A) · F 5 (+0, within A/A)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.36 · V 0.03 (-0.33) · F 0.03 (-0.33) | layouts, FULL: C 9 · V 7 (-2, within A/A) · F 7 (-2, within A/A) | element code FunctionCalls, FULL: C 1 · V 1 (+0, within A/A, low-power) · F 1 (+0, within A/A, low-power)<br>style recalcs, FULL: C 6 · V 5 (-1, within A/A) · F 6 (+0, within A/A)<br>FunctionCalls (all scripts), FULL: C 11 · V 11 (+0, within A/A) · F 11 (+0, within A/A) | rendering frames: C 5 · V 5 (+0, within A/A) · F 4 (-1, within A/A)<br>frame rate Hz: C 29.6 · V 33.1 (+3.5, within A/A) · F 25.7 (-3.9, within A/A)<br>rAF rate Hz: C 53.3 · V 52.9 (-0.4, within A/A) · F 51.4 (-1.9, within A/A)<br>Composite: C 5 · V 5 (+0, within A/A) · F 5 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move2 | sim | C: main thread every frame (element code in 18 of 24 frames per event) (OBSERVED)<br>V: main thread every frame (element code in 22 of 26 frames per event) (OBSERVED)<br>F: main thread every frame (element code in 22 of 26 frames per event) (OBSERVED) | - | paints, FULL: C 80 · V 41 (-39) · F 41 (-39)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 14.9 · V 0.83 (-14.1) · F 0.83 (-14.1) | layouts, FULL: C 134 · V 134 (+0, within A/A) · F 134 (+0, within A/A) | element code FunctionCalls, FULL: C 38 · V 40 (+2, within A/A) · F 40 (+2, within A/A)<br>style recalcs, FULL: C 59 · V 43 (-16) · F 43 (-16)<br>FunctionCalls (all scripts), FULL: C 261 · V 263 (+2, within A/A) · F 263 (+2, within A/A) | rendering frames: C 24 · V 26 (+2, within A/A) · F 26 (+2, within A/A)<br>frame rate Hz: C 11.9 · V 13.6 (+1.7, within A/A) · F 13.5 (+1.6, within A/A)<br>rAF rate Hz: C 96.5 · V 81.5 (-15) · F 81.2 (-15.3)<br>Composite: C 41 · V 41 (+0, within A/A) · F 41 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move2-frame | sim | C: main thread per event (1.6 element code calls per event) (OBSERVED)<br>V: main thread per event (1.5 element code calls per event) (OBSERVED)<br>F: main thread per event (1.5 element code calls per event) (OBSERVED) | - | paints, FULL: C 3.33 · V 1.58 (-1.76, within A/A, low-power) · F 1.58 (-1.76, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.62 · V 0.03 (-0.59) · F 0.03 (-0.59) | layouts, FULL: C 5.58 · V 5.15 (-0.43, within A/A) · F 5.15 (-0.43, within A/A) | element code FunctionCalls, FULL: C 1.58 · V 1.54 (-0.04, within A/A, low-power) · F 1.54 (-0.04, within A/A, low-power)<br>style recalcs, FULL: C 2.46 · V 1.65 (-0.8, within A/A, low-power) · F 1.65 (-0.8, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 10.9 · V 10.1 (-0.76, within A/A) · F 10.1 (-0.76, within A/A) | rendering frames: C 24 · V 26 (+2, within A/A) · F 26 (+2, within A/A)<br>frame rate Hz: C 11.9 · V 13.6 (+1.7, within A/A) · F 13.5 (+1.6, within A/A)<br>rAF rate Hz: C 96.5 · V 81.5 (-15) · F 81.2 (-15.3)<br>Composite: C 1.71 · V 1.58 (-0.13, within A/A, low-power) · F 1.58 (-0.13, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / rest2 | sim | C: main thread every frame (element code in 2 of 3 frames per event) (OBSERVED)<br>V: main thread per event (2 element code calls per event) (OBSERVED)<br>F: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power) | layouts, FULL: C 0 · V 0 (+0, within A/A, low-power) · F 0 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 2 · V 2 (+0, within A/A, low-power) · F 2 (+0, within A/A, low-power)<br>style recalcs, FULL: C 0 · V 7 (+7, low-power) · F 7 (+7, low-power)<br>FunctionCalls (all scripts), FULL: C 9 · V 9 (+0, within A/A) · F 9 (+0, within A/A) | rendering frames: C 3 · V 6 (+3, low-power) · F 6 (+3, low-power)<br>frame rate Hz: C 4.3 · V 8.5 (+4.2) · F 8.5 (+4.2)<br>rAF rate Hz: C 10 · V 7.1 (-2.9) · F 7.1 (-2.9)<br>Composite: C 3 · V 6 (+3, low-power) · F 6 (+3, low-power) | C vs C2, sim FULL, loads 1/1 |

Frame-driven counts (main or rendering frames, Layerize, Composite, frame and rAF rates) come from the FULL page only and are never the element's alone (README §6.2, H9). They stand beside every per-event number so a per-time reading can be checked against them.

## Details per row

### hero-exit / ts-top (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 0.06 | 0.07 | 0.07 | 0.06 |
| rendering frames | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| rAF callbacks | 4 | 4, change +0 tol 2 (within A/A) | 4, change +0 tol 2 (within A/A) | 4 |
| rendering frames running the element code | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| element code FunctionCalls | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| FunctionCalls (all scripts) | 4 | 5, change +1 tol 2 (within A/A) | 5, change +1 tol 2 (within A/A) | 4 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 0 | 4, change +4 tol 2 (low-power) | 3, change +3 tol 2 (low-power) | 0 |
| layouts | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paints | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paint clip area, whole page (CSS px², not element-attributed) | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 47.5 | 42.8, change -4.7 tol 2 | 45.4, change -2.1 tol 2 | 46.9 |
| rAF rate Hz | 63.4 | 57.1, change -6.3 tol 2 | 60.6, change -2.8 tol 2 | 62.6 |
| script ms (unjudged) | 0 | 0.14 | 0.03 | 0 |
| style ms (unjudged) | 0 | 3.39 | 0.88 | 0 |
| layout ms (unjudged) | 0 | 0 | 0 | 0 |
| paint ms (unjudged) | 0 | 0 | 0 | 0 |

### hero-exit / scroll-top (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 0.13 | 0.13 | 0.15 | 0.15 |
| rendering frames | 5 | 5, change +0 tol 2 (within A/A) | 5, change +0 tol 2 (within A/A) | 5 |
| rAF callbacks | 9 | 8, change -1 tol 2 (within A/A) | 8, change -1 tol 2 (within A/A) | 9 |
| rendering frames running the element code | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 1, change +0 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 1, change +0 tol 2 (within A/A) (low-power) | 1 |
| FunctionCalls (all scripts) | 12 | 12, change +0 tol 2 (within A/A) | 12, change +0 tol 2 (within A/A) | 12 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 1 | 5, change +4 tol 2 (low-power) | 5, change +4 tol 2 (low-power) | 1 |
| layouts | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| paints | 55 | 55, change +0 tol 2 (within A/A) | 55, change +0 tol 2 (within A/A) | 55 |
| paint clip area, whole page (CSS px², not element-attributed) | 367751 | 367751, change 0 tol 2 (within A/A) | 367751, change 0 tol 2 (within A/A) | 367751 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 5 | 5, change +0 tol 2 (within A/A) | 5, change +0 tol 2 (within A/A) | 5 |
| frame rate Hz | 37.5 | 37.6, change +0.1 tol 8.4 (within A/A) | 33.3, change -4.2 tol 8.4 (within A/A) | 33.3 |
| rAF rate Hz | 67.5 | 60.2, change -7.3 tol 15 (within A/A) | 53.3, change -14.2 tol 15 (within A/A) | 60 |
| script ms (unjudged) | 0.04 | 0.12 | 0.3 | 0.07 |
| style ms (unjudged) | 3.6 | 2.37 | 3.4 | 3.43 |
| layout ms (unjudged) | 25.1 | 21 | 26.8 | 28.5 |
| paint ms (unjudged) | 0.65 | 0.79 | 0.82 | 0.66 |

### hero-exit / move (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 2.24 | 2.12 | 2.14 | 2.23 |
| rendering frames | 30 | 28, change -2 tol 2 (within A/A) | 29, change -1 tol 2 (within A/A) | 29 |
| rAF callbacks | 239 | 192, change -47 tol 2 | 192, change -47 tol 2 | 239 |
| rendering frames running the element code | 24 | 24, change +0 tol 2 (within A/A) | 25, change +1 tol 2 (within A/A) | 23 |
| element code FunctionCalls | 47 | 49, change +2 tol 2 (within A/A) | 49, change +2 tol 2 (within A/A) | 47 |
| FunctionCalls (all scripts) | 320 | 322, change +2 tol 2 (within A/A) | 322, change +2 tol 2 (within A/A) | 321 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 50 | 53, change +3 tol 2 | 53, change +3 tol 2 | 50 |
| layouts | 148 | 147, change -1 tol 2 (within A/A) | 147, change -1 tol 2 (within A/A) | 148 |
| paints | 111 | 49, change -62 tol 2 | 49, change -62 tol 2 | 111 |
| paint clip area, whole page (CSS px², not element-attributed) | 3908288 | 1014104, change -2894184 tol 2 | 1014104, change -2894184 tol 2 | 3908288 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 50 | 50, change +0 tol 2 (within A/A) | 50, change +0 tol 2 (within A/A) | 50 |
| frame rate Hz | 13.4 | 13.2, change -0.2 tol 2 (within A/A) | 13.6, change +0.2 tol 2 (within A/A) | 13 |
| rAF rate Hz | 107 | 90.7, change -16 tol 2 | 89.7, change -17 tol 2 | 107 |
| script ms (unjudged) | 883 | 0.76 | 0.81 | 880 |
| style ms (unjudged) | 129 | 39.2 | 36.5 | 130 |
| layout ms (unjudged) | 1868 | 1848 | 1882 | 1856 |
| paint ms (unjudged) | 2.67 | 0.92 | 0.98 | 2.54 |

### hero-exit / move-frame (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 2.24 | 2.12 | 2.14 | 2.23 |
| rendering frames | 30 | 28, change -2 tol 2 (within A/A) | 29, change -1 tol 2 (within A/A) | 29 |
| rAF callbacks | 7.97 | 6.86, change -1.11 tol 2 (within A/A) | 6.62, change -1.35 tol 2 (within A/A) | 8.24 |
| rendering frames running the element code | 0.8 | 0.86, change +0.06 tol 2 (within A/A) (low-power) | 0.86, change +0.06 tol 2 (within A/A) (low-power) | 0.79 |
| element code FunctionCalls | 1.57 | 1.75, change +0.18 tol 2 (within A/A) (low-power) | 1.69, change +0.12 tol 2 (within A/A) (low-power) | 1.62 |
| FunctionCalls (all scripts) | 10.7 | 11.5, change +0.83 tol 2 (within A/A) | 11.1, change +0.44 tol 2 (within A/A) | 11.1 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 1.67 | 1.89, change +0.23 tol 2 (within A/A) (low-power) | 1.83, change +0.16 tol 2 (within A/A) (low-power) | 1.72 |
| layouts | 4.93 | 5.25, change +0.32 tol 2 (within A/A) | 5.07, change +0.14 tol 2 (within A/A) | 5.1 |
| paints | 3.7 | 1.75, change -1.95 tol 2 (within A/A) (low-power) | 1.69, change -2.01 tol 2 (low-power) | 3.83 |
| paint clip area, whole page (CSS px², not element-attributed) | 130276 | 36218, change -94058 tol 8985 | 34969, change -95307 tol 8985 | 134769 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 1.67 | 1.79, change +0.12 tol 2 (within A/A) (low-power) | 1.72, change +0.06 tol 2 (within A/A) (low-power) | 1.72 |
| frame rate Hz | 13.4 | 13.2, change -0.2 tol 2 (within A/A) | 13.6, change +0.2 tol 2 (within A/A) | 13 |
| rAF rate Hz | 107 | 90.7, change -16 tol 2 | 89.7, change -17 tol 2 | 107 |
| script ms (unjudged) | 883 | 0.76 | 0.81 | 880 |
| style ms (unjudged) | 129 | 39.2 | 36.5 | 130 |
| layout ms (unjudged) | 1868 | 1848 | 1882 | 1856 |
| paint ms (unjudged) | 2.67 | 0.92 | 0.98 | 2.54 |

### hero-exit / rest (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 0.71 | 0.71 | 0.7 | 0.72 |
| rendering frames | 10 | 10, change +0 tol 2 (within A/A) | 10, change +0 tol 2 (within A/A) | 9 |
| rAF callbacks | 7 | 5, change -2 tol 2 (within A/A) | 5, change -2 tol 2 (within A/A) | 7 |
| rendering frames running the element code | 2 | 1, change -1 tol 2 (within A/A) (low-power) | 1, change -1 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| FunctionCalls (all scripts) | 12 | 11, change -1 tol 2 (within A/A) | 11, change -1 tol 2 (within A/A) | 11 |
| timer fires | 3 | 4, change +1 tol 2 (within A/A) (low-power) | 4, change +1 tol 2 (within A/A) (low-power) | 3 |
| style recalcs | 8 | 14, change +6 tol 2 | 14, change +6 tol 2 | 9 |
| layouts | 7 | 6, change -1 tol 2 (within A/A) | 6, change -1 tol 2 (within A/A) | 8 |
| paints | 5 | 5, change +0 tol 8 (within A/A) (low-power) | 6, change +1 tol 8 (within A/A) (low-power) | 9 |
| paint clip area, whole page (CSS px², not element-attributed) | 35552 | 55092, change +19540 tol 712762 (within A/A) (low-power) | 56291, change +20739 tol 712762 (within A/A) (low-power) | 391933 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 11 | 11, change +0 tol 2 (within A/A) | 11, change +0 tol 2 (within A/A) | 10 |
| frame rate Hz | 14.1 | 14.2, change +0.1 tol 3.2 (within A/A) | 14.2, change +0.1 tol 3.2 (within A/A) | 12.5 |
| rAF rate Hz | 9.9 | 7.1, change -2.8 tol 2 | 7.1, change -2.8 tol 2 | 9.7 |
| script ms (unjudged) | 0.06 | 0.84 | 0.51 | 0.07 |
| style ms (unjudged) | 5.6 | 67.9 | 66.7 | 7.59 |
| layout ms (unjudged) | 116 | 90.7 | 106 | 153 |
| paint ms (unjudged) | 0.38 | 0.29 | 0.28 | 0.35 |

### hero-exit / ts-mid (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 0.07 | 0.07 | 0.07 | 0.06 |
| rendering frames | 4 | 4, change +0 tol 2 (within A/A) | 4, change +0 tol 2 (within A/A) | 4 |
| rAF callbacks | 4 | 4, change +0 tol 2 (within A/A) | 4, change +0 tol 2 (within A/A) | 4 |
| rendering frames running the element code | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| element code FunctionCalls | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| FunctionCalls (all scripts) | 4 | 5, change +1 tol 2 (within A/A) | 5, change +1 tol 2 (within A/A) | 4 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 3 | 4, change +1 tol 2 (within A/A) (low-power) | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| layouts | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| paints | 2 | 3, change +1 tol 2 (within A/A) (low-power) | 3, change +1 tol 2 (within A/A) (low-power) | 1 |
| paint clip area, whole page (CSS px², not element-attributed) | 2380 | 3540, change +1160 tol 2365 (within A/A) (low-power) | 3562, change +1182 tol 2365 (within A/A) (low-power) | 1198 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 61.3 | 56.7, change -4.6 tol 2 | 58.4, change -2.9 tol 2 | 62.1 |
| rAF rate Hz | 61.3 | 56.7, change -4.6 tol 2 | 58.4, change -2.9 tol 2 | 62.1 |
| script ms (unjudged) | 0 | 0.08 | 0 | 0 |
| style ms (unjudged) | 1.6 | 58.5 | 56.7 | 1.51 |
| layout ms (unjudged) | 54.8 | 55.1 | 53.8 | 53.7 |
| paint ms (unjudged) | 0.02 | 0.02 | 0.03 | 0.01 |

### hero-exit / scroll-mid (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 0.17 | 0.15 | 0.16 | 0.15 |
| rendering frames | 5 | 5, change +0 tol 2 (within A/A) | 4, change -1 tol 2 (within A/A) | 5 |
| rAF callbacks | 9 | 8, change -1 tol 2 (within A/A) | 8, change -1 tol 2 (within A/A) | 9 |
| rendering frames running the element code | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 0, change -1 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 1, change +0 tol 2 (within A/A) (low-power) | 1 |
| FunctionCalls (all scripts) | 11 | 11, change +0 tol 2 (within A/A) | 11, change +0 tol 2 (within A/A) | 11 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 6 | 5, change -1 tol 2 (within A/A) | 6, change +0 tol 2 (within A/A) | 6 |
| layouts | 9 | 7, change -2 tol 2 (within A/A) | 7, change -2 tol 2 (within A/A) | 8 |
| paints | 5 | 5, change +0 tol 2 (within A/A) | 5, change +0 tol 2 (within A/A) | 5 |
| paint clip area, whole page (CSS px², not element-attributed) | 357617 | 25568, change -332049 tol 15.5 | 25568, change -332049 tol 15.5 | 357609 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 5 | 5, change +0 tol 2 (within A/A) | 5, change +0 tol 2 (within A/A) | 5 |
| frame rate Hz | 29.6 | 33.1, change +3.5 tol 6.2 (within A/A) | 25.7, change -3.9 tol 6.2 (within A/A) | 32.7 |
| rAF rate Hz | 53.3 | 52.9, change -0.4 tol 11 (within A/A) | 51.4, change -1.9 tol 11 (within A/A) | 58.8 |
| script ms (unjudged) | 20.5 | 0.01 | 0.12 | 19.3 |
| style ms (unjudged) | 5.37 | 96.2 | 101 | 5.38 |
| layout ms (unjudged) | 147 | 128 | 132 | 128 |
| paint ms (unjudged) | 0.07 | 0.05 | 0.05 | 0.07 |

### hero-exit / move2 (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 2.01 | 1.91 | 1.92 | 2.01 |
| rendering frames | 24 | 26, change +2 tol 4 (within A/A) | 26, change +2 tol 4 (within A/A) | 26 |
| rAF callbacks | 194 | 156, change -38 tol 2 | 156, change -38 tol 2 | 194 |
| rendering frames running the element code | 18 | 22, change +4 tol 4 (within A/A) | 22, change +4 tol 4 (within A/A) | 20 |
| element code FunctionCalls | 38 | 40, change +2 tol 2 (within A/A) | 40, change +2 tol 2 (within A/A) | 38 |
| FunctionCalls (all scripts) | 261 | 263, change +2 tol 2 (within A/A) | 263, change +2 tol 2 (within A/A) | 262 |
| timer fires | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| style recalcs | 59 | 43, change -16 tol 2 | 43, change -16 tol 2 | 58 |
| layouts | 134 | 134, change +0 tol 4 (within A/A) | 134, change +0 tol 4 (within A/A) | 132 |
| paints | 80 | 41, change -39 tol 2 | 41, change -39 tol 2 | 80 |
| paint clip area, whole page (CSS px², not element-attributed) | 14910340 | 829065, change -14081275 tol 2 | 829065, change -14081275 tol 2 | 14910340 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 41 | 41, change +0 tol 2 (within A/A) | 41, change +0 tol 2 (within A/A) | 41 |
| frame rate Hz | 11.9 | 13.6, change +1.7 tol 2 (within A/A) | 13.5, change +1.6 tol 2 (within A/A) | 12.9 |
| rAF rate Hz | 96.5 | 81.5, change -15 tol 2 | 81.2, change -15.3 tol 2 | 96.5 |
| script ms (unjudged) | 708 | 0.71 | 0.45 | 715 |
| style ms (unjudged) | 116 | 263 | 269 | 119 |
| layout ms (unjudged) | 1704 | 1695 | 1716 | 1697 |
| paint ms (unjudged) | 2.24 | 0.76 | 0.71 | 2.46 |

### hero-exit / move2-frame (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 2.01 | 1.91 | 1.92 | 2.01 |
| rendering frames | 24 | 26, change +2 tol 4 (within A/A) | 26, change +2 tol 4 (within A/A) | 26 |
| rAF callbacks | 8.08 | 6, change -2.08 tol 2 | 6, change -2.08 tol 2 | 7.46 |
| rendering frames running the element code | 0.75 | 0.85, change +0.1 tol 2 (within A/A) (low-power) | 0.85, change +0.1 tol 2 (within A/A) (low-power) | 0.77 |
| element code FunctionCalls | 1.58 | 1.54, change -0.04 tol 2 (within A/A) (low-power) | 1.54, change -0.04 tol 2 (within A/A) (low-power) | 1.46 |
| FunctionCalls (all scripts) | 10.9 | 10.1, change -0.76 tol 2 (within A/A) | 10.1, change -0.76 tol 2 (within A/A) | 10.1 |
| timer fires | 0.08 | 0.08, change -0.01 tol 2 (within A/A) (low-power) | 0.08, change -0.01 tol 2 (within A/A) (low-power) | 0.08 |
| style recalcs | 2.46 | 1.65, change -0.8 tol 2 (within A/A) (low-power) | 1.65, change -0.8 tol 2 (within A/A) (low-power) | 2.23 |
| layouts | 5.58 | 5.15, change -0.43 tol 2 (within A/A) | 5.15, change -0.43 tol 2 (within A/A) | 5.08 |
| paints | 3.33 | 1.58, change -1.76 tol 2 (within A/A) (low-power) | 1.58, change -1.76 tol 2 (within A/A) (low-power) | 3.08 |
| paint clip area, whole page (CSS px², not element-attributed) | 621264 | 31887, change -589377 tol 95579 | 31887, change -589377 tol 95579 | 573475 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 1.71 | 1.58, change -0.13 tol 2 (within A/A) (low-power) | 1.58, change -0.13 tol 2 (within A/A) (low-power) | 1.58 |
| frame rate Hz | 11.9 | 13.6, change +1.7 tol 2 (within A/A) | 13.5, change +1.6 tol 2 (within A/A) | 12.9 |
| rAF rate Hz | 96.5 | 81.5, change -15 tol 2 | 81.2, change -15.3 tol 2 | 96.5 |
| script ms (unjudged) | 708 | 0.71 | 0.45 | 715 |
| style ms (unjudged) | 116 | 263 | 269 | 119 |
| layout ms (unjudged) | 1704 | 1695 | 1716 | 1697 |
| paint ms (unjudged) | 2.24 | 0.76 | 0.71 | 2.46 |

### hero-exit / rest2 (sim)

FULL: loads C 1, V 1, F 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | V | F | C2 |
|---|---|---|---|---|
| element events per load | 1 | 1 | 1 | 1 |
| seconds per event | 0.7 | 0.7 | 0.7 | 0.7 |
| rendering frames | 3 | 6, change +3 tol 2 (low-power) | 6, change +3 tol 2 (low-power) | 3 |
| rAF callbacks | 7 | 5, change -2 tol 2 (within A/A) | 5, change -2 tol 2 (within A/A) | 7 |
| rendering frames running the element code | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| element code FunctionCalls | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| FunctionCalls (all scripts) | 9 | 9, change +0 tol 2 (within A/A) | 9, change +0 tol 2 (within A/A) | 9 |
| timer fires | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| style recalcs | 0 | 7, change +7 tol 2 (low-power) | 7, change +7 tol 2 (low-power) | 0 |
| layouts | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paints | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paint clip area, whole page (CSS px², not element-attributed) | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| paints of the element | - | - | - | - |
| repaint area on the element (device Mpx) | - | - | - | - |
| Composite | 3 | 6, change +3 tol 2 (low-power) | 6, change +3 tol 2 (low-power) | 3 |
| frame rate Hz | 4.3 | 8.5, change +4.2 tol 2 | 8.5, change +4.2 tol 2 | 4.3 |
| rAF rate Hz | 10 | 7.1, change -2.9 tol 2 | 7.1, change -2.9 tol 2 | 10 |
| script ms (unjudged) | 0.05 | 0.18 | 0.18 | 0.05 |
| style ms (unjudged) | 0 | 2.76 | 2.59 | 0 |
| layout ms (unjudged) | 0 | 0 | 0 | 0 |
| paint ms (unjudged) | 0 | 0 | 0 | 0 |

## What this card cannot say

- Frame time, smoothness, finger feel and hot-only behaviour: those stay with the phone (V stage).
- Raster and GPU time. Memory and area are proxies, and Chrome memory is an estimate.
- Costs merged in from neighbours (H9). The FULL context hints at them but does not measure them.

## Status of the sources

- Field 3, Sim: a Timeline Paint clip is in root-view coordinates (CONFIRMED, WebKit PageTimelineAgent::didPaint); that it matches getBoundingClientRect on iOS at scrollY > 0 is UNRESOLVED. Field 1, Sim: the behavioural reading (no element script per moving frame) is a method, OBSERVED; WebKit has no per-animation "accelerated" flag.

