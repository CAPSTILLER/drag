# CAPs Garage — Street Arcade BETA (500-Bay Yard)

Playable retro soft-isometric arcade beta for **CAPs Garage** on Base. This folder contains the live playable build featuring the full 500-bay garage yard, **gear-toggled bay doors**, **fence-jump ramps** to top street, **touch-on-sprite drive**, street → gate-only → parking-lot zoning, bottom garage wall + south E–W street, dirt service roads, parked blue SUV bay, teal-green road blockers (10 corridor allowlist + bay-500 pile right of 500), yard-edge right-side dead-zone fence, fenced oil tank yard + deposit pad, and the 3-second global cooldown gear vault.

Live repo: [CAPSTILLER/drag](https://github.com/CAPSTILLER/drag) · Live app: [caps-garage](https://bankr.bot/apps/caps-garage)

Primary playable: **`game/index.html`** (single-file canvas arcade).

---

## What's in the Beta

### 1. Street vs Parking Lot Zoning
- **STREET (west)** — asphalt with yellow dashed center line and curbs **west of the gate** (outside the yard).
- **STREET (south)** — same asphalt / yellow dashes / curb language along the **bottom** of the garage yard (south of the bottom wall). Not dirt, not empty void.
- **STREET (top / north)** — asphalt band **north of the north yard fence**. Reachable by **ramp fence-jump** in the red SUV (not by walking through the fence).
- **PARKING LOT** — asphalt with white stall markings **inside the yard after the gate** (north apron + mid yard). South margin is street, not lot stalls.
- Dirt service roads still separate garage rows inside the lot (tire ruts, dust).
- Soft-isometric gate marks the west STREET ↔ LOT threshold.
- **West front walls** — solid wall/fence on the yard’s west face **north and south of the gate**. Drive/walk cannot slip into the parking lot from the west STREET except through the **GATE** opening (Road 1 band).
- **Bottom garage wall** — solid visual barrier the **full garage length** between the southernmost bay-row dirt road (Road 4 under bays 401–500) and the parking-lot / south-street strip. Collision blocks **truck and walk**.
- **North yard fence** — seals the yard/lot from the top street. Solid for truck and walk; jump over via ramps only.

### 2. Stronger 2.5D Look
- Extruded height faces + soft drop shadows on garages, SUVs, oil cans, gate posts, ramps, and the red truck.
- Canvas soft-isometric / extruded boxes — not a Three.js rewrite.

### 3. 500-Bay Garage Yard + Gear Door Mechanic
- Rows: `#1–100`, `#101–200`, `#201–300`, `#301–400`, `#401–500`.
- Corrugated roll-up doors with bay number plates.
- **All 500 doors start CLOSED** (including #42). No auto-open; Cap opens/closes them with GEAR.
- **Gear door interact (walk only):**
  1. Hop out of the red SUV (`inTruck === false`).
  2. Walk up to a bay’s south door lip.
  3. Press **E / Space** (or mobile ACTION) while the prompt shows Open/Close.
  4. Costs **1 held GEAR** per successful toggle.
  5. If no GEAR: toast that a gear is needed; door unchanged.
  6. While **in the truck**, interact does **not** spend GEAR or toggle doors (prompt nudges Cap to hop out).
- **Open door:** red SUV **and** walk can pass through that bay corridor.
- **Closed door:** solid wall for truck and walk.
- Open/closed tracked per bay 1–500 for the session (reload resets closed).
- Starting held GEAR: **5** (playtest). More from **Gear Vault** claim (3s global cooldown) / test rig.

### 4. Dedicated Dirt Roads
- 5 dirt roads separating the rows (72px wide vs 44px SUV comfort clearance).
- Numbering: **Road 0** under bays 1–100, **Road 1** under 101–200, … **Road 4** under 401–500.
- Connecting avenues at the west gate entrance and eastern terminus.

### 5. Fence-Jump Ramps (Truck Only)
- Visible wedge ramps; collision trigger for truck; walk can stand on them without launching.
- **A) Yard-right ramp** — right side of the yard near east / before the right fence (`rightSealX - 78`, north apron). Driving the red SUV over it jumps **north over the north fence** onto **TOP STREET**.
- **B) Road-1 east ramp** — east end of **Road 1** (second E–W dirt corridor). Same fence jump onto TOP STREET.
- Short arc animation (~0.55s) then land on the top street band.

### 6. Parked Blue SUV in Bay #42
- Nose peeks out ~5px into the doorway threshold; zero dirt-road overlap for free cruise past the bay.
- Door **#42 starts closed** like every other bay (gear-open for passage). Blue SUV stays visible/inspectable from the road.
- Inspect (E): exactly **`Not broke, just unused...`**

### 7. Teal-Green Road Blockers (Broke-Down SUVs)
- Color: blue-green / teal-green (distinct from blue bay SUV and red player truck).
- Inspect (E): exactly **`broke down, dont even try...`**
- **Collision:** red truck uses a near-full body AABB and is **hard-blocked**; walking character uses a narrow AABB and can squeeze a **thin south edge** when Cap expects it. Cap rule: block drive, allow walk.
- **Corridor allowlist** (10 blockers — one mid-corridor SUV per pair; no Road-0 choke wall):
  - `1 ↔ 101`, `110 ↔ 210`, `230 ↔ 330`, `344 ↔ 444`, `262 ↔ 362`
  - `63 ↔ 163`, `84 ↔ 184`, `395 ↔ 495`, `100 ↔ 200`, `400 ↔ 300`
