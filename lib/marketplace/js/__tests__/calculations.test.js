/**
 * Marketplace Calculations Unit Tests
 * @module marketplace/__tests__/calculations
 */

import { describe, it, expect } from 'bun:test'
import {
  calculateBatchFees,
  validateSameToken,
  formatTimeRemaining,
  calculateMinNextBid,
  calculateFeeAmounts,
  validateAuctionDuration
} from '../utils/calculations.js'
import { MARKETPLACE_CONFIG } from '../../../config/marketplaceConfig.js'

// ============================================================================
// Batch Fees Tests
// ============================================================================

describe('calculateBatchFees', () => {
  it('calculates fees for single item', () => {
    const items = [{ price: '100' }]
    const result = calculateBatchFees(items)
    expect(result.subtotal).toBe(100)
    expect(result.fees).toBe(2.5) // 2.5% of 100
    expect(result.total).toBe(102.5)
  })

  it('calculates fees for multiple items', () => {
    const items = [{ price: '100' }, { price: '50' }, { price: '25' }]
    const result = calculateBatchFees(items)
    expect(result.subtotal).toBe(175)
    expect(result.fees).toBe(4.375) // 2.5% of 175
    expect(result.total).toBe(179.375)
  })

  it('handles empty array', () => {
    const result = calculateBatchFees([])
    expect(result.subtotal).toBe(0)
    expect(result.fees).toBe(0)
    expect(result.total).toBe(0)
  })

  it('handles null input', () => {
    const result = calculateBatchFees(null)
    expect(result.subtotal).toBe(0)
    expect(result.fees).toBe(0)
    expect(result.total).toBe(0)
  })

  it('handles zero price items', () => {
    const items = [{ price: '0' }, { price: '100' }]
    const result = calculateBatchFees(items)
    expect(result.subtotal).toBe(100)
    expect(result.fees).toBe(2.5)
  })

  it('uses custom fee basis points', () => {
    const items = [{ price: '100' }]
    const result = calculateBatchFees(items, 500) // 5%
    expect(result.fees).toBe(5)
    expect(result.total).toBe(105)
  })

  it('handles decimal prices', () => {
    const items = [{ price: '10.5' }, { price: '5.25' }]
    const result = calculateBatchFees(items)
    expect(result.subtotal).toBe(15.75)
    expect(result.fees).toBeCloseTo(0.3938, 3)
  })

  it('handles missing price property', () => {
    const items = [{ name: 'no price' }, { price: '100' }]
    const result = calculateBatchFees(items)
    expect(result.subtotal).toBe(100)
  })
})

// ============================================================================
// Same Token Validation Tests
// ============================================================================

describe('validateSameToken', () => {
  const TOKEN_A = '0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E'
  const TOKEN_B = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

  it('returns valid for same tokens', () => {
    const items = [
      { paymentToken: TOKEN_A },
      { paymentToken: TOKEN_A },
      { paymentToken: TOKEN_A }
    ]
    const result = validateSameToken(items)
    expect(result.valid).toBe(true)
    expect(result.mismatchedCount).toBe(0)
  })

  it('returns invalid for different tokens', () => {
    const items = [
      { paymentToken: TOKEN_A },
      { paymentToken: TOKEN_B },
      { paymentToken: TOKEN_A }
    ]
    const result = validateSameToken(items)
    expect(result.valid).toBe(false)
    expect(result.mismatchedCount).toBe(1)
  })

  it('handles empty array', () => {
    const result = validateSameToken([])
    expect(result.valid).toBe(true)
    expect(result.token).toBe(null)
  })

  it('handles single item', () => {
    const result = validateSameToken([{ paymentToken: TOKEN_A }])
    expect(result.valid).toBe(true)
    expect(result.token).toBe(TOKEN_A)
  })

  it('handles case-insensitive comparison', () => {
    const items = [
      { paymentToken: TOKEN_A.toLowerCase() },
      { paymentToken: TOKEN_A.toUpperCase() }
    ]
    const result = validateSameToken(items)
    expect(result.valid).toBe(true)
  })

  it('counts all mismatched items', () => {
    const items = [
      { paymentToken: TOKEN_A },
      { paymentToken: TOKEN_B },
      { paymentToken: TOKEN_B }
    ]
    const result = validateSameToken(items)
    expect(result.mismatchedCount).toBe(2)
  })
})

// ============================================================================
// Time Formatting Tests
// ============================================================================

