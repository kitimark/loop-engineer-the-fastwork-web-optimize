import sys
p = sys.argv[1]
s = open(p).read()
rep = [
    ('ENFORCEMENT: git hooks · git-guard · fg-guard · scope guard · baseline pin', 'ENFORCEMENT LAYER: hooks · guards · baseline pin'),
    ('<text x="806" y="330" text-anchor="middle" class="t-s">queue, then hold</text>', '<text x="887" y="322" text-anchor="middle" class="t-s">queue, then hold</text>'),
    ('<line x1="887" y1="306" x2="887" y2="428" class="s-wire-d"/>', '<line x1="887" y1="330" x2="887" y2="428" class="s-wire-d"/>'),
    # short job wider
    ('<rect x="460" y="100" width="76" height="34" rx="3" class="s-hold"/>\n      <text x="498" y="121"', '<rect x="460" y="100" width="90" height="34" rx="3" class="s-hold"/>\n      <text x="505" y="121"'),
    # shared group shifted
    ('<rect x="536" y="204" width="160" height="26" rx="3" class="s-shared"/>\n      <text x="616" y="221"', '<rect x="550" y="204" width="160" height="26" rx="3" class="s-shared"/>\n      <text x="630" y="221"'),
    ('<rect x="536" y="234" width="80" height="26" rx="3" class="s-shared"/>\n      <text x="576" y="251"', '<rect x="550" y="234" width="80" height="26" rx="3" class="s-shared"/>\n      <text x="590" y="251"'),
    ('<rect x="620" y="234" width="76" height="26" rx="3" class="s-shared"/>\n      <text x="658" y="251"', '<rect x="634" y="234" width="76" height="26" rx="3" class="s-shared"/>\n      <text x="672" y="251"'),
    # no-timing shifted
    ('<rect x="696" y="152" width="110" height="34" rx="3" class="s-hold"/>\n      <text x="751" y="173" text-anchor="middle" class="s-holdtxt">phone part</text>\n      <text x="751" y="140"',
     '<rect x="710" y="152" width="110" height="34" rx="3" class="s-hold"/>\n      <text x="765" y="173" text-anchor="middle" class="s-holdtxt">phone part</text>\n      <text x="765" y="140"'),
    # timing 2 shifted
    ('<rect x="806" y="48" width="144" height="34" rx="3" class="s-hold"/>\n      <text x="878" y="69"', '<rect x="820" y="48" width="130" height="34" rx="3" class="s-hold"/>\n      <text x="885" y="69"'),
    # phone block wider
    ('<rect x="380" y="284" width="426" height="34" rx="3" class="s-dev"/>\n      <text x="593" y="305"', '<rect x="380" y="284" width="440" height="34" rx="3" class="s-dev"/>\n      <text x="600" y="305"'),
    # ghost sim box after group
    ('<rect x="720" y="204" width="180" height="56" rx="3" class="s-ghost"/>\n      <text x="810" y="228" text-anchor="middle" class="t-s">Simulator (w3)</text>\n      <text x="810" y="244"',
     '<rect x="724" y="204" width="200" height="56" rx="3" class="s-ghost"/>\n      <text x="824" y="228" text-anchor="middle" class="t-s">Simulator (w3)</text>\n      <text x="824" y="244"'),
]
for a, b in rep:
    assert a in s, a[:60]
    s = s.replace(a, b)
open(p, 'w').write(s)
print('ok')
