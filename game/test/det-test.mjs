// Determinism + rules test: node game/test/det-test.mjs
import { loadGarage } from './harness.mjs';
const G = loadGarage('?seed=cap-test-1');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// 1) Door table counts
const cnt = {};
G.garages.forEach(g => { const k = g.content.kind === 'prize' ? 'p' + g.content.amt : g.content.kind === 'trap' ? g.content.trap : 'empty'; cnt[k] = (cnt[k] || 0) + 1; });
ok(cnt.p2 === 100 && cnt.p5 === 50 && cnt.p10 === 25 && cnt.p25 === 5 && cnt.p100 === 1 && cnt.spill === 40 && cnt.drop === 40 && cnt.block === 20 && cnt.empty === 219, 'door table ' + JSON.stringify(cnt));
ok(G.poles.length === 50, '50 poles; off at start = ' + G.poles.filter(p => !p.on).length);

{ const b = G.builtinLevels(); G.applyLevels(b.yardMaze, b.garage);
  ok(G.routeCheck(G.mazeStart, G.mazeGoal, true), 'WRECK MAZE level: SUV ramp landing -> oil pad solvable');
  G.applyLevels(b.yard, b.garage); G.resetSim(G.det.seed, G.det.seedLabel); }
// 2) Maze solvable for SUV (ramp landing -> pad), also on several seeds (layout is fixed)
ok(G.routeCheck(G.mazeStart, G.mazeGoal, true), 'SUV route ramp landing -> oil pad solvable');
ok(G.routeCheck(G.mazeGoal, { x: G.ramps[1].x + 28, y: G.ramps[1].y + 30 }, true), 'SUV route pad -> north ramp (exit) solvable');

