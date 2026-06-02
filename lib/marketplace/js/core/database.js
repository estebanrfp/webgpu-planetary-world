/**
 * Database initialization module
 * @module core/database
 */

import { gdb } from 'https://cdn.jsdelivr.net/npm/genosdb@latest/dist/index.js'
import { DB_NAME } from './constants.js'

let db = null

/**
 * Initialize the GenosDB database
 * @returns {Promise<object>} Database instance
 */
export async function initDatabase() {
  if (db) return db
  db = await gdb(DB_NAME, { rtc: true })
  window.db = db
  return db
}

/**
 * Get the database instance
 * @returns {object} Database instance
 */
export function getDatabase() {
  return db
}
