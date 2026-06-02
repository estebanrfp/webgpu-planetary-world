/**
 * Offers & Activity Rendering
 * @module modules/offers/rendering
 *
 * EXACT COPY of app-core.js offers/activity rendering functions.
 * Dependencies are passed via init function.
 */

// Current user getter set via init
let getCurrentUser = null

/**
 * Initialize offers rendering with dependencies
 * @param {object} deps - Dependencies
 * @param {function} deps.getCurrentUser - Function to get current user address
 */
export function initOffersRendering(deps) {
  getCurrentUser = deps.getCurrentUser
}

/**
 * Create OpenSea-style table row for Offers
 * Uses data-item-id for GenosDB hash (consistent with hash-based pattern)
 * EXACT COPY of app-core.js lines 1721-1800
 */
export function createOfferTableRow(id, data) {
  const row = document.createElement('div')
  row.className = 'mp-table-row'
  row.dataset.itemId = id

  const CURRENT_USER = getCurrentUser?.() || ''

  // Unified model: isOwner means I made this offer (sent), otherwise received
  const isOwner = data.isOwner ?? (data.owner === CURRENT_USER)
  const isReceived = !isOwner
  const directionClass = isReceived ? 'received' : 'sent'
  const directionText = isReceived ? 'Received' : 'Sent'

  // offerStatus for offer state (pending, accepted, rejected, expired)
  const offerStatus = data.offerStatus || 'pending'
  const statusText = offerStatus.charAt(0).toUpperCase() + offerStatus.slice(1)

  row.dataset.status = offerStatus
  row.dataset.direction = isReceived ? 'received' : 'sent'

  // Show action buttons only for pending offers
  const showActions = offerStatus === 'pending'

  // Counterparty: if I sent the offer, show target owner; if received, show who sent it
  const counterparty = isOwner ? data.targetOwner : data.owner
  const shortAddress = counterparty ? `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}` : '0x...'

  // Asset name from title field
  const assetName = data.title || data.name || 'Unknown Item'

  // Price from offerAmount
  const amount = data.offerAmount || data.price || '0'
  const numAmount = parseFloat(String(amount).replace(/,/g, '')) || 0
  const usdValue = Math.round(numAmount * 355)

  row.innerHTML = `
    <div class="mp-table-item">
      <div class="mp-table-avatar">
        <img src="${data.image || `https://picsum.photos/seed/${id}/80/80`}" alt="${assetName}" loading="lazy">
      </div>
      <div class="mp-table-item-info">
        <div class="mp-table-item-title">${assetName}</div>
        <div class="mp-table-item-collection">${data.collection || data.category || 'OVGrid Collection'}</div>
      </div>
    </div>
    <div class="mp-table-cell">
      <span class="mp-table-address">${shortAddress}</span>
    </div>
    <div class="mp-table-cell">
      <span class="mp-table-offer-direction ${directionClass}">${directionText}</span>
    </div>
    <div class="mp-table-cell">
      <span class="mp-table-offer-status ${offerStatus}">${statusText}</span>
    </div>
    <div class="mp-table-cell mp-table-price-cell">
      <span class="mp-table-price-main"><span class="mp-table-price">${numAmount.toFixed(2)}</span> <span class="mp-table-token">OVG</span></span>
      <span class="mp-table-price-usd">~$${usdValue.toLocaleString()}</span>
    </div>
    <div class="mp-table-cell mp-table-offered-cell" style="font-size: 14px; color: var(--mp-text-muted);">
      ${data.time || 'Recently'}
    </div>
    <div class="mp-table-cell mp-table-expires-cell" style="font-size: 14px;">
      <span class="mp-table-ends-in"><span class="mp-timer-value">${data.expiresIn || '7d 0h 0m'}</span></span>
    </div>
    <div class="mp-table-cell">
      <div class="mp-table-actions-group">
        ${showActions ? (isReceived ? `
          <button class="mp-table-action-sm accept" title="Accept" onclick="event.stopPropagation(); acceptOffer(this.closest('.mp-table-row'), '${id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        ` : `
          <button class="mp-table-action-sm withdraw" title="Cancel Offer" onclick="event.stopPropagation(); cancelOffer(this.closest('.mp-table-row'), '${id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        `) : ''}
      </div>
    </div>
  `

  row.onclick = (e) => {
    if (e.target.closest('.mp-table-action-sm')) return
  }

  return row
}

/**
 * Create activity item
 * EXACT COPY of app-core.js lines 1802-1829
 */
export function createActivityItem(id, data) {
  const iconMap = {
    sale: { icon: '&#128176;', class: 'sale' },
    purchase: { icon: '&#128722;', class: 'purchase' },
    listing: { icon: '&#128203;', class: 'listing' },
    bid: { icon: '&#9889;', class: 'bid' },
    transfer: { icon: '&#8644;', class: 'transfer' }
  }
  const { icon, class: iconClass } = iconMap[data.type] || iconMap.transfer
  const item = document.createElement('div')
  item.className = 'mp-list-item'
  item.dataset.activityId = id
  item.innerHTML = `
    <div class="mp-activity-icon ${iconClass}">${icon}</div>
    <div class="mp-list-item-image">
      <img src="${data.image || `https://picsum.photos/seed/${id}/100/100`}" alt="${data.assetName}" loading="lazy">
    </div>
    <div class="mp-list-item-content">
      <div class="mp-list-item-title">${data.title}</div>
      <div class="mp-list-item-subtitle">${data.subtitle}</div>
    </div>
    <div class="mp-list-item-meta">
      <div class="mp-list-item-price ${data.priceClass || ''}">${data.price}</div>
      <div class="mp-list-item-time">${data.time}</div>
    </div>
  `
  return item
}
