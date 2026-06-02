/**
 * PlanetRenderer.js - Planetary Terrain Engine
 * 
 * Orchestrates geometric terrain rendering, quadtree LOD management,
 * and avatar/character integration.
 */

import { createPlanetQuadtree } from './quadtree.js';
import { createTerrainChunkPool } from './pool.js';
import { createTerrainChunkBuilder } from './builder.js';
import { createFrustumCuller } from '../systems/frustum.js';
import {
  EARTH_CENTER,
  PLANET_RADIUS,
  AVATAR_CONFIG,
  PHYSICS_GRID_CONFIG,
  TERRAIN_TEXTURE_CONFIG,
  TERRAIN_SCALES,
  QUADTREE_CONFIG,
  TERRAIN_GENERATION_PARAMS,
  SHADOW_CONFIG
} from '../config/index.js';
import { getTerrainHeightMultiplier } from './height.js';
import { characterShader } from '../shaders/avatar.wgsl.js';
import { buildVoxelAvatar } from '../avatar/voxel-builder.js';
import { createParcelTooltipSystem } from '../systems/ParcelTooltipSystem.js';
import { createParcelLabelSystem } from '../systems/ParcelLabelSystem.js';
import { createAvatarMarkerSystem } from '../systems/AvatarMarkerSystem.js';
import { createRockSystem } from '../systems/RockSystem.js';
import { createPalmSystem } from '../systems/PalmSystem.js';
import { createTreeSystem } from '../systems/TreeSystem.js';
import { createPlantSystem } from '../systems/PlantSystem.js';
// Systems and Renderers are now lazy-loaded via CharacterSystem, NameplateSystem, and VehicleRenderer
import { terrainHeightGridComputeShader } from '../shaders/terrainHeightGrid.compute.wgsl.js';
import { avatarGroundComputeShader } from '../shaders/avatarGround.compute.wgsl.js';
import { createParcelOverlay } from './parcel-overlay.js';
import { loadKTX2Texture, GLOBAL_UNIFORM_FLOAT_COUNT } from '../textures/index.js';
import {
  loadCharacterSystem,
  loadNameplateSystem,
  loadHtmlPanelSystem
} from '../loaders/index.js';
import { createShadowSystem, createGPUCullingSystem } from './index.js';



// Constants
// Planet dimension constants imported from config/index.js
const MAX_CHUNKS = TERRAIN_SCALES.MAX_CHUNKS;
const MESH_RESOLUTION = TERRAIN_SCALES.MESH_RESOLUTION;
const BYTES_PER_INSTANCE = 64; // 4x vec4f
const AVATAR_INSTANCE_BYTES = 112;  // sizeof(AvatarInstance) — 28 floats
const AVATAR_MAX_INSTANCES = 64;

