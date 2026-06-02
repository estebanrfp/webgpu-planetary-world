/**
 * Marketplace Configuration
 * 
 * Centralized constants for the NFT Marketplace, blockchain connection,
 * and cache settings.
 */

export const MARKETPLACE_CONFIG = {
  // Pagination
  ITEMS_PER_PAGE: 12,
  VISIBLE_PAGES: 5,
  
  // Search debounce delay (ms)
  SEARCH_DEBOUNCE_MS: 200,
  
  // Cache TTLs (ms)
  CACHE_TTL: 30000,              // 30 seconds - default
  OWNED_ASSETS_CACHE_TTL: 15000, // 15 seconds
  ACTIVITY_CACHE_TTL: 15000,     // 15 seconds
  STATS_CACHE_TTL: 60000,        // 1 minute
  PRICE_HISTORY_CACHE_TTL: 120000, // 2 minutes
  FLOOR_PRICES_CACHE_TTL: 60000, // 1 minute
  
  // Batch processing
  BALANCE_CHECK_BATCH_SIZE: 20,
  LISTING_FETCH_BATCH_SIZE: 10,
  BATCH_DELAY_MS: 100,
  
  // Blockchain query settings
  ACTIVITY_BLOCK_RANGE: 45000, // ~25 hours on Polygon (~2s blocks) - mainnet RPC limit is 50k
  RPC_TIMEOUT_MS: 5000,
  TX_WAIT_TIMEOUT_MS: 60000, // 60 seconds for transaction confirmation

  // Retry configuration
  RETRY_CONFIG: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
  },
  
  // Royalty limits
  ROYALTY_MIN_PERCENT: 0,
  ROYALTY_MAX_PERCENT: 25,
  
  // Default rental duration (days)
  DEFAULT_RENTAL_DAYS: 1,

  // Time constants (seconds)
  SECONDS_PER_HOUR: 3600,
  SECONDS_PER_DAY: 86400,

  // Auction duration presets (seconds)
  AUCTION_DURATIONS: {
    ONE_HOUR: 3600,
    SIX_HOURS: 21600,
    TWELVE_HOURS: 43200,
    ONE_DAY: 86400,
    THREE_DAYS: 259200,
    ONE_WEEK: 604800
  },
  DEFAULT_AUCTION_DURATION: 86400,

  // Fee configuration (basis points = percent * 100)
  MARKETPLACE_FEE_PERCENT: 2.5,
  MIN_BID_INCREMENT_PERCENT: 1,
  MAX_FEE_BASIS_POINTS: 1000,

  // Validation
  ETH_ADDRESS_LENGTH: 42,
  MAX_BUNDLE_NAME_LENGTH: 32,
  
  // IntersectionObserver settings for pagination sync
  VISIBILITY_THRESHOLD: 0.1,
  VISIBILITY_ROOT_MARGIN: '-100px 0px -20% 0px',
  
  // Known asset IDs for balance discovery (empty - relies on TransferSingle/TransferBatch events)
  KNOWN_ASSET_IDS: [],
  
  // Error signature codes
  ERROR_CODES: {
    INSUFFICIENT_BALANCE: '0xe450d38c'
  }
}

/**
 * Polygon Network Configuration
 */
export const POLYGON_CONFIG = {
  // Amoy Testnet
  TESTNET: {
    chainId: 80002,
    name: 'Polygon Amoy',
    rpcs: [
      'https://rpc-amoy.polygon.technology',
      'https://polygon-amoy-bor-rpc.publicnode.com',
      'https://rpc.ankr.com/polygon_amoy'
    ],
    explorer: 'https://amoy.polygonscan.com'
  },
  // Mainnet
  MAINNET: {
    chainId: 137,
    name: 'Polygon',
    rpcs: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon.drpc.org'
    ],
    explorer: 'https://polygonscan.com'
  }
}

/**
 * Current active network
 * Auto-initialized from localStorage on module load
 */
let _activeNetwork = (() => {
  try {
    const saved = localStorage.getItem('ovgrid_network')
    if (saved === 'TESTNET') return POLYGON_CONFIG.TESTNET
  } catch (e) { /* localStorage not available */ }
  return POLYGON_CONFIG.MAINNET
})()

export const ACTIVE_NETWORK = new Proxy({}, {
  get: (_, prop) => _activeNetwork[prop]
})

