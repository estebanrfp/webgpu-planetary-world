/**
 * Inventory Title Update Module
 * @module modules/inventory/titleUpdate
 *
 * Handles inline renaming of inventory items.
 */

// Dependencies injected via init
let db = null

/**
 * Initialize title update module with dependencies
 * @param {Object} deps - Dependencies
 */
export function initInventoryTitleUpdate(deps) {
  db = deps.db
}

/**
 * Update inventory item title (for inline rename)
 * Uses db.get() which returns { result: data } format
 * @param {string} itemId - Item ID to update
 * @param {string} newTitle - New title for the item
 * @returns {Promise<boolean>} Success status
 */
export async function updateInventoryItemTitle(itemId, newTitle) {
  if (!db) return false

  try {
    const response = await db.get(itemId)
    const item = response?.result?.value ?? response?.result

    if (item && typeof item === 'object') {
      // Preserve status - derive from old fields if missing
      const status = item.status || (item.isBundle ? 'bundle' : (item.listed ? (item.listingType || 'sale') : 'unlisted'))
      const updatedItem = { ...item, title: newTitle, name: newTitle, status }
      await db.put(updatedItem, itemId)

      // Update the card in the grid if visible
      const card = document.querySelector(`.mp-card-inventory[data-item-id="${itemId}"]`)
      if (card) {
        const nameEl = card.querySelector('.mp-card-title')
        if (nameEl) nameEl.textContent = newTitle
        card.dataset.title = newTitle
      }

      // Also update table row if in table view
      const row = document.querySelector(`.mp-table-row[data-item-id="${itemId}"]`)
      if (row) {
        const titleEl = row.querySelector('.mp-table-item-title')
        if (titleEl) titleEl.textContent = newTitle
        row.dataset.title = newTitle
      }

      return true
    }
  } catch (error) {
    // Rename failed silently
  }
  return false
}

/**
 * Setup window export for inventory title update
 */
export function setupInventoryTitleExports() {
  window.updateInventoryItemTitle = updateInventoryItemTitle
}
