// split cubic-bezier timing curve (P0=(0,0),P1,P2,P3=(1,1)) at time fraction s; return normalized sub-curve
const [x1,y1,x2,y2]=[0.16,1,0.3,1];
const B=(a,b,t)=>3*a*(1-t)**2*t+3*b*(1-t)*t*t+t**3;
const solveT=(x)=>{let lo=0,hi=1;for(let i=0;i<60;i++){const m=(lo+hi)/2;B(x1,x2,m)<x?lo=m:hi=m}return (lo+hi)/2};
const lerp=(p,q,t)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
for (const [orig,neu] of [[1.6,0.7],[1.6,0.9]]) {
  const s=neu/orig, t=solveT(s);
  const P0=[0,0],P1=[x1,y1],P2=[x2,y2],P3=[1,1];
  const A=lerp(P0,P1,t),Bq=lerp(P1,P2,t),C=lerp(A,Bq,t),D=lerp(P2,P3,t),E=lerp(Bq,D,t),F=lerp(C,E,t);
  // sub-curve P0,A,C,F
  const X=F[0],Y=F[1];
  const cb=[A[0]/X,A[1]/Y,C[0]/X,C[1]/Y];
  // max deviation of new eased value (scaled to y(t*)) vs original over new duration, in blur px for 14px
  let maxdev=0;
  const Bx=(t)=>B(cb[0],cb[2],t), By=(t)=>B(cb[1],cb[3],t);
  for(let i=0;i<=1000;i++){const u=i/1000; // new progress time
    let lo=0,hi=1;for(let k=0;k<60;k++){const m=(lo+hi)/2;Bx(m)<u?lo=m:hi=m}const yn=By((lo+hi)/2);
    const xo=u*s; const yo=B(y1,y2,solveT(xo));
    maxdev=Math.max(maxdev,Math.abs(yn*Y-yo));}
  console.log(`orig ${orig}s -> ${neu}s: s=${s.toFixed(4)} t*=${t.toFixed(4)} y(t*)=${Y.toFixed(4)} residual blur at cut (14px)=${((1-Y)*14).toFixed(2)}px; cubic-bezier(${cb.map(v=>v.toFixed(4)).join(', ')}); shape dev (unscaled) max=${(maxdev*14).toFixed(4)}px`);
}
