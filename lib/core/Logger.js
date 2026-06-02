/**
 * Logger.js - Centralized Logging System
 * 
 * Provides controlled console output with support for log levels
 * and global suppression.
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

// Default to INFO in development, could be set to WARN for production
let currentLevel = LOG_LEVELS.INFO;

const Logger = {
    LEVELS: LOG_LEVELS,

    setLevel(level) {
        currentLevel = level;
    },

    debug(tag, ...args) {
        if (currentLevel <= LOG_LEVELS.DEBUG) {
            console.debug(`[${tag}]`, ...args);
        }
    },

    info(tag, ...args) {
        if (currentLevel <= LOG_LEVELS.INFO) {
            console.log(`[${tag}]`, ...args);
        }
    },

    warn(tag, ...args) {
        if (currentLevel <= LOG_LEVELS.WARN) {
            console.warn(`[${tag}]`, ...args);
        }
    },

    error(tag, ...args) {
        if (currentLevel <= LOG_LEVELS.ERROR) {
            console.error(`[${tag}]`, ...args);
        }
    }
};

export default Logger;
