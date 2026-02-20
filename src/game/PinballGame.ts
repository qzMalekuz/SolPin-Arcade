// ===================================================================
// SolPin Arcade — Enhanced HTML5 Canvas Pinball Engine
// Classic pinball-inspired visuals with neon sci-fi theme
// ===================================================================

import { Difficulty } from '../theme';

interface PinballHTMLOptions {
  difficulty: Difficulty;
  duration: number;
}

const GRAVITY_MAP: Record<Difficulty, number> = {
  easy: 0.38,
  medium: 0.52,
  hard: 0.72,
};
const FLIP_POW: Record<Difficulty, number> = {
  easy: 16,
  medium: 13,
  hard: 10,
};

export const generatePinballHTML = (opts: PinballHTMLOptions): string => {
  const grav = GRAVITY_MAP[opts.difficulty];
  const fpow = FLIP_POW[opts.difficulty];
  const dur = opts.duration;
  const diff = opts.difficulty.toUpperCase();

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#050510;touch-action:none;user-select:none}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="c"></canvas><script>
(function(){'use strict';
const C=document.getElementById('c'),X=C.getContext('2d');
let W=0,H=0,sc=1;
const dpr=window.devicePixelRatio||1;
function resize(){W=C.width=innerWidth*dpr;H=C.height=innerHeight*dpr;C.style.width=innerWidth+'px';C.style.height=innerHeight+'px';sc=Math.min(W/460,H/900);}
resize();addEventListener('resize',resize);

const G=${grav},FP=${fpow},DUR=${dur},BR=11,PI=Math.PI,T2=PI*2;
const TW=420,TH=850;
const tx=x=>(W-TW*sc)/2+x*sc, ty=y=>(H-TH*sc)/2+y*sc, ts=s=>s*sc;

// ════════════════════════════════════
// STARFIELD + MOVING BACKGROUND OBJECTS
// ════════════════════════════════════
const stars=Array.from({length:100},()=>({x:Math.random()*TW,y:Math.random()*TH,r:.3+Math.random()*1.4,p:Math.random()*T2}));
const orbs=Array.from({length:12},()=>({
  x:40+Math.random()*(TW-80), y:80+Math.random()*(TH-200),
  r:15+Math.random()*35, speed:.2+Math.random()*.6,
  phase:Math.random()*T2, col:['#1a0a3a','#0a1a35','#15082e','#0e0825','#1a1040'][Math.floor(Math.random()*5)],
  drift:Math.random()*1.5-.75
}));
const rings=Array.from({length:6},()=>({
  x:60+Math.random()*(TW-120), y:100+Math.random()*(TH-300),
  r:20+Math.random()*40, speed:.3+Math.random()*.4, phase:Math.random()*T2,
  col:['rgba(180,74,255,0.06)','rgba(0,212,255,0.05)','rgba(255,42,255,0.04)'][Math.floor(Math.random()*3)]
}));

// ════════════════════════════════════
// WALLS
// ════════════════════════════════════
const walls=[
  // outer frame
  {x1:24,y1:48,x2:24,y2:TH-145,c:'#0088cc',w:3},
  {x1:TW-24,y1:48,x2:TW-24,y2:TH-145,c:'#0088cc',w:3},
  {x1:24,y1:48,x2:TW-24,y2:48,c:'#0088cc',w:3},
  // left gutter — angled to guide into drain gap
  {x1:24,y1:TH-145,x2:120,y2:TH-62,c:'#9944cc',w:2.5},
  // right gutter
  {x1:TW-24,y1:TH-145,x2:TW-120,y2:TH-62,c:'#9944cc',w:2.5},
  // left slingshot triangle
  {x1:75,y1:TH-290,x2:55,y2:TH-180,c:'#ff2aff',w:2},
  {x1:55,y1:TH-180,x2:120,y2:TH-135,c:'#ff2aff',w:2},
  {x1:120,y1:TH-135,x2:75,y2:TH-290,c:'#ff2aff',w:1.5},
  // right slingshot triangle
  {x1:TW-75,y1:TH-290,x2:TW-55,y2:TH-180,c:'#ff2aff',w:2},
  {x1:TW-55,y1:TH-180,x2:TW-120,y2:TH-135,c:'#ff2aff',w:2},
  {x1:TW-120,y1:TH-135,x2:TW-75,y2:TH-290,c:'#ff2aff',w:1.5},
  // top arches
  {x1:24,y1:48,x2:70,y2:95,c:'#0088cc',w:2.5},
  {x1:70,y1:95,x2:70,y2:165,c:'#0088cc',w:2.5},
  {x1:TW-24,y1:48,x2:TW-70,y2:95,c:'#0088cc',w:2.5},
  {x1:TW-70,y1:95,x2:TW-70,y2:165,c:'#0088cc',w:2.5},
  // launch lane
  {x1:TW-14,y1:70,x2:TW-14,y2:TH-25,c:'#444466',w:2},
  {x1:TW-56,y1:70,x2:TW-56,y2:220,c:'#444466',w:2},
  {x1:TW-56,y1:220,x2:TW-24,y2:48,c:'#444466',w:2},
  // center V guides
  {x1:150,y1:480,x2:130,y2:540,c:'#6633aa',w:2},
  {x1:TW-150,y1:480,x2:TW-130,y2:540,c:'#6633aa',w:2},
  // upper side lanes
  {x1:90,y1:160,x2:90,y2:260,c:'#00aa66',w:1.5},
  {x1:TW-90,y1:160,x2:TW-90,y2:260,c:'#00aa66',w:1.5},
];

// ════════════════════════════════════
// BUMPERS (more varied, like reference)
// ════════════════════════════════════
const bumpers=[
  // top mega cluster
  {x:TW/2,y:175,r:32,pts:300,col:'#ff2aff',g:0},
  {x:TW/2-72,y:248,r:28,pts:200,col:'#00d4ff',g:0},
  {x:TW/2+72,y:248,r:28,pts:200,col:'#b44aff',g:0},
  // mid row
  {x:110,y:380,r:24,pts:150,col:'#00ff88',g:0},
  {x:TW-110,y:380,r:24,pts:150,col:'#00ff88',g:0},
  // jackpot star (center)
  {x:TW/2,y:320,r:20,pts:500,col:'#ffe14d',g:0},
  // lower cluster
  {x:160,y:545,r:18,pts:120,col:'#ff6b35',g:0},
  {x:TW-160,y:545,r:18,pts:120,col:'#ff6b35',g:0},
  // mini bumpers around center
  {x:TW/2-38,y:440,r:14,pts:180,col:'#00ccff',g:0},
  {x:TW/2+38,y:440,r:14,pts:180,col:'#cc44ff',g:0},
  // extra top-side
  {x:TW/2-110,y:175,r:15,pts:100,col:'#ff8844',g:0},
  {x:TW/2+110,y:175,r:15,pts:100,col:'#ff8844',g:0},
];

// Decorative ring of dots (like the reference image center circle)
const dotRing=Array.from({length:18},(_, i)=>{
  const a=T2*i/18;
  return {x:TW/2+Math.cos(a)*65, y:320+Math.sin(a)*65, r:4, phase:i*0.35};
});

// ════════════════════════════════════
// FLIPPERS — WITH PROPER DRAIN GAP
// ════════════════════════════════════
// Gap between flippers = ~90px (ball=22px diameter, so ~4 ball widths gap)
const flippers=[
  {px:135,   py:TH-68, len:72, rest:0.4, flip:-0.82, angle:0.4, on:false, side:'L'},
  {px:TW-135,py:TH-68, len:72, rest:PI-0.4, flip:PI+0.82, angle:PI-0.4, on:false, side:'R'},
];

// ════════════════════════════════════
// GAME STATE
// ════════════════════════════════════
let ball={x:TW-40,y:TH-190,vx:0,vy:0,alive:true,go:false};
let score=0,combo=0,cTimer=0,tLeft=DUR;
let st='playing',lt=performance.now(),tt=0;
let lp=0,chrg=false;
let parts=[],pops=[];
let shake={x:0,y:0,t:0}; // screen shake

function particle(x,y,col,n,pw){pw=pw||1;for(let i=0;i<n;i++){const a=Math.random()*T2,s=(1.2+Math.random()*3.5)*pw;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,r:1.5+Math.random()*3.5,c:col});}}
function popup(x,y,t,col){pops.push({x,y,t,col,l:1,vy:-1.5});}
function doShake(power){shake.x=(Math.random()-.5)*power;shake.y=(Math.random()-.5)*power;shake.t=0.15;}
function send(t,d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:t,...(d||{})}));}
function addS(pts,bx,by,col){combo++;cTimer=0;const m=Math.min(1+combo*.25,5);const g=Math.round(pts*m);score+=g;popup(bx,by,'+'+g,col||'#ffe14d');send('score',{score,combo:Math.round(m*10)/10});}

