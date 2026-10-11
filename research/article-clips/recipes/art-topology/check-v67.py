# check-v67.py: structural checks for articles/p1-v67-edit.html
# nesting (every non-void element closed in order), unique ids, every #link resolves, Team figures, privacy patterns.
import re, sys, os
from html.parser import HTMLParser
here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, '..', 'articles', sys.argv[1] if len(sys.argv) > 1 else 'p1-v67-edit.html')
src = open(path, encoding='utf8').read()
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
SVG_SELF = set()
errors = []
class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.stack = []; s.ids = {}; s.hrefs = []
    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            s.ids[a['id']] = s.ids.get(a['id'], 0) + 1
        if tag == 'a' and a.get('href', '').startswith('#'): s.hrefs.append(a['href'][1:])
        for k in ('marker-end', 'marker-start'):
            m = re.match(r'url\(#([^)]+)\)', a.get(k, '') or '')
            if m: s.hrefs.append(m.group(1))
        if tag not in VOID: s.stack.append((tag, s.getpos()))
    def handle_startendtag(s, tag, attrs):
        a = dict(attrs)
        if 'id' in a: s.ids[a['id']] = s.ids.get(a['id'], 0) + 1
    def handle_endtag(s, tag):
        if tag in VOID: return
        if not s.stack: errors.append(f'stray </{tag}> at {s.getpos()}'); return
        t, pos = s.stack.pop()
        if t != tag: errors.append(f'</{tag}> at {s.getpos()} closes <{t}> from {pos}')
p = P(); p.feed(src); p.close()
# <p> may be implicitly closed in HTML; we write explicit closes, so any leftover is a real error
for t, pos in p.stack: errors.append(f'unclosed <{t}> from {pos}')
dups = {k: v for k, v in p.ids.items() if v > 1}
if dups: errors.append(f'duplicate ids: {dups}')
missing = sorted({h for h in p.hrefs if h not in p.ids})
if missing: errors.append(f'unresolved #links: {missing}')
teams = re.findall(r'<figure class="cap" data-capture="ready" id="team-(\d+)">', src)
if teams != [str(i) for i in range(12)]: errors.append(f'team figure order {teams}')
for i in range(12):
    m = re.search(rf'id="team-{i}">(.*?)</figure>', src, re.S)
    body = m.group(1)
    if 'href="#src-31"' not in body: errors.append(f'team-{i} caption lacks #src-31')
    if 'role="img"' not in body or 'aria-label="' not in body: errors.append(f'team-{i} svg lacks role/aria')
    if re.search(r'(fill|stroke):\s*#', body): errors.append(f'team-{i} hard-coded colour')
    if f'Team {i}' not in body: errors.append(f'team-{i} bar label')
srcs = [int(x) for x in re.findall(r'<li id="src-(\d+)" value="\1"', src)]
if srcs != list(range(1, len(srcs) + 1)): errors.append(f'source numbering {srcs}')
figs = re.findall(r'Fig\. (\d+)</span>', src)
if figs != [str(i) for i in range(1, 16)]: errors.append(f'Fig. numbering moved: {figs}')
# privacy: emails, IPv4, long hex/uuid ids in the added parts
added = ''.join(re.findall(r'id="team-\d+">.*?</figure>', src, re.S)) + re.search(r'<aside class="teambox".*?</aside>', src, re.S).group(0) + re.search(r'<li id="src-31".*?</li>', src, re.S).group(0)
for pat, what in [(r'[\w.+-]+@[\w-]+\.\w+', 'email'), (r'\b\d{1,3}(\.\d{1,3}){3}\b', 'IPv4'), (r'\b[0-9a-f]{8}-[0-9a-f]{4}-', 'uuid'), ('—', 'em dash')]:
    if re.search(pat, added): errors.append(f'{what} in added content')
print(f'{os.path.basename(path)}: ids {len(p.ids)}, #links {len(p.hrefs)}, team figures {len(teams)}, sources {len(srcs)}')
print('\n'.join(errors) if errors else 'OK: nesting, unique ids, links, numbering, privacy patterns')
sys.exit(1 if errors else 0)
