  // Detect phones & tablets
  if (/Mobi|Android|iPhone|iPad|iPod|Tablet|Mobile/i.test(navigator.userAgent)) {
    // Redirect or block
    document.body.innerHTML = `
      <div style="
        color: white;
        font: 20px Arial, sans-serif;
        text-align: center;
        padding: 40px;">
        For now this project is available only on desktop devices.
      </div>
    `;
  }

(function(){
  // ---- Grab elements ----
  const board   = document.querySelector('.board');
  const img     = board?.querySelector('img[usemap]');
  const mapName = img?.getAttribute('usemap')?.replace('#','');
  const areas   = mapName ? document.querySelectorAll(`map[name="${mapName}"] area[data-sparks]`) : [];
  const canvas  = document.getElementById('fx');
  if (!board || !img || !canvas) return;

  // ---- Canvas setup (Hi-DPI) ----
  const ctx = canvas.getContext('2d');
  function resizeCanvas(){
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = board.getBoundingClientRect();
    // Keep CSS size matching board
    canvas.style.width  = rect.width  + 'px';
    canvas.style.height = rect.height + 'px';
    // Backing store scaled for crispness
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); // draw in CSS pixels
  }

  // ---- Utils: convert rect pixels (1000x1000 space) to % and back ----
  function rectPixelsToPerc(x1,y1,x2,y2){
    return {
      left:   (x1 / 1000) * 100,
      top:    (y1 / 1000) * 100,
      width:  ((x2 - x1) / 1000) * 100,
      height: ((y2 - y1) / 1000) * 100
    };
  }
  function rectPercToCssPx(rPerc){
    const rect = board.getBoundingClientRect();
    return {
      left:   rPerc.left   * rect.width  / 100,
      top:    rPerc.top    * rect.height / 100,
      width:  rPerc.width  * rect.width  / 100,
      height: rPerc.height * rect.height / 100
    };
  }

  // ---- Emitters ----
  class Emitter {
    constructor(boxPerc, opts){
      this.boxPerc = boxPerc;           // {left, top, width, height} in %
      this.color   = opts.color || '#ff00ddff';
      this.rate    = (opts.intensity || 1) * 160; // particles/sec along perimeter
      this.speed   = (opts.speed || 1) * 5;      // px/sec baseline
      this.size    = (opts.size  || 1) * 0.4;     // base radius
      this.active  = false;
      this._accum  = 0;
      this.parts   = [];
    }
    start(){ this.active = true; }
    stop(){ this.active = false; }
    clear(){ this.parts.length = 0; }

    // Spawn particle along the rectangle edge, moving tangentially with a small outward drift
    _spawn(dt){
      // Convert rate per second to per frame using accumulator
      this._accum += this.rate * dt;
      while (this._accum >= 1){
        this._accum -= 1;

        const rpx = rectPercToCssPx(this.boxPerc);
        const perim = 2*(rpx.width + rpx.height);
        if (perim <= 0) return;

        // pick a random point on perimeter
        let t = Math.random() * perim;
        let x,y,vx,vy;

        if (t < rpx.width){                 // top edge (left -> right)
          x = rpx.left + t; y = rpx.top;
          vx = this.speed * (0.8 + Math.random()*0.1);
          vy = (Math.random()*2 - 1) * 2;   // tiny wobble
        } else if ((t -= rpx.width) < rpx.height){ // right edge (top -> bottom)
          x = rpx.left + rpx.width; y = rpx.top + t;
          vx = (Math.random()*2 - 1) * 2;
          vy = this.speed * (0.8 + Math.random()*0.1);
        } else if ((t -= rpx.height) < rpx.width){ // bottom edge (right -> left)
          x = rpx.left + rpx.width - t; y = rpx.top + rpx.height;
          vx = -this.speed * (0.8 + Math.random()*0.1);
          vy = (Math.random()*2 - 1) * 2;
        } else {                               // left edge (bottom -> top)
          t -= rpx.width;
          x = rpx.left; y = rpx.top + rpx.height - t;
          vx = (Math.random()*2 - 1) * 2;
          vy = -this.speed * (0.8 + Math.random()*0.1);
        }

        const life = 0.6 + Math.random()*0.2; // seconds
        const r = this.size * (0.8 + Math.random()*0.8);
        const hue = this.color;
        const alpha = 0.9;

        this.parts.push({x,y,vx,vy,life,ttl:life,r,alpha,hue});
      }
    }

    update(dt){
      if (this.active) this._spawn(dt);

      // update particles
      for (let i=this.parts.length-1; i>=0; i--){
        const p = this.parts[i];
        p.ttl -= dt;
        if (p.ttl <= 0){ this.parts.splice(i,1); continue; }
        const t = 1 - (p.ttl / p.life); // 0..1
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.995;
        p.vy *= 0.995;
        // fade + shrink a bit
        p.alpha = 0.2 + 0.8*(1 - t);
        p.r = Math.max(0.5, p.r * (0.995));
      }
    }

    draw(ctx){
      if (!this.parts.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts){
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- Build emitters from areas ----
  const emitters = [];
  areas.forEach(area=>{
    const coords = area.coords.split(',').map(Number);
    if (coords.length !== 4) return;
    const [x1,y1,x2,y2] = coords;
    const boxPerc = rectPixelsToPerc(x1,y1,x2,y2);
    const opts = {
      color:     area.dataset.color || area.dataset.glow || '#ff00ddff',
      intensity: parseFloat(area.dataset.intensity || '1'),
      speed:     parseFloat(area.dataset.speed     || '1'),
      size:      parseFloat(area.dataset.size      || '1'),
    };
    const em = new Emitter(boxPerc, opts);
    emitters.push({ area, em });
    // Start/stop on hover (mouseenter/leave)
    area.addEventListener('mouseenter', ()=> em.start());
    area.addEventListener('mouseleave', ()=> em.stop());
  });

  // ---- Render loop ----
  let last = performance.now();
  function frame(now){
    const rect = board.getBoundingClientRect();
    // Clear in CSS pixel space
    ctx.clearRect(0,0,rect.width,rect.height);

    const dt = Math.min(0.033, (now - last) / 1000); // cap at ~30fps delta
    last = now;

    for (const {em} of emitters){
      em.update(dt);
      em.draw(ctx);
    }
    requestAnimationFrame(frame);
  }

  // ---- Resize handling ----
  const ro = new ResizeObserver(()=> resizeCanvas());
  ro.observe(board);
  window.addEventListener('orientationchange', resizeCanvas);
  resizeCanvas();
  requestAnimationFrame(frame);
})();

// main.js — tooltip + glow boxes (percent-based) + hover sound (throttled)

/* Run after DOM is parsed thanks to `defer` */
(function () {
  // --- Elements ---
  const tip   = document.getElementById('instant-tip');
  const layer = document.querySelector('.glow-layer');
  const img   = document.querySelector('.board img[usemap]');
  if (!tip || !layer || !img) return;

  const mapName = img.getAttribute('usemap')?.replace('#','');
  const areas   = mapName ? document.querySelectorAll(`map[name="${mapName}"] area`) : [];

  // ----------------------------
  // 1) Instant, styled tooltip
  // ----------------------------
  (function setupTooltip(){
    const labeled = Array.from(areas).filter(a => a.hasAttribute('data-label'));
    function show(e){
      tip.textContent = this.getAttribute('data-label') || '';
      if (!tip.textContent) return;
      tip.style.display = 'block';
      move.call(this, e);
    }
    function move(e){
      tip.style.left = e.clientX + 'px';
      tip.style.top  = e.clientY + 'px';
    }
    function hide(){ tip.style.display = 'none'; }

    labeled.forEach(a=>{
      if (a.hasAttribute('title')) a.removeAttribute('title'); // avoid native delayed tooltip
      a.addEventListener('mouseenter', show);
      a.addEventListener('mousemove',  move);
      a.addEventListener('mouseleave', hide);
    });
  })();

  // ---------------------------------------
  // 2) Glow overlays (percent coordinates)
  // ---------------------------------------
  (function setupGlows(){
    // Build exactly one glow per <area>
    areas.forEach(area=>{
      const coords = (area.coords || '').split(',').map(Number);
      if (coords.length !== 4) return;
      const [x1,y1,x2,y2] = coords;

      const glow = document.createElement('div');
      glow.className = 'glow';
      // optional per-area color (fallback to CSS default)
      // optional per-area glow customization
    if (area.dataset.glow) glow.style.setProperty('--glow', area.dataset.glow);
    if (area.dataset.glowSpeed) glow.style.setProperty('--glow-speed', area.dataset.glowSpeed);
    if (area.dataset.glowIntensity) glow.style.setProperty('--glow-intensity', area.dataset.glowIntensity);


      // percent-based so it follows the image on zoom/resize
      glow.style.left   = (x1/1000*100)       + '%';
      glow.style.top    = (y1/1000*100)       + '%';
      glow.style.width  = ((x2-x1)/1000*100)  + '%';
      glow.style.height = ((y2-y1)/1000*100)  + '%';

      layer.appendChild(glow);
    });
  })();

  // ---------------------------------------
  // 3) Hover sound (per-area, throttled)
  // ---------------------------------------

function fade(audio, target, ms){
  const start = audio.volume ?? 1;
  const t0 = performance.now();
  cancelAnimationFrame(audio._fadeRaf);
  function step(t){
    const k = Math.min(1, (t - t0) / ms);
    audio.volume = start + (target - start) * k;
    if (k < 1) audio._fadeRaf = requestAnimationFrame(step);
    else if (target === 0){ audio.pause(); audio.currentTime = 0; audio.volume = 1; }
  }
  audio._fadeRaf = requestAnimationFrame(step);
}



  (function setupHoverSound(){
    // Get all <area> elements connected to your image map
const mapImg  = document.querySelector('.board img[usemap]');
const mapName = mapImg?.getAttribute('usemap')?.replace('#','');
const areas   = mapName ? document.querySelectorAll(`map[name="${mapName}"] area`) : [];

    // cache: src -> HTMLAudioElement
    const soundCache = new Map();
    let audioArmed = false;        // browsers require one user gesture
    let canPlay = true;            // global throttle (avoid chaos)
    function getAudio(src){
      if (!src) return null;
      if (!soundCache.has(src)){
        const a = new Audio(src);
        a.preload = 'auto';
        a.volume = 0.6;
        soundCache.set(src, a);
      }
      return soundCache.get(src);
    }
    // arm once on a click/keypress anywhere
    function arm(){
      
      if (audioArmed) return;
      audioArmed = true;
      // optional warm-up
      soundCache.forEach(a=>{ try { a.play().then(()=>a.pause()); } catch {} });
      window.removeEventListener('click', arm);
      window.removeEventListener('keydown', arm);
      
    }
    
    window.addEventListener('click', arm);
    window.addEventListener('keydown', arm);
    
    const leaveTimers = new WeakMap(); // area -> timeout id
    let current = null;                // which audio is playing now

    areas.forEach(area=>{
      const audio = getAudio(area.dataset.sound);
      if (!audio) return;
areas.forEach(area => {
  const audio = getAudio(area.dataset.sound);
  if (!audio) return;

  // play while hovered
area.addEventListener('mouseenter', () => {
  if (!audioArmed) return;

  // cancel pending delayed stop for THIS area
  clearTimeout(area._leaveT);

  // cancel any ongoing fade-out for THIS audio
  cancelAnimationFrame(audio._fadeRaf);

  // force known good state & play every time
  audio.loop = false;           // optional
  audio.volume = parseFloat(area.dataset.volume || '0.5');            // or your base (e.g. 0.6)
  audio.currentTime = 0;
  audio.play().catch(()=>{});
});



  // stop AFTER a small delay once cursor leaves
area.addEventListener('mouseleave', () => {
  clearTimeout(area._leaveT);
  area._leaveT = setTimeout(() => {
    // fade to 0 then pause/reset
    fade(audio, 0, 500);   // 500ms fade-out
  }, 500);                // 2s delay before fading
});



});

    });
  })();
})();

async function updateSoldCount() {
  const res = await fetch('grid.json', { cache: 'no-store' }); // adjust path if needed
  const data = await res.json();
  const TOTAL = 10000;
  const sold = Object.values(data.slots || {}).filter(v => v === 'sold').length;
  document.getElementById('soldCount').textContent = `Slots occuppied: ${sold} / 10,000`;
  document.getElementById('soldPct').textContent = `Slots occuppied, %: ${((sold / TOTAL) * 100).toFixed(2)}%`;
}

updateSoldCount();              // initial
// optional “live” updates every 5s:
setInterval(updateSoldCount, 5000);

  // first click anywhere -> flip to "SOUND ACTIVATED"
  window.addEventListener('pointerdown', function activate(){
    const el = document.getElementById('soundIndicator');
    el.textContent = 'SOUND ACTIVATED';
    el.classList.add('on');

    // (optional) unlock audio/video on first interaction
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) (window._ctx ||= new Ctx()).resume();
      document.querySelectorAll('audio,video').forEach(m=>{
        m.muted = false; m.play().catch(()=>{});
      });
    } catch(e){}

    window.removeEventListener('pointerdown', activate, true);
  }, true);