// ════════════════════════════════════
// COLLISION
// ════════════════════════════════════
function ptSeg(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(l2===0)return{d:Math.hypot(px-x1,py-y1),cx:x1,cy:y1};const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));const cx=x1+t*dx,cy=y1+t*dy;return{d:Math.hypot(px-cx,py-cy),cx,cy};}
function refl(vx,vy,nx,ny,r){const d=vx*nx+vy*ny;return{vx:vx-2*d*nx*r,vy:vy-2*d*ny*r};}

// ════════════════════════════════════
// PHYSICS STEP
// ════════════════════════════════════
function step(dt){
  if(!ball.alive)return;
  const dtC=Math.min(dt,.022);
  const N=5; const sub=dtC/N;
  for(let i=0;i<N;i++){
    if(ball.go){ball.vy+=G*60*sub; ball.vx*=.9993; ball.vy*=.9993;}
    const spd=Math.hypot(ball.vx,ball.vy);
    if(spd>30){ball.vx=ball.vx/spd*30;ball.vy=ball.vy/spd*30;}
    ball.x+=ball.vx*60*sub; ball.y+=ball.vy*60*sub;

    // Walls
    for(const w of walls){
      const{d,cx,cy}=ptSeg(ball.x,ball.y,w.x1,w.y1,w.x2,w.y2);
      if(d<BR){const nx=(ball.x-cx)/d,ny=(ball.y-cy)/d;
        ball.x=cx+nx*(BR+.8);ball.y=cy+ny*(BR+.8);
        const b=refl(ball.vx,ball.vy,nx,ny,.58);ball.vx=b.vx;ball.vy=b.vy;
        if(spd>2.5)particle(cx,cy,w.c||'#00d4ff',3);
      }
    }

    // Bumpers
    for(const b of bumpers){
      const dx=ball.x-b.x,dy=ball.y-b.y,d=Math.hypot(dx,dy),mn=BR+b.r;
      if(d<mn&&d>.01){
        const nx=dx/d,ny=dy/d;
        ball.x=b.x+nx*(mn+1.5);ball.y=b.y+ny*(mn+1.5);
        const sp=7+Math.random()*3;
        ball.vx=nx*sp;ball.vy=ny*sp;
        b.g=1;setTimeout(()=>{b.g=0;},250);
        addS(b.pts,b.x+nx*b.r,b.y+ny*b.r,b.col);
        particle(b.x+nx*b.r,b.y+ny*b.r,b.col,12,1.3);
        doShake(4);
      }
    }

    // Flippers
    for(const f of flippers){
      const tipX=f.px+Math.cos(f.angle)*f.len,tipY=f.py+Math.sin(f.angle)*f.len;
      const{d,cx,cy}=ptSeg(ball.x,ball.y,f.px,f.py,tipX,tipY);
      if(d<BR+5){
        const nx=(ball.x-cx)/(d||1),ny=(ball.y-cy)/(d||1);
        ball.x=cx+nx*(BR+6);ball.y=cy+ny*(BR+6);
        if(f.on){
          const pw=FP;
          ball.vx=f.side==='L'?pw*.55:-pw*.55;
          ball.vy=-pw;
          particle(cx,cy,'#ffe14d',7,1.4);
          addS(30,cx,cy,'#ffe14d');
          doShake(2);
        }else{
          const b=refl(ball.vx,ball.vy,nx,ny,.48);ball.vx=b.vx;ball.vy=b.vy;
        }
      }
    }

    // Bounds
    if(ball.x<18+BR){ball.x=18+BR;ball.vx=Math.abs(ball.vx)*.55;}
    if(ball.x>TW-10-BR){ball.x=TW-10-BR;ball.vx=-Math.abs(ball.vx)*.55;}
    if(ball.y<42+BR){ball.y=42+BR;ball.vy=Math.abs(ball.vy)*.55;}

    // DRAIN — ball falls through gap between flippers
    if(ball.y>TH-12){
      ball.alive=false; st='lost';
      particle(ball.x,ball.y,'#ff4444',20,1.5);
      doShake(8);
      send('gameover',{result:'lost',score});
      return;
    }
  }

  // Flipper physics
  for(const f of flippers){
    const tgt=f.on?f.flip:f.rest;
    const df=tgt-f.angle;
    const mv=(f.on?22:10)*dtC;
    f.angle+=Math.abs(df)<mv?df:Math.sign(df)*mv;
  }

  // Timer
  tLeft=Math.max(0,tLeft-dt);
  if(tLeft<=0){st='won';send('gameover',{result:'won',score});return;}
  send('timer',{timeLeft:Math.ceil(tLeft)});

  // Combo decay
  cTimer+=dt; if(cTimer>1.8)combo=0;

  // Shake decay
  if(shake.t>0){shake.t-=dt;if(shake.t<=0){shake.x=0;shake.y=0;}}
}

