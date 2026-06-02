/**
 * Inventory Rendering
 * @module modules/inventory/rendering
 *
 * EXACT COPY of app-core.js inventory rendering functions.
 * Dependencies are passed via init function or imported from core.
 */

import { appState } from '../../store/appState.js'
import { NO_IMAGE } from '../../core/constants.js'
import { getStatusBadge, isHash, getGroupKey } from '../../core/rendering/utils.js'
import { getInventoryTableHeader } from '../../core/rendering/headers.js'

// Database reference set via init
let db = null

/**
 * Initialize inventory rendering with dependencies
 * @param {object} deps - Dependencies
 * @param {object} deps.db - GenosDB instance
 */
export function initInventoryRendering(deps) {
  db = deps.db
}

/**
 * Create a virtual expanded card (represents 1 unit of multi-supply asset)
 * EXACT COPY of app-core.js lines 1702-1774
 */
export function createExpandedCard(assetId, data, index, totalSupply, status) {
  const card = document.createElement('article')
  const title = data.title || data.name || 'Untitled'
  const collection = data.collection || 'Marketplace'
  const image = data.image || NO_IMAGE
  const isListed = status !== 'unlisted'

  // Virtual item ID for selection (unique per unit)
  const virtualId = `${assetId}:unit:${index}`
  const isSelected = window.selectedInventoryItems?.has(virtualId)

  // Status badge - using imported getStatusBadge from core/rendering/utils.js
  const statusBadgeHtml = getStatusBadge(status)

  // Action button based on status
  const getActionButton = () => {
    if (isListed) {
      return `<button class="mp-card-btn mp-card-btn-edit">Edit</button>`
    }
    return `<button class="mp-card-btn list">List</button>`
  }

  card.className = `mp-card mp-card-inventory mp-expanded-item${isListed ? ' listed' : ''}${window.inventorySelectMode ? ' batch-mode' : ''}${isSelected ? ' batch-selected' : ''}`
  card.dataset.itemId = virtualId
  card.dataset.realAssetId = assetId
  card.dataset.title = title
  card.dataset.collection = collection
  card.dataset.image = image
  card.dataset.unitIndex = index
  card.innerHTML = `
    <div class="mp-batch-checkbox">&#10003;</div>
    <div class="mp-card-image">
      <img src="${image}" alt="${title}" loading="lazy">
      <div class="mp-card-badges">${statusBadgeHtml}</div>
      <span class="mp-expanded-index">#${index}/${totalSupply}</span>
    </div>
    <div class="mp-card-content">
      <div class="mp-card-collection">${collection}</div>
      <h3 class="mp-card-title">${title}</h3>
      <div class="mp-card-footer">
        <span class="mp-meta-qty">Unit ${index}</span>
        ${getActionButton()}
      </div>
    </div>
  `

  // Click on card → select if Select mode, otherwise open Asset Details
  const tokenId = String(data.tokenId ?? data.assetId ?? assetId).replace(/^asset_/, '')
  card.addEventListener('click', (e) => {
    if (e.target.closest('.mp-card-btn')) return
    if (window.inventorySelectMode) {
      window.toggleBatchSelection(card)
    } else {
      window.openAssetDetailPanel?.(assetId, { ...data, id: assetId, tokenId })
    }
  })

  // Click on action button
  const actionBtn = card.querySelector('.mp-card-btn')
  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (isListed) {
      // Edit listing
      if (status === 'sale') window.wizards?.editSale?.({ ...data, id: assetId, tokenId })
      else if (status === 'auction') window.wizards?.editAuction?.({ ...data, id: assetId, tokenId })
      else if (status === 'rent') window.wizards?.editRental?.({ ...data, id: assetId, tokenId })
    } else {
      // Open Choose Action modal
      window.openListModal?.({ ...data, id: assetId, tokenId, presetAmount: 1 })
    }
  })

  return card
}

/**
 * Create a virtual expanded table row (represents 1 unit of multi-supply asset)
 * EXACT COPY of app-core.js lines 1779-1873
 */
