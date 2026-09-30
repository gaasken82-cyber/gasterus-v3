(()=>{
'use strict';
/* ==========================================================================
   GASTERUS R7.0.0 — ENTERPRISE 3D GLASS CONTROL — Interaction Layer
   Companion JS for enterprise-3d-r7000.css. Adds:
   • 3D perspective tilt on cards/panels (data-t3d-tilt)
   • Pointer tracking for dynamic glow position (data-t3d-glow)
   • Animated number count-up (data-t3d-count)
   • Floating entrance animations (data-t3d-float)
   • Background particle canvas (optional, data-t3d-canvas)
   ========================================================================== */
const CLASS='enterprise-3d-r7000';
const hasClass=()=>document.body.classList.contains(CLASS);
const reduced=window.matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---------- 3D tilt engine ---------- */
const tiltMap=new WeakMap();
function updateTilt(el,e){
  if(reduced||!hasClass())return;
  const r=el.getBoundingClientRect();
  if(r.width===0||r.height===0)return;
  const px=(e.clientX-r.left)/r.width;
  const py=(e.clientY-r.top)/r.height;
  const rx=(0.5-py)*14;   // max 7deg each side
  const ry=(px-0.5)*16;   // max 8deg each side
  el.style.setProperty('--t3d-rx',`${rx.toFixed(2)}deg`);
  el.style.setProperty('--t3d-ry',`${ry.toFixed(2)}deg`);
  el.style.setProperty('--t3d-mx',`${(px*100).toFixed(1)}%`);
  el.style.setProperty('--t3d-my',`${(py*100).toFixed(1)}%`);
}
function resetTilt(el){
  if(!el)return;
  el.style.setProperty('--t3d-rx','0deg');
  el.style.setProperty('--t3d-ry','0deg');
}
function bindTilt(el){
  if(tiltMap.has(el))return;
  const onMove=e=>updateTilt(el,e);
  const onLeave=()=>resetTilt(el);
  el.addEventListener('pointermove',onMove,{passive:true});
  el.addEventListener('pointerleave',onLeave,{passive:true});
  tiltMap.set(el,{onMove,onLeave});
}
function scanTilts(root=document){
  if(!hasClass())return;
  root.querySelectorAll?.('[data-t3d-tilt]').forEach(bindTilt);
}

/* ---------- count-up numbers ---------- */
const countMap=new WeakMap();
function animateCount(el){
  if(countMap.has(el)||reduced)return;
  const raw=(el.getAttribute('data-t3d-count')||el.textContent||'').replace(/[^\d.-]/g,'');
  const target=parseFloat(raw);
  if(!Number.isFinite(target))return;
  const prefix=el.getAttribute('data-t3d-prefix')||'';
  const suffix=el.getAttribute('data-t3d-suffix')||'';
  const decimals=Math.max(0,parseInt(el.getAttribute('data-t3d-decimals')||'0',10));
  const duration=Math.min(2200,Math.max(600,parseInt(el.getAttribute('data-t3d-duration')||'1200',10)));
  const format=v=>{
    if(decimals>0)return v.toFixed(decimals);
    return Math.round(v).toLocaleString('id-ID');
  };
  const start=performance.now();
  function tick(now){
    const p=Math.min(1,(now-start)/duration);
    const ease=1-Math.pow(1-p,3);
    el.textContent=`${prefix}${format(target*ease)}${suffix}`;
    if(p<1)requestAnimationFrame(tick);
    else el.textContent=`${prefix}${format(target)}${suffix}`;
  }
  countMap.set(el,true);
  requestAnimationFrame(tick);
}
function scanCounts(root=document){
  if(!hasClass())return;
  const io=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(entry.isIntersecting){
        animateCount(entry.target);
        io.unobserve(entry.target);
      }
    }
  },{threshold:.3});
  root.querySelectorAll?.('[data-t3d-count]').forEach(el=>{
    countMap.set(el,false);
    io.observe(el);
  });
}

/* ---------- floating elements ---------- */
function applyFloat(root=document){
  if(!hasClass()||reduced)return;
  root.querySelectorAll?.('[data-t3d-float]').forEach((el,i)=>{
    el.style.animationDelay=`${(i%8)*0.14}s`;
  });
}

/* ---------- pointer glow ---------- */
function glowTrack(e){
  const targets=document.querySelectorAll('[data-t3d-glow]');
  for(const el of targets){
    const r=el.getBoundingClientRect();
    if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){
      el.style.setProperty('--t3d-gx',`${e.clientX-r.left}px`);
      el.style.setProperty('--t3d-gy',`${e.clientY-r.top}px`);
    }
  }
}

/* ---------- background particle canvas ---------- */
let particleCanvas=null,particleCtx=null,particleAnim=null,particles=[];
function initParticles(){
  if(reduced||!hasClass()||!document.body.dataset.t3dCanvas)return;
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:.55';
  canvas.setAttribute('aria-hidden','true');
  document.body.appendChild(canvas);
  particleCanvas=canvas;
  particleCtx=canvas.getContext('2d');
  function resize(){
    if(!particleCanvas)return;
    particleCanvas.width=window.innerWidth;
    particleCanvas.height=window.innerHeight;
  }
  window.addEventListener('resize',resize,{passive:true});
  resize();
  const count=Math.min(70,Math.floor(window.innerWidth*window.innerHeight/28000));
  for(let i=0;i<count;i++){
    particles.push({
      x:Math.random()*particleCanvas.width,
      y:Math.random()*particleCanvas.height,
      vx:(Math.random()-.5)*.36,
      vy:(Math.random()-.5)*.30,
      r:Math.random()*2.2+.35,
      a:Math.random()*.5+.08
    });
  }
  let last=performance.now();
  function draw(now){
    const dt=Math.min(64,now-last)/16.7;
    last=now;
    const ctx=particleCtx;
    ctx.clearRect(0,0,particleCanvas.width,particleCanvas.height);
    for(const p of particles){
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.x<0)p.x=particleCanvas.width;
      if(p.x>particleCanvas.width)p.x=0;
      if(p.y<0)p.y=particleCanvas.height;
      if(p.y>particleCanvas.height)p.y=0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(120,170,255,${p.a})`;
      ctx.fill();
    }
    particleAnim=requestAnimationFrame(draw);
  }
  particleAnim=requestAnimationFrame(draw);
}

/* ---------- init ---------- */
function start(){
  if(!document.body.classList.contains(CLASS))return;
  scanTilts();
  scanCounts();
  applyFloat();
  initParticles();
  document.addEventListener('pointermove',glowTrack,{passive:true});
  // observe dynamically added elements
  const mo=new MutationObserver(records=>{
    for(const r of records){
      for(const n of r.addedNodes){
        if(n.nodeType!==1)continue;
        scanTilts(n);
        scanCounts(n);
        applyFloat(n);
      }
    }
  });
  mo.observe(document.body,{subtree:true,childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();