/**
 * CAPs Garage — Street Arcade BETA
 * Mock wallet + local HUD cans. Bankr wires liveProvider later.
 */
import { mockProvider } from './chain/mockProvider.js';
// import { liveProvider } from './chain/liveProvider.js'; // TODO(Bankr): flip when contracts live
import { initInput, getMoveVector, consumeKey } from './input.js';
import {
  WORLD, GATE, SUV, BYTE_HOME, spawnCanPositions, resolveWalls, dist,
} from './world.js';
import { resizeCanvas, cameraFor, drawWorld } from './render.js';

const USE_LIVE = false; // Bankr: set true + wire liveProvider
const chain = USE_LIVE ? null : mockProvider; // liveProvider when ready

const CAN_CAP = 10;
const PLAYER_SPEED = 175;
const PLAYER_W = 28;
const PLAYER_H = 36;

const canvas = document.getElementById('game');
const toastEl = document.getElementById('toast');
const hudCans = document.getElementById('hudCans');
const hudGear = document.getElementById('hudGear');
const hudByte = document.getElementById('hudByte');
const hudDrb = document.getElementById('hudDrb');
const barFuel = document.getElementById('barFuel');
const barCool = document.getElementById('barCool');
const barByte = document.getElementById('barByte');
const tankMeta = document.getElementById('tankMeta');
const walletChip = document.getElementById('walletChip');
const btnConnect = document.getElementById('btnConnect');
const btnDeposit = document.getElementById('btnDeposit');
const btnPump = document.getElementById('btnPump');
const btnByte = document.getElementById('btnByte');
const btnRepair = document.getElementById('btnRepair');
const btnDrive = document.getElementById('btnDrive');

const state = {
  time: 0,
  cans: spawnCanPositions(10),
  inventoryCans: 0, // HUD only — never calldata
  tankCans: 0, // deposited at SUV (local, unlocks pump UI)
  gear: 0,
  byte: 1,
  drbEarned: 0,
  player: { x: 640, y: 720, facing: 1, moving: false },
  dog: { x: BYTE_HOME.x, y: BYTE_HOME.y, offer: false },
  suvRepaired: false,
  driving: false,
  driveUntil: 0,
  nearSUV: false,
  nearByte: false,
  nearGate: false,
  busy: false,
};

let toastTimer = 0;

function toast(msg, kind = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3200);
}

async function refreshBalances() {
  if (!chain) return;
  state.gear = await chain.getGearBalance();
  state.byte = await chain.getByteBalance();
  state.drbEarned = await chain.getDrbEarned();
  updateHud();
}

function updateHud() {
  hudCans.textContent = `${state.inventoryCans}/${CAN_CAP}`;
  hudGear.textContent = String(state.gear);
  hudByte.textContent = String(state.byte);
  hudDrb.textContent = String(state.drbEarned);

  // Tank fuel bar: deposited cans toward a 10-can “batch” for pump UX
  const fuelPct = Math.min(100, (state.tankCans / CAN_CAP) * 100);
  barFuel.style.width = fuelPct + '%';

  const coolMs = chain ? chain.getFillCooldownRemainingMs() : 0;
  const coolPct = chain && chain.getFillCooldownRemainingMs() === 0
    ? 100
    : Math.max(0, 100 - (coolMs / 10000) * 100);
  barCool.style.width = coolPct + '%';

  const byteCd = chain ? chain.getByteClaimCooldownRemainingMs() : 0;
  const bytePct = byteCd === 0 ? 100 : Math.max(0, 100 - (byteCd / 60000) * 100);
  barByte.style.width = bytePct + '%';

  const tankReady = chain ? chain.isTankReady() : false;
  const escrow = chain && chain._debug ? chain._debug.getState().oilEscrowBalance : '—';
  const byteEsc = chain && chain._debug ? chain._debug.getState().byteEscrowGear : '—';
  tankMeta.textContent = tankReady
    ? `Tank READY · escrow ~${escrow} DRB · BYTE escrow ${byteEsc} GEAR`
    : `Cooldown ${Math.ceil(coolMs / 1000)}s · escrow ~${escrow} DRB · BYTE escrow ${byteEsc} GEAR`;

  // Buttons
  const near = state.nearSUV;
  btnDeposit.disabled = !(near && state.inventoryCans > 0);
  btnPump.disabled = !(near && state.tankCans > 0 && tankReady && !state.busy);
  btnPump.classList.toggle('hot', !btnPump.disabled);
  btnByte.disabled = !(state.nearByte && chain?.isConnected() && !state.busy);
  btnByte.classList.toggle('hot', state.nearByte && chain?.isConnected());
  btnRepair.disabled = !(near && state.gear >= 1 && !state.suvRepaired);
  btnDrive.disabled = !(near && state.suvRepaired && state.gear >= 1 && !state.driving);

  if (chain?.isConnected()) {
    walletChip.textContent = chain.getShortAddress();
    walletChip.classList.add('on');
    btnConnect.textContent = 'Mock Connected';
  } else {
    walletChip.textContent = 'No wallet';
    walletChip.classList.remove('on');
    btnConnect.textContent = 'Connect Mock Wallet';
  }
}

