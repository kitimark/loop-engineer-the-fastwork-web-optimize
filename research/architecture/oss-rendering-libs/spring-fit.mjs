// countdown spring (k=280,c=18,m=0.3), unit step, analytic (underdamped); fit cubic-bezier over duration D
const k=280,c=18,m=0.3,w0=Math.sqrt(k/m),z=c/(2*Math.sqrt(k*m)),wd=w0*Math.sqrt(1-z*z);
const g=t=>1-Math.exp(-z*w0*t)*(Math.cos(wd*t)+z*w0/wd*Math.sin(wd*t)); // progress 0->1
let D=0;for(let t=0;t<2;t+=0.0005){if(Math.abs(1-g(t))>0.002)D=t}
const B=(a,b,t)=>3*a*(1-t)**2*t+3*b*(1-t)*t*t+t**3;
const ease=(p,x)=>{let lo=0,hi=1;for(let i=0;i<40;i++){const mm=(lo+hi)/2;B(p[0],p[2],mm)<x?lo=mm:hi=mm}return B(p[1],p[3],(lo+hi)/2)};
const err=p=>{let e=0;for(let i=0;i<=200;i++){const x=i/200;e=Math.max(e,Math.abs(ease(p,x)-g(x*D)))}return e};
let best=[0.2,0.2,0.1,1],be=err(best);
for(let s=0.2;s>0.0005;s*=0.7){for(let it=0;it<400;it++){const p=best.map((v,i)=>i%2==0?Math.min(1,Math.max(0,v+(Math.random()-0.5)*s)):Math.min(1,Math.max(0,v+(Math.random()-0.5)*s)));const e=err(p);if(e<be){be=e;best=p}}}
console.log(`w0=${w0.toFixed(2)} zeta=${z.toFixed(4)} D(0.2% settle)=${(D*1000).toFixed(0)}ms best cubic-bezier(${best.map(v=>v.toFixed(3)).join(', ')}) max err=${(be*100).toFixed(2)}% of the step`);
