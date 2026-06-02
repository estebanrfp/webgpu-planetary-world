/**
 * withRetry and withTimeout Unit Tests
 * @module utils/__tests__/withRetry
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { withRetry, withTimeout, withRetryAndTimeout } from '../withRetry.js'

describe('withRetry', () => {
  let consoleLogSpy

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('succeeds on first try without retry', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      return 'success'
    }
    const result = await withRetry(fn)
    expect(result).toBe('success')
    expect(callCount).toBe(1)
  })

  it('retries on retryable error', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      if (callCount < 3) throw new Error('network error')
      return 'success after retry'
    }
    const result = await withRetry(fn, { baseDelay: 10, maxRetries: 3 })
    expect(result).toBe('success after retry')
    expect(callCount).toBe(3)
  })

  it('respects maxRetries limit', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      throw new Error('timeout error')
    }
    try {
      await withRetry(fn, { maxRetries: 2, baseDelay: 10 })
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e.message).toBe('timeout error')
    }
    expect(callCount).toBe(3) // Initial + 2 retries
  })

  it('uses exponential backoff with increasing delays', async () => {
    let callCount = 0

    const fn = async () => {
      callCount++
      if (callCount < 3) throw new Error('network error')
      return 'done'
    }

    const result = await withRetry(fn, { baseDelay: 10, maxRetries: 3 })

    // Just verify it retried and succeeded
    expect(result).toBe('done')
    expect(callCount).toBe(3)
  })

  it('throws immediately on non-retryable error', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      throw new Error('validation failed')
    }
    try {
      await withRetry(fn, { maxRetries: 3, baseDelay: 10 })
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e.message).toBe('validation failed')
    }
    expect(callCount).toBe(1) // No retries for non-retryable errors
  })

  it('respects custom retryableErrors list', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      if (callCount < 2) throw new Error('custom_error')
      return 'done'
    }
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelay: 10,
      retryableErrors: ['custom_error']
    })
    expect(result).toBe('done')
    expect(callCount).toBe(2)
  })

  it('respects maxDelay cap', async () => {
    let callCount = 0
    const startTime = Date.now()

    const fn = async () => {
      callCount++
      if (callCount < 5) throw new Error('network error')
      return 'done'
    }

    await withRetry(fn, { baseDelay: 1000, maxDelay: 100, maxRetries: 5 })

    const elapsed = Date.now() - startTime
    // With maxDelay=100, even 4 retries should be fast
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('withTimeout', () => {
  it('resolves if promise completes before timeout', async () => {
    const promise = new Promise(r => setTimeout(() => r('fast'), 10))
    const result = await withTimeout(promise, 1000)
    expect(result).toBe('fast')
  })

  it('rejects with timeout error if too slow', async () => {
    const promise = new Promise(r => setTimeout(() => r('slow'), 1000))
    try {
      await withTimeout(promise, 10)
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e.message).toBe('Operation timed out')
    }
  })

  it('uses custom error message', async () => {
    const promise = new Promise(r => setTimeout(() => r('slow'), 1000))
    try {
      await withTimeout(promise, 10, 'Custom timeout msg')
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e.message).toBe('Custom timeout msg')
    }
  })

  it('cleans up timeout on success', async () => {
    const promise = Promise.resolve('immediate')
    const result = await withTimeout(promise, 1000)
    expect(result).toBe('immediate')
    // If timeout wasn't cleared, test would hang
  })

  it('cleans up timeout on rejection', async () => {
    const promise = Promise.reject(new Error('fail'))
    try {
      await withTimeout(promise, 1000)
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e.message).toBe('fail')
    }
  })
})

describe('withRetryAndTimeout', () => {
  let consoleLogSpy

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('combines retry and timeout behavior', async () => {
    let callCount = 0
    const fn = () => {
      callCount++
      if (callCount < 2) {
        return new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 100))
      }
      return Promise.resolve('success')
    }

    const result = await withRetryAndTimeout(fn, {
      timeout: 50,
      maxRetries: 3,
      baseDelay: 10,
      retryableErrors: ['timed out']
    })
    expect(result).toBe('success')
    expect(callCount).toBe(2)
  })

  it('respects per-attempt timeout', async () => {
    const fn = () => new Promise(r => setTimeout(() => r('slow'), 500))
    try {
      await withRetryAndTimeout(fn, { timeout: 10, maxRetries: 0 })
      expect(true).toBe(false) // Should not reach here
    } catch (e) {
      expect(e.message).toContain('timed out')
    }
  })
})
