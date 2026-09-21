/**
 * Pulled-back top-down street renderer (concept-art north star).
 * Zoomed-out camera — wide street, fence/gate, SUV, cans, CAP, BYTE.
 */
import { WORLD, WALLS, GATE, SUV, LAMPS, BAYS } from './world.js';

const SKY_TOP = '#2a1848';
const SKY_BOT = '#0c1018';
const ASPHALT = '#2a2e38';
const ASPHALT2 = '#232730';

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

/** Camera: pulled back — fit large world into view with margin */
export function cameraFor(viewW, viewH, focusX, focusY) {
  const zoom = Math.min(viewW / (WORLD.w * 0.92), viewH / (WORLD.h * 0.92), 0.72);
  // Soft follow, keep street framed
  const cx = WORLD.w / 2 + (focusX - WORLD.w / 2) * 0.15;
  const cy = WORLD.h / 2 + (focusY - WORLD.h / 2) * 0.12;
  return { zoom, cx, cy };
}

export function clear(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.35, '#151a28');
  g.addColorStop(1, SKY_BOT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function withCam(ctx, cam, viewW, viewH, fn) {
  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.cx, -cam.cy);
  fn();
  ctx.restore();
}

function drawAsphalt(ctx) {
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(80, 200, WORLD.w - 160, WORLD.h - 280);

  // Cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const x = 120 + (i * 97) % (WORLD.w - 240);
    const y = 260 + ((i * 163) % (WORLD.h - 360));
    ctx.moveTo(x, y);
    ctx.lineTo(x + 40 + (i % 5) * 8, y + 18 + (i % 3) * 10);
    ctx.lineTo(x + 70, y + 8);
  }
  ctx.stroke();

  // Lane marks
  ctx.strokeStyle = 'rgba(255,220,120,0.12)';
  ctx.setLineDash([28, 22]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(200, 700);
  ctx.lineTo(1400, 700);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGarageBays(ctx) {
  const bayW = 200;
  const startX = 220;
  const y = 90;
  BAYS.forEach((num, i) => {
    const x = startX + i * (bayW + 24);
    // Bay body
    const g = ctx.createLinearGradient(x, y, x, y + 160);
    g.addColorStop(0, '#3a3228');
    g.addColorStop(1, '#1c1814');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bayW, 160);
    // Door
    ctx.fillStyle = '#4a4034';
    ctx.fillRect(x + 16, y + 36, bayW - 32, 110);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 16, y + 36, bayW - 32, 110);
    // Number
    ctx.fillStyle = '#c9b896';
    ctx.font = 'bold 28px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(num), x + bayW / 2, y + 28);
    // Steam plume
    ctx.fillStyle = 'rgba(220,220,230,0.08)';
    ctx.beginPath();
    ctx.ellipse(x + bayW / 2, y - 10 - (i % 3) * 6, 18, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFence(ctx, t) {
  // Fence posts + wire left/right of gate
  const segments = [
    [180, 280, 600],
    [760, 280, 1420],
  ];
  ctx.strokeStyle = '#6a7380';
  ctx.lineWidth = 3;
  for (const [x0, y, x1] of segments) {
    // Top rail
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0, y + 22);
    ctx.lineTo(x1, y + 22);
    ctx.stroke();
    for (let x = x0; x <= x1; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 28);
      ctx.stroke();
      // Diamond mesh hint
      ctx.strokeStyle = 'rgba(140,150,160,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14, y + 11);
      ctx.lineTo(x, y + 22);
      ctx.stroke();
      ctx.strokeStyle = '#6a7380';
      ctx.lineWidth = 3;
    }
  }

  // Locked gate doors
  const gx = GATE.x;
  const gy = GATE.y;
  const gw = GATE.w;
  ctx.fillStyle = '#4e5662';
  ctx.fillRect(gx, gy - 8, gw / 2 - 4, 40);
  ctx.fillRect(gx + gw / 2 + 4, gy - 8, gw / 2 - 4, 40);
  ctx.strokeStyle = '#8b93a0';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy - 8, gw / 2 - 4, 40);
  ctx.strokeRect(gx + gw / 2 + 4, gy - 8, gw / 2 - 4, 40);

  // Padlock
  const lx = gx + gw / 2;
  const ly = gy + 10;
  ctx.fillStyle = '#f5c542';
  ctx.beginPath();
  ctx.arc(lx, ly - 6, 6, Math.PI, 0);
  ctx.strokeStyle = '#f5c542';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(lx - 8, ly - 4, 16, 14);

  // Sign
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.003);
  ctx.fillStyle = `rgba(20,16,12,${0.75 + pulse * 0.15})`;
  ctx.fillRect(gx - 10, gy - 42, gw + 20, 26);
  ctx.strokeStyle = `rgba(245,197,66,${0.45 + pulse * 0.4})`;
  ctx.strokeRect(gx - 10, gy - 42, gw + 20, 26);
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 11px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOCKED — COMING IN UPDATE', lx, gy - 25);
}

