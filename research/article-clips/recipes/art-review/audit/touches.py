import sys; sys.path.insert(0,'.'); from audit import load, mark, bands
import itertools
def starts(run):
    j, seg = load(run); f = mark(seg,'finger') or 0
    s = [t for t in seg['touches'] if t[1]=='s']
    return [(round((t[0]-f)/1000,2)) for t in s], seg
a, sa = starts('20261010T110844Z-ar-herocatch-orig'); b, sb = starts('20261010T111222Z-ar-herocatch-g0m')
print('orig touch starts (s after finger):', a[:14]); print('g0m  touch starts:', b[:14])
print('lag orig-g0m:', [round(x-y,2) for x,y in zip(a,b)][:14])
# page stop -> o window start for herouser opens
for run in ['20261010T104514Z-ar-herouser-orig','20261010T104634Z-ar-herouser-g0m']:
    j, seg = load(run); cls = bands(seg); fr = seg['frames']; out=[]
    for i in range(1,len(fr)):
        if cls[i]=='o' and cls[i-1]!='o' and 242<=fr[i][2]<=970:
            k=i
            while k>0 and fr[k-1][2]==fr[i][2]: k-=1
            out.append(round((fr[i][0]-fr[k][0])/1000,2))
    print(run[-14:], 'o-open start after last scroll move (s):', out)
