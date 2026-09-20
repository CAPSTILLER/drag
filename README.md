# CAPs Garage — Master Blueprint Dossier

Interactive architecture dossier, game economy flywheel, smart contract specifications, and multi-perspective pitch deck for **CAPs Garage** on Base (Chain ID: 8453).

Live app file: `index.html` (runnable in any browser with zero backend requirements).

---

## 🔒 Beta Architecture Lock

To eliminate spec drift and reconcile the arcade client with decentralized on-chain execution:
- **Cans are Client-Side**: Picking up 10 cans on the canvas is an off-chain UI unlock for the player's manual "PUMP" button. The on-chain contract does not take or verify can counts.
- **`fillOil()` is Public & Permissionless**: Anyone (players or automated keeper/MEV bots) can call `fillOil()` when the global cooldown resets. No per-wallet cooldown fighting keepers.
- **Fixed Caller Bounty**: 10 DRB released per pump: **1 DRB flat caller bounty** directly to `msg.sender` (compensating gas and rewarding activity), **9 DRB** to the community Drop Vault.
- **BYTE Dog Faucet**: Requires holding &ge; **50 $BYTE** tokens. Caller pays Base network gas. 60-second cooldown between claims. Hard cap of **60 GEAR per wallet per day** (24h UTC window).
- **Repair is Non-Destructive**: Driving the SUV checks `balanceOf(user) >= 1 GEAR`. It does not spend or burn the token.
- **Scavenger Arena (PVP)**: Days 7–14 scavenger rights apply **strictly to unclaimed allocations** left by inactive holders. Active holders who claim during Days 0–7 never lose anything.
- **Frontend vs Protocol Immutability**: The smart contracts, token balances, and claim registries live permanently on Base. If the Vercel/web canvas ever went offline, claims and pump calls can be executed directly on BaseScan.

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
   - Dispenses fixed `packetSize` (10 DRB) per `cooldownSeconds` (e.g. 10s–60s global tank cooldown).
   - **Split Distribution**: 9 DRB into Drop Vault, 1 DRB flat `callerBounty` to `msg.sender`.
   - **Keeper Dynamic**: When a human player collects 10 cans on the street, they can sign `fillOil()` and pocket the 1 DRB reward. If no human is active, arbitrage/keeper bots call it and pay the gas, keeping the vault funded 24/7.

3. **Drop Vault (Pull-Claim & Scavenger Arena)**
   - Takes real-time snapshot of active collections from Gate Registry.
   - **Days 0–7**: 100% claimed by registered NFT token holders.
   - **Days 7–14 (Scavenger Window)**: Any player holding &ge; 1,000 GEAR can claim **unclaimed** allocations (90% payout to scavenger, 10% to cold immutable treasury). Holders who claimed on time are 100% safe.
   - **Day 14+ (Dust Sweep)**: Holder of Admin NFT #1793 sweeps expired leftovers: 90% recycled back into Oil Escrow, 10% to cold treasury.

4. **BYTE Fetch Escrow (`claimTool`) — Anti-Drain & Sybil Protected**
   - **Token Gate**: Requires `BYTE.balanceOf(msg.sender) >= 50 * 10**18` (minimum 50 $BYTE). Eliminates fractional-dust multi-tab sybil farming and drives real holding demand for $BYTE.
   - **Gas Requirement**: Caller signs transaction and pays Base L2 network gas.
   - **Cooldown**: 60 seconds per wallet (`lastClaimedAt[msg.sender] + 60 <= block.timestamp`).
   - **Hard Daily Wallet Cap**: Maximum **60 GEAR per wallet per 24-hour UTC window** (`dailyClaims[msg.sender] < 60`).
   - **Economic Balance**:
     - Prevents bots from siphoning 1,440 GEAR/day per wallet.
     - Preserves the economic value of the 100 GEAR Junkyard Gate (requires at least 2 full days of dedicated claiming).
     - Protects the 1,000 GEAR Scavenger threshold (requires at least 17 days of active gameplay or secondary market trading).

---

## 4 Perspective Views in Dossier

- **Tech**: Reconciled keeper architecture, range-sum denominator, gas vectors, and why on-chain captchas fail against mempool bundles.
- **Bankman**: Zero-inflation token mobilization, capital efficiency, immutable cold treasury fees (10%), zero-cost serverless hosting, and conversion funnels.
- **Normie**: Plain-English Web2 explanation of walking the street, picking up oil cans, dog fetch with BYTE, repairing the SUV, and driving into the junkyard.
- **Degen**: The 50 BYTE + 60 GEAR/day farm, PVP sleeping holder traps, 90/10 vulture bounty mechanics, and keeper bot dynamics.

---

## License & Attribution

Built for the **CAPSTILLER** community on Base.
