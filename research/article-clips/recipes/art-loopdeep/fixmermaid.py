import re, sys
p = sys.argv[1]
s = open(p).read()
rep = [
    ('  D -- "LOCATED or UNEXPLAINED" --> I', '  D -->|LOCATED or UNEXPLAINED| I'),
    ('  D -- "NAMED, signed by the lead" --> F[', '  D -->|NAMED, signed by the lead| F['),
    ('  V -- "NEEDS-WORK" --> F', '  V -->|NEEDS-WORK| F'),
    ('  V -- "ACCEPT" --> L[', '  V -->|ACCEPT| L['),
    ('  A -- yes --> W[', '  A -->|yes| W['),
    ('  A -- no --> O{', '  A -->|no| O{'),
    ('  O -- "listening, free" --> W2[', '  O -->|listening, free| W2['),
    ('  O -- no --> T{', '  O -->|no| T{'),
    ('  T -- "someone listening, free" --> W3[', '  T -->|someone listening, free| W3['),
    ('  T -- nobody --> L[', '  T -->|nobody| L['),
    ('  W -. "no reply in 10 min" .-> L', '  W -.->|no reply in 10 min| L'),
]
for a, b in rep:
    assert a in s, a
    s = s.replace(a, b)

def esc(m):
    return m.group(0).replace('<br/>', '&lt;br/&gt;')
s = re.sub(r'<pre class="mermaid">.*?</pre>', esc, s, flags=re.S)
open(p, 'w').write(s)
print('ok')
