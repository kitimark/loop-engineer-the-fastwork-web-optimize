---
name: verify-platform-claims
description: "probe-found browser behaviour stays OBSERVED until a doc, source or bug confirms it; rule text in CLAUDE.md \"Platform claims\""
type: feedback
audience: every agent
since: 2026-10-01
updated: 2026-10-01
---

**Rule.** A browser/engine limitation found by our own probes stays OBSERVED until checked against a reference (spec,
CDP/MDN/WebKit/Chromium docs, engine source and history, bug tracker), cited with link plus line or commit. Plan the
research, then do it. Rule text: CLAUDE.md "Platform claims: confirm against a reference".

**Why.** On 2026-10-01 the lead passed "Chrome 154 never sends layerPainted" to the user as fact, resting on two probes
that saw zero events. The user asked whether anyone had checked reference docs, and asked for the rule to be written
down and the team structure revised.

**How to apply.** Before telling the user about a limitation, check its status; if OBSERVED, say so and route
verification. Before signing a card that depends on such a claim, ask for verification.

Related: [agent-spawn-names](agent-spawn-names.md).
