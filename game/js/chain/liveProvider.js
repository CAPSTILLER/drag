/**
 * CAPs Garage — Live chain provider (STUB)
 * Bankr will wire real Base (8453) contracts here.
 *
 * TODO hooks — do not invent addresses or ABIs yet:
 * - fillOil() on Oil Escrow (public, no amount)
 * - claimByteFetch / claimTool on BYTE Fetch Escrow
 * - balance reads: GEAR, BYTE, Oil Escrow DRB, BYTE escrow GEAR
 * - GateRegistry / Drop Vault are out of street-arcade beta scope
 *
 * Swap: set USE_LIVE = true in main.js once addresses are known.
 */

// TODO(Bankr): replace with deployed Oil Escrow address on Base
export const OIL_ESCROW_ADDRESS = '0x0000000000000000000000000000000000000000';

// TODO(Bankr): replace with BYTE Fetch Escrow address
export const BYTE_FETCH_ESCROW_ADDRESS = '0x0000000000000000000000000000000000000000';

// TODO(Bankr): ERC-20 addresses
export const GEAR_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
export const BYTE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DRB_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

export const CHAIN_ID = 8453; // Base

/** Minimal ABI stubs — expand when contracts are final */
export const OIL_ESCROW_ABI = [
  // fillOil() — public, no amount arg, global cooldown, fixed callerBounty
  'function fillOil() external',
  'function lastFillTimestamp() view returns (uint256)',
  'function cooldownSeconds() view returns (uint256)',
  'function packetSize() view returns (uint256)',
  'function callerBounty() view returns (uint256)',
];

export const BYTE_FETCH_ABI = [
  // claimTool / claimByteFetch — player-signed, 1 GEAR / 60s, dust BYTE gate
  'function claimTool() external',
  // TODO(Bankr): confirm exact function name + events from final BYTE escrow
];

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

/**
 * Live provider skeleton. All methods throw until Bankr wires wagmi/viem/ethers.
 */
export const liveProvider = {
  id: 'live',
  label: 'Live (Base) — not wired',

  async connect() {
    // TODO(Bankr): wallet connect (wagmi / injected / WalletConnect)
    throw new Error('liveProvider.connect: not wired — Bankr will attach wallet + Base RPC');
  },

  async disconnect() {
    // TODO(Bankr)
  },

  isConnected() {
    return false;
  },

  getAddress() {
    return null;
  },

  getShortAddress() {
    return '—';
  },

  async getGearBalance() {
    // TODO(Bankr): ERC20(GEAR).balanceOf(address)
    throw new Error('liveProvider.getGearBalance: TODO');
  },

  async getByteBalance() {
    // TODO(Bankr): ERC20(BYTE).balanceOf(address)
    throw new Error('liveProvider.getByteBalance: TODO');
  },

  async getOilEscrowBalance() {
    // TODO(Bankr): DRB.balanceOf(OIL_ESCROW)
    throw new Error('liveProvider.getOilEscrowBalance: TODO');
  },

  async getByteEscrowRemaining() {
    // TODO(Bankr): GEAR.balanceOf(BYTE_FETCH_ESCROW)
    throw new Error('liveProvider.getByteEscrowRemaining: TODO');
  },

  getFillCooldownRemainingMs() {
    // TODO(Bankr): read lastFillTimestamp + cooldownSeconds from Oil Escrow
    return 0;
  },

  isTankReady() {
    return false;
  },

  getByteClaimCooldownRemainingMs() {
    // TODO(Bankr): per-wallet lastClaim mapping
    return 0;
  },

  /**
   * TODO(Bankr): OilEscrow.fillOil() — NEVER pass cans/amount.
   * Cans remain client HUD only.
   */
  async fillOil(_opts) {
    throw new Error('liveProvider.fillOil: TODO — call OilEscrow.fillOil() with no args');
  },

  /**
   * TODO(Bankr): player-signed claimTool / claimByteFetch.
   * Empty escrow on-chain → revert BytePocketsEmpty; client should catch and play animation only.
   */
  async claimByteFetch() {
    throw new Error('liveProvider.claimByteFetch: TODO — call BYTE Fetch Escrow claim');
  },
};

export default liveProvider;