describe('formatTimeRemaining', () => {
  it('formats days and hours', () => {
    const future = Math.floor(Date.now() / 1000) + 90000 // ~1 day 1 hour
    const result = formatTimeRemaining(future)
    expect(result).toMatch(/1d \d+h/)
  })

  it('formats hours and minutes', () => {
    const future = Math.floor(Date.now() / 1000) + 7200 // 2 hours
    const result = formatTimeRemaining(future)
    expect(result).toMatch(/2h \d+m/)
  })

  it('formats minutes only', () => {
    const future = Math.floor(Date.now() / 1000) + 1800 // 30 minutes
    const result = formatTimeRemaining(future)
    expect(result).toBe('30m')
  })

  it('returns "Ended" for past time', () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    const result = formatTimeRemaining(past)
    expect(result).toBe('Ended')
  })

  it('returns "Ended" for current time', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = formatTimeRemaining(now)
    expect(result).toBe('Ended')
  })

  it('handles edge case at boundary', () => {
    const future = Math.floor(Date.now() / 1000) + 60 // 1 minute
    const result = formatTimeRemaining(future)
    expect(result).toBe('1m')
  })
})

// ============================================================================
// Minimum Next Bid Tests
// ============================================================================

describe('calculateMinNextBid', () => {
  it('returns minBid when no current bid', () => {
    const result = calculateMinNextBid(0, 10)
    expect(result).toBe(10)
  })

  it('adds 1% to current bid', () => {
    const result = calculateMinNextBid(100, 10, 1)
    expect(result).toBe(101)
  })

  it('handles string inputs', () => {
    const result = calculateMinNextBid('100', '10', 1)
    expect(result).toBe(101)
  })

  it('handles custom increment percentage', () => {
    const result = calculateMinNextBid(100, 10, 5)
    expect(result).toBe(105)
  })

  it('returns minBid for zero current bid', () => {
    const result = calculateMinNextBid('0', '50')
    expect(result).toBe(50)
  })
})

// ============================================================================
// Fee Amounts Tests
// ============================================================================

describe('calculateFeeAmounts', () => {
  it('calculates marketplace fee correctly', () => {
    const result = calculateFeeAmounts(100, 250, 0)
    expect(result.marketplaceFee).toBe(2.5)
    expect(result.sellerReceives).toBe(97.5)
  })

  it('calculates royalty fee correctly', () => {
    const result = calculateFeeAmounts(100, 250, 5)
    expect(result.marketplaceFee).toBe(2.5)
    expect(result.royaltyFee).toBe(5)
    expect(result.sellerReceives).toBe(92.5)
  })

  it('handles zero price', () => {
    const result = calculateFeeAmounts(0, 250, 5)
    expect(result.marketplaceFee).toBe(0)
    expect(result.royaltyFee).toBe(0)
    expect(result.sellerReceives).toBe(0)
  })

  it('handles string price', () => {
    const result = calculateFeeAmounts('100', 250, 0)
    expect(result.marketplaceFee).toBe(2.5)
  })

  it('handles high royalty percentage', () => {
    const result = calculateFeeAmounts(100, 250, 25) // max royalty
    expect(result.royaltyFee).toBe(25)
    expect(result.sellerReceives).toBe(72.5)
  })
})

// ============================================================================
// Auction Duration Tests
// ============================================================================

describe('validateAuctionDuration', () => {
  it('rejects below minimum (300s / 5 minutes)', () => {
    const result = validateAuctionDuration(299)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Minimum')
  })

  it('accepts minimum duration', () => {
    const result = validateAuctionDuration(300)
    expect(result.valid).toBe(true)
    expect(result.error).toBe(null)
  })

  it('rejects above maximum (30 days)', () => {
    const result = validateAuctionDuration(2592001)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Maximum')
  })

  it('accepts maximum duration', () => {
    const result = validateAuctionDuration(2592000)
    expect(result.valid).toBe(true)
  })

  it('accepts valid middle range', () => {
    const result = validateAuctionDuration(86400) // 1 day
    expect(result.valid).toBe(true)
  })

  it('accepts 1 hour', () => {
    const result = validateAuctionDuration(3600)
    expect(result.valid).toBe(true)
  })
})

// ============================================================================
// Configuration Constants Tests
// ============================================================================

describe('MARKETPLACE_CONFIG constants', () => {
  it('has correct fee percentage', () => {
    expect(MARKETPLACE_CONFIG.MARKETPLACE_FEE_PERCENT).toBe(2.5)
  })

  it('has correct min bid increment', () => {
    expect(MARKETPLACE_CONFIG.MIN_BID_INCREMENT_PERCENT).toBe(1)
  })

  it('has correct auction durations', () => {
    expect(MARKETPLACE_CONFIG.AUCTION_DURATIONS.ONE_HOUR).toBe(3600)
    expect(MARKETPLACE_CONFIG.AUCTION_DURATIONS.ONE_DAY).toBe(86400)
    expect(MARKETPLACE_CONFIG.AUCTION_DURATIONS.ONE_WEEK).toBe(604800)
  })

  it('has correct default auction duration', () => {
    expect(MARKETPLACE_CONFIG.DEFAULT_AUCTION_DURATION).toBe(86400)
  })
})
