# CAPs Garage — Street Arcade BETA (500-Bay Yard)

Playable retro soft-isometric arcade beta for **CAPs Garage** on Base. This folder contains the live playable build featuring the full 500-bay garage yard, street → gate → parking-lot zoning, dirt service roads, parked blue SUV bay, teal-green road blockers, oil tank deposit pad, and the 3-second global cooldown gear vault.

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
- **Collision:** red truck AABB is blocked; walking character uses a narrower AABB and can squeeze along the road edge.
- Placed mid-corridor on the dirt road between these garage pairs:
  - `1 ↔ 101` (Road 0) — **extra dense choke** along this stretch so the red truck cannot freely cruise between bay 1 and 101
  - `110 ↔ 210`, `230 ↔ 330`, `344 ↔ 444`, `262 ↔ 362`
  - `63 ↔ 163`, `84 ↔ 184`, `395 ↔ 495`, `100 ↔ 200`, `400 ↔ 300`

### 7. Community Oil Tank & Truck Deposit Pad
- Giant industrial tank at the eastern end of the yard.
- Concrete deposit pad with hazard chevrons.
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
2. Hop out (toggle truck) and **walk the edge** past a teal SUV — then remount and confirm the **red truck cannot** push through.
3. Heaviest choke: dirt road between rows 0–1 from **bay 1 → bay 101** (and the whole Road 0 stretch).
4. Other pair blockers: warp near Bay #42 then cruise east/west on Roads 0–3 to hit `63/163`, `84/184`, `110/210`, `230/330`, etc.

---

## Smart Contracts

1. **`GearVault.sol`**: Manages GEAR tools with 3-second global cooldown (`GLOBAL_COOLDOWN = 3 seconds`) and per-wallet cooldown.
2. **`ByteFetchEscrow.sol`**: Dispenses GEAR to BYTE holders with 3s global cooldown and 60s per-wallet cooldown.
3. **`OilEscrow.sol`**: Public zero-argument `fillOil()` keeper tap with 10s cooldown and 90/10 split.
4. **`DropVault.sol`**: Community pull-claim vault with 3 lifecycle windows (holder, scavenger, dust sweep).
5. **`GateRegistry.sol`**: Dynamic admin NFT gatekeeping registry.
