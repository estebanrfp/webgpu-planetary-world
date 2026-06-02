/**
 * Draco Mesh Decoder — Lazy-init singleton for KHR_draco_mesh_compression
 *
 * Follows the same pattern as ktx2-loader.js (CDN script + local WASM).
 * DracoDecoderModule global is loaded via <script> tag in index.html.
 *
 * @module avatar/draco-decoder
 */

let dracoReady = false;
let dracoFailed = false;
let dracoInitPromise = null;
let DracoModule = null;

/**
 * Initialize Draco decoder WASM (singleton, safe to call multiple times)
 * @returns {Promise<boolean>}
 */
export const initDracoDecoder = async () => {
  if (dracoReady) return true;
  if (dracoFailed) return false;
  if (dracoInitPromise) return dracoInitPromise;

  dracoInitPromise = (async () => {
    try {
      if (typeof DracoDecoderModule !== 'undefined') {
        DracoModule = await DracoDecoderModule({
          wasmBinary: await fetch('./assets/wasm/draco_decoder.wasm')
            .then(r => r.arrayBuffer()),
        });
        dracoReady = true;
        console.log('[Draco] Decoder initialized');
        return true;
      }
      console.warn('[Draco] DracoDecoderModule global not found. Ensure script is in index.html');
      dracoFailed = true;
      return false;
    } catch (e) {
      console.error('[Draco] Failed to initialize decoder:', e);
      dracoFailed = true;
      return false;
    }
  })();

  return dracoInitPromise;
};

/**
 * Decode a Draco-compressed primitive from a glTF binary buffer.
 *
 * @param {ArrayBuffer} bin - GLB binary chunk
 * @param {Object} gltf - Parsed glTF JSON
 * @param {Object} dracoExt - The KHR_draco_mesh_compression extension object
 *   { bufferView: number, attributes: { POSITION: number, NORMAL?: number, TEXCOORD_0?: number } }
 * @param {Object} primitive - The glTF primitive (for accessor metadata like count, componentType)
 * @returns {Promise<{positions: Float32Array, normals: Float32Array|null, uvs: Float32Array|null, indices: Uint32Array|null}>}
 */
export const decodeDracoPrimitive = async (bin, gltf, dracoExt, primitive) => {
  await initDracoDecoder();
  if (!dracoReady) throw new Error('[Draco] Decoder not available');

  const bufferView = gltf.bufferViews[dracoExt.bufferView];
  const byteOffset = bufferView.byteOffset ?? 0;
  const byteLength = bufferView.byteLength;
  const compressedData = new Int8Array(bin, byteOffset, byteLength);

  const decoder = new DracoModule.Decoder();
  const buffer = new DracoModule.DecoderBuffer();
  buffer.Init(compressedData, compressedData.length);

  let dracoMesh = null;
  let result;

  try {
    const geometryType = decoder.GetEncodedGeometryType(buffer);
    if (geometryType !== DracoModule.TRIANGULAR_MESH) {
      throw new Error(`[Draco] Unsupported geometry type: ${geometryType}`);
    }

    dracoMesh = new DracoModule.Mesh();
    const status = decoder.DecodeBufferToMesh(buffer, dracoMesh);
    if (!status.ok()) {
      throw new Error(`[Draco] Decode failed: ${status.error_msg()}`);
    }

    const numPoints = dracoMesh.num_points();
    const numFaces = dracoMesh.num_faces();
    const attrMap = dracoExt.attributes;

    /**
     * Extract float attribute, applying glTF normalization for KHR_mesh_quantization.
     * Draco's GetAttributeFloatForAllPoints returns raw casted values — does NOT
     * apply accessor normalization. We must dequantize based on accessor metadata.
     */
    const extractFloat = (dracoId, components, attrName) => {
      if (dracoId == null) return null;
      const attr = decoder.GetAttributeByUniqueId(dracoMesh, dracoId);
      if (!attr) return null;

      const arr = new DracoModule.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(dracoMesh, attr, arr);
      const out = new Float32Array(numPoints * components);
      for (let i = 0; i < out.length; i++) out[i] = arr.GetValue(i);
      DracoModule.destroy(arr);

      // KHR_mesh_quantization: dequantize if accessor is normalized integer
      const accessorIdx = primitive.attributes?.[attrName];
      if (accessorIdx != null) {
        const accessor = gltf.accessors[accessorIdx];
        if (accessor?.normalized) {
          const ct = accessor.componentType;
          // BYTE=5120, UBYTE=5121, SHORT=5122, USHORT=5123
          let divisor = 0;
          if (ct === 5120) divisor = 127;
          else if (ct === 5121) divisor = 255;
          else if (ct === 5122) divisor = 32767;
          else if (ct === 5123) divisor = 65535;
          if (divisor) {
            const signed = ct === 5120 || ct === 5122;
            for (let i = 0; i < out.length; i++) {
              out[i] = signed ? Math.max(out[i] / divisor, -1.0) : out[i] / divisor;
            }
          }
        }
      }
      return out;
    };

    const positions = extractFloat(attrMap.POSITION, 3, 'POSITION');
    if (!positions) throw new Error('[Draco] No POSITION attribute decoded');

    const normals = extractFloat(attrMap.NORMAL, 3, 'NORMAL');
    const uvs = extractFloat(attrMap.TEXCOORD_0, 2, 'TEXCOORD_0');

    // Extract indices
    const indices = new Uint32Array(numFaces * 3);
    const face = new DracoModule.DracoInt32Array();
    for (let i = 0; i < numFaces; i++) {
      decoder.GetFaceFromMesh(dracoMesh, i, face);
      indices[i * 3] = face.GetValue(0);
      indices[i * 3 + 1] = face.GetValue(1);
      indices[i * 3 + 2] = face.GetValue(2);
    }
    DracoModule.destroy(face);

    result = { positions, normals, uvs, indices };
  } finally {
    if (dracoMesh) DracoModule.destroy(dracoMesh);
    DracoModule.destroy(buffer);
    DracoModule.destroy(decoder);
  }

  return result;
};
