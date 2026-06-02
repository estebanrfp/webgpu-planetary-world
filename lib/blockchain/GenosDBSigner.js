/**
 * GenosDB Signer Bridge
 * 
 * This module connects the GenosDB Security Manager (identity)
 * with ethers.js to enable signing transactions on Polygon
 * using the user's OVGrid identity.
 */

import { AuthManager } from '../network/AuthManager.js'

/**
 * Creates a Bridge Signer that uses GenosDB for identity.
 * 
 * @param {object} provider - ethers.js provider (e.g. JsonRpcProvider for Polygon)
 * @returns {object} A bridge object that can be used to create contracts
 */
export const createGenosDBSigner = (provider) => {
  // We'll use ethers via dynamic import or if it's already in the global scope/bundled
  // For now, we assume provide is an ethers provider
  
  return {
    /**
     * Get the current active address from GenosDB
     */
    getAddress: async () => {
      const state = AuthManager.getState()
      if (!state.isActive) throw new Error('User not authenticated in GenosDB')
      return state.address
    },

    /**
     * This is a simplified bridge. 
     * In a real implementation, we would need to either:
     * 1. Extract the PK from GenosDB (if possible)
     * 2. Implement a custom ethers.Signer that uses db.sm to sign
     */
    getSigner: async (ethers, provider) => {
      const state = AuthManager.getState()
      if (!state.isActive) throw new Error('User not authenticated')
      
      const signer = await AuthManager.getSigner(ethers, provider)
      if (!signer) {
        console.warn('[Blockchain] No signing capability currently available. Mnemonic login required for transactions.')
      }
      return signer
    }
  }
}
