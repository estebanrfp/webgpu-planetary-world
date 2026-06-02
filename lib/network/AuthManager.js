/**
 * Auth Manager - Authentication Facade
 * 
 * Wraps GenosDB Security Manager (db.sm) with a clean API
 * for user registration, login, and session management.
 * 
 * @module AuthManager
 */

import { getDB, GenosDBManager } from './GenosDBManager.js'

/**
 * @typedef {object} AuthState
 * @property {boolean} isActive - Whether a session is active
 * @property {string | null} address - Current user's Ethereum address
 * @property {string} abbrAddr - Abbreviated address for display
 * @property {boolean} isWebAuthnProtected - Session protected by WebAuthn
 * @property {boolean} hasVolatileIdentity - New identity awaiting protection
 * @property {boolean} hasWebAuthnRegistration - WebAuthn available for login
 * @property {string | null} mnemonic - Mnemonic phrase (only after generation)
 */

/**
 * @typedef {object} AuthIdentity
 * @property {string} address - Ethereum address
 * @property {string} mnemonic - BIP39 mnemonic phrase
 * @property {string} privateKey - Private key (hex)
 */

/**
 * Create an AuthManager instance
 * 
 * @returns {object} AuthManager API
 * 
 * @example
 * const auth = createAuthManager()
 * await auth.init()
 * 
 * if (!auth.getState().isActive) {
 *   const identity = await auth.startRegistration()
 *   console.log('Save this mnemonic:', identity.mnemonic)
 *   await auth.protectWithWebAuthn()
 * }
 */
