// ===================================================================
// SolPin Arcade — HTML5 Canvas Pinball Engine v3
// Bouncier physics • wider drain gap • monotone aesthetic
// WebAudio sound effects • haptic feedback via postMessage
// ===================================================================

import { Difficulty } from '../theme';

interface PinballHTMLOptions {
  difficulty: Difficulty;
  duration: number;
}

const GRAV: Record<Difficulty, number> = { easy: 0.36, medium: 0.50, hard: 0.68 };
const FPOW: Record<Difficulty, number> = { easy: 17, medium: 13.5, hard: 10 };

export const generatePinballHTML = (opts: PinballHTMLOptions): string => {
  const grav = GRAV[opts.difficulty];
  const fpow = FPOW[opts.difficulty];
  const dur = opts.duration;
  const diff = opts.difficulty.toUpperCase();

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#080810;touch-action:none;user-select:none}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="c"></canvas><script>
(function(){'use strict';
const C=document.getElementById('c'),X=C.getContext('2d');
let W=0,H=0,sc=1;const dpr=window.devicePixelRatio||1;
function resize(){W=C.width=innerWidth*dpr;H=C.height=innerHeight*dpr;C.style.width=innerWidth+'px';C.style.height=innerHeight+'px';sc=Math.min(W/460,H/900);}
resize();addEventListener('resize',resize);

const G=${grav},FP=${fpow},DUR=${dur},BR=11,PI=Math.PI,T2=PI*2;
const TW=420,TH=850;
const tx=x=>(W-TW*sc)/2+x*sc,ty=y=>(H-TH*sc)/2+y*sc,ts=s=>s*sc;

// ──── SOUND ENGINE (WebAudio) ────
const AC=new(window.AudioContext||window.webkitAudioContext)();
function playTone(freq,dur,type,vol){
  try{
    const osc=AC.createOscillator(),gain=AC.createGain();
    osc.type=type||'sine';osc.frequency.value=freq;
    gain.gain.setValueAtTime(vol||.15,AC.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);
    osc.connect(gain);gain.connect(AC.destination);
    osc.start();osc.stop(AC.currentTime+dur);
  }catch(e){}
}
function sndBumper(){playTone(600+Math.random()*400,.12,'square',.12);playTone(1200+Math.random()*300,.08,'sine',.08);}
function sndWall(){playTone(200+Math.random()*150,.06,'triangle',.06);}
function sndFlipper(){playTone(350,.08,'sawtooth',.1);}
function sndLaunch(){playTone(150,.15,'sawtooth',.12);setTimeout(()=>playTone(300,.1,'sine',.08),80);}
function sndDrain(){playTone(120,.4,'sawtooth',.15);setTimeout(()=>playTone(80,.3,'sine',.1),150);}

// ──── MONOTONE COLOR PALETTE ────
const CL={
  bg1:'#0c0c18',bg2:'#060610',
  wall:'#556688',wallGlow:'#667799',
  bumperA:'#8899bb',bumperB:'#99aacc',bumperC:'#7788aa',
  bumperHi:'#ccddff',bumperStar:'#eeddaa',
  flipper:'#ccbb88',flipperGlow:'#eedd99',
  ball:'#dde0f0',ballGlow:'#aabbdd',
  drain:'#aa5555',drainGlow:'#cc6666',
  sling:'#8877aa',
  accent:'#aabbdd',accentDim:'#556677',
  text:'#99aabb',textHi:'#ddeeff',
  purple:'#8877aa',purpleGlow:'#9988bb',
  green:'#88aa88',orange:'#bbaa77',
};

// ──── STARS + MOVING BACKGROUND ────
const stars=Array.from({length:90},()=>({x:Math.random()*TW,y:Math.random()*TH,r:.3+Math.random()*1.2,p:Math.random()*T2}));
const orbs=Array.from({length:10},()=>({
  x:40+Math.random()*(TW-80),y:80+Math.random()*(TH-200),
  r:18+Math.random()*30,sp:.15+Math.random()*.45,ph:Math.random()*T2,
  col:['rgba(60,60,100,0.08)','rgba(50,50,80,0.06)','rgba(70,60,90,0.07)'][Math.floor(Math.random()*3)],
  dr:Math.random()*1.2-.6
}));
const rings=Array.from({length:5},()=>({
  x:50+Math.random()*(TW-100),y:100+Math.random()*(TH-300),
  r:20+Math.random()*35,sp:.2+Math.random()*.35,ph:Math.random()*T2,
  col:'rgba(100,110,140,0.06)'
}));

// ──── WALLS ────
const walls=[
  {x1:24,y1:48,x2:24,y2:TH-145},{x1:TW-24,y1:48,x2:TW-24,y2:TH-145},
  {x1:24,y1:48,x2:TW-24,y2:48},
  {x1:24,y1:TH-145,x2:115,y2:TH-62},{x1:TW-24,y1:TH-145,x2:TW-115,y2:TH-62},
  // slingshots
  {x1:72,y1:TH-285,x2:52,y2:TH-175},{x1:52,y1:TH-175,x2:115,y2:TH-130},{x1:115,y1:TH-130,x2:72,y2:TH-285},
  {x1:TW-72,y1:TH-285,x2:TW-52,y2:TH-175},{x1:TW-52,y1:TH-175,x2:TW-115,y2:TH-130},{x1:TW-115,y1:TH-130,x2:TW-72,y2:TH-285},
  // arches
  {x1:24,y1:48,x2:68,y2:92},{x1:68,y1:92,x2:68,y2:158},
  {x1:TW-24,y1:48,x2:TW-68,y2:92},{x1:TW-68,y1:92,x2:TW-68,y2:158},
  // launch lane
  {x1:TW-14,y1:68,x2:TW-14,y2:TH-25},{x1:TW-56,y1:68,x2:TW-56,y2:218},{x1:TW-56,y1:218,x2:TW-24,y2:48},
  // center V
  {x1:148,y1:478,x2:128,y2:535},{x1:TW-148,y1:478,x2:TW-128,y2:535},
  // side lanes
  {x1:88,y1:158,x2:88,y2:255},{x1:TW-88,y1:158,x2:TW-88,y2:255},
];

// ──── BUMPERS ────
const bumpers=[
  {x:TW/2,y:175,r:31,pts:300,col:CL.bumperA,g:0},
  {x:TW/2-70,y:245,r:27,pts:200,col:CL.bumperB,g:0},
  {x:TW/2+70,y:245,r:27,pts:200,col:CL.bumperC,g:0},
  {x:108,y:378,r:23,pts:150,col:CL.green,g:0},
  {x:TW-108,y:378,r:23,pts:150,col:CL.green,g:0},
  {x:TW/2,y:318,r:20,pts:500,col:CL.bumperStar,g:0},
  {x:158,y:542,r:17,pts:120,col:CL.orange,g:0},
  {x:TW-158,y:542,r:17,pts:120,col:CL.orange,g:0},
  {x:TW/2-36,y:435,r:14,pts:180,col:CL.bumperB,g:0},
  {x:TW/2+36,y:435,r:14,pts:180,col:CL.bumperC,g:0},
  {x:TW/2-108,y:178,r:15,pts:100,col:CL.orange,g:0},
  {x:TW/2+108,y:178,r:15,pts:100,col:CL.orange,g:0},
];

const dotRing=Array.from({length:18},(_,i)=>{const a=T2*i/18;return{x:TW/2+Math.cos(a)*65,y:318+Math.sin(a)*65,r:3.5,ph:i*.35};});

// ──── FLIPPERS — WIDE DRAIN GAP ────
// Flipper pivots at x=140 and TW-140 = 280, gap ~ 140px (>6 ball widths)
const flippers=[
  {px:140,py:TH-66,len:72,rest:0.42,flip:-0.85,angle:0.42,on:false,side:'L'},
  {px:TW-140,py:TH-66,len:72,rest:PI-0.42,flip:PI+0.85,angle:PI-0.42,on:false,side:'R'},
];

// ──── STATE ────
let ball={x:TW-40,y:TH-190,vx:0,vy:0,alive:true,go:false};
let score=0,combo=0,cT=0,tLeft=DUR,st='playing',lt=performance.now(),tt=0;
let lp=0,chrg=false,parts=[],pops=[];
let shake={x:0,y:0,t:0};

function part(x,y,c,n,pw){pw=pw||1;for(let i=0;i<n;i++){const a=Math.random()*T2,s=(1+Math.random()*3.5)*pw;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,r:1.5+Math.random()*3,c});}}
function pop(x,y,t,c){pops.push({x,y,t,c,l:1,vy:-1.6});}
function doShake(p){shake.x=(Math.random()-.5)*p;shake.y=(Math.random()-.5)*p;shake.t=.12;}
function send(t,d){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:t,...(d||{})}));}
function addS(pts,bx,by,c){combo++;cT=0;const m=Math.min(1+combo*.25,5);const g=Math.round(pts*m);score+=g;pop(bx,by,'+'+g,c||CL.textHi);send('score',{score,combo:Math.round(m*10)/10});}

