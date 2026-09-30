562 samples 2026-09-30T21:56:51.893Z .. 2026-09-30T22:45:16.832Z (CPU % of the whole 8-core machine; median / p90)

| phase | n | load1 med [p10-p90] | CPU % med / p90 | measured Chrome (rend/gpu/browser+other) | other Chrome | node servers | node tools+tests | claude | serena/python | WindowServer | other | free GB | compressor GB | decompr/s med | pageins/s med |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before slot (others measuring, 21:56-22:31) | 410 | 12.4 [8.1-17.3] | 27.6 / 36.2 | 3.4 / 13.9 / 2.3 / 4.3 / 0.1 / 1.3 | 0 / 6.7 | 0 / 1.1 | 0.2 / 1.5 | 1.5 / 2.2 | 0 / 0 | 6.1 / 6.2 | 8.9 / 13.7 | 0.5 | 5.1 | 38 | 2028 |
| c1 (1 Chrome) | 35 | 26.6 [18.3-34.5] | 34.7 / 43.6 | 9.5 / 14 / 3.1 / 4.7 / 0.5 / 2.3 | 0 / 0 | 0.1 / 2.8 | 1.6 / 5 | 1.9 / 2.4 | 0 / 0 | 5.9 / 6.1 | 12.4 / 15.5 | 0.4 | 5.3 | 238 | 3498 |
| c2 (2 Chromes) | 37 | 40.7 [24.7-55.1] | 53 / 61 | 13.5 / 28.6 / 5.9 / 10.4 / 0.7 / 3.3 | 0 / 0 | 0.8 / 5.7 | 2 / 4.9 | 1.9 / 3.2 | 0 / 0 | 6.4 / 6.9 | 14 / 17.4 | 0.2 | 5.7 | 1496 | 3059 |
| c3 (3 Chromes) | 34 | 43.9 [34.9-50.2] | 65.4 / 79.2 | 23.6 / 41.2 / 10.2 / 15.5 / 1.2 / 4.8 | 0 / 0 | 0.8 / 9.3 | 1.1 / 3.4 | 1.7 / 2.3 | 0 / 0 | 7.2 / 8 | 13.5 / 19.1 | 0.1 | 6.3 | 3919 | 1736 |
| after slot (22:42-now) | 38 | 26.4 [20.1-44.8] | 30.8 / 36.2 | 6.4 / 13.9 / 2.8 / 4.7 / 0.3 / 1.4 | 0 / 0 | 0 / 1.6 | 0.1 / 0.6 | 1.8 / 2.5 | 0 / 0 | 5.9 / 6.2 | 8.6 / 14.4 | 0.8 | 5.1 | 84 | 2036 |

process counts (last sample): node servers 7, node other 16, node tools 9, other Chrome 9, measured Chrome roots 1; memory pressure levels seen: 1,2; swap used max 0 MB
| phase | n | load1 med [p10-p90] | CPU % med / p90 | measured Chrome (rend/gpu/browser+other) | other Chrome | node servers | node tools+tests | claude | serena/python | WindowServer | other | free GB | compressor GB | decompr/s med | pageins/s med |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| all | 562 | 14.3 [8.7-38.4] | 30 / 46.7 | 4.8 / 14 / 2.5 / 5.3 / 0.2 / 1.4 | 0 / 4.8 | 0.1 / 1.6 | 0.2 / 2.7 | 1.6 / 2.3 | 0 / 0 | 6.1 / 6.4 | 9.2 / 14.9 | 0.5 | 5.1 | 62 | 2133 |
| other agent measuring | 420 | 12.8 [8.2-20.2] | 28.3 / 36.4 | 4.1 / 13.9 / 2.4 / 4.3 / 0.1 / 1.3 | 0 / 6.2 | 0 / 1.1 | 0.2 / 1.3 | 1.5 / 2.2 | 0 / 0 | 6 / 6.2 | 8.8 / 13.2 | 0.5 | 5.1 | 39 | 2025 |
| lock free | 28 | 14.6 [10.2-44.8] | 20.1 / 27 | 0 / 0 / 0 / 0 / 0 / 0 | 0 / 0 | 0 / 0.2 | 0.1 / 2.7 | 2 / 2.6 | 0 / 0 | 6 / 6.2 | 11.6 / 14.9 | 1.6 | 5.1 | 135 | 2234 |
| measure-parallel | 114 | 36.3 [23.2-51.1] | 46.5 / 72.2 | 11.3 / 34.4 / 5.1 / 12.6 / 0.8 / 3.2 | 0 / 0 | 0.5 / 5.3 | 1.5 / 4.4 | 1.8 / 2.5 | 0 / 0 | 6.2 / 7.4 | 13.1 / 16.8 | 0.3 | 5.7 | 1447 | 2688 |

process counts (last sample): node servers 7, node other 16, node tools 9, other Chrome 9, measured Chrome roots 1; memory pressure levels seen: 1,2; swap used max 0 MB
