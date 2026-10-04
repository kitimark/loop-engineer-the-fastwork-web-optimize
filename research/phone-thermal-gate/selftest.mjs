#!/usr/bin/env node
// Self-test of verdict.mjs (pure logic, no device, no Chrome, no lock): node research/phone-thermal-gate/selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateVerdict as v, parseThermalRows } from './verdict.mjs';
let n = 0;
const t = (name, got, code, profile, why) => { assert.equal(got.code, code, `${name}: code ${got.code} (${got.why})`); assert.equal(got.profile, profile, `${name}: profile ${got.profile}`); if (why) assert.match(got.why, why, name); n++; };
const slow = { median: 30 }, fast = { median: 8 };
// original behaviour (no --accept-induced) is unchanged
t('real serious pass', v({ state: 'Serious', induced: 'No', battC: 39, timer: slow }), 0, 'real-serious');
t('real serious, induced refused', v({ state: 'Serious', induced: 'Yes', battC: 39 }), 4, 'real-serious');
t('real serious, too cool', v({ state: 'Fair', induced: 'No', battC: 37 }), 2, 'real-serious');
t('real serious, timer grid disagrees', v({ state: 'Serious', induced: 'No', battC: 39, timer: fast }), 6, 'real-serious');
t('fair pass', v({ state: 'Fair', induced: 'No', battC: 37, expect: 'fair', timer: fast }), 0, 'real-fair');
t('fair, Serious too hot', v({ state: 'Serious', induced: 'No', battC: 39, expect: 'fair' }), 5, 'real-fair');
t('no read', v({ err: 'xctrace record exit 1' }), 1, 'real-serious');
t('ceiling battery', v({ state: 'Serious', induced: 'No', battC: 44.1 }), 3, 'real-serious');
// xcode-serious
t('xcode pass', v({ state: 'Serious', induced: 'Yes', battC: 33, acceptInduced: true }), 0, 'xcode-serious');
t('xcode pass, timer fast is only recorded', v({ state: 'Serious', induced: 'Yes', battC: 33, acceptInduced: true, timer: fast }), 0, 'xcode-serious');
t('xcode, real heat is another profile', v({ state: 'Serious', induced: 'No', battC: 39, acceptInduced: true }), 7, 'xcode-serious', /real heat/);
t('xcode, condition off (Nominal)', v({ state: 'Nominal', induced: 'No', battC: 33, acceptInduced: true }), 2, 'xcode-serious');
t('xcode, Critical keeps the ceiling', v({ state: 'Critical', induced: 'Yes', battC: 33, acceptInduced: true }), 3, 'xcode-serious');
t('xcode, battery ceiling kept', v({ state: 'Serious', induced: 'Yes', battC: 44, acceptInduced: true }), 3, 'xcode-serious');
t('xcode, no read', v({ err: 'x', acceptInduced: true }), 1, 'xcode-serious');
t('--accept-induced with --expect fair changes nothing', v({ state: 'Fair', induced: 'Yes', battC: 37, expect: 'fair', acceptInduced: true }), 4, 'real-fair');
// parseThermalRows: the xctrace export of the Thermal State table (refs resolved; Current + Induced tracks)
const p = (name, xml, want) => { const got = parseThermalRows(xml); for (const k of Object.keys(want)) { if (want[k] instanceof RegExp) assert.match(String(got[k]), want[k], `${name}: ${k} ${got[k]}`); else assert.equal(got[k], want[k], `${name}: ${k} ${got[k]}`); } n++; return got; };
const captured = readFileSync(new URL('./fixtures/induced-serious-2rows.xml', import.meta.url), 'utf8');
// the exact export under Xcode's condition (2026-10-04 22:10Z): row 2 is all refs; the old parser read state null, exit 1
const ind = p('induced 2 rows (captured)', captured, { state: 'Serious', induced: 'Yes', rows: 2, err: null });
t('induced 2 rows -> xcode pass', v({ ...ind, battC: 36.5, acceptInduced: true }), 0, 'xcode-serious');
t('induced 2 rows -> refused without --accept-induced', v({ ...ind, battC: 36.5 }), 4, 'real-serious');
// constructed from the captured structure: one Current row, no condition (real heat, or none)
const row = (id, st, track, ind) => `<row><start-time id="${id}" fmt="00:00.000.000">0</start-time><duration id="${id + 1}" fmt="10.00 s">1</duration><start-time id="${id + 2}" fmt="00:10.000.000">1</start-time><thermal-state id="${id + 3}" fmt="${st}">${st}</thermal-state><string id="${id + 4}" fmt="${track}">${track}</string><boolean id="${id + 5}" fmt="${ind}">0</boolean><narrative id="${id + 6}" fmt="${st}  thermal state"><thermal-state ref="${id + 3}"/></narrative></row>`;
const doc = (...rows) => `<?xml version="1.0"?><trace-query-result><node><schema name="device-thermal-state-intervals"></schema>${rows.join('\n')}</node></trace-query-result>`;
const real = p('real Serious, one Current row', doc(row(1, 'Serious', 'Current', 'No')), { state: 'Serious', induced: 'No', rows: 1, err: null });
t('real Serious -> xcode-serious exit 7', v({ ...real, battC: 39, acceptInduced: true }), 7, 'xcode-serious');
t('real Serious -> real-serious pass', v({ ...real, battC: 39, timer: slow }), 0, 'real-serious');
const none = p('no condition, Fair', doc(row(1, 'Fair', 'Current', 'No')), { state: 'Fair', induced: 'No', rows: 1, err: null });
t('no condition -> xcode-serious too cool', v({ ...none, battC: 36, acceptInduced: true }), 2, 'xcode-serious');
p('state changed in the Current track', doc(row(1, 'Fair', 'Current', 'No'), row(20, 'Serious', 'Current', 'No')), { state: 'Serious', err: /state changed/ });
p('condition dropped mid-read: Induced row gone, Current Fair then Serious', doc(row(1, 'Serious', 'Current', 'No'), row(20, 'Fair', 'Current', 'No'), row(40, 'Serious', 'Induced', 'Yes')), { induced: 'Yes', err: /state changed/ });
p('unresolvable ref is an error, not a guess', doc(row(1, 'Fair', 'Current', 'No').replace('<thermal-state id="4" fmt="Fair">Fair</thermal-state>', '<thermal-state ref="99"/>')), { state: null, err: /unresolvable/ });
p('no rows', doc(), { state: null, induced: null, rows: 0, err: /no thermal state row/ });
p('unlabelled rows count as Current', doc(row(1, 'Fair', '', 'No').replace(/<string[^>]*>[^<]*<\/string>/, '')), { state: 'Fair', rows: 1, err: null });
console.log(`thermal-gate verdict self-test: ${n} OK, 0 failed`);
