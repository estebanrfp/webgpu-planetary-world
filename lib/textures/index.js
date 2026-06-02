/**
 * textures/index.js - Unified texture loading
 */

import { loadKTX2Texture, initBasisTranscoder } from './ktx2-loader.js';
import { 
  loadPrecomputedTextures, 
  createFullscreenQuadBuffer, 
  createGlobalUniformBuffer, 
  writeGlobalUniforms,
  GLOBAL_UNIFORM_FLOAT_COUNT
} from './lut-loader.js';

/**
 * Load a texture from URL, auto-detecting KTX2
 */
export async function loadTexture(device, url) {
  if (url.toLowerCase().endsWith('.ktx2')) {
    return loadKTX2Texture(device, url);
  }
  
  // Basic image loader for PNG/JPG (could be expanded)
  const response = await fetch(url);
  const blob = await response.blob();
  const source = await createImageBitmap(blob);
  
  const texture = device.createTexture({
    size: [source.width, source.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    label: url
  });
  
  device.queue.copyExternalImageToTexture({ source }, { texture }, [source.width, source.height]);
  return texture;
}

export { 
  loadKTX2Texture, 
  initBasisTranscoder, 
  loadPrecomputedTextures,
  createFullscreenQuadBuffer,
  createGlobalUniformBuffer,
  writeGlobalUniforms,
  GLOBAL_UNIFORM_FLOAT_COUNT
};