ok(G.routeCheck({ x: G.player.x, y: G.player.y }, { x: G.ramps[0].x + 29, y: G.ramps[0].y + 24 }, false), 'walker route spawn -> #100 ramp (hop in there) solvable');
// 3) Live bot run, then replay its exported log => same hash
const S = G.state, P = G.player, L = () => G.det.led;
const step = (n) => G.tick(n);
step(10); for (let i = 0; i < 10; i++) { G.queueAct('vault'); step(200); } G.queueAct('truck'); step(2);              // hop out (walk)
const walkTo = (x, max = 2000) => { S.keys.right = P.x < x; S.keys.left = P.x > x; let i = 0; while (Math.abs(P.x - x) > 3 && i++ < max) step(1); S.keys.right = S.keys.left = false; };
const doors = [];
for (const bay of [401, 402, 403, 404, 405, 406, 407, 408, 409, 410]) {
  const g = G.garages[bay - 1]; walkTo(g.x + g.w / 2); step(1); G.queueAct('act'); step(2); doors.push(bay + ':' + (g.content.kind) + (g.content.amt || g.content.trap || ''));
}
const pole = G.poles.find(p => p.id === 41);
walkTo(pole.x); let w = 0; while (L().stash < 1 && w++ < 2000) step(1);
const wasOn = pole.on; step(2); G.queueAct('act'); step(3);
ok(wasOn || (pole.on && L().repairs.length === 1), 'pole L41 repair with BYTE gear (wasOn=' + wasOn + ')');
G.queueAct('truck'); step(2);
S.keys.right = true; step(200); S.keys.right = false;     // drive & pick cans on road 4? (cans are roads 0-3)
G.queueAct('warp_pad'); step(5);                           // rig warp to bank
const live = G.sessionExport();
console.log('doors', doors.join(' '), '| ledger', JSON.stringify({ pend: live.pending, bank: live.banked, lost: live.lost, rep: live.repairs }));
const r1 = G.replay(live.seed, live.log, live.ticks, live.seedLabel);
const r2 = G.replay(live.seed, live.log, live.ticks, live.seedLabel);
ok(r1.hash === live.hash && r2.hash === live.hash, `live hash ${live.hash} == replay ${r1.hash} == ${r2.hash}`);
const r3 = G.replay((live.seed + 1) >>> 0, live.log, live.ticks);
ok(r3.hash !== live.hash, 'different seed -> different hash ' + r3.hash);
// 4) Trap wipes pending before bank
G.replay(live.seed, [], 1); const g = G.garages.find(x => x.content.kind === 'trap' && x.content.trap === 'drop');
L().pendingGear = 7; L().stash = 2; S.inTruck = false; P.x = g.x + g.w / 2; P.y = g.y + g.h + 30; S.gear = 3;
step(1); G.queueAct('act'); step(1);
ok(L().pendingGear === 0 && L().stash === 0 && L().lostGear === 9, 'drop trap wiped pending (lost ' + L().lostGear + ')');
// 5) Level hashes are part of the replay hash (per area)
{
  const b = G.builtinLevels();
  const base = G.replay(live.seed, live.log, live.ticks, live.seedLabel, { yard: b.yard, garage: b.garage }).hash;
  ok(base === live.hash, 'builtin levels replay == live');
  const y2 = JSON.parse(JSON.stringify(b.yard)); y2.crates.push({ x: 6700, y: 200, z: 0 });
  const h2 = G.replay(live.seed, live.log, live.ticks, live.seedLabel, { yard: y2, garage: b.garage }).hash;
  ok(h2 !== base, 'edited YARD level -> different hash');
  const g2 = JSON.parse(JSON.stringify(b.garage)); g2.gears.push({ x: 900, y: 300 });
  const h3 = G.replay(live.seed, live.log, live.ticks, live.seedLabel, { yard: b.yard, garage: g2 }).hash;
  ok(h3 !== base && h3 !== h2, 'edited GARAGE level -> different hash');
  G.applyLevels(b.yard, b.garage);
}
// 6) BYTE only in yard/garage area: stand on the west street for 30s
G.replay(123, [], 1); for (let i = 0; i < 1800; i++) G.tick(1);
ok(L().stash === 0 && !G.byte.carrying, 'BYTE gives nothing while player is on the street');
// 7) Doors open from the back (north) side
G.replay(5, [], 1); { const g = G.garages[150]; S.inTruck = false; S.gear = 2; P.x = g.x + g.w / 2; P.y = g.y - 20; step(1); G.queueAct('act'); step(1); ok(g.doorOpen, 'bay #' + g.id + ' opened from the north side'); }
// 8) A newly placed ramp launches the SUV
{
  const b = G.builtinLevels(); const g2 = JSON.parse(JSON.stringify(b.garage));
  g2.ramps.push({ x: 1500, y: G.garages[300].y + 64 + 36, rot: 0, d: 200 });
  G.replay(9, [], 1, '9', { yard: b.yard, garage: g2 });
  S.inTruck = true; P.x = 1400; P.y = g2.ramps.at(-1).y; S.keys.right = true; let jumped = false;
  for (let i = 0; i < 60; i++) { step(1); if (P.jump) jumped = true; } S.keys.right = false;
  ok(jumped && P.x > 1650, 'placed ramp launched the SUV (x=' + Math.round(P.x) + ')');
}
// 9) Crate bridge: drive UNDER at ground level, ramp ON TOP to the deck, drive across, drop off
{
  const b = G.builtinLevels();
  G.replay(11, [], 1, '11', { yard: b.yardBridges, garage: b.garage });
  S.inTruck = true; P.x = 6520; P.y = 440; P.pz = 0; S.keys.down = true; step(50); S.keys.down = false;
  ok(P.y > 620 && P.pz === 0, 'drove UNDER the crate bridge at ground level (y=' + Math.round(P.y) + ')');
  P.x = 6490; P.y = 560; S.keys.right = true; step(20); S.keys.right = false;
  ok(P.x < 6560 && P.x > 6500, 'ground SUV blocked by the bridge pillar (x=' + Math.round(P.x) + ')');
  P.x = 6320; P.y = 560; P.pz = 0; S.keys.right = true; let maxPz = 0, onTopX = 0;
  for (let i = 0; i < 90; i++) { step(1); if (P.pz > maxPz) maxPz = P.pz; if (P.pz === 2) onTopX = P.x; }
  S.keys.right = false;
  ok(maxPz === 2 && onTopX > 6560, 'ramp launched SUV onto the deck (level ' + maxPz + ') and it drove across');
  ok(P.pz === 0 && P.x > 6650, 'drove off the deck end and dropped to ground (x=' + Math.round(P.x) + ', pz=' + P.pz + ')');
}
process.exit(fail ? 1 : 0);