const createPlanetRendererInternal = (device, format) => {
  // === STATE INITIALIZATION ===
  // device and format are already parameters
  let quadtree = createPlanetQuadtree();
    
    // Terrain mesh system
  let pool = null;
  let builder = null;
    
    // WebGPU resources
  let pipeline = null;
    
    // MEGA-STORAGE BUFFER (51MB for 4096 chunks at 25x25 resolution)
    // 4096 * 625 vertices * 5 floats * 4 bytes = 51,200,000 bytes
    const vertexCountPerChunk = MESH_RESOLUTION * MESH_RESOLUTION;
    const bytesPerVertex = 5 * 4;
    const megaBufferSize = MAX_CHUNKS * vertexCountPerChunk * bytesPerVertex;
    
  let megaVertexBuffer = device.createBuffer({
      size: megaBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'Terrain Mega-Storage Vertex Buffer'
    });
  let wireframePipeline = null;
  let parcelOverlay = null;
  let uniformBindGroup = null;
  let terrainBindGroupLayout = null;
  let lutSampler = null;
    
    // Shadow Mapping System
  let shadowSystem = createShadowSystem(device);
  let _shadowsEnabled = true;
  let _cameraAGL = 0; // Module-level altitude for shadow gate
    // WebGPU resources
  let globalUniformBuffer = null;
  let terrainParamsBuffer = null;
    
    // Frustum culling
  let characterSystem = null;
  let characterUniformBuffer = null;
  let avatarInstanceBuffer = null;
  let avatarInstanceCount = 0;
  let avatarGroundPipeline = null;        // compute pass: snaps NPCs onto the terrain
  let avatarGroundBindGroup = null;
  let avatarGroundParamsBuffer = null;
  let avatarFootOffsetBuffer = null;      // persists the captured avatar foot offset
  const avatarGroundParamsData = new Float32Array(4);
  const avatarInstanceData = new Float32Array(AVATAR_MAX_INSTANCES * 28);
  let npcSystem = null;                  // wandering NPC simulation — injected lazily on the 'n' key
  let presenceSystem = null;             // P2P remote players — injected after auth
  const remoteMeshes = new Map();        // peerId → { vb, ib, count, key } cached voxel mesh
  const _remoteDraw = [];                // per-frame [{ instance, mesh }] of remote players
  let _remoteDrawCount = 0;
  let _npcInstanceEnd = 1;               // instance index where remotes start (NPCs = 1.._npcInstanceEnd-1)
  // Dummy identity for the instance writer (voxel mode shades from vertex colors, so
  // these per-instance procedural fields are ignored — they just satisfy write()).
  const REMOTE_AVATAR_ID = { baseColor: [0.7, 0.7, 0.7], pattern: 0, colorA: [0, 1, 1], colorB: [1, 0, 1], lineScale: 20, lineWidth: 0.06, lineGlow: 0.5, glowMul: 3, multiColor: 0, animSpeed: 1 };
  let characterBindGroup = null;
  let lastAvatarTexture = null; // Track texture used for bind group
    
    // Frustum culling
  let frustumCuller = createFrustumCuller();
  let cachedCameraPos = [0, 0, 0];
  let cachedEarthCenter = [0, 0, 0];
  let _shadowLightDir = [0, 1, 0]; // Primary shadow caster: sun during day, moon at night
  let _cameraUp = [0, 1, 0];       // camera up axis — fed to in-world panels so they stay upright
    
    // State
  let debugMode = 0;
  // Bypass bits encoded alongside debugMode in earthCenter.w (debugMode + bypassFlags * 100)
  let _bypassFlags = 0;
  let debugFlags = 0;
  let wireframe = false;
  let characterVisibility = 1.0; // 0.0 to 1.0 (materialization)
    
    // GPU Culling System
  let gpuCullingSystem = createGPUCullingSystem(device);
  let gpuCullingEnabled = true;

  let _lastTotalCount = 0;
  let _lastRenderedCount = 0;
  let nameplateSystem = null;
  let htmlPanelSystem = null;            // in-world HTML-in-Canvas control panels — lazy
  let _htmlPanelLoading = null;          // in-flight load promise (guards double-create)
  let parcelTooltipSystem = null;
  let _parcelTooltipVisible = 0;
  let parcelLabelSystem = null;
  let _parcelLabelCount = 0;
  let avatarMarkerSystem = null;
  let _avatarMarkerVisible = 0;
  const _markerList = [];                // reused per frame: map dots (player + NPCs + remotes)
  const MARKER_COLOR_PLAYER = [0, 1, 1];      // cyan
  const MARKER_COLOR_NPC = [1, 0.82, 0.15];   // yellow
  const MARKER_COLOR_REMOTE = [1, 0.5, 0.05]; // orange
  let rockSystem = null;
  let _rockCount = 0;
  let palmSystem = null;
  let _palmCount = 0;
  let treeSystem = null;
  let plantSystem = null;
  let _plantCount = 0;
  let _treeCount = 0;
  // Debug bypass — when true, skip all scatter systems (rocks, palms, trees, plants)
  // to measure the FPS contribution of these passes
  let _scatterBypassed = false;
  let isInitialized = false;
    
    // Terrain parameters for CPU height sampling (synchronized with GPU)
  let _currentParams = { ...TERRAIN_GENERATION_PARAMS };


  let _stats = { 
      visibleQuads: 0, 
      maxLod: 0,
      activeChunks: 0,
      buildingChunks: 0,
      poolStats: null
    };
    
    // globalUniformData (matches GlobalUniforms in shader: 48 floats)
  let globalUniformData = new Float32Array(GLOBAL_UNIFORM_FLOAT_COUNT);


  const ensureCharacterSystem = async (initialCharacterForward) => {
    if (characterSystem) return characterSystem;
    try {
      const createCS = await loadCharacterSystem();
      characterSystem = createCS(device, initialCharacterForward);
      await characterSystem.init();
      window._avatarCharacterSystem = characterSystem; // Expose for paint UI

      // Create character uniform buffer
      characterUniformBuffer = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: 'Character Uniform Buffer'
      });

      // Avatar instance buffer — GPU instancing (local player + NPC avatars)
      avatarInstanceBuffer = device.createBuffer({
        size: AVATAR_MAX_INSTANCES * AVATAR_INSTANCE_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'Avatar Instance Buffer'
      });

      await _createAvatarPipeline();
      
      return characterSystem;
    } catch (e) {
      console.error('[PlanetRenderer] Failed to load CharacterSystem:', e);
      return null;
    }
  };

  const ensureNameplateSystem = async () => {
    if (nameplateSystem) return nameplateSystem;
    try {
      const createNS = await loadNameplateSystem();
      nameplateSystem = createNS(device, format, globalUniformBuffer);
      return nameplateSystem;
    } catch (e) {
      console.error('[PlanetRenderer] Failed to load NameplateSystem:', e);
      return null;
    }
  };

  const ensureHtmlPanelSystem = () => {
    if (htmlPanelSystem) return Promise.resolve(htmlPanelSystem);
    if (_htmlPanelLoading) return _htmlPanelLoading;
    _htmlPanelLoading = (async () => {
      try {
        const createHPS = await loadHtmlPanelSystem();
        htmlPanelSystem = createHPS(device, format, globalUniformBuffer);
      } catch (e) {
        console.error('[PlanetRenderer] Failed to load HtmlPanelSystem:', e);
      }
      return htmlPanelSystem;
    })();
    return _htmlPanelLoading;
  };

  // Variables initialized in init() - declared here for closure scope
  let instanceStorageBuffer = null;
  let instanceStagingData = null;
  let terrainParamsData = null;
  let normalArray = null;
  let transmittanceView = null;
  let scatteringView = null;
  let irradianceView = null;
  let cloudView = null;
  let depthTexture = null;
  let depthTextureView = null;
  let avatarBindGroupLayout = null;
  let avatarPipeline = null;
  let avatarTransparentPipeline = null;
  let avatarDepthOnlyPipeline = null;
  let unitGridBuffer = null;
  let unitGridIndexBuffer = null;
  let unitGridIndexCount = 0;
  let mipLevelCount = 0;
  let _mipmapPipeline = null;
  let _mipmapSampler = null;

  // Physics compute pipeline variables
  let gridInputBuffer = null;
  let gridOutputBuffer = null;
  let gridReadbackBuffer = null;
  let gridComputePipeline = null;
  let gridComputeBindGroup = null;

  // Avatar pipeline variables
  let boneBuffer = null;

  // Internal state flags and values
  let _cameraForward = [0, 0, 1];
  let _planetCenteredCameraPos = [0, 0, 0];
  let fogIntensity = 0.0;
  const charData = new Float32Array(40); // Pre-allocate for per-frame updates (24 base + 16 pattern)
  
  // Pre-allocated buffers for physics grid (avoids GC pressure)
  const gridInputData = new Float32Array(12); // avatarNormal(3) + distToCenter(1) + right(3) + pad(1) + forward(3) + pad(1)
  let gridHeightsBuffer = null; // Will be allocated once when grid size is known

  /**
   * Initialize the renderer with WebGPU resources
   * @param {string} shaderWGSL - Terrain shader source code
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {GPUTextureView} transmittanceView - Transmittance LUT view
   * @param {GPUTextureView} scatteringView - Scattering LUT view
   * @param {GPUTextureView} irradianceView - Irradiance LUT view
   * @param {GPUSampler} lutSampler - LUT sampler
   * @param {Function} heightSampler - Height sampling function
   * @param {GPUTextureView} cloudView - Cloud texture view
   * @param {number[]} initialCharacterForward - Optional initial forward vector for avatar
   */
  const init = async (shaderWGSL, width, height, transmittanceViewParam, scatteringViewParam, irradianceViewParam, lutSamplerParam, heightSampler, cloudViewParam, initialCharacterForward = [0, 0, 1]) => {
    // Assign parameters to closure variables
    transmittanceView = transmittanceViewParam;
    scatteringView = scatteringViewParam;
    irradianceView = irradianceViewParam;
    lutSampler = lutSamplerParam;
    cloudView = cloudViewParam;
    
    // Create object pool
    pool = createTerrainChunkPool(device, MESH_RESOLUTION, MAX_CHUNKS, 128);
    
    // Create height sampler function (Synchronized with terrainChunk.wgsl VS)
    const cpuHeightSampler = (nx, ny, nz) => {
      // 1. Get raw multiplier from synchronized noise algorithm
      // Uses live parameters for perfect synchronization
      const multiplier = getTerrainHeightMultiplier([nx, ny, nz], 16, _currentParams); 
      
      // 2. Apply scale matching terrain.wgsl.js
      const heightRaw = multiplier * TERRAIN_SCALES.HEIGHT_SCALE;
      
      // 3. Apply clamp matching terrain.wgsl.js
      return Math.max(-80.0, Math.min(160.0, heightRaw));
    };
    
    // Create chunk builder
    builder = createTerrainChunkBuilder(pool, cpuHeightSampler, megaVertexBuffer, 2048);
    
    // Create global uniform buffer (176 bytes)
    globalUniformBuffer = device.createBuffer({
      size: globalUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Terrain Global Uniform Buffer'
    });

    // Create per-chunk instance storage buffer (48 bytes per instance: 3x vec4f)
    instanceStorageBuffer = device.createBuffer({
      size: MAX_CHUNKS * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'Terrain Instance Storage Buffer'
    });
    // CPU staging buffer for all instance data (12 floats per instance)
    instanceStagingData = new Float32Array((MAX_CHUNKS * BYTES_PER_INSTANCE) / 4);
    
    // Create terrain parameters buffer (128 bytes for alignment and expansion)
    terrainParamsBuffer = device.createBuffer({
      size: 256, // 64 floats * 4 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Terrain Parameters Buffer'
    });
    terrainParamsData = new Float32Array(64); // Matches 256 bytes
    
    // Create depth texture
    _createDepthTexture(width, height);
    
    // Load surface textures (diffuse and normals)
    await _loadSurfaceTextures();

    // Create shadow resources
    shadowSystem.init();

    // Create a static unit grid vertex buffer (MESH_RESOLUTIONxMESH_RESOLUTION)
    _createUnitGridBuffer();

    // Initialize GPU Culling
    gpuCullingSystem.init(instanceStorageBuffer);

    // Create render pipeline
    await _createPipeline(shaderWGSL);
    
    // Initialize GPU physics compute pipelines
    await _createPhysicsComputePipelines();

    // Lazy load non-critical systems in background
    ensureCharacterSystem(initialCharacterForward);
    ensureNameplateSystem();

    // Create parcel overlay system (reuses terrain bind group layout)
    parcelOverlay = createParcelOverlay(device, format, terrainBindGroupLayout);

    // Create parcel tooltip billboard system
    parcelTooltipSystem = createParcelTooltipSystem(device, format, globalUniformBuffer);
    parcelTooltipSystem.resize(width, height);

    // Create parcel label system (instanced billboards for filtered parcels)
    parcelLabelSystem = createParcelLabelSystem(device, format, globalUniformBuffer);
    parcelLabelSystem.resize(width, height);

    // Create avatar position marker (glowing dot for map mode)
    avatarMarkerSystem = createAvatarMarkerSystem(device, format, globalUniformBuffer);
    avatarMarkerSystem.resize(width, height);

    rockSystem = createRockSystem(device, format, globalUniformBuffer, terrainParamsBuffer);
    rockSystem.resize(width, height);

    palmSystem = createPalmSystem(device, format, globalUniformBuffer, terrainParamsBuffer);
    palmSystem.resize(width, height);

    treeSystem = createTreeSystem(device, format, globalUniformBuffer, terrainParamsBuffer);
    treeSystem.resize(width, height);

    // Plants — flower-only mix (~20 per visible zone). Trimmed from the
    // earlier 21-template config; PLANT_CONFIG now contains only the 7
    // generic flower colours so the ground feels populated without the
    // grass / mushroom / alien clutter that looked off next to the
    // procedural trees.
    plantSystem = createPlantSystem(device, format, globalUniformBuffer, terrainParamsBuffer);
    plantSystem.resize(width, height);

    isInitialized = true;
    gpuCullingEnabled = true;
  }


  /**
   * Create the WebGPU render pipeline
   */
  const _createPipeline = async (shaderWGSL) => {
    const shaderModule = device.createShaderModule({
      code: shaderWGSL,
      label: 'Terrain Chunk Shader'
    });
    
    terrainBindGroupLayout = device.createBindGroupLayout({
      label: 'Terrain Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '3d' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d-array' } },  // Normal Array
        {
          binding: 12,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' }
        },
        {
          binding: 13,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' }
        },
        { 
          binding: 14, 
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, 
          buffer: { type: 'read-only-storage' } 
        },
        {
          binding: 15,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 9, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
      ]


    });
    
    uniformBindGroup = device.createBindGroup({
      label: 'Terrain Bind Group',
      layout: terrainBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: globalUniformBuffer } },
        { binding: 1, resource: transmittanceView },
        { binding: 2, resource: scatteringView },
        { binding: 3, resource: irradianceView },
        { binding: 4, resource: lutSampler },
        { binding: 6, resource: normalArray.createView() },
        { binding: 12, resource: { buffer: megaVertexBuffer } },
        { binding: 13, resource: { buffer: gpuCullingSystem.visibleIndicesBuffer } },
        { binding: 14, resource: { buffer: instanceStorageBuffer } },
        { binding: 15, resource: { buffer: terrainParamsBuffer } },
        { binding: 7, resource: shadowSystem.depthTextureArray.createView({ dimension: '2d-array' }) },
        { binding: 8, resource: shadowSystem.sampler },
        { binding: 9, resource: { buffer: shadowSystem.uniformBuffer } },
        { binding: 10, resource: cloudView }
      ]


    });


    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [terrainBindGroupLayout]
    });
    
    pipeline = device.createRenderPipeline({
      label: 'Terrain Render Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: []
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'front',  // Cull front faces (terrain has inverted winding)
        frontFace: 'ccw'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'greater', // Reverse-Z: High precision for planetary scale
        format: 'depth32float'    // 32-bit float for maximum accuracy
      }

    });

    // Create wireframe pipeline
    wireframePipeline = device.createRenderPipeline({
      label: 'Terrain Wireframe Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_wireframe',
        buffers: []
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_wireframe',
        targets: [{
          format: format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none', // Show both sides in wireframe
      },
      depthStencil: {
        depthWriteEnabled: false, // Don't write depth in wireframe to avoid z-fighting with terrain
        depthCompare: 'greater-equal', // Reverse-Z: use greater-equal for overlays
        format: 'depth32float'
      }
    });
  }

  /**
   * Create depth texture for rendering
   */
  const _createDepthTexture = (width, height) => {
    if (depthTexture) {
      depthTexture.destroy();
    }
    
    depthTexture = device.createTexture({
      size: [width, height],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      label: 'Terrain Depth Texture'
    });
    
    depthTextureView = depthTexture.createView();
  }

  /**
   * Load surface textures from assets/textures/ and consolidate into Texture Arrays
   */
  const _loadSurfaceTextures = async () => {
    const { normalMaps, textureOrder, flatNormal } = TERRAIN_TEXTURE_CONFIG;
    const loadedNormal = [];
    const textureCache = {}; // Cache to avoid re-loading same texture (e.g., water used 4x)

    let width = 512;
    let height = 512;
    let mipLevelCount = 10;

    // 1. First pass: Load all unique textures and determine the MAXIMUM resolution
    for (let i = 0; i < textureOrder.length; i++) {
        const key = textureOrder[i];
        const path = normalMaps[key];
        
        if (!path) {
            console.warn(`[PlanetRenderer] No path found for key "${key}", using fallback`);
            continue;
        }

        // Check cache first (avoids re-loading water texture 4 times)
        if (textureCache[path]) {
            loadedNormal[i] = textureCache[path];
            continue;
        }

        try {
            const nTex = path.endsWith('.ktx2')
                ? await loadKTX2Texture(device, path, { forceRGBA8: true })
                : await _loadImageTexture(path);
            
            if (nTex.width > width) width = nTex.width;
            if (nTex.height > height) height = nTex.height;
            
            textureCache[path] = nTex;
            loadedNormal[i] = nTex;
        } catch (e) {
            console.warn(`[PlanetRenderer] Failed to load "${key}" (${path}):`, e);
        }
    }

    mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;

    // 2. Second pass: Ensure all layers have a texture (fallback for missing)
    for (let i = 0; i < textureOrder.length; i++) {
        if (!loadedNormal[i]) {
            console.warn(`[PlanetRenderer] Layer ${i} (${textureOrder[i]}) missing, using flat fallback`);
            loadedNormal[i] = _createFallbackTexture(flatNormal, width, height, mipLevelCount);
        }
    }

    // Create the Normal Map GPUTexture Array (The only one we need now)
    normalArray = device.createTexture({
      size: [width, height, loadedNormal.length],
      format: 'rgba8unorm',
      dimension: '2d',
      mipLevelCount: mipLevelCount,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      label: 'Terrain Normal Array'
    });

    // Copy loaded textures into the layers
    const commandEncoder = device.createCommandEncoder({ label: 'Texture Array Copy' });
    
    for (let i = 0; i < loadedNormal.length; i++) {
        _copyToLayer(commandEncoder, loadedNormal[i], normalArray, i);
    }
    
    device.queue.submit([commandEncoder.finish()]);

    // Generate mips for normal maps
    for (let i = 0; i < loadedNormal.length; i++) {
        await _generateMipmaps(normalArray, i);
    }
    
    // Clean up temporary textures
    loadedNormal.forEach(t => t.destroy());

  }

  const _copyToLayer = (commandEncoder, source, targetArray, layer) => {
    const mipLevels = Math.min(source.mipLevelCount, targetArray.mipLevelCount);
    
    for (let level = 0; level < mipLevels; level++) {
      const srcWidth = Math.max(1, source.width >> level);
      const srcHeight = Math.max(1, source.height >> level);
      const dstWidth = Math.max(1, targetArray.width >> level);
      const dstHeight = Math.max(1, targetArray.height >> level);
      
      const copyWidth = Math.min(srcWidth, dstWidth);
      const copyHeight = Math.min(srcHeight, dstHeight);

      commandEncoder.copyTextureToTexture(
        { texture: source, mipLevel: level },
        { texture: targetArray, mipLevel: level, origin: { z: layer } },
        [copyWidth, copyHeight, 1]
      );
    }
  }

  /**
   * Helper to load a classic image texture and generate mipmaps
   */
  const _loadImageTexture = async (path, targetWidth, targetHeight) => {
    const response = await fetch(path);
    const blob = await response.blob();
    let source = await createImageBitmap(blob);
    
    const width = targetWidth || source.width;
    const height = targetHeight || source.height;

    // Scale if needed using a temporary canvas
    if (source.width !== width || source.height !== height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, width, height);
      source = await createImageBitmap(canvas);
    }

    const texture = device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
      mipLevelCount: Math.floor(Math.log2(Math.max(width, height))) + 1,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      label: path
    });
    
    device.queue.copyExternalImageToTexture(
      { source }, 
      { texture }, 
      [width, height]
    );
    await _generateMipmaps(texture);
    return texture;
  }

  /**
   * Helper to generate mipmaps for a texture via blitting.
   * Supports both 2D textures and specific layers of 2D Texture Arrays.
   */
  const _generateMipmaps = async (texture, layer = 0) => {
    if (!device || !texture) return;
    
    const mipLevels = texture.mipLevelCount;
    if (mipLevels <= 1) return;

    // Create a simple blit pipeline if it doesn't exist
    if (!_mipmapPipeline) {
      const shaderModule = device.createShaderModule({
        label: 'Mipmap Generation Shader',
        code: `
          var<private> pos : array<vec2f, 3> = array<vec2f, 3>(
            vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
          );
          struct VertexOutput {
            @builtin(position) position : vec4f,
            @location(0) uv : vec2f,
          };
          @vertex
          fn vs_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
            var out : VertexOutput;
            out.position = vec4(pos[vertexIndex], 0.0, 1.0);
            out.uv = pos[vertexIndex] * 0.5 + 0.5;
            out.uv.y = 1.0 - out.uv.y;
            return out;
          }
          @group(0) @binding(0) var sampler0 : sampler;
          @group(0) @binding(1) var texture0 : texture_2d<f32>;
          @fragment
          fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
            return textureSample(texture0, sampler0, uv);
          }
        `
      });

      _mipmapPipeline = device.createRenderPipeline({
        label: 'Mipmap Generation Pipeline',
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [{ format: 'rgba8unorm' }]
        },
        primitive: { topology: 'triangle-list' }
      });

      _mipmapSampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear'
      });
    }

    const commandEncoder = device.createCommandEncoder({ label: 'Mipmap Generator' });
    let width = texture.width;
    let height = texture.height;

    for (let i = 1; i < mipLevels; i++) {
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));

      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView({
            baseMipLevel: i,
            mipLevelCount: 1,
            baseArrayLayer: layer,
            arrayLayerCount: 1,
            dimension: '2d'
          }),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store'
        }]
      });
      
      pass.setPipeline(_mipmapPipeline);
      pass.setBindGroup(0, device.createBindGroup({
        layout: _mipmapPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: _mipmapSampler },
          { 
            binding: 1, 
            resource: texture.createView({
              baseMipLevel: i - 1,
              mipLevelCount: 1,
              baseArrayLayer: layer,
              arrayLayerCount: 1,
              dimension: '2d'
            }) 
          }
        ]
      }));

      pass.draw(3);
      pass.end();
    }

    device.queue.submit([commandEncoder.finish()]);
  }




  /**
   * Create the avatar render pipeline with skeletal animation support
   */
  const _createAvatarPipeline = async () => {
    // Use character shader with skeletal animation
    const shaderModule = device.createShaderModule({
      code: characterShader,
      label: 'Character Skeletal Shader'
    });
    
    // Bind group layout for skeletal character rendering
    // Matches the shader:
    // @group(0) @binding(0) camera uniforms
    // @group(0) @binding(1) character uniforms (model, color, scale)
    // @group(0) @binding(2) texture
    // @group(0) @binding(3) sampler
    // @group(0) @binding(4) bone matrices storage
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'Character Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ]
    });
    
    avatarBindGroupLayout = bindGroupLayout;
    
    const pipelineLayout = device.createPipelineLayout({
      label: 'Character Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout]
    });
    
    // Vertex buffer layout for skinned mesh:
    // position (3f) + normal (3f) + uv (2f) + joints (4f) + weights (4f) + color (3f) = 19 floats = 76 bytes
    const vertexBufferLayout = {
      arrayStride: 76,
      attributes: [
        { format: 'float32x3', offset: 0, shaderLocation: 0 },   // position
        { format: 'float32x3', offset: 12, shaderLocation: 1 },  // normal
        { format: 'float32x2', offset: 24, shaderLocation: 2 },  // uv
        { format: 'float32x4', offset: 32, shaderLocation: 3 },  // joints
        { format: 'float32x4', offset: 48, shaderLocation: 4 },  // weights
        { format: 'float32x3', offset: 64, shaderLocation: 5 },  // color (voxel flat colors)
      ]
    };
    
    avatarPipeline = device.createRenderPipeline({
      label: 'Character Render Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: format
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'greater',
        format: 'depth32float'
      }
    });

    // Create a second pipeline for transparency (No Depth Write, Alpha Blending)
    avatarTransparentPipeline = device.createRenderPipeline({
      label: 'Character Transparent Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: false, // Smooth self-overlapping
        depthCompare: 'equal',    // Pass only where Depth-Only mask was written
        format: 'depth32float'
      }
    });

    // Create a third pipeline for Depth Pre-pass (Masking the interior)
    avatarDepthOnlyPipeline = device.createRenderPipeline({
      label: 'Character Depth-Only Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main', // We still need the entry point even if we don't write
        targets: [{
          format: format,
          writeMask: 0 // Do not write color
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'greater',
        format: 'depth32float'
      }
    });
    
    // Skeletal avatar is initialized via _updateCharacterBindGroup once loaded
  }
  
  /**
   * Update the character bind group when avatar loads or texture changes
   * Called by the render loop when characterSystem.avatarLoaded becomes true
   */
  const _updateCharacterBindGroup = () => {
    if (!characterSystem?.avatarLoaded) return;
    
    const currentTexture = characterSystem.avatarTexture;
    
    // Skip if bind group exists and texture hasn't changed
    if (characterBindGroup && currentTexture === lastAvatarTexture) return;
    
    const boneBuffer = characterSystem.ensureBoneMatricesBuffer();
    if (!boneBuffer || !currentTexture) return;
    
    // Track the texture we're using
    lastAvatarTexture = currentTexture;
    
    characterBindGroup = device.createBindGroup({
      label: 'Character Skeletal Bind Group',
      layout: avatarBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: globalUniformBuffer } },
        { binding: 1, resource: { buffer: avatarInstanceBuffer } },
        { binding: 2, resource: currentTexture.createView() },
        { binding: 3, resource: characterSystem.avatarSampler },
        { binding: 4, resource: { buffer: boneBuffer } },
      ]
    });
    
  }

  /**
   * Update the quadtree and terrain system
   * @param {number[]} cameraPos - Camera position [x, y, z] in world space
   * @param {number[]} cameraForward - Camera forward direction (optional)
   * @param {number} gpuAltitude - Optional GPU-calculated altitude above terrain
   */
  const update = (cameraPos, cameraForward = null, gpuAltitude = null) => {
    if (!isInitialized) return;
    
    // Store camera forward for GPU culling
    _cameraForward = cameraForward;
    
    // cameraPos is already planet-local relative to EARTH_CENTER
    // Quadtree operates in local space where planet is at [0,0,0]
    const cameraLocalToPlanet = [...cameraPos];
    
    // Use GPU altitude if provided (more accurate for LOD)
    let cameraAGL = (gpuAltitude !== null && gpuAltitude !== undefined) ? gpuAltitude : 1000.0;
    _cameraAGL = cameraAGL;
    
    // Update quadtree with camera in planet-local space
    quadtree.update(cameraLocalToPlanet, cameraForward, Math.max(0, cameraAGL));
    
    // PRECISION FIX: Store planet-centered camera position in Float64
    // This is used for calculating relative chunk centers in render()
    _planetCenteredCameraPos = [...cameraPos];
    
    // Get visible quads
    const visibleQuads = quadtree.getVisibleQuads();
    
    // Update builder with desired quads
    builder.updateDesiredQuads(visibleQuads, cameraPos);
    
    // Process one frame of building
    builder.processFrame();
    
    // Commit any completed builds
    const changes = builder.commit();
    
    // Mark quads as mesh ready and calculate morph factors
    for (const quadId of changes.added) {
      for (const quad of visibleQuads) {
        if (quad.id === quadId) {
          quad.setMeshReady();
          break;
        }
      }
    }
    
    // No longer calculating morph factors on CPU. GPU compute shader handles 

    // Update stats
    const quadStats = quadtree.getStats();
    const poolStats = pool.getStats();
    const buildStats = builder.getStats();
    
    _stats = {
      visibleQuads: quadStats.totalQuads,
      maxLod: quadStats.maxLevel,
      activeChunks: poolStats.activeCount,
      buildingChunks: buildStats.chunksQueued + buildStats.chunksBuilding,
      poolStats: poolStats
    };

    // Scatter systems — skipped entirely when the debug bypass is on
    if (!_scatterBypassed) {
      if (rockSystem) {
        _rockCount = rockSystem.update(visibleQuads, cameraPos);
      }
      if (palmSystem) {
        _palmCount = palmSystem.update(visibleQuads, cameraPos);
      }
      if (treeSystem) {
        _treeCount = treeSystem.update(visibleQuads, cameraPos);
      }
      if (plantSystem) {
        _plantCount = plantSystem.update(visibleQuads, cameraPos);
      }
    } else {
      _rockCount = 0;
      _palmCount = 0;
      _treeCount = 0;
      _plantCount = 0;
    }
  }

  /**
   * Update terrain generation parameters in real-time
   * @param {Object} params - Terrain parameters
   */
  const updateTerrainParams = (params) => {
    if (!terrainParamsBuffer) return;

    // Update GPU data
    terrainParamsData[0] = params.warpFactor;
    terrainParamsData[1] = params.mountMaskFreq;
    terrainParamsData[2] = params.baseAmplitude;
    terrainParamsData[3] = params.baseFrequency;
    terrainParamsData[4] = params.persistence;
    terrainParamsData[5] = params.lacunarity;
    terrainParamsData[6] = params.contrastExp;
    terrainParamsData[7] = params.contrastScale;
    terrainParamsData[8] = params.seaLevelOffset;
    terrainParamsData[9] = params.ridgeDetail;
    terrainParamsData[10] = params.abyssDetail;
    terrainParamsData[11] = params.detailScale;
    terrainParamsData[12] = params.grassCoverage;
    terrainParamsData[13] = params.sandCoverage;
    terrainParamsData[14] = params.snowCoverage;
    terrainParamsData[15] = params.rockCoverage;
    // NEW PARAMETERS (Indices 16-19)
    terrainParamsData[16] = params.octaves !== undefined ? params.octaves : 14.0;
    terrainParamsData[17] = params.warpScale !== undefined ? params.warpScale : 1.5;
    terrainParamsData[18] = params.warpStrength2 !== undefined ? params.warpStrength2 : 0.0;
    terrainParamsData[19] = params.peakSoftness !== undefined ? params.peakSoftness : 0.0;
    
    // Planetary Style (Indices 20-26)
    terrainParamsData[20] = params.terraceAmount !== undefined ? params.terraceAmount : 0.0;
    terrainParamsData[21] = params.terraceSmooth !== undefined ? params.terraceSmooth : 0.5;
    terrainParamsData[22] = params.mountainSharpness !== undefined ? params.mountainSharpness : 1.0;
    terrainParamsData[23] = params.shelfWidth !== undefined ? params.shelfWidth : 0.5;
    terrainParamsData[24] = params.beachWidth !== undefined ? params.beachWidth : 0.05;
    terrainParamsData[25] = params.snowLine !== undefined ? params.snowLine : 0.6;
    terrainParamsData[26] = params.sandSharpness !== undefined ? params.sandSharpness : 0.2;
    terrainParamsData[27] = params.rockThreshold !== undefined ? params.rockThreshold : 0.3;
    terrainParamsData[28] = params.grassThreshold !== undefined ? params.grassThreshold : 0.35;
    terrainParamsData[29] = params.globalMoisture !== undefined ? params.globalMoisture : 0.0;
    terrainParamsData[30] = debugFlags; // index 30
    terrainParamsData[31] = params.lakeDetail !== undefined ? params.lakeDetail : 0.0;

    // Biome Colors - starting at index 32
    const writeColor = (idx, col) => {
        if (!col) return;
        terrainParamsData[idx] = col[0];
        terrainParamsData[idx+1] = col[1];
        terrainParamsData[idx+2] = col[2];
        terrainParamsData[idx+3] = 1.0; // w component for alignment
    };

    writeColor(32, params.colGrass);
    writeColor(36, params.colForest);
    writeColor(40, params.colRock);
    writeColor(44, params.colSnow);
    writeColor(48, params.colSand);
    writeColor(52, params.colGround);
    writeColor(56, params.colShallowSea);
    writeColor(60, params.colDeepSea);

    device.queue.writeBuffer(terrainParamsBuffer, 0, terrainParamsData);
    
    // Update local copy for CPU height sampler
    Object.assign(_currentParams, params);
    
    // Check if Noise flag changed (bit 5 of debugFlags)
    _currentParams.showNoise = (debugFlags & 32) !== 0;
  }
  
  /**
   * Update character animation state
   * @param {number} deltaTime - Frame delta time in seconds
   * @param {Object} movementState - Movement state flags
   */
  const updateCharacter = (deltaTime, movementState = {}) => {
    if (!characterSystem) return;
    
    // Pass movement state and camera vectors to character system
    characterSystem.updateAnimation(
        deltaTime, 
        movementState, 
        movementState.desiredMoveDir,
        movementState.cameraVectors.up
    );
    
    // Update visibility (clamped 0-1)
    if (movementState.visibility !== undefined) {
        characterVisibility = Math.max(0, Math.min(1, movementState.visibility));
    }
    
  }

  /**
   * Update character uniform data (internal)
   * @private
   */
  const _updateCharacterUniforms = () => {
    if (!characterSystem || !characterUniformBuffer) return;
    
    // Character Data Layout:
    // [0-15]  Model matrix (4x4)
    // [16-18] Color (RGB)
    // [19]    Scale
    // [20-23] Forward direction (XYZW)
    charData.fill(0);
    
    // Model matrix (identity)
    charData.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
    
    // Base color (avatar identity — parametric, from AVATAR_CONFIG)
    const baseCol = AVATAR_CONFIG.baseColor ?? [0.75, 0.75, 0.75];
    charData[16] = baseCol[0];
    charData[17] = baseCol[1];
    charData[18] = baseCol[2];
    
    // Scale
    charData[19] = AVATAR_CONFIG.scale;
    
    // Forward direction from character system
    const fwd = characterSystem.forward;
    charData[20] = fwd[0];
    charData[21] = fwd[1];
    charData[22] = fwd[2];
    charData[23] = characterVisibility; // [23] is the visibility factor

    // Vertex paint pattern params [24-39]
    if (AVATAR_CONFIG.vertexPaint) {
      charData[24] = AVATAR_CONFIG.pattern ?? 0;      // patternType
      charData[25] = AVATAR_CONFIG.lineScale ?? 20;    // lineScale
      charData[26] = AVATAR_CONFIG.lineWidth ?? 0.06;  // lineWidth
      charData[27] = AVATAR_CONFIG.lineGlow ?? 0.5;    // lineGlow
      const lc = AVATAR_CONFIG.lineColor ?? [0,1,1];
      charData[28] = lc[0]; charData[29] = lc[1]; charData[30] = lc[2]; // lineColor
      charData[31] = performance.now() / 1000 * (AVATAR_CONFIG.animSpeed ?? 1); // animTime
      const lc2 = AVATAR_CONFIG.lineColor2 ?? [1,0,1];
      charData[32] = lc2[0]; charData[33] = lc2[1]; charData[34] = lc2[2]; // lineColor2
      charData[35] = AVATAR_CONFIG.multiColor ? 1 : 0; // multiColor
      charData[36] = AVATAR_CONFIG.glowMul ?? 3.0;     // glowMul
      charData[37] = 1.0;                               // vertexPaint flag
      charData[38] = 0; // reserved
    }

    device.queue.writeBuffer(characterUniformBuffer, 0, charData);
  }

  /** Lazily build + cache an NPC's own voxel mesh (full per-NPC variety). */
  const _ensureNpcMesh = (npc) => {
    if (npc._mesh) return npc._mesh;
    const skel = characterSystem?.skeleton;
    if (!skel || !npc.voxelParams) return null;
    const { vertices, indices } = buildVoxelAvatar(npc.voxelParams, skel);
    const vb = device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, vertices);
    const ib = device.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, indices);
    npc._mesh = { vb, ib, count: indices.length };
    return npc._mesh;
  };

  /** Build + cache a remote player's voxel mesh (rebuilt if its params change). */
  const _ensureRemoteMesh = (player) => {
    const skel = characterSystem?.skeleton;
    if (!skel || !player.params) return null;
    const key = JSON.stringify(player.params);
    let m = remoteMeshes.get(player.id);
    if (m && m.key === key) return m;
    if (m) { m.vb.destroy?.(); m.ib.destroy?.(); }
    const { vertices, indices } = buildVoxelAvatar(player.params, skel);
    const vb = device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, vertices);
    const ib = device.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, indices);
    m = { vb, ib, count: indices.length, key };
    remoteMeshes.set(player.id, m);
    return m;
  };

  /**
   * Fill the avatar instance buffer: local player (instance 0) followed by the
   * NpcSystem NPCs. Returns the instance count.
   * @param {number[]} avatarSphere - local avatar camera-relative position
   * @param {number[]} [absoluteCameraPos] - absolute camera position (for remote peers)
   * @returns {number}
   */
  const _updateAvatarInstances = (avatarSphere, absoluteCameraPos = null) => {
    if (!avatarInstanceBuffer || !avatarSphere || !characterSystem) return 0;

    const d = avatarInstanceData;
    const ec = cachedEarthCenter;
    const tNow = performance.now() / 1000;

    const write = (idx, cx, cy, cz, fx, fy, fz, id, visibility = 1.0, boneSlot = 0) => {
      const o = idx * 28;
      d[o] = cx; d[o + 1] = cy; d[o + 2] = cz; d[o + 3] = AVATAR_CONFIG.scale;
      // d[o + 7] is the `visibility` field consumed by avatar.wgsl
      // (struct AvatarInstance.visibility). Was hardcoded to 1.0, which
      // is why characterVisibility=0 did not actually hide the avatar.
      d[o + 4] = fx; d[o + 5] = fy; d[o + 6] = fz; d[o + 7] = visibility;
      d[o + 8] = id.baseColor[0]; d[o + 9] = id.baseColor[1]; d[o + 10] = id.baseColor[2];
      d[o + 11] = id.pattern;
      d[o + 12] = id.colorA[0]; d[o + 13] = id.colorA[1]; d[o + 14] = id.colorA[2];
      d[o + 15] = id.lineScale;
      d[o + 16] = id.colorB[0]; d[o + 17] = id.colorB[1]; d[o + 18] = id.colorB[2];
      d[o + 19] = id.lineWidth;
      d[o + 20] = id.lineGlow; d[o + 21] = id.glowMul;
      d[o + 22] = id.multiColor; d[o + 23] = tNow * id.animSpeed;
      d[o + 24] = AVATAR_CONFIG.voxel ? 2.0 : 1.0; // shading: 2=voxel flat color, 1=procedural pattern
      d[o + 25] = boneSlot;     // per-instance bone slot (player=0, NPC by state/phase)
    };

    // Instance 0 — local player, identity from AVATAR_CONFIG
    const C = AVATAR_CONFIG;
    const fwd = characterSystem.forward;
    write(0, avatarSphere[0], avatarSphere[1], avatarSphere[2], fwd[0], fwd[1], fwd[2], {
      baseColor: C.baseColor ?? [0.75, 0.75, 0.75],
      pattern: C.pattern ?? 6,
      colorA: C.lineColor ?? [0, 1, 1],
      colorB: C.lineColor2 ?? [1, 0, 1],
      lineScale: C.lineScale ?? 20,
      lineWidth: C.lineWidth ?? 0.06,
      lineGlow: C.lineGlow ?? 0.5,
      glowMul: C.glowMul ?? 3,
      multiColor: C.multiColor ? 1 : 0,
      animSpeed: C.animSpeed ?? 1,
    }, characterVisibility);

    // Hide the local player while an in-world panel is open or in parcel-map mode.
    if ((htmlPanelSystem && htmlPanelSystem.hasActivePanel()) || parcelOverlay?.active) d[3] = 0;

    // Instances 1..N — NPCs (wander simulation owned by NpcSystem, if loaded).
    // NpcSystem toroidally wraps the finite roster around the player so a dense crowd always
    // fills the physics-grid range (precise ground for walk/swim) and sets `npc._fade`
    // (1 near → 0 at the precise-ground edge, hiding the wrap seam). We keep each NPC at a
    // FIXED instance slot = roster index + 1 (the draw loop selects its mesh by that index),
    // so we never compact — just write `_fade` as visibility and let the draw loop skip the
    // fully-faded ones. A stable slot also keeps idle variants / walk phases from flipping.
    let count = 1;
    if (npcSystem) {
      const npcs = npcSystem.update(avatarSphere, ec, _currentParams);
      for (let i = 0; i < npcs.length && i + 1 < AVATAR_MAX_INSTANCES; i++) {
        const npc = npcs[i];
        const fade = npc._fade ?? 1;
        const slot = characterSystem.npcBoneSlot?.(npc.state, i) ?? 0;
        write(i + 1, npc.center[0], npc.center[1], npc.center[2],
          npc.forward[0], npc.forward[1], npc.forward[2], npc, fade, slot);
        if (fade > 0.001 && AVATAR_CONFIG.voxel) _ensureNpcMesh(npc); // build mesh only for visible NPCs
        count = i + 2;
      }
    }

    // NPCs end here; remotes follow. The ground-snap pass only snaps 1.._npcInstanceEnd-1
    // (NPCs wander on a tangent plane and need terrain snapping). Remote players
    // broadcast their own absolute Y — snapping them would pin flyers to the ground.
    _npcInstanceEnd = count;

    // Remote P2P players — their own voxel meshes, positioned from absolute coords.
    _remoteDrawCount = 0;
    if (presenceSystem && AVATAR_CONFIG.voxel && absoluteCameraPos && characterSystem.skeleton) {
      const players = presenceSystem.getRemotePlayers();
      let ri = 0;
      for (const pl of players) {
        if (count >= AVATAR_MAX_INSTANCES) break;
        const m = _ensureRemoteMesh(pl);
        if (!m) continue;
        const cx = pl.x - absoluteCameraPos[0], cy = pl.y - absoluteCameraPos[1], cz = pl.z - absoluteCameraPos[2];
        const slot = characterSystem.animBoneSlot?.(pl.anim, ri) ?? 0;
        write(count, cx, cy, cz, pl.forward[0], pl.forward[1], pl.forward[2], REMOTE_AVATAR_ID, 1.0, slot);
        _remoteDraw[_remoteDrawCount++] = { instance: count, mesh: m };
        count++; ri++;
      }
    }

    device.queue.writeBuffer(avatarInstanceBuffer, 0, avatarInstanceData, 0, count * 28);
    return count;
  }

  /**
   * @param {number} rainIntensity - Rain intensity [0,1]
   * @param {number} lightningFlash - Lightning flash intensity [0,1.8]
   * @param {number[]} lightningPos - Lightning strike position [x,y,z]
   * @param {number} rawTime - Unscaled accumulated time
   */
  const updateUniforms = (viewProjection, cameraPos, sunDir, earthCenter, exposure, maxLevel, cloudOpacities = null, avatarSphere = null, moonDir = null, fogIntensityParam = 0.0, cloudCoverage = 0.0, cloudTime = 0.0, artisticParams = null, rainIntensity = 0.0, lightningFlash = 0.0, lightningPos = [0, 0, 0], rawTime = 0.0, ocean = null, snowIntensity = 0.0) => {
    if (!globalUniformBuffer) return;
    
    // Store fog intensity for use in render()
    fogIntensity = fogIntensityParam;
    
    // Update culler
    cachedCameraPos = [...cameraPos];
    cachedEarthCenter = [...earthCenter];
    frustumCuller.update(viewProjection, cameraPos, earthCenter);
    
    // Fill global uniform data (GlobalUniforms structure)
    // viewProjection (16 floats)
    globalUniformData.set(viewProjection, 0);
    
    // cameraPos (xyz) + exposure (w)
    // FLOATING ORIGIN: Camera is always at [0,0,0] in shader space
    globalUniformData[16] = 0;
    globalUniformData[17] = 0;
    globalUniformData[18] = 0;
    globalUniformData[19] = exposure;
    
    // sunDirection (xyz) + sun size (w)
    globalUniformData[20] = sunDir[0];
    globalUniformData[21] = sunDir[1];
    globalUniformData[22] = sunDir[2];
    globalUniformData[23] = 0.00467;  // Sun size
    
    // earthCenter (xyz) + debugMode + bypassFlags*100 (w)
    // FLOATING ORIGIN: earthCenter is now relative to the camera
    globalUniformData[24] = earthCenter[0] - cameraPos[0];
    globalUniformData[25] = earthCenter[1] - cameraPos[1];
    globalUniformData[26] = earthCenter[2] - cameraPos[2];
    globalUniformData[27] = debugMode + _bypassFlags * 100;
    
    // whitePoint (xyz) + debugFlags (w)
    globalUniformData[28] = 1.0;
    globalUniformData[29] = 1.0;
    globalUniformData[30] = 1.0;
    globalUniformData[31] = debugFlags;
    
    // cloudOpacities (4) - L1, L2, L3 opacities + shadowStrength
    if (cloudOpacities) {
      globalUniformData.set(cloudOpacities, 32);
    } else {
      globalUniformData.set([0, 0, 0, 0], 32);
    }
    
    // avatarSphere (4) - FLOATING ORIGIN: Input is already relative to camera (from AtmosphereSystem)
    if (avatarSphere) {
      globalUniformData.set(avatarSphere, 36);
    }
    
    // moonDir (4)
    if (moonDir) {
      globalUniformData.set(moonDir, 40);
    } else {
      globalUniformData[40] = 0;
      globalUniformData[41] = 1;
      globalUniformData[42] = 0;
      globalUniformData[43] = 0.03; // Default moon size
    }
    
    // miscParams (4)
    // cloudTime (x), reserved (y), cloudCoverage (z), rawTime (w)
    globalUniformData[44] = cloudTime; 
    globalUniformData[45] = fogIntensity;
    globalUniformData[46] = cloudCoverage;
    globalUniformData[47] = rawTime; 
    
    // Artistic/Cinematic Parameters (Advanced Ambient Light)
    if (artisticParams) {
      // 48-51: skyStylization (saturation, vibrance, fog, reserved)
      globalUniformData[48] = artisticParams.skySaturation ?? 1.0;
      globalUniformData[49] = artisticParams.skyVibrance ?? 1.0;
      globalUniformData[50] = fogIntensity; 
      globalUniformData[51] = 0.0;
      
      // 52-55: skyTint (RGB, Multiplier/W)
      globalUniformData[52] = artisticParams.skyTintR ?? 1.0;
      globalUniformData[53] = artisticParams.skyTintG ?? 1.0;
      globalUniformData[54] = artisticParams.skyTintB ?? 1.0;
      globalUniformData[55] = 1.0; // Ambient power multiplier
    } else {
      globalUniformData.set([1.0, 1.0, 0.0, 0.0], 48);
      globalUniformData.set([1.0, 1.0, 1.0, 1.0], 52);
    }

    // rainParams (4) - intensity (x), shadowDayWeight (y), snowIntensity (z), w reserved
    globalUniformData[56] = rainIntensity;
    globalUniformData[58] = snowIntensity;

    // Shadow day weight: 1.0 = sun shadows, 0.0 = moon shadows
    const ecx = globalUniformData[24], ecy = globalUniformData[25], ecz = globalUniformData[26];
    const ecLen = Math.sqrt(ecx * ecx + ecy * ecy + ecz * ecz) || 1;
    const lux = -ecx / ecLen, luy = -ecy / ecLen, luz = -ecz / ecLen;
    const sunElev = lux * sunDir[0] + luy * sunDir[1] + luz * sunDir[2];
    const st = Math.max(0, Math.min(1, (sunElev + 0.1) / 0.2));
    const sdw = st * st * (3 - 2 * st); // smoothstep
    globalUniformData[57] = sdw;

    // Shadow light direction: sun during day, moon during night
    _shadowLightDir = sdw > 0.5
      ? [sunDir[0], sunDir[1], sunDir[2]]
      : [globalUniformData[40], globalUniformData[41], globalUniformData[42]];

    // index 58 (rainParams.z) carries snowIntensity — see write above. Don't
    // clobber it here. Only zero the truly reserved .w.
    globalUniformData[59] = 0.0;

    // lightning_params (4) - flash (x), yzw strike position
    globalUniformData[60] = lightningFlash;
    globalUniformData[61] = lightningPos[0];
    globalUniformData[62] = lightningPos[1];
    globalUniformData[63] = lightningPos[2];

    // oceanParams (slots 64-79)
    const o = ocean ?? {};
    globalUniformData[64] = o.waveScale ?? 3.0;
    globalUniformData[65] = o.waveSpeed ?? 0.5;
    globalUniformData[66] = o.reflectionStr ?? 0.4;
    globalUniformData[67] = o.foamIntensity ?? 0.6;
    globalUniformData[68] = o.shallowR ?? 0.12;
    globalUniformData[69] = o.shallowG ?? 0.75;
    globalUniformData[70] = o.shallowB ?? 0.78;
    globalUniformData[71] = o.clarity ?? 0.4;
    globalUniformData[72] = o.deepR ?? 0.06;
    globalUniformData[73] = o.deepG ?? 0.25;
    globalUniformData[74] = o.deepB ?? 0.55;
    globalUniformData[75] = o.specularPower ?? 128.0;
    globalUniformData[76] = o.foamStart ?? -0.5;
    globalUniformData[77] = o.waveNormalStr ?? 0.7;
    globalUniformData[78] = 0.0;
    globalUniformData[79] = 0.0;

    device.queue.writeBuffer(globalUniformBuffer, 0, globalUniformData);
  }

  /**
   * Render all active terrain chunks
   * @param {GPUCommandEncoder} encoder - Command encoder
   * @param {GPUTextureView} colorView - Color attachment view
   * @param {GPUTextureView} depthView - (Optional) Depth attachment view
   * @param {number[]} absoluteCameraPos - Absolute camera position for HUD distance calculation
   */
  const render = (encoder, colorView, depthView = null, cloudOpacities = null, avatarSphere = null, sunDir = [0, 1, 0], entities = [], absoluteCameraPos = null) => {
    if (!isInitialized || !pipeline) return;

    // Get all generated meshes
    const allMeshesRaw = pool.getActiveMeshes().filter(m => m.isGenerated);
    _lastTotalCount = allMeshesRaw.length; // Track total before culling
    
    // FLOATING ORIGIN: Get offset for coordinate conversion
    const earthOffset = frustumCuller.earthCenterOffset || [0, 0, 0];
    
    // 1. Populate instance storage buffer with ALL generated meshes
    // The GPU culling pass will determine which of these are visible
    if (allMeshesRaw.length > 0) {
      const floatsPerInstance = BYTES_PER_INSTANCE / 4;
      let maxSlot = 0;
      for (let i = 0; i < allMeshesRaw.length; i++) {
        const mesh = allMeshesRaw[i];
        const slotIdx = mesh.poolIndex;
        if (slotIdx > maxSlot) maxSlot = slotIdx;
        const offset = slotIdx * floatsPerInstance;

        instanceStagingData[offset + 0] = 0.0; // Overwritten by GPU Cull compute shader (morphFactor)
        instanceStagingData[offset + 1] = mesh.lodLevel || 0.0;
        instanceStagingData[offset + 2] = fogIntensity || 0.0; // Fog Atmosphere Slider
        instanceStagingData[offset + 3] = mesh.checkerIndex || 0.0; // quad visual index (0 or 1)

        // PRECISION FIX: Convert meshCenter to camera-relative coords in CPU (float64)
        instanceStagingData[offset + 4] = mesh.meshCenter[0] + earthOffset[0];
        instanceStagingData[offset + 5] = mesh.meshCenter[1] + earthOffset[1];
        instanceStagingData[offset + 6] = mesh.meshCenter[2] + earthOffset[2];
        instanceStagingData[offset + 7] = mesh.quadSize || 0.0;

        // quadParams (xyz) + checkerIndex (w)
        instanceStagingData[offset + 8] = mesh.quadX || 0.0;
        instanceStagingData[offset + 9] = mesh.quadY || 0.0;
        instanceStagingData[offset + 10] = mesh.faceIndex;
        instanceStagingData[offset + 11] = 0.0; // Reserved

        // chunkNormal (xyz) + midLen (w) - Required for high-precision Floating Origin in VS
        const cNormLen = Math.sqrt(mesh.meshCenter[0]**2 + mesh.meshCenter[1]**2 + mesh.meshCenter[2]**2);
        instanceStagingData[offset + 12] = mesh.meshCenter[0] / cNormLen;
        instanceStagingData[offset + 13] = mesh.meshCenter[1] / cNormLen;
        instanceStagingData[offset + 14] = mesh.meshCenter[2] / cNormLen;
        instanceStagingData[offset + 15] = mesh.midLen || 1.0;
      }
      // Sparse upload: only transfer up to the highest used slot (not all 4096)
      const uploadBytes = (maxSlot + 1) * BYTES_PER_INSTANCE;
      device.queue.writeBuffer(instanceStorageBuffer, 0, instanceStagingData.buffer, 0, uploadBytes);
    }

    // 2. Schedule GPU Culling
    const cameraData = {
      cameraPos: [
        -frustumCuller.earthCenterOffset[0],
        -frustumCuller.earthCenterOffset[1],
        -frustumCuller.earthCenterOffset[2]
      ],
      cameraForward: _cameraForward || [0, 0, 1],
      earthCenterOffset: frustumCuller.earthCenterOffset,
      horizonCullingEnabled: frustumCuller.horizonCullingEnabled,
      indexCount: unitGridIndexCount
    };
    gpuCullingSystem.dispatch(encoder, allMeshesRaw, cameraData);

    // Rock compute scatter
    if (rockSystem && _rockCount > 0) {
      rockSystem.dispatchCompute(encoder);
    }
    // Palm compute scatter
    if (palmSystem && _palmCount > 0) {
      palmSystem.dispatchCompute(encoder);
    }
    // Tree compute scatter
    if (treeSystem && _treeCount > 0) {
      treeSystem.dispatchCompute(encoder);
    }
    // Plant compute scatter (flowers)
    if (plantSystem && _plantCount > 0) {
      plantSystem.dispatchCompute(encoder);
    }

    // Refresh the avatar instance buffer up-front so the shadow pass and the
    // main pass draw the same set of avatars within this frame.
    avatarInstanceCount = _updateAvatarInstances(avatarSphere, absoluteCameraPos);

    // Snap NPC avatars onto the terrain surface using the GPU getTerrainHeight
    // (the CPU noise port is not accurate enough — see GPU_PHYSICS_GRID.md).
    if (avatarInstanceCount > 1 && characterSystem?.avatarLoaded && terrainParamsBuffer) {
      if (!avatarGroundPipeline) {
        avatarGroundPipeline = device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: device.createShaderModule({ code: avatarGroundComputeShader, label: 'Avatar Ground Compute' }),
            entryPoint: 'main',
          },
          label: 'Avatar Ground Pipeline',
        });
        avatarGroundParamsBuffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          label: 'Avatar Ground Params',
        });
        avatarFootOffsetBuffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.STORAGE,
          label: 'Avatar Foot Offset',
        });
        avatarGroundBindGroup = device.createBindGroup({
          layout: avatarGroundPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: avatarInstanceBuffer } },
            { binding: 1, resource: { buffer: terrainParamsBuffer } },
            { binding: 2, resource: { buffer: avatarGroundParamsBuffer } },
            { binding: 3, resource: { buffer: avatarFootOffsetBuffer } },
          ],
        });
      }
      avatarGroundParamsData[0] = cachedEarthCenter[0];
      avatarGroundParamsData[1] = cachedEarthCenter[1];
      avatarGroundParamsData[2] = cachedEarthCenter[2];
      avatarGroundParamsData[3] = _npcInstanceEnd; // snap player+NPCs only, not remotes
      device.queue.writeBuffer(avatarGroundParamsBuffer, 0, avatarGroundParamsData);
      const groundPass = encoder.beginComputePass({ label: 'Avatar Ground Pass' });
      groundPass.setPipeline(avatarGroundPipeline);
      groundPass.setBindGroup(0, avatarGroundBindGroup);
      groundPass.dispatchWorkgroups(1);
      groundPass.end();
    }

    // 0. Shadow Pass (skipped in map mode and above 50km altitude for performance)
    const avatarPosRel = [globalUniformData[36], globalUniformData[37], globalUniformData[38]];
    if (_shadowsEnabled && _cameraAGL < 50000) {
      shadowSystem.updateMatrices(_shadowLightDir, avatarPosRel, globalUniformData);

      const maxCascadeRadius = SHADOW_CONFIG.CASCADES[SHADOW_CONFIG.CASCADE_COUNT - 1].radius;
      const shadowMeshesWithInfo = [];
      for (const mesh of allMeshesRaw) {
        if (!mesh.meshCenter) continue;
        const dx = mesh.meshCenter[0] + globalUniformData[24] - avatarPosRel[0];
        const dy = mesh.meshCenter[1] + globalUniformData[25] - avatarPosRel[1];
        const dz = mesh.meshCenter[2] + globalUniformData[26] - avatarPosRel[2];
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < (maxCascadeRadius + mesh.boundingSphere.radius)) {
          shadowMeshesWithInfo.push({ mesh, slotIdx: mesh.poolIndex });
        }
      }
      // Cap shadow entities to limit draw calls (4 cascades × N entities each frame)
      if (shadowMeshesWithInfo.length > 128) {
        shadowMeshesWithInfo.length = 128;
      }

      const shadowContext = {
        characterSystem, megaVertexBuffer, instanceStorageBuffer,
        unitGridIndexBuffer, unitGridIndexCount, globalUniformBuffer,
        characterUniformBuffer, characterVisibility,
        avatarInstanceBuffer, avatarInstanceCount,
        avatarPos: avatarPosRel, globalUniformData,
        rockSystem, rockCount: _rockCount,
        palmSystem, palmCount: _palmCount,
        treeSystem, treeCount: _treeCount,
      };
      shadowSystem.render(encoder, shadowMeshesWithInfo, shadowContext);
    }


    // 2. Main Render Pass
    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorView,
        loadOp: 'load',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: depthView || depthTextureView,
        depthClearValue: 0.0, // Reverse-Z clears to 0.0
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });
    // FLOATING ORIGIN: Draw terrain chunks with individual draws for ALL LODs
    // Each mesh uses its own CPU-precomputed vertex buffer (float64 precision)
    if (allMeshesRaw.length > 0) {
      passEncoder.setPipeline(wireframe ? wireframePipeline : pipeline);
      passEncoder.setBindGroup(0, uniformBindGroup);
      
      // SINGLE DRAW CALL (Instanced / Vertex Pulling)
      passEncoder.setBindGroup(0, uniformBindGroup);
      
      // We draw as many instances as we have meshes, but the shader will pull from the storage buffer
      // using instanceData to get the correct slot and visibility.
      if (gpuCullingEnabled && gpuCullingSystem.indirectBuffer) {
        passEncoder.setIndexBuffer(unitGridIndexBuffer, 'uint32');
        passEncoder.drawIndexedIndirect(gpuCullingSystem.indirectBuffer, 0);
      }
    }

    // Draw parcel overlay (terrain mesh reuse — same vertices, different fragment shader)
    if (parcelOverlay?.active && parcelOverlay.parcelCount > 0 && gpuCullingSystem.indirectBuffer) {
      passEncoder.setPipeline(parcelOverlay.pipeline);
      passEncoder.setBindGroup(0, uniformBindGroup);
      passEncoder.setBindGroup(1, parcelOverlay.parcelBindGroup);
      passEncoder.setIndexBuffer(unitGridIndexBuffer, 'uint32');
      passEncoder.drawIndexedIndirect(gpuCullingSystem.indirectBuffer, 0);
    }

    // Draw avatars — GPU instanced: local player + NPCs in a single draw call
    if (characterSystem?.avatarLoaded) {
      _updateCharacterBindGroup(); // Create bind group once avatar loads
    }

    if (characterBindGroup && characterSystem?.avatarLoaded && avatarPipeline) {
      _updateCharacterUniforms();
      if (avatarInstanceCount > 0) {
        passEncoder.setPipeline(avatarPipeline);
        passEncoder.setBindGroup(0, characterBindGroup);

        const npcList = npcSystem?.npcs;
        const hasVoxelEntities = AVATAR_CONFIG.voxel && (((npcList?.length) || 0) > 0 || _remoteDrawCount > 0);
        if (hasVoxelEntities) {
          // Voxel mode: local player from the shared mesh; each NPC + remote player
          // from its OWN mesh. firstInstance selects that avatar's instance data
          // (position + bone slot).
          passEncoder.setVertexBuffer(0, characterSystem.avatarVB);
          passEncoder.setIndexBuffer(characterSystem.avatarIB, 'uint32');
          passEncoder.drawIndexed(characterSystem.avatarIndexCount, 1, 0, 0, 0);
          if (npcList) {
            for (let i = 0; i < npcList.length && i + 1 < avatarInstanceCount; i++) {
              if (npcList[i]._fade <= 0.001) continue;   // distance LOD: cull NPCs faded out past the grid
              const m = npcList[i]._mesh;
              if (!m) continue;
              passEncoder.setVertexBuffer(0, m.vb);
              passEncoder.setIndexBuffer(m.ib, 'uint32');
              passEncoder.drawIndexed(m.count, 1, 0, 0, i + 1);
            }
          }
          for (let r = 0; r < _remoteDrawCount; r++) {
            const rd = _remoteDraw[r];
            passEncoder.setVertexBuffer(0, rd.mesh.vb);
            passEncoder.setIndexBuffer(rd.mesh.ib, 'uint32');
            passEncoder.drawIndexed(rd.mesh.count, 1, 0, 0, rd.instance);
          }
        } else {
          // GLB mode (or voxel with no other entities): single instanced draw.
          passEncoder.setVertexBuffer(0, characterSystem.avatarVB);
          passEncoder.setIndexBuffer(characterSystem.avatarIB, 'uint32');
          passEncoder.drawIndexed(characterSystem.avatarIndexCount, avatarInstanceCount);
        }
      }
    }

    // Draw Vehicle — only when the player is actually occupying it.
    // The renderer instance is kept loaded (so re-entry is instant), but
    // we skip the draw call + fragment work when the ship is parked.
    
    // Scatter meshes — rocks → palms → trees → plants. Order matters for
    // depth/occlusion: heavier props first, ground-cover last.
    if (rockSystem && _rockCount > 0) {
      rockSystem.render(passEncoder, _rockCount);
    }
    if (palmSystem && _palmCount > 0) {
      palmSystem.render(passEncoder, _palmCount);
    }
    if (treeSystem && _treeCount > 0) {
      treeSystem.render(passEncoder, _treeCount);
    }
    if (plantSystem && _plantCount > 0) {
      plantSystem.render(passEncoder, _plantCount);
    }

    // 4. Render HUD & Nameplates
    // Hide the HUD while an in-world panel is open or in parcel-map mode.
    if (entities.length > 0 && absoluteCameraPos && !(htmlPanelSystem && htmlPanelSystem.hasActivePanel()) && !parcelOverlay?.active) {
      // Use absolute camera position for distance calculations
      // earthCenter for HUD needs to be ABSOLUTE (not relative)
      const absoluteEarthCenter = [
        cachedEarthCenter[0] + (absoluteCameraPos[0] || 0),
        cachedEarthCenter[1] + (absoluteCameraPos[1] || 0),
        cachedEarthCenter[2] + (absoluteCameraPos[2] || 0)
      ];
      
      // Use only the new integrated Nameplate system (includes name, bars, trophies)
      // Old procedural HUD disabled - all features now in NameplateSystem
      if (nameplateSystem) {
        // Append the NpcSystem NPCs as nameplate entities (camera-relative
        // centre → absolute). The local player is already present in `entities`.
        const allEntities = entities.slice();
        const npcs = npcSystem ? npcSystem.npcs : [];
        for (let i = 0; i < npcs.length; i++) {
          const npc = npcs[i];
          allEntities.push({
            x: npc.center[0] + absoluteCameraPos[0],
            y: npc.center[1] + absoluteCameraPos[1],
            z: npc.center[2] + absoluteCameraPos[2],
            name: `NPC ${i + 1}`,
            state: npc.state,
          });
        }
        const nameplateVisible = nameplateSystem.update(allEntities, absoluteCameraPos, absoluteEarthCenter);
        nameplateSystem.render(passEncoder, nameplateVisible);
      }
    }

    // In-world HTML-in-Canvas control panels (billboards fixed beside the player)
    if (htmlPanelSystem) {
      htmlPanelSystem.update(avatarSphere, cachedEarthCenter, globalUniformData.subarray(0, 16), _cameraUp, _cameraForward);
      htmlPanelSystem.render(passEncoder);
    }

    // Render avatar position marker (glowing cyan dot)
    if (avatarMarkerSystem && _avatarMarkerVisible > 0) {
      avatarMarkerSystem.render(passEncoder, _avatarMarkerVisible);
    }

    // Render parcel labels (instanced billboards for filtered parcels)
    if (parcelLabelSystem && _parcelLabelCount > 0) {
      parcelLabelSystem.render(passEncoder, _parcelLabelCount);
    }

    // Render parcel tooltip billboard
    if (parcelTooltipSystem) {
      parcelTooltipSystem.render(passEncoder, _parcelTooltipVisible);
    }

    passEncoder.end();

    // Async readback of instance count for stats
    gpuCullingSystem.scheduleReadback(encoder);
    _lastRenderedCount = gpuCullingSystem.lastRenderedCount;
  }


  /**
   * Create a render pass for terrain (alternative method)
   * @param {GPUCommandEncoder} encoder - Command encoder
   * @param {GPURenderPassDescriptor} passDesc - Render pass descriptor
   * @returns {GPURenderPassEncoder}
   */
  const beginRenderPass = (encoder, passDesc) => {
    return encoder.beginRenderPass(passDesc);
  }


  /**
   * Handle canvas resize
   * @param {number} width - New width
   * @param {number} height - New height
   */
  const resize = (width, height) => {
    if (width > 0 && height > 0) {
      _createDepthTexture(width, height);
      parcelTooltipSystem?.resize(width, height);
      parcelLabelSystem?.resize(width, height);
      avatarMarkerSystem?.resize(width, height);
    }
  }

  /**
   * Set debug visualization mode
   * @param {number} mode - 0=normal, 1=normals, 2=elevation, 3=LOD
   */
  const setDebugMode = (mode) => {
    debugMode = mode;
  }

  /**
   * Set debug flags (bitmask)
   * @param {number} flags - bit 0=quads, bit 1=subquads, bit 2=skirts
   */
  const setDebugFlags = (flags) => {
    debugFlags = flags;
  }

  /**
   * Toggle wireframe mode
   * @param {boolean} enabled 
   */
  const setWireframe = (enabled) => {
    wireframe = enabled;
  }


  /**
   * Get planet rendering statistics
   */
  const getStats = () => {
    return {
      ..._stats,
       culledQuads: quadtree.stats.culledQuads || 0,
      culling: {
        total: _lastTotalCount || 0,
        rendered: _lastRenderedCount || 0
      }
    };
  }

  /**
   * Get depth texture view for other passes
   * @returns {GPUTextureView}
   */
  const getDepthTextureView = () => {
    return depthTextureView;
  }

  // ============================================================================
  // GPU PHYSICS COMPUTE PIPELINES (Treadmill Bake)
  // ============================================================================

  /**
   * Create compute pipelines for GPU physics calculations (terrain height grid)
   */
  const _createPhysicsComputePipelines = async () => {
    const gridComputeModule = device.createShaderModule({
      code: terrainHeightGridComputeShader,
      label: 'Terrain Height Grid Compute Shader'
    });
    
    // Create input buffer (avatarNormal + distToCenter + right + forward = 48 bytes)
    gridInputBuffer = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Grid Input Buffer'
    });

    // Create output buffer for physics grid
    gridOutputBuffer = device.createBuffer({
      size: PHYSICS_GRID_CONFIG.TOTAL_BUFFER_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'Grid Output Buffer'
    });
    
    // Create readback buffer
    gridReadbackBuffer = device.createBuffer({
      size: PHYSICS_GRID_CONFIG.TOTAL_BUFFER_SIZE,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'Grid Readback Buffer'
    });
    
    const gridComputeBindGroupLayout = device.createBindGroupLayout({
      label: 'Grid Compute Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, 
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ]
    });
    
    gridComputePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [gridComputeBindGroupLayout] }),
      compute: { module: gridComputeModule, entryPoint: 'main' },
      label: 'Terrain Grid Compute Pipeline'
    });
    
    gridComputeBindGroup = device.createBindGroup({
      layout: gridComputeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gridInputBuffer } },
        { binding: 1, resource: { buffer: gridOutputBuffer } },
        { binding: 2, resource: { buffer: terrainParamsBuffer } },
      ],
      label: 'Grid Compute Bind Group'
    });
  }


  // ============================================================================
  // GPU TERRAIN PHYSICS SYSTEM
  // ============================================================================

  /**
   * Query terrain height grid around a world position using GPU compute
   * Calculates 5x5 grid of heights for precise physics interpolation
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate  
   * @param {number} z - World Z coordinate
   * @returns {Promise<{heights: Float32Array}>}
   */
  const getTerrainHeightGrid = async (x, y, z) => {
    if (!gridComputePipeline) {
      // Return empty/zero height grid if not initialized yet to avoid crashing physics
      return { heights: new Float32Array(PHYSICS_GRID_CONFIG.GRID_POINTS) };
    }

    // FLOATING ORIGIN FIX: Pre-compute avatar sphere normal on CPU with float64 precision
    const dx = x - EARTH_CENTER[0];
    const dy = y - EARTH_CENTER[1];
    const dz = z - EARTH_CENTER[2];
    const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const avatarNormal = [dx / distToCenter, dy / distToCenter, dz / distToCenter];
    
    // Build local coordinate system at avatar (same as shader but with float64)
    let refVec = [0, 0, 1];
    if (Math.abs(avatarNormal[0] * refVec[0] + avatarNormal[1] * refVec[1] + avatarNormal[2] * refVec[2]) > 0.9) {
      refVec = [1, 0, 0];
    }
    // cross(avatarNormal, refVec)
    const right = [
      avatarNormal[1] * refVec[2] - avatarNormal[2] * refVec[1],
      avatarNormal[2] * refVec[0] - avatarNormal[0] * refVec[2],
      avatarNormal[0] * refVec[1] - avatarNormal[1] * refVec[0]
    ];
    const rLen = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2);
    right[0] /= rLen; right[1] /= rLen; right[2] /= rLen;
    // cross(right, avatarNormal)
    const forward = [
      right[1] * avatarNormal[2] - right[2] * avatarNormal[1],
      right[2] * avatarNormal[0] - right[0] * avatarNormal[2],
      right[0] * avatarNormal[1] - right[1] * avatarNormal[0]
    ];
    
    // Write input using pre-allocated buffer (no GC pressure)
    gridInputData[0] = avatarNormal[0];
    gridInputData[1] = avatarNormal[1];
    gridInputData[2] = avatarNormal[2];
    gridInputData[3] = distToCenter;
    gridInputData[4] = right[0];
    gridInputData[5] = right[1];
    gridInputData[6] = right[2];
    gridInputData[7] = 0;
    gridInputData[8] = forward[0];
    gridInputData[9] = forward[1];
    gridInputData[10] = forward[2];
    gridInputData[11] = 0;
    device.queue.writeBuffer(gridInputBuffer, 0, gridInputData);


    // Dispatch compute shader
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(gridComputePipeline);
    passEncoder.setBindGroup(0, gridComputeBindGroup);
    const dispatchGroups = PHYSICS_GRID_CONFIG.DISPATCH_GROUPS;
    passEncoder.dispatchWorkgroups(dispatchGroups, dispatchGroups, 1);
    passEncoder.end();

    // Copy output to readback buffer
    commandEncoder.copyBufferToBuffer(
      gridOutputBuffer, 0,
      gridReadbackBuffer, 0,
      PHYSICS_GRID_CONFIG.TOTAL_BUFFER_SIZE
    );

    device.queue.submit([commandEncoder.finish()]);

    // Map and read result
    await gridReadbackBuffer.mapAsync(GPUMapMode.READ);
    const resultMap = gridReadbackBuffer.getMappedRange();
    
    // Allocate heights buffer once on first call, then reuse
    const heightsBytes = PHYSICS_GRID_CONFIG.HEIGHTS_BUFFER_SIZE;
    if (!gridHeightsBuffer || gridHeightsBuffer.byteLength !== heightsBytes) {
      gridHeightsBuffer = new Float32Array(heightsBytes / 4);
    }
    gridHeightsBuffer.set(new Float32Array(resultMap.slice(0, heightsBytes)));
    
    gridReadbackBuffer.unmap();

    return { heights: gridHeightsBuffer, basis: { up: avatarNormal, right, forward } };
  }



  /**
   * Clean up all resources
   */
  const destroy = () => {
    if (pool) {
      pool.destroy();
      pool = null;
    }
    
    if (builder) {
      builder.clear();
      builder = null;
    }
    
    if (globalUniformBuffer) {
      globalUniformBuffer.destroy();
      globalUniformBuffer = null;
    }
    
    if (depthTexture) {
      depthTexture.destroy();
      depthTexture = null;
    }

    if (gridInputBuffer) {
      gridInputBuffer.destroy();
      gridInputBuffer = null;
    }
    if (gridOutputBuffer) {
      gridOutputBuffer.destroy();
      gridOutputBuffer = null;
    }
    if (gridReadbackBuffer) {
      gridReadbackBuffer.destroy();
      gridReadbackBuffer = null;
    }
    gridComputePipeline = null;
    gridComputeBindGroup = null;
    
    pipeline = null;
    uniformBindGroup = null;
    isInitialized = false;
    
  }
  /**
   * Helper to create a fallback solid-color texture with mipmaps
   */
  const _createFallbackTexture = (color, width, height, mipLevelCount) => {
    const texture = device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
      mipLevelCount: mipLevelCount,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    
    // Fill first level
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = color[0]; data[i+1] = color[1]; data[i+2] = color[2]; data[i+3] = color[3];
    }
    device.queue.writeTexture({ texture }, data, { bytesPerRow: width * 4 }, [width, height]);
    
    // Generate mipmaps
    _generateMipmaps(texture);
    return texture;
  }


  /**
   * Create a static unit grid vertex buffer for instanced rendering

  /**
   * Create a static unit grid vertex buffer for instanced rendering
   * Range: [0, 1] across resolution (default 25x25)
   */
  const _createUnitGridBuffer = () => {
    const res = MESH_RESOLUTION; // Use constant
    const vertexCount = res * res;
    // position(3) + normal(3) + sphereNormal(3) + uv(2) = 11 floats
    const data = new Float32Array(vertexCount * 11);
    let idx = 0;
    const stride = 11;
    
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const u = x / (res - 1);
        const v = y / (res - 1);
        
        // Horizontal plane grid in [0, 1]
        data[idx] = u;
        data[idx + 1] = v;
        data[idx + 2] = 0; 
        
        // Normal (up)
        data[idx + 3] = 0;
        data[idx + 4] = 0;
        data[idx + 5] = 1;

        // SphereNormal (will be used by shader to project/noise)
        // Default to Z-up for the unit grid, but the shader will re-project 
        // based on instance data. However, for sanity, let's put something.
        data[idx + 6] = u * 2 - 1;
        data[idx + 7] = v * 2 - 1;
        data[idx + 8] = 1.0; 
        
        // UV
        data[idx + 9] = u;
        data[idx + 10] = v;

        idx += stride;
      }
    }
    
    unitGridBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'Static Unit Grid Vertex Buffer'
    });
    device.queue.writeBuffer(unitGridBuffer, 0, data);

    // Create shared index buffer for all resolution-consistent instances
    const indexCount = (res - 1) * (res - 1) * 6;
    const indices = new Uint32Array(indexCount);
    let iidx = 0;
    for (let y = 0; y < res - 1; y++) {
      for (let x = 0; x < res - 1; x++) {
        const topLeft = y * res + x;
        const topRight = topLeft + 1;
        const bottomLeft = (y + 1) * res + x;
        const bottomRight = bottomLeft + 1;
        indices[iidx++] = topLeft;
        indices[iidx++] = bottomLeft;
        indices[iidx++] = topRight;
        indices[iidx++] = topRight;
        indices[iidx++] = bottomLeft;
        indices[iidx++] = bottomRight;
      }
    }
    unitGridIndexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      label: 'Terrain Unit Grid Index Buffer'
    });
    device.queue.writeBuffer(unitGridIndexBuffer, 0, indices);
    unitGridIndexCount = indexCount;
  };

  // === PUBLIC API ===
  return {
    // Initialization
    init,
    get isInitialized() { return isInitialized; },
    
    // Core rendering
    render,
    update,
    resize,
    
    // Uniforms
    updateUniforms,
    updateTerrainParams,
    
    // Character system
    updateCharacter,
    get characterSystem() { return characterSystem; },
    get characterVisibility() { return characterVisibility; },
    set characterVisibility(v) { characterVisibility = v; },
    
    // Vehicle
    
    // Debug
    setDebugMode,
    setDebugFlags,
    setWireframe,
    getStats,
    /** Skip all scatter systems (rocks, palms, trees, plants) for FPS measurement */
    setScatterBypassed(bypassed) { _scatterBypassed = !!bypassed; },
    /** Set per-pass bypass bits (see uiConfig.BYPASS_FLAGS). Encoded into earthCenter.w. */
    setBypassFlags(flags) { _bypassFlags = (flags | 0) & 0x7; },
    /** Feed the camera up + forward axes so in-world panels centre on screen. */
    setCameraBasis(up, forward) {
      if (up && up.length === 3) _cameraUp = up;
      if (forward && forward.length === 3) _cameraForward = forward;
    },
    get bypassFlags() { return _bypassFlags; },
    
    // Utilities
    getDepthTextureView,
    getTerrainHeightGrid,
    /** Inject the lazily-loaded NpcSystem (wandering NPC simulation). */
    setNpcSystem(system) { npcSystem = system; },
    setPresenceSystem(system) { presenceSystem = system; },
    /** Toggle an in-world HTML-in-Canvas control panel, lazily creating the system. */
    async togglePanel(element, mode) {
      const sys = await ensureHtmlPanelSystem();
      if (sys) sys.toggle(element, mode);
    },
    /** True while any in-world HTML-in-Canvas panel is open (drives camera zoom). */
    get hasActivePanel() {
      return !!(htmlPanelSystem && htmlPanelSystem.hasActivePanel());
    },
    beginRenderPass,
    destroy,
    
    // Grid access
    get gridOutputBuffer() { return gridOutputBuffer; },
    get gridCenterPos() { return gridInputData.subarray(0, 4); }, // avatarNormal(3) + distToCenter(1)
    get gridBasis() { return gridInputData.subarray(4, 12); }, // right(3) + 0 + forward(3) + 0
    get gridExists() { return !!gridOutputBuffer; },
    
    // Internal access for sub-systems
    get frustumCuller() { return frustumCuller; },
    get builder() { return builder; },
    get pool() { return pool; },
    get quadtree() { return quadtree; },
    get shadowSystem() { return shadowSystem; },
    setShadowsEnabled(enabled) { _shadowsEnabled = enabled; },

    // Parcel overlay
    get parcelOverlay() { return parcelOverlay; },
    setParcelMode(enabled) { parcelOverlay?.setActive(enabled); },
    updateParcelData(data) { parcelOverlay?.updateData(data); },
    updateParcelUniforms(params) { parcelOverlay?.updateUniforms(params); },

    // Parcel tooltip billboard
    updateParcelTooltip(parcel, worldPos, camPos, earthCenter) {
      _parcelTooltipVisible = parcelTooltipSystem?.update(parcel, worldPos, camPos, earthCenter) ?? 0;
    },
    selectParcelTooltip(parcel, worldPos, camPos, earthCenter, previewBaker) {
      _parcelTooltipVisible = parcelTooltipSystem?.select(parcel, worldPos, camPos, earthCenter, previewBaker) ?? 0;
    },
    tooltipHitTest(screenX, screenY, canvasEl, viewProjection) {
      return parcelTooltipSystem?.hitTest(screenX, screenY, canvasEl, viewProjection) ?? null;
    },
    setTooltipConfirmState(state, parcel) {
      parcelTooltipSystem?.setConfirmState(state, parcel);
    },
    get tooltipMode() { return parcelTooltipSystem?.mode ?? 'hover'; },
    get tooltipConfirmState() { return parcelTooltipSystem?.confirmState ?? null; },
    hideParcelTooltip() {
      _parcelTooltipVisible = 0;
      parcelTooltipSystem?.hide();
    },

    // Parcel labels (instanced billboards for filtered parcels)
    updateParcelLabels(parcels, camPos, earthCenter, parcelToWorldFn) {
      _parcelLabelCount = parcelLabelSystem?.update(parcels, camPos, earthCenter, parcelToWorldFn) ?? 0;
    },
    hideParcelLabels() {
      _parcelLabelCount = 0;
      parcelLabelSystem?.hide();
    },

    // Map-mode markers — glowing dots for the local player (cyan), the NPC
    // roster (yellow) and remote P2P players (orange). Positions are taken in
    // camera-relative space: NPC centres are already camera-relative; the player
    // and remotes are absolute, so they are offset by the camera here.
    updateAvatarMarker(worldPos, camPos) {
      if (!avatarMarkerSystem || !worldPos || !camPos) { _avatarMarkerVisible = 0; return; }
      _markerList.length = 0;
      _markerList.push({
        x: worldPos[0] - camPos[0], y: worldPos[1] - camPos[1], z: worldPos[2] - camPos[2],
        r: MARKER_COLOR_PLAYER[0], g: MARKER_COLOR_PLAYER[1], b: MARKER_COLOR_PLAYER[2],
      });
      if (npcSystem) {
        for (const npc of npcSystem.npcs) {
          _markerList.push({
            x: npc.center[0], y: npc.center[1], z: npc.center[2],
            r: MARKER_COLOR_NPC[0], g: MARKER_COLOR_NPC[1], b: MARKER_COLOR_NPC[2],
          });
        }
      }
      if (presenceSystem) {
        for (const pl of presenceSystem.getRemotePlayers()) {
          _markerList.push({
            x: pl.x - camPos[0], y: pl.y - camPos[1], z: pl.z - camPos[2],
            r: MARKER_COLOR_REMOTE[0], g: MARKER_COLOR_REMOTE[1], b: MARKER_COLOR_REMOTE[2],
          });
        }
      }
      _avatarMarkerVisible = avatarMarkerSystem.update(_markerList);
    },
    hideAvatarMarker() {
      _avatarMarkerVisible = 0;
      avatarMarkerSystem?.hide();
    },

    get palmCount() { return _palmCount; },
    hidePalms() { _palmCount = 0; palmSystem?.hide(); },

    get treeCount() { return _treeCount; },
    hideTrees() { _treeCount = 0; treeSystem?.hide(); },

    get plantCount() { return _plantCount; },
    hidePlants() { _plantCount = 0; plantSystem?.hide(); },

    /**
     * Compute tree collision cylinders near the avatar.
     * Call after update() and before physics.
     * @param {Function} getHeightAt - PhysicsSystem.getHeightAt (x,y,z) => heightKm|null
     * @returns {Array} Collision cylinders
     */
    updateTreeCollision(getHeightAt) {
      if (!treeSystem || !_treeCount || !getHeightAt) return [];
      return treeSystem.getNearbyCylinders(_planetCenteredCameraPos, getHeightAt);
    },
  };
};


/**
 * Factory function for creating a PlanetRenderer instance.
 * @param {GPUDevice} device - WebGPU device
 * @param {GPUTextureFormat} format - Canvas texture format
 * @returns {Object} PlanetRenderer instance
 */
export const createPlanetRenderer = (device, format) => {
  return createPlanetRendererInternal(device, format);
};