function collectCans() {
  const px = state.player.x;
  const py = state.player.y;
  for (const can of state.cans) {
    if (can.taken) continue;
    if (dist(px, py, can.x, can.y) < 28) {
      if (state.inventoryCans >= CAN_CAP) {
        toast('Cans full (10/10 HUD cap) — deposit at the SUV', 'warn');
        return;
      }
      can.taken = true;
      state.inventoryCans += 1;
      toast(`Picked up DRB can · ${state.inventoryCans}/${CAN_CAP}`, 'ok');
    }
  }
  // Respawn when few remain
  const left = state.cans.filter((c) => !c.taken).length;
  if (left <= 2) {
    for (const c of state.cans) {
      if (c.taken && Math.random() > 0.4) {
        c.taken = false;
        c.x = 200 + Math.random() * 1100;
        c.y = 420 + Math.random() * 480;
      }
    }
  }
}

function updateDog(dt) {
  // Gentle orbit near player when close, else home
  const px = state.player.x;
  const py = state.player.y;
  const d = dist(px, py, state.dog.x, state.dog.y);
  let tx = BYTE_HOME.x;
  let ty = BYTE_HOME.y;
  if (d < 220) {
    tx = px - 40;
    ty = py + 30;
  }
  state.dog.x += (tx - state.dog.x) * Math.min(1, dt * 1.8);
  state.dog.y += (ty - state.dog.y) * Math.min(1, dt * 1.8);
}

async function doConnect() {
  try {
    await chain.connect();
    await refreshBalances();
    toast('Mock wallet connected — Bankr will wire real Base contracts later', 'ok');
  } catch (e) {
    toast(String(e.message || e), 'warn');
  }
  updateHud();
}

async function doDeposit() {
  if (state.inventoryCans <= 0) return;
  const n = state.inventoryCans;
  state.tankCans = Math.min(CAN_CAP, state.tankCans + n);
  state.inventoryCans = 0;
  toast(`Deposited ${n} cans into SUV tank (HUD only — never calldata)`, 'ok');
  updateHud();
}

async function doPump() {
  if (state.busy) return;
  if (state.tankCans <= 0) {
    toast('Deposit cans first to unlock the pump UI (keepers skip this on-chain)', 'warn');
    return;
  }
  state.busy = true;
  updateHud();
  try {
    // cans stay local — fillOil has no amount / no cans arg
    const res = await chain.fillOil({ asKeeper: false });
    state.tankCans = Math.max(0, state.tankCans - 1);
    await refreshBalances();
    toast(
      `fillOil() mock · +${res.callerBounty} DRB bounty · ${res.toVault} DRB → Drop Vault`,
      'ok'
    );
  } catch (e) {
    if (e.code === 'CooldownActive') {
      toast(`Global tank cooldown — ${Math.ceil(e.timeRemaining / 1000)}s`, 'warn');
    } else {
      toast(String(e.message || e), 'warn');
    }
  }
  state.busy = false;
  updateHud();
}

async function doByteFetch() {
  if (state.busy) return;
  if (!chain.isConnected()) {
    toast('Connect mock wallet to claim BYTE fetch', 'warn');
    return;
  }
  state.busy = true;
  updateHud();
  try {
    const res = await chain.claimByteFetch();
    await refreshBalances();
    if (res.animationOnly) {
      toast('BYTE pockets empty — fetch animation only (no GEAR)', 'warn');
    } else {
      toast(`BYTE brought 1 GEAR · escrow left ${res.escrowRemaining}`, 'ok');
    }
  } catch (e) {
    if (e.code === 'ByteCooldown') {
      toast(`BYTE cooldown — ${Math.ceil(e.timeRemaining / 1000)}s`, 'warn');
    } else if (e.code === 'NeedDustByte') {
      toast('Need dust BYTE in wallet (BYTE.balanceOf > 0)', 'warn');
    } else {
      toast(String(e.message || e), 'warn');
    }
  }
  state.busy = false;
  updateHud();
}

