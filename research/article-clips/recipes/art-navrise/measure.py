import numpy as np, json, sys
from PIL import Image
D='out/art-navrise/'
def load(p): return np.asarray(Image.open(p),dtype=np.float64)
f264=load(D+'seq-orig/f264.png')
T={'logo':f264[100:160,510:785],'en':f264[103:157,1030:1205]}
def ncc(img,t):
    th,tw=t.shape; H,W=img.shape
    t=t-t.mean(); tn=np.sqrt((t**2).sum())
    sh=(H+th,W+tw)
    F=np.fft.rfft2(img,sh); Ft=np.fft.rfft2(t[::-1,::-1],sh)
    c=np.fft.irfft2(F*Ft,sh)[th-1:H,tw-1:W]
    ii=np.pad(img.cumsum(0).cumsum(1),((1,0),(1,0))); i2=np.pad((img**2).cumsum(0).cumsum(1),((1,0),(1,0)))
    def box(a): return a[th:,tw:]-a[:-th,tw:]-a[th:,:-tw]+a[:-th,:-tw]
    s=box(ii); s2=box(i2); n=th*tw
    var=np.maximum(s2-s*s/n,1e-6)
    return c/(np.sqrt(var)*tn)
def peak(r):
    a=np.abs(r); y,x=np.unravel_index(a.argmax(),a.shape)
    def sub(m,k,lim):
        if 0<k<lim-1:
            l,c,rr=m[0],m[1],m[2]; d=(l-2*c+rr)
            return k+(0.5*(l-rr)/d if d!=0 else 0)
        return k
    ys=sub(a[y-1:y+2,x] if 0<y<a.shape[0]-1 else None,y,a.shape[0])
    xs=sub(a[y,x-1:x+2] if 0<x<a.shape[1]-1 else None,x,a.shape[1])
    return ys,xs,r[y,x]
out={}
for s in ('orig','v14'):
    rows=[]
    for i in range(1,265):
        img=load(D+f'seq-{s}/f{i:03d}.png')
        row=[i]
        for k,t in T.items():
            y,x,v=peak(ncc(img,t)); row+= [round(y+162,2),round(x,1),round(float(v),3)]
        rows.append(row)
    out[s]=rows
json.dump(out,open(sys.argv[1],'w'))
