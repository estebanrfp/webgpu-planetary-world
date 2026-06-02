/**
 * Lazy Loader Utilities
 * 
 * Provides dynamic import utilities for progressive module loading.
 * Enables code-splitting with Bun bundler.
 */

const moduleCache = new Map();

/**
 * Generic lazy loader with caching
 * @param {string} modulePath - Relative path to module
 * @param {Function} factory - Optional factory to extract specific export
 * @returns {Promise<any>} - Cached module or export
 */
export const lazyLoad = async (modulePath, factory) => {
  if (!moduleCache.has(modulePath)) {
    const module = await import(modulePath);
    moduleCache.set(modulePath, factory ? factory(module) : module);
  }
  return moduleCache.get(modulePath);
};

/**
 * Check if a module is already loaded
 */
export const isLoaded = (modulePath) => moduleCache.has(modulePath);

/**
 * Clear cached module (for hot reload scenarios)
 */
export const clearCache = (modulePath) => {
  if (modulePath) {
    moduleCache.delete(modulePath);
  } else {
    moduleCache.clear();
  }
};

// ============================================================================
// Pre-defined Loaders for OVGrid Systems
// ============================================================================

// Weather Systems (load on demand when weather changes)
export const loadSnowSystem = async () => {
  const { createSnowSystem } = await import('../systems/SnowSystem.js');
  return createSnowSystem;
};

export const loadRainSystem = async () => {
  const { createRainSystem } = await import('../systems/RainSystem.js');
  return createRainSystem;
};

// Vehicle System (load on first interaction)
export const loadVehicleSystem = async () => {
  const { createVehicleSystem } = await import('../systems/VehicleSystem.js');
  return createVehicleSystem;
};

// Authentication UI (load after first render)
export const loadAuthUI = async () => {
  const { createAuthUI } = await import('../ui/AuthUI.js');
  return createAuthUI;
};

export const loadProfileUI = async () => {
  const { createProfileUI } = await import('../ui/ProfileUI.js');
  return createProfileUI;
};

export const loadMarketplaceUI = async () => {
  // Load marketplace (M key shortcut)
  const { createMockupMarketplaceUI } = await import('../marketplace/index.js');
  return createMockupMarketplaceUI;
};

export const loadNotificationManager = async () => {
  const { createNotificationManager } = await import('../network/NotificationManager.js');
  return createNotificationManager;
};

// Blockchain (load on wallet connect)
export const loadBlockchain = async () => {
  const blockchain = await import('../blockchain/index.js');
  return blockchain;
};

// Cockpit UI (load when entering vehicle)
export const loadCockpitUI = async () => {
  const { createCockpitUI } = await import('../ui/CockpitUI.js');
  return createCockpitUI;
};

// Audio Manager (load after core init)
export const loadAudioManager = async () => {
  const { AudioManager } = await import('../systems/AudioManager.js');
  return AudioManager;
};

// Character System (load on demand)
export const loadCharacterSystem = async () => {
  const { createCharacterSystem } = await import('../systems/CharacterSystem.js');
  return createCharacterSystem;
};


// Nameplate System (load on demand) — HTML-in-Canvas nameplate.
// The legacy 2D-canvas NameplateSystem.js is kept on disk for performance comparison.
export const loadNameplateSystem = async () => {
  const { createHtmlNameplateSystem } = await import('../systems/HtmlNameplateSystem.js');
  return createHtmlNameplateSystem;
};


// Core Infrastructure (Phase 4)
export const loadAtmosphereSystem = async () => {
  const { createAtmosphereSystem } = await import('../systems/AtmosphereSystem.js');
  return createAtmosphereSystem;
};

export const loadPhysicsSystem = async () => {
  const { createPhysicsSystem } = await import('../systems/PhysicsSystem.js');
  return createPhysicsSystem;
};

export const loadCameraSystem = async () => {
  const { createCameraSystem } = await import('../core/CameraSystem.js');
  return createCameraSystem;
};

export const loadNavigationManager = async () => {
  const { createNavigationManager } = await import('../navigation/NavigationManager.js');
  return createNavigationManager;
};

// Core UIManager (no panels - just the manager factory)
export const loadUIManagerCore = async () => {
  const { createUIManager } = await import('../ui/UIManager.js');
  return { createUIManager };
};

// Main Control Panel (lazy loaded independently)
export const loadControlPanelUI = async () => {
  const { injectControlPanel, toggleControlPanel } = await import('../ui/ControlPanelUI.js');
  return { injectControlPanel, toggleControlPanel };
};


// NPC system (lazy loaded once at startup — NPCs are on by default, toggled
// from the Debug panel; there is no dedicated NPC UI).
export const loadNpcSystem = async () => {
  const { createNpcSystem } = await import('../systems/NpcSystem.js');
  return createNpcSystem;
};

// In-world HTML-in-Canvas control panels (NPC, Debug, …) — loaded on first use.
export const loadHtmlPanelSystem = async () => {
  const { createHtmlPanelSystem } = await import('../systems/HtmlPanelSystem.js');
  return createHtmlPanelSystem;
};

// Debug UI (lazy loaded independently)
export const loadDebugUI = async () => {
  const { injectDebugPanel, toggleDebugPanel } = await import('../ui/DebugUI.js');
  return { injectDebugPanel, toggleDebugPanel };
};

// Legacy combined loader (for backward compatibility)
export const loadUIManager = async () => {
  const [{ createUIManager }, { injectControlPanel, toggleControlPanel }] = await Promise.all([
    import('../ui/UIManager.js'),
    import('../ui/ControlPanelUI.js')
  ]);
  return { createUIManager, injectControlPanel, toggleControlPanel };
};

export const loadInputManager = async () => {
  const { createInputManager } = await import('../ui/InputManager.js');
  return createInputManager;
};

export const loadGamepadManager = async () => {
  const { createGamepadManager } = await import('../ui/GamepadManager.js');
  return createGamepadManager;
};

export const loadPlanetRenderer = async () => {
  const { createPlanetRenderer } = await import('../terrain/index.js');
  return createPlanetRenderer;
};
