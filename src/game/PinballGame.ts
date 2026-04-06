// ===================================================================
// SolPin Arcade — HTML5 Canvas Pinball Engine v8
// Reference layout recreation • physics-safe geometry
// ===================================================================

import { Difficulty } from '../theme';

interface PinballHTMLOptions {
  difficulty: Difficulty;
  duration: number;
}

const DIFF = {
  easy: { flen: 64, maxV: 17, fpow: 15.5 },
  medium: { flen: 58, maxV: 19, fpow: 14 },
  hard: { flen: 52, maxV: 21, fpow: 12.5 },
};

export const generatePinballHTML = (opts: PinballHTMLOptions): string => {
  const d = DIFF[opts.difficulty];
  const dur = opts.duration;
  const diff = opts.difficulty.toUpperCase();

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#050505;touch-action:none;user-select:none}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="c"></canvas><script>
(function(){'use strict';
const C=document.getElementById('c'),X=C.getContext('2d');
let W=0,H=0,sc=1;const dpr=window.devicePixelRatio||1;
function resize(){W=C.width=innerWidth*dpr;H=C.height=innerHeight*dpr;C.style.width=innerWidth+'px';C.style.height=innerHeight+'px';sc=Math.min(W/460,H/900);}
resize();addEventListener('resize',resize);

const G=0.42,FP=${d.fpow},DUR=${dur},BR=11,FLEN=${d.flen};
const MAX_V=${d.maxV},MIN_V=1.0;
const PI=Math.PI,T2=PI*2;
const TW=420,TH=850;
const tx=x=>(W-TW*sc)/2+x*sc,ty=y=>(H-TH*sc)/2+y*sc,ts=s=>s*sc;

// ──── SOUNDS ────
const AC=new(window.AudioContext||window.webkitAudioContext)();
function tone(f,dur,type,v){try{const o=AC.createOscillator(),g=AC.createGain();o.type=type||'sine';o.frequency.value=f;g.gain.setValueAtTime(v||.12,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+dur);}catch(e){}}
function sndBump(){tone(500+Math.random()*300,.1,'square',.1);tone(1000+Math.random()*200,.06,'sine',.06);}
function sndWall(){tone(180+Math.random()*100,.05,'triangle',.05);}
function sndFlip(){tone(320,.07,'sawtooth',.08);}
function sndLaunch(){tone(140,.15,'sawtooth',.1);setTimeout(()=>tone(280,.1,'sine',.07),60);}
function sndDrain(){tone(100,.4,'sawtooth',.12);setTimeout(()=>tone(60,.3,'sine',.08),120);}
function sndCombo(){tone(600,.08,'sine',.1);tone(900,.06,'sine',.06);}

// ──── BACKGROUND ────
const stars=Array.from({length:70},()=>({x:Math.random()*TW,y:Math.random()*TH,r:.3+Math.random()*.8,p:Math.random()*T2}));
const orbs=Array.from({length:8},()=>({
  x:40+Math.random()*(TW-80),y:80+Math.random()*(TH-200),
  r:15+Math.random()*25,sp:.12+Math.random()*.35,ph:Math.random()*T2,dr:Math.random()-.5
}));

// ──── WALLS — physics colliders ────
// Only outward-facing edges. Wall restitution = 0.9, friction = 0.02
const WREST=0.9,WFRIC=0.02;
const walls=[
  // Left wall — 5° outward tilt
  {x1:22,y1:50,x2:28,y2:TH-145},
  // Right wall
  {x1:TW-22,y1:50,x2:TW-28,y2:TH-145},
  // Top wall
  {x1:22,y1:50,x2:TW-22,y2:50},
  // Gutters
  {x1:28,y1:TH-145,x2:118,y2:TH-68},
  {x1:TW-28,y1:TH-145,x2:TW-118,y2:TH-68},
  // Funnel to drain
  {x1:118,y1:TH-68,x2:160,y2:TH-22},
  {x1:TW-118,y1:TH-68,x2:TW-160,y2:TH-22},
  // Upper arch rails — SHORT, end at y=120 (no channel with side area)
  {x1:22,y1:50,x2:62,y2:120},
  {x1:TW-22,y1:50,x2:TW-62,y2:120},
  // Launch lane — TWO parallel walls only, NO diagonal closing wall
  // Ball exits through open top gap naturally
  // Removed extra guide lines to avoid duplicate parallel lane artifacts.
  // Slingshot triangles — REAL collision, moved well inward (40px+ gap from walls)
  // Left: top (85,TH-265), outer (75,TH-190), inner (120,TH-165)
  {x1:85,y1:TH-265,x2:120,y2:TH-165},   // top to inner (faces center)
  {x1:75,y1:TH-190,x2:120,y2:TH-165},   // outer to inner (faces up)
  // Right: mirrored
  {x1:TW-85,y1:TH-265,x2:TW-120,y2:TH-165},
  {x1:TW-75,y1:TH-190,x2:TW-120,y2:TH-165},
];

// ──── VISUAL-ONLY LINES (drawn but NO collision) ────
const visualOnly=[
  // Wall-facing edges of slingshot triangles (decorative only)
  {x1:85,y1:TH-265,x2:75,y2:TH-190},
  {x1:TW-85,y1:TH-265,x2:TW-75,y2:TH-190},
];

// ──── CORNER BUMPERS — circles at every wall vertex ────
const corners=[
  // Slingshot triangle vertices
  {x:85,y:TH-265,r:8},{x:75,y:TH-190,r:8},{x:120,y:TH-165,r:8},
  {x:TW-85,y:TH-265,r:8},{x:TW-75,y:TH-190,r:8},{x:TW-120,y:TH-165,r:8},
  // Gutter-funnel junction
  {x:118,y:TH-68,r:8},{x:TW-118,y:TH-68,r:8},
  // Arch rail ends
  {x:62,y:120,r:6},{x:TW-62,y:120,r:6},
  // Wall-gutter junction
  {x:28,y:TH-145,r:8},{x:TW-28,y:TH-145,r:8},
];

// ──── SCORE BUMPERS ────
const bumpers=[
  // Top cluster (from reference)
  {x:TW/2,y:175,r:30,pts:300,g:0},       // 300 center
  {x:TW/2-80,y:260,r:26,pts:200,g:0},    // 200 left
  {x:TW/2+80,y:260,r:26,pts:200,g:0},    // 200 right
  {x:85,y:195,r:14,pts:100,g:0},          // 100 far left
  {x:TW-85,y:195,r:14,pts:100,g:0},       // 100 far right
  // Center ring (500)
  {x:TW/2,y:358,r:22,pts:500,g:0},
  // Mid bumpers
  {x:95,y:430,r:22,pts:150,g:0},          // 150 left
  {x:TW-95,y:430,r:22,pts:150,g:0},       // 150 right
  {x:TW/2-40,y:490,r:14,pts:180,g:0},     // 180 left
  {x:TW/2+40,y:490,r:14,pts:180,g:0},     // 180 right
  // Lower bumpers
  {x:TW/2-75,y:590,r:16,pts:120,g:0},     // 120 left
  {x:TW/2+75,y:590,r:16,pts:120,g:0},     // 120 right
  // Center deflector
  {x:TW/2,y:510,r:12,pts:80,g:0},
  // Slingshot bumpers (small, at triangle centers for scoring)
  {x:93,y:TH-207,r:10,pts:80,g:0},
  {x:TW-93,y:TH-207,r:10,pts:80,g:0},
];

// Dot ring around 500 bumper
const dotRing=Array.from({length:18},(_,i)=>{const a=T2*i/18;return{x:TW/2+Math.cos(a)*58,y:358+Math.sin(a)*58,r:2.5,ph:i*.35};});

// ──── FLIPPERS ────
const LR=0.38,RR=PI-0.39,LA=-0.82,RA=PI+0.83;
const flippers=[
  {px:128,py:TH-70,len:FLEN,rest:LR,flip:LA,angle:LR,on:false,side:'L',hitT:0,flash:0},
  {px:TW-128,py:TH-70,len:FLEN,rest:RR,flip:RA,angle:RR,on:false,side:'R',hitT:0,flash:0},
];

// ──── STATE ────
let ball={x:TW-40,y:TH-190,vx:0,vy:0,alive:true,go:false};
let score=0,combo=0,cT=0,tLeft=DUR,st='playing',lt=performance.now(),tt=0;
let lp=0,chrg=false,parts=[],pops=[],ripples=[];
let shake={x:0,y:0,t:0};
let comboMax=0,stuckT=0;
let lastNx=0,lastNy=-1; // last valid collision normal for anti-stuck

function part(x,y,n,pw){pw=pw||1;for(let i=0;i<n;i++){const a=Math.random()*T2,s=(1+Math.random()*3)*pw;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,r:1.5+Math.random()*3});}}
function pop(x,y,t){pops.push({x,y,t,l:1,vy:-1.5});}
function ripple(x,y,maxR){ripples.push({x,y,r:0,maxR:maxR||30,l:1});}
function doShake(p){shake.x=(Math.random()-.5)*p;shake.y=(Math.random()-.5)*p;shake.t=.12;}
function send(t,d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:t,...(d||{})}));}
function addS(pts,bx,by){
  combo++;cT=0;const m=Math.min(1+combo*.25,8);const g=Math.round(pts*m);score+=g;
  pop(bx,by,'+'+g);comboMax=Math.max(comboMax,combo);
  if(combo===3||combo===5||combo===8){part(bx,by,20,2);sndCombo();doShake(3);}
  send('score',{score,combo:Math.round(m*10)/10});
}

