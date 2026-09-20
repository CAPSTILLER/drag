# CAPs Garage — Master Blueprint Dossier

Interactive architecture dossier, game economy flywheel, smart contract specifications, and multi-perspective pitch deck for **CAPs Garage** on Base (Chain ID: 8453).

Live app file: `index.html` (runnable in any browser with zero backend requirements).

---

## 🔒 Beta Lock

- **Cans are local HUD only (cap 10).** They never enter a calldata argument.
- **`fillOil()` is public.** No amount argument. Global cooldown only (start at 10 seconds). Packet size admin-settable. Caller bounty is a fixed `callerBounty` in DRB (start at 1). Rest of the packet goes to the Drop Vault. No per-wallet fill cooldown in beta.
- **Drop Vault snapshots the live gate** (`sum(endId - startId + 1)`). Days 0–7 holder 100%. Days 7–14 &ge;1000 GEAR scavenges 90/10. Day 14+ admin NFT #1793 sweeps leftovers: 90% Oil Escrow, 10% immutable treasury.
- **BYTE fetch is player-signed,** 1 GEAR, `BYTE.balanceOf > 0`, per-wallet 60s cooldown. Empty escrow = animation only. Do not promise 60 GEAR/hour.
- **Junkyard doors are scenery.** Drive = any GEAR. Junkyard gate = 100 GEAR (reads only).
- **Treasury address is constructor-immutable.** x402 cosmetics later. No new token.

*Note on fillOil:* This is the only `fillOil` implementation story. The 10-minute per-wallet throttle and "1% bounty" references have been eliminated to prevent contract fork drift.

---

## Overview

CAPs Garage connects three core utility tokens on Base without inflating supply or printing new tokens:
- **$DRB (Oil / Fuel)**: Community-funded reward pool dropped into the community vault.
- **$BYTE (The Dog)**: Holding &ge; 50 $BYTE unlocks 1 $GEAR every 60s via the dog fetch escrow, capped at 60 GEAR per wallet per day.
- **$GEAR (Tools & Access Keys)**: Required to repair/drive the red SUV, unlock the 500-garage Junkyard labyrinth (100 GEAR), and scavenge abandoned airdrop rewards (1,000 GEAR).

---

## Core Smart Contracts

1. **Gate Registry (`isUserAuthorized`)**
   - Access Key: DebtReliefFam NFT #1793 on Base (`0xc659c002f06f980f2caa577748504e9be7f26146`).
   - Registers partner NFT collections using explicit ID ranges: `(collection, startId, endId)`.
   - Total eligible count calculated on-chain via `sum(endId - startId + 1)` with no unbounded gas loops (<15k gas).
   - Past snapshots preserved in Drop Vault upon collection removal.

2. **Oil Escrow (`fillOil`) — Public Keeper Architecture**
   - Holds community-deposited $DRB fuel.
   - Public function `fillOil()` with zero input arguments.
   - Dispenses fixed `packetSize` (admin-settable, e.g. 10 DRB) per `cooldownSeconds` (10s global tank cooldown).
   - **Split Distribution**: Packet size minus caller bounty routes to Drop Vault; fixed `callerBounty` (1 DRB) directly to `msg.sender`.
   - **No per-wallet cooldown**: Anyone (player or keeper bot) can trigger the tap whenever global cooldown resets.

3. **Drop Vault (Pull-Claim & Scavenger Arena)**
   - Takes real-time snapshot of active collections from Gate Registry.
   - **Days 0–7**: 100% claimed by registered NFT token holders.
   - **Days 7–14 (Scavenger Window)**: Any player holding &ge; 1,000 GEAR can claim **unclaimed** allocations (90% payout to scavenger, 10% to cold immutable treasury). Holders who claimed on time are 100% safe.
   - **Day 14+ (Dust Sweep)**: Holder of Admin NFT #1793 sweeps expired leftovers: 90% recycled back into Oil Escrow, 10% to cold treasury.

4. **BYTE Fetch Escrow (`claimTool`)**
   - **Token Gate**: Requires `BYTE.balanceOf(msg.sender) > 0` (or configured threshold, e.g. 50 $BYTE).
   - **Gas Requirement**: Caller signs transaction and pays Base L2 network gas.
   - **Cooldown**: 60 seconds per wallet (`lastClaimedAt[msg.sender] + 60 <= block.timestamp`).
   - **Daily Wallet Cap**: 60 GEAR per wallet per 24-hour UTC window.
   - **Empty Escrow**: When escrow contract runs out of GEAR, animation still runs, but contract calls revert (`BytePocketsEmpty`).

---

## 4 Perspective Views in Dossier

- **Tech**: Reconciled keeper architecture, range-sum denominator, gas vectors, and why on-chain captchas fail against mempool bundles.
- **Bankman**: Zero-inflation token mobilization, capital efficiency, immutable cold treasury fees (10%), zero-cost serverless hosting, and conversion funnels.
- **Normie**: Plain-English Web2 explanation of walking the street, picking up oil cans, dog fetch with BYTE, repairing the SUV, and driving into the junkyard.
- **Degen**: The 50 BYTE + 60 GEAR/day farm, PVP sleeping holder traps, 90/10 vulture bounty mechanics, and keeper bot dynamics.

---

## License & Attribution

Built for the **CAPSTILLER** community on Base.
