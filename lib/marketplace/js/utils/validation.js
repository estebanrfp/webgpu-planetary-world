/**
 * Marketplace Validation Utilities
 * @module marketplace/utils/validation
 */

import { MARKETPLACE_CONFIG } from '../../../config/marketplaceConfig.js'

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid 0x + 40 hex chars
 */
export const isValidEthAddress = (address) => {
  if (!address || typeof address !== 'string') return false
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Validate price input
 * @param {string|number} price - Price to validate
 * @returns {object} { valid, error }
 */
export const validatePrice = (price) => {
  const num = parseFloat(price)

  if (isNaN(num)) {
    return { valid: false, error: 'Price must be a valid number' }
  }

  if (num <= 0) {
    return { valid: false, error: 'Price must be greater than 0' }
  }

  if (num > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: 'Price exceeds maximum allowed value' }
  }

  return { valid: true, error: null }
}

/**
 * Validate auction/rental duration
 * @param {number} seconds - Duration in seconds
 * @param {object} options - Validation options
 * @returns {object} { valid, error }
 */
export const validateDuration = (seconds, options = {}) => {
  const {
    minSeconds = 300,      // 5 minutes
    maxSeconds = 2592000   // 30 days
  } = options

  if (typeof seconds !== 'number' || isNaN(seconds)) {
    return { valid: false, error: 'Duration must be a number' }
  }

  if (seconds < minSeconds) {
    return { valid: false, error: `Duration must be at least ${minSeconds / 60} minutes` }
  }

  if (seconds > maxSeconds) {
    return { valid: false, error: `Duration cannot exceed ${maxSeconds / 86400} days` }
  }

  return { valid: true, error: null }
}

/**
 * Validate quantity input
 * @param {string|number} quantity - Quantity to validate
 * @param {number} maxAvailable - Maximum available amount
 * @returns {object} { valid, error }
 */
export const validateQuantity = (quantity, maxAvailable = Infinity) => {
  const num = parseInt(quantity, 10)

  if (isNaN(num)) {
    return { valid: false, error: 'Quantity must be a number' }
  }

  if (num <= 0) {
    return { valid: false, error: 'Quantity must be at least 1' }
  }

  if (!Number.isInteger(num)) {
    return { valid: false, error: 'Quantity must be a whole number' }
  }

  if (num > maxAvailable) {
    return { valid: false, error: `Quantity exceeds available (${maxAvailable})` }
  }

  return { valid: true, error: null }
}

/**
 * Validate royalty percentage
 * @param {string|number} percentage - Royalty percentage
 * @returns {object} { valid, error }
 */
export const validateRoyalty = (percentage) => {
  const num = parseFloat(percentage)

  if (isNaN(num)) {
    return { valid: false, error: 'Royalty must be a number' }
  }

  if (num < MARKETPLACE_CONFIG.ROYALTY_MIN_PERCENT) {
    return { valid: false, error: 'Royalty cannot be negative' }
  }

  if (num > MARKETPLACE_CONFIG.ROYALTY_MAX_PERCENT) {
    return { valid: false, error: `Royalty cannot exceed ${MARKETPLACE_CONFIG.ROYALTY_MAX_PERCENT}%` }
  }

  return { valid: true, error: null }
}

/**
 * Validate bundle name
 * @param {string} name - Bundle name
 * @returns {object} { valid, error }
 */
export const validateBundleName = (name) => {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Bundle name is required' }
  }

  const trimmed = name.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Bundle name cannot be empty' }
  }

  if (trimmed.length > MARKETPLACE_CONFIG.MAX_BUNDLE_NAME_LENGTH) {
    return { valid: false, error: `Bundle name cannot exceed ${MARKETPLACE_CONFIG.MAX_BUNDLE_NAME_LENGTH} characters` }
  }

  // Check for invalid characters (only alphanumeric, spaces, hyphens, underscores)
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
    return { valid: false, error: 'Bundle name contains invalid characters' }
  }

  return { valid: true, error: null }
}
