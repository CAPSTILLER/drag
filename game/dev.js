// CAPs Garage — DEV / level editor. Loaded after garage.js (shares its globals).
// Enter: ?dev=1, tap the "CAPs Garage" title 5 times, or press ` on a keyboard.
(function () {
  const GRID = 4;
  const STACKY = (k) => k === 'lcrates' || k === 'crates' || k === 'cars';
  const snap = (v) => Math.round(v / GRID) * GRID;
  dev.tool = 'select'; dev.sel = null; dev.undo = []; dev.layout = null;
  const ptrs = new Map(); let drag = null, pinch = null;
  const bar = () => document.getElementById('dev-bar');
  const info = (t) => { const e = document.getElementById('dev-info'); if (e) e.textContent = t; };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pushUndo() { dev.undo.push(clone(dev.layout)); if (dev.undo.length > 80) dev.undo.shift(); }
  function otherLevel() { return det.levels[dev.area === 'yard' ? 'garage' : 'yard']; }
  function applyEdit() { if (dev.area === 'yard') applyLevels(dev.layout, otherLevel()); else applyLevels(otherLevel(), dev.layout); }
  function preview() { applyEdit(); describe(); }
  function describe() {
    const L = dev.layout;
    const NAMES = { lcrates: 'Large crate', crates: 'Small crate', cars: 'Car', ramps: 'Ramp', gears: 'Gear', poles: 'Lamp' };
    const s = dev.sel ? `${NAMES[dev.sel.kind]} #${dev.sel.i + 1}` + (STACKY(dev.sel.kind) ? ` · level ${L[dev.sel.kind][dev.sel.i].z + 1}` : '') + (dev.sel.kind === 'ramps' ? ` · ${L.ramps[dev.sel.i].rot}° · jump ${L.ramps[dev.sel.i].d}` : '') : 'nothing selected';
    info(`[${dev.area.toUpperCase()} level] ${L.name} · tool: ${dev.tool} · ${s} · big ${L.lcrates.length} small ${L.crates.length} cars ${L.cars.length} ramps ${L.ramps.length} gears ${L.gears.length} lamps ${L.poles.length}`);
    document.querySelectorAll('#dev-bar [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === dev.tool));
  }
  window.enterDev = function () {
    if (dev.on) return;
    dev.on = true; dev.area = areaOf(player.x); dev.layout = clone(det.levels[dev.area]); dev.undo = []; dev.sel = null; dev.tool = 'select';
    dev.cam.x = player.x; dev.cam.y = player.y; dev.cam.z = 0.6;
    bar().classList.add('show'); document.body.classList.add('dev'); describe();
    showToast('🛠 DEV MODE — game paused. Drag things, tap empty ground to pan.');
  };
  window.exitDev = function () {
    if (!dev.on) return;
    dev.on = false; bar().classList.remove('show'); document.body.classList.remove('dev');
    applyEdit(); resetSim(det.seed, det.seedLabel); updateHUD();
    showToast(`▶ Playing ${det.levels.yard.name} + ${det.levels.garage.name} (new session)`);
  };
  function toWorld(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - width / 2) / dev.cam.z + dev.cam.x, y: (cy - r.top - height / 2) / dev.cam.z + dev.cam.y };
  }
  // topmost hit: gears, lamps, ramps, then stacks (highest z first)
  function hit(p) {
    const L = dev.layout;
    for (let i = L.gears.length - 1; i >= 0; i--) if (Math.hypot(p.x - L.gears[i].x, p.y - L.gears[i].y) < 16) return { kind: 'gears', i };
    for (let i = L.poles.length - 1; i >= 0; i--) { const q = L.poles[i]; if (Math.abs(p.x - q.x) < 12 && p.y > q.y - 36 && p.y < q.y + 30) return { kind: 'poles', i }; }
    for (let i = L.ramps.length - 1; i >= 0; i--) { const g = rampGeom(L.ramps[i]); if (p.x > g.x && p.x < g.x + g.w && p.y > g.y && p.y < g.y + g.h) return { kind: 'ramps', i }; }
    let best = null;
    const test = (kind, arr, w, h, lift) => arr.forEach((o, i) => {
      const ow = w || o.w, oh = h || o.h, oy = o.y - o.z * lift;
      if (p.x > o.x && p.x < o.x + ow && p.y > oy && p.y < oy + oh && (!best || o.z >= best.z)) best = { kind, i, z: o.z };
    });
    test('crates', L.crates, 28, 28, LIFT); test('cars', L.cars, 0, 0, LIFT); test('lcrates', L.lcrates, 0, 0, LIFT);
    return best ? { kind: best.kind, i: best.i } : null;
  }
  function selObj() { return dev.sel ? dev.layout[dev.sel.kind][dev.sel.i] : null; }
  function sizeOf(kind, o) { return kind === 'crates' ? [28, 28] : [o.w, o.h]; }
  // Height-stack snap: drop a car/crate onto another of the same kind → align + z = top + 1
  function stackSnap() {
    if (!dev.sel || !STACKY(dev.sel.kind)) return;
    const arr = dev.layout[dev.sel.kind], me = arr[dev.sel.i];
    const [mw, mh] = sizeOf(dev.sel.kind, me);
    const cx = me.x + mw / 2, cy = me.y + mh / 2;
    let top = -1, base = null;
    arr.forEach((o, i) => {
      if (i === dev.sel.i) return;
      const [w, h] = sizeOf(dev.sel.kind, o);
      if (cx > o.x && cx < o.x + w && cy > o.y && cy < o.y + h) { if (o.z > top) top = o.z; base = base || o; }
    });
    if (base) {
      const [bw, bh] = sizeOf(dev.sel.kind, base);
      me.x = snap(base.x + bw / 2 - mw / 2); me.y = snap(base.y + bh / 2 - mh / 2); me.z = top + 1;
    } else me.z = 0;
  }
  function addAt(p) {
    const L = dev.layout; pushUndo();
    const x = snap(p.x), y = snap(p.y);
    if (dev.tool === 'lcrate') { L.lcrates.push({ x: x - 30, y: y - 20, w: 60, h: 40, z: 0, c: L.lcrates.length % 6 }); dev.sel = { kind: 'lcrates', i: L.lcrates.length - 1 }; stackSnap(); }
    else if (dev.tool === 'car') { L.cars.push({ x: x - 30, y: y - 18, w: 60, h: 36, z: 0 }); dev.sel = { kind: 'cars', i: L.cars.length - 1 }; stackSnap(); }
    else if (dev.tool === 'crate') { L.crates.push({ x: x - 14, y: y - 14, z: 0 }); dev.sel = { kind: 'crates', i: L.crates.length - 1 }; stackSnap(); }
    else if (dev.tool === 'ramp') { L.ramps.push({ x, y, rot: 0, d: 200, label: 'RAMP' }); dev.sel = { kind: 'ramps', i: L.ramps.length - 1 }; }
    else if (dev.tool === 'gear') { L.gears.push({ x, y }); dev.sel = { kind: 'gears', i: L.gears.length - 1 }; }
    else if (dev.tool === 'lamp') { L.poles.push({ x, y }); dev.sel = { kind: 'poles', i: L.poles.length - 1 }; }
    dev.tool = 'select'; preview();
  }
  canvas.addEventListener('pointerdown', e => {
    if (!dev.on) return;
    e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: dev.cam.z }; drag = null; return; }
    const p = toWorld(e.clientX, e.clientY);
    if (dev.tool !== 'select') { addAt(p); return; }
    const h = hit(p);
    if (h) {
      dev.sel = h; const o = selObj();
      drag = { mode: 'move', ox: p.x - o.x, oy: p.y - o.y, moved: false };
    } else { dev.sel = null; drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: dev.cam.x, cy: dev.cam.y }; }
    describe();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dev.on || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; dev.cam.z = Math.max(0.15, Math.min(2.5, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); return; }
    if (!drag) return;
    if (drag.mode === 'pan') { dev.cam.x = drag.cx - (e.clientX - drag.sx) / dev.cam.z; dev.cam.y = drag.cy - (e.clientY - drag.sy) / dev.cam.z; return; }
    const p = toWorld(e.clientX, e.clientY), o = selObj(); if (!o) return;
    if (!drag.moved) { pushUndo(); drag.moved = true; if (o.z) o.z = 0; }
    o.x = snap(p.x - drag.ox); o.y = snap(p.y - drag.oy); preview();
  });
  const up = e => {
    if (!dev.on) return; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && drag.mode === 'move' && drag.moved) { stackSnap(); preview(); }
    drag = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { if (!dev.on) return; e.preventDefault(); dev.cam.z = Math.max(0.15, Math.min(2.5, dev.cam.z * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.key === '`') { dev.on ? exitDev() : enterDev(); return; }
    if (!dev.on) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); devCmd('undo'); }
    else if (e.key === 'Delete' || e.key === 'Backspace') devCmd('delete');
    else if (e.key === 'r' || e.key === 'R') devCmd('rotate');
  });
  // 5 quick taps on the title
  let taps = [];
  const title = document.querySelector('.brand-title');
  if (title) title.addEventListener('click', () => { const t = Date.now(); taps = taps.filter(x => t - x < 2000); taps.push(t); if (taps.length >= 5) { taps = []; dev.on ? exitDev() : enterDev(); } });

  function download(name, txt) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click();
  }
  window.devCmd = function (cmd, arg) {
    const L = dev.layout, o = selObj();
    switch (cmd) {
      case 'tool': dev.tool = arg; break;
      case 'undo': if (dev.undo.length) { dev.layout = dev.undo.pop(); dev.sel = null; } break;
      case 'delete': if (o) { pushUndo(); L[dev.sel.kind].splice(dev.sel.i, 1); dev.sel = null; } break;
      case 'rotate':
        if (!o) break; pushUndo();
        if (dev.sel.kind === 'ramps') o.rot = (o.rot + 90) % 360;
        else if (dev.sel.kind === 'lcrates' || dev.sel.kind === 'cars') { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; [o.w, o.h] = [o.h, o.w]; o.x = snap(cx - o.w / 2); o.y = snap(cy - o.h / 2); }
        break;
      case 'stack': // put a copy on top of the selected car/crate
        if (!o || !STACKY(dev.sel.kind)) break; pushUndo();
        { const c = clone(o); const arr = L[dev.sel.kind]; c.z = Math.max(...arr.filter(q => q.x === o.x && q.y === o.y).map(q => q.z)) + 1; if (c.c != null) c.c = (c.c + 1) % 6; arr.push(c); dev.sel = { kind: dev.sel.kind, i: arr.length - 1 }; }
        break;
      case 'level': if (o && STACKY(dev.sel.kind)) { pushUndo(); o.z = Math.max(0, Math.min(6, o.z + arg)); } break; // floating levels = bridges
      case 'clear':
        if (confirm(`Clear ALL props in the ${dev.area.toUpperCase()} area (cars, crates, ramps, gears, lamps)? Undo can bring them back.`)) {
          pushUndo(); ['lcrates', 'crates', 'cars', 'ramps', 'gears', 'poles'].forEach(k => { L[k] = []; }); dev.sel = null;
        }
        break;
      case 'collapse': bar().classList.toggle('collapsed'); return;
      case 'jump': if (o && dev.sel.kind === 'ramps') { pushUndo(); o.d = Math.max(60, Math.min(600, o.d + arg)); } break;
      case 'zoom': dev.cam.z = Math.max(0.15, Math.min(2.5, dev.cam.z * arg)); break;
      case 'name': { const n = prompt('Level name', L.name); if (n) { pushUndo(); L.name = n; L.id = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'custom'; } } break;
      case 'save': lsSet(LS_LOCAL + '.' + dev.area, JSON.stringify(normLayout(L))); showToast(`💾 ${dev.area} level saved on this device — pick it in 🗺 Levels.`); break;
      case 'area': applyEdit(); dev.area = dev.area === 'yard' ? 'garage' : 'yard'; dev.layout = clone(det.levels[dev.area]); dev.undo = []; dev.sel = null; dev.cam.x = dev.area === 'yard' ? rightSealX + 400 : yardStartX + 300; dev.cam.y = 520; break;
      case 'export': download(dev.area + '-' + (L.id || 'level') + '.json', JSON.stringify(normLayout(L), null, 1)); showToast('📤 Level file downloaded — add it to game/levels/ to make it a repo level.'); break;
      case 'copy': if (navigator.clipboard) navigator.clipboard.writeText(JSON.stringify(normLayout(L))).then(() => showToast('📋 Level JSON copied')); break;
      case 'import': document.getElementById('dev-file').click(); break;
      case 'default': pushUndo(); dev.layout = clone(builtinLevels()[dev.area]); dev.sel = null; showToast('♻ Reset to the built-in yard'); break;
      case 'check': {
        applyLayout(L);
        const okR = routeCheck(mazeStart, mazeGoal, true);
        showToast(okR ? '✅ SUV route: ramp landing → oil pad is solvable' : '⛔ SUV route ramp landing → oil pad is BLOCKED');
      } break;
      case 'exit': exitDev(); return;
    }
    preview();
  };
  document.addEventListener('change', e => {
    if (e.target.id !== 'dev-file') return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { const N = normLayout(JSON.parse(t)); if (N.area !== dev.area) { applyEdit(); dev.area = N.area; dev.undo = []; } else pushUndo(); dev.layout = N; dev.sel = null; preview(); showToast('📥 Imported "' + dev.layout.name + '"'); })
      .catch(() => showToast('⛔ Not a level JSON')); e.target.value = '';
  });
  window.renderDevOverlay = function () {
    const L = dev.layout; if (!L) return;
    ctx.lineWidth = 2 / dev.cam.z;
    L.ramps.forEach(r => { const g = rampGeom(r); ctx.strokeStyle = 'rgba(250,204,21,0.7)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.landX, g.landY); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(g.landX, g.landY, 10, 0, Math.PI * 2); ctx.stroke(); });
    const o = selObj(); if (!o) return;
    ctx.strokeStyle = '#22d3ee';
    if (dev.sel.kind === 'ramps') { const g = rampGeom(o); ctx.strokeRect(g.x - 3, g.y - 3, g.w + 6, g.h + 6); }
    else if (dev.sel.kind === 'lcrates' || dev.sel.kind === 'cars') ctx.strokeRect(o.x - 3, o.y - o.z * LIFT - 3, o.w + 6, o.h + 6);
    else if (dev.sel.kind === 'crates') ctx.strokeRect(o.x - 3, o.y - o.z * LIFT - 3, 34, 34);
    else { ctx.beginPath(); ctx.arc(o.x, o.y + (dev.sel.kind === 'poles' ? 0 : 0), 16, 0, Math.PI * 2); ctx.stroke(); }
  };
})();
