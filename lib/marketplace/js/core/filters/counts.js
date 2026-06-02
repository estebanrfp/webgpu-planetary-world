/**
 * Filter counts module
 * @module core/filters/counts
 *
 * EXTRACTED FROM: app-core.js (lines 298-410)
 * Functions to update filter count badges in the UI
 */

// Module state - set via initFilterCounts
let db = null
let getCurrentUser = null

/**
 * Initialize filter counts module with dependencies
 * @param {object} database - GenosDB instance
 * @param {function} getUserFn - Function to get current user address
 */
export function initFilterCounts(database, getUserFn) {
  db = database
  getCurrentUser = getUserFn
}

/**
 * Update filter counts for the current view
 * @param {string} view - View name (explore, inventory, offers)
 */
export async function updateFilterCounts(view = window.getCurrentView?.() || 'explore') {
  if (view === 'explore') {
    await updateExploreCounts()
  } else if (view === 'inventory') {
    await updateInventoryCounts()
  } else if (view === 'offers') {
    await updateOffersCounts()
  }
}

/**
 * Update explore view filter counts
 */
export async function updateExploreCounts() {
  const categories = ['land', 'wearables', 'objects', 'collections']
  const statuses = ['sale', 'rent', 'auction', 'bundle']
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

  // Get all listed assets (status !== 'unlisted')
  let allResults = []
  try {
    const { results } = await db.map({ query: {}, $limit: 9999 })
    // Filter: must have status field and not be unlisted/offer/activity
    allResults = results.filter(r => {
      const s = r.value?.status
      return s && s !== 'unlisted' && s !== 'offer' && !r.value?.type
    })
  } catch (e) { /* ignore */ }

  // Category counts (case-insensitive comparison)
  for (const cat of categories) {
    const count = allResults.filter(r => r.value.category?.toLowerCase() === cat).length
    const el = document.querySelector(`[data-count-category="${cat}"]`)
    if (el) el.textContent = count
  }

  // Status counts (sale, rent, auction, bundle)
  for (const status of statuses) {
    const count = allResults.filter(r => r.value.status === status).length
    const el = document.querySelector(`[data-count-type="${status}"]`)
    if (el) el.textContent = count
  }

  // Rarity counts (case-insensitive comparison)
  for (const rarity of rarities) {
    const count = allResults.filter(r => r.value.rarity?.toLowerCase() === rarity).length
    const el = document.querySelector(`[data-count-rarity="${rarity}"]`)
    if (el) el.textContent = count
  }

  // Update favorites count
  window.updateFavoritesCount?.()
}

/**
 * Update inventory view filter counts
 */
export async function updateInventoryCounts() {
  const categories = ['land', 'wearables', 'objects', 'collections']
  const currentUser = getCurrentUser?.() || ''

  // Get all user assets (filter by owner)
  let allResults = []
  try {
    const { results } = await db.map({ query: { owner: currentUser }, $limit: 9999 })
    // Filter out offers and activities
    allResults = results.filter(r => r.value?.status !== 'offer' && !r.value?.type)
  } catch (e) { /* ignore */ }

  // Category counts (case-insensitive comparison)
  for (const cat of categories) {
    const count = allResults.filter(r => r.value.category?.toLowerCase() === cat).length
    const el = document.querySelector(`[data-count-inventory="${cat}"]`)
    if (el) el.textContent = count
  }

  // Total count
  const totalEl = document.querySelector(`[data-count-listing="all"]`)
  if (totalEl) totalEl.textContent = allResults.length

  // Unified status counts
  const statusTypes = ['unlisted', 'sale', 'rent', 'auction', 'bundle']
  for (const st of statusTypes) {
    const count = allResults.filter(r => r.value.status === st).length
    const stEl = document.querySelector(`[data-count-listing="${st}"]`)
    if (stEl) stEl.textContent = count
  }

  // Rarity counts (case-insensitive comparison)
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']
  for (const rarity of rarities) {
    const count = allResults.filter(r => r.value.rarity?.toLowerCase() === rarity).length
    const rarityEl = document.querySelector(`[data-count-inventory-rarity="${rarity}"]`)
    if (rarityEl) rarityEl.textContent = count
  }
}

/**
 * Update offers view filter counts
 */
export async function updateOffersCounts() {
  const currentUser = getCurrentUser?.() || ''

  try {
    // Query offers from GenosDB
    const { results: allAssets } = await db.map({ query: { status: 'offer' }, $limit: 9999 })
    const allOffers = allAssets.filter(item =>
      item.value?.owner === currentUser || item.value?.targetOwner === currentUser
    )

    // Direction counts - mutually exclusive based on owner
    // Sent = I made the offer (owner === me)
    // Received = Someone made offer on my asset (owner !== me, but targetOwner === me)
    const sentOffers = allOffers.filter(r => r.value.owner === currentUser)
    const receivedOffers = allOffers.filter(r => r.value.owner !== currentUser)

    const allEl = document.querySelector(`[data-count-direction="all"]`)
    if (allEl) allEl.textContent = allOffers.length

    const receivedEl = document.querySelector(`[data-count-direction="received"]`)
    if (receivedEl) receivedEl.textContent = receivedOffers.length

    const sentEl = document.querySelector(`[data-count-direction="sent"]`)
    if (sentEl) sentEl.textContent = sentOffers.length

    // Status counts
    const pendingCount = allOffers.filter(r => r.value.offerStatus === 'pending').length
    const acceptedCount = allOffers.filter(r => r.value.offerStatus === 'accepted').length
    const expiredCount = allOffers.filter(r => r.value.offerStatus === 'expired').length

    const pendingEl = document.querySelector(`[data-count-status="pending"]`)
    if (pendingEl) pendingEl.textContent = pendingCount

    const acceptedEl = document.querySelector(`[data-count-status="accepted"]`)
    if (acceptedEl) acceptedEl.textContent = acceptedCount

    const expiredEl = document.querySelector(`[data-count-status="expired"]`)
    if (expiredEl) expiredEl.textContent = expiredCount
  } catch (e) { /* ignore */ }
}
