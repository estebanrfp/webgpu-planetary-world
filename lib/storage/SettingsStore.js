/**
 * SettingsStore - IndexedDB wrapper for persisting application settings
 * 
 * Provides simple key-value storage with async operations.
 * 
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

const DB_NAME = 'ovgrid-settings';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

/**
 * Opens IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
  
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };
});

/**
 * Creates a SettingsStore instance
 * @returns {Promise<Object>} Store with save, load, and loadWithDefault methods
 */
export const createSettingsStore = async () => {
  const db = await openDB();
  
  return {
    /**
     * Save a value to IndexedDB
     * @param {string} key - Storage key
     * @param {*} value - Value to store (will be cloned)
     * @returns {Promise<void>}
     */
    save: (key, value) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(structuredClone(value), key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
    
    /**
     * Load a value from IndexedDB
     * @param {string} key - Storage key
     * @returns {Promise<*>} Stored value or undefined
     */
    load: (key) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
    
    /**
     * Load a value with fallback to default
     * @param {string} key - Storage key
     * @param {*} defaultValue - Value to return if key not found
     * @returns {Promise<*>} Stored value or defaultValue
     */
    loadWithDefault: async function(key, defaultValue) {
      const value = await this.load(key);
      return value !== undefined ? value : defaultValue;
    },
    
    /**
     * Delete a value from IndexedDB
     * @param {string} key - Storage key
     * @returns {Promise<void>}
     */
    delete: (key) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
    
    /**
     * Clear all settings
     * @returns {Promise<void>}
     */
    clear: () => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })
  };
};

/**
 * Debounce helper for save operations
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export const debounce = (fn, delay = 500) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};
