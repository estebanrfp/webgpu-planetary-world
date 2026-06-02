/**
 * ktx2-loader.js - KTX2 Texture Loader with Basis Universal Transcoder
 * Handles loading and GPU-transcoding of Basis-compressed KTX2 textures.
 */

// State
let basisTranscoderReady = false;
let basisTranscoderFailed = false;
let basisInitPromise = null;
let BasisModule = null;

// VK_FORMAT to WebGPU format mappings
const VK_FORMAT_TO_GPU = {
  37: 'rgba8unorm',      // VK_FORMAT_R8G8B8A8_UNORM
  43: 'rgba8unorm-srgb', // VK_FORMAT_R8G8B8A8_SRGB
  131: 'bc1-rgba-unorm',
  132: 'bc1-rgba-unorm-srgb',
  135: 'bc3-rgba-unorm',
  136: 'bc3-rgba-unorm-srgb',
  145: 'bc7-rgba-unorm',
  146: 'bc7-rgba-unorm-srgb',
  157: 'astc-4x4-unorm',
  158: 'astc-4x4-unorm-srgb',
  147: 'etc2-rgb8unorm',
  151: 'etc2-rgba8unorm',
};

// Basis Format to WebGPU
const BASIS_FORMAT_TO_GPU = {
  'BC1': 'bc1-rgba-unorm',
  'BC3': 'bc3-rgba-unorm',
  'BC7': 'bc7-rgba-unorm',
  'ASTC_4x4': 'astc-4x4-unorm',
  'ETC2_RGB': 'etc2-rgb8unorm',
  'ETC2_RGBA': 'etc2-rgba8unorm',
  'RGBA32': 'rgba8unorm',
};

// Basis format enum values (internal to basis_transcoder.js)
const BASIS_FORMAT_VALUES = {
  'BC1': 1,       // cTFBC1_RGB
  'BC3': 3,       // cTFBC3_RGBA  
  'BC7': 6,       // cTFBC7_RGBA
  'ASTC_4x4': 10, // cTFASTC_4x4_RGBA
  'ETC2_RGB': 22, // cTFETC2_EAC_R11
  'ETC2_RGBA': 2, // cTFETC2_RGBA
  'RGBA32': 13,   // cTFRGBA32
};

/**
 * Initialize Basis transcoder WASM
 */
export async function initBasisTranscoder() {
  if (basisTranscoderReady) return true;
  if (basisTranscoderFailed) return false;
  if (basisInitPromise) return basisInitPromise;
  
  basisInitPromise = (async () => {
    try {
      // BASIS is usually global from the CDN script
      if (typeof BASIS !== 'undefined') {
        BasisModule = await BASIS({
          wasmBinary: await fetch('./assets/wasm/basis_transcoder.wasm')
            .then(r => r.arrayBuffer())
        });
        BasisModule.initializeBasis();
        basisTranscoderReady = true;
        console.log('✅ Basis transcoder initialized');
        return true;
      }
      console.warn('⚠️ BASIS global not found. Ensure script is in index.html');
      basisTranscoderFailed = true;
      return false;
    } catch (e) {
      console.error('❌ Failed to initialize Basis transcoder:', e);
      basisTranscoderFailed = true;
      return false;
    }
  })();
  
  return basisInitPromise;
}

/**
 * Select best transcode format based on hardware features
 */
function selectTranscodeFormat(device, hasAlpha) {
  if (device.features.has('texture-compression-bc')) {
    return hasAlpha ? 'BC3' : 'BC1';
  }
  if (device.features.has('texture-compression-astc')) {
    return 'ASTC_4x4';
  }
  if (device.features.has('texture-compression-etc2')) {
    return hasAlpha ? 'ETC2_RGBA' : 'ETC2_RGB';
  }
  return 'RGBA32';
}

/**
 * Load KTX2 texture
 */
