/**
 * RainSystem.js - Modular Rain and Lightning System
 */

import { rainShader, lightningShader } from '../shaders/rain.wgsl.js';
import { RAIN_CONFIG, AUDIO_CONFIG, PHYSICS_GRID_CONFIG, PLANET_RADIUS } from '../config/index.js';

/**
 * Creates the rain and lightning system
 * @param {GPUDevice} device - WebGPU device
 * @param {string} format - Swapchain format
 * @returns {Object} Rain system instance
 */
export const createRainSystem = (device, format) => {
  // --- STATE ---
  let rainPipeline = null;
  let rainBindGroup = null;
  let rainUniformBuffer = null;
  let currentParticleCount = RAIN_CONFIG.particleCount;
  
  let lightningPipeline = null;
  let lightningBindGroup = null;
  let lightningUniformBuffer = null;

  // Lightning state
  let nextBurstTime = 0;
  let isBursting = false;
  let flashesInBurst = 0;
  let currentFlashIndex = 0;
  let nextFlashTime = 0;
  
  let lightningActive = false;
  let lightningStartTime = 0;
  let lightningX = 0; // Relative X for compatibility
  let lightningZ = 0; // Relative Z for compatibility
  let lightningStrikePosRelToEarth = [0, 0, 0]; // Stable world position
  let lightningSeed = 0;
  let lightningFlash = 0;

  // Audio — two looped tracks crossfaded by intensity: a light rain for the
  // drizzle/moderate range and a heavier rain+wind for the storm range.
  let audioManager = null;
  let rainAudio = null;
  let stormAudio = null;

  /**
   * Initializes the rain system
   * @param {GPUBuffer} atmosphereUniformBuffer - Global atmosphere uniforms
   * @param {Object} am - AudioManager instance
   */
  const init = async (atmosphereUniformBuffer, am = null) => {
    audioManager = am;
    // 1. Shaders
    const rainModule = device.createShaderModule({ code: rainShader });
    const lightningModule = device.createShaderModule({ code: lightningShader });

    // 2. Uniform Buffers
    // Rain: numParticles, speed, length, width, windStrength, spawnRadius, spawnHeight, intensity, color(3), opacity, gridCenter(4), gridRight(4), gridForward(4), gridUp(4), cameraPos(4) (32 floats = 128 bytes)
    rainUniformBuffer = device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Rain Uniform Buffer'
    });

    // Lightning: isActive, startTime, boltDuration, flashIntensity, startX, startZ, seed, numBranches, glowWidth (9 floats -> 48 bytes for 16-byte alignment)
    lightningUniformBuffer = device.createBuffer({
      size: 48, 
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Lightning Uniform Buffer'
    });

    // 3. Bind Group Layout
    const rainBindGroupLayout = device.createBindGroupLayout({
      label: 'Rain Bind Group Layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // 16x16 Grid Buffer
      ],
    });

    // 4. Pipelines
    rainPipeline = device.createRenderPipeline({
      label: 'Rain Pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [rainBindGroupLayout] }),
      vertex: { module: rainModule, entryPoint: 'vs_main' },
      fragment: {
        module: rainModule, entryPoint: 'fs_main',
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

    lightningPipeline = device.createRenderPipeline({
      label: 'Lightning Pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [rainBindGroupLayout] }),
      vertex: { module: lightningModule, entryPoint: 'vs_main' },
      fragment: {
        module: lightningModule, entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
    });

    // 5. Bind Groups (Initial with dummy grid)
    const dummyGrid = device.createBuffer({ 
        size: PHYSICS_GRID_CONFIG.TOTAL_BUFFER_SIZE, 
        usage: GPUBufferUsage.STORAGE 
    });
    
    rainBindGroup = device.createBindGroup({
      layout: rainBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: rainUniformBuffer } },
        { binding: 2, resource: { buffer: dummyGrid } },
      ],
    });

    lightningBindGroup = device.createBindGroup({
      layout: rainBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: lightningUniformBuffer } },
        { binding: 2, resource: { buffer: dummyGrid } },
      ],
    });

    // 6. Audio — two parallel loops. The "rain" track is light rain (used
    // across drizzle and moderate); the "storm" track is heavier rain + wind
    // (used as intensity climbs). Both start paused at volume 0; update()
    // crossfades them so transitions between modes don't stutter.
    rainAudio = new Audio(AUDIO_CONFIG.sounds.rain);
    rainAudio.loop = true;
    rainAudio.volume = 0;
    stormAudio = new Audio(AUDIO_CONFIG.sounds.storm);
    stormAudio.loop = true;
    stormAudio.volume = 0;

    console.log('[RainSystem] Initialized');
  };

  /**
   * Updates the rain and lightning state
   */
  const update = (time, rainIntensity, stormEnabled, altitudeScale, gridData = null, cameraPosPlanet = [0, PLANET_RADIUS, 0]) => {
    if (!rainUniformBuffer) return { lightningFlash: 0, lightningPos: [0, 0, 0] };

    // 1. Update Rain Audio — two loops crossfaded by intensity. Below 0.5
    // it's mostly the light rain track; above 0.5 the storm track fades in
    // and the light one fades out. Threshold for play/pause matches the
    // shader's drop-visibility cutoff (drops gone below 0.1) so audio
    // stops exactly when the last drop disappears.
    if (rainIntensity > 0.1) {
      if (rainAudio.paused) rainAudio.play().catch(() => {});
      if (stormAudio.paused) stormAudio.play().catch(() => {});
      const masterVol = Math.min(1.0, rainIntensity * RAIN_CONFIG.audio.rainVolume);
      // Crossfade window: light rain dominates until 0.5, storm dominates
      // above 0.8 — smooth blend in between.
      const stormBlend = Math.max(0, Math.min(1, (rainIntensity - 0.5) / 0.3));
      rainAudio.volume = masterVol * (1 - stormBlend);
      stormAudio.volume = masterVol * stormBlend;
    } else {
      if (!rainAudio.paused) rainAudio.pause();
      if (!stormAudio.paused) stormAudio.pause();
    }

    // 2. Update Rain Uniforms. Draw only as many drops as the intensity calls
    // for — each drop is hash-placed by its index, so a lower count thins the
    // rain uniformly and the GPU cost scales with how hard it is raining.
    const maxParticles = RAIN_CONFIG.particleCount;
    currentParticleCount = Math.ceil(maxParticles * Math.min(1, Math.max(0, rainIntensity)));
    const rainData = new Float32Array(32); // Increased to 32 for cameraPos

    // Core params
    // All dynamics are altitude-INDEPENDENT — the rain stays visually consistent
    // as the avatar walks over uneven terrain. Without this, altitudeScale
    // fluctuates with camera height and the whole shower pulses (perceived as
    // speed changes + visible cuts when the log10 ramp crosses thresholds).
    rainData.set([
      maxParticles,
      RAIN_CONFIG.baseFallSpeed,
      RAIN_CONFIG.baseLength,
      RAIN_CONFIG.baseWidth,
      RAIN_CONFIG.windStrength,
      RAIN_CONFIG.baseSpawnRadius,
      RAIN_CONFIG.baseSpawnHeight,
      rainIntensity,
      ...RAIN_CONFIG.color,
      RAIN_CONFIG.opacity
    ], 0);

    // Grid data (View Space)
    if (gridData) {
        rainData.set(gridData.centerView, 12);
        rainData.set(gridData.rightView, 16);
        rainData.set(gridData.forwardView, 20);
        rainData.set(gridData.upView, 24);
    }
    
    // cameraPos slot: world-anchored tile-wrap offset (xy, metres modulo 2R).
    // The shader subtracts xy from each drop's hash position to pin it in
    // world space — see docs/rain-system.md. zw are reserved (zero) — they
    // used to carry the avatar velocity for a fall-direction tilt but that
    // effect was removed because it read as "arrows pointing at the avatar".
    if (gridData?.rainCamOffsetMeters) {
      const off = gridData.rainCamOffsetMeters;
      rainData.set([off[0], off[1], 0, 0], 28);
    } else {
      rainData.set([0, 0, 0, 0], 28);
    }

    device.queue.writeBuffer(rainUniformBuffer, 0, rainData);

    // 3. Update Lightning Logic (Burst System)
    lightningFlash *= 0.85; // Faster decay for flash intensity
    if (lightningFlash < 0.01) lightningFlash = 0;

    const lc = RAIN_CONFIG.lightning;

    if (stormEnabled && rainIntensity > 0.5) {
      // 3.1 Handle Burst Initiation
      if (time > nextBurstTime && !isBursting) {
        isBursting = true;
        flashesInBurst = Math.floor(lc.minFlashesPerBurst + Math.random() * (lc.maxFlashesPerBurst - lc.minFlashesPerBurst + 1));
        currentFlashIndex = 0;
        nextFlashTime = time;
        
        // Random location for this entire burst in World Space (relative to Earth Center)
        // 1. Find up vector at current camera position
        const camDist = Math.sqrt(cameraPosPlanet[0]**2 + cameraPosPlanet[1]**2 + cameraPosPlanet[2]**2);
        const upDir = [cameraPosPlanet[0]/camDist, cameraPosPlanet[1]/camDist, cameraPosPlanet[2]/camDist];
        
        // 2. Create tangent basis
        const right = [1, 0, 0];
        const forward = [0, 0, 1]; // Simplified, good enough for random offsets
        
        // 3. Random offset on planet surface
        const radius = lc.strikeRadius * altitudeScale;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * radius;
        const offX = Math.cos(angle) * dist;
        const offZ = Math.sin(angle) * dist;
        
        // 4. Final stable world position (on surface)
        const groundPoint = [upDir[0] * PLANET_RADIUS, upDir[1] * PLANET_RADIUS, upDir[2] * PLANET_RADIUS];
        lightningStrikePosRelToEarth = [
            groundPoint[0] + offX, 
            groundPoint[1], // Rough approximation, fine since we use upDir in shader
            groundPoint[2] + offZ
        ];
        
        // Relative X/Z for legacy logic (not strictly needed but keep for safety)
        lightningX = offX;
        lightningZ = offZ;
        
        // Schedule next burst
        nextBurstTime = time + lc.minBurstInterval + Math.random() * (lc.maxBurstInterval - lc.minBurstInterval);
      }

      // 3.2 Handle Flashes within Burst
      if (isBursting) {
        if (time > nextFlashTime) {
          if (currentFlashIndex < flashesInBurst) {
            // Trigger a single flash/bolt
            lightningActive = true;
            lightningStartTime = time;
            lightningSeed = Math.random() * 1000;
            lightningFlash = lc.flashIntensity;
            
            // Delayed Spatial Thunder
            if (currentFlashIndex === 0 || Math.random() < lc.thunderChance) {
              const delay = lc.thunderDelayMin + Math.random() * lc.thunderDelayRange;
              const soundPos = [lightningX, 0, lightningZ]; // Strike location (ground level)
              
              setTimeout(() => {
                if (audioManager && audioManager.isEnabled) {
                    audioManager.updatePosition('thunder', soundPos);
                    audioManager.play('thunder', { restart: true, volumeMultiplier: Math.min(1.0, rainIntensity) });
                }
              }, delay * 1000);
            }
            
            currentFlashIndex++;
            nextFlashTime = time + lc.flashDuration + lc.flashGap;
          } else {
            isBursting = false;
          }
        }
      }

      // 3.3 Manage individual bolt visibility
      if (lightningActive && (time - lightningStartTime) > lc.boltDuration) {
        lightningActive = false;
      }
    } else {
      isBursting = false;
      lightningActive = false;
      lightningFlash = 0;
    }

    // 4. Update Lightning Uniforms
    // Strike pos relative to camera
    const relStrike = [
        lightningStrikePosRelToEarth[0] - cameraPosPlanet[0],
        lightningStrikePosRelToEarth[1] - cameraPosPlanet[1],
        lightningStrikePosRelToEarth[2] - cameraPosPlanet[2],
    ];

    const lightningData = new Float32Array(12);
    lightningData.set([
      lightningActive ? 1.0 : 0.0,
      lightningStartTime,
      lc.boltDuration,
      lc.flashIntensity,
      relStrike[0],
      relStrike[1],
      relStrike[2],
      lightningSeed,
      lc.branchCount,
      lc.boltGlowWidth,
      0, // padding
      0  // padding
    ], 0);
    device.queue.writeBuffer(lightningUniformBuffer, 0, lightningData);

    return { lightningFlash, lightningPos: relStrike };
  };

  /**
   * Updates the grid buffer used for grounding
   * @param {GPUBuffer} buffer - Grid output buffer from PlanetRenderer
   * @param {GPUBuffer} atmosphereUniformBuffer - Global atmosphere uniforms
   */
  const setGridBuffer = (buffer, atmosphereUniformBuffer) => {
    if (!rainPipeline) return;

    rainBindGroup = device.createBindGroup({
      layout: rainPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: rainUniformBuffer } },
        { binding: 2, resource: { buffer: buffer } },
      ],
    });

    lightningBindGroup = device.createBindGroup({
      layout: rainPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: atmosphereUniformBuffer } },
        { binding: 1, resource: { buffer: lightningUniformBuffer } },
        { binding: 2, resource: { buffer: buffer } },
      ],
    });
    
    console.log('[RainSystem] Grid buffer linked');
  };

  /**
   * Renders the rain and lightning
   * @param {GPURenderPassEncoder} passEncoder - Active render pass
   */
  const render = (passEncoder) => {
    if (rainPipeline && rainBindGroup) {
      passEncoder.setPipeline(rainPipeline);
      passEncoder.setBindGroup(0, rainBindGroup);
      passEncoder.draw(6, currentParticleCount);
    }

    if (lightningActive && lightningPipeline && lightningBindGroup) {
      passEncoder.setPipeline(lightningPipeline);
      passEncoder.setBindGroup(0, lightningBindGroup);
      // segments * glowLayers(5) * 6 vertices
      // Draw main bolt (instance 0) + branches
      const instanceCount = RAIN_CONFIG.lightning.branchCount + 1;
      passEncoder.draw(32 * 5 * 6, instanceCount);
    }
  };

  return {
    init,
    update,
    render,
    setGridBuffer
  };
};