export function createExpandedTableRow(assetId, data, index, totalSupply, status) {
  const row = document.createElement('div')
  const title = data.title || data.name || 'Untitled'
  const collection = data.collection || 'Marketplace'
  const image = data.image || NO_IMAGE
  const category = (data.category || 'objects').toLowerCase()
  const rarity = (data.rarity || 'common').toLowerCase()
  const isListed = status !== 'unlisted'

  // Virtual item ID for selection (unique per unit)
  const virtualId = `${assetId}:unit:${index}`
  const isSelected = window.selectedInventoryItems?.has(virtualId)

  // Status info
  const getStatusInfo = () => {
    switch (status) {
      case 'sale': return { class: 'for-sale', text: 'For Sale' }
      case 'rent': return { class: 'for-rent', text: 'For Rent' }
      case 'auction': return { class: 'auction', text: 'Auction' }
      default: return { class: 'unlisted', text: 'Unlisted' }
    }
  }
  const statusInfo = getStatusInfo()

  // Action button based on status
  const getActionButton = () => {
    if (isListed) {
      return `<button class="mp-table-action-btn edit">Edit</button>`
    }
    return `<button class="mp-table-action-btn list">List</button>`
  }

  row.className = `mp-table-row mp-expanded-item${isListed ? ' listed' : ''}${window.inventorySelectMode ? ' batch-mode' : ''}${isSelected ? ' batch-selected' : ''}`
  row.dataset.itemId = virtualId
  row.dataset.realAssetId = assetId
  row.dataset.title = title
  row.dataset.collection = collection
  row.dataset.image = image
  row.dataset.unitIndex = index
  row.innerHTML = `
    <div class="mp-batch-checkbox">&#10003;</div>
    <div class="mp-table-item">
      <div class="mp-table-avatar">
        <img src="${image}" alt="${title}" loading="lazy">
        <span class="mp-expanded-index-badge">${index}</span>
      </div>
      <div class="mp-table-item-info">
        <div class="mp-table-item-title">${title}</div>
        <div class="mp-table-item-collection">${collection}</div>
      </div>
    </div>
    <div class="mp-table-cell mp-table-category-cell">
      <span class="mp-table-category ${category}">${category.charAt(0).toUpperCase() + category.slice(1)}</span>
    </div>
    <div class="mp-table-cell mp-table-rarity-cell">
      <span class="mp-table-rarity ${rarity}">${rarity}</span>
    </div>
    <div class="mp-table-cell mp-table-qty">
      <span class="mp-qty-badge">#${index}/${totalSupply}</span>
    </div>
    <div class="mp-table-cell mp-table-status-cell">
      <span class="mp-table-status-badge ${statusInfo.class}">${statusInfo.text}</span>
    </div>
    <div class="mp-table-cell mp-table-action-cell">
      ${getActionButton()}
    </div>
  `

  // Click on row → select if Select mode, otherwise open Asset Details
  const tokenId = String(data.tokenId ?? data.assetId ?? assetId).replace(/^asset_/, '')
  row.addEventListener('click', (e) => {
    if (e.target.closest('.mp-table-action-btn')) return
    if (window.inventorySelectMode) {
      window.toggleBatchSelection(row)
    } else {
      window.openAssetDetailPanel?.(assetId, { ...data, id: assetId, tokenId })
    }
  })

  // Click on action button
  const actionBtn = row.querySelector('.mp-table-action-btn')
  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (isListed) {
      // Edit listing
      if (status === 'sale') window.wizards?.editSale?.({ ...data, id: assetId, tokenId })
      else if (status === 'auction') window.wizards?.editAuction?.({ ...data, id: assetId, tokenId })
      else if (status === 'rent') window.wizards?.editRental?.({ ...data, id: assetId, tokenId })
    } else {
      // Open Choose Action modal
      window.openListModal?.({ ...data, id: assetId, tokenId, presetAmount: 1 })
    }
  })

  return row
}

/**
 * Create a grouped inventory card (shows summary, click to filter)
 * EXACT COPY of app-core.js lines 1880-1971
 */
