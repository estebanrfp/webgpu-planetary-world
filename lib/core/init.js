// Singleton promise to ensure initialization logic runs only once
let initPromise = null;

/**
 * Initialize WebGPU with Singleton pattern and enforced high-performance
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @returns {Promise<{device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat}>}
 */
export const initWebGPU = async (canvas) => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!canvas) throw new Error('Canvas element not found.');

    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser. Please use a modern browser like Chrome, Edge, or Firefox Nightly.');
    }

    if (!window.isSecureContext) {
      throw new Error('WebGPU requires a secure context (HTTPS or localhost).');
    }

    console.log('[WebGPU] Phase 1: Acquiring adapter...');

    // 1. Robust delay to allow GPU process/context stability
    await new Promise(r => setTimeout(r, 250));

    // 2. Strictly acquire high-performance adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      const detail = navigator.gpu ? 'Adapter acquisition returned null.' : 'navigator.gpu is missing.';
      throw new Error(`WebGPU adapter not found (${detail}). This might happen if your hardware does not support WebGPU, if it is disabled in settings, or if another process is blocking it.`);
    }

    console.log('[WebGPU] Phase 2: Creating device...');
    const device = await adapter.requestDevice({
      requiredFeatures: ['float32-filterable'].filter(f => adapter.features.has(f))
    });

    // Handle context loss
    device.lost.then((info) => {
      if (info.reason !== 'destroyed') {
        console.error('[WebGPU] Context lost:', info.message);
        location.reload();
      }
    });

    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
    
    context.configure({ device, format, alphaMode: 'opaque' });

    console.log('[WebGPU] Ready. Loading resources...');
    return { device, context, format };
  })();

  return initPromise;
};
