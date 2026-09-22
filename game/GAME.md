# CAPs Garage — Street Arcade BETA (500-Bay Yard)

Playable retro soft-isometric arcade beta for **CAPs Garage** on Base. This folder contains the live playable build featuring the full 500-bay garage yard, street → gate → parking-lot zoning, dirt service roads, parked blue SUV bay, teal-green road blockers (drive-block / walk-squeeze), fenced oil tank yard + deposit pad, and the 3-second global cooldown gear vault.

Live repo: [CAPSTILLER/drag](https://github.com/CAPSTILLER/drag) · Live app: [caps-garage](https://bankr.bot/apps/caps-garage)

Primary playable: **`game/index.html`** (single-file canvas arcade).

---

## What's in the Beta

### 1. Street vs Parking Lot Zoning
- **STREET** — asphalt with yellow dashed center line and curbs **west of the gate** (outside the yard).
- **PARKING LOT** — asphalt with white stall markings **inside the yard after the gate**.
- Dirt service roads still separate garage rows inside the lot (tire ruts, dust).
- Soft-isometric gate marks the STREET ↔ LOT threshold.

### 2. Stronger 2.5D Look
- Extruded height faces + soft drop shadows on garages, SUVs, oil cans, gate posts, and the red truck.
- Canvas soft-isometric / extruded boxes — not a Three.js rewrite.

### 3. 500-Bay Garage Yard (5 Rows × 100 Garages)
- Rows: `#1–100`, `#101–200`, `#201–300`, `#301–400`, `#401–500`.
- Corrugated roll-up doors with bay number plates; Bay **#42** door stays open for the blue SUV.
- Viewport culling for mobile/desktop performance.
- Doors are **not** auto-opened for red-SUV passage yet (playtest which doors should open later).

### 4. Dedicated Dirt Roads
- 5 dirt roads separating the rows (72px wide vs 44px SUV comfort clearance).
- Connecting avenues at the west gate entrance and eastern terminus.

### 5. Parked Blue SUV in Bay #42
- Nose peeks out ~5px into the doorway threshold; zero dirt-road overlap for free cruise past the bay.
- Inspect (E): exactly **`Not broke, just unused...`**

### 6. Teal-Green Road Blockers (Broke-Down SUVs)
- Color: blue-green / teal-green (distinct from blue bay SUV and red player truck).
- Inspect (E): exactly **`broke down, dont even try...`**
- **Collision:** red truck uses a near-full body AABB and is **hard-blocked**; walking character uses a narrow AABB and can squeeze the **south road edge**. Cap rule: block drive, allow walk.
- **Allowlist only** (10 blockers — one mid-corridor SUV per pair; no Road-0 choke wall / no extras):
  - `1 ↔ 101`, `110 ↔ 210`, `230 ↔ 330`, `344 ↔ 444`, `262 ↔ 362`
  - `63 ↔ 163`, `84 ↔ 184`, `395 ↔ 495`, `100 ↔ 200`, `400 ↔ 300`

### 7. Community Oil Tank & Truck Deposit Pad (Fenced Yard)
- Giant industrial tank at the eastern end of the yard inside a **chain-link / rusty fence** compound.
- Concrete deposit pad with hazard chevrons (inside the compound).
- **Fence collision:** impassable for **both** the red truck and the walking character. West/north/south walls seal parking-lot approaches (no lot-edge gaps). East wall has a single gate entrance — loop around to enter; do not enter from the lot.
- **Automatic Deposit:** drive the truck onto the pad to unload cans, pump into the community tank, award DRB, expand Drop Vault pool.

### 8. 3-Second Global Cooldown on Gear Vault
- Smart contract: `contracts/GearVault.sol` (`GLOBAL_COOLDOWN = 3 seconds`).
- Escrow check: `contracts/ByteFetchEscrow.sol` enforced at 3.0s.
- Game HUD & test rig: live telemetry and cooldown countdown for tool claims.

---

## Controls

| Input | Action |
|-------|--------|
| **WASD / Arrow keys** | Steer truck / walk driver |
| **Drive over yellow cans** | Pick up oil cans (inventory cap 10) |
| **Drive onto Oil Tank Pad** | Auto-deposit cans into community tank & earn DRB |
| **E / Space** | Proximity action (inspect Blue / teal SUVs, toggle truck, claim tools) |
| **Test Rig Buttons** | Instant can packing, 3s gear vault claim, pad warp, blue SUV warp |
| **Mobile Touch** | On-screen D-Pad and Action button |

---

## Playtest Tips (Chokepoints)

1. Start on the **STREET**, drive east through the **GATE** into the **PARKING LOT**.
2. Hop out (toggle truck) and **walk the south edge** past a teal SUV — then remount and confirm the **red truck cannot** push through.
3. Cap allowlist choke: corridor between **bay 1 ↔ 101** (one clear pair, not a wall).
4. Other pair blockers: `110/210`, `230/330`, `344/444`, `262/362`, `63/163`, `84/184`, `395/495`, `100/200`, `400/300`.
5. Oil tank yard is fenced — confirm neither truck nor walker can enter from the parking lot; use the **east gate** (or warp) for the deposit pad.

---

## Smart Contracts

1. **`GearVault.sol`**: Manages GEAR tools with 3-second global cooldown (`GLOBAL_COOLDOWN = 3 seconds`) and per-wallet cooldown.
2. **`ByteFetchEscrow.sol`**: Dispenses GEAR to BYTE holders with 3s global cooldown and 60s per-wallet cooldown.
3. **`OilEscrow.sol`**: Public zero-argument `fillOil()` keeper tap with 10s cooldown and 90/10 split.
4. **`DropVault.sol`**: Community pull-claim vault with 3 lifecycle windows (holder, scavenger, dust sweep).
5. **`GateRegistry.sol`**: Dynamic admin NFT gatekeeping registry.