export function createInventoryGroup(groupId, items) {
  const group = document.createElement('article')
  group.className = 'mp-card mp-card-inventory mp-inventory-group'
  group.dataset.groupId = groupId

  // Calculate totals
  const firstItem = items[0].value
  // isHash imported from core/rendering/utils.js
  const title = (firstItem.title && !isHash(firstItem.title)) ? firstItem.title
    : (firstItem.name && !isHash(firstItem.name)) ? firstItem.name
    : 'Untitled Item'
  const collection = (firstItem.collection && !isHash(firstItem.collection)) ? firstItem.collection : 'Marketplace'
  const image = firstItem.image || NO_IMAGE

  let totalSupply = 0
  let unlistedCount = 0
  const statusBreakdown = {}

  for (const item of items) {
    const supply = item.value.supply || 1
    const status = item.value.status || 'unlisted'
    totalSupply += supply
    if (status === 'unlisted') {
      unlistedCount += supply
    } else {
      statusBreakdown[status] = (statusBreakdown[status] || 0) + supply
    }
  }

  // Build status summary
  const statusParts = []
  if (unlistedCount > 0) statusParts.push(`${unlistedCount} available`)
  for (const [status, count] of Object.entries(statusBreakdown)) {
    const label = status === 'sale' ? 'for sale' : status === 'auction' ? 'in auction' : status === 'rent' ? 'for rent' : status
    statusParts.push(`${count} ${label}`)
  }

  group.innerHTML = `
    <div class="mp-card-image">
      <img src="${image}" alt="${title}" loading="lazy">
      <span class="mp-inventory-supply-badge">x${totalSupply}</span>
    </div>
    <div class="mp-card-content">
      <div class="mp-card-collection">${collection}</div>
      <h3 class="mp-card-title">${title}</h3>
      <div class="mp-card-footer">
        <div class="mp-group-summary">${statusParts.join(' · ')}</div>
        <button class="mp-card-btn mp-btn-expand">Expand</button>
      </div>
    </div>
  `

  // Store first item data for detail panel
  const firstItemId = items[0].id
  const firstTokenId = String(items[0].value.tokenId ?? items[0].value.assetId ?? firstItemId).replace(/^asset_/, '')
  const firstItemData = { id: firstItemId, ...items[0].value, tokenId: firstTokenId }

  // Determine if should go directly to Level 2 (virtual units):
  // - Single record with supply > 1, OR
  // - All items have the same status (no need for Level 1 breakdown)
  const statusCount = Object.keys(statusBreakdown).length
  const allSameStatus = (statusCount === 0 && unlistedCount > 0) || (statusCount === 1 && unlistedCount === 0)
  const shouldSkipLevel1 = items.length === 1 || allSameStatus
  const itemsWithId = items.map(i => ({ id: i.id, ...i.value }))

  // Click on card → expand if Select mode, otherwise open Asset Details
  group.addEventListener('click', () => {
    if (window.inventorySelectMode) {
      // In Select mode, click on group expands to show individual items
      if (shouldSkipLevel1) {
        window.expandAsset(groupId, itemsWithId)
      } else {
        window.filterInventoryByGroup(groupId, title)
      }
    } else {
      window.openAssetDetailPanel?.(firstItemId, firstItemData)
    }
  })

  // Click on Expand button → expand to show individual items
  group.querySelector('.mp-btn-expand').addEventListener('click', (e) => {
    e.stopPropagation()
    if (shouldSkipLevel1) {
      // Same status or single record: go directly to Level 2 (virtual units)
      window.expandAsset(groupId, itemsWithId)
    } else {
      // Mixed statuses: go to Level 1 (filter by tokenId to see breakdown)
      window.filterInventoryByGroup(groupId, title)
    }
  })

  return group
}

/**
 * Create a grouped inventory table row (shows summary, click to filter)
 * EXACT COPY of app-core.js lines 1976-2089
 */
