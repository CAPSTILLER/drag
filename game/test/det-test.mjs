// Determinism + rules test: node game/test/det-test.mjs
import { loadGarage } from './harness.mjs';
const G = loadGarage('?seed=cap-test-1');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// 1) Door table counts
const cnt = {};
G.garages.forEach(g => { const k = g.content.kind === 'prize' ? 'p' + g.content.amt : g.content.kind === 'trap' ? g.content.trap : 'empty'; cnt[k] = (cnt[k] || 0) + 1; });
ok(cnt.p2 === 100 && cnt.p5 === 50 && cnt.p10 === 25 && cnt.p25 === 5 && cnt.p100 === 1 && cnt.spill === 40 && cnt.drop === 40 && cnt.block === 20 && cnt.empty === 219, 'door table ' + JSON.stringify(cnt));
ok(G.poles.length === 50, '50 poles; off at start = ' + G.poles.filter(p => !p.on).length);

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
process.exit(fail ? 1 : 0);