- **Bay #500 pile (extra):** exactly **8** piled teal SUVs sitting **just to the right of bay 500** (south approach between bay/road and bottom wall). Bay 500 door/approach stays accessible; pile still clogs the bottom approach toward the street/wall. Same inspect copy + truck-block / walk-squeeze rules. These 8 are **in addition to** the 10 corridor allowlist.

### 8. Community Oil Tank & Truck Deposit Pad (Fenced Yard)
- Giant industrial tank at the eastern end of the yard inside a **chain-link / rusty fence** compound.
- Concrete deposit pad with hazard chevrons (inside the compound).
- **Fence collision:** impassable for **both** the red truck and the walking character. West/north/south walls seal parking-lot approaches (no lot-edge gaps). East wall has a single gate entrance — east gate OK; do not enter from the lot.
- **Right-side dead-zone fence:** chain-link/rusty mirrors the **top yard edge** on the bottom — runs from the **end of the south wall** along the **yard** perimeter out to the end of the right side (flush with the oil-yard west line). **Does not cross the bottom street**; south asphalt stays drivable/walkable. Seals the restricted east pocket from the **lot/yard** side. Solid for truck and walk.
- **Automatic Deposit:** drive the truck onto the pad to unload cans, pump into the community tank, award DRB, expand Drop Vault pool.

### 9. 3-Second Global Cooldown on Gear Vault
- Smart contract: `contracts/GearVault.sol` (`GLOBAL_COOLDOWN = 3 seconds`).
- Escrow check: `contracts/ByteFetchEscrow.sol` enforced at 3.0s.
- Game HUD & test rig: live telemetry and cooldown countdown for tool claims.
- Vault claim still grants **+1 GEAR** into the held-gear backpack used by bay doors.

---

## Controls

| Input | Action |
|-------|--------|
| **WASD / Arrow keys** | Steer truck / walk driver (PC) |
| **Touch-drag on truck / walker** | Mobile drive: hold the sprite, drag **along facing** = forward, **behind** = reverse at **1/4** speed, **off-center** = steer while thrusting |
| **Release touch** | Stop thrust |
| **Drive over yellow cans** | Pick up oil cans (inventory cap 10) |
| **Drive onto Oil Tank Pad** | Auto-deposit cans into community tank & earn DRB |
| **Drive onto ramp (truck)** | Fence-jump to TOP STREET |
| **E / Space** (walk at door) | Open/Close bay door (−1 GEAR) |
| **E / Space** (near SUVs) | Inspect Blue / teal SUVs |
| **Test Rig Buttons** | Instant can packing, 3s gear vault claim, pad warp, blue SUV warp, hop in/out |
| **Mobile ACTION button** | Same as E (D-pad / arrow overlay **removed**) |

---

## Playtest Tips (Chokepoints)

1. Start on the west **STREET**, drive east **only through the GATE** into the **PARKING LOT** — west front walls north/south of the gate block slip-ins.
2. Drive south to **Road 4** (under bays 401–500): confirm the **bottom wall** blocks truck and walk from dropping into the south street; the band below the wall should read as **STREET** (asphalt + yellow dashes + curbs).
3. At **bay #500**, confirm the **pile of 8 teal SUVs** sits **just to the right** of the bay (door/approach usable) while still clogging the bottom approach — truck hard-blocked; walk may find a thin squeeze; inspect still `broke down, dont even try...`.
4. Hop out and **walk the south edge** past a corridor teal SUV — then remount and confirm the **red truck cannot** push through.
5. Cap allowlist choke: corridor between **bay 1 ↔ 101** (one clear pair, not a wall). Other pairs: `110/210`, `230/330`, `344/444`, `262/362`, `63/163`, `84/184`, `395/495`, `100/200`, `400/300`.
6. **Right-side fence** + oil yard: fence follows the **yard** south edge (not across bottom street). Confirm lot/yard cannot enter the east restricted zone; oil **east gate** (or warp) for the deposit pad. South street remains clear along the asphalt.
7. **Gear doors:** start with 5 GEAR. Hop out, walk to any bay door, E to open (−1 GEAR), remount, drive through. In-truck E at a door must **not** spend GEAR. Claim vault for more GEAR.
8. **Ramps:** drive truck onto yard-right ramp or Road-1 east ramp → land on TOP STREET north of the north fence.
9. **Mobile:** no arrow overlay; touch-hold the truck/walker and drag relative to facing.

---

## Smart Contracts

1. **`GearVault.sol`**: Manages GEAR tools with 3-second global cooldown (`GLOBAL_COOLDOWN = 3 seconds`) and per-wallet cooldown.
2. **`ByteFetchEscrow.sol`**: Dispenses GEAR to BYTE holders with 3s global cooldown and 60s per-wallet cooldown.
3. **`OilEscrow.sol`**: Public zero-argument `fillOil()` keeper tap with 10s cooldown and 90/10 split.
4. **`DropVault.sol`**: Community pull-claim vault with 3 lifecycle windows (holder, scavenger, dust sweep).
5. **`GateRegistry.sol`**: Dynamic admin NFT gatekeeping registry.
