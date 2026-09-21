# CAPs Garage — Street Arcade BETA

Soft isometric / 2.5D street arcade for **CAPs Garage** on Base. Canvas projects the street with a slight angled pull-back (not pure top-down, not a full 3D engine). This folder is a static playable build; the repo root `index.html` remains the architecture **blueprint dossier**.

Concept north star: `assets/concept-caps-garage.jpg` (also at repo root).

**Live chain status:** Mock wallet only. Bankr live Base (8453) wiring lives in `js/chain/liveProvider.js` stubs — **not** flipped on `main` (`USE_LIVE = false`). Sepolia / mainnet claim flows are **not** wired yet.

---

## How to play (local)

```bash
# from repo root — any static server (ES modules need http:// not file://)
npx --yes serve .
# open http://localhost:3000/game/
```

Or open the Vercel deployment with root directory set to `game/` (arcade) or keep root as the dossier and visit `/game/`.

**Controls**

| Input | Action |
|--------|--------|
| WASD / Arrow keys | Move CAP |
| Walk over yellow **DRB** cans | Pick up (HUD inventory, cap **10**) |
| **E** near red SUV | Deposit cans, or pump `fillOil` if tank has cans |
| **F** near **BYTE** the dog | Claim mock BYTE fetch |
| **R** near SUV | Repair (needs ≥1 GEAR) / Drive |
| Touch-drag on canvas | Virtual stick (mobile) |
| Header buttons | Same actions without hotkeys |

**Loop**

1. Roam the street, collect up to **10 cans** (local HUD only).
2. Deposit at the red SUV → unlocks the in-game **Pump** button.
3. **Pump fillOil** → mock public call: global ~10s cooldown, fixed **1 DRB** caller bounty, rest to Drop Vault. Cans never enter calldata.
4. Meet **BYTE** → connect mock wallet → claim **1 GEAR / 60s** until escrow empty; empty = animation only.
5. Hold ≥1 **GEAR** (read, not spend) → **Repair** then **Drive** the SUV.
6. Chain-link **Junkyard gate** is locked: *coming in update* (500-door maze **not** shipped in beta).

---

## Canonical Lock (beta — do not invent)

- **Cans HUD only**, cap 10, never calldata.
- **`fillOil()` public**, no amount, global ~10s cooldown, fixed 1 DRB bounty, rest vault; keepers allowed; no per-wallet fill cooldown in beta.
- **BYTE dust** → 1 GEAR / 60s player-signed until escrow empty; empty = animation only.
- **Drive ≥1 GEAR** (balance read, not spend).
- **Junkyard progression deferred** — locked gate UI only.

Full lock + contracts: root [README.md](../README.md) and dossier [index.html](../index.html).

---

## Mock vs future wire

| Layer | Now (BETA) | Later (Bankr) |
|--------|------------|----------------|
| Wallet | `js/chain/mockProvider.js` auto-connects a fake address | Real wallet on Base 8453 |
| `fillOil` | Local cooldown + mock bounty | `OilEscrow.fillOil()` — **no args** |
| BYTE fetch | Mock escrow GEAR + 60s CD | BYTE Fetch Escrow `claimTool` (confirm name) |
| Balances | In-memory GEAR / BYTE / DRB | ERC-20 `balanceOf` reads |
| Live stub | `js/chain/liveProvider.js` TODO hooks | Set `USE_LIVE = true` in `main.js` |

Cans stay client-side forever for the pump UX. Keepers may call the same on-chain `fillOil()` with zero cans.

---

## Junkyard deferred

The fence gate shows **LOCKED — COMING IN UPDATE**. Do not expect an enterable 500-door maze in this beta. Drive still works on the street when you hold GEAR; gate access (100 GEAR read) is future content.

---

## Deploy notes

- **Arcade only:** point Vercel Root Directory to `game/`.
- **Dossier + game:** keep Vercel root at repo root; dossier at `/`, game at `/game/`.
- Do not commit `node_modules/` or `.vercel/`.

Gear home footer → [https://landonthis.gearup.wtf](https://landonthis.gearup.wtf)