// ════════════════════════════════════
// DRAWING
// ════════════════════════════════════
function glowLine(x1,y1,x2,y2,col,lw,blur){
  X.strokeStyle=col;X.lineWidth=ts(lw);X.shadowColor=col;X.shadowBlur=ts(blur);
  X.beginPath();X.moveTo(tx(x1)+shake.x,ty(y1)+shake.y);X.lineTo(tx(x2)+shake.x,ty(y2)+shake.y);X.stroke();X.shadowBlur=0;
}

function draw(t){
  X.clearRect(0,0,W,H);
  const sx=shake.x,sy=shake.y;

  // Background gradient (deep space)
  const bg=X.createRadialGradient(W/2,H*.38,0,W/2,H/2,H*.95);
  bg.addColorStop(0,'#0d0d35');bg.addColorStop(0.5,'#08081e');bg.addColorStop(1,'#030308');
  X.fillStyle=bg;X.fillRect(0,0,W,H);

  // Moving background orbs
  for(const o of orbs){
    const ox=o.x+Math.sin(t*o.speed+o.phase)*20+o.drift*Math.sin(t*.3);
    const oy=o.y+Math.cos(t*o.speed*1.3+o.phase)*15;
    const grad=X.createRadialGradient(tx(ox)+sx,ty(oy)+sy,0,tx(ox)+sx,ty(oy)+sy,ts(o.r));
    grad.addColorStop(0,o.col);grad.addColorStop(1,'transparent');
    X.fillStyle=grad;X.beginPath();X.arc(tx(ox)+sx,ty(oy)+sy,ts(o.r),0,T2);X.fill();
  }

  // Moving energy rings
  for(const r of rings){
    const rx=r.x+Math.sin(t*r.speed+r.phase)*25;
    const ry=r.y+Math.cos(t*r.speed*.8+r.phase)*18;
    const rr=r.r+Math.sin(t*1.5+r.phase)*8;
    X.strokeStyle=r.col;X.lineWidth=ts(2);
    X.beginPath();X.arc(tx(rx)+sx,ty(ry)+sy,ts(rr),0,T2);X.stroke();
  }

  // Stars
  for(const s of stars){
    const a=.25+.35*Math.sin(s.p+t*1.6);
    X.globalAlpha=a;X.fillStyle='#fff';
    X.beginPath();X.arc(tx(s.x)+sx,ty(s.y)+sy,ts(s.r),0,T2);X.fill();
  }
  X.globalAlpha=1;

  // Table surface (subtle dark gradient)
  const tg=X.createLinearGradient(tx(20),ty(45),tx(20),ty(TH-20));
  tg.addColorStop(0,'rgba(15,10,40,0.7)');tg.addColorStop(0.5,'rgba(8,5,25,0.85)');tg.addColorStop(1,'rgba(15,10,40,0.7)');
  X.fillStyle=tg;X.fillRect(tx(20)+sx,ty(45)+sy,ts(TW-40),ts(TH-65));

  // Table border (double glow)
  X.shadowColor='#6622aa';X.shadowBlur=ts(22);
  X.strokeStyle='#8844cc';X.lineWidth=ts(4);
  X.strokeRect(tx(18)+sx,ty(42)+sy,ts(TW-36),ts(TH-58));
  X.shadowBlur=ts(6);X.strokeStyle='#aa66ee';X.lineWidth=ts(1.5);
  X.strokeRect(tx(18)+sx,ty(42)+sy,ts(TW-36),ts(TH-58));
  X.shadowBlur=0;

  // WALLS
  X.lineCap='round';
  for(const w of walls){
    glowLine(w.x1,w.y1,w.x2,w.y2,w.c,w.w||2.5,8);
  }
  X.lineCap='butt';

  // Slingshot fills (glowing triangles)
  X.globalAlpha=.12;
  for(const tri of [
    [[75,TH-290],[55,TH-180],[120,TH-135]],
    [[TW-75,TH-290],[TW-55,TH-180],[TW-120,TH-135]]
  ]){
    const g2=X.createLinearGradient(tx(tri[0][0]),ty(tri[0][1]),tx(tri[2][0]),ty(tri[2][1]));
    g2.addColorStop(0,'#ff2aff');g2.addColorStop(1,'#b44aff');
    X.fillStyle=g2;X.beginPath();
    X.moveTo(tx(tri[0][0])+sx,ty(tri[0][1])+sy);
    tri.slice(1).forEach(p=>X.lineTo(tx(p[0])+sx,ty(p[1])+sy));
    X.closePath();X.fill();
  }
  X.globalAlpha=1;

  // Decorative dot ring (around center, like reference)
  for(const d of dotRing){
    const pulse=.4+.6*Math.sin(d.phase+t*2);
    const col=pulse>.7?'#00d4ff':'#224466';
    X.fillStyle=col;X.shadowColor='#00d4ff';X.shadowBlur=ts(pulse>0.7?8:2);
    X.beginPath();X.arc(tx(d.x)+sx,ty(d.y)+sy,ts(d.r),0,T2);X.fill();
  }
  X.shadowBlur=0;

  // Center ring decoration
  X.strokeStyle='rgba(0,212,255,0.15)';X.lineWidth=ts(2);
  X.beginPath();X.arc(tx(TW/2)+sx,ty(320)+sy,ts(65),0,T2);X.stroke();
  X.strokeStyle='rgba(180,74,255,0.1)';X.lineWidth=ts(1.5);
  X.beginPath();X.arc(tx(TW/2)+sx,ty(320)+sy,ts(70),0,T2);X.stroke();

  // BUMPERS
  for(const b of bumpers){
    const lit=b.g>0;
    // Outer glow ring
    X.shadowColor=b.col;X.shadowBlur=ts(lit?35:12);
    X.strokeStyle=b.col;X.lineWidth=ts(lit?4.5:3);
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r),0,T2);X.stroke();
    // Inner gradient fill
    if(lit){
      const ig=X.createRadialGradient(tx(b.x)+sx,ty(b.y)+sy,0,tx(b.x)+sx,ty(b.y)+sy,ts(b.r));
      ig.addColorStop(0,'#fff');ig.addColorStop(.4,b.col);ig.addColorStop(1,'rgba(0,0,0,.5)');
      X.fillStyle=ig;
    }else{
      X.fillStyle='rgba(5,5,20,0.75)';
    }
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r-3),0,T2);X.fill();
    // Inner ring detail
    X.shadowBlur=0;X.strokeStyle=lit?'rgba(255,255,255,.5)':b.col+'44';
    X.lineWidth=ts(1);
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r*.6),0,T2);X.stroke();
    // Label
    X.fillStyle=lit?'#fff':b.col;
    X.font='bold '+ts(b.r*.5)+'px monospace';
    X.textAlign='center';X.textBaseline='middle';
    X.fillText(b.pts,tx(b.x)+sx,ty(b.y)+sy);
    if(b.pts>=500){X.fillStyle=lit?'#fff':'rgba(255,225,77,.6)';X.font=ts(10)+'px sans-serif';X.fillText('★',tx(b.x)+sx,ty(b.y-b.r-10)+sy);}
  }
  X.shadowBlur=0;

  // FLIPPERS (thicker, more visible)
  X.lineCap='round';
  for(const f of flippers){
    const tipX=f.px+Math.cos(f.angle)*f.len,tipY=f.py+Math.sin(f.angle)*f.len;
    // Shadow/base
    X.strokeStyle='#664400';X.lineWidth=ts(14);X.shadowBlur=0;
    X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();
    // Main flipper
    const fg=X.createLinearGradient(tx(f.px)+sx,ty(f.py)+sy,tx(tipX)+sx,ty(tipY)+sy);
    fg.addColorStop(0,'#ffcc33');fg.addColorStop(.5,'#ff8800');fg.addColorStop(1,'#cc4400');
    X.strokeStyle=fg;X.lineWidth=ts(12);
    X.shadowColor='#ff8800';X.shadowBlur=ts(f.on?22:10);
    X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();
    // Pivot
    X.shadowBlur=0;
    X.fillStyle='#fff';X.beginPath();X.arc(tx(f.px)+sx,ty(f.py)+sy,ts(6),0,T2);X.fill();
    X.strokeStyle='#ffcc33';X.lineWidth=ts(2);
    X.beginPath();X.arc(tx(f.px)+sx,ty(f.py)+sy,ts(6),0,T2);X.stroke();
  }
  X.lineCap='butt';X.shadowBlur=0;

  // DRAIN GAP INDICATOR (red glow between flippers)
  const drainLeft=flippers[0].px+35;
  const drainRight=flippers[1].px-35;
  const drainY=TH-18;
  X.strokeStyle='#ff3333';X.lineWidth=ts(3);
  X.shadowColor='#ff3333';X.shadowBlur=ts(12);
  X.setLineDash([ts(8),ts(6)]);
  X.beginPath();X.moveTo(tx(drainLeft)+sx,ty(drainY)+sy);X.lineTo(tx(drainRight)+sx,ty(drainY)+sy);X.stroke();
  X.setLineDash([]);X.shadowBlur=0;
  // "DRAIN" label
  X.fillStyle='rgba(255,50,50,0.4)';X.font=ts(8)+'px monospace';
  X.textAlign='center';X.textBaseline='middle';
  X.fillText('DRAIN',tx(TW/2)+sx,ty(TH-8)+sy);

  // BALL
  if(ball.alive){
    // trail (motion blur)
    if(ball.go&&Math.hypot(ball.vx,ball.vy)>3){
      X.globalAlpha=.25;
      for(let i=1;i<=3;i++){
        const bx=ball.x-ball.vx*i*.12,by=ball.y-ball.vy*i*.12;
        X.fillStyle='rgba(150,180,255,'+(0.15/i)+')';
        X.beginPath();X.arc(tx(bx)+sx,ty(by)+sy,ts(BR*(1-i*.15)),0,T2);X.fill();
      }
      X.globalAlpha=1;
    }
    // halo
    const halo=X.createRadialGradient(tx(ball.x)+sx,ty(ball.y)+sy,0,tx(ball.x)+sx,ty(ball.y)+sy,ts(BR*3));
    halo.addColorStop(0,'rgba(200,220,255,0.4)');halo.addColorStop(1,'rgba(200,220,255,0)');
    X.fillStyle=halo;X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR*3),0,T2);X.fill();
    // body gradient
    const bg2=X.createRadialGradient(tx(ball.x-3)+sx,ty(ball.y-3)+sy,ts(1),tx(ball.x)+sx,ty(ball.y)+sy,ts(BR));
    bg2.addColorStop(0,'#ffffff');bg2.addColorStop(.3,'#dde0ff');bg2.addColorStop(.7,'#8890cc');bg2.addColorStop(1,'#4050aa');
    X.shadowColor='#aabbff';X.shadowBlur=ts(16);
    X.fillStyle=bg2;X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR),0,T2);X.fill();
    // rim
    X.shadowBlur=0;X.strokeStyle='rgba(100,180,255,0.8)';X.lineWidth=ts(1.8);
    X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR),0,T2);X.stroke();
    // specular highlight
    X.fillStyle='rgba(255,255,255,0.7)';
    X.beginPath();X.arc(tx(ball.x-3)+sx,ty(ball.y-4)+sy,ts(3.5),0,T2);X.fill();
  }

  // PARTICLES
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.l-=.032;
    if(p.l<=0){parts.splice(i,1);continue;}
    X.globalAlpha=p.l;X.fillStyle=p.c;X.shadowColor=p.c;X.shadowBlur=ts(5);
    X.beginPath();X.arc(tx(p.x)+sx,ty(p.y)+sy,ts(p.r*p.l),0,T2);X.fill();
  }
  X.globalAlpha=1;X.shadowBlur=0;

  // SCORE POPUPS
  for(let i=pops.length-1;i>=0;i--){
    const p=pops[i];p.y+=p.vy;p.l-=.025;
    if(p.l<=0){pops.splice(i,1);continue;}
    X.globalAlpha=p.l;X.fillStyle=p.col;X.shadowColor=p.col;X.shadowBlur=ts(12);
    X.font='bold '+ts(14)+'px monospace';X.textAlign='center';X.textBaseline='middle';
    X.fillText(p.t,tx(p.x)+sx,ty(p.y)+sy);
  }
  X.globalAlpha=1;X.shadowBlur=0;

  // LAUNCH ZONE (pre-launch)
  if(!ball.go){
    X.fillStyle='rgba(0,200,255,0.06)';
    X.fillRect(tx(TW-56)+sx,ty(70)+sy,ts(42),ts(TH-95));
    const p=.5+.5*Math.sin(t*3);
    X.globalAlpha=.35+.45*p;
    X.fillStyle='#00d4ff';X.font='bold '+ts(11)+'px sans-serif';
    X.textAlign='center';X.textBaseline='middle';
    X.fillText('▼',tx(TW-35)+sx,ty(TH-360)+sy);
    X.fillText('▼',tx(TW-35)+sx,ty(TH-395)+sy);
    X.font='bold '+ts(9)+'px sans-serif';
    X.fillText('HOLD',tx(TW-35)+sx,ty(TH-430)+sy);
    X.globalAlpha=1;
    // flipper labels
    X.globalAlpha=.35;X.font=ts(9)+'px sans-serif';X.fillStyle='#ffcc33';
    X.fillText('◄ TAP',tx(95)+sx,ty(TH-22)+sy);
    X.fillText('TAP ►',tx(TW-95)+sx,ty(TH-22)+sy);
    X.globalAlpha=1;
  }

  // LAUNCH POWER BAR
  if(chrg&&!ball.go){
    const bH=ts(180),bW=ts(16);const bX=tx(TW-48)+sx-bW/2,bY=ty(TH-330)+sy;
    X.fillStyle='rgba(0,0,0,.6)';X.fillRect(bX,bY,bW,bH);
    const fH=bH*lp;
    const pg=X.createLinearGradient(bX,bY+bH,bX,bY);
    pg.addColorStop(0,'#00ff88');pg.addColorStop(.5,'#ffe14d');pg.addColorStop(1,'#ff2aff');
    X.fillStyle=pg;X.fillRect(bX,bY+bH-fH,bW,fH);
    X.strokeStyle='#00d4ff';X.lineWidth=ts(2);X.strokeRect(bX,bY,bW,bH);
    X.fillStyle='#fff';X.font='bold '+ts(9)+'px sans-serif';
    X.textAlign='center';X.fillText('PWR',bX+bW/2,bY-ts(12));
  }
}

