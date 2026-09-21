/**
 * CAPs Garage — Mock chain provider (BETA)
 * Local-only simulation of Oil Escrow + BYTE Fetch Escrow.
 * Bankr will swap to liveProvider.js against real Base contracts later.
 *
 * Canonical Lock (do not invent):
 * - fillOil(): public, no amount, global ~10s cooldown, fixed 1 DRB bounty, rest vault
 * - Keepers allowed; no per-wallet fill cooldown in beta
 * - BYTE dust → 1 GEAR / 60s player-signed until escrow empty; empty = animation only
 * - Drive ≥1 GEAR (read, not spend)
 * - Cans are HUD only — never appear in calldata
 */

const FILL_COOLDOWN_MS = 10_000;
const BYTE_CLAIM_COOLDOWN_MS = 60_000;
const CALLER_BOUNTY_DRB = 1;
const PACKET_SIZE_DRB = 10; // mock packet; bounty 1 → vault 9

const state = {
  connected: false,
  address: null,
  gear: 0,
  byte: 1, // dust BYTE so fetch is available in mock
  drbEarned: 0,
  oilEscrowBalance: 10_000, // mock DRB remaining in tank
  byteEscrowGear: 25, // mock GEAR left in BYTE escrow
  lastFillAt: 0,
  lastByteClaimAt: 0,
  tankReady: true,
};

function now() {
  return Date.now();
}

function shortAddr(a) {
  if (!a) return '—';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

export const mockProvider = {
  id: 'mock',
  label: 'Mock Wallet',

  async connect() {
    state.connected = true;
    state.address = '0xCAPs' + 'Mock' + 'CafeCafeCafeCafeCafe00';
    // Seed a little GEAR so repair/drive is reachable after one BYTE claim
    if (state.gear === 0) state.gear = 0;
    return { address: state.address, short: shortAddr(state.address) };
  },

  async disconnect() {
    state.connected = false;
    state.address = null;
  },

  isConnected() {
    return state.connected;
  },

  getAddress() {
    return state.address;
  },

  getShortAddress() {
    return shortAddr(state.address);
  },

  /** Balance reads — HUD / gate checks (reads only; Drive does not spend GEAR). */
  async getGearBalance() {
    return state.gear;
  },

  async getByteBalance() {
    return state.byte;
  },

  async getDrbEarned() {
    return state.drbEarned;
  },

  async getOilEscrowBalance() {
    return state.oilEscrowBalance;
  },

  async getByteEscrowRemaining() {
    return state.byteEscrowGear;
  },

  /** Global tank cooldown remaining in ms (shared; no per-wallet fill cooldown). */
  getFillCooldownRemainingMs() {
    const elapsed = now() - state.lastFillAt;
    return Math.max(0, FILL_COOLDOWN_MS - elapsed);
  },

  isTankReady() {
    return this.getFillCooldownRemainingMs() === 0 && state.oilEscrowBalance >= PACKET_SIZE_DRB;
  },

  getByteClaimCooldownRemainingMs() {
    const elapsed = now() - state.lastByteClaimAt;
    return Math.max(0, BYTE_CLAIM_COOLDOWN_MS - elapsed);
  },

  /**
   * Mock fillOil() — public, no amount arg, no cans in calldata.
   * Cans only gate the in-game pump UI; keepers may call with zero cans.
   * Fixed 1 DRB bounty to caller; rest (9) to Drop Vault (not tracked in HUD).
   */
  async fillOil({ asKeeper = false } = {}) {
    const remaining = this.getFillCooldownRemainingMs();
    if (remaining > 0) {
      const err = new Error(`CooldownActive: ${Math.ceil(remaining / 1000)}s`);
      err.code = 'CooldownActive';
      err.timeRemaining = remaining;
      throw err;
    }
    if (state.oilEscrowBalance < PACKET_SIZE_DRB) {
      const err = new Error('InsufficientEscrowBalance');
      err.code = 'InsufficientEscrowBalance';
      throw err;
    }

    state.lastFillAt = now();
    state.oilEscrowBalance -= PACKET_SIZE_DRB;
    const bounty = CALLER_BOUNTY_DRB;
    const toVault = PACKET_SIZE_DRB - bounty;
    state.drbEarned += bounty;

    return {
      ok: true,
      callerBounty: bounty,
      toVault,
      packetSize: PACKET_SIZE_DRB,
      asKeeper: !!asKeeper,
      oilEscrowBalance: state.oilEscrowBalance,
      txHash: '0xmockfill' + now().toString(16),
    };
  },

  /**
   * Mock BYTE fetch — player-signed claimTool.
   * Requires dust BYTE (>0). 1 GEAR / 60s until escrow empty.
   * Empty escrow → animationOnly (no revert on client; contract would revert on-chain).
   */
  async claimByteFetch() {
    if (!state.connected) {
      const err = new Error('WalletNotConnected');
      err.code = 'WalletNotConnected';
      throw err;
    }
    if (state.byte <= 0) {
      const err = new Error('NeedDustByte');
      err.code = 'NeedDustByte';
      throw err;
    }

    if (state.byteEscrowGear <= 0) {
      return {
        ok: false,
        animationOnly: true,
        reason: 'BytePocketsEmpty',
        gearAwarded: 0,
        escrowRemaining: 0,
      };
    }

    const cd = this.getByteClaimCooldownRemainingMs();
    if (cd > 0) {
      const err = new Error(`ByteCooldown: ${Math.ceil(cd / 1000)}s`);
      err.code = 'ByteCooldown';
      err.timeRemaining = cd;
      throw err;
    }

    state.lastByteClaimAt = now();
    state.byteEscrowGear -= 1;
    state.gear += 1;

    return {
      ok: true,
      animationOnly: false,
      gearAwarded: 1,
      escrowRemaining: state.byteEscrowGear,
      txHash: '0xmockbyte' + now().toString(16),
    };
  },

  /** Dev/test helpers (mock only) */
  _debug: {
    setGear(n) {
      state.gear = Math.max(0, n | 0);
    },
    setByte(n) {
      state.byte = Math.max(0, n | 0);
    },
    emptyByteEscrow() {
      state.byteEscrowGear = 0;
    },
    refillOil(n = 1000) {
      state.oilEscrowBalance += n;
    },
    getState() {
      return { ...state };
    },
  },
};

export default mockProvider;
