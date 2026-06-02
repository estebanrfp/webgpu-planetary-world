/**
 * lib Module - Main Barrel Export
 * 
 * Exports all library modules for the planetary renderer.
 */

// Core functionality
export * from './core/index.js';
export * from './config/index.js';

// Shader sources
export * from './shaders/index.js';

// Terrain system
export * from './terrain/index.js';

// Camera and systems
export * from './systems/index.js';

// Texture loading
export * from './textures/index.js';

// Math utilities
export * from './math/index.js';

// Avatar/character utilities
export * from './avatar/index.js';

// Network/multiplayer (GenosDB)
export * from './network/index.js';
