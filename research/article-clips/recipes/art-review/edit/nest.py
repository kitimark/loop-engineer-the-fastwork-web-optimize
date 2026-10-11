# edit-article-p1: strict nesting check (void elements skipped), read-only.
import sys
from html.parser import HTMLParser
VOID={'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
SVGSELF=set()
class P(HTMLParser):
    def __init__(s): super().__init__(); s.st=[]; s.err=[]
    def handle_starttag(s,t,a):
        if t not in VOID: s.st.append((t,s.getpos()))
    def handle_startendtag(s,t,a): pass
    def handle_endtag(s,t):
        if t in VOID: return
        if not s.st or s.st[-1][0]!=t: s.err.append((t,s.getpos(),s.st[-1] if s.st else None))
        else: s.st.pop()
p=P(); p.feed(open(sys.argv[1]).read()); print('errors',p.err[:10],'open',p.st[:5])
