/**
 * Avatar Module Index
 * GLB loading and animation system exports
 * [DEBUG: Factory Function Refactor Applied]
 */

export {
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSceneMeshData,
  computeGlobalTransforms,
  extractSkeleton,
  extractSkinningData,
  extractAnimations,
  createCharacterBuffers,
  quatMultiply,
  quatSlerp,
  vec3Lerp,
  trsToMatrix,
  mat4Multiply
} from './glb-loader.js';

export { createAnimationSystem } from './animation-system.js';
export { createNodeAnimationSystem } from './node-animation-system.js';
