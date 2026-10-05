# end-morph-p1-v9f: P1 on v9-final + F1 + U2 (snapshot for P-153)

int-v8 for fix-end-morph-p1's phone card P-153 (lead GO, 2026-10-06). The snapshot only: nothing is measured here, and
P1 does not land until review-end-morph-p1 passes.

## Arms

| arm | build | JS | CSS |
|---|---|---|---|
| B | plain baseline (thermal gate's timer page; no counted run) | 4606120cf392 | 27776f3d4138 |
| C | v9-final + F1 + U2 (landing base, `fixes/end-morph-v9f`, HASHES 0817a71bf0c7) | a6426953727a | e1359ab9994a |
| V | C + P1 (fix-end-morph-p1's `delta.diff` d310e4d2ba0c, commit 0af9e816) | 4da641f828bb | a81b9af7b2c9 |

Snapshot `out/emp1v9f/snap-4da641f828bb`, HASHES.txt sha256/12 **c5138adb7dd2** (full V JS
4da641f828bb419b5851c2237e33377d392ab499f11f57f24562557b896b6a46, V CSS
a81b9af7b2c90b2b095364542c8d2d2bfe5b92bbab5de463066fdd76c51f0684).

## Build

`sh fixes/end-morph-p1-v9f/build.sh`. `p1-delta.diff` is a byte copy of `fixes/end-morph-p1/delta.diff` at 0af9e816
(d310e4d2ba0c), applied unchanged with `patch -p1 -F 0`. Same rules as `fixes/end-morph-v9f/build.sh`. It refuses when:

- the delta is not d310e4d2ba0c;
- the source snapshot is not HASHES 0817a71bf0c7, unchanged;
- C is not a6426953727a / e1359ab9994a;
- the target exists (immutable);
- the apply is not strict;
- V fails `node --check`;
- the snapshot holds any file beyond the four arms' files;
- V is not 4da641f828bb / a81b9af7b2c9.

Finally it makes the snapshot read-only. A second run refuses as designed (exit 3).

The stacking order makes no difference, matching fix-end-morph-p1's own claim:

| order | JS | CSS |
|---|---|---|
| v9-final + P1 | 602aae528fe3 | a81b9af7b2c9 |
| then + F1 + U2 | 4da641f828bb | a81b9af7b2c9 |

So P1 and F1 + U2 share no lines.

## Phone servers

`sh fixes/end-morph-p1-v9f/serve.sh` starts B, C and V on plain http with OS-assigned ports, `--latency 150` and
`--vendors=local`. It is a copy of `fixes/end-morph-v9f/serve.sh` with the arms and pins changed. Before it serves, it
checks the snapshot against HASHES.txt and that HASHES.txt is c5138adb7dd2. After start it checks the served hashes (exit 4
on a wrong one).

- `check`: re-checks the running servers.
- `stop`: stops only these three servers.

Phone URLs come only from `tools/lan.mjs` (http://lan:&lt;port&gt;/).
