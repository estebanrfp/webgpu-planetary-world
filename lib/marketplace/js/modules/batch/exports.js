/**
 * Batch Mode Window Exports Module
 * @module modules/batch/exports
 *
 * Centralizes all batch mode window exports for explore and inventory views.
 * Uses lazy loading for view functions.
 */

import {
  applyBatchBuyFilter as applyBatchBuyFilterModule,
  removeBatchBuyFilter as removeBatchBuyFilterModule,
  applyInventorySelectFilter as applyInventorySelectFilterModule,
  removeInventorySelectFilter as removeInventorySelectFilterModule
} from './index.js'
import { getExploreView, getInventoryView } from '../../core/lazy.js'

// Dependencies injected via init
let elements = null
let resetPaginationState = null
let getViewPagination = null

/**
 * Initialize batch exports with dependencies
 * @param {Object} deps - Dependencies
 */
export function initBatchExports(deps) {
  elements = deps.elements
  resetPaginationState = deps.resetPaginationState
  getViewPagination = deps.getViewPagination
}

/**
 * Apply batch buy filter - shows only 'sale' type items in Explore view
 */
export async function applyBatchBuyFilter() {
  const { loading } = await getExploreView()
  applyBatchBuyFilterModule(elements, resetPaginationState, loading.loadItems)
}

/**
 * Remove batch buy filter - restore previous filter state in Explore view
 */
export async function removeBatchBuyFilter() {
  const { loading } = await getExploreView()
  removeBatchBuyFilterModule(elements, resetPaginationState, loading.loadItems)
}

/**
 * Apply inventory select filter - shows only 'unlisted' items in Inventory view
 */
export async function applyInventorySelectFilter() {
  const { subscriptions } = await getInventoryView()
  applyInventorySelectFilterModule(getViewPagination, subscriptions.subscribeToInventory)
}

/**
 * Remove inventory select filter - restore previous filter state in Inventory view
 */
export async function removeInventorySelectFilter() {
  const { subscriptions } = await getInventoryView()
  removeInventorySelectFilterModule(getViewPagination, subscriptions.subscribeToInventory)
}

/**
 * Setup all batch mode window exports
 */
export function setupBatchExports() {
  window.applyBatchBuyFilter = applyBatchBuyFilter
  window.removeBatchBuyFilter = removeBatchBuyFilter
  window.applyInventorySelectFilter = applyInventorySelectFilter
  window.removeInventorySelectFilter = removeInventorySelectFilter
}
