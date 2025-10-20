// selector.js — grid selector (refresh, hover, drag-select, copy JSON)
(function () {
  // ---------- Config ----------
  const DATA_URL = 'grid.json'; // file lives next to selector.html
  const SIZE = 1000;            // canvas size (CSS px)
  const STEP = 10;              // slot size (10×10)

  // ---------- DOM ----------
  const c       = document.getElementById('stage');
  const ctx     = c.getContext('2d');
  const countEl = document.getElementById('count');
  const coordsEl = document.getElementById('coords'); // may not exist (we’ll guard)
  const btnRefresh = document.getElementById('refresh');
  const btnClear   = document.getElementById('clear');
  const btnCopy    = document.getElementById('copyJson') || document.getElementById('copyCoords');

  // ---------- Colors from CSS vars (with fallbacks) ----------
  const css = getComputedStyle(document.documentElement);
  const COLORS = {
    free  : css.getPropertyValue('--free').trim()   || '#9BE7A0',
    sold  : css.getPropertyValue('--sold').trim()   || '#D32F2F',
    held  : css.getPropertyValue('--held').trim()   || '#FFC107',
    grid  : css.getPropertyValue('--grid').trim()   || '#777',
    hover : css.getPropertyValue('--hover').trim()  || '#bdbdbd',
    picked: css.getPropertyValue('--picked').trim() || '#616161'
  };

  // ---------- Canvas (Hi-DPI) ----------
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  c.width = SIZE * dpr;
  c.height = SIZE * dpr;
  c.style.width  = SIZE + 'px';
  c.style.height = SIZE + 'px';
  ctx.scale(dpr, dpr);

  // ---------- State ----------
  let latestMap = {};       // {"x,y": "free|sold|held"} (from grid.json)
  let latestDef = 'free';
  let hoverCell = null;     // [x,y] or null
  const picked = new Set(); // client-side selection only

  // drag / click disambiguation
  let isDragging = false;
  let dragStart = null;     // [x,y]
  let dragCurrent = null;   // [x,y]
  let movedDuringDrag = false;

  // ---------- Data ----------
  async function loadData(){
    try{
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`); // cache-bust
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(err){
      console.warn('grid.json failed; all-free fallback', err);
      return { schema:'v1', indexing:'1-based', defaultStatus:'free', slots:{} };
    }
  }

  // ---------- Paint ----------
  function paintBase(){ ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,SIZE,SIZE); }

  function paintSlots(map, def){
    const d = def || 'free';
    for(let y=1; y<=100; y++){
      for(let x=1; x<=100; x++){
        const key = `${x},${y}`;
        if (picked.has(key)) ctx.fillStyle = COLORS.picked;
        else ctx.fillStyle = COLORS[map[key] || d] || COLORS.free;
        ctx.fillRect((x-1)*STEP, (y-1)*STEP, STEP, STEP);
      }
    }
  }

  function paintHover(cell){
    if (!cell) return;
    const [hx,hy] = cell, key = `${hx},${hy}`;
    if (picked.has(key)) return; // picked cell takes priority
    ctx.fillStyle = COLORS.hover;
    ctx.fillRect((hx-1)*STEP, (hy-1)*STEP, STEP, STEP);
  }

  function rectBounds(a,b){
    if (!a || !b) return null;
    const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]);
    const y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]);
    return {x1,y1,x2,y2};
  }

  function paintDragSelection(start,current){
    const r = rectBounds(start,current); if(!r) return;
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = COLORS.hover;
    for(let y=r.y1; y<=r.y2; y++){
      for(let x=r.x1; x<=r.x2; x++){
        const key = `${x},${y}`, st = latestMap[key] || latestDef;
        if (st==='free' && !picked.has(key)) ctx.fillRect((x-1)*STEP,(y-1)*STEP,STEP,STEP);
      }
    }
    ctx.restore();
    // outline
    ctx.save();
    ctx.strokeStyle='#444'; ctx.lineWidth=1/dpr;
    const px1=(r.x1-1)*STEP, py1=(r.y1-1)*STEP;
    const w=(r.x2-r.x1+1)*STEP, h=(r.y2-r.y1+1)*STEP;
    ctx.strokeRect(px1+0.5*(1/dpr), py1+0.5*(1/dpr), w-1*(1/dpr), h-1*(1/dpr));
    ctx.restore();
  }

  function paintGrid(){
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1/dpr; ctx.beginPath();
    for(let p=STEP; p<SIZE; p+=STEP){
      const pp = p + 0.5*(1/dpr);
      ctx.moveTo(pp,0); ctx.lineTo(pp,SIZE);
      ctx.moveTo(0,pp); ctx.lineTo(SIZE,pp);
    }
    ctx.stroke();
    ctx.strokeStyle='#555'; ctx.lineWidth=1/dpr;
    ctx.strokeRect(0.5*(1/dpr),0.5*(1/dpr),SIZE-1*(1/dpr),SIZE-1*(1/dpr));
  }

  function render(){
    paintBase();
    paintSlots(latestMap, latestDef);
    paintHover(hoverCell);
    if (isDragging && movedDuringDrag) paintDragSelection(dragStart, dragCurrent);
    paintGrid();
  }

  // ---------- Coords ----------
  function slotFromEvent(e){
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x<0||y<0||x>r.width||y>r.height) return null;
    const bx = Math.floor((x/r.width)*100)+1;
    const by = Math.floor((y/r.height)*100)+1;
    return (bx>=1&&bx<=100&&by>=1&&by<=100)?[bx,by]:null;
  }

  // ---------- Selection + readout ----------
  function updateReadout(){
    const list = Array.from(picked)
      .map(k=>k.split(',').map(Number))
      .sort((a,b)=> a[1]-b[1] || a[0]-b[0])
      .map(([x,y])=>`${x},${y}`);
    if (countEl)  countEl.textContent = String(list.length);
    if (coordsEl) coordsEl.textContent = list.length ? list.join(' · ') : '(none)';
    return list;
  }

  function togglePick(x,y){
    const key = `${x},${y}`;
    const st = latestMap[key] || latestDef;
    if (st!=='free') return;
    if (picked.has(key)) picked.delete(key); else picked.add(key);
    updateReadout(); render();
  }

  function applyDragSelection(start,current){
    const r = rectBounds(start,current); if(!r) return;
    for(let y=r.y1; y<=r.y2; y++){
      for(let x=r.x1; x<=r.x2; x++){
        const key = `${x},${y}`, st = latestMap[key] || latestDef;
        if (st==='free') picked.add(key);
      }
    }
    updateReadout();
  }

  // ---------- Events — hover, drag, click ----------
  c.addEventListener('mousemove',(e)=>{
    if (isDragging){
      const cell = slotFromEvent(e);
      if (cell && (!dragCurrent || cell[0]!==dragCurrent[0] || cell[1]!==dragCurrent[1])){
        dragCurrent = cell;
        if (dragStart && (cell[0] !== dragStart[0] || cell[1] !== dragStart[1])) {
          movedDuringDrag = true;
        }
        render();
      }
    } else {
      const cell = slotFromEvent(e);
      if (cell && hoverCell && cell[0]===hoverCell[0] && cell[1]===hoverCell[1]) return;
      hoverCell = cell; render();
    }
  });

  c.addEventListener('mouseleave',()=>{
    if (isDragging){ isDragging=false; dragStart=null; dragCurrent=null; movedDuringDrag=false; }
    hoverCell=null; render();
  });

  c.addEventListener('mousedown',(e)=>{
    if (e.button!==0) return;
    const cell = slotFromEvent(e); if(!cell) return;
    isDragging=true; dragStart=cell; dragCurrent=cell; movedDuringDrag=false;
    hoverCell=null; render();
  });

  c.addEventListener('mouseup',(e)=>{
    if (!isDragging) return;
    const endCell = slotFromEvent(e) || dragCurrent || dragStart;
    if (movedDuringDrag) applyDragSelection(dragStart, endCell);
    else togglePick(dragStart[0], dragStart[1]);
    isDragging=false; dragStart=null; dragCurrent=null; movedDuringDrag=false;
    render();
  });

  // ---------- Buttons ----------
  if (btnRefresh){
    btnRefresh.addEventListener('click', async ()=>{
      const data = await loadData();
      latestMap = data.slots || {};
      latestDef = data.defaultStatus || 'free';
      // drop picks that are no longer free
      for (const k of Array.from(picked)) {
        const status = latestMap[k] ?? latestDef;
        if (status !== 'free') picked.delete(k);
      }
      updateReadout(); render();
    });
  }

  if (btnClear){
    btnClear.addEventListener('click', ()=>{
      picked.clear(); updateReadout(); render();
    });
  }

  if (btnCopy){
    btnCopy.addEventListener('click', async ()=>{
      // JSON snippet mapping each picked cell to "sold"
      const list = Array.from(picked).map(k=>`"${k}": "sold"`).join(',\n  ');
      const jsonSnippet = list ? `\n  ${list},\n` : '{}';
      try { await navigator.clipboard.writeText(jsonSnippet); }
      catch {
        const ta=document.createElement('textarea'); ta.value=jsonSnippet; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
    });
  }

  // ---------- Init ----------
  (async function init(){
    const data = await loadData();
    latestMap = data.slots || {};
    latestDef = data.defaultStatus || 'free';
    updateReadout(); render();
  })();
})();
