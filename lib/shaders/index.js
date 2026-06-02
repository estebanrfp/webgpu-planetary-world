/**
 * Shaders Module - Barrel Export
 * 
 * Exports all WGSL shaders as JavaScript template literals
 * for inline loading without fetch() requests.
 */

export { atmosphereShader } from './atmosphere.wgsl.js';
export { terrainShader } from './terrain.wgsl.js';
export { avatarShader, characterShader } from './avatar.wgsl.js';
export { snowShader } from './snow.wgsl.js';
export { rainShader, lightningShader } from './rain.wgsl.js';
export { cloudBakeComputeShader } from './cloudBake.compute.wgsl.js';

