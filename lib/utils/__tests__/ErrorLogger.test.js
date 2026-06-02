/**
 * ErrorLogger Unit Tests
 * @module utils/__tests__/ErrorLogger
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { ErrorLogger } from '../ErrorLogger.js'

describe('ErrorLogger', () => {
  let consoleErrorSpy
  let consoleWarnSpy
  let consoleLogSpy

  beforeEach(() => {
    ErrorLogger.clearBuffer()
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  describe('error()', () => {
    it('adds entry to buffer', () => {
      ErrorLogger.error('Test error')
      const buffer = ErrorLogger.getBuffer()
      expect(buffer).toHaveLength(1)
      expect(buffer[0].level).toBe('ERROR')
      expect(buffer[0].message).toBe('Test error')
    })

    it('includes context in entry', () => {
      ErrorLogger.error('Test error', { code: 500, source: 'api' })
      const buffer = ErrorLogger.getBuffer()
      expect(buffer[0].context).toEqual({ code: 500, source: 'api' })
    })

    it('calls console.error', () => {
      ErrorLogger.error('Console error test')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('warn()', () => {
    it('adds entry to buffer', () => {
      ErrorLogger.warn('Test warning')
      const buffer = ErrorLogger.getBuffer()
      expect(buffer).toHaveLength(1)
      expect(buffer[0].level).toBe('WARN')
      expect(buffer[0].message).toBe('Test warning')
    })

    it('calls console.warn', () => {
      ErrorLogger.warn('Console warn test')
      expect(consoleWarnSpy).toHaveBeenCalled()
    })
  })

  describe('info()', () => {
    it('does NOT add to buffer', () => {
      ErrorLogger.info('Test info')
      const buffer = ErrorLogger.getBuffer()
      expect(buffer).toHaveLength(0)
    })
  })

  describe('debug()', () => {
    it('does NOT add to buffer', () => {
      ErrorLogger.debug('Test debug')
      const buffer = ErrorLogger.getBuffer()
      expect(buffer).toHaveLength(0)
    })
  })

  describe('getBuffer()', () => {
    it('returns copy not reference', () => {
      ErrorLogger.error('Error 1')
      const buffer1 = ErrorLogger.getBuffer()
      const buffer2 = ErrorLogger.getBuffer()
      expect(buffer1).not.toBe(buffer2)
      expect(buffer1).toEqual(buffer2)
    })

    it('modifications to returned buffer do not affect internal buffer', () => {
      ErrorLogger.error('Original error')
      const buffer = ErrorLogger.getBuffer()
      buffer.push({ fake: true })
      expect(ErrorLogger.getBuffer()).toHaveLength(1)
    })
  })

  describe('clearBuffer()', () => {
    it('empties buffer completely', () => {
      ErrorLogger.error('Error 1')
      ErrorLogger.warn('Warning 1')
      expect(ErrorLogger.getBuffer()).toHaveLength(2)
      ErrorLogger.clearBuffer()
      expect(ErrorLogger.getBuffer()).toHaveLength(0)
    })
  })

  describe('buffer size limit', () => {
    it('respects max size of 100 entries', () => {
      // Add 110 errors
      for (let i = 0; i < 110; i++) {
        ErrorLogger.error(`Error ${i}`)
      }
      const buffer = ErrorLogger.getBuffer()
      expect(buffer).toHaveLength(100)
      // First entry should be Error 10 (oldest 10 were removed)
      expect(buffer[0].message).toBe('Error 10')
      // Last entry should be Error 109
      expect(buffer[99].message).toBe('Error 109')
    })
  })

  describe('log() entry structure', () => {
    it('includes timestamp in ISO format', () => {
      ErrorLogger.error('Timestamp test')
      const entry = ErrorLogger.getBuffer()[0]
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('includes url field', () => {
      ErrorLogger.error('URL test')
      const entry = ErrorLogger.getBuffer()[0]
      expect(entry).toHaveProperty('url')
    })

    it('returns log entry from log()', () => {
      const entry = ErrorLogger.log('ERROR', 'Return test', { data: 1 })
      expect(entry.level).toBe('ERROR')
      expect(entry.message).toBe('Return test')
      expect(entry.context).toEqual({ data: 1 })
    })
  })
})
