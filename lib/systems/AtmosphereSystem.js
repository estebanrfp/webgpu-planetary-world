import { 
    createFullscreenQuadBuffer, 
    createGlobalUniformBuffer, 
    writeGlobalUniforms,
    loadPrecomputedTextures 
} from '../textures/index.js';
import { atmosphereShader, cloudBakeComputeShader } from '../shaders/index.js';
import { 
    SCENE_OBJECTS,
    EARTH_RADIUS,
    EARTH_CENTER,
    ATMOSPHERE_CONFIG,
    CAMERA_CONFIG 
} from '../config/index.js';
import { vec3, multiplyMatrices } from '../math/index.js';

const normalize = vec3.normalize;

/**
 * Creates the atmospheric scattering and cloud system
 * @param {GPUDevice} device - WebGPU device
 * @param {string} format - Swapchain format
 * @returns {Object} Atmosphere system instance
 */
export const createAtmosphereSystem = (device, format) => {
    // --- STATE ---
    let pipeline = null;
    let uniformBuffer = null;
    let bindGroup = null;
    let quadBuffer = null;
    let precomputedTextures = null;
    let cloudTexture = null;
    let lutSampler = null;
    
    // Scratch buffers for update loop
    const viewFromClip = new Float32Array(16);
    const modelFromView = new Float32Array(16);
    const uniformScratch = new Float32Array(128); // Standardized 512-byte buffer

    /**
     * Copy row-major matrix to column-major for WGSL
     */
    const copyRowMajorToColumnMajor = (target, offset, source) => {
        for (let column = 0; column < 4; column++) {
            for (let row = 0; row < 4; row++) {
                target[offset + column * 4 + row] = source[row * 4 + column];
            }
        }
    };

    /**
     * Generate procedural cloud density texture using a compute shader
     */
    const generateProceduralCloudTexture = async (size = 1024) => {
        // 1. Create storage texture
        const texture = device.createTexture({
            size: [size, size, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        });

        // 2. Setup compute pipeline
        const shaderModule = device.createShaderModule({ code: cloudBakeComputeShader });
        const computePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'main' },
        });

        // 3. Create bind group
        const computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: texture.createView() }],
        });

        // 4. Run compute pass
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, computeBindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(size / 16), Math.ceil(size / 16));
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
        
        await device.queue.onSubmittedWorkDone();

        return texture;
    };

    /**
     * Initializes the atmosphere system
     */
    const init = async () => {
        // 1. Create resources
        quadBuffer = createFullscreenQuadBuffer(device);
        uniformBuffer = createGlobalUniformBuffer(device);
        
        // 2. Load textures
        precomputedTextures = await loadPrecomputedTextures(device);
        cloudTexture = await generateProceduralCloudTexture(1024);
        
        // 3. Create Sampler
        lutSampler = device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear',
            mipmapFilter: 'linear',
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            addressModeW: 'clamp-to-edge',
        });
        
        // 4. Initialize Pipeline
        const shaderModule = device.createShaderModule({
            code: atmosphereShader
        });

        pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 8,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: format }],
            },
            primitive: { topology: 'triangle-strip' },
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: 'always',
                format: 'depth32float',
            },
        });

        // 5. Create Dummy Shadow Resources for initial bind group
        const dummyShadowTexture = device.createTexture({
            size: [1, 1, 1],
            format: 'depth32float',
            dimension: '2d',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            label: 'Dummy Shadow Texture'
        });
        const dummyShadowSampler = device.createSampler({ compare: 'less' });
        const dummyShadowBuffer = device.createBuffer({
            size: 288, // 72 floats * 4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'Dummy Shadow Buffer'
        });

        // 6. Create Bind Group
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: precomputedTextures.transmittance.createView() },
                { binding: 2, resource: precomputedTextures.scattering.createView() },
                { binding: 3, resource: precomputedTextures.irradiance.createView() },
                { binding: 4, resource: lutSampler },
                { binding: 5, resource: cloudTexture.createView() },
                { binding: 6, resource: dummyShadowTexture.createView({ dimension: '2d-array', arrayLayerCount: 1 }) },
                { binding: 7, resource: dummyShadowSampler },
                { binding: 8, resource: { buffer: dummyShadowBuffer } },
            ],
        });
        
        // Return resources needed by other systems
        return { 
            lutSampler,
            precomputedTextures
        };
    };

    /**
     * Update atmosphere state and uniforms
     */
    const update = (canvas, cam, env, terrainDebugMode, debugGridFlags, maxLevel, meshPosition, time, terrainAltitude = 0, rainParams = [0, 0, 0, 0], lightningParams = [0, 0, 0, 0], lightningPos = [0, 0, 0], bypassFlags = 0) => {
        uniformScratch.fill(0);

        const kFovY = (50 / 180) * Math.PI;
        const kTanFovY = Math.tan(kFovY / 2);
        const aspect = canvas.width / canvas.height;
        
        const near = CAMERA_CONFIG.NEAR; 
        const far = CAMERA_CONFIG.FAR;
        
        viewFromClip.set([
            kTanFovY * aspect, 0, 0, 0,
            0, kTanFovY, 0, 0,
            0, 0, -(far + near) / (far - near), -1,
            0, 0, -(2 * far * near) / (far - near), 0
        ]);

        const camX = cam.position[0];
        const camY = cam.position[1];
        const camZ = cam.position[2];
        const xAxis = cam.right;
        const yAxis = cam.up;
        const zAxis = cam.backward;

        modelFromView.set([
            xAxis[0], yAxis[0], zAxis[0], 0,
            xAxis[1], yAxis[1], zAxis[1], 0,
            xAxis[2], yAxis[2], zAxis[2], 0,
            0, 0, 0, 1,
        ]);

        const camera = [camX, camY, camZ];
        // Sun direction — pre-built by WorldClock as a vector in the
        // avatar's local frame.
        const sunDir = env.sunDir ?? [0, 1, 0];
        const SUN_ANGULAR_RADIUS = ATMOSPHERE_CONFIG.SUN_ANGULAR_RADIUS;
        const sunSize = [Math.tan(SUN_ANGULAR_RADIUS), Math.cos(SUN_ANGULAR_RADIUS)];
        const whitePoint = [1, 1, 1];

        copyRowMajorToColumnMajor(uniformScratch, 0, viewFromClip);
        copyRowMajorToColumnMajor(uniformScratch, 16, modelFromView);
        
        const dx = camera[0] - EARTH_CENTER[0];
        const dy = camera[1] - EARTH_CENTER[1];
        const dz = camera[2] - EARTH_CENTER[2];
        const cameraRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const cameraAltitude = cameraRadius - EARTH_RADIUS;
        
        const discriminantBase = -cameraAltitude * (2 * EARTH_RADIUS + cameraAltitude);
        
        uniformScratch.set([cameraAltitude, cameraRadius, discriminantBase, env.exposure], 32);
        uniformScratch.set([sunDir[0], sunDir[1], sunDir[2], sunSize[0]], 36);
        const encodedW = debugGridFlags + sunSize[1];
        uniformScratch.set([whitePoint[0], whitePoint[1], whitePoint[2], encodedW], 40);
        
        const earthCenterOffset = [
            EARTH_CENTER[0] - camera[0],
            EARTH_CENTER[1] - camera[1],
            EARTH_CENTER[2] - camera[2]
        ];
        // earthCenter.w = terrainDebugMode + bypassFlags * 100 (see lib/core/uniforms.js)
        const encodedTerrainMode = terrainDebugMode + bypassFlags * 100;
        uniformScratch.set([earthCenterOffset[0], earthCenterOffset[1], earthCenterOffset[2], encodedTerrainMode], 44);
        
        const cameraNadir = normalize([
            camera[0] - EARTH_CENTER[0],
            camera[1] - EARTH_CENTER[1],
            camera[2] - EARTH_CENTER[2]
        ]);
        uniformScratch.set([maxLevel, cameraNadir[0], cameraNadir[1], cameraNadir[2]], 48);
        // Moon — anti-solar vector from the WorldClock. Brightness scales
        // with the lunar phase (new moon dark, full moon bright).
        const moonDir = env.moonDir ?? [0, -1, 0];
        uniformScratch.set([moonDir[0], moonDir[1], moonDir[2], 0.05 * env.moonPhase], 52);

        const cameraNf = 1 / (near - far);
        const cameraM10 = (far + near) * cameraNf;
        const cameraM14 = 2 * far * near * cameraNf;
        uniformScratch.set([near, far, cameraM10, cameraM14], 60);

        const effectiveCoverage = env.cloudsEnabled ? (env.cloudCoverage ?? ATMOSPHERE_CONFIG.cloudCoverage) : 0.0;
        const cloudToggle = env.cloudsEnabled ? 1.0 : 0.0;
        const volShadowsEnabled = env.volumetricShadowsEnabled ? 1.0 : 0.0;
        
        uniformScratch.set([effectiveCoverage, 0.0, ATMOSPHERE_CONFIG.cloudAltitude, volShadowsEnabled], 64);
        uniformScratch.set([
            time, 
            (env.cloudLayer1Opacity ?? ATMOSPHERE_CONFIG.cloudLayer1Opacity) * cloudToggle, 
            (env.cloudLayer2Opacity ?? ATMOSPHERE_CONFIG.cloudLayer2Opacity) * cloudToggle, 
            (env.cloudLayer3Opacity ?? ATMOSPHERE_CONFIG.cloudLayer3Opacity) * cloudToggle
        ], 68);

        uniformScratch.set([
            env.skySaturation ?? ATMOSPHERE_CONFIG.skySaturation,
            env.skyVibrance ?? ATMOSPHERE_CONFIG.skyVibrance,
            env.auroraIntensity ?? ATMOSPHERE_CONFIG.auroraIntensity,
            env.auroraSpeed ?? ATMOSPHERE_CONFIG.auroraSpeed
        ], 72);
        uniformScratch.set([
            env.skyTintR ?? ATMOSPHERE_CONFIG.skyTintR,
            env.skyTintG ?? ATMOSPHERE_CONFIG.skyTintG,
            env.skyTintB ?? ATMOSPHERE_CONFIG.skyTintB,
            env.auroraAltitude ?? ATMOSPHERE_CONFIG.auroraAltitude
        ], 76);

        uniformScratch.set([
            env.cloudLayer1R ?? ATMOSPHERE_CONFIG.cloudLayer1R,
            env.cloudLayer1G ?? ATMOSPHERE_CONFIG.cloudLayer1G,
            env.cloudLayer1B ?? ATMOSPHERE_CONFIG.cloudLayer1B,
            env.auroraTopR ?? ATMOSPHERE_CONFIG.auroraTopR
        ], 80);
        uniformScratch.set([
            env.cloudLayer2R ?? ATMOSPHERE_CONFIG.cloudLayer2R,
            env.cloudLayer2G ?? ATMOSPHERE_CONFIG.cloudLayer2G,
            env.cloudLayer2B ?? ATMOSPHERE_CONFIG.cloudLayer2B,
            env.auroraTopG ?? ATMOSPHERE_CONFIG.auroraTopG
        ], 84);
        uniformScratch.set([
            env.cloudLayer3R ?? ATMOSPHERE_CONFIG.cloudLayer3R,
            env.cloudLayer3G ?? ATMOSPHERE_CONFIG.cloudLayer3G,
            env.cloudLayer3B ?? ATMOSPHERE_CONFIG.cloudLayer3B,
            env.auroraTopB ?? ATMOSPHERE_CONFIG.auroraTopB
        ], 88);

        // 92-95: rainParams (x=intensity, yzw=aurora base color)
        uniformScratch.set([
            rainParams[0],
            env.auroraBaseR ?? ATMOSPHERE_CONFIG.auroraBaseR,
            env.auroraBaseG ?? ATMOSPHERE_CONFIG.auroraBaseG,
            env.auroraBaseB ?? ATMOSPHERE_CONFIG.auroraBaseB
        ], 92);
        uniformScratch.set([lightningParams[0], ...lightningPos], 96);

        // 100-115: clip_from_view (Projection Matrix)
        const projF = 1.0 / kTanFovY;
        const f = projF; // Alias for readability
        const projectionMatrix = new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, near / (far - near), (far * near) / (far - near),
            0, 0, -1, 0,
        ]);
        copyRowMajorToColumnMajor(uniformScratch, 100, projectionMatrix);
        
        const meshOffset = [
            meshPosition[0] - camera[0],
            meshPosition[1] - camera[1],
            meshPosition[2] - camera[2]
        ];
        const avatarLocalUp = normalize([
            meshPosition[0] - EARTH_CENTER[0],
            meshPosition[1] - EARTH_CENTER[1],
            meshPosition[2] - EARTH_CENTER[2]
        ]);
        const avatarRadius = SCENE_OBJECTS.avatar.radius;
        
        const groundedThreshold = 0.005;
        const snappingFactor = terrainAltitude < groundedThreshold ? terrainAltitude : 0;
        const avatarLift = -snappingFactor;
        
        const avatarOffset = [
            meshOffset[0] + avatarLocalUp[0] * avatarLift,
            meshOffset[1] + avatarLocalUp[1] * avatarLift,
            meshOffset[2] + avatarLocalUp[2] * avatarLift
        ];

        uniformScratch.set([
            avatarOffset[0], avatarOffset[1], avatarOffset[2],
            avatarRadius
        ], 56);

        // Upload to GPU
        writeGlobalUniforms(device, uniformBuffer, uniformScratch);

        // Matrix calculation for terrain
        const viewMatrix = new Float32Array([
            xAxis[0], xAxis[1], xAxis[2], 0, 
            yAxis[0], yAxis[1], yAxis[2], 0,
            zAxis[0], zAxis[1], zAxis[2], 0,
            0, 0, 0, 1,
        ]);
        const viewProj = multiplyMatrices(projectionMatrix, viewMatrix);

        return { 
            sunDir, 
            viewProj, 
            avatarSphereData: [avatarOffset[0], avatarOffset[1], avatarOffset[2], avatarRadius],
            uniformBuffer,
            cloudOpacities: [
                (env.cloudLayer1Opacity ?? ATMOSPHERE_CONFIG.cloudLayer1Opacity) * cloudToggle,
                (env.cloudLayer2Opacity ?? ATMOSPHERE_CONFIG.cloudLayer2Opacity) * cloudToggle,
                (env.cloudLayer3Opacity ?? ATMOSPHERE_CONFIG.cloudLayer3Opacity) * cloudToggle,
                (env.cloudShadowsEnabled ?? true) ? 1.0 : 0.0 
            ]
        };
    };

    /**
     * Update shadow resources from the PlanetRenderer's ShadowSystem
     */
    const setShadowResources = (shadowDepthTextureArray, shadowSampler, shadowUniformBuffer) => {
        if (!pipeline) return;
        
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: precomputedTextures.transmittance.createView() },
                { binding: 2, resource: precomputedTextures.scattering.createView() },
                { binding: 3, resource: precomputedTextures.irradiance.createView() },
                { binding: 4, resource: lutSampler },
                { binding: 5, resource: cloudTexture.createView() },
                { binding: 6, resource: shadowDepthTextureArray.createView({ dimension: '2d-array' }) },
                { binding: 7, resource: shadowSampler },
                { binding: 8, resource: { buffer: shadowUniformBuffer } },
            ],
        });
    };

    /**
     * Render the atmosphere quad
     */
    const render = (passEncoder, enabled = true) => {
        if (!enabled || !bindGroup) return;
        
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.setVertexBuffer(0, quadBuffer);
        passEncoder.draw(4);
    };

    return {
        init,
        update,
        render,
        setShadowResources,
        get uniformBuffer() { return uniformBuffer; },
        get cloudTexture() { return cloudTexture; },
        get quadBuffer() { return quadBuffer; }
    };
};
