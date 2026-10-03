# Rendering cost card: hero-exit-threaded

Arms C, F7; control C; A/A C vs C2. Counts per element event, median over page loads [min-max]. In brackets after an arm: its change against the control. "within A/A" means |change| ≤ tol = max(2·|C−C2|, 2). "low-power" means tol > C/2. FRZ = the rest of the page frozen, FULL = the page as served. ms are printed, never judged.

| Element / event | Engine | 1 Thread | 2 Layers, memory | 3 Repaint per event | 4 Layout per event | 5 Script per event | Page around it (FULL only) | A/A source |
|---|---|---|---|---|---|---|---|---|
| hero-exit / ts-top | sim | C: no element script per event (UNRESOLVED)<br>F7: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 0 · F7 0 (+0, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · F7 0 (+0, within A/A, low-power) | layouts, FULL: C 0 · F7 0 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 0 · F7 1 (+1, within A/A, low-power)<br>style recalcs, FULL: C 0 · F7 0 (+0, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 4 · F7 5 (+1, within A/A) | rendering frames: C 3 · F7 3 (+0, within A/A, low-power)<br>frame rate Hz: C 49 · F7 45 (-4, within A/A)<br>rAF rate Hz: C 65.4 · F7 60 (-5.4, within A/A)<br>Composite: C 3 · F7 3 (+0, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / scroll-top | sim | C: main thread per event (1 element code calls per event) (OBSERVED)<br>F7: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 55 · F7 55 (+0, within A/A)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.37 · F7 0.37 (+0, within A/A) | layouts, FULL: C 2 · F7 2 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 1 · F7 2 (+1, within A/A, low-power)<br>style recalcs, FULL: C 1 · F7 1 (+0, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 12 · F7 13 (+1, within A/A) | rendering frames: C 4 · F7 5 (+1, within A/A)<br>frame rate Hz: C 30.1 · F7 36.4 (+6.3, within A/A, low-power)<br>rAF rate Hz: C 67.7 · F7 65.5 (-2.2, within A/A)<br>Composite: C 5 · F7 5 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move | sim | C: main thread every frame (element code in 24 of 31 frames per event) (OBSERVED)<br>F7: main thread every frame (element code in 25 of 31 frames per event) (OBSERVED) | - | paints, FULL: C 111 · F7 104 (-7)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 3.91 · F7 1.25 (-2.66) | layouts, FULL: C 148 · F7 148 (+0, within A/A) | element code FunctionCalls, FULL: C 47 · F7 52 (+5)<br>style recalcs, FULL: C 50 · F7 51 (+1, within A/A)<br>FunctionCalls (all scripts), FULL: C 322 · F7 326 (+4) | rendering frames: C 31 · F7 31 (+0, within A/A)<br>frame rate Hz: C 14.5 · F7 14.8 (+0.3, within A/A)<br>rAF rate Hz: C 112 · F7 92.9 (-19.2)<br>Composite: C 50 · F7 50 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / rest | sim | C: main thread per event (2 element code calls per event) (OBSERVED)<br>F7: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 5 · F7 10 (+5)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.39 · F7 0.68 (+0.29, within A/A, low-power) | layouts, FULL: C 4 · F7 5 (+1, within A/A) | element code FunctionCalls, FULL: C 2 · F7 2 (+0, within A/A, low-power)<br>style recalcs, FULL: C 5 · F7 11 (+6)<br>FunctionCalls (all scripts), FULL: C 11 · F7 12 (+1, within A/A) | rendering frames: C 6 · F7 9 (+3, within A/A, low-power)<br>frame rate Hz: C 8.5 · F7 12.8 (+4.3, within A/A, low-power)<br>rAF rate Hz: C 10 · F7 7.1 (-2.9)<br>Composite: C 6 · F7 10 (+4, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / ts-mid | sim | C: no element script per event (UNRESOLVED)<br>F7: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 2 · F7 2 (+0, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · F7 0 (0, within A/A) | layouts, FULL: C 3 · F7 3 (+0, within A/A, low-power) | element code FunctionCalls, FULL: C 0 · F7 1 (+1, within A/A, low-power)<br>style recalcs, FULL: C 3 · F7 3 (+0, within A/A, low-power)<br>FunctionCalls (all scripts), FULL: C 4 · F7 5 (+1, within A/A) | rendering frames: C 3 · F7 4 (+1, within A/A, low-power)<br>frame rate Hz: C 48.5 · F7 56.5 (+8, within A/A, low-power)<br>rAF rate Hz: C 64.7 · F7 56.5 (-8.2)<br>Composite: C 3 · F7 3 (+0, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / scroll-mid | sim | C: main thread per event (1 element code calls per event) (OBSERVED)<br>F7: main thread per event (1 element code calls per event) (OBSERVED) | - | paints, FULL: C 5 · F7 8 (+3, within A/A, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0.36 · F7 0.41 (+0.05) | layouts, FULL: C 8 · F7 7 (-1, within A/A) | element code FunctionCalls, FULL: C 1 · F7 1 (+0, within A/A, low-power)<br>style recalcs, FULL: C 6 · F7 5 (-1, within A/A)<br>FunctionCalls (all scripts), FULL: C 11 · F7 11 (+0, within A/A) | rendering frames: C 5 · F7 4 (-1, within A/A)<br>frame rate Hz: C 33.8 · F7 22.8 (-11, within A/A)<br>rAF rate Hz: C 60.9 · F7 45.6 (-15.3)<br>Composite: C 5 · F7 5 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / move2 | sim | C: main thread every frame (element code in 17 of 25 frames per event) (OBSERVED)<br>F7: main thread every frame (element code in 21 of 26 frames per event) (OBSERVED) | - | paints, FULL: C 81 · F7 42 (-39)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 14.9 · F7 0.83 (-14.1) | layouts, FULL: C 136 · F7 135 (-1, within A/A) | element code FunctionCalls, FULL: C 38 · F7 40 (+2, within A/A)<br>style recalcs, FULL: C 61 · F7 43 (-18)<br>FunctionCalls (all scripts), FULL: C 262 · F7 263 (+1, within A/A) | rendering frames: C 25 · F7 26 (+1, within A/A)<br>frame rate Hz: C 12.8 · F7 13.6 (+0.8, within A/A)<br>rAF rate Hz: C 99.5 · F7 81.5 (-18)<br>Composite: C 41 · F7 41 (+0, within A/A) | C vs C2, sim FULL, loads 1/1 |
| hero-exit / rest2 | sim | C: main thread every frame (element code in 2 of 3 frames per event) (OBSERVED)<br>F7: main thread per event (2 element code calls per event) (OBSERVED) | - | paints, FULL: C 0 · F7 6 (+6, low-power)<br>paint clip area, whole page (CSS px², not element-attributed) (millions), FULL: C 0 · F7 0.32 (+0.32, low-power) | layouts, FULL: C 0 · F7 1 (+1, within A/A, low-power) | element code FunctionCalls, FULL: C 2 · F7 2 (+0, within A/A, low-power)<br>style recalcs, FULL: C 0 · F7 5 (+5, low-power)<br>FunctionCalls (all scripts), FULL: C 9 · F7 9 (+0, within A/A) | rendering frames: C 3 · F7 5 (+2, within A/A, low-power)<br>frame rate Hz: C 4.3 · F7 7.1 (+2.8)<br>rAF rate Hz: C 10 · F7 7.1 (-2.9)<br>Composite: C 3 · F7 5 (+2, within A/A, low-power) | C vs C2, sim FULL, loads 1/1 |

Frame-driven counts (main or rendering frames, Layerize, Composite, frame and rAF rates) come from the FULL page only and are never the element's alone (README §6.2, H9). They stand beside every per-event number so a per-time reading can be checked against them.

## Details per row

### hero-exit / ts-top (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.06 | 0.07 | 0.05 |
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
| frame rate Hz | 49 | 45, change -4 tol 17.8 (within A/A) | 57.9 |
| rAF rate Hz | 65.4 | 60, change -5.4 tol 23.4 (within A/A) | 77.1 |
| script ms (unjudged) | 0 | 0.17 | 0 |
| style ms (unjudged) | 0 | 0 | 0 |
| layout ms (unjudged) | 0 | 0 | 0 |
| paint ms (unjudged) | 0 | 0 | 0 |

### hero-exit / scroll-top (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.13 | 0.14 | 0.12 |
| rendering frames | 4 | 5, change +1 tol 2 (within A/A) | 5 |
| rAF callbacks | 9 | 9, change +0 tol 2 (within A/A) | 9 |
| rendering frames running the element code | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| FunctionCalls (all scripts) | 12 | 13, change +1 tol 2 (within A/A) | 12 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 1 |
| layouts | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| paints | 55 | 55, change +0 tol 2 (within A/A) | 55 |
| paint clip area, whole page (CSS px², not element-attributed) | 367751 | 367751, change +0 tol 2 (within A/A) | 367751 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 5 | 5, change +0 tol 2 (within A/A) | 5 |
| frame rate Hz | 30.1 | 36.4, change +6.3 tol 25.6 (within A/A) (low-power) | 42.9 |
| rAF rate Hz | 67.7 | 65.5, change -2.2 tol 19 (within A/A) | 77.2 |
| script ms (unjudged) | 0.04 | 0.2 | 0.06 |
| style ms (unjudged) | 3.36 | 3.44 | 2.76 |
| layout ms (unjudged) | 34.9 | 32.1 | 18.3 |
| paint ms (unjudged) | 0.61 | 0.83 | 0.58 |

### hero-exit / move (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 2.13 | 2.1 | 2.17 |
| rendering frames | 31 | 31, change +0 tol 2 (within A/A) | 32 |
| rAF callbacks | 239 | 195, change -44 tol 2 | 239 |
| rendering frames running the element code | 24 | 25, change +1 tol 6 (within A/A) | 21 |
| element code FunctionCalls | 47 | 52, change +5 tol 2 | 47 |
| FunctionCalls (all scripts) | 322 | 326, change +4 tol 2 | 321 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 50 | 51, change +1 tol 2 (within A/A) | 50 |
| layouts | 148 | 148, change +0 tol 2 (within A/A) | 147 |
| paints | 111 | 104, change -7 tol 2 | 111 |
| paint clip area, whole page (CSS px², not element-attributed) | 3908288 | 1245830, change -2662458 tol 2 | 3908288 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 50 | 50, change +0 tol 2 (within A/A) | 50 |
| frame rate Hz | 14.5 | 14.8, change +0.3 tol 2 (within A/A) | 14.7 |
| rAF rate Hz | 112 | 92.9, change -19.2 tol 4.2 | 110 |
| script ms (unjudged) | 844 | 59 | 863 |
| style ms (unjudged) | 126 | 43.2 | 127 |
| layout ms (unjudged) | 1782 | 1815 | 1809 |
| paint ms (unjudged) | 2.08 | 2.13 | 2.3 |

### hero-exit / rest (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.7 | 0.71 | 0.71 |
| rendering frames | 6 | 9, change +3 tol 4 (within A/A) (low-power) | 8 |
| rAF callbacks | 7 | 5, change -2 tol 2 (within A/A) | 7 |
| rendering frames running the element code | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 2 |
| element code FunctionCalls | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| FunctionCalls (all scripts) | 11 | 12, change +1 tol 2 (within A/A) | 12 |
| timer fires | 3 | 4, change +1 tol 2 (within A/A) (low-power) | 3 |
| style recalcs | 5 | 11, change +6 tol 2 | 6 |
| layouts | 4 | 5, change +1 tol 2 (within A/A) | 5 |
| paints | 5 | 10, change +5 tol 2 | 4 |
| paint clip area, whole page (CSS px², not element-attributed) | 387312 | 681585, change +294274 tol 705698 (within A/A) (low-power) | 34463 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 6 | 10, change +4 tol 6 (within A/A) (low-power) | 9 |
| frame rate Hz | 8.5 | 12.8, change +4.3 tol 5.4 (within A/A) (low-power) | 11.2 |
| rAF rate Hz | 10 | 7.1, change -2.9 tol 2 | 9.8 |
| script ms (unjudged) | 0.06 | 0.3 | 0.06 |
| style ms (unjudged) | 5.67 | 6.81 | 6.24 |
| layout ms (unjudged) | 78.1 | 54.3 | 91.1 |
| paint ms (unjudged) | 0.3 | 0.7 | 0.29 |

### hero-exit / ts-mid (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.06 | 0.07 | 0.07 |
| rendering frames | 3 | 4, change +1 tol 2 (within A/A) (low-power) | 4 |
| rAF callbacks | 4 | 4, change +0 tol 2 (within A/A) | 4 |
| rendering frames running the element code | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| element code FunctionCalls | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| FunctionCalls (all scripts) | 4 | 5, change +1 tol 2 (within A/A) | 4 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| layouts | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| paints | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| paint clip area, whole page (CSS px², not element-attributed) | 2307 | 2298, change -8.95 tol 118 (within A/A) | 2366 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 3 | 3, change +0 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 48.5 | 56.5, change +8 tol 25.4 (within A/A) (low-power) | 61.2 |
| rAF rate Hz | 64.7 | 56.5, change -8.2 tol 7 | 61.2 |
| script ms (unjudged) | 0 | 0 | 0 |
| style ms (unjudged) | 1.4 | 1.55 | 1.51 |
| layout ms (unjudged) | 52.2 | 53.5 | 53 |
| paint ms (unjudged) | 0.01 | 0.01 | 0.02 |

### hero-exit / scroll-mid (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.15 | 0.18 | 0.15 |
| rendering frames | 5 | 4, change -1 tol 2 (within A/A) | 4 |
| rAF callbacks | 9 | 8, change -1 tol 2 (within A/A) | 9 |
| rendering frames running the element code | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 1 |
| element code FunctionCalls | 1 | 1, change +0 tol 2 (within A/A) (low-power) | 1 |
| FunctionCalls (all scripts) | 11 | 11, change +0 tol 2 (within A/A) | 11 |
| timer fires | 0 | 0, change +0 tol 2 (within A/A) (low-power) | 0 |
| style recalcs | 6 | 5, change -1 tol 2 (within A/A) | 6 |
| layouts | 8 | 7, change -1 tol 2 (within A/A) | 8 |
| paints | 5 | 8, change +3 tol 4 (within A/A) (low-power) | 7 |
| paint clip area, whole page (CSS px², not element-attributed) | 357559 | 406944, change +49385 tol 4932 | 360025 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 5 | 5, change +0 tol 2 (within A/A) | 5 |
| frame rate Hz | 33.8 | 22.8, change -11 tol 14.2 (within A/A) | 26.7 |
| rAF rate Hz | 60.9 | 45.6, change -15.3 tol 2 | 60 |
| script ms (unjudged) | 18.4 | 0.15 | 19.3 |
| style ms (unjudged) | 5.22 | 62 | 5.06 |
| layout ms (unjudged) | 126 | 129 | 127 |
| paint ms (unjudged) | 0.07 | 0.31 | 0.1 |

### hero-exit / move2 (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 1.95 | 1.91 | 1.99 |
| rendering frames | 25 | 26, change +1 tol 2 (within A/A) | 25 |
| rAF callbacks | 194 | 156, change -38 tol 2 | 194 |
| rendering frames running the element code | 17 | 21, change +4 tol 4 (within A/A) | 19 |
| element code FunctionCalls | 38 | 40, change +2 tol 2 (within A/A) | 38 |
| FunctionCalls (all scripts) | 262 | 263, change +1 tol 2 (within A/A) | 261 |
| timer fires | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| style recalcs | 61 | 43, change -18 tol 2 | 60 |
| layouts | 136 | 135, change -1 tol 4 (within A/A) | 134 |
| paints | 81 | 42, change -39 tol 2 | 82 |
| paint clip area, whole page (CSS px², not element-attributed) | 14911565 | 830289, change -14081276 tol 2449 | 14912789 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 41 | 41, change +0 tol 2 (within A/A) | 41 |
| frame rate Hz | 12.8 | 13.6, change +0.8 tol 2 (within A/A) | 12.6 |
| rAF rate Hz | 99.5 | 81.5, change -18 tol 3.6 | 97.7 |
| script ms (unjudged) | 676 | 1.41 | 694 |
| style ms (unjudged) | 113 | 263 | 114 |
| layout ms (unjudged) | 1668 | 1702 | 1679 |
| paint ms (unjudged) | 2.13 | 0.73 | 2.21 |

### hero-exit / rest2 (sim)

FULL: loads C 1, F7 1, C2 1. A/A source: C vs C2, sim FULL, loads 1/1.

| Metric | C | F7 | C2 |
|---|---|---|---|
| element events per load | 1 | 1 | 1 |
| seconds per event | 0.7 | 0.7 | 0.7 |
| rendering frames | 3 | 5, change +2 tol 2 (within A/A) (low-power) | 3 |
| rAF callbacks | 7 | 5, change -2 tol 2 (within A/A) | 7 |
| rendering frames running the element code | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| element code FunctionCalls | 2 | 2, change +0 tol 2 (within A/A) (low-power) | 2 |
| FunctionCalls (all scripts) | 9 | 9, change +0 tol 2 (within A/A) | 9 |
| timer fires | 1 | 2, change +1 tol 2 (within A/A) (low-power) | 1 |
| style recalcs | 0 | 5, change +5 tol 2 (low-power) | 0 |
| layouts | 0 | 1, change +1 tol 2 (within A/A) (low-power) | 0 |
| paints | 0 | 6, change +6 tol 2 (low-power) | 0 |
| paint clip area, whole page (CSS px², not element-attributed) | 0 | 315087, change +315087 tol 2 (low-power) | 0 |
| paints of the element | - | - | - |
| repaint area on the element (device Mpx) | - | - | - |
| Composite | 3 | 5, change +2 tol 2 (within A/A) (low-power) | 3 |
| frame rate Hz | 4.3 | 7.1, change +2.8 tol 2 | 4.3 |
| rAF rate Hz | 10 | 7.1, change -2.9 tol 2 | 10 |
| script ms (unjudged) | 0.06 | 0.4 | 0.06 |
| style ms (unjudged) | 0 | 5.38 | 0 |
| layout ms (unjudged) | 0 | 0.13 | 0 |
| paint ms (unjudged) | 0 | 0.37 | 0 |

## What this card cannot say

- Frame time, smoothness, finger feel and hot-only behaviour: those stay with the phone (V stage).
- Raster and GPU time. Memory and area are proxies, and Chrome memory is an estimate.
- Costs merged in from neighbours (H9). The FULL context hints at them but does not measure them.

## Status of the sources

- Field 3, Sim: a Timeline Paint clip is in root-view coordinates (CONFIRMED, WebKit PageTimelineAgent::didPaint); that it matches getBoundingClientRect on iOS at scrollY > 0 is UNRESOLVED. Field 1, Sim: the behavioural reading (no element script per moving frame) is a method, OBSERVED; WebKit has no per-animation "accelerated" flag.

