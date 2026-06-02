import { frustumCullComputeShader } from '../shaders/frustumCull.compute.wgsl.js';
import { 
  PLANET_RADIUS,
  TERRAIN_SCALES, 
  QUADTREE_CONFIG 
} from '../config/index.js';

const MAX_CHUNKS = TERRAIN_SCALES.MAX_CHUNKS;

/**
 * createGPUCullingSystem - Factory for GPU-based frustum and horizon culling.
 * 
 * @param {GPUDevice} device - WebGPU device
 * @returns {Object} GPU Culling system instance
 */
export const createGPUCullingSystem = (device) => {
    // --- STATE ---
    let cullComputePipeline = null;
    let cullBindGroup = null;
    let chunkDataBuffer = null;
    let visibilityBuffer = null;
    let visibilityReadBuffer = null;
    let indirectBuffer = null;
    let visibleIndicesBuffer = null;
    let indirectReadbackBuffer = null;
    let cullParamsBuffer = null;

    const cullParamsData = new Float32Array(16);
    const chunkDataArray = new Float32Array(MAX_CHUNKS * 8);
    let indirectReadbackPending = false;
    let lastRenderedCount = 0;

    /**
     * Initialize compute resources and pipelines
     */
    const init = (instanceStorageBuffer) => {
        const cullModule = device.createShaderModule({
            code: frustumCullComputeShader,
            label: 'Frustum Cull Compute Shader'
        });

        // Buffers
        chunkDataBuffer = device.createBuffer({
            size: MAX_CHUNKS * 32,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'GPU Cull Chunk Data Buffer'
        });

        visibilityBuffer = device.createBuffer({
            size: MAX_CHUNKS * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            label: 'GPU Cull Visibility Buffer'
        });

        visibilityReadBuffer = device.createBuffer({
            size: MAX_CHUNKS * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'GPU Cull Visibility Readback Buffer'
        });

        indirectBuffer = device.createBuffer({
            size: 20,
            usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            label: 'GPU Indirect Draw Buffer'
        });

        visibleIndicesBuffer = device.createBuffer({
            size: MAX_CHUNKS * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
            label: 'GPU Visible Indices Buffer'
        });

        indirectReadbackBuffer = device.createBuffer({
            size: 20,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'Indirect Readback Buffer'
        });

        cullParamsBuffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'GPU Cull Params Buffer'
        });

        // Pipeline Layout
        const cullBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
            label: 'GPU Cull Bind Group Layout'
        });

        cullComputePipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [cullBindGroupLayout] }),
            compute: { module: cullModule, entryPoint: 'main' },
            label: 'GPU Cull Compute Pipeline'
        });

        cullBindGroup = device.createBindGroup({
            layout: cullBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: chunkDataBuffer } },
                { binding: 1, resource: { buffer: visibilityBuffer } },
                { binding: 2, resource: { buffer: cullParamsBuffer } },
                { binding: 3, resource: { buffer: indirectBuffer } },
                { binding: 4, resource: { buffer: visibleIndicesBuffer } },
                { binding: 5, resource: { buffer: instanceStorageBuffer } },
            ],
            label: 'GPU Cull Bind Group'
        });
    };

    /**
     * Dispatch the culling compute shader
     */
    const dispatch = (encoder, meshes, cameraData) => {
        const count = Math.min(meshes.length, MAX_CHUNKS);
        if (count === 0) return;

        // 1. Upload chunk data
        const earthOffset = cameraData.earthCenterOffset || [0, 0, 0];
        for (let i = 0; i < count; i++) {
            const mesh = meshes[i];
            const offset = i * 8;
            chunkDataArray[offset + 0] = mesh.boundingSphere.center[0];
            chunkDataArray[offset + 1] = mesh.boundingSphere.center[1];
            chunkDataArray[offset + 2] = mesh.boundingSphere.center[2];
            chunkDataArray[offset + 3] = mesh.boundingSphere.radius;
            chunkDataArray[offset + 4] = mesh.lodLevel || 0;
            chunkDataArray[offset + 5] = mesh.poolIndex;
        }
        device.queue.writeBuffer(chunkDataBuffer, 0, chunkDataArray.buffer, 0, count * 32);

        // 2. Update params
        const { cameraPos, cameraForward, horizonCullingEnabled } = cameraData;
        cullParamsData[0] = cameraPos[0];
        cullParamsData[1] = cameraPos[1];
        cullParamsData[2] = cameraPos[2];
        cullParamsData[3] = PLANET_RADIUS;
        cullParamsData[4] = cameraForward[0];
        cullParamsData[5] = cameraForward[1];
        cullParamsData[6] = cameraForward[2];
        
        const dataView = new DataView(cullParamsData.buffer);
        dataView.setUint32(7 * 4, count, true);
        
        cullParamsData[8] = earthOffset[0];
        cullParamsData[9] = earthOffset[1];
        cullParamsData[10] = earthOffset[2];
        cullParamsData[11] = horizonCullingEnabled ? 1.0 : 0.0;
        cullParamsData[12] = QUADTREE_CONFIG.HORIZON_CULL_GPU_MARGIN || 50.0;
        
        // Use centralized threshold
        cullParamsData[13] = QUADTREE_CONFIG.BACK_CONE_THRESHOLD;

        device.queue.writeBuffer(cullParamsBuffer, 0, cullParamsData);

        // 3. Reset indirect buffer
        const indirectData = new Uint32Array([cameraData.indexCount, 0, 0, 0, 0]);
        device.queue.writeBuffer(indirectBuffer, 0, indirectData);

        // 4. Run Compute Pass
        const pass = encoder.beginComputePass({ label: 'GPU Cull Pass' });
        pass.setPipeline(cullComputePipeline);
        pass.setBindGroup(0, cullBindGroup);
        pass.dispatchWorkgroups(Math.ceil(count / 64));
        pass.end();
    };

    /**
     * Schedule async readback of rendered instance count
     */
    const scheduleReadback = (encoder) => {
        if (indirectReadbackPending) return;
        indirectReadbackPending = true;

        encoder.copyBufferToBuffer(indirectBuffer, 0, indirectReadbackBuffer, 0, 20);

        queueMicrotask(() => {
            device.queue.onSubmittedWorkDone().then(() => {
                if (!indirectReadbackBuffer) {
                    indirectReadbackPending = false;
                    return;
                }
                indirectReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
                    const data = new Uint32Array(indirectReadbackBuffer.getMappedRange());
                    lastRenderedCount = data[1];
                    indirectReadbackBuffer.unmap();
                    indirectReadbackPending = false;
                }).catch(() => { indirectReadbackPending = false; });
            }).catch(() => { indirectReadbackPending = false; });
        });
    };

    return {
        init,
        dispatch,
        scheduleReadback,
        get indirectBuffer() { return indirectBuffer; },
        get visibleIndicesBuffer() { return visibleIndicesBuffer; },
        get lastRenderedCount() { return lastRenderedCount; }
    };
};
