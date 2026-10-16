// Server-side verifier prototype: node game/test/verify-session.mjs session.json
// Replays seed + input log headlessly and checks the claimed hash + ledger.
import { readFileSync } from 'fs';
import { loadGarage } from './harness.mjs';
const ex = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const G = loadGarage('?seed=' + ex.seed);
const r = G.replay(ex.seed, ex.log, ex.ticks, ex.seedLabel, ex.levels);
const ok = r.hash === ex.hash && r.banked.gear === ex.banked.gear;
console.log(JSON.stringify({ ok, claimed: ex.hash, replayed: r.hash, banked: r.banked, pending: r.pending, repairs: r.repairs.length, rigUses: r.rigUses }));
process.exit(ok ? 0 : 1);
