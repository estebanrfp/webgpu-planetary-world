/**
 * Network Module - GenosDB Integration
 * 
 * Exports distributed database and authentication managers
 * for multiplayer functionality.
 */

export { getDB, GenosDBManager } from './GenosDBManager.js'
export { AuthManager, createAuthManager } from './AuthManager.js'
export { RPMManager, createRPMManager } from './RPMManager.js'
