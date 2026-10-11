# strips for art-d11clip: art-strip/strips.py with the rf clock chain (rfchain.py), PNGs into ./strips/
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rfchain, strips
strips.HERE = os.path.dirname(os.path.abspath(__file__))
specs = json.load(open(sys.argv[1])); res = [strips.make(s) for s in specs]
json.dump(res, open(sys.argv[2], 'w'), indent=1)
for r in res: print(r['id'], 'M0', r['M0'], 'D', r['D'], 'n', r['n'], '>34', r['gt34'], '>50', r['gt50'], 'max', r['max'], 'halfRTT', r['halfRttMs'], r['chain'])