export async function loadKTX2Texture(device, url, options = {}) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load KTX2: ${url}`);
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  
  // Verify magic number
  const magic = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 12; i++) {
    if (data[i] !== magic[i]) throw new Error('Invalid KTX2 file');
  }
  
  const view = new DataView(buffer);
  const vkFormat = view.getUint32(12, true);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const levelCount = Math.max(1, view.getUint32(36, true));
  const supercompressionScheme = view.getUint32(40, true);
  
  // BasisLZ compressed or Basis Universal format
  if (supercompressionScheme === 1 || vkFormat === 0) {
    return await loadKTX2WithBasis(device, url, data, pixelWidth, pixelHeight, levelCount, options);
  }
  
  // Raw KTX2 (non-Basis)
  const format = VK_FORMAT_TO_GPU[vkFormat];
  if (!format) throw new Error(`Unsupported KTX2 format: ${vkFormat}`);
  
  const texture = device.createTexture({
    size: [pixelWidth, pixelHeight, 1],
    format,
    mipLevelCount: levelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    label: `KTX2: ${url}`
  });
  
  const levelIndexOffset = 80;
  for (let level = 0; level < levelCount; level++) {
    const byteOffset = Number(view.getBigUint64(levelIndexOffset + level * 24, true));
    const byteLength = Number(view.getBigUint64(levelIndexOffset + level * 24 + 8, true));
    
    const mipWidth = Math.max(1, pixelWidth >> level);
    const mipHeight = Math.max(1, pixelHeight >> level);
    const levelData = data.slice(byteOffset, byteOffset + byteLength);
    
    // Copy to texture
    const blockSize = format.includes('bc') || format.includes('astc') || format.includes('etc') ? 4 : 1;
    const blocksWide = Math.ceil(mipWidth / blockSize);
    const bytesPerBlock = format.includes('bc1') || format.includes('etc2-rgb') ? 8 : (format.startsWith('rgba8') ? 4 : 16);
    const bytesPerRow = blocksWide * bytesPerBlock;
    
    device.queue.writeTexture(
      { texture, mipLevel: level },
      levelData,
      { bytesPerRow, rowsPerImage: mipHeight },
      [mipWidth, mipHeight, 1]
    );
  }
  
  return texture;
}

async function loadKTX2WithBasis(device, url, data, pixelWidth, pixelHeight, levelCount, options = {}) {
  await initBasisTranscoder();
  if (!basisTranscoderReady) throw new Error('Basis transcoder failed to initialize');
  
  const ktx2File = new BasisModule.KTX2File(data);
  if (!ktx2File.isValid()) {
    ktx2File.close(); ktx2File.delete();
    throw new Error('Invalid KTX2/Basis data');
  }
  
  const hasAlpha = ktx2File.getHasAlpha();
  const formatName = options.forceRGBA8 ? 'RGBA32' : selectTranscodeFormat(device, hasAlpha);
  const formatEnum = BASIS_FORMAT_VALUES[formatName];
  const gpuFormat = BASIS_FORMAT_TO_GPU[formatName];
  
  if (!ktx2File.startTranscoding()) {
    ktx2File.close(); ktx2File.delete();
    throw new Error('Failed to start Basis transcoding');
  }
  
  const texture = device.createTexture({
    size: [pixelWidth, pixelHeight, 1],
    format: gpuFormat,
    mipLevelCount: levelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    label: `KTX2 (Basis): ${url}`
  });
  
  for (let level = 0; level < levelCount; level++) {
    const mipWidth = Math.max(1, pixelWidth >> level);
    const mipHeight = Math.max(1, pixelHeight >> level);
    
    const dstSize = ktx2File.getImageTranscodedSizeInBytes(level, 0, 0, formatEnum);
    const dst = new Uint8Array(dstSize);
    
    if (!ktx2File.transcodeImage(dst, level, 0, 0, formatEnum, 0, -1, -1)) {
      console.warn(`[KTX2Loader] Failed to transcode level ${level} of ${url}`);
      continue;
    }

    // RGB-only textures transcoded to RGBA32: ensure alpha = 255 (opaque)
    if (!hasAlpha && formatName === 'RGBA32') {
      for (let i = 3; i < dst.length; i += 4) dst[i] = 255;
    }
    const isCompressed = !gpuFormat.startsWith('rgba');
    if (isCompressed) {
      const bytesPerBlock = gpuFormat.includes('bc1') ? 8 : 16;
      const bytesPerRow = Math.ceil(mipWidth / 4) * bytesPerBlock;
      device.queue.writeTexture(
        { texture, mipLevel: level },
        dst,
        { bytesPerRow },
        [Math.max(4, mipWidth), Math.max(4, mipHeight), 1]
      );
    } else {
      device.queue.writeTexture(
        { texture, mipLevel: level },
        dst,
        { bytesPerRow: mipWidth * 4 },
        [mipWidth, mipHeight, 1]
      );
    }
  }
  
  ktx2File.close(); ktx2File.delete();
  return texture;
}