export const createAuthManager = () => {
  /** @type {import('genosdb').GDB | null} */
  let db = null
  
  /** @type {AuthIdentity | null} */
  let volatileIdentity = null
  
  /** @type {Set<(state: AuthState) => void>} */
  const stateListeners = new Set()

  /**
   * Get current authentication state
   * @returns {AuthState}
   */
  const getState = () => {
    if (!db?.sm) {
      return {
        isActive: false,
        address: null,
        abbrAddr: 'N/A',
        isWebAuthnProtected: false,
        hasVolatileIdentity: volatileIdentity !== null,
        hasWebAuthnRegistration: false,
        mnemonic: volatileIdentity?.mnemonic ?? null
      }
    }

    return {
      isActive: db.sm.isSecurityActive(),
      address: db.sm.getActiveEthAddress(),
      abbrAddr: db.sm.getActiveEthAddress() 
        ? db.sm.abbrAddr(db.sm.getActiveEthAddress()) 
        : 'N/A',
      isWebAuthnProtected: db.sm.isCurrentSessionProtectedByWebAuthn(),
      hasVolatileIdentity: volatileIdentity !== null,
      hasWebAuthnRegistration: db.sm.hasExistingWebAuthnRegistration(),
      mnemonic: volatileIdentity?.mnemonic ?? null
    }
  }

  /**
   * Notify all state listeners
   */
  const notifyStateChange = () => {
    const state = getState()
    stateListeners.forEach(fn => {
      try { fn(state) } catch (e) { console.error('[Auth] Listener error:', e) }
    })
  }

  /**
   * Initialize the auth manager
   * Connects to GenosDB and sets up security state callbacks
   * 
   * @returns {Promise<AuthState>}
   */
  const init = async () => {
    console.log('[Auth] Initializing...')
    
    db = await getDB()
    
    // Set up state change callback if SM is available
    if (db.sm) {
      db.sm.setSecurityStateChangeCallback((smState) => {
        console.log('[Auth] Security state changed:', smState.isActive ? 'ACTIVE' : 'INACTIVE')
        
        // Clear volatile identity once protected
        if (smState.isActive && smState.isWebAuthnProtected && volatileIdentity) {
          volatileIdentity = null
        }
        
        notifyStateChange()
      })
      
      console.log('[Auth] Security Manager connected')
    } else {
      console.log('[Auth] Security Manager not available (first run)')
    }
    
    const state = getState()
    console.log('[Auth] Initial state:', state.isActive ? `Active as ${state.abbrAddr}` : 'Not authenticated')
    
    return state
  }

  /**
   * Start new user registration
   * Generates a new Ethereum identity with mnemonic phrase
   * 
   * @returns {Promise<AuthIdentity | null>}
   */
  const startRegistration = async () => {
    if (!db) throw new Error('[Auth] Not initialized. Call init() first.')
    
    console.log('[Auth] Starting new registration...')
    
    // SM is always available now (with placeholder superadmin for first run)
    if (!db.sm) {
      console.error('[Auth] Security Manager not available - this should not happen')
      return null
    }
    
    try {
      const identity = await db.sm.startNewUserRegistration()
      
      if (identity) {
        volatileIdentity = identity
        console.log('[Auth] New identity generated:', identity.address)
        
        // Register as superadmin (replaces placeholder if this is first user)
        await GenosDBManager.registerFirstSuperAdmin(identity.address)
        
        notifyStateChange()
        return identity
      }
    } catch (e) {
      console.error('[Auth] Identity generation error:', e)
    }
    
    console.error('[Auth] Failed to generate identity')
    return null
  }

  /**
   * Protect current identity with WebAuthn (biometrics/security key)
   * 
   * @returns {Promise<string | null>} Protected address or null on failure
   */
  const protectWithWebAuthn = async () => {
    if (!db?.sm) throw new Error('[Auth] Security Manager not available')
    if (!volatileIdentity) throw new Error('[Auth] No volatile identity to protect')
    
    console.log('[Auth] Protecting identity with WebAuthn...')
    
    const address = await db.sm.protectCurrentIdentityWithWebAuthn(volatileIdentity.privateKey)
    
    if (address) {
      console.log('[Auth] Identity protected:', address)
      volatileIdentity = null
      notifyStateChange()
    } else {
      console.error('[Auth] WebAuthn protection failed')
    }
    
    return address
  }

  /**
   * Login with WebAuthn (biometrics/security key)
   * 
   * @returns {Promise<string | null>} Logged in address or null on failure
   */
  const loginWithWebAuthn = async () => {
    if (!db?.sm) throw new Error('[Auth] Security Manager not available')
    
    console.log('[Auth] Logging in with WebAuthn...')
    
    const address = await db.sm.loginCurrentUserWithWebAuthn()
    
    if (address) {
      console.log('[Auth] WebAuthn login successful:', address)
    } else {
      console.error('[Auth] WebAuthn login failed')
    }
    
    return address
  }

  /**
   * Login or recover account with mnemonic phrase
   * 
   * @param {string} mnemonic - BIP39 mnemonic phrase
   * @returns {Promise<AuthIdentity | null>}
   */
  const loginWithMnemonic = async (mnemonic) => {
    if (!db?.sm) throw new Error('[Auth] Security Manager not available')
    
    console.log('[Auth] Logging in with mnemonic...')
    
    const identity = await db.sm.loginOrRecoverUserWithMnemonic(mnemonic)
    
    if (identity) {
      console.log('[Auth] Mnemonic login successful:', identity.address)
      volatileIdentity = identity // Store for potential WebAuthn protection
      notifyStateChange()
    } else {
      console.error('[Auth] Mnemonic login failed')
    }
    
    return identity
  }

  /**
   * Logout current user
   * 
   * @returns {Promise<void>}
   */
  const logout = async () => {
    if (!db?.sm) return
    
    console.log('[Auth] Logging out...')
    
    await db.sm.clearSecurity()
    volatileIdentity = null
    
    console.log('[Auth] Logged out')
    notifyStateChange()
  }

  /**
   * Subscribe to authentication state changes
   * 
   * @param {(state: AuthState) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  const onStateChange = (callback) => {
    stateListeners.add(callback)
    // Immediately call with current state
    callback(getState())
    return () => stateListeners.delete(callback)
  }

  /**
   * Check if WebAuthn is available for login
   * @returns {boolean}
   */
  const hasWebAuthnAvailable = () => {
    return db?.sm?.hasExistingWebAuthnRegistration() ?? false
  }

  /**
   * Get abbreviated address for display
   * @param {string} address - Full Ethereum address
   * @returns {string}
   */
  const abbrAddr = (address) => {
    return db?.sm?.abbrAddr(address) ?? `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return {
    init,
    getState,
    startRegistration,
    protectWithWebAuthn,
    loginWithWebAuthn,
    loginWithMnemonic,
    logout,
    onStateChange,
    hasWebAuthnAvailable,
    abbrAddr,
    
    /**
     * Get an ethers-compatible signer using the current identity
     * @param {any} ethers - The ethers instance
     * @param {any} provider - The ethers provider
     * @returns {Promise<any | null>}
     */
    getSigner: async (ethers, provider) => {
      if (!volatileIdentity?.privateKey) {
        console.warn('[Auth] No private key available for signing (WebAuthn session or not logged in)')
        return null
      }
      return new ethers.Wallet(volatileIdentity.privateKey, provider)
    }
  }
}

/**
 * Singleton auth manager instance
 */
export const AuthManager = createAuthManager()

export default AuthManager