// ──── HELPERS ────
function ptSeg(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(!l2)return{d:Math.hypot(px-x1,py-y1),cx:x1,cy:y1};const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));const cx=x1+t*dx,cy=y1+t*dy;return{d:Math.hypot(px-cx,py-cy),cx,cy};}
function refl(vx,vy,nx,ny,r){const d=vx*nx+vy*ny;return{vx:vx-2*d*nx*r,vy:vy-2*d*ny*r};}
function clampV(vx,vy,max){const s=Math.hypot(vx,vy);if(s>max){const f=max/s;return{vx:vx*f,vy:vy*f};}return{vx,vy};}

function inDrainZone(){
  const lTipX=flippers[0].px+Math.cos(flippers[0].angle)*flippers[0].len;
  const rTipX=flippers[1].px+Math.cos(flippers[1].angle)*flippers[1].len;
  return ball.y>flippers[0].py && ball.x>lTipX-5 && ball.x<rTipX+5;
}

// ──── PHYSICS ────
function step(dt){
  if(!ball.alive)return;
  const dtC=Math.min(dt,.022),N=12,sub=dtC/N;
  const draining=inDrainZone();
  const gMul=draining?1.15:1;

  for(let i=0;i<N;i++){
    if(ball.go){
      ball.vy+=G*gMul*60*sub;
      ball.vx*=0.9998;ball.vy*=0.9998;
    }
    let cv=clampV(ball.vx,ball.vy,MAX_V);ball.vx=cv.vx;ball.vy=cv.vy;
    ball.x+=ball.vx*60*sub;ball.y+=ball.vy*60*sub;

    // ── Wall collisions (accumulated normals) ──
    let wnx=0,wny=0,wcnt=0,wpx=0,wpy=0;
    for(const w of walls){
      const{d,cx,cy}=ptSeg(ball.x,ball.y,w.x1,w.y1,w.x2,w.y2);
      if(d<BR){
        const nx=(ball.x-cx)/(d||1),ny=(ball.y-cy)/(d||1);
        ball.x=cx+nx*(BR+.5);ball.y=cy+ny*(BR+.5);
        wnx+=nx;wny+=ny;wcnt++;wpx=cx;wpy=cy;
      }
    }
    if(wcnt>0){
      const nd=Math.hypot(wnx,wny)||1;
      const fnx=wnx/nd,fny=wny/nd;
      lastNx=fnx;lastNy=fny;
      if(draining){
        ball.vx*=0.5;if(ball.vy<0)ball.vy=0;
      }else{
        const b=refl(ball.vx,ball.vy,fnx,fny,WREST);
        ball.vx=b.vx;ball.vy=b.vy;
        if(Math.abs(ball.vx)>MAX_V*.7)ball.vx*=.7;
        const spd=Math.hypot(ball.vx,ball.vy);
        if(spd>1.5){part(wpx,wpy,2);sndWall();send('haptic',{level:'light'});}
      }
    }

    // ── Corner bumper collisions (rounded vertices) ──
    for(const c of corners){
      const dx=ball.x-c.x,dy=ball.y-c.y,d=Math.hypot(dx,dy),mn=BR+c.r;
      if(d<mn&&d>.01){
        const nx=dx/d,ny=dy/d;
        ball.x=c.x+nx*(mn+.5);ball.y=c.y+ny*(mn+.5);
        const b=refl(ball.vx,ball.vy,nx,ny,WREST);
        ball.vx=b.vx;ball.vy=b.vy;
        lastNx=nx;lastNy=ny;
      }
    }

    // ── Score bumper collisions ──
    for(const b of bumpers){
      const dx=ball.x-b.x,dy=ball.y-b.y,d=Math.hypot(dx,dy),mn=BR+b.r;
      if(d<mn&&d>.01){
        const nx=dx/d,ny=dy/d;
        ball.x=b.x+nx*(mn+1.5);ball.y=b.y+ny*(mn+1.5);
        const sp=7.5+Math.random()*1.5;
        ball.vx=nx*sp;ball.vy=ny*sp;
        cv=clampV(ball.vx,ball.vy,MAX_V);ball.vx=cv.vx;ball.vy=cv.vy;
        b.g=1;setTimeout(()=>{b.g=0;},280);
        addS(b.pts,b.x+nx*b.r,b.y+ny*b.r);
        part(b.x+nx*b.r,b.y+ny*b.r,12,1.3);
        ripple(b.x,b.y,b.r+15);
        doShake(4);sndBump();send('haptic',{level:'medium'});
        lastNx=nx;lastNy=ny;
      }
    }

    // ── Flipper collisions ──
    if(!draining){
      for(const f of flippers){
        const tipX=f.px+Math.cos(f.angle)*f.len,tipY=f.py+Math.sin(f.angle)*f.len;
        const{d,cx,cy}=ptSeg(ball.x,ball.y,f.px,f.py,tipX,tipY);
        const hitR=BR+3;
        if(d<hitR){
          const nx=(ball.x-cx)/(d||1),ny=(ball.y-cy)/(d||1);
          ball.x=cx+nx*(hitR+.5);ball.y=cy+ny*(hitR+.5);
          if(f.on){
            const along=Math.max(0,Math.min(1,Math.hypot(cx-f.px,cy-f.py)/f.len));
            const powerScale=0.7+along*0.4;
            const elapsed=(performance.now()-f.hitT)/1000;
            const timedBonus=elapsed<0.08?1.12:1;
            const totalPow=FP*powerScale*timedBonus;
            ball.vx=(f.side==='L'?totalPow*0.5:-totalPow*0.5);
            ball.vy=-totalPow;
            if(ball.vy>-FP*0.35)ball.vy=-FP*0.35;
            cv=clampV(ball.vx,ball.vy,MAX_V);ball.vx=cv.vx;ball.vy=cv.vy;
            f.flash=1;setTimeout(()=>{f.flash=0;},100);
            part(cx,cy,8,1.3);addS(30,cx,cy);ripple(cx,cy,20);
            doShake(3);sndFlip();send('haptic',{level:'medium'});
          }else{
            const b=refl(ball.vx,ball.vy,nx,ny,0.6);
            ball.vx=b.vx;ball.vy=b.vy;
          }
        }
      }
    }

    // ── Bounds ──
    if(ball.x<16+BR){ball.x=16+BR;ball.vx=Math.abs(ball.vx)*.6;}
    if(ball.x>TW-10-BR){ball.x=TW-10-BR;ball.vx=-Math.abs(ball.vx)*.6;}
    if(ball.y<44+BR){ball.y=44+BR;ball.vy=Math.abs(ball.vy)*.6;}

    // ── DRAIN ──
    if(ball.y>TH-10){
      ball.alive=false;st='lost';
      part(ball.x,ball.y,25,1.6);doShake(10);sndDrain();
      send('haptic',{level:'heavy'});send('gameover',{result:'lost',score});return;
    }
  }

  // Anti-stuck: 250ms threshold, impulse along last valid normal
  if(ball.go){
    const spd=Math.hypot(ball.vx,ball.vy);
    if(spd<MIN_V){
      stuckT+=dt;
      if(stuckT>0.30){
        // Impulse toward center of board
        ball.vx+=(TW/2-ball.x)*0.02+(Math.random()-.5)*2;
        ball.vy+=2;
        stuckT=0;
      }
    }else{stuckT=0;}
    if(spd>0.1&&spd<MIN_V){const f=MIN_V/spd;ball.vx*=f;ball.vy*=f;}
  }

  // Flipper angle update
  for(const f of flippers){
    const tgt=f.on?f.flip:f.rest;
    const df=tgt-f.angle;
    const mv=(f.on?30:10)*dt;
    f.angle+=Math.abs(df)<mv?df:Math.sign(df)*mv;
  }

  // Start countdown only after the ball is launched.
  if(ball.go){
    tLeft=Math.max(0,tLeft-dt);
    if(tLeft<=0){st='won';send('gameover',{result:'won',score});return;}
  }
  send('timer',{timeLeft:Math.ceil(tLeft)});
  cT+=dt;if(cT>2.5)combo=0;
}