export function createInventoryGroupRow(groupId, items) {
  const row = document.createElement('div')
  row.className = 'mp-table-row mp-inventory-group-row'
  row.dataset.groupId = groupId

  // Calculate totals
  const firstItem = items[0].value
  // isHash imported from core/rendering/utils.js
  const title = (firstItem.title && !isHash(firstItem.title)) ? firstItem.title
    : (firstItem.name && !isHash(firstItem.name)) ? firstItem.name
    : 'Untitled Item'
  const collection = (firstItem.collection && !isHash(firstItem.collection)) ? firstItem.collection : 'Marketplace'
  const image = firstItem.image || NO_IMAGE
  const category = (firstItem.category || 'objects').toLowerCase()
  const rarity = (firstItem.rarity || 'common').toLowerCase()

  let totalSupply = 0
  let unlistedCount = 0
  const statusBreakdown = {}

  for (const item of items) {
    const supply = item.value.supply || 1
    const status = item.value.status || 'unlisted'
    totalSupply += supply
    if (status === 'unlisted') {
      unlistedCount += supply
    } else {
      statusBreakdown[status] = (statusBreakdown[status] || 0) + supply
    }
  }

  // Determine if all items have same status
  const statusCount = Object.keys(statusBreakdown).length
  const allSameStatus = (statusCount === 0 && unlistedCount > 0) || (statusCount === 1 && unlistedCount === 0)

  // Status badge: show actual status if all same, otherwise "Mixed"
  const getStatusBadgeLocal = () => {
    if (allSameStatus) {
      if (unlistedCount > 0) return `<span class="mp-table-status-badge unlisted">Unlisted</span>`
      const status = Object.keys(statusBreakdown)[0]
      if (status === 'sale') return `<span class="mp-table-status-badge for-sale">For Sale</span>`
      if (status === 'auction') return `<span class="mp-table-status-badge auction">Auction</span>`
      if (status === 'rent') return `<span class="mp-table-status-badge for-rent">For Rent</span>`
      return `<span class="mp-table-status-badge">${status}</span>`
    }
    return `<span class="mp-table-status-badge mixed">Mixed</span>`
  }

  row.innerHTML = `
    <div class="mp-table-item">
      <div class="mp-table-avatar">
        <img src="${image}" alt="${title}" loading="lazy">
      </div>
      <div class="mp-table-item-info">
        <div class="mp-table-item-title">${title}</div>
        <div class="mp-table-item-collection">${collection}</div>
      </div>
    </div>
    <div class="mp-table-cell mp-table-category-cell">
      <span class="mp-table-category ${category}">${category.charAt(0).toUpperCase() + category.slice(1)}</span>
    </div>
    <div class="mp-table-cell mp-table-rarity-cell">
      <span class="mp-table-rarity ${rarity}">${rarity}</span>
    </div>
    <div class="mp-table-cell mp-table-qty">
      <span class="mp-qty-badge multiple">x${totalSupply}</span>
    </div>
    <div class="mp-table-cell mp-table-status-cell">
      ${getStatusBadgeLocal()}
    </div>
    <div class="mp-table-cell mp-table-action-cell">
      <button class="mp-table-action-btn expand">Expand</button>
    </div>
  `

  // Store first item data for detail panel
  const firstItemId = items[0].id
  const firstTokenId = String(items[0].value.tokenId ?? items[0].value.assetId ?? firstItemId).replace(/^asset_/, '')
  const firstItemData = { id: firstItemId, ...items[0].value, tokenId: firstTokenId }

  // Determine if should go directly to Level 2 (virtual units):
  // - Single record with supply > 1, OR
  // - All items have the same status (no need for Level 1 breakdown)
  const shouldSkipLevel1 = items.length === 1 || allSameStatus
  const itemsWithId = items.map(i => ({ id: i.id, ...i.value }))

  // Click on row → expand if Select mode, otherwise open Asset Details
  row.addEventListener('click', (e) => {
    if (e.target.closest('.mp-table-action-btn')) return
    if (window.inventorySelectMode) {
      // In Select mode, click on group expands to show individual items
      if (shouldSkipLevel1) {
        window.expandAsset(groupId, itemsWithId)
      } else {
        window.filterInventoryByGroup(groupId, title)
      }
    } else {
      window.openAssetDetailPanel?.(firstItemId, firstItemData)
    }
  })

  // Click on Expand button → expand to show individual items
  row.querySelector('.mp-table-action-btn.expand').addEventListener('click', (e) => {
    e.stopPropagation()
    if (shouldSkipLevel1) {
      // Same status or single record: go directly to Level 2 (virtual units)
      window.expandAsset(groupId, itemsWithId)
    } else {
      // Mixed statuses: go to Level 1 (filter by tokenId to see breakdown)
      window.filterInventoryByGroup(groupId, title)
    }
  })

  return row
}

/**
 * Create inventory card
 * EXACT COPY of app-core.js lines 2113-2231
 */
