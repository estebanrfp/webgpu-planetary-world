import { shadowShader, shadowCharacterShader } from '../shaders/shadow.wgsl.js';
import { createLookAtMatrix, multiplyMatrices, createOrthoMatrix } from '../math/index.js';
import { 
  PLANET_RADIUS, 
  EARTH_CENTER, 
  TERRAIN_SCALES,
  SHADOW_CONFIG,
  calculateCascadeSplits
} from '../config/index.js';

/**
 * createShadowSystem - Cascaded Shadow Mapping for terrain, character, and vehicle.
 * 
 * Implements 4 cascades for high-resolution near shadows and distant terrain coverage.
 * All matrices are computed in camera-relative space for Floating Origin compatibility.
 * 
 * @param {GPUDevice} device - WebGPU device
 * @returns {Object} Shadow system instance
 */
export const createShadowSystem = (device) => {
    // --- CONFIGURATION ---
    const { CASCADE_COUNT, MAP_SIZE, CASCADES } = SHADOW_CONFIG;
    
    // --- STATE ---
    let shadowDepthTextureArray = null;  // texture_depth_2d_array with 4 layers
    let shadowSampler = null;
    let shadowUniformBuffer = null;
    
    // Uniform data: 4 matrices (64 floats) + splitDepths (4 floats) + earthCenter (4 floats) = 72 floats
    const UNIFORM_SIZE = 72 * 4; // 288 bytes
    let shadowUniformData = new Float32Array(72);
    
    // Cached cascade matrices for return value
    let cascadeMatrices = [null, null, null, null];
    
    let shadowPipeline = null;
    const shadowCharacterPipelines = []; // one per cascade: vs_main, vs_cascade1..3

    /**
     * Initialize shadow resources and pipelines
     */
    const init = () => {
        // Create 2D array texture for cascades (4 layers)
        shadowDepthTextureArray = device.createTexture({
            size: [MAP_SIZE, MAP_SIZE, CASCADE_COUNT],
            format: 'depth32float',
            dimension: '2d',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            label: 'Shadow Depth Texture Array (CSM)'
        });

        shadowSampler = device.createSampler({
            compare: 'less',
            magFilter: 'linear',
            minFilter: 'linear',
            label: 'Shadow Sampler (CSM)'
        });

        shadowUniformBuffer = device.createBuffer({
            size: UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'Shadow Uniform Buffer (CSM)'
        });

        const shadowSM = device.createShaderModule({ 
            code: shadowShader,
            label: 'Terrain Shadow Shader (CSM)' 
        });
        const shadowCharSM = device.createShaderModule({ 
            code: shadowCharacterShader,
            label: 'Character Shadow Shader (CSM)'
        });

        // Terrain shadow pipeline (draws to depth-only)
        shadowPipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: shadowSM, entryPoint: 'vs_main', buffers: [] },
            primitive: { topology: 'triangle-list', cullMode: 'back' },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth32float',
            },
            label: 'Terrain Shadow Pipeline (CSM)'
        });

        // Character shadow pipelines — one per cascade. The avatar ring is
        // wider than cascade 0, so avatars must be drawn into every cascade.
        const charEntryPoints = ['vs_main', 'vs_cascade1', 'vs_cascade2', 'vs_cascade3'];
        for (let c = 0; c < CASCADE_COUNT; c++) {
            shadowCharacterPipelines[c] = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: shadowCharSM,
                    entryPoint: charEntryPoints[c],
                    buffers: [{
                        // 76-byte avatar vertex (pos·norm·uv·joints·weights·color).
                        // The shadow pass only needs pos + joints + weights; color
                        // (offset 64) is left undeclared, but the stride must match.
                        arrayStride: 76,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x3' },
                            { shaderLocation: 1, offset: 12, format: 'float32x3' },
                            { shaderLocation: 2, offset: 24, format: 'float32x2' },
                            { shaderLocation: 3, offset: 32, format: 'float32x4' },
                            { shaderLocation: 4, offset: 48, format: 'float32x4' },
                        ],
                    }],
                },
                primitive: { topology: 'triangle-list', cullMode: 'back' },
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: 'less',
                    format: 'depth32float',
                },
                label: `Character Shadow Pipeline C${c} (CSM)`
            });
        }
    };

    /**
     * Calculate planetary-aligned "up" vector for light matrix
     */
    const calculatePlanetaryUp = (lightDir, avatarPos, globalUniformData) => {
        let up = [0, 1, 0];
        
        if (globalUniformData) {
            const earthCenter = [
                globalUniformData[24], 
                globalUniformData[25], 
                globalUniformData[26]
            ];
            const toAvatar = [
                avatarPos[0] - earthCenter[0],
                avatarPos[1] - earthCenter[1],
                avatarPos[2] - earthCenter[2]
            ];
            const len = Math.sqrt(toAvatar[0]**2 + toAvatar[1]**2 + toAvatar[2]**2);
            if (len > 0) {
                up = [toAvatar[0] / len, toAvatar[1] / len, toAvatar[2] / len];
            }
            
            // Singularity check: if up is parallel to light, use fallback
            const dotUpLight = Math.abs(up[0] * lightDir[0] + up[1] * lightDir[1] + up[2] * lightDir[2]);
            if (dotUpLight > 0.99) {
                up = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            }
        }
        
        return up;
    };

    /**
     * Build light view-projection matrix for a single cascade
     */
    const buildCascadeMatrix = (lightDir, avatarPos, up, cascadeConfig) => {
        const { radius, nearClip, farClip } = cascadeConfig;
        
        // Position light source along light direction from avatar
        const distance = farClip * 0.5;
        const eye = [
            avatarPos[0] + lightDir[0] * distance,
            avatarPos[1] + lightDir[1] * distance,
            avatarPos[2] + lightDir[2] * distance
        ];
        
        const lightView = createLookAtMatrix(eye, avatarPos, up);
        const lightProj = createOrthoMatrix(-radius, radius, -radius, radius, nearClip, farClip);
        return multiplyMatrices(lightProj, lightView);
    };

    /**
     * Update all 4 cascade view-projection matrices centered on avatar
     * All positions are camera-relative (Floating Origin)
     */
    const updateMatrices = (lightDir, avatarPos, globalUniformData) => {
        const up = calculatePlanetaryUp(lightDir, avatarPos, globalUniformData);
        
        // Calculate split depths for cascade selection in fragment shader
        const maxShadowDist = CASCADES[CASCADE_COUNT - 1].farClip;
        const splits = calculateCascadeSplits(0.001, maxShadowDist);
        
        // Build and store each cascade matrix
        for (let i = 0; i < CASCADE_COUNT; i++) {
            const matrix = buildCascadeMatrix(lightDir, avatarPos, up, CASCADES[i]);
            cascadeMatrices[i] = matrix;
            
            // Store in uniform data: matrices at offset 0, 16, 32, 48
            shadowUniformData.set(matrix, i * 16);
        }
        
        // Store split depths at offset 64
        shadowUniformData[64] = splits[0];
        shadowUniformData[65] = splits[1];
        shadowUniformData[66] = splits[2];
        shadowUniformData[67] = splits[3];
        
        // Store earthCenter at offset 68
        if (globalUniformData) {
            shadowUniformData[68] = globalUniformData[24];
            shadowUniformData[69] = globalUniformData[25];
            shadowUniformData[70] = globalUniformData[26];
            shadowUniformData[71] = globalUniformData[27];
        }
        
        device.queue.writeBuffer(shadowUniformBuffer, 0, shadowUniformData);
        
        // Return first cascade matrix for compatibility
        return cascadeMatrices[0];
    };

    // Removed updateMatrix (replaced by updateMatrices)

    /**
     * Render shadows for a single cascade layer
     */
    const renderCascade = (encoder, cascadeIndex, entities, context) => {
        const {
            characterSystem,
            megaVertexBuffer,
            instanceStorageBuffer, 
            unitGridIndexBuffer, 
            unitGridIndexCount,
            globalUniformBuffer
        } = context;

        const shadowPass = encoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: {
                view: shadowDepthTextureArray.createView({
                    dimension: '2d',
                    baseArrayLayer: cascadeIndex,
                    arrayLayerCount: 1
                }),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
            label: `Shadow Pass Cascade ${cascadeIndex}`
        });

        // Character shadow: drawn into every cascade — the avatar ring is
        // wider than cascade 0, so distant avatars need the larger cascades.
        if (characterSystem?.avatarLoaded && context.avatarInstanceCount > 0) {
            const charPipeline = shadowCharacterPipelines[cascadeIndex];
            const charBindGroup = device.createBindGroup({
                layout: charPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: shadowUniformBuffer } },
                    { binding: 1, resource: { buffer: globalUniformBuffer } },
                    { binding: 2, resource: { buffer: context.avatarInstanceBuffer } },
                    { binding: 3, resource: { buffer: characterSystem.boneMatricesBuffer } },
                ]
            });

            shadowPass.setPipeline(charPipeline);
            shadowPass.setBindGroup(0, charBindGroup);
            shadowPass.setVertexBuffer(0, characterSystem.avatarVB);
            shadowPass.setIndexBuffer(characterSystem.avatarIB, 'uint32');
            shadowPass.drawIndexed(characterSystem.avatarIndexCount, context.avatarInstanceCount);
        }

        // Render vegetation + rock shadows in near cascades
        if (cascadeIndex <= (SHADOW_CONFIG.SCATTER_SHADOW_MAX_CASCADE ?? 1)) {
            if (context.vegetationSystem && context.vegetationCount > 0) {
                context.vegetationSystem.renderShadowDepth(
                    shadowPass, context.vegetationCount, shadowUniformBuffer, cascadeIndex
                );
            }
            if (context.rockSystem && context.rockCount > 0) {
                context.rockSystem.renderShadowDepth(
                    shadowPass, context.rockCount, shadowUniformBuffer, cascadeIndex
                );
            }
            if (context.palmSystem && context.palmCount > 0) {
                context.palmSystem.renderShadowDepth(
                    shadowPass, context.palmCount, shadowUniformBuffer, cascadeIndex
                );
            }
            if (context.treeSystem && context.treeCount > 0) {
                context.treeSystem.renderShadowDepth(
                    shadowPass, context.treeCount, shadowUniformBuffer, cascadeIndex
                );
            }
            if (context.crystalSystem && context.crystalCount > 0) {
                context.crystalSystem.renderShadowDepth(
                    shadowPass, context.crystalCount, shadowUniformBuffer, cascadeIndex
                );
            }
        }

        // Render terrain to this cascade
        if (entities.length > 0) {
            const terrainBindGroup = device.createBindGroup({
                layout: shadowPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: shadowUniformBuffer } },
                    { binding: 1, resource: { buffer: instanceStorageBuffer } },
                    { binding: 2, resource: { buffer: megaVertexBuffer } },
                ]
            });

            shadowPass.setPipeline(shadowPipeline);
            shadowPass.setBindGroup(0, terrainBindGroup);
            shadowPass.setIndexBuffer(unitGridIndexBuffer, 'uint32');

            for (const item of entities) {
                shadowPass.drawIndexed(unitGridIndexCount, 1, 0, 0, item.slotIdx);
            }
        }

        shadowPass.end();
    };

    /**
     * Filter entities by cascade radius
     */
    const filterEntitiesForCascade = (allEntities, avatarPos, globalUniformData, cascadeIndex) => {
        const cascadeRadius = CASCADES[cascadeIndex].radius;
        const earthCenter = globalUniformData 
            ? [globalUniformData[24], globalUniformData[25], globalUniformData[26]]
            : [0, 0, 0];
        
        return allEntities.filter(item => {
            if (!item.mesh?.meshCenter) return false;
            const center = item.mesh.meshCenter;
            const dx = center[0] + earthCenter[0] - avatarPos[0];
            const dy = center[1] + earthCenter[1] - avatarPos[1];
            const dz = center[2] + earthCenter[2] - avatarPos[2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const boundingRadius = item.mesh.boundingSphere?.radius || 0;
            return dist < (cascadeRadius + boundingRadius);
        });
    };

    /**
     * Render shadows for all cascades
     */
    const render = (encoder, entities, context) => {
        const avatarPos = [
            context.avatarPos?.[0] || 0,
            context.avatarPos?.[1] || 0,
            context.avatarPos?.[2] || 0
        ];
        
        // Render each cascade with appropriately filtered entities
        for (let i = 0; i < CASCADE_COUNT; i++) {
            const cascadeEntities = filterEntitiesForCascade(
                entities, 
                avatarPos, 
                context.globalUniformData,
                i
            );
            renderCascade(encoder, i, cascadeEntities.length > 0 ? cascadeEntities : entities, context);
        }
    };

    return {
        init,
        updateMatrices,
        render,
        get depthTexture() { return shadowDepthTextureArray; },
        get depthTextureArray() { return shadowDepthTextureArray; },
        get sampler() { return shadowSampler; },
        get uniformBuffer() { return shadowUniformBuffer; },
        get cascadeCount() { return CASCADE_COUNT; },
        get cascadeMatrices() { return cascadeMatrices; }
    };
};