// ──── DRAW ────
function gLine(x1,y1,x2,y2,a,lw,bl){
  X.strokeStyle='rgba(255,255,255,'+a+')';X.lineWidth=ts(lw);X.shadowColor='rgba(255,255,255,'+a*.6+')';X.shadowBlur=ts(bl);
  X.beginPath();X.moveTo(tx(x1)+shake.x,ty(y1)+shake.y);X.lineTo(tx(x2)+shake.x,ty(y2)+shake.y);X.stroke();X.shadowBlur=0;
}

function draw(t){
  X.clearRect(0,0,W,H);const sx=shake.x,sy=shake.y;

  // BG
  const bg=X.createRadialGradient(W/2,H*.4,0,W/2,H/2,H);
  bg.addColorStop(0,'#0e0e0e');bg.addColorStop(1,'#050505');
  X.fillStyle=bg;X.fillRect(0,0,W,H);

  // Orbs
  for(const o of orbs){
    const ox=o.x+Math.sin(t*o.sp+o.ph)*22+o.dr*Math.sin(t*.25);
    const oy=o.y+Math.cos(t*o.sp*1.2+o.ph)*16;
    const g=X.createRadialGradient(tx(ox)+sx,ty(oy)+sy,0,tx(ox)+sx,ty(oy)+sy,ts(o.r));
    g.addColorStop(0,'rgba(255,255,255,0.04)');g.addColorStop(1,'transparent');
    X.fillStyle=g;X.beginPath();X.arc(tx(ox)+sx,ty(oy)+sy,ts(o.r),0,T2);X.fill();
  }

  // Stars
  for(const s of stars){X.globalAlpha=.15+.2*Math.sin(s.p+t*1.5);X.fillStyle='#fff';X.beginPath();X.arc(tx(s.x)+sx,ty(s.y)+sy,ts(s.r),0,T2);X.fill();}
  X.globalAlpha=1;

  // Table surface
  X.fillStyle='rgba(12,12,12,0.8)';X.fillRect(tx(18)+sx,ty(45)+sy,ts(TW-36),ts(TH-65));

  // Table border
  X.shadowColor='rgba(255,255,255,0.25)';X.shadowBlur=ts(18);
  X.strokeStyle='rgba(255,255,255,0.35)';X.lineWidth=ts(3);
  X.strokeRect(tx(16)+sx,ty(43)+sy,ts(TW-32),ts(TH-60));
  X.shadowBlur=ts(4);X.strokeStyle='rgba(255,255,255,0.15)';X.lineWidth=ts(1);
  X.strokeRect(tx(16)+sx,ty(43)+sy,ts(TW-32),ts(TH-60));
  X.shadowBlur=0;

  // All wall lines (physics + visual-only, same appearance)
  X.lineCap='round';
  for(const w of walls)gLine(w.x1,w.y1,w.x2,w.y2,.4,2.5,6);
  for(const w of visualOnly)gLine(w.x1,w.y1,w.x2,w.y2,.4,2.5,6);
  X.lineCap='butt';

  // Slingshot triangle fills
  X.globalAlpha=.04;X.fillStyle='#fff';
  for(const tri of[[[85,TH-265],[75,TH-190],[120,TH-165]],[[TW-85,TH-265],[TW-75,TH-190],[TW-120,TH-165]]]){
    X.beginPath();X.moveTo(tx(tri[0][0])+sx,ty(tri[0][1])+sy);
    tri.slice(1).forEach(p=>X.lineTo(tx(p[0])+sx,ty(p[1])+sy));X.closePath();X.fill();
  }
  X.globalAlpha=1;

  // Dot ring around 500
  for(const d of dotRing){const p=.3+.7*Math.sin(d.ph+t*2);X.fillStyle='rgba(255,255,255,'+(p>.55?.5:.15)+')';X.shadowColor='rgba(255,255,255,.3)';X.shadowBlur=ts(p>.55?6:1);X.beginPath();X.arc(tx(d.x)+sx,ty(d.y)+sy,ts(d.r),0,T2);X.fill();}
  X.shadowBlur=0;
  X.strokeStyle='rgba(255,255,255,0.08)';X.lineWidth=ts(1.5);X.beginPath();X.arc(tx(TW/2)+sx,ty(358)+sy,ts(58),0,T2);X.stroke();

  // Score bumpers
  for(const b of bumpers){
    const lit=b.g>0;const alpha=lit?1:.45;
    X.shadowColor='rgba(255,255,255,'+(lit?.6:.2)+')';X.shadowBlur=ts(lit?30:8);
    X.strokeStyle='rgba(255,255,255,'+alpha+')';X.lineWidth=ts(lit?3.5:2.5);
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r),0,T2);X.stroke();
    X.fillStyle=lit?'rgba(255,255,255,0.9)':'rgba(10,10,10,0.85)';
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r-3),0,T2);X.fill();
    X.shadowBlur=0;
    X.strokeStyle='rgba(255,255,255,'+(lit?.4:.12)+')';X.lineWidth=ts(1);
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r*.55),0,T2);X.stroke();
    X.fillStyle=lit?'#000':'rgba(255,255,255,'+alpha+')';
    X.font='bold '+ts(b.r*.48)+'px monospace';X.textAlign='center';X.textBaseline='middle';
    X.fillText(b.pts,tx(b.x)+sx,ty(b.y)+sy);
    if(b.pts>=500){X.fillStyle='rgba(255,255,255,'+(lit?1:.4)+')';X.font=ts(9)+'px sans-serif';X.fillText('★',tx(b.x)+sx,ty(b.y-b.r-9)+sy);}
  }
  X.shadowBlur=0;

  // Flippers
  X.lineCap='round';
  for(const f of flippers){
    const tipX=f.px+Math.cos(f.angle)*f.len,tipY=f.py+Math.sin(f.angle)*f.len;
    X.strokeStyle='rgba(255,255,255,0.08)';X.lineWidth=ts(15);X.shadowBlur=0;
    X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();
    const isHit=f.flash>0;
    const fg=X.createLinearGradient(tx(f.px)+sx,ty(f.py)+sy,tx(tipX)+sx,ty(tipY)+sy);
    fg.addColorStop(0,'rgba(255,255,255,'+(f.on||isHit?1:.85)+')');
    fg.addColorStop(1,'rgba(255,255,255,'+(f.on||isHit?.8:.45)+')');
    X.strokeStyle=fg;X.lineWidth=ts(f.on?12:11);
    X.shadowColor='rgba(255,255,255,'+(f.on||isHit?.6:.25)+')';X.shadowBlur=ts(f.on||isHit?28:8);
    X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();
    X.shadowBlur=0;
    if(isHit){X.globalAlpha=.5;X.strokeStyle='#fff';X.lineWidth=ts(16);X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();X.globalAlpha=1;}
    X.fillStyle=f.on?'#fff':'rgba(255,255,255,0.9)';X.beginPath();X.arc(tx(f.px)+sx,ty(f.py)+sy,ts(f.on?6:5),0,T2);X.fill();
  }
  X.lineCap='butt';X.shadowBlur=0;

  // Drain zone
  const lTipX=flippers[0].px+Math.cos(flippers[0].rest)*flippers[0].len;
  const rTipX=flippers[1].px+Math.cos(flippers[1].rest)*flippers[1].len;
  if(ball.alive&&ball.go&&ball.y>TH-140){
    const danger=Math.min(1,(ball.y-(TH-140))/100);
    X.fillStyle='rgba(255,80,80,'+(danger*.06)+')';
    X.fillRect(tx(lTipX-5)+sx,ty(TH-80)+sy,ts(rTipX-lTipX+10),ts(75));
  }
  X.strokeStyle='rgba(255,255,255,0.3)';X.lineWidth=ts(2);X.shadowColor='rgba(255,255,255,.2)';X.shadowBlur=ts(8);
  X.setLineDash([ts(6),ts(5)]);
  X.beginPath();X.moveTo(tx(lTipX+5)+sx,ty(TH-18)+sy);X.lineTo(tx(rTipX-5)+sx,ty(TH-18)+sy);X.stroke();
  X.setLineDash([]);X.shadowBlur=0;
  X.fillStyle='rgba(255,255,255,0.42)';X.shadowColor='rgba(255,255,255,0.2)';X.shadowBlur=ts(6);
  X.font='bold '+ts(8)+'px monospace';X.textAlign='center';X.textBaseline='middle';
  X.fillText('DRAIN',tx(TW/2)+sx,ty(TH-7)+sy);X.shadowBlur=0;

  // Ripples
  for(let i=ripples.length-1;i>=0;i--){const rp=ripples[i];rp.r+=(rp.maxR-rp.r)*.15;rp.l-=.035;if(rp.l<=0){ripples.splice(i,1);continue;}X.globalAlpha=rp.l*.4;X.strokeStyle='#fff';X.lineWidth=ts(1.5);X.beginPath();X.arc(tx(rp.x)+sx,ty(rp.y)+sy,ts(rp.r),0,T2);X.stroke();}
  X.globalAlpha=1;

  // Ball
  if(ball.alive){
    const spd=Math.hypot(ball.vx,ball.vy);
    if(ball.go&&spd>2){X.globalAlpha=.2;for(let i=1;i<=4;i++){X.fillStyle='rgba(255,255,255,'+(0.1/i)+')';X.beginPath();X.arc(tx(ball.x-ball.vx*i*.1)+sx,ty(ball.y-ball.vy*i*.1)+sy,ts(BR*(1-i*.12)),0,T2);X.fill();}X.globalAlpha=1;}
    const haloI=Math.min(.3+spd*.015,.5);
    const halo=X.createRadialGradient(tx(ball.x)+sx,ty(ball.y)+sy,0,tx(ball.x)+sx,ty(ball.y)+sy,ts(BR*2.5));
    halo.addColorStop(0,'rgba(255,255,255,'+haloI+')');halo.addColorStop(1,'rgba(255,255,255,0)');
    X.fillStyle=halo;X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR*2.5),0,T2);X.fill();
    const bg2=X.createRadialGradient(tx(ball.x-2)+sx,ty(ball.y-3)+sy,ts(1),tx(ball.x)+sx,ty(ball.y)+sy,ts(BR));
    bg2.addColorStop(0,'#fff');bg2.addColorStop(.4,'#ccc');bg2.addColorStop(1,'#666');
    X.shadowColor='rgba(255,255,255,.5)';X.shadowBlur=ts(14);X.fillStyle=bg2;
    X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR),0,T2);X.fill();
    X.shadowBlur=0;X.strokeStyle='rgba(255,255,255,0.4)';X.lineWidth=ts(1.2);
    X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR),0,T2);X.stroke();
    X.fillStyle='rgba(255,255,255,0.7)';X.beginPath();X.arc(tx(ball.x-3)+sx,ty(ball.y-4)+sy,ts(3),0,T2);X.fill();
  }

  // Particles
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.l-=.03;if(p.l<=0){parts.splice(i,1);continue;}X.globalAlpha=p.l*.8;X.fillStyle='#fff';X.shadowColor='rgba(255,255,255,.3)';X.shadowBlur=ts(4);X.beginPath();X.arc(tx(p.x)+sx,ty(p.y)+sy,ts(p.r*p.l),0,T2);X.fill();}
  X.globalAlpha=1;X.shadowBlur=0;

  // Score popups
  for(let i=pops.length-1;i>=0;i--){const p=pops[i];p.y+=p.vy;p.l-=.024;if(p.l<=0){pops.splice(i,1);continue;}X.globalAlpha=p.l;X.fillStyle='#fff';X.shadowColor='rgba(255,255,255,.5)';X.shadowBlur=ts(8);X.font='bold '+ts(13)+'px monospace';X.textAlign='center';X.textBaseline='middle';X.fillText(p.t,tx(p.x)+sx,ty(p.y)+sy);}
  X.globalAlpha=1;X.shadowBlur=0;

  // Combo
  if(combo>=2){X.globalAlpha=Math.min(1,combo*.15+.3);X.fillStyle='#fff';X.shadowColor='rgba(255,255,255,.4)';X.shadowBlur=ts(10);X.font='bold '+ts(combo>=5?18:14)+'px monospace';X.textAlign='center';X.textBaseline='middle';X.fillText(combo+'x COMBO',tx(TW/2)+sx,ty(TH-110)+sy);X.shadowBlur=0;X.globalAlpha=1;}

  // Launch zone
  if(!ball.go){
    X.fillStyle='rgba(255,255,255,0.03)';X.fillRect(tx(TW-56)+sx,ty(68)+sy,ts(42),ts(TH-95));
    const p=.5+.5*Math.sin(t*3);X.globalAlpha=.25+.35*p;X.fillStyle='#fff';X.font='bold '+ts(10)+'px sans-serif';X.textAlign='center';
    X.fillText('▼',tx(TW-35)+sx,ty(TH-360)+sy);X.fillText('▼',tx(TW-35)+sx,ty(TH-390)+sy);
    X.font='bold '+ts(8)+'px sans-serif';X.fillText('HOLD',tx(TW-37)+sx,ty(TH-410)+sy);X.globalAlpha=1;
    X.globalAlpha=.55;X.shadowColor='rgba(255,255,255,0.2)';X.shadowBlur=ts(6);
    X.font='bold '+ts(8)+'px sans-serif';X.fillStyle='#fff';
    X.fillText('◄ TAP',tx(90)+sx,ty(TH-24)+sy);X.fillText('TAP ►',tx(TW-90)+sx,ty(TH-24)+sy);
    X.shadowBlur=0;X.globalAlpha=1;
  }

  // Power bar
  if(chrg&&!ball.go){
    const bH=ts(180),bW=ts(14),bX=tx(TW-48)+sx-bW/2,bY=ty(TH-330)+sy;
    X.fillStyle='rgba(0,0,0,.6)';X.fillRect(bX,bY,bW,bH);
    const fH=bH*lp,pg=X.createLinearGradient(bX,bY+bH,bX,bY);
    pg.addColorStop(0,'rgba(255,255,255,0.3)');pg.addColorStop(.5,'rgba(255,255,255,0.6)');pg.addColorStop(1,'rgba(255,255,255,1)');
    X.fillStyle=pg;X.fillRect(bX,bY+bH-fH,bW,fH);
    X.strokeStyle='rgba(255,255,255,.4)';X.lineWidth=ts(1.5);X.strokeRect(bX,bY,bW,bH);
    X.fillStyle='rgba(255,255,255,.6)';X.font='bold '+ts(8)+'px sans-serif';X.textAlign='center';X.fillText('PWR',bX+bW/2,bY-ts(10));
  }
}

