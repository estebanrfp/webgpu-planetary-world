/**
 * Centralized State Store
 * @module store
 *
 * Simple reactive store for managing application state.
 * Inspired by Redux but simpler - no reducers, direct setState.
 *
 * Usage:
 *   import { store } from './store/index.js'
 *
 *   // Read state
 *   const state = store.getState()
 *
 *   // Update state
 *   store.setState({ currentView: 'inventory' })
 *   store.setState(s => ({ ...s, explore: { ...s.explore, currentPage: 2 } }))
 *
 *   // Subscribe to changes
 *   const unsubscribe = store.subscribe((newState, prevState) => {
 *     console.log('State changed', newState)
 *   })
 */

import { initialState, cloneState } from './state.js'

/** @type {typeof initialState} */
let state = cloneState(initialState)

/** @type {Set<function>} */
const listeners = new Set()

/** @type {boolean} */
let isDispatching = false

/**
 * The store object
 */
export const store = {
  /**
   * Get current state (read-only snapshot)
   * @returns {typeof initialState}
   */
  getState() {
    return state
  },

  /**
   * Update state with new values
   * @param {object|function} updater - New state object or updater function
   */
  setState(updater) {
    if (isDispatching) {
      console.warn('[Store] Cannot dispatch while dispatching')
      return
    }

    isDispatching = true
    const prevState = state

    try {
      if (typeof updater === 'function') {
        state = updater(state)
      } else {
        state = { ...state, ...updater }
      }

      // Notify listeners
      listeners.forEach(listener => {
        try {
          listener(state, prevState)
        } catch (e) {
          console.error('[Store] Listener error:', e)
        }
      })
    } finally {
      isDispatching = false
    }
  },

  /**
   * Subscribe to state changes
   * @param {function} listener - Callback (newState, prevState) => void
   * @returns {function} Unsubscribe function
   */
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /**
   * Reset store to initial state
   */
  reset() {
    this.setState(cloneState(initialState))
  },

  /**
   * Get number of active listeners
   * @returns {number}
   */
  getListenerCount() {
    return listeners.size
  }
}

// Expose store globally for debugging and wizard compatibility
if (typeof window !== 'undefined') {
  window.__STORE__ = store
}

// Re-export state utilities
export { initialState, DEFAULT_FILTERS, ITEMS_PER_PAGE, VIEW_ITEMS_PER_PAGE } from './state.js'
