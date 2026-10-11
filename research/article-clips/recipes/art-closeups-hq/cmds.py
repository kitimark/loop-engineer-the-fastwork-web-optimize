import json,sys,re
f=sys.argv[1]; pat=re.compile(sys.argv[2])
for line in open(f):
    try: o=json.loads(line)
    except: continue
    m=o.get('message',{})
    c=m.get('content')
    if not isinstance(c,list): continue
    for b in c:
        if b.get('type')=='tool_use':
            cmd=json.dumps(b.get('input'))
            if pat.search(cmd):
                print('---', o.get('timestamp')); print(b['input'].get('command') or b['input'].get('content','')[:3000])