function drawLamp(ctx, x, y, t) {
  // Pole
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(x - 4, y - 90, 8, 90);
  ctx.fillStyle = '#555b68';
  ctx.beginPath();
  ctx.arc(x, y - 96, 12, 0, Math.PI * 2);
  ctx.fill();
  // Glow
  const flicker = 0.85 + 0.15 * Math.sin(t * 0.008 + x);
  const grd = ctx.createRadialGradient(x, y - 40, 10, x, y + 20, 160);
  grd.addColorStop(0, `rgba(255, 200, 80, ${0.28 * flicker})`);
  grd.addColorStop(0.45, `rgba(255, 160, 40, ${0.1 * flicker})`);
  grd.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y + 10, 160, 0, Math.PI * 2);
  ctx.fill();
}

function drawSUV(ctx, repaired, driving) {
  const { x, y, w, h } = SUV;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (driving) ctx.rotate(Math.sin(performance.now() * 0.01) * 0.02);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, h / 2 - 4, w / 2 + 8, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = repaired ? '#e53935' : '#8b1e1e';
  roundRect(ctx, -w / 2, -h / 2, w, h - 10, 10);
  ctx.fill();
  // Roof
  ctx.fillStyle = repaired ? '#c62828' : '#5c1414';
  roundRect(ctx, -w / 2 + 18, -h / 2 + 8, w - 36, 28, 6);
  ctx.fill();
  // Hood decal
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-w / 2 + 36, 8, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SDRB', -w / 2 + 36, 6);
  ctx.fillText('TASK', -w / 2 + 36, 14);
  // Windows
  ctx.fillStyle = 'rgba(120,180,220,0.35)';
  roundRect(ctx, -w / 2 + 22, -h / 2 + 12, w - 44, 18, 4);
  ctx.fill();
  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w / 2 + 8, h / 2 - 22, 22, 18);
  ctx.fillRect(w / 2 - 30, h / 2 - 22, 22, 18);
  ctx.fillRect(-w / 2 + 8, -h / 2 + 4, 22, 14);
  ctx.fillRect(w / 2 - 30, -h / 2 + 4, 22, 14);

  if (!repaired) {
    ctx.strokeStyle = 'rgba(255,200,80,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#f5c542';
    ctx.font = 'bold 10px Courier New, monospace';
    ctx.fillText('NEEDS GEAR', 0, -h / 2 - 12);
  }

  ctx.restore();

  // Deposit marker
  ctx.fillStyle = 'rgba(245,197,66,0.15)';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, SUV.interactR, 0, Math.PI * 2);
  ctx.fill();
}

function drawCan(ctx, can, t) {
  if (can.taken) return;
  const bob = Math.sin(t * 0.006 + can.id) * 3;
  const x = can.x;
  const y = can.y + bob;
  // Glow
  const g = ctx.createRadialGradient(x, y, 2, x, y, 28);
  g.addColorStop(0, 'rgba(245,197,66,0.45)');
  g.addColorStop(1, 'rgba(245,197,66,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.fill();
  // Can body
  ctx.fillStyle = '#f5c542';
  roundRect(ctx, x - 12, y - 16, 24, 28, 4);
  ctx.fill();
  ctx.fillStyle = '#c9a017';
  ctx.fillRect(x - 12, y - 16, 24, 6);
  ctx.fillStyle = '#1a1200';
  ctx.font = 'bold 9px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DRB', x, y + 4);
}

