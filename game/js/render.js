/**
 * Soft isometric / 2.5D street renderer (concept-art north star).
 * World units stay axis-aligned for gameplay; screen uses angled projection
 * so walls, SUV sides, and DRB drums read with vertical height.
 */
import { WORLD, GATE, SUV, LAMPS, BAYS } from './world.js';

const SKY_TOP = '#3a1a3a';
const SKY_MID = '#1a1028';
const SKY_BOT = '#080b12';
const ASPHALT = '#2a2e36';
const ASPHALT_DARK = '#1e222a';

/** Soft isometric (not pure 30° orthographic — slight pull-back angle) */
const ISO_COS = 0.72;
const ISO_SIN = 0.38;

export function worldToIso(x, y, z = 0) {
  return {
    x: (x - y) * ISO_COS,
    y: (x + y) * ISO_SIN - z,
  };
}

export function resizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width * dpr));
  const h = Math.max(240, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

/** Camera: frame the isometric street with soft follow */
export function cameraFor(viewW, viewH, focusX, focusY) {
  const corners = [
    worldToIso(80, 200),
    worldToIso(WORLD.w - 80, 200),
    worldToIso(80, WORLD.h - 80),
    worldToIso(WORLD.w - 80, WORLD.h - 80),
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const zoom = Math.min(viewW / (spanX * 1.08), viewH / (spanY * 1.12), 0.95) * 0.92;

  const soft = worldToIso(
    WORLD.w / 2 + (focusX - WORLD.w / 2) * 0.12,
    WORLD.h / 2 + (focusY - WORLD.h / 2) * 0.1
  );
  const center = worldToIso(WORLD.w / 2, WORLD.h * 0.52);
  return {
    zoom,
    cx: center.x * 0.85 + soft.x * 0.15,
    cy: center.y * 0.85 + soft.y * 0.15 - 40,
  };
}

export function clear(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.28, '#2a1535');
  g.addColorStop(0.55, SKY_MID);
  g.addColorStop(1, SKY_BOT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Dusk cloud bands
  ctx.fillStyle = 'rgba(80, 30, 50, 0.18)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(w * (0.15 + i * 0.18), h * (0.08 + (i % 3) * 0.03), w * 0.14, h * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function withCam(ctx, cam, viewW, viewH, fn) {
  ctx.save();
  ctx.translate(viewW / 2, viewH / 2 + viewH * 0.04);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.cx, -cam.cy);
  fn();
  ctx.restore();
}

function depthKey(x, y) {
  return x + y;
}

/** Flat ground quad in world space → iso parallelogram */
function fillIsoQuad(ctx, x0, y0, x1, y1, x2, y2, x3, y3, style) {
  const a = worldToIso(x0, y0);
  const b = worldToIso(x1, y1);
  const c = worldToIso(x2, y2);
  const d = worldToIso(x3, y3);
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

function strokeIsoLine(ctx, x0, y0, x1, y1, style, width = 2) {
  const a = worldToIso(x0, y0);
  const b = worldToIso(x1, y1);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * Extruded AABB box standing on world floor (x,y) with size (w,d) and height h.
 * Faces: left (west), right (south-east), top.
 */
function drawIsoBox(ctx, x, y, w, d, h, colors) {
  const {
    top = '#5a5048',
    left = '#3a3530',
    right = '#2a2622',
    stroke = 'rgba(0,0,0,0.35)',
  } = colors;

  const p00 = worldToIso(x, y, 0);
  const p10 = worldToIso(x + w, y, 0);
  const p11 = worldToIso(x + w, y + d, 0);
  const p01 = worldToIso(x, y + d, 0);
  const t00 = worldToIso(x, y, h);
  const t10 = worldToIso(x + w, y, h);
  const t11 = worldToIso(x + w, y + d, h);
  const t01 = worldToIso(x, y + d, h);

  // Left face (x → x+w along north edge rising)
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(p00.x, p00.y);
  ctx.lineTo(p01.x, p01.y);
  ctx.lineTo(t01.x, t01.y);
  ctx.lineTo(t00.x, t00.y);
  ctx.closePath();
  ctx.fill();

  // Right / front-ish face
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(p01.x, p01.y);
  ctx.lineTo(p11.x, p11.y);
  ctx.lineTo(t11.x, t11.y);
  ctx.lineTo(t01.x, t01.y);
  ctx.closePath();
  ctx.fill();

  // Top
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(t00.x, t00.y);
  ctx.lineTo(t10.x, t10.y);
  ctx.lineTo(t11.x, t11.y);
  ctx.lineTo(t01.x, t01.y);
  ctx.closePath();
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(t00.x, t00.y);
    ctx.lineTo(t10.x, t10.y);
    ctx.lineTo(t11.x, t11.y);
    ctx.lineTo(t01.x, t01.y);
    ctx.closePath();
    ctx.stroke();
  }

  return { p00, p10, p11, p01, t00, t10, t11, t01 };
}

function drawAsphalt(ctx) {
  const x0 = 100, y0 = 220, x1 = WORLD.w - 100, y1 = WORLD.h - 100;
  fillIsoQuad(ctx, x0, y0, x1, y0, x1, y1, x0, y1, ASPHALT);

  // Slightly darker patches
  fillIsoQuad(ctx, 280, 400, 520, 400, 520, 560, 280, 560, ASPHALT_DARK);
  fillIsoQuad(ctx, 900, 500, 1200, 500, 1200, 720, 900, 720, '#252930');
  fillIsoQuad(ctx, 600, 700, 850, 700, 850, 900, 600, 900, '#262a32');

  // Cracks
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 22; i++) {
    const x = 140 + (i * 97) % (WORLD.w - 280);
    const y = 280 + ((i * 163) % (WORLD.h - 380));
    strokeIsoLine(
      ctx, x, y,
      x + 50 + (i % 5) * 10, y + 20 + (i % 3) * 12,
      'rgba(0,0,0,0.4)', 1.5
    );
    strokeIsoLine(
      ctx,
      x + 50 + (i % 5) * 10, y + 20 + (i % 3) * 12,
      x + 80, y + 10,
      'rgba(0,0,0,0.28)', 1
    );
  }

  // Soft lane mark
  ctx.setLineDash([18, 16]);
  strokeIsoLine(ctx, 220, 720, 1380, 720, 'rgba(255,220,120,0.1)', 3);
  ctx.setLineDash([]);
}

function drawGarageBays(ctx) {
  const bayW = 190;
  const startX = 240;
  const y = 70;
  const depth = 130;
  const wallH = 110;

  BAYS.forEach((num, i) => {
    const x = startX + i * (bayW + 18);
    drawIsoBox(ctx, x, y, bayW, depth, wallH, {
      top: '#3a3228',
      left: '#2a241c',
      right: '#1c1814',
      stroke: 'rgba(0,0,0,0.45)',
    });

    // Door inset on the front-facing (right) wall — approximate with panel on face
    const doorInset = 18;
    const dx = x + doorInset;
    const dy = y + depth - 8;
    const dw = bayW - doorInset * 2;
    const dd = 6;
    const dh = 78;
    drawIsoBox(ctx, dx, dy, dw, dd, dh, {
      top: '#4a4034',
      left: '#3a3228',
      right: '#4a4034',
      stroke: 'rgba(0,0,0,0.5)',
    });

    // Horizontal door ribs
    for (let r = 0; r < 5; r++) {
      const zh = 12 + r * 14;
      const a = worldToIso(dx + 4, dy + dd, zh);
      const b = worldToIso(dx + dw - 4, dy + dd, zh);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Bay number on lintel
    const label = worldToIso(x + bayW / 2, y + 20, wallH + 8);
    ctx.fillStyle = '#c9b896';
    ctx.font = 'bold 22px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(num), label.x, label.y);

    // Steam plume
    const steam = worldToIso(x + bayW / 2, y + 40, wallH + 30 + (i % 3) * 8);
    ctx.fillStyle = 'rgba(220,220,230,0.07)';
    ctx.beginPath();
    ctx.ellipse(steam.x, steam.y, 16, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFence(ctx, t) {
  const y = 280;
  const fenceH = 42;
  const segments = [
    [180, 600],
    [760, 1420],
  ];

  for (const [x0, x1] of segments) {
    // Mesh panels as thin tall boxes
    for (let x = x0; x < x1; x += 32) {
      const w = Math.min(28, x1 - x);
      drawIsoBox(ctx, x, y, w, 8, fenceH, {
        top: '#7a8490',
        left: '#5a6470',
        right: '#6a7380',
        stroke: 'rgba(180,190,200,0.25)',
      });
      // Diamond mesh hint on right face
      const a = worldToIso(x + 4, y + 8, 8);
      const b = worldToIso(x + w / 2, y + 8, 20);
      const c = worldToIso(x + 4, y + 8, 32);
      ctx.strokeStyle = 'rgba(160,170,180,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
  }

  // Locked gate doors — taller, heavier
  const gx = GATE.x;
  const gy = GATE.y;
  const gw = GATE.w;
  const half = gw / 2 - 6;
  drawIsoBox(ctx, gx, gy, half, 14, 48, {
    top: '#6a7380',
    left: '#4a5260',
    right: '#5a6270',
    stroke: '#8b93a0',
  });
  drawIsoBox(ctx, gx + half + 12, gy, half, 14, 48, {
    top: '#6a7380',
    left: '#4a5260',
    right: '#5a6270',
    stroke: '#8b93a0',
  });

  // Padlock
  const lock = worldToIso(gx + gw / 2, gy + 10, 22);
  ctx.strokeStyle = '#f5c542';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(lock.x, lock.y - 8, 7, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(lock.x - 9, lock.y - 6, 18, 16);
  ctx.fillStyle = '#1a1200';
  ctx.beginPath();
  ctx.arc(lock.x, lock.y + 2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Sign
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.003);
  const sign = worldToIso(gx + gw / 2, gy - 4, 58);
  const sw = 168;
  const sh = 24;
  ctx.fillStyle = `rgba(20,16,12,${0.8 + pulse * 0.12})`;
  ctx.fillRect(sign.x - sw / 2, sign.y - sh / 2, sw, sh);
  ctx.strokeStyle = `rgba(245,197,66,${0.45 + pulse * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sign.x - sw / 2, sign.y - sh / 2, sw, sh);
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 10px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOCKED — COMING IN UPDATE', sign.x, sign.y + 4);
}

function drawLamp(ctx, x, y, t) {
  const poleH = 95;
  // Pole
  drawIsoBox(ctx, x - 4, y - 4, 8, 8, poleH, {
    top: '#555b68',
    left: '#2a2e36',
    right: '#3a3f4a',
    stroke: 'rgba(0,0,0,0.3)',
  });
  // Lamp head
  const head = worldToIso(x, y, poleH + 6);
  ctx.fillStyle = '#555b68';
  ctx.beginPath();
  ctx.arc(head.x, head.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffc850';
  ctx.beginPath();
  ctx.arc(head.x, head.y + 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // Warm ground glow (in iso space under lamp)
  const flicker = 0.85 + 0.15 * Math.sin(t * 0.008 + x);
  const gnd = worldToIso(x, y + 10, 0);
  const grd = ctx.createRadialGradient(gnd.x, gnd.y, 8, gnd.x, gnd.y, 130);
  grd.addColorStop(0, `rgba(255, 200, 80, ${0.32 * flicker})`);
  grd.addColorStop(0.4, `rgba(255, 160, 40, ${0.12 * flicker})`);
  grd.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(gnd.x, gnd.y, 120, 55, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Boxy garage-bay SUV — 3/4 isometric, readable sides, windows, chunky tires.
 * Oriented facing roughly toward -X / +screen-left like the concept.
 */
function drawSUV(ctx, repaired, driving) {
  const { x, y, w, h } = SUV;
  const bodyH = 38;
  const cabH = 58;
  const bodyCol = repaired ? '#d32f2f' : '#7a1a1a';
  const bodyDark = repaired ? '#b71c1c' : '#4a1010';
  const roofCol = repaired ? '#8b1515' : '#3a0c0c';
  const accent = repaired ? '#ef5350' : '#5c1414';

  ctx.save();
  if (driving) {
    const sway = Math.sin(performance.now() * 0.01) * 1.5;
    const pivot = worldToIso(x + w / 2, y + h / 2);
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(sway * 0.008);
    ctx.translate(-pivot.x, -pivot.y);
  }

  // Ground shadow
  const sh = worldToIso(x + w / 2, y + h / 2 + 6);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y, w * 0.55, h * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Chunky tires (iso cylinders / thick discs at corners)
  const tirePositions = [
    [x + 18, y + 12],
    [x + w - 28, y + 12],
    [x + 18, y + h - 22],
    [x + w - 28, y + h - 22],
  ];
  for (const [tx, ty] of tirePositions) {
    drawIsoBox(ctx, tx, ty, 22, 16, 20, {
      top: '#2a2a2a',
      left: '#111',
      right: '#1a1a1a',
      stroke: 'rgba(0,0,0,0.6)',
    });
    // Rim
    const rim = worldToIso(tx + 11, ty + 8, 10);
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(rim.x, rim.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(rim.x, rim.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lower body chassis
  drawIsoBox(ctx, x + 8, y + 10, w - 16, h - 20, bodyH, {
    top: bodyCol,
    left: bodyDark,
    right: accent,
    stroke: 'rgba(0,0,0,0.4)',
  });

  // Cabin / roof block (set back)
  const cabX = x + 28;
  const cabY = y + 18;
  const cabW = w - 55;
  const cabD = h - 36;
  drawIsoBox(ctx, cabX, cabY, cabW, cabD, cabH, {
    top: roofCol,
    left: bodyDark,
    right: bodyCol,
    stroke: 'rgba(0,0,0,0.45)',
  });

  // Windshield (front-left face of cabin — glaze on left wall)
  {
    const a = worldToIso(cabX + 4, cabY + 4, bodyH + 8);
    const b = worldToIso(cabX + 4, cabY + cabD - 4, bodyH + 8);
    const c = worldToIso(cabX + 4, cabY + cabD - 4, cabH - 6);
    const d = worldToIso(cabX + 4, cabY + 4, cabH - 6);
    const glass = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
    glass.addColorStop(0, 'rgba(160,210,240,0.55)');
    glass.addColorStop(1, 'rgba(40,80,120,0.45)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,30,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Side window on right face
  {
    const a = worldToIso(cabX + 10, cabY + cabD, bodyH + 10);
    const b = worldToIso(cabX + cabW - 14, cabY + cabD, bodyH + 10);
    const c = worldToIso(cabX + cabW - 14, cabY + cabD, cabH - 8);
    const d = worldToIso(cabX + 10, cabY + cabD, cabH - 8);
    ctx.fillStyle = 'rgba(100,160,200,0.4)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  // Hood flat ahead of cabin
  drawIsoBox(ctx, x + 10, y + 14, 32, h - 28, bodyH + 4, {
    top: repaired ? '#c62828' : '#5c1414',
    left: bodyDark,
    right: accent,
    stroke: 'rgba(0,0,0,0.3)',
  });

  // Hood decal (SDRB TASK FORCE)
  {
    const dec = worldToIso(x + 26, y + h / 2, bodyH + 6);
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(dec.x, dec.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Cartoon face dots
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(dec.x - 4, dec.y - 3, 2, 0, Math.PI * 2);
    ctx.arc(dec.x + 4, dec.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dec.x, dec.y + 3, 3, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SDRB', dec.x, dec.y + 12);
  }

  // Headlights on front (left) face of hood
  {
    const hl1 = worldToIso(x + 12, y + 22, bodyH * 0.55);
    const hl2 = worldToIso(x + 12, y + h - 28, bodyH * 0.55);
    for (const hl of [hl1, hl2]) {
      ctx.fillStyle = repaired ? '#fff8e1' : '#c9a86c';
      ctx.beginPath();
      ctx.arc(hl.x, hl.y, 5, 0, Math.PI * 2);
      ctx.fill();
      if (repaired) {
        const glow = ctx.createRadialGradient(hl.x, hl.y, 1, hl.x, hl.y, 14);
        glow.addColorStop(0, 'rgba(255,240,180,0.55)');
        glow.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(hl.x, hl.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Grille bars
  {
    for (let i = 0; i < 4; i++) {
      const gz = 8 + i * 6;
      const a = worldToIso(x + 10, y + 36, gz);
      const b = worldToIso(x + 10, y + h - 36, gz);
      ctx.strokeStyle = 'rgba(20,20,20,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  if (!repaired) {
    const tag = worldToIso(x + w / 2, y + h / 2, cabH + 16);
    ctx.strokeStyle = 'rgba(255,200,80,0.55)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    const a = worldToIso(x, y, 0);
    const b = worldToIso(x + w, y, 0);
    const c = worldToIso(x + w, y + h, 0);
    const d = worldToIso(x, y + h, 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 4);
    ctx.lineTo(b.x, b.y - 4);
    ctx.lineTo(c.x, c.y - 4);
    ctx.lineTo(d.x, d.y - 4);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f5c542';
    ctx.font = 'bold 11px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEEDS GEAR', tag.x, tag.y);
  }

  ctx.restore();

  // Soft deposit radius hint
  const mid = worldToIso(x + w / 2, y + h / 2);
  ctx.fillStyle = 'rgba(245,197,66,0.08)';
  ctx.beginPath();
  ctx.ellipse(mid.x, mid.y, SUV.interactR * 0.7, SUV.interactR * 0.32, -0.35, 0, Math.PI * 2);
  ctx.fill();
}

/** Yellow DRB oil drum — standing cylinder */
function drawCan(ctx, can, t) {
  if (can.taken) return;
  const bob = Math.sin(t * 0.006 + can.id) * 2;
  const x = can.x;
  const y = can.y;
  const r = 11;
  const h = 26 + bob * 0.15;

  // Glow on ground
  const gnd = worldToIso(x, y);
  const g = ctx.createRadialGradient(gnd.x, gnd.y, 2, gnd.x, gnd.y, 32);
  g.addColorStop(0, 'rgba(245,197,66,0.4)');
  g.addColorStop(1, 'rgba(245,197,66,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(gnd.x, gnd.y, 28, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cylinder body via stacked ellipses + side fill
  const bottom = worldToIso(x, y, 0);
  const top = worldToIso(x, y, h);
  const rx = r * ISO_COS * 1.1;
  const ry = r * ISO_SIN * 1.6;

  // Side
  ctx.fillStyle = '#e6b422';
  ctx.beginPath();
  ctx.moveTo(bottom.x - rx, bottom.y);
  ctx.lineTo(top.x - rx, top.y);
  ctx.ellipse(top.x, top.y, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(bottom.x + rx, bottom.y);
  ctx.ellipse(bottom.x, bottom.y, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  // Darker right half
  ctx.fillStyle = '#c9a017';
  ctx.beginPath();
  ctx.moveTo(bottom.x, bottom.y + ry * 0.2);
  ctx.lineTo(top.x, top.y + ry * 0.2);
  ctx.lineTo(top.x + rx, top.y);
  ctx.lineTo(bottom.x + rx, bottom.y);
  ctx.closePath();
  ctx.fill();

  // Top lid
  ctx.fillStyle = '#f5d76e';
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,60,0,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // DRB label vertical
  ctx.save();
  ctx.translate((bottom.x + top.x) / 2 - 1, (bottom.y + top.y) / 2 + 2);
  ctx.fillStyle = '#1a1200';
  ctx.font = 'bold 8px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('D', 0, -6);
  ctx.fillText('R', 0, 2);
  ctx.fillText('B', 0, 10);
  ctx.restore();
}

function drawCap(ctx, player, t) {
  const { x, y, facing } = player;
  const walk = player.moving ? Math.sin(t * 0.02) * 2.5 : 0;
  const base = worldToIso(x + 14, y + 18);
  const flip = facing < 0 ? -1 : 1;

  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.scale(flip, 1);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (jeans)
  ctx.fillStyle = '#3b5998';
  ctx.fillRect(-11, -4 + walk, 9, 20);
  ctx.fillRect(2, -4 - walk, 9, 20);
  // Boots
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(-12, 14 + walk, 11, 6);
  ctx.fillRect(1, 14 - walk, 11, 6);

  // Torso tank
  ctx.fillStyle = '#f0f0f0';
  roundRect(ctx, -13, -28, 26, 26, 4);
  ctx.fill();

  // Arms + tattoo hints
  ctx.fillStyle = '#c68642';
  ctx.fillRect(-20, -24, 8, 20);
  ctx.fillRect(12, -24, 8, 20);
  ctx.strokeStyle = 'rgba(20,20,20,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, -18); ctx.lineTo(-15, -6);
  ctx.moveTo(16, -16); ctx.lineTo(15, -4);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(0, -36, 12, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-4, -38, 2.2, 0, Math.PI * 2);
  ctx.arc(5, -38, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Beard
  ctx.fillStyle = '#8b2500';
  ctx.beginPath();
  ctx.ellipse(0, -28, 10, 9, 0, 0, Math.PI);
  ctx.fill();

  // Cap hat
  ctx.fillStyle = '#0d9488';
  ctx.fillRect(-13, -48, 26, 9);
  ctx.fillStyle = '#134e4a';
  ctx.fillRect(-2, -51, 22, 5);
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAP', 0, -41);

  ctx.restore();
}

function drawByte(ctx, dog, t) {
  const { x, y } = dog;
  const bob = Math.sin(t * 0.01) * 2;
  const base = worldToIso(x, y);

  ctx.save();
  ctx.translate(base.x, base.y + bob * 0.3);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#9aa3b2';
  roundRect(ctx, -18, -14, 34, 22, 7);
  ctx.fill();
  // Metallic shade
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, -16, -12, 14, 10, 4);
  ctx.fill();

  // Head
  ctx.fillStyle = '#a8b0be';
  roundRect(ctx, 10, -22, 20, 18, 6);
  ctx.fill();
  // Ear
  ctx.fillStyle = '#7a8494';
  ctx.fillRect(24, -30, 7, 14);
  // Circuit glow
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(-12, -4); ctx.lineTo(-2, 2); ctx.lineTo(8, -6);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Flank glow panel
  ctx.fillStyle = 'rgba(56,189,248,0.35)';
  roundRect(ctx, -10, -8, 12, 8, 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(20, -14, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Collar
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(-6, -2, 16, 5);
  ctx.beginPath();
  ctx.arc(2, 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('byte', 2, 6);

  // Legs
  ctx.fillStyle = '#7a8494';
  const legWalk = Math.sin(t * 0.015) * 2;
  ctx.fillRect(-14, 6 + legWalk, 5, 10);
  ctx.fillRect(-4, 6 - legWalk, 5, 10);
  ctx.fillRect(4, 6 + legWalk, 5, 10);
  ctx.fillRect(12, 6 - legWalk, 5, 10);

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawScrap(ctx, x, y, s) {
  drawIsoBox(ctx, x, y, s, s * 0.7, s * 0.55, {
    top: '#5a5048',
    left: '#3a3530',
    right: '#2a2622',
    stroke: 'rgba(0,0,0,0.4)',
  });
  drawIsoBox(ctx, x + s * 0.25, y + s * 0.15, s * 0.45, s * 0.35, s * 0.35, {
    top: '#6a6058',
    left: '#4a4038',
    right: '#3a3530',
  });
}

function drawPrompt(ctx, wx, wy, wz, text, color, width = 130) {
  const p = worldToIso(wx, wy, wz);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(p.x - width / 2, p.y - 10, width, 20);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - width / 2, p.y - 10, width, 20);
  ctx.fillStyle = color;
  ctx.font = 'bold 11px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, p.x, p.y + 4);
}

export function drawWorld(ctx, viewW, viewH, cam, state) {
  clear(ctx, viewW, viewH);
  const t = state.time;

  withCam(ctx, cam, viewW, viewH, () => {
    // Far scenery first
    drawAsphalt(ctx);
    drawGarageBays(ctx);
    drawFence(ctx, t);

    // Depth-sorted dynamic / mid-ground entities
    const drawList = [];

    for (const pile of [
      [160, 900, 50], [1480, 880, 42], [200, 360, 32], [1440, 340, 36],
      [300, 980, 28], [1320, 960, 34],
    ]) {
      drawList.push({
        depth: depthKey(pile[0], pile[1]),
        draw: () => drawScrap(ctx, pile[0], pile[1], pile[2]),
      });
    }

    for (const L of LAMPS) {
      drawList.push({
        depth: depthKey(L.x, L.y),
        draw: () => drawLamp(ctx, L.x, L.y, t),
      });
    }

    for (const can of state.cans) {
      if (can.taken) continue;
      drawList.push({
        depth: depthKey(can.x, can.y),
        draw: () => drawCan(ctx, can, t),
      });
    }

    drawList.push({
      depth: depthKey(SUV.x + SUV.w / 2, SUV.y + SUV.h / 2),
      draw: () => drawSUV(ctx, state.suvRepaired, state.driving),
    });

    drawList.push({
      depth: depthKey(state.dog.x, state.dog.y),
      draw: () => drawByte(ctx, state.dog, t),
    });

    drawList.push({
      depth: depthKey(state.player.x + 14, state.player.y + 18),
      draw: () => drawCap(ctx, state.player, t),
    });

    drawList.sort((a, b) => a.depth - b.depth);
    for (const item of drawList) item.draw();

    // Interact prompts (above entities)
    if (state.nearSUV) {
      drawPrompt(ctx, SUV.x + SUV.w / 2, SUV.y + 10, 72, '[E] Deposit / Pump', '#f5c542', 140);
    }
    if (state.nearByte) {
      drawPrompt(ctx, state.dog.x, state.dog.y, 40, '[F] BYTE Fetch', '#34d399', 120);
    }
    if (state.nearGate) {
      drawPrompt(
        ctx, GATE.x + GATE.w / 2, GATE.y + 30, 20,
        'Gate locked — coming in update', '#f87171', 220
      );
    }
  });

  // Vignette — dusk framing
  const vig = ctx.createRadialGradient(
    viewW / 2, viewH * 0.45, viewH * 0.15,
    viewW / 2, viewH / 2, viewH * 0.8
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.7, 'rgba(0,0,0,0.15)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, viewW, viewH);
}