function doRepair() {
  if (state.gear < 1) {
    toast('Need ≥1 GEAR to repair (read, not spend)', 'warn');
    return;
  }
  state.suvRepaired = true;
  toast('SUV repaired — GEAR held (not spent). Ready to drive.', 'ok');
  updateHud();
}

function doDrive() {
  if (state.gear < 1) {
    toast('Drive requires ≥1 GEAR (balance read)', 'warn');
    return;
  }
  if (!state.suvRepaired) {
    toast('Repair the SUV first', 'warn');
    return;
  }
  state.driving = true;
  state.driveUntil = state.time + 4000;
  toast('Cruise the street — Junkyard gate stays locked for beta', 'ok');
  // Snap player into SUV vibe
  state.player.x = SUV.x + SUV.w / 2;
  state.player.y = SUV.y + SUV.h / 2 + 40;
  updateHud();
}

function checkProximity() {
  const px = state.player.x + PLAYER_W / 2;
  const py = state.player.y + PLAYER_H / 2;
  state.nearSUV = dist(px, py, SUV.x + SUV.w / 2, SUV.y + SUV.h / 2) < SUV.interactR;
  state.nearByte = dist(px, py, state.dog.x, state.dog.y) < 55;
  state.nearGate = dist(px, py, GATE.x + GATE.w / 2, GATE.y + GATE.h / 2) < 70;
}

function update(dt) {
  state.time += dt * 1000;

  if (state.driving) {
    if (state.time >= state.driveUntil) {
      state.driving = false;
      toast('Parked. Junkyard progression deferred — gate locked.', '');
    } else {
      // Auto cruise along street
      state.player.x += 80 * dt;
      if (state.player.x > 1400) state.player.x = 200;
      state.player.moving = true;
    }
  } else {
    const mv = getMoveVector();
    state.player.moving = mv.x !== 0 || mv.y !== 0;
    if (mv.x !== 0) state.player.facing = mv.x < 0 ? -1 : 1;
    let nx = state.player.x + mv.x * PLAYER_SPEED * dt;
    let ny = state.player.y + mv.y * PLAYER_SPEED * dt;
    const resolved = resolveWalls(nx, ny, PLAYER_W, PLAYER_H);
    state.player.x = resolved.x;
    state.player.y = resolved.y;
  }

  updateDog(dt);
  collectCans();
  checkProximity();

  // Hotkeys
  if (consumeKey('e')) {
    if (state.nearGate) {
      toast('Junkyard locked — 500-door maze coming in a future update', 'warn');
    } else if (state.nearSUV) {
      if (state.inventoryCans > 0) doDeposit();
      else if (state.tankCans > 0) doPump();
      else toast('Walk over yellow DRB cans, then deposit here', '');
    }
  }
  if (consumeKey('f') && state.nearByte) doByteFetch();
  if (consumeKey('r') && state.nearSUV) {
    if (!state.suvRepaired) doRepair();
    else doDrive();
  }

  updateHud();
}

function frame(prev) {
  const now = performance.now();
  const dt = Math.min(0.05, (now - prev) / 1000);
  update(dt);

  const { w, h } = resizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const cam = cameraFor(w, h, state.player.x, state.player.y);
  drawWorld(ctx, w, h, cam, state);

  requestAnimationFrame(() => frame(now));
}

function bindUi() {
  btnConnect.addEventListener('click', doConnect);
  btnDeposit.addEventListener('click', doDeposit);
  btnPump.addEventListener('click', doPump);
  btnByte.addEventListener('click', doByteFetch);
  btnRepair.addEventListener('click', doRepair);
  btnDrive.addEventListener('click', doDrive);
  window.addEventListener('resize', () => resizeCanvas(canvas));
}

async function boot() {
  initInput(canvas);
  bindUi();
  // Auto-connect mock for frictionless arcade; still shows Connect control
  await chain.connect();
  await refreshBalances();
  toast('CAPs Garage BETA — cans HUD only · Junkyard deferred · Mock wallet', 'ok');
  updateHud();
  requestAnimationFrame((t) => frame(t));
}

boot();