// ──── COLLISION ────
function ptSeg(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(!l2)return{d:Math.hypot(px-x1,py-y1),cx:x1,cy:y1};const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));const cx=x1+t*dx,cy=y1+t*dy;return{d:Math.hypot(px-cx,py-cy),cx,cy};}
function refl(vx,vy,nx,ny,r){const d=vx*nx+vy*ny;return{vx:vx-2*d*nx*r,vy:vy-2*d*ny*r};}

// ──── PHYSICS (bouncier) ────
function step(dt){
  if(!ball.alive)return;
  const dtC=Math.min(dt,.022),N=5,sub=dtC/N;
  for(let i=0;i<N;i++){
    if(ball.go){ball.vy+=G*60*sub;ball.vx*=.9996;ball.vy*=.9996;}
    const spd=Math.hypot(ball.vx,ball.vy);
    if(spd>32){ball.vx=ball.vx/spd*32;ball.vy=ball.vy/spd*32;}
    ball.x+=ball.vx*60*sub;ball.y+=ball.vy*60*sub;

    // Walls (bouncy restitution 0.75)
    for(const w of walls){
      const{d,cx,cy}=ptSeg(ball.x,ball.y,w.x1,w.y1,w.x2,w.y2);
      if(d<BR){const nx=(ball.x-cx)/d,ny=(ball.y-cy)/d;
        ball.x=cx+nx*(BR+.8);ball.y=cy+ny*(BR+.8);
        const b=refl(ball.vx,ball.vy,nx,ny,0.75);ball.vx=b.vx;ball.vy=b.vy;
        if(spd>2){part(cx,cy,CL.wallGlow,2);sndWall();send('haptic',{level:'light'});}
      }
    }

    // Bumpers (very bouncy restitution + high kick)
    for(const b of bumpers){
      const dx=ball.x-b.x,dy=ball.y-b.y,d=Math.hypot(dx,dy),mn=BR+b.r;
      if(d<mn&&d>.01){
        const nx=dx/d,ny=dy/d;
        ball.x=b.x+nx*(mn+1.5);ball.y=b.y+ny*(mn+1.5);
        const sp=8+Math.random()*3;
        ball.vx=nx*sp;ball.vy=ny*sp;
        b.g=1;setTimeout(()=>{b.g=0;},280);
        addS(b.pts,b.x+nx*b.r,b.y+ny*b.r,b.col);
        part(b.x+nx*b.r,b.y+ny*b.r,CL.bumperHi,14,1.4);
        doShake(5);sndBumper();send('haptic',{level:'medium'});
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
          ball.vx=f.side==='L'?FP*.55:-FP*.55;ball.vy=-FP;
          part(cx,cy,CL.flipperGlow,8,1.4);addS(30,cx,cy,CL.flipperGlow);
          doShake(2);sndFlipper();send('haptic',{level:'medium'});
        }else{
          const b=refl(ball.vx,ball.vy,nx,ny,.55);ball.vx=b.vx;ball.vy=b.vy;
        }
      }
    }

    // Bounds
    if(ball.x<18+BR){ball.x=18+BR;ball.vx=Math.abs(ball.vx)*.7;}
    if(ball.x>TW-10-BR){ball.x=TW-10-BR;ball.vx=-Math.abs(ball.vx)*.7;}
    if(ball.y<42+BR){ball.y=42+BR;ball.vy=Math.abs(ball.vy)*.7;}

    // Drain
    if(ball.y>TH-10){
      ball.alive=false;st='lost';
      part(ball.x,ball.y,CL.drain,22,1.6);doShake(10);sndDrain();
      send('haptic',{type:'heavy'});send('gameover',{result:'lost',score});return;
    }
  }

  // Flipper animation
  for(const f of flippers){
    const tgt=f.on?f.flip:f.rest,df=tgt-f.angle,mv=(f.on?24:10)*dtC;
    f.angle+=Math.abs(df)<mv?df:Math.sign(df)*mv;
  }

  tLeft=Math.max(0,tLeft-dt);
  if(tLeft<=0){st='won';send('gameover',{result:'won',score});return;}
  send('timer',{timeLeft:Math.ceil(tLeft)});
  cT+=dt;if(cT>1.8)combo=0;
}

