/**
 * Marketplace Calculation Utilities
 * @module marketplace/utils/calculations
 */

/**
 * Calculate marketplace fees for batch purchases
 * @param {Array} items - Array of items with price property
 * @param {number} feeBps - Fee in basis points (e.g., 250 = 2.5%)
 * @returns {object} { subtotal, fees, total }
 */
export const calculateBatchFees = (items, feeBps = 250) => {
  if (!items || items.length === 0) {
    return { subtotal: 0, fees: 0, total: 0 }
  }

  const subtotal = items.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0
    return sum + price
  }, 0)

  const fees = subtotal * (feeBps / 10000)
  const total = subtotal + fees

  return {
    subtotal: parseFloat(subtotal.toFixed(4)),
    fees: parseFloat(fees.toFixed(4)),
    total: parseFloat(total.toFixed(4))
  }
}

/**
 * Validate that all items use the same payment token
 * @param {Array} items - Array of items with paymentToken property
 * @returns {object} { valid, token, mismatchedCount }
 */
export const validateSameToken = (items) => {
  if (!items || items.length === 0) {
    return { valid: true, token: null, mismatchedCount: 0 }
  }

  if (items.length === 1) {
    return { valid: true, token: items[0].paymentToken, mismatchedCount: 0 }
  }

  const firstToken = items[0].paymentToken?.toLowerCase()
  let mismatchedCount = 0

  for (let i = 1; i < items.length; i++) {
    if (items[i].paymentToken?.toLowerCase() !== firstToken) {
      mismatchedCount++
    }
  }

  return {
    valid: mismatchedCount === 0,
    token: firstToken,
    mismatchedCount
  }
}

/**
 * Format time remaining from timestamp
 * @param {number} endTime - End timestamp in seconds
 * @returns {string} Formatted time string
 */
export const formatTimeRemaining = (endTime) => {
  const now = Math.floor(Date.now() / 1000)
  const remaining = endTime - now

  if (remaining <= 0) return 'Ended'

  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Calculate minimum next bid (current + increment)
 * @param {string|number} currentBid - Current highest bid
 * @param {string|number} minBid - Auction minimum bid
 * @param {number} incrementPercent - Minimum increment percentage
 * @returns {number} Minimum next bid amount
 */
export const calculateMinNextBid = (currentBid, minBid, incrementPercent = 1) => {
  const current = parseFloat(currentBid) || 0
  const min = parseFloat(minBid) || 0

  if (current === 0) return min

  const increment = current * (incrementPercent / 100)
  return parseFloat((current + increment).toFixed(4))
}

/**
 * Calculate fee amounts for a purchase
 * @param {string|number} price - Item price
 * @param {number} feeBps - Marketplace fee in basis points
 * @param {number} royaltyPercent - Creator royalty percentage
 * @returns {object} { marketplaceFee, royaltyFee, sellerReceives }
 */
export const calculateFeeAmounts = (price, feeBps = 250, royaltyPercent = 0) => {
  const priceNum = parseFloat(price) || 0

  const marketplaceFee = priceNum * (feeBps / 10000)
  const royaltyFee = priceNum * (royaltyPercent / 100)
  const sellerReceives = priceNum - marketplaceFee - royaltyFee

  return {
    marketplaceFee: parseFloat(marketplaceFee.toFixed(4)),
    royaltyFee: parseFloat(royaltyFee.toFixed(4)),
    sellerReceives: parseFloat(sellerReceives.toFixed(4))
  }
}

/**
 * Validate auction duration
 * @param {number} seconds - Duration in seconds
 * @returns {object} { valid, error }
 */
export const validateAuctionDuration = (seconds) => {
  const MIN_DURATION = 300 // 5 minutes
  const MAX_DURATION = 2592000 // 30 days

  if (seconds < MIN_DURATION) {
    return { valid: false, error: `Minimum duration is ${MIN_DURATION / 60} minutes` }
  }

  if (seconds > MAX_DURATION) {
    return { valid: false, error: `Maximum duration is ${MAX_DURATION / 86400} days` }
  }

  return { valid: true, error: null }
}
