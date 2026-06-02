/**
 * GenosDB Manager - Core Database Singleton
 * 
 * Provides centralized access to the distributed GenosDB instance
 * with P2P networking and Security Manager enabled.
 * 
 * @module GenosDBManager
 */

/** @type {import('genosdb').GDB | null} */
let dbInstance = null

/** @type {Promise<import('genosdb').GDB> | null} */
let initPromise = null

/** @type {Set<(state: object) => void>} */
const stateListeners = new Set()

/**
 * Database configuration
 */
const DB_CONFIG = {
  name: 'ovgrid-world'
}

/** Storage key for superadmin addresses */
const SUPERADMIN_STORAGE_KEY = 'ovgrid_superadmins'

/** Placeholder address for first-run (will be replaced after first registration) */
const PLACEHOLDER_SUPERADMIN = '0x0000000000000000000000000000000000000000'

/**
 * Load superadmin addresses from localStorage
 * @returns {string[]}
 */
const loadSuperAdmins = () => {
  try {
    const stored = localStorage.getItem(SUPERADMIN_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Save superadmin address to localStorage
 * @param {string} address - Ethereum address to add as superadmin
 */
const saveSuperAdmin = (address) => {
  const admins = loadSuperAdmins()
  // Remove placeholder if present
  const filtered = admins.filter(a => a !== PLACEHOLDER_SUPERADMIN)
  if (!filtered.includes(address)) {
    filtered.push(address)
    localStorage.setItem(SUPERADMIN_STORAGE_KEY, JSON.stringify(filtered))
    console.log('[GenosDB] Added superadmin:', address)
  }
}

/**
 * Notify all state listeners
 * @param {object} state - Current state object
 */
const notifyListeners = (state) => {
  stateListeners.forEach(fn => {
    try { fn(state) } catch (e) { console.error('[GenosDB] Listener error:', e) }
  })
}

/**
 * Initialize the GenosDB instance
 * @returns {Promise<import('genosdb').GDB>}
 */
const initDB = async () => {
  if (dbInstance) return dbInstance

  console.log('[GenosDB] Initializing distributed database...')

  // Dynamic import from CDN (pinned version for security)
  // Note: ES module dynamic imports don't support SRI hashes natively
  // Version pinned to avoid supply chain attacks from @latest
  const { gdb } = await import('https://cdn.jsdelivr.net/npm/genosdb@0.12.9/dist/index.min.js')

  // Full Security Manager with mnemonic/Ethereum identity.
  let superAdmins = loadSuperAdmins()
  // First run uses a placeholder to enable the SM module, so identity
  // generation can run; the real superadmin replaces it after registration.
  if (superAdmins.length === 0) {
    superAdmins = [PLACEHOLDER_SUPERADMIN]
    console.log('[GenosDB] First run - using placeholder superadmin to enable SM')
  }
  const config = { rtc: true, sm: { superAdmins } }

  dbInstance = await gdb(DB_CONFIG.name, config)

  console.log('[GenosDB] Database initialized:', DB_CONFIG.name)
  console.log('[GenosDB] P2P networking: ENABLED')
  console.log('[GenosDB] Security Manager: ENABLED')

  return dbInstance
}

/**
 * Get the GenosDB instance (initializes on first call)
 * Uses singleton pattern with lazy initialization.
 * 
 * @returns {Promise<import('genosdb').GDB>}
 * 
 * @example
 * const db = await getDB()
 * await db.put({ type: 'player', name: 'User' })
 */
export const getDB = () => {
  if (!initPromise) {
    initPromise = initDB()
  }
  return initPromise
}

/**
 * GenosDB Manager API
 * 
 * Provides high-level methods for database operations
 * and state management.
 */
export const GenosDBManager = {
  /**
   * Get database instance
   * @returns {Promise<import('genosdb').GDB>}
   */
  getDB,

  /**
   * Check if database is initialized
   * @returns {boolean}
   */
  isReady: () => dbInstance !== null,

  /**
   * Get current database instance (throws if not ready)
   * @returns {import('genosdb').GDB}
   */
  getInstance: () => {
    if (!dbInstance) throw new Error('[GenosDB] Database not initialized. Call getDB() first.')
    return dbInstance
  },

  /**
   * Register first superadmin after initial registration
   * @param {string} address - Ethereum address of first user
   */
  registerFirstSuperAdmin: async (address) => {
    const admins = loadSuperAdmins()
    if (admins.length === 0) {
      saveSuperAdmin(address)
      console.log('[GenosDB] First superadmin registered:', address)
      
      // Reinitialize with SM enabled
      dbInstance = null
      initPromise = null
      await getDB()
    }
  },

  /**
   * Subscribe to database state changes
   * @param {(state: object) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onStateChange: (callback) => {
    stateListeners.add(callback)
    return () => stateListeners.delete(callback)
  },

  /**
   * Put data into the database
   * @param {object} value - Data to store
   * @param {string} [id] - Optional ID
   * @returns {Promise<string>} Node ID
   */
  put: async (value, id) => {
    const db = await getDB()
    return db.put(value, id)
  },

  /**
   * Get data from the database
   * @param {string} id - Node ID
   * @param {Function} [callback] - Optional reactive callback
   * @returns {Promise<{result: object | null, unsubscribe?: Function}>}
   */
  get: async (id, callback) => {
    const db = await getDB()
    return db.get(id, callback)
  },

  /**
   * Query nodes with optional real-time updates
   * @param {object | Function} optionsOrCallback
   * @param {Function} [callback]
   * @returns {Promise<{results: object[], unsubscribe?: Function}>}
   */
  map: async (optionsOrCallback, callback) => {
    const db = await getDB()
    return db.map(optionsOrCallback, callback)
  },

  /**
   * Remove a node from the database
   * @param {string} id - Node ID
   * @returns {Promise<void>}
   */
  remove: async (id) => {
    const db = await getDB()
    return db.remove(id)
  },

  /**
   * Create a link between two nodes
   * @param {string} sourceId
   * @param {string} targetId
   * @returns {Promise<void>}
   */
  link: async (sourceId, targetId) => {
    const db = await getDB()
    return db.link(sourceId, targetId)
  }
}

export default GenosDBManager
