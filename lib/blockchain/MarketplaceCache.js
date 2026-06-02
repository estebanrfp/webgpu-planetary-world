/**
 * MarketplaceCache - In-memory cache for marketplace data
 * Cache is cleared on page refresh (intentional for simplicity)
 */

import { MARKETPLACE_CONFIG } from '../config/marketplaceConfig.js'

const cache = new Map()

export const MarketplaceCache = {
  set: (key, value, ttl = MARKETPLACE_CONFIG.CACHE_TTL) => {
    cache.set(key, { value, expires: Date.now() + ttl })
  },
  
  get: (key) => {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expires) {
      cache.delete(key)
      return null
    }
    return entry.value
  },
  
  invalidate: (key) => cache.delete(key),
  
  invalidatePattern: (pattern) => {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) cache.delete(key)
    }
  },
  
  clear: () => cache.clear()
}
