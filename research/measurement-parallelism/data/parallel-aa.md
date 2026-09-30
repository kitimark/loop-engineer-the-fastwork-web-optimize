
### c1: 1 simultaneous process(es) x 3 runs x 2 sides (22:31:57-22:34:59 UTC)
monitor: load1 median 26.6 (max 36.4), CPU 34.7% (p90 43.6%), measured renderers 9.5%, GPU 3.1%, WindowServer 5.9%, free min 0.07 GB, pageins/s 3498, measured Chromes up to 1

| metric | pooled median [min-max] | SD | MAD | per-process medians | per-process [min-max] | published floor |
|---|---|---|---|---|---|---|
| fps | 64 [59.8-70.2] | 4.1 | 3 | 63.949999999999996 | 59.8-70.2 | 71.4-77 |
| gt20 | 126.5 [94-148] | 23.6 | 21 | 126.5 | 94-148 | 54-78 |
| gt34 | 16 [11-22] | 3.8 | 2 | 16 | 11-22 | 7-10 |
| gt50 | 7.5 [5-13] | 2.8 | 1 | 7.5 | 5-13 | 3-5 |
| max | 112.1 [99.3-125] | 10.3 | 8.3 | 112.05 | 99.3-125 |  |
| p95 | 32.9 [25.8-33.7] | 3.8 | 0.6 | 32.85 | 25.8-33.7 |  |
| loafMs | 391 [367-524] | 58.1 | 20 | 391 | 367-524 | 195-283 |
| forcedLayoutMs | 97 [63-153] | 29.2 | 5 | 97 | 63-153 | 34-83 |
| morph fps | 106.1 [104.1-108.6] | | | | | |

A/A false positives (base vs base2 ranges don't overlap, per process): p0: none
base - base2 median deltas: p0 gt20 25 fps -2 loaf 29
process wall time (s): p0 182

### c2: 2 simultaneous process(es) x 3 runs x 2 sides (22:35:00-22:38:25 UTC)
monitor: load1 median 40.7 (max 61), CPU 53% (p90 61%), measured renderers 13.5%, GPU 5.9%, WindowServer 6.4%, free min 0.05 GB, pageins/s 3059, measured Chromes up to 2

| metric | pooled median [min-max] | SD | MAD | per-process medians | per-process [min-max] | published floor |
|---|---|---|---|---|---|---|
| fps | 63.5 [59.5-66.5] | 2.1 | 0.6 | 63 / 63.849999999999994 | 60.4-64 / 59.5-66.5 | 71.4-77 |
| gt20 | 129.5 [104-139] | 11 | 5.5 | 129.5 / 131 | 109-135 / 104-139 | 54-78 |
| gt34 | 15 [10-19] | 2.5 | 1.5 | 15 / 15.5 | 10-19 / 14-18 | 7-10 |
| gt50 | 6.5 [5-9] | 1.2 | 0.5 | 7 / 6 | 6-9 / 5-7 | 3-5 |
| max | 121.1 [108.4-133.5] | 8.4 | 4.4 | 117 / 125.30000000000001 | 108.7-125.6 / 108.4-133.5 |  |
| p95 | 32.6 [25.7-33.3] | 3.5 | 0.7 | 32.6 / 29.599999999999998 | 25.9-33.1 / 25.7-33.3 |  |
| loafMs | 440.5 [347-487] | 51.5 | 43.5 | 430 / 440.5 | 347-487 / 372-485 | 195-283 |
| forcedLayoutMs | 112 [47-129] | 26.9 | 8.5 | 119 / 110 | 47-129 / 54-129 | 34-83 |
| morph fps | 104.1 [98.6-106.9] | | | | | |

A/A false positives (base vs base2 ranges don't overlap, per process): p0: none; p1: none
base - base2 median deltas: p0 gt20 -5 fps 3.3 loaf -77; p1 gt20 11 fps -0.8 loaf 78
process wall time (s): p0 205, p1 205

### c3: 3 simultaneous process(es) x 3 runs x 2 sides (22:38:26-22:41:41 UTC)
monitor: load1 median 43.9 (max 55.9), CPU 65.4% (p90 79.2%), measured renderers 23.6%, GPU 10.2%, WindowServer 7.2%, free min 0.07 GB, pageins/s 1736, measured Chromes up to 3

| metric | pooled median [min-max] | SD | MAD | per-process medians | per-process [min-max] | published floor |
|---|---|---|---|---|---|---|
| fps | 68.2 [14-76.4] | 13.4 | 2.1 | 68 / 67.65 / 68.44999999999999 | 65.1-74.7 / 14-72.6 / 65.4-76.4 | 71.4-77 |
| gt20 | 109 [14-126] | 26.1 | 13 | 115.5 / 108 / 108.5 | 82-125 / 14-123 / 87-126 | 54-78 |
| gt34 | 15 [8-20] | 3.6 | 2.5 | 15 / 15 / 14 | 8-20 / 9-19 / 11-17 | 7-10 |
| gt50 | 6.5 [4-10] | 1.7 | 1 | 6.5 / 7 / 5.5 | 4-10 / 5-9 / 4-7 | 3-5 |
| max | 108.9 [84.2-1275.6] | 278.9 | 8.9 | 108 / 204.10000000000002 / 113.1 | 99.5-116.5 / 84.2-1275.6 / 91.4-183.4 |  |
| p95 | 32.7 [25.2-449.9] | 99 | 0.7 | 29.25 / 32.900000000000006 / 32.85 | 25.2-33.4 / 25.6-449.9 / 25.3-33.4 |  |
| loafMs | 389 [291-2021] | 397.5 | 45.5 | 376 / 510.5 / 343.5 | 297-454 / 358-2021 / 291-415 | 195-283 |
| forcedLayoutMs | 98 [66-138] | 19.3 | 10.5 | 96.5 / 100.5 / 95 | 77-138 / 66-129 / 71-107 | 34-83 |
| morph fps | 103.6 [20.7-108.1] | | | | | |

A/A false positives (base vs base2 ranges don't overlap, per process): p0: fps,gt50,p95,loafMs,forcedLayoutMs; p1: gt34,forcedLayoutMs; p2: fps,gt34,max,p95,forcedLayoutMs
base - base2 median deltas: p0 gt20 -13 fps 5.3 loaf -84; p1 gt20 -27 fps 1.3 loaf 215; p2 gt20 -11 fps 3.7 loaf -70
process wall time (s): p0 194, p1 195, p2 194