// ════════════════════════════════════
// GAME LOOP
// ════════════════════════════════════
function loop(now){
  const dt=Math.min((now-lt)/1000,.05);lt=now;tt+=dt;
  if(chrg&&!ball.go)lp=Math.min(lp+dt*.9,1);
  if(st==='playing')step(dt);
  draw(tt);
  if(st==='playing'||st==='paused')requestAnimationFrame(loop);
}

// ════════════════════════════════════
// TOUCH
// ════════════════════════════════════
document.addEventListener('touchstart',e=>{e.preventDefault();
  for(const t of e.changedTouches){const x=t.clientX,mid=innerWidth/2;
    if(!ball.go&&x>innerWidth*.76){chrg=true;lp=0;}
    else if(x<mid)flippers[0].on=true;
    else flippers[1].on=true;
  }
},{passive:false});

document.addEventListener('touchend',e=>{e.preventDefault();
  for(const t of e.changedTouches){const x=t.clientX,mid=innerWidth/2;
    if(chrg&&!ball.go){
      chrg=false;ball.go=true;
      ball.vy=-(9+lp*15);ball.vx=-.8-Math.random()*2.5;
      lp=0;send('launched',{});
    }else if(x<mid)flippers[0].on=false;
    else flippers[1].on=false;
  }
},{passive:false});

addEventListener('message',e=>{try{const m=JSON.parse(e.data);
  if(m.type==='pause')st='paused';
  else if(m.type==='resume'){st='playing';lt=performance.now();requestAnimationFrame(loop);}
}catch(e){}});

send('ready',{difficulty:'${diff}',duration:DUR});
requestAnimationFrame(loop);
})();
</script></body></html>`;
};
