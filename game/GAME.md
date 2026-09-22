# CAPs Garage — Street Arcade BETA (500-Bay Yard)

Playable retro top-down arcade beta for **CAPs Garage** on Base. This folder contains the live playable build featuring the full 500-bay garage yard, dirt roads, parked blue SUV bay, oil tank deposit pad, and the 3-second global cooldown gear vault.

Live repo: [CAPSTILLER/drag](https://github.com/CAPSTILLER/drag) · Live app: [caps-garage](https://bankr.bot/apps/caps-garage)

---

## What's in the Beta

### 1. 500-Bay Garage Yard (5 Rows x 100 Garages)
- 5 horizontal rows of 100 garages each (bays #1 to #500).
- Corrugated metal roll-up doors with live bay number plates.
- Viewport culling keeps performance butter-smooth across mobile and desktop.

### 2. Dedicated Dirt Roads
- 5 dirt roads separating the rows, calibrated at 72px wide to be comfortably wider than the 44px SUV.
- Open driving lanes with tire ruts, dust trails, and zero road collision obstacles.
- Connecting avenues at the west gate entrance and eastern terminus.

### 3. Parked Blue SUV in Bay #42
- Parked securely inside Garage Bay #42 in Row 1.
- Front bumper peeks out ~5px into the doorway threshold lip.
- Zero collision overlap with the dirt road driving lane — the red truck can cruise past without hitting it.

### 4. Community Oil Tank & Truck Deposit Pad
- Giant industrial cylindrical storage tank located at the eastern end of the garage yard.
- High-visibility concrete deposit pad directly in front of the tank with animated hazard chevron borders.
- **Automatic Deposit:** Driving the truck onto the pad unloads collected oil cans, pumps them into the community oil tank, awards DRB caller bounty, expands the Drop Vault pool, and fires hydraulic fanfare audio and particles.

### 5. 3-Second Global Cooldown on Gear Vault
- Smart contract: `contracts/GearVault.sol` (`GLOBAL_COOLDOWN = 3 seconds`).
- Escrow check: `contracts/ByteFetchEscrow.sol` enforced at 3.0s.
- Game HUD & test rig: Live telemetry and cooldown countdown for tool claims.

---

## Controls

| Input | Action |
|-------|--------|
| **WASD / Arrow keys** | Steer truck / walk driver |
| **Drive over yellow cans** | Pick up oil cans (inventory cap 10) |
| **Drive onto Oil Tank Pad** | Auto-deposit cans into community tank & earn DRB |
| **E / Space** | Proximity action (inspect Blue SUV, toggle truck, claim tools) |
| **Test Rig Buttons** | Instant can packing, 3s gear vault claim, pad warp, blue SUV warp |
| **Mobile Touch** | On-screen D-Pad and Action button |

---

## Smart Contracts

1. **`GearVault.sol`**: Manages GEAR tools with 3-second global cooldown (`GLOBAL_COOLDOWN = 3 seconds`) and per-wallet cooldown.
2. **`ByteFetchEscrow.sol`**: Dispenses GEAR to BYTE holders with 3s global cooldown and 60s per-wallet cooldown.
3. **`OilEscrow.sol`**: Public zero-argument `fillOil()` keeper tap with 10s cooldown and 90/10 split.
4. **`DropVault.sol`**: Community pull-claim vault with 3 lifecycle windows (holder, scavenger, dust sweep).
5. **`GateRegistry.sol`**: Dynamic admin NFT gatekeeping registry.
