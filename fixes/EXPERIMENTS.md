# Experiment ledger: every variant we tried, including the bad ones

User decision, 2026-09-30: record **every** experiment, not only the winners, so nobody retries a dead end
and the reason a variant lost stays visible. One row per variant measured or tried (an A/B, a probe, an
iPhone check, an abandoned edit). The fix README keeps the detail; this file is the index. Only the lead
edits it (owners send rows to the lead, or put them in their README "Experiments tried" section, which the
lead copies here on landing).

Fields:
- **id** `<topic>/<nn>`, never reused.
- **variant**: what changed, in one line.
- **hypothesis**: the mechanism it should remove, and which metric should move.
- **result**: `better` / `within noise` / `WORSE` / `broke` (visual or functional regression) /
  `abandoned` (never measured, and why) / `superseded`.
- **validity**: `clean` (load1 <= 6, current tools) / `provisional` (load > 6, ranges disjoint) /
  `contaminated` (I-016/I-017 flag or load1 > 10 at start) / `old-tools` (before I-002 4bbd249).
- **key numbers**: the metric the hypothesis names, baseline -> variant, [min-max], n.
- **evidence**: a path to results.json, a README section or a research dir (branch if not landed).
- **lesson**: why it won or lost; link FINDINGS T/P entries.
- **status**: `landed`, `on branch`, `dropped`, `retry when <condition>`.

| id | variant | hypothesis | result | validity | key numbers | evidence | lesson | status |
|---|---|---|---|---|---|---|---|---|