/**
 * Get current active network configuration
 * @returns {object} Network config with chainId, name, rpcs, explorer
 */
export const getActiveNetwork = () => _activeNetwork

/**
 * Set active network (TESTNET or MAINNET)
 * @param {'TESTNET'|'MAINNET'} network - Network identifier
 * @returns {object} New active network config
 */
export const setActiveNetwork = (network) => {
  if (network === 'MAINNET') {
    _activeNetwork = POLYGON_CONFIG.MAINNET
  } else {
    _activeNetwork = POLYGON_CONFIG.TESTNET
  }
  // Persist preference
  try {
    localStorage.setItem('ovgrid_network', network)
  } catch (e) { /* localStorage not available */ }
  return _activeNetwork
}

/**
 * Initialize network from localStorage preference
 */
export const initNetworkFromStorage = () => {
  try {
    const saved = localStorage.getItem('ovgrid_network')
    if (saved === 'MAINNET' || saved === 'TESTNET') {
      setActiveNetwork(saved)
    }
  } catch (e) { /* localStorage not available */ }
  return _activeNetwork
}

/**
 * Check if current network is mainnet
 * @returns {boolean}
 */
export const isMainnet = () => _activeNetwork.chainId === 137

/**
 * Asset type definitions
 * Maps asset IDs to their metadata (populated from blockchain metadata)
 */
export const ASSET_TYPES = {
  // Dynamically populated from blockchain uri() metadata
}

/**
 * Token configuration
 */
export const TOKEN_CONFIG = {
  symbol: 'OVG',
  decimals: 18
}

/**
 * Pinata IPFS Configuration
 * Used to upload images and metadata for Polygonscan/OpenSea compatibility
 */
export const PINATA_CONFIG = {
  // IPFS pinning credential — NEVER hardcode it: a client-side key is exposed to
  // every visitor of the deployed app. Operators inject their own at runtime,
  // e.g. a gitignored config.local.js loaded before the app that sets
  // `window.OVGRID_PINATA_JWT`. Empty by default → pinning (minting new land /
  // assets) is disabled; exploring, presence and reading the world still work.
  jwt: (typeof window !== 'undefined' && window.OVGRID_PINATA_JWT) || '',
  gateway: 'https://gateway.pinata.cloud/ipfs/'
}

/**
 * Supported payment tokens for Multi-Token v1.3.0
 * Maps token addresses to their metadata
 */
export const SUPPORTED_TOKENS = {
  // Polygon Amoy Testnet addresses
  80002: {
    // OVG Token (native marketplace token)
    '0x564f99BAD84cE3fD36D5597874633eddBB304b8f': {
      symbol: 'OVG',
      name: 'OVGrid Token',
      decimals: 18,
      icon: '🔷',
      isDefault: true
    }
  },
  // Polygon Mainnet addresses
  137: {
    // OVG Token (deployed 2026-01-24)
    '0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E': {
      symbol: 'OVG',
      name: 'OVGrid Token',
      decimals: 18,
      icon: '🔷',
      isDefault: true
    },
    // USDC (Polygon native)
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359': {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: '💵',
      isDefault: false
    },
    // USDT (Polygon native)
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: '💲',
      isDefault: false
    }
  }
}

/**
 * Get supported tokens for the active network
 * @returns {object} Token address -> metadata mapping
 */
export const getSupportedTokens = () => {
  return SUPPORTED_TOKENS[ACTIVE_NETWORK.chainId] || {}
}

/**
 * Get default payment token for the active network
 * @returns {object|null} { address, symbol, decimals, icon } or null
 */
export const getDefaultToken = () => {
  const tokens = getSupportedTokens()
  for (const [address, meta] of Object.entries(tokens)) {
    if (meta.isDefault) {
      return { address, ...meta }
    }
  }
  return null
}

/**
 * Get token metadata by address
 * @param {string} address - Token contract address
 * @returns {object|null} Token metadata or null if not found
 */
export const getTokenByAddress = (address) => {
  if (!address) return getDefaultToken()
  const tokens = getSupportedTokens()
  const normalizedAddress = address.toLowerCase()
  for (const [addr, meta] of Object.entries(tokens)) {
    if (addr.toLowerCase() === normalizedAddress) {
      return { address: addr, ...meta }
    }
  }
  return null
}
