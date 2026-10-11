import re,html
lines=open('draft-v63.html',encoding='utf-8').read().split('\n')
out=[]
for i,l in enumerate(lines,1):
    if i<121: continue
    s=l
    # keep attribute info for video/img/figure ids/aria/href
    attrs=[]
    for m in re.finditer(r'<(video|img|figure|h3|h4|li|a|svg)\b([^>]*)>',s):
        a=m.group(2)
        keep=re.findall(r'\b(id|src|aria-label|alt|href|value)="([^"]*)"',a)
        if keep: attrs.append(m.group(1)+'{'+'; '.join(f'{k}={v}' for k,v in keep)+'}')
    t=re.sub(r'<text[^>]*>','<text>',s)
    t=re.sub(r'</text>',' | ',t)
    t=re.sub(r'<[^>]+>','',t)
    t=html.unescape(t).strip()
    t=re.sub(r'\s+',' ',t)
    if not t and not attrs: continue
    out.append(f'{i}: '+(' '.join('['+a+']' for a in attrs)+' ' if attrs else '')+t)
open('audit/stripped-v63.txt','w').write('\n'.join(out))
