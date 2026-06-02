/**
 * Retry wrapper with exponential backoff and timeout utilities
 * @module utils/withRetry
 */

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'network', 'timeout', 'rate limit', 'server error']
}

/**
 * Execute a function with automatic retries and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {string[]} options.retryableErrors - Error strings that trigger retry
 * @returns {Promise<any>} Function result
 */
export const withRetry = async (fn, options = {}) => {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const errorMsg = e.message?.toLowerCase() || ''

      const isRetryable = opts.retryableErrors.some(err =>
        errorMsg.includes(err.toLowerCase())
      )

      // Don't retry if not retryable or max attempts reached
      if (!isRetryable || attempt === opts.maxRetries) throw e

      // Exponential backoff with jitter
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        opts.maxDelay
      )

      console.log(`[withRetry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError
}

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Custom timeout error message
 * @returns {Promise<any>} Original promise result or timeout error
 */
export const withTimeout = (promise, ms, message = 'Operation timed out') => {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

/**
 * Combine retry and timeout for network operations
 * @param {Function} fn - Async function to execute
 * @param {object} options - Combined options
 * @param {number} options.timeout - Per-attempt timeout in ms
 * @param {number} options.maxRetries - Maximum retry attempts
 * @param {number} options.baseDelay - Initial delay in ms
 * @returns {Promise<any>} Function result
 */
export const withRetryAndTimeout = async (fn, options = {}) => {
  const { timeout = 30000, ...retryOpts } = options

  return withRetry(
    () => withTimeout(fn(), timeout, `Request timed out after ${timeout}ms`),
    retryOpts
  )
}

export default { withRetry, withTimeout, withRetryAndTimeout }