// ──── DRAW ────
function gLine(x1,y1,x2,y2,col,lw,bl){
  X.strokeStyle=col;X.lineWidth=ts(lw);X.shadowColor=col;X.shadowBlur=ts(bl);
  X.beginPath();X.moveTo(tx(x1)+shake.x,ty(y1)+shake.y);X.lineTo(tx(x2)+shake.x,ty(y2)+shake.y);X.stroke();X.shadowBlur=0;
}

function draw(t){
  X.clearRect(0,0,W,H);const sx=shake.x,sy=shake.y;

  // BG
  const bg=X.createRadialGradient(W/2,H*.4,0,W/2,H/2,H);
  bg.addColorStop(0,CL.bg1);bg.addColorStop(1,CL.bg2);
  X.fillStyle=bg;X.fillRect(0,0,W,H);

  // Moving orbs
  for(const o of orbs){
    const ox=o.x+Math.sin(t*o.sp+o.ph)*22+o.dr*Math.sin(t*.25);
    const oy=o.y+Math.cos(t*o.sp*1.2+o.ph)*16;
    const g=X.createRadialGradient(tx(ox)+sx,ty(oy)+sy,0,tx(ox)+sx,ty(oy)+sy,ts(o.r));
    g.addColorStop(0,o.col);g.addColorStop(1,'transparent');
    X.fillStyle=g;X.beginPath();X.arc(tx(ox)+sx,ty(oy)+sy,ts(o.r),0,T2);X.fill();
  }
  for(const r of rings){
    const rx=r.x+Math.sin(t*r.sp+r.ph)*25,ry=r.y+Math.cos(t*r.sp*.8+r.ph)*18,rr=r.r+Math.sin(t*1.3+r.ph)*8;
    X.strokeStyle=r.col;X.lineWidth=ts(1.5);X.beginPath();X.arc(tx(rx)+sx,ty(ry)+sy,ts(rr),0,T2);X.stroke();
  }

  // Stars
  for(const s of stars){X.globalAlpha=.2+.3*Math.sin(s.p+t*1.5);X.fillStyle='#bbc';X.beginPath();X.arc(tx(s.x)+sx,ty(s.y)+sy,ts(s.r),0,T2);X.fill();}
  X.globalAlpha=1;

  // Table surface
  const tg=X.createLinearGradient(tx(20),ty(45),tx(20),ty(TH-20));
  tg.addColorStop(0,'rgba(12,10,25,0.75)');tg.addColorStop(.5,'rgba(8,6,18,0.85)');tg.addColorStop(1,'rgba(12,10,25,0.75)');
  X.fillStyle=tg;X.fillRect(tx(20)+sx,ty(45)+sy,ts(TW-40),ts(TH-65));

  // Table border
  X.shadowColor=CL.purpleGlow;X.shadowBlur=ts(20);
  X.strokeStyle=CL.purple;X.lineWidth=ts(3.5);
  X.strokeRect(tx(18)+sx,ty(42)+sy,ts(TW-36),ts(TH-58));
  X.shadowBlur=ts(5);X.strokeStyle=CL.purpleGlow;X.lineWidth=ts(1.2);
  X.strokeRect(tx(18)+sx,ty(42)+sy,ts(TW-36),ts(TH-58));
  X.shadowBlur=0;

  // Walls
  X.lineCap='round';
  for(const w of walls)gLine(w.x1,w.y1,w.x2,w.y2,CL.wall,2.5,7);
  X.lineCap='butt';

  // Slingshot fills
  X.globalAlpha=.08;X.fillStyle=CL.sling;
  for(const tri of[[[72,TH-285],[52,TH-175],[115,TH-130]],[[TW-72,TH-285],[TW-52,TH-175],[TW-115,TH-130]]]){
    X.beginPath();X.moveTo(tx(tri[0][0])+sx,ty(tri[0][1])+sy);tri.slice(1).forEach(p=>X.lineTo(tx(p[0])+sx,ty(p[1])+sy));X.closePath();X.fill();
  }
  X.globalAlpha=1;

  // Dot ring
  for(const d of dotRing){const p=.35+.65*Math.sin(d.ph+t*2);X.fillStyle=p>.6?CL.accent:CL.accentDim;X.shadowColor=CL.accent;X.shadowBlur=ts(p>.6?7:2);X.beginPath();X.arc(tx(d.x)+sx,ty(d.y)+sy,ts(d.r),0,T2);X.fill();}
  X.shadowBlur=0;
  X.strokeStyle='rgba(100,120,160,0.12)';X.lineWidth=ts(1.5);X.beginPath();X.arc(tx(TW/2)+sx,ty(318)+sy,ts(65),0,T2);X.stroke();

  // Bumpers
  for(const b of bumpers){
    const lit=b.g>0;
    X.shadowColor=lit?CL.bumperHi:b.col;X.shadowBlur=ts(lit?35:10);
    X.strokeStyle=lit?CL.bumperHi:b.col;X.lineWidth=ts(lit?4:2.5);
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r),0,T2);X.stroke();
    X.fillStyle=lit?CL.bumperHi:'rgba(8,8,20,0.8)';
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r-3),0,T2);X.fill();
    X.shadowBlur=0;X.strokeStyle=lit?'rgba(255,255,255,.3)':b.col+'33';X.lineWidth=ts(1);
    X.beginPath();X.arc(tx(b.x)+sx,ty(b.y)+sy,ts(b.r*.55),0,T2);X.stroke();
    X.fillStyle=lit?'#fff':b.col;X.font='bold '+ts(b.r*.48)+'px monospace';X.textAlign='center';X.textBaseline='middle';
    X.fillText(b.pts,tx(b.x)+sx,ty(b.y)+sy);
    if(b.pts>=500){X.fillStyle=lit?'#fff':'rgba(230,210,150,.5)';X.font=ts(9)+'px sans-serif';X.fillText('★',tx(b.x)+sx,ty(b.y-b.r-9)+sy);}
  }
  X.shadowBlur=0;

  // Flippers
  X.lineCap='round';
  for(const f of flippers){
    const tipX=f.px+Math.cos(f.angle)*f.len,tipY=f.py+Math.sin(f.angle)*f.len;
    X.strokeStyle='rgba(80,70,50,0.8)';X.lineWidth=ts(14);X.shadowBlur=0;
    X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();
    const fg=X.createLinearGradient(tx(f.px)+sx,ty(f.py)+sy,tx(tipX)+sx,ty(tipY)+sy);
    fg.addColorStop(0,'#ccbb88');fg.addColorStop(.5,'#aa9966');fg.addColorStop(1,'#887744');
    X.strokeStyle=fg;X.lineWidth=ts(11);X.shadowColor=CL.flipperGlow;X.shadowBlur=ts(f.on?20:8);
    X.beginPath();X.moveTo(tx(f.px)+sx,ty(f.py)+sy);X.lineTo(tx(tipX)+sx,ty(tipY)+sy);X.stroke();
    X.shadowBlur=0;X.fillStyle='#ddd';X.beginPath();X.arc(tx(f.px)+sx,ty(f.py)+sy,ts(5.5),0,T2);X.fill();
    X.strokeStyle=CL.flipper;X.lineWidth=ts(1.5);X.beginPath();X.arc(tx(f.px)+sx,ty(f.py)+sy,ts(5.5),0,T2);X.stroke();
  }
  X.lineCap='butt';X.shadowBlur=0;

  // DRAIN GAP — dashed red line between flippers
  const dL=flippers[0].px+30,dR=flippers[1].px-30,dY=TH-18;
  X.strokeStyle=CL.drain;X.lineWidth=ts(2.5);X.shadowColor=CL.drainGlow;X.shadowBlur=ts(10);
  X.setLineDash([ts(7),ts(5)]);X.beginPath();X.moveTo(tx(dL)+sx,ty(dY)+sy);X.lineTo(tx(dR)+sx,ty(dY)+sy);X.stroke();
  X.setLineDash([]);X.shadowBlur=0;
  X.fillStyle='rgba(170,80,80,0.35)';X.font=ts(7)+'px monospace';X.textAlign='center';X.textBaseline='middle';
  X.fillText('DRAIN',tx(TW/2)+sx,ty(TH-6)+sy);

  // Ball
  if(ball.alive){
    if(ball.go&&Math.hypot(ball.vx,ball.vy)>3){X.globalAlpha=.2;for(let i=1;i<=3;i++){X.fillStyle='rgba(150,160,200,'+(0.12/i)+')';X.beginPath();X.arc(tx(ball.x-ball.vx*i*.12)+sx,ty(ball.y-ball.vy*i*.12)+sy,ts(BR*(1-i*.15)),0,T2);X.fill();}X.globalAlpha=1;}
    const halo=X.createRadialGradient(tx(ball.x)+sx,ty(ball.y)+sy,0,tx(ball.x)+sx,ty(ball.y)+sy,ts(BR*2.8));
    halo.addColorStop(0,'rgba(180,190,220,0.35)');halo.addColorStop(1,'rgba(180,190,220,0)');
    X.fillStyle=halo;X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR*2.8),0,T2);X.fill();
    const bg2=X.createRadialGradient(tx(ball.x-2)+sx,ty(ball.y-3)+sy,ts(1),tx(ball.x)+sx,ty(ball.y)+sy,ts(BR));
    bg2.addColorStop(0,'#f0f0ff');bg2.addColorStop(.3,'#ccd0e8');bg2.addColorStop(.7,'#7880aa');bg2.addColorStop(1,'#404870');
    X.shadowColor=CL.ballGlow;X.shadowBlur=ts(14);X.fillStyle=bg2;
    X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR),0,T2);X.fill();
    X.shadowBlur=0;X.strokeStyle='rgba(140,160,200,0.6)';X.lineWidth=ts(1.5);
    X.beginPath();X.arc(tx(ball.x)+sx,ty(ball.y)+sy,ts(BR),0,T2);X.stroke();
    X.fillStyle='rgba(255,255,255,0.6)';X.beginPath();X.arc(tx(ball.x-3)+sx,ty(ball.y-4)+sy,ts(3),0,T2);X.fill();
  }

  // Particles
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.l-=.03;if(p.l<=0){parts.splice(i,1);continue;}X.globalAlpha=p.l;X.fillStyle=p.c;X.shadowColor=p.c;X.shadowBlur=ts(4);X.beginPath();X.arc(tx(p.x)+sx,ty(p.y)+sy,ts(p.r*p.l),0,T2);X.fill();}
  X.globalAlpha=1;X.shadowBlur=0;

  // Score popups
  for(let i=pops.length-1;i>=0;i--){const p=pops[i];p.y+=p.vy;p.l-=.024;if(p.l<=0){pops.splice(i,1);continue;}X.globalAlpha=p.l;X.fillStyle=p.c;X.shadowColor=p.c;X.shadowBlur=ts(10);X.font='bold '+ts(13)+'px monospace';X.textAlign='center';X.textBaseline='middle';X.fillText(p.t,tx(p.x)+sx,ty(p.y)+sy);}
  X.globalAlpha=1;X.shadowBlur=0;

  // Launch zone
  if(!ball.go){
    X.fillStyle='rgba(100,120,160,0.05)';X.fillRect(tx(TW-56)+sx,ty(68)+sy,ts(42),ts(TH-95));
    const p=.5+.5*Math.sin(t*3);X.globalAlpha=.3+.4*p;X.fillStyle=CL.accent;X.font='bold '+ts(10)+'px sans-serif';X.textAlign='center';
    X.fillText('▼',tx(TW-35)+sx,ty(TH-360)+sy);X.fillText('▼',tx(TW-35)+sx,ty(TH-390)+sy);
    X.font='bold '+ts(8)+'px sans-serif';X.fillText('HOLD',tx(TW-35)+sx,ty(TH-425)+sy);X.globalAlpha=1;
    X.globalAlpha=.3;X.font=ts(8)+'px sans-serif';X.fillStyle=CL.flipper;
    X.fillText('◄ TAP',tx(92)+sx,ty(TH-24)+sy);X.fillText('TAP ►',tx(TW-92)+sx,ty(TH-24)+sy);X.globalAlpha=1;
  }

  // Power bar
  if(chrg&&!ball.go){
    const bH=ts(180),bW=ts(14),bX=tx(TW-48)+sx-bW/2,bY=ty(TH-330)+sy;
    X.fillStyle='rgba(0,0,0,.55)';X.fillRect(bX,bY,bW,bH);
    const fH=bH*lp,pg=X.createLinearGradient(bX,bY+bH,bX,bY);
    pg.addColorStop(0,CL.green);pg.addColorStop(.5,CL.bumperStar);pg.addColorStop(1,CL.purple);
    X.fillStyle=pg;X.fillRect(bX,bY+bH-fH,bW,fH);
    X.strokeStyle=CL.accent;X.lineWidth=ts(1.5);X.strokeRect(bX,bY,bW,bH);
    X.fillStyle='#ccc';X.font='bold '+ts(8)+'px sans-serif';X.textAlign='center';X.fillText('PWR',bX+bW/2,bY-ts(10));
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
    else if(x<mid){flippers[0].on=true;sndFlipper();}
    else{flippers[1].on=true;sndFlipper();}
  }
},{passive:false});

document.addEventListener('touchend',e=>{e.preventDefault();
  for(const t of e.changedTouches){const x=t.clientX,mid=innerWidth/2;
    if(chrg&&!ball.go){chrg=false;ball.go=true;ball.vy=-(10+lp*16);ball.vx=-.8-Math.random()*2.5;lp=0;sndLaunch();send('launched',{});send('haptic',{type:'heavy'});}
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
