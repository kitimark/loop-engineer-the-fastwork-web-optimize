# joinwl-fadeonly (proposal arm, user T-204 #10/#13)

Try-it build for the Join waitlist proposal. It is option B's build (PR-012 B, P-153 V: JS `4da641f828bb`, CSS
`a81b9af7b2c9`) plus one CSS edit on `.start-selling-top-nav-btn.is-earn`. Cause and numbers:
`fixes/end-morph/README.md` section 6.

- fadeonly (this arm): the 8 px rise and the 10 px blur are removed. At the end of the page the button only fades, like
  its hide into the hero pill.
- nolift (`fixes/joinwl-nolift/`): the 8 px rise is removed; the blur and fade stay.

`patch.diff` is relative to the baseline (site-pretty), so it carries option B's changes too. Not a land path: it would
stack on option B after B lands, and the user decides on the proposal.
