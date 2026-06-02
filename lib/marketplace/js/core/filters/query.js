/**
 * Filter query building
 * @module core/filters/query
 *
 * EXTRACTED FROM: app-core.js lines 159-224
 * DO NOT MODIFY - exact copy of original logic
 */

import { filters } from './state.js'
import { appState } from '../../store/appState.js'
import { getCurrentUser } from '../user.js'

/**
 * Build GenosDB query from current filter state (for Explore view)
 * @returns {object} GenosDB query object
 */
export function buildFilterQuery() {
  const conditions = []

  // NOTE: status filtering is done client-side (status !== 'unlisted') to ensure
  // real-time sync works correctly when items are unlisted

  // Category filter (multi-select)
  if (filters.categories.length === 0) {
    conditions.push({ category: '__none__' })
  } else if (filters.categories.length < 3) {
    const categoryConditions = filters.categories.map(c => ({ category: c }))
    if (categoryConditions.length === 1) {
      conditions.push(categoryConditions[0])
    } else {
      conditions.push({ $or: categoryConditions })
    }
  }

  // Status filter (sale, rent, auction, bundle) - filtered client-side
  // NOTE: GenosDB doesn't support complex $or queries well, so we filter in client
  // If no types selected, we'll return no results by using impossible condition
  if (filters.types.length === 0) {
    conditions.push({ status: '__none__' })
  }
  // Otherwise, all filtering is done client-side in subscribeToExplore

  // Rarity filter (OR condition)
  if (filters.rarities.length === 0) {
    conditions.push({ rarity: '__none__' })
  } else if (filters.rarities.length < 6) {
    const rarityConditions = filters.rarities.map(r => ({ rarity: r }))
    if (rarityConditions.length === 1) {
      conditions.push(rarityConditions[0])
    } else {
      conditions.push({ $or: rarityConditions })
    }
  }

  // Search filter (title contains)
  if (filters.search?.trim()) {
    conditions.push({ title: { $regex: filters.search.trim() } })
  }

  // Listing Type filter (from filter chips)
  if (filters.listingType && filters.listingType !== 'all') {
    conditions.push({ type: filters.listingType })
  }

  // Price range filter
  if (filters.priceMin !== null) {
    conditions.push({ priceNum: { $gte: filters.priceMin } })
  }
  if (filters.priceMax !== null) {
    conditions.push({ priceNum: { $lte: filters.priceMax } })
  }

  // Combine all conditions with $and
  if (conditions.length === 0) {
    return {}
  } else if (conditions.length === 1) {
    return conditions[0]
  } else {
    return { $and: conditions }
  }
}

/**
 * Build GenosDB query for specific view
 * EXACT COPY of app-core.js buildViewQuery function
 * @param {string} viewName - View name (explore, inventory, offers, activity)
 * @returns {object} GenosDB query object
 */
export function buildViewQuery(viewName) {
  const viewPagination = appState.viewPagination
  const state = viewPagination[viewName]
  const CURRENT_USER = getCurrentUser()
  const query = {}

  if (viewName === 'explore') {
    // Status filter (sale, rent, auction, bundle)
    if (filters.types.length > 0 && filters.types.length < 4) {
      query.status = { $in: filters.types }
    } else {
      query.status = { $in: ['sale', 'rent', 'auction', 'bundle'] }
    }
    // Category filter
    if (filters.categories.length > 0 && filters.categories.length < 4) {
      query.category = { $in: filters.categories }
    }
    // Rarity filter
    if (filters.rarities.length > 0 && filters.rarities.length < 6) {
      query.rarity = { $in: filters.rarities }
    }
    // Price range
    if (filters.priceMin !== null || filters.priceMax !== null) {
      query.priceNum = {}
      if (filters.priceMin !== null) query.priceNum.$gte = filters.priceMin
      if (filters.priceMax !== null) query.priceNum.$lte = filters.priceMax
    }
    // Search
    if (filters.search?.trim()) {
      query.title = { $like: `%${filters.search.trim()}%` }
    }
  } else if (viewName === 'inventory') {
    // Inventory shows only assets owned by current user
    query.owner = CURRENT_USER
    // Exclude items that are part of a bundle (they show as bundle, not individually)
    query.status = { $ne: 'bundled' }

    // Group filter: handle both token::tokenId and legacy::title::collection formats
    // Check groupFilter first, then fallback to expandedGroupKey for expanded view
    const groupFilter = window.getInventoryGroupFilter?.() || window.getExpandedAsset?.()
    if (groupFilter) {
      if (groupFilter.startsWith('token::')) {
        // ERC-1155 tokenId format
        const tokenId = parseInt(groupFilter.replace('token::', ''), 10)
        if (!isNaN(tokenId)) {
          query.tokenId = tokenId
        }
      } else if (groupFilter.startsWith('legacy::')) {
        // Legacy title::collection format
        const parts = groupFilter.replace('legacy::', '').split('::')
        const [titleFilter, collectionFilter] = parts
        if (titleFilter) query.title = { $like: titleFilter }
        if (collectionFilter) query.collection = { $like: collectionFilter }
      }
    }

    // Apply category filters
    if (filters.categories.length > 0 && filters.categories.length < 4) {
      query.category = { $in: filters.categories }
    }
    // Apply listing status filter (works in parallel with grouping)
    if (filters.listingStatuses.length > 0 && filters.listingStatuses.length < 6) {
      const statusesWithoutBundled = filters.listingStatuses.filter(s => s !== 'bundled')
      if (statusesWithoutBundled.length > 0) {
        query.status = { $in: statusesWithoutBundled }
      }
    }
    // Apply rarity filter
    if (filters.inventoryRarities.length > 0 && filters.inventoryRarities.length < 6) {
      query.rarity = { $in: filters.inventoryRarities }
    }
    // Search filter
    if (filters.search?.trim()) {
      query.title = { $like: `%${filters.search.trim()}%` }
    }
  } else if (viewName === 'offers') {
    query.status = 'offer'
    // Direction filter using GenosDB operators
    const direction = state?.filterDirection || 'all'
    if (direction === 'received') {
      // Offers on my assets from others (targetOwner = me, owner != me)
      query.targetOwner = CURRENT_USER
      query.owner = { $ne: CURRENT_USER }
    } else if (direction === 'sent') {
      // Offers I made (owner = me)
      query.owner = CURRENT_USER
    } else {
      // 'all' - offers where user is owner OR targetOwner
      query.$or = [{ owner: CURRENT_USER }, { targetOwner: CURRENT_USER }]
    }
    // Status filter (pending, expired)
    if (state?.filterStatus && state.filterStatus !== 'all') {
      query.offerStatus = state.filterStatus
    }
    // Search filter
    if (filters.search?.trim()) {
      query.title = { $like: `%${filters.search.trim()}%` }
    }
  } else if (viewName === 'activity') {
    if (state.filterType && state.filterType !== 'all') {
      query.type = state.filterType
    }
  }

  return query
}
