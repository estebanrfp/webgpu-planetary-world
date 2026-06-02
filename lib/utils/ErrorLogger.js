/**
 * Centralized error logger for production monitoring
 * Captures errors with context and buffers for local analysis
 * @module utils/ErrorLogger
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
const isProduction = typeof window !== 'undefined' && !window.location?.hostname?.includes('localhost')

let errorBuffer = []
const MAX_BUFFER_SIZE = 100

/**
 * ErrorLogger - Centralized logging utility
 */
export const ErrorLogger = {
  /**
   * Log a message with context
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   * @param {string} message - Log message
   * @param {object} context - Additional context data
   * @returns {object} Log entry
   */
  log: (level, message, context = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      url: typeof window !== 'undefined' ? window.location?.href : ''
    }

    // Console output: always show in dev, only WARN+ in production
    if (!isProduction || LOG_LEVELS[level] >= LOG_LEVELS.WARN) {
      const consoleFn = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'
      console[consoleFn](`[${entry.timestamp}] ${level}: ${message}`, context)
    }

    // Buffer WARN and ERROR for analysis
    if (LOG_LEVELS[level] >= LOG_LEVELS.WARN) {
      errorBuffer.push(entry)
      if (errorBuffer.length > MAX_BUFFER_SIZE) errorBuffer.shift()
    }

    return entry
  },

  /**
   * Log error level message
   * @param {string} message - Error message
   * @param {object} context - Additional context
   */
  error: (message, context = {}) => ErrorLogger.log('ERROR', message, context),

  /**
   * Log warning level message
   * @param {string} message - Warning message
   * @param {object} context - Additional context
   */
  warn: (message, context = {}) => ErrorLogger.log('WARN', message, context),

  /**
   * Log info level message
   * @param {string} message - Info message
   * @param {object} context - Additional context
   */
  info: (message, context = {}) => ErrorLogger.log('INFO', message, context),

  /**
   * Log debug level message
   * @param {string} message - Debug message
   * @param {object} context - Additional context
   */
  debug: (message, context = {}) => ErrorLogger.log('DEBUG', message, context),

  /**
   * Get buffered error entries
   * @returns {Array} Copy of error buffer
   */
  getBuffer: () => [...errorBuffer],

  /**
   * Clear the error buffer
   */
  clearBuffer: () => { errorBuffer = [] }
}

// Global error handlers (only in browser)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    ErrorLogger.error('Uncaught error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    ErrorLogger.error('Unhandled promise rejection', {
      reason: e.reason?.message || String(e.reason),
      stack: e.reason?.stack
    })
  })
}

export default ErrorLogger