function drawCap(ctx, player, t) {
  const { x, y, facing } = player;
  const walk = player.moving ? Math.sin(t * 0.02) * 3 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing < 0 ? -1 : 1, 1);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 18, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#3b5998';
  ctx.fillRect(-10, 4 + walk, 8, 16);
  ctx.fillRect(2, 4 - walk, 8, 16);
  // Boots
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(-11, 16 + walk, 10, 5);
  ctx.fillRect(1, 16 - walk, 10, 5);
  // Torso (tank)
  ctx.fillStyle = '#f0f0f0';
  roundRect(ctx, -12, -18, 24, 24, 4);
  ctx.fill();
  // Arms / tattoos hint
  ctx.fillStyle = '#c68642';
  ctx.fillRect(-18, -14, 7, 18);
  ctx.fillRect(11, -14, 7, 18);
  ctx.strokeStyle = 'rgba(20,20,20,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-15, -10); ctx.lineTo(-14, 0);
  ctx.moveTo(15, -8); ctx.lineTo(14, 2);
  ctx.stroke();
  // Head
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(0, -26, 11, 0, Math.PI * 2);
  ctx.fill();
  // Beard
  ctx.fillStyle = '#8b2500';
  ctx.beginPath();
  ctx.ellipse(0, -18, 9, 8, 0, 0, Math.PI);
  ctx.fill();
  // Cap hat
  ctx.fillStyle = '#0d9488';
  ctx.fillRect(-12, -36, 24, 8);
  ctx.fillStyle = '#134e4a';
  ctx.fillRect(-4, -38, 20, 5);
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAP', 0, -30);

  ctx.restore();
}

function drawByte(ctx, dog, t) {
  const { x, y } = dog;
  const bob = Math.sin(t * 0.01) * 2;
  ctx.save();
  ctx.translate(x, y + bob);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#9aa3b2';
  roundRect(ctx, -16, -10, 32, 20, 6);
  ctx.fill();
  // Head
  roundRect(ctx, 8, -18, 18, 16, 5);
  ctx.fill();
  // Ear
  ctx.fillStyle = '#7a8494';
  ctx.fillRect(20, -26, 6, 12);
  // Circuit glow
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, -2); ctx.lineTo(0, 2); ctx.lineTo(8, -4);
  ctx.stroke();
  // Eye
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(18, -12, 3, 0, Math.PI * 2);
  ctx.fill();
  // Collar tag
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.arc(0, 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('byte', 0, 4);

  // Legs
  ctx.fillStyle = '#7a8494';
  ctx.fillRect(-14, 8, 5, 8);
  ctx.fillRect(-4, 8, 5, 8);
  ctx.fillRect(4, 8, 5, 8);
  ctx.fillRect(12, 8, 5, 8);

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

function drawScrap(ctx) {
  // Ambient junk piles
  const piles = [
    [160, 900, 50], [1500, 880, 40], [200, 360, 30], [1450, 340, 35],
  ];
  for (const [x, y, s] of piles) {
    ctx.fillStyle = '#3a3530';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y + 8);
    ctx.lineTo(x + s * 0.6, y - s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a5048';
    ctx.fillRect(x + 8, y - 20, 18, 14);
  }
}

export function drawWorld(ctx, viewW, viewH, cam, state) {
  clear(ctx, viewW, viewH);
  const t = state.time;

  withCam(ctx, cam, viewW, viewH, () => {
    drawAsphalt(ctx);
    drawGarageBays(ctx);
    drawFence(ctx, t);
    drawScrap(ctx);
    for (const L of LAMPS) drawLamp(ctx, L.x, L.y, t);

    for (const can of state.cans) drawCan(ctx, can, t);
    drawSUV(ctx, state.suvRepaired, state.driving);
    drawByte(ctx, state.dog, t);
    drawCap(ctx, state.player, t);

    // Interact prompts in world space
    if (state.nearSUV) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(SUV.x + 10, SUV.y - 36, 120, 20);
      ctx.fillStyle = '#f5c542';
      ctx.font = 'bold 11px Courier New, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[E] Deposit / Pump', SUV.x + SUV.w / 2, SUV.y - 22);
    }
    if (state.nearByte) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(state.dog.x - 60, state.dog.y - 48, 120, 20);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 11px Courier New, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[F] BYTE Fetch', state.dog.x, state.dog.y - 34);
    }
    if (state.nearGate) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(GATE.x - 20, GATE.y + 44, GATE.w + 40, 20);
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px Courier New, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Gate locked — coming in update', GATE.x + GATE.w / 2, GATE.y + 58);
    }
  });

  // Vignette
  const vig = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.2, viewW / 2, viewH / 2, viewH * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, viewW, viewH);
}
