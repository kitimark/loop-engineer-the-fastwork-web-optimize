#!/usr/bin/env node
// Self-test of verdict.mjs (pure logic, no device, no Chrome, no lock): node research/phone-thermal-gate/selftest.mjs
import assert from 'node:assert/strict';
import { gateVerdict as v } from './verdict.mjs';
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
console.log(`thermal-gate verdict self-test: ${n} OK, 0 failed`);