export function createInventoryCard(id, data) {
  const card = document.createElement('article')
  const isSelected = window.selectedInventoryItems?.has(id)
  // Compatibility: check both new status field and old listed field
  const isListed = data.status ? data.status !== 'unlisted' : (data.listed === true)

  // Ensure required fields exist - avoid using hash as title
  // isHash imported from core/rendering/utils.js
  const title = (data.title && !isHash(data.title)) ? data.title
    : (data.name && !isHash(data.name)) ? data.name
    : 'Untitled Item'
  const collection = (data.collection && !isHash(data.collection)) ? data.collection : 'Marketplace'
  const image = data.image || NO_IMAGE

  const supply = data.supply || 1
  // Compatibility: get status from new field or derive from old fields
  const status = data.status || (data.isBundle ? 'bundle' : (data.listed ? (data.listingType || 'sale') : 'unlisted'))

  card.className = `mp-card mp-card-inventory${isListed ? ' listed' : ''}${window.inventorySelectMode ? ' batch-mode' : ''}${isSelected ? ' batch-selected' : ''}`
  // Hash from db.map() - this is the key for all operations
  card.dataset.itemId = id
  card.dataset.title = title
  card.dataset.collection = collection
  card.dataset.image = image
  card.dataset.status = status
  const isBundle = data.isBundle || false
  const bundleItems = data.bundleItems || []
  const price = data.price || null
  card.dataset.price = price || ''

  // Status badge - unified status field
  const getStatusBadgeLocal = () => {
    switch (status) {
      case 'sale': return `<span class="mp-badge mp-badge-sale">Sale</span>`
      case 'rent': return `<span class="mp-badge mp-badge-rent">Rent</span>`
      case 'auction': return `<span class="mp-badge mp-badge-auction">Auction</span>`
      case 'bundle': return `<span class="mp-badge mp-badge-sale">Bundle</span>`
      case 'rented-in': return `<span class="mp-badge mp-badge-rented">Rented</span>`
      default: return `<span class="mp-badge mp-badge-unlisted">Unlisted</span>`
    }
  }

  // Supply badge: each record now has its own supply (unlisted = available, listed = for sale)
  const supplyBadge = supply > 1 ? `<span class="mp-inventory-supply-badge">x${supply}</span>` : ''

  // Action button - reads data from card.dataset
  const getActionButton = () => {
    if (status === 'bundle') {
      return `<button class="mp-card-btn mp-card-btn-edit" onclick="event.stopPropagation(); window.openEditFromCard(this, 'bundle')">Edit</button>`
    }
    if (status === 'unlisted') {
      // For multi-supply assets, show Expand to view details first
      if (supply > 1) {
        return `<button class="mp-card-btn mp-btn-expand">Expand</button>`
      }
      return `<button class="mp-card-btn list" onclick="event.stopPropagation(); window.openListFromCard(this)">List</button>`
    }
    if (status === 'rented-in') {
      return `<button class="mp-card-btn mp-card-btn-extend" onclick="event.stopPropagation(); window.openExtendFromCard(this)">Extend</button>`
    }
    return `<button class="mp-card-btn mp-card-btn-edit" onclick="event.stopPropagation(); window.openEditFromCard(this)">Edit</button>`
  }

  card.innerHTML = `
    <div class="mp-batch-checkbox">&#10003;</div>
    <div class="mp-card-image">
      <img src="${image}" alt="${title}" loading="lazy">
      <div class="mp-card-badges">${getStatusBadgeLocal()}</div>
      ${supplyBadge}
    </div>
    <div class="mp-card-content">
      <div class="mp-card-collection">${collection}</div>
      <h3 class="mp-card-title">${title}</h3>
      <div class="mp-card-footer">
        <div class="mp-card-meta">
          <span class="mp-meta-qty">${isBundle ? `📦 ${bundleItems.length || '?'}` : (supply > 1 ? `x${supply}` : '')}</span>
        </div>
        ${getActionButton()}
      </div>
    </div>
  `
  card.onclick = async (e) => {
    if (e.target.closest('.mp-btn-expand')) return
    if (window.inventorySelectMode) {
      window.toggleBatchSelection(card)
    } else {
      // Fetch fresh data from DB to get latest values
      const response = await db.get(id)
      const freshData = response?.result?.value ?? response?.result
      // Inventory view uses asset detail panel (owner)
      // Merge fresh data with original data, ensure status is normalized
      const mergedData = { ...data, ...freshData }
      // Normalize status for compatibility with old data
      const normalizedStatus = mergedData.status || (mergedData.isBundle ? 'bundle' : (mergedData.listed ? (mergedData.listingType || 'sale') : 'unlisted'))
      const assetData = {
        ...mergedData,
        id,
        tokenId: String(mergedData.tokenId ?? mergedData.assetId ?? id).replace(/^asset_/, ''),
        status: normalizedStatus,
        title: mergedData.title || mergedData.name || title,
        collection: mergedData.collection || collection
      }
      window.openAssetDetailPanel?.(id, assetData)
    }
  }

  // For multi-supply assets, Expand button shows individual units
  const expandBtn = card.querySelector('.mp-btn-expand')
  if (expandBtn) {
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      // Use same grouping logic: title::collection
      const groupKey = getGroupKey(id, data)
      const cachedItems = appState.inventoryGroupsCache.get(groupKey) || [{ id, ...data }]
      window.expandAsset(groupKey, cachedItems)
    })
  }

  return card
}

