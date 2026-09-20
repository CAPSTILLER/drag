# CAPs Garage — Master Blueprint Dossier

Interactive architecture dossier, game economy flywheel, smart contract specifications, and multi-perspective pitch deck for **CAPs Garage** on Base (Chain ID: 8453).

Live app file: `index.html` (runnable in any browser with zero backend requirements).

---

## Overview

CAPs Garage is a top-down retro arcade street experience and non-custodial airdrop distribution system built on Base. 

It connects three core utility tokens without inflating supply or printing new tokens:
- **$DRB (Oil / Fuel)**: Community-funded reward pool dropped into the community vault.
- **$BYTE (The Dog)**: Holding &ge; 50 $BYTE unlocks 1 $GEAR every 60s via the dog fetch escrow, capped at 60 GEAR per wallet per day.
- **$GEAR (Tools & Access Keys)**: Required to repair/drive the red SUV, unlock the 500-garage Junkyard labyrinth (100 GEAR), and scavenge abandoned airdrop rewards (1,000 GEAR).

---

## Core Smart Contracts

1. **Gate Registry (`isUserAuthorized`)**
   - Access Key: DebtReliefFam NFT #1793 on Base (`0xc659c002f06f980f2caa577748504e9be7f26146`).
   - Registers partner NFT collections using explicit ID ranges: `(collection, startId, endId)`.
   - Total eligible count calculated on-chain via `sum(endId - startId + 1)` with no unbounded gas loops.

2. **Oil Escrow (`fillOil`)**
   - Holds community-deposited $DRB fuel.
   - Dispenses fixed `packetSize` per `cooldownSeconds` into the Drop Vault.
   - Dual cooldown: 10-minute per-wallet throttle + 10-second global tank throttle.
   - 10% Caller Bounty / Split: 9 DRB to community Drop Vault, 1 DRB directly to caller (`msg.sender`). MEV/keeper bots can act as automated gas slaves to keep the tank pumping.

3. **Drop Vault (Pull-Claim & Scavenger Arena)**
   - Takes real-time snapshot of active collections from Gate Registry.
   - **Days 0–7**: 100% claimed by registered NFT token holders.
   - **Days 7–14 (Scavenger Window)**: Any player holding &ge; 1,000 GEAR can claim unclaimed allocations (90% payout to scavenger, 10% to cold immutable treasury).
   - **Day 14+ (Dust Sweep)**: Holder of Admin NFT #1793 sweeps expired leftovers: 90% recycled back into Oil Escrow, 10% to cold treasury.

4. **BYTE Fetch Escrow (`claimTool`) — Updated Anti-Sybil Specification**
   - **Token Gate**: Requires `BYTE.balanceOf(msg.sender) >= 50 * 10**18` (minimum 50 $BYTE). Prevents fractional-dust multi-wallet sybil farming and creates sustained holding demand for $BYTE.
   - **Gas Requirement**: Caller signs on-chain transaction and pays Base L2 network gas.
   - **Cadence & Throttle**: 1 $GEAR per claim with a 60-second cooldown (`lastClaimedAt[msg.sender] + 60 <= block.timestamp`).
   - **Hard Daily Wallet Cap**: Capped at **60 GEAR per wallet per 24-hour UTC window** (`dailyClaims[msg.sender] < 60`).
   - **Anti-Inflation & Progression Impact**:
     - Prevents bots from siphoning 1,440 GEAR/day per wallet.
     - Preserves the economic value of the 100 GEAR Junkyard Gate (requires at least 2 full days of dedicated claiming).
     - Protects the 1,000 GEAR Scavenger threshold (requires at least 17 days of active gameplay or secondary market trading).

---

## 4 Perspective Views in Dossier

- **Tech**: Contract specs, RPC routing, gas vectors, sybil defense via token gating + daily quotas, and why on-chain captcha contracts fail against MEV bots.
- **Bankman**: Zero-inflation token mobilization, capital efficiency, immutable cold treasury fees (10%), zero-cost serverless hosting, and conversion funnels.
- **Normie**: Plain-English Web2 explanation of walking the street, picking up oil cans, dog fetch with BYTE, repairing the SUV, and driving into the junkyard.
- **Degen**: The 50 BYTE + 60 GEAR/day farm, PVP sleeping holder traps, 90/10 vulture bounty mechanics, and keeper bot dynamics.

---

## License & Attribution

Built for the **CAPSTILLER** community on Base.