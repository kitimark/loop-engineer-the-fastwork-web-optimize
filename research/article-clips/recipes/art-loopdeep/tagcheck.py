import sys
from html.parser import HTMLParser
void = {'meta', 'link', 'br', 'img', 'hr', 'input', 'path', 'line', 'rect', 'polyline', 'circle', 'polygon'}
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.st = []; s.err = []
    def handle_starttag(s, t, a):
        if t not in void: s.st.append((t, s.getpos()))
    def handle_endtag(s, t):
        if t in void: return
        if s.st and s.st[-1][0] == t: s.st.pop()
        else: s.err.append((t, s.getpos(), s.st[-1] if s.st else None))
p = P(); p.feed(open(sys.argv[1]).read())
print('errors', p.err[:10]); print('open', p.st[:10])