/**
 * Create table row for Inventory items (list view)
 * EXACT COPY of app-core.js lines 2238-2372
 */
export function createInventoryTableRow(id, data) {
  const row = document.createElement('div')
  const isSelected = window.selectedInventoryItems?.has(id)
  // Compatibility: check both new status field and old listed field
  const isListed = data.status ? data.status !== 'unlisted' : (data.listed === true)

  // Ensure required fields exist - avoid using hash as title
  // isHash imported from core/rendering/utils.js
  const title = (data.title && !isHash(data.title)) ? data.title
    : (data.name && !isHash(data.name)) ? data.name
    : 'Untitled Item'
  const collection = (data.collection && !isHash(data.collection)) ? data.collection : 'Marketplace'
  const image = data.image || NO_IMAGE

  const rarity = (data.rarity || 'common').toLowerCase()
  const category = (data.category || 'objects').toLowerCase()
  // Compatibility: get status from new field or derive from old fields
  const status = data.status || (data.isBundle ? 'bundle' : (data.listed ? (data.listingType || 'sale') : 'unlisted'))
  const supply = data.supply || 1
  const price = data.price || null
  const isBundle = status === 'bundle' || data.isBundle
  const bundleItems = data.bundleItems || []

  row.className = `mp-table-row${isListed ? ' listed' : ''}${window.inventorySelectMode ? ' batch-mode' : ''}${isSelected ? ' batch-selected' : ''}`
  // Hash from db.map() - this is the key for all operations
  row.dataset.itemId = id
  row.dataset.title = title
  row.dataset.collection = collection
  row.dataset.image = image
  row.dataset.status = status
  row.dataset.price = price || ''
  if (isBundle && bundleItems.length) {
    row.dataset.bundleItems = JSON.stringify(bundleItems)
  }

  // Status badge - unified status field
  const getStatusInfo = () => {
    switch (status) {
      case 'sale': return { class: 'for-sale', text: 'For Sale' }
      case 'rent': return { class: 'for-rent', text: 'For Rent' }
      case 'auction': return { class: 'auction', text: 'Auction' }
      case 'bundle': return { class: 'for-sale', text: 'Bundle' }
      case 'rented-in': return { class: 'rented-in', text: 'Rented' }
      default: return { class: 'unlisted', text: 'Unlisted' }
    }
  }
  const statusInfo = getStatusInfo()

  // Action button - reads data from row.dataset
  const getActionButton = () => {
    if (status === 'bundle') {
      return `<button class="mp-table-action-btn edit" onclick="event.stopPropagation(); window.openEditFromCard(this, 'bundle')">Edit</button>`
    }
    if (status === 'unlisted') {
      // For multi-supply assets, show Expand to view details first
      if (supply > 1) {
        return `<button class="mp-table-action-btn expand">Expand</button>`
      }
      return `<button class="mp-table-action-btn list" onclick="event.stopPropagation(); window.openListFromCard(this)">List</button>`
    }
    if (status === 'rented-in') {
      return `<button class="mp-table-action-btn extend" onclick="event.stopPropagation(); window.openExtendFromCard(this)">Extend</button>`
    }
    return `<button class="mp-table-action-btn edit" onclick="event.stopPropagation(); window.openEditFromCard(this)">Edit</button>`
  }

  // For bundles, show box icon with item count
  const displayQty = isBundle ? `📦 ${bundleItems.length || '?'}` : `x${supply}`
  // For bundles, show "Bundle" as category
  const displayCategory = isBundle ? 'bundle' : category
  const displayCategoryLabel = isBundle ? 'Bundle' : category.charAt(0).toUpperCase() + category.slice(1)

  row.innerHTML = `
    <div class="mp-table-item">
      <div class="mp-table-avatar">
        <img src="${image}" alt="${title}" loading="lazy">
      </div>
      <div class="mp-table-item-info">
        <div class="mp-table-item-title">${title}</div>
        <div class="mp-table-item-collection">${collection}</div>
      </div>
    </div>
    <div class="mp-table-cell mp-table-category-cell">
      <span class="mp-table-category ${displayCategory}">${displayCategoryLabel}</span>
    </div>
    <div class="mp-table-cell mp-table-rarity-cell">
      <span class="mp-table-rarity ${rarity}">${rarity}</span>
    </div>
    <div class="mp-table-cell mp-table-qty">
      <span class="mp-qty-badge${isBundle || supply > 1 ? ' multiple' : ''}">${displayQty}</span>
    </div>
    <div class="mp-table-cell mp-table-status-cell">
      <span class="mp-table-status-badge ${statusInfo.class}">${statusInfo.text}</span>
    </div>
    <div class="mp-table-cell mp-table-action-cell">
      ${getActionButton()}
    </div>
  `

  row.onclick = async (e) => {
    if (e.target.closest('.mp-table-action-btn')) return
    if (window.inventorySelectMode) {
      window.toggleBatchSelection(row)
    } else {
      // Fetch fresh data from DB to get latest values
      const response = await db.get(id)
      const freshData = response?.result?.value ?? response?.result
      // Inventory view uses asset detail panel (owner)
      const mergedData = { ...data, ...freshData }
      const normalizedStatus = mergedData.status || (mergedData.isBundle ? 'bundle' : (mergedData.listed ? (mergedData.listingType || 'sale') : 'unlisted'))
      const assetData = {
        ...mergedData,
        id,
        tokenId: String(mergedData.tokenId ?? mergedData.assetId ?? id).replace(/^asset_/, ''),
        status: normalizedStatus,
        title: mergedData.title || mergedData.name || title,
        collection: mergedData.collection || collection
      }
      window.openAssetDetailPanel?.(id, assetData)
    }
  }

  // For multi-supply assets, Expand button shows individual units
  const expandBtn = row.querySelector('.mp-table-action-btn.expand')
  if (expandBtn) {
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      // Use same grouping logic: title::collection
      const groupKey = getGroupKey(id, data)
      const cachedItems = appState.inventoryGroupsCache.get(groupKey) || [{ id, ...data }]
      window.expandAsset(groupKey, cachedItems)
    })
  }

  return row
}

