/**
 * Current user management module
 * @module core/user
 */

// Current user wallet address (updated when connected to blockchain)
let CURRENT_USER = '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00'.toLowerCase()

/**
 * Initialize user module and expose to window
 */
export function initUser() {
  window.CURRENT_USER = CURRENT_USER
  window.updateCurrentUser = updateCurrentUser
}

/**
 * Update current user address globally
 * @param {string} address - Wallet address
 */
export function updateCurrentUser(address) {
  if (address) {
    CURRENT_USER = address.toLowerCase()
    window.CURRENT_USER = CURRENT_USER
    console.log(`[App] Current user updated: ${CURRENT_USER}`)
  }
}

/**
 * Get current user address
 * @returns {string} Current user wallet address
 */
export function getCurrentUser() {
  return CURRENT_USER
}
