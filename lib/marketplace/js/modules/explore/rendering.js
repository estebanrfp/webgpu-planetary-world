/**
 * Explore View Rendering
 * @module modules/explore/rendering
 *
 * EXACT COPY of app-core.js createItemElement and createExploreTableRow
 * Dependencies are passed via init function or imported.
 */

import { formatTimeRemaining } from '../../core/time.js'
import { STATUS_BADGES, getButtonConfig } from '../../core/rendering/utils.js'
import { OVG_USD_RATE } from '../../core/constants.js'

/**
 * Create card element for Explore grid view
 * EXACT COPY of app-core.js lines 312-421
 * @param {string} id - Item ID
 * @param {object} value - Item data
 * @param {number} pageNumber - Current page number
 * @returns {HTMLElement} Card element
 */
export function createItemElement(id, value, pageNumber) {
  // Use status field (unified model) with fallback to type for compatibility
  const itemStatus = value.status || value.type || 'sale'
  const { btnText, btnTextFull, btnClass } = getButtonConfig(itemStatus)

  // Generate bundle items for bundle type
  const bundleItems = itemStatus === 'bundle' ? (value.bundleItems || [
    { name: `${value.title} - Item 1`, collection: value.collection, price: ((value.priceNum || 1) * 0.4).toFixed(2), image: `https://picsum.photos/seed/${id}a/60/60` },
    { name: `${value.title} - Item 2`, collection: value.collection, price: ((value.priceNum || 1) * 0.35).toFixed(2), image: `https://picsum.photos/seed/${id}b/60/60` },
    { name: `${value.title} - Item 3`, collection: value.collection, price: ((value.priceNum || 1) * 0.25).toFixed(2), image: `https://picsum.photos/seed/${id}c/60/60` }
  ]) : []

  // Build onclick handler based on type
  const tokenId = String(value.tokenId ?? value.assetId ?? id).replace(/^asset_/, '')
  const itemData = JSON.stringify({
    id,
    tokenId,
    assetId: tokenId,
    title: value.title || 'Untitled',
    name: value.title || 'Untitled',
    collection: value.collection || 'Unknown',
    image: value.image || `https://picsum.photos/seed/${id}/400/400`,
    price: value.price || '0 OVG',
    duration: value.duration ?? 0,
    dailyRate: value.dailyRate || 0.1,
    currentBid: value.priceNum || 2.3,
    timeLeft: formatTimeRemaining(value.endsAt),
    startPrice: (value.priceNum * 0.5) || 1.0,
    reservePrice: (value.priceNum * 2) || 5.0,
    items: bundleItems
  }).replace(/"/g, '&quot;')

  let btnOnclick = ''
  if (itemStatus === 'auction') {
    btnOnclick = `event.stopPropagation(); openBidModal('auction', JSON.parse(this.dataset.itemData))`
  } else if (itemStatus === 'rent') {
    btnOnclick = `event.stopPropagation(); openRentModal(JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))`
  } else if (itemStatus === 'bundle') {
    btnOnclick = `event.stopPropagation(); openBundleBuyModal(JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))`
  } else {
    btnOnclick = `event.stopPropagation(); openBuyModal(JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))`
  }

  const article = document.createElement('article')
  const isSelected = window.selectedBatchBuyItems?.has(id)
  const itemType = itemStatus
  // In batch mode, filter ensures only 'sale' items are loaded
  article.className = `mp-card${window.batchBuyMode ? ' batch-mode' : ''}${isSelected ? ' batch-selected' : ''}`
  article.dataset.itemId = id
  article.dataset.page = pageNumber
  article.dataset.title = value.title || 'Untitled'
  article.dataset.collection = value.collection || 'Unknown'
  article.dataset.image = value.image || `https://picsum.photos/seed/${id}/400/400`
  article.dataset.price = value.price || '0 OVG'
  article.dataset.priceNum = value.priceNum || 0
  article.dataset.timestamp = value.timestamp || Date.now()
  article.dataset.views = value.views || 0
  article.dataset.likes = value.likes || 0
  article.dataset.type = itemType
  article.onclick = () => {
    if (window.batchBuyMode) {
      window.toggleBatchBuySelection(article)
    } else {
      // Explore view uses listing detail panel
      window.openListingDetailPanel?.(id, value)
    }
  }

  const isFav = window.favoriteItems?.has(id)
  const isInventory = window.getCurrentView?.() === 'inventory'
  const favoriteBtn = isInventory ? '' : `<button class="mp-card-action-btn mp-favorite-btn${isFav ? ' active' : ''}" onclick="toggleFavorite('${id}', event)" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '&#9829;' : '&#9825;'}</button>`

  // Format price with OVG suffix and calculate USD
  const priceNum = parseFloat(value.priceNum) || parseFloat(value.price) || 0
  const priceOvg = value.price?.toString().includes('OVG') ? value.price : `${priceNum.toFixed(2)} OVG`
  const priceUsd = value.priceUsd || (priceNum > 0 ? `~$${Math.floor(priceNum * OVG_USD_RATE).toLocaleString()}` : '')

  // Show supply badge for ERC-1155 listings with multiple copies
  const listingSupply = value.supply || 1
  const supplyBadge = listingSupply > 1 ? `<span class="mp-inventory-supply-badge">x${listingSupply}</span>` : ''

  article.innerHTML = `
    <div class="mp-batch-checkbox">&#10003;</div>
    <div class="mp-card-image">
      <img src="${value.image || `https://picsum.photos/seed/${id}/400/400`}" alt="${value.title}" loading="lazy">
      <div class="mp-card-badges">${STATUS_BADGES[value.rarity] || STATUS_BADGES[itemStatus] || ''}</div>
      ${(() => {
        if (itemStatus !== 'auction') return ''
        const endsAt = value.endsAt || (value.listedAt ? value.listedAt + 3 * 24 * 60 * 60 * 1000 : (value.timestamp ? value.timestamp + 3 * 24 * 60 * 60 * 1000 : Date.now() + 3 * 24 * 60 * 60 * 1000))
        return `<div class="mp-auction-timer"><span class="mp-timer-label">Ends in</span><span class="mp-timer-value" data-ends-at="${endsAt}">${formatTimeRemaining(endsAt)}</span></div>`
      })()}
      ${supplyBadge}
      ${favoriteBtn ? `<div class="mp-card-actions">${favoriteBtn}</div>` : ''}
    </div>
    <div class="mp-card-content">
      <div class="mp-card-collection">${value.collection || 'Unknown'}</div>
      <h3 class="mp-card-title">${value.title || 'Untitled'}</h3>
      <div class="mp-card-footer">
        <div class="mp-card-price"><span class="mp-price-value">${priceOvg}</span><span class="mp-price-usd">${priceUsd}</span></div>
        <button class="mp-card-btn ${btnClass}" data-item-data="${itemData}" onclick="${btnOnclick}">${btnText}</button>
      </div>
      <div class="mp-list-meta"><span>&#128065; ${value.views || 0}</span><span>&#9829; ${value.likes || 0}</span><span>${value.listed || 'Listed recently'}</span></div>
    </div>
    <div class="mp-list-actions">
      <button class="mp-card-btn ${btnClass}" data-item-data="${itemData}" onclick="${btnOnclick}">${btnTextFull}</button>
      ${favoriteBtn ? `<div class="mp-card-actions">${favoriteBtn}</div>` : ''}
    </div>
  `
  return article
}

/**
 * Create table row for Explore list view
 * EXACT COPY of app-core.js lines 436-538
 * @param {string} id - Item ID
 * @param {object} value - Item data
 * @param {number} pageNumber - Current page number
 * @returns {HTMLElement} Row element
 */
export function createExploreTableRow(id, value, pageNumber) {
  const row = document.createElement('div')
  const saleType = value.status || value.type || 'sale'
  const isSelected = window.selectedBatchBuyItems?.has(id)
  // In batch mode, filter ensures only 'sale' items are loaded
  row.className = `mp-table-row${window.batchBuyMode ? ' batch-mode' : ''}${isSelected ? ' batch-selected' : ''}`
  row.dataset.itemId = id
  row.dataset.page = pageNumber
  row.dataset.title = value.title || 'Untitled'
  row.dataset.collection = value.collection || 'Unknown'
  row.dataset.image = value.image || `https://picsum.photos/seed/${id}/400/400`
  row.dataset.price = value.price || '0 OVG'
  row.dataset.priceNum = value.priceNum || 0
  row.dataset.timestamp = value.timestamp || Date.now()
  row.dataset.views = value.views || 0
  row.dataset.likes = value.likes || 0
  row.dataset.type = saleType

  const isFav = window.favoriteItems?.has(id)
  const isInventory = window.getCurrentView?.() === 'inventory'
  const rarity = (value.rarity || 'common').toLowerCase()
  const btnText = saleType === 'auction' ? 'Bid' : saleType === 'rent' ? 'Rent' : saleType === 'bundle' ? 'Buy' : 'Buy'
  const btnClass = saleType === 'auction' ? 'bid' : saleType === 'rent' ? 'rent' : 'buy'

  // Generate bundle items for bundle type
  const bundleItems = saleType === 'bundle' ? (value.bundleItems || [
    { name: `${value.title} - Item 1`, collection: value.collection, price: ((value.priceNum || 1) * 0.4).toFixed(2), image: `https://picsum.photos/seed/${id}a/60/60` },
    { name: `${value.title} - Item 2`, collection: value.collection, price: ((value.priceNum || 1) * 0.35).toFixed(2), image: `https://picsum.photos/seed/${id}b/60/60` },
    { name: `${value.title} - Item 3`, collection: value.collection, price: ((value.priceNum || 1) * 0.25).toFixed(2), image: `https://picsum.photos/seed/${id}c/60/60` }
  ]) : []

  // Build onclick handler
  const tokenId = String(value.tokenId ?? value.assetId ?? id).replace(/^asset_/, '')
  const itemData = JSON.stringify({
    id,
    tokenId,
    assetId: tokenId,
    title: value.title || 'Untitled',
    name: value.title || 'Untitled',
    collection: value.collection || 'Unknown',
    image: value.image || `https://picsum.photos/seed/${id}/400/400`,
    price: value.price || '0 OVG',
    duration: value.duration ?? 0,
    dailyRate: value.dailyRate || 0.1,
    currentBid: value.priceNum || 2.3,
    timeLeft: formatTimeRemaining(value.endsAt),
    items: bundleItems
  }).replace(/"/g, '&quot;')

  row.innerHTML = `
    <div class="mp-table-item">
      <div class="mp-table-avatar">
        <img src="${value.image || `https://picsum.photos/seed/${id}/80/80`}" alt="${value.title}" loading="lazy">
      </div>
      <div class="mp-table-item-info">
        <div class="mp-table-item-title">${value.title || 'Untitled'}</div>
        <div class="mp-table-item-collection">${value.collection || 'Unknown'}</div>
      </div>
    </div>
    <div class="mp-table-cell">
      <span class="mp-table-sale-type ${saleType}">${saleType.charAt(0).toUpperCase() + saleType.slice(1)}</span>
    </div>
    <div class="mp-table-cell">
      <span class="mp-table-rarity ${rarity}">${rarity}</span>
    </div>
    <div class="mp-table-cell mp-table-qty">
      <span class="mp-qty-badge${saleType === 'bundle' || (value.supply || 1) > 1 ? ' multiple' : ''}">${saleType === 'bundle' ? `📦 ${bundleItems.length}` : 'x' + (value.supply || 1)}</span>
    </div>
    <div class="mp-table-cell mp-table-price-cell">
      ${(() => {
        const price = value.price || '0 OVG'
        const parts = price.split(' ')
        const amount = parts[0] || '0'
        const token = parts[1] || 'OVG'
        const numAmount = parseFloat(amount.replace(/,/g, '')) || 0
        const usdValue = Math.round(numAmount * 355)
        return `<span class="mp-table-price-main"><span class="mp-table-price">${amount}</span> <span class="mp-table-token">${token}</span></span><span class="mp-table-price-usd">~$${usdValue.toLocaleString()}</span>`
      })()}
    </div>
    <div class="mp-table-cell mp-table-listed-cell" style="font-size: 14px; color: var(--mp-text-muted);">${value.listed || 'Recently'}</div>
    <div class="mp-table-cell mp-table-ends-cell" style="font-size: 14px;">
      ${(() => {
        if (saleType === 'auction') {
          const endsAt = value.endsAt || (value.listedAt ? value.listedAt + 3 * 86400000 : (value.timestamp ? value.timestamp + 3 * 86400000 : Date.now() + 3 * 86400000))
          return `<span class="mp-table-ends-in"><span class="mp-timer-value" data-ends-at="${endsAt}">${formatTimeRemaining(endsAt)}</span></span>`
        }
        const durationDays = Math.round((value.duration ?? 0) / 86400)
        if (!durationDays) return `<span style="color: var(--mp-text-muted);">∞</span>`
        return `<span style="color: var(--mp-text-muted);">${durationDays}d</span>`
      })()}
    </div>
    <div class="mp-table-cell mp-table-action-cell">
      ${isInventory ? '' : `<div class="mp-table-favorite ${isFav ? 'active' : ''}" onclick="toggleFavorite('${id}', event)">${isFav ? '★' : '☆'}</div>`}
      <button class="mp-table-action-btn ${btnClass}" data-item-data="${itemData}" onclick="event.stopPropagation(); ${saleType === 'auction' ? `openBidModal('auction', JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))` : saleType === 'rent' ? `openRentModal(JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))` : saleType === 'bundle' ? `openBundleBuyModal(JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))` : `openBuyModal(JSON.parse(this.dataset.itemData.replace(/&quot;/g, String.fromCharCode(34))))`}">${btnText}</button>
    </div>
  `

  row.onclick = (e) => {
    if (e.target.closest('.mp-table-favorite') || e.target.closest('.mp-table-action-btn')) return
    if (window.batchBuyMode) {
      window.toggleBatchBuySelection(row)
    } else {
      // Explore view uses listing detail panel
      window.openListingDetailPanel?.(id, value)
    }
  }

  return row
}