/**
 * Render expanded asset view (shows all units of a multi-supply asset)
 * EXACT COPY of app-core.js function renderExpandedAsset
 */
export function renderExpandedAsset() {
  if (!appState.expandedGroupItems.length) return

  const isTableMode = appState.inventoryViewMode === 'table-expanded'
  appState.elements.gridContainer.className = isTableMode ? 'mp-table-view inventory-table' : 'mp-card-grid'
  appState.elements.gridContainer.innerHTML = isTableMode ? getInventoryTableHeader(appState.viewPagination.inventory) : ''

  const totalSupply = appState.expandedGroupItems.reduce((sum, item) => sum + (item.supply || 1), 0)
  let globalIndex = 0

  for (const item of appState.expandedGroupItems) {
    const supply = item.supply || 1
    const status = item.status || 'unlisted'

    for (let i = 1; i <= supply; i++) {
      globalIndex++
      const virtualData = { ...item, supply: 1, virtualIndex: globalIndex }
      const element = isTableMode
        ? createExpandedTableRow(item.id, virtualData, globalIndex, totalSupply, status)
        : createExpandedCard(item.id, virtualData, globalIndex, totalSupply, status)
      appState.elements.gridContainer.appendChild(element)
    }
  }

  document.getElementById('paginationBar').style.display = 'none'
}
