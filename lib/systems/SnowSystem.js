/**
 * SnowSystem.js - Snow Particle System (Aligned with Rain Implementation)
 */

import { snowShader } from '../shaders/snow.wgsl.js';
import { SNOW_CONFIG, AUDIO_CONFIG, PHYSICS_GRID_CONFIG } from '../config/index.js';

/**
 * Creates the snow particle system
 * @param {GPUDevice} device - WebGPU device
 * @param {string} format - Swapchain format
 * @returns {Object} Snow system instance
 */
export const createSnowSystem = (device, format) => {
  // --- STATE ---
  let pipeline = null;
  let bindGroup = null;
  let uniformBuffer = null;
  let currentParticleCount = SNOW_CONFIG.particleCount;
  // Audio — single looped cold-wind track, volume scales with snow intensity.
  let snowAudio = null;

  /**
   * Initializes the snow system
   * @param {GPUBuffer} atmosphereUniformBuffer - Global atmosphere uniforms
   */
  const init = async (atmosphereUniformBuffer) => {
    // 1. Shader module
    const snowModule = device.createShaderModule({
      code: snowShader,
      label: 'Snow Particle Shader'
    });

    // 2. Uniform Buffer (144 bytes = 36 floats, with intensity and alignment padding)
    // numParticles, speed, spawnRadius, spawnHeight, color(3), opacity, 
    // intensity, pad, pad, pad, gridCenter(4), gridRight(4), gridForward(4), gridUp(4), cameraPos(4), pad(4)
    uniformBuffer = device.createBuffer({
      size: 144,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Snow Uniform Buffer'
    });

    // 3. Bind Group Layout (3 bindings like rain)
    const snowBindGroupLayout = device.createBindGroupLayout({
      label: 'Snow Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // Grid Buffer
      ],
    });

    // 4. Pipeline
    pipeline = device.createRenderPipeline({
      label: 'Snow Particle Pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [snowBindGroupLayout] }),
      vertex: { module: snowModule, entryPoint: 'vs_main' },
      fragment: {
        module: snowModule,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
    });

    // 5. Bind Group (initial with dummy grid)
    const dummyGrid = device.createBuffer({ 
      size: PHYSICS_GRID_CONFIG.TOTAL_BUFFER_SIZE, 
      usage: GPUBufferUsage.STORAGE 
    });
    
    bindGroup = device.createBindGroup({
      label: 'Snow Bind Group',
      layout: snowBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: uniformBuffer } },
        { binding: 2, resource: { buffer: dummyGrid } },
      ],
    });

    // Cold-wind ambient loop. update() raises the volume proportional to
    // snowIntensity and pauses below 0.1 (same threshold rain uses).
    snowAudio = new Audio(AUDIO_CONFIG.sounds.snow);
    snowAudio.loop = true;
    snowAudio.volume = 0;

    console.log('[SnowSystem] Initialized');
  };

  /**
   * Updates the grid buffer used for terrain height sampling
   * @param {GPUBuffer} buffer - Grid output buffer from PlanetRenderer
   * @param {GPUBuffer} atmosphereUniformBuffer - Global atmosphere uniforms
   */
  const setGridBuffer = (buffer, atmosphereUniformBuffer) => {
    if (!pipeline) return;

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: uniformBuffer } },
        { binding: 2, resource: { buffer: buffer } },
      ],
    });
    
    console.log('[SnowSystem] Grid buffer linked');
  };

  /**
   * Updates snow particles
   * @param {number} time - Current time
   * @param {number} altitudeScale - Scale based on altitude
   * @param {number} intensity - Snow intensity (0.0 to 1.0)
   * @param {Object} gridData - Grid positioning data (view-space vectors)
   */
  const update = (time, altitudeScale, intensity, gridData = null) => {
    if (!uniformBuffer) return;

    // Audio — cold-wind ambient. Volume scales linearly with intensity * 0.4
    // (slightly quieter than rain since wind is more constant and easier to
    // notice). Paused below 0.1 to match the shader's particle-visibility
    // cutoff so the wind stops when the last flake disappears.
    if (snowAudio) {
      if (intensity > 0.1) {
        if (snowAudio.paused) snowAudio.play().catch(() => {});
        snowAudio.volume = Math.min(1.0, intensity * 0.4);
      } else if (!snowAudio.paused) {
        snowAudio.pause();
      }
    }

    // Struct layout (36 floats = 144 bytes):
    // 0-3: numParticles, speed, spawnRadius, spawnHeight
    // 4-7: color.rgb, opacity
    // 8-11: intensity, pad, pad, pad
    // 12-15: gridCenter
    // 16-19: gridRight
    // 20-23: gridForward
    // 24-27: gridUp
    // 28-31: cameraPos
    // 32-35: padding
    const snowData = new Float32Array(36);
    
    // Core params (8 floats: 0-7)
    snowData.set([
      currentParticleCount,
      SNOW_CONFIG.baseFallSpeed * altitudeScale,
      SNOW_CONFIG.baseSpawnRadius * altitudeScale,
      SNOW_CONFIG.baseSpawnHeight * altitudeScale,
      ...SNOW_CONFIG.color,
      SNOW_CONFIG.opacity
    ], 0);

    // Intensity and padding (4 floats: 8-11)
    snowData.set([intensity, 0, 0, 0], 8);

    // Grid data (View Space) - 16 floats (12-27)
    // If gridData is null, use default values that position particles near camera origin
    if (gridData) {
      snowData.set(gridData.centerView, 12);
      snowData.set(gridData.rightView, 16);
      snowData.set(gridData.forwardView, 20);
      snowData.set(gridData.upView, 24);
    } else {
      // Fallback: identity basis at origin for testing
      // gridCenter = [0, 0, -0.05, 0] (slightly in front of camera)
      // gridRight = [1, 0, 0, 0]
      // gridForward = [0, 0, 1, 0]
      // gridUp = [0, 1, 0, 0]
      snowData.set([0, 0, -0.05, 0], 12);  // gridCenter
      snowData.set([1, 0, 0, 0], 16);       // gridRight
      snowData.set([0, 0, 1, 0], 20);       // gridForward
      snowData.set([0, 1, 0, 0], 24);       // gridUp
    }
    
    // cameraPos slot (28-31): world-anchored tile-wrap offset in metres on the
    // tangent plane, accumulated from the AVATAR's motion (not the camera's,
    // which orbits) — see docs/rain-system.md. Shared with the rain shader.
    // The old `gridData.localCamOffset` field this consumed was structurally
    // zero (gridCenterWorld === cam.position), so snow used to be camera-
    // locked despite having the wrap math.
    if (gridData?.rainCamOffsetMeters) {
      snowData.set([gridData.rainCamOffsetMeters[0], gridData.rainCamOffsetMeters[1], 0, 0], 28);
    } else {
      snowData.set([0, 0, 0, 0], 28);
    }

    // Padding (32-35)
    snowData.set([0, 0, 0, 0], 32);

    device.queue.writeBuffer(uniformBuffer, 0, snowData);
  };

  /**
   * Renders snow particles
   * @param {GPURenderPassEncoder} passEncoder - Active render pass
   */
  const render = (passEncoder) => {
    if (pipeline && bindGroup) {
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, currentParticleCount); // 6 vertices per quad, N instances
    }
  };

  return {
    init,
    update,
    render,
    setGridBuffer
  };
};
