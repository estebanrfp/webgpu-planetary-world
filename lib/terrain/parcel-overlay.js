/**
 * Parcel Overlay GPU Pipeline — Terrain-based approach
 *
 * Reuses the terrain mesh (same megaVertexBuffer, visibleIndices, instances).
 * Draws with the same indexed indirect call as terrain but with a different
 * fragment shader that colors based on parcel ownership.
 *
 * @module parcel-overlay
 */

import { parcelOverlayWGSL } from '../shaders/parcelOverlay.wgsl.js'

const PARCEL_STRIDE = 16 // 4 floats × 4 bytes per parcel
const UNIFORM_SIZE = 16  // 4 floats × 4 bytes
const TOTAL_PARCELS = 123 * 123 * 6 // 90,774

/**
 * Create the parcel overlay system.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBindGroupLayout} terrainBindGroupLayout - Terrain's bind group 0 layout
 * @returns {object} Parcel overlay API
 */
export const createParcelOverlay = (device, format, terrainBindGroupLayout) => {
  let active = false
  let parcelCount = 0

  // ─── Bind Group 1: Parcel data ───
  const parcelUniformBuffer = device.createBuffer({
    label: 'Parcel Uniform Buffer',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  let parcelStorageBuffer = device.createBuffer({
    label: 'Parcel Storage Buffer',
    size: TOTAL_PARCELS * PARCEL_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const parcelBindGroupLayout = device.createBindGroupLayout({
    label: 'Parcel Data Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  })

  const createParcelBindGroup = () => device.createBindGroup({
    label: 'Parcel Data BindGroup',
    layout: parcelBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: parcelUniformBuffer } },
      { binding: 1, resource: { buffer: parcelStorageBuffer } },
    ],
  })

  let parcelBindGroup = createParcelBindGroup()

  // ─── Pipeline (uses terrain's bind group layout for group 0) ───
  const shaderModule = device.createShaderModule({
    label: 'Parcel Overlay Shader',
    code: parcelOverlayWGSL,
  })

  const pipelineLayout = device.createPipelineLayout({
    label: 'Parcel Overlay Pipeline Layout',
    bindGroupLayouts: [terrainBindGroupLayout, parcelBindGroupLayout],
  })

  const pipeline = device.createRenderPipeline({
    label: 'Parcel Overlay Pipeline',
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vsMain',
      buffers: [],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fsMain',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'front',
      frontFace: 'ccw',
    },
    depthStencil: {
      depthWriteEnabled: false,
      depthCompare: 'greater-equal',
      format: 'depth32float',
    },
  })

  // ─── API ───

  /**
   * Upload all parcel data to GPU (90,774 parcels in fixed order).
   * @param {Float32Array} data - 4 floats per parcel, face-major row-major
   */
  const updateData = (data) => {
    const requiredSize = data.byteLength
    if (requiredSize > parcelStorageBuffer.size) {
      parcelStorageBuffer.destroy()
      parcelStorageBuffer = device.createBuffer({
        label: 'Parcel Storage Buffer',
        size: requiredSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      parcelBindGroup = createParcelBindGroup()
    }
    device.queue.writeBuffer(parcelStorageBuffer, 0, data)
    parcelCount = data.length / 4
  }

  /**
   * Update per-frame parcel uniforms.
   * @param {{ hoveredIdx?: number, selectedIdx?: number, cameraAltitude?: number }} params
   */
  const updateUniforms = ({ hoveredIdx = -1, selectedIdx = -1, cameraAltitude = 1000 } = {}) => {
    const buf = new Float32Array([hoveredIdx, selectedIdx, parcelCount, cameraAltitude])
    device.queue.writeBuffer(parcelUniformBuffer, 0, buf)
  }

  /** @param {boolean} enabled */
  const setActive = (enabled) => { active = enabled }

  const destroy = () => {
    parcelUniformBuffer.destroy()
    parcelStorageBuffer.destroy()
  }

  return {
    get active() { return active },
    get pipeline() { return pipeline },
    get parcelBindGroup() { return parcelBindGroup },
    get parcelCount() { return parcelCount },
    setActive,
    updateData,
    updateUniforms,
    destroy,
  }
}