// ──── LOOP ────
function loop(now){const dt=Math.min((now-lt)/1000,.05);lt=now;tt+=dt;
  if(chrg&&!ball.go)lp=Math.min(lp+dt*.9,1);
  if(st==='playing')step(dt);
  if(shake.t>0){shake.t-=dt;if(shake.t<=0){shake.x=0;shake.y=0;}}
  draw(tt);
  if(st==='playing'||st==='paused')requestAnimationFrame(loop);
}

// ──── INPUT ────
document.addEventListener('touchstart',e=>{e.preventDefault();
  if(AC.state==='suspended')AC.resume();
  for(const t of e.changedTouches){const x=t.clientX,mid=innerWidth/2;
    if(!ball.go&&x>innerWidth*.76){chrg=true;lp=0;}
    else if(x<mid){flippers[0].on=true;flippers[0].hitT=performance.now();sndFlip();}
    else{flippers[1].on=true;flippers[1].hitT=performance.now();sndFlip();}
  }
},{passive:false});

document.addEventListener('touchend',e=>{e.preventDefault();
  for(const t of e.changedTouches){const x=t.clientX,mid=innerWidth/2;
    if(chrg&&!ball.go){chrg=false;ball.go=true;ball.vy=-(10+lp*14);ball.vx=-.8-Math.random()*2;lp=0;sndLaunch();send('launched',{});send('haptic',{level:'heavy'});}
    else if(x<mid)flippers[0].on=false;
    else flippers[1].on=false;
  }
},{passive:false});

addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='pause')st='paused';else if(m.type==='resume'){st='playing';lt=performance.now();requestAnimationFrame(loop);}}catch(e){}});

send('ready',{difficulty:'${diff}',duration:DUR});
requestAnimationFrame(loop);
})();
</script></body></html>`;
};
