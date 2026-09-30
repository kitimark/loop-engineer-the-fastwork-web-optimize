// tools/lib/store.mjs: the JSON-file store helpers shared by tools/lib/incident.mjs and tools/lib/finding.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const S = await import('../../tools/lib/store.mjs');

test('idParser: short forms per prefix, junk rejected with the noun in the message', () => {
  const f = S.idParser('F', 'finding');
  for (const s of ['7', 'F-7', 'f-007', 'F007', ' F-007 ']) assert.equal(f(s), 'F-007');
  assert.equal(f('1234'), 'F-1234');
  for (const s of ['', 'x', 'I-7', 'F-', '../F-001']) assert.throws(() => f(s), /bad finding id .*expected e\.g\. F-003/);
});

test('writeJson is atomic (no temp files left), readAll sorts numerically and skips junk, nextId', () => {
  const d = tempDir('fw-store-');
  for (const n of [2, 10, 1]) S.writeJson(join(d, `F-${String(n).padStart(3, '0')}.json`), { id: `F-${String(n).padStart(3, '0')}` });
  writeFileSync(join(d, 'F-004.json'), '{ half a record');
  writeFileSync(join(d, 'I-003.json'), '{"id":"I-003"}');
  assert.deepEqual(readdirSync(d).filter((f) => f.endsWith('.tmp')), []);
  assert.deepEqual(S.readAll(d, 'F').map((i) => i.id), ['F-001', 'F-002', 'F-010']);
  assert.deepEqual(S.readAll(join(d, 'missing'), 'F'), []);
  assert.equal(S.nextId(S.readAll(d, 'F'), 'F'), 'F-011');
  assert.equal(S.nextId([], 'I'), 'I-001');
  assert.equal(S.readJson(join(d, 'F-004.json')), null);
  assert.equal(S.clip('abcdef', 3), '…def');
  assert.equal(S.clip(undefined), undefined);
});
