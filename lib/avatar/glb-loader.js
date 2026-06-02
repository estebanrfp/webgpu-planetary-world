/**
 * GLB/glTF Loader for WebGPU
 * Loads GLB files with skeletal animation support
 */

// ============================================
// QUATERNION UTILITIES
// ============================================

export const quatMultiply = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];

export const quatSlerp = (a, b, t) => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const b2 = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  dot = Math.abs(dot);

  if (dot > 0.9995) {
    const result = [
      a[0] + t * (b2[0] - a[0]),
      a[1] + t * (b2[1] - a[1]),
      a[2] + t * (b2[2] - a[2]),
      a[3] + t * (b2[3] - a[3])
    ];
    const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
    return result.map(v => v / len);
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;

  return [
    wa * a[0] + wb * b2[0],
    wa * a[1] + wb * b2[1],
    wa * a[2] + wb * b2[2],
    wa * a[3] + wb * b2[3]
  ];
};

export const vec3Lerp = (a, b, t) => [
  a[0] + t * (b[0] - a[0]),
  a[1] + t * (b[1] - a[1]),
  a[2] + t * (b[2] - a[2])
];

/** Create matrix from TRS */
export const trsToMatrix = (t, r, s) => {
  const x = r[0], y = r[1], z = r[2], w = r[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ]);
};

export const mat4Multiply = (a, b) => {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[i] * b[j * 4] +
        a[i + 4] * b[j * 4 + 1] +
        a[i + 8] * b[j * 4 + 2] +
        a[i + 12] * b[j * 4 + 3];
    }
  }
  return out;
};

// ============================================
// GLB LOADER
// ============================================

/**
 * Load and parse a GLB file
 * @param {string} url - URL to the GLB file
 * @returns {Promise<{json: Object, bin: ArrayBuffer}>}
 */
export const loadGLB = async (url) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  // Parse GLB header
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error('Invalid GLB magic');

  const length = dataView.getUint32(8, true);

  // Parse chunks
  let offset = 12;
  let jsonChunk = null;
  let binChunk = null;

  while (offset < length) {
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    offset += 8;

    if (chunkType === 0x4E4F534A) { // JSON
      const jsonArray = new Uint8Array(buffer, offset, chunkLength);
      jsonChunk = JSON.parse(new TextDecoder().decode(jsonArray));
    } else if (chunkType === 0x004E4942) { // BIN
      binChunk = new ArrayBuffer(chunkLength);
      new Uint8Array(binChunk).set(new Uint8Array(buffer, offset, chunkLength));
    }
    offset += chunkLength;
  }

  return { json: jsonChunk, bin: binChunk };
};

/**
 * Load all scenes and nodes to get global transforms
 */
export const computeGlobalTransforms = (gltf) => {
    const nodeCount = gltf.nodes.length;
    const localTransforms = new Array(nodeCount);
    const globalTransforms = new Array(nodeCount);

    // 1. Calculate local transforms
    gltf.nodes.forEach((node, i) => {
        if (node.matrix) {
            localTransforms[i] = new Float32Array(node.matrix);
        } else {
            const t = node.translation || [0, 0, 0];
            const r = node.rotation || [0, 0, 0, 1];
            const s = node.scale || [1, 1, 1];
            localTransforms[i] = trsToMatrix(t, r, s);
        }
    });

    // 2. Traversal helper for global transforms
    const traverse = (nodeIdx, parentMat) => {
        let globalMat = localTransforms[nodeIdx];
        if (parentMat) {
            globalMat = mat4Multiply(parentMat, globalMat);
        }
        globalTransforms[nodeIdx] = globalMat;

        const node = gltf.nodes[nodeIdx];
        if (node.children) {
            node.children.forEach(childIdx => traverse(childIdx, globalMat));
        }
    };

    // 3. Process first scene
    const scene = gltf.scenes[gltf.scene || 0];
    if (scene && scene.nodes) {
        scene.nodes.forEach(nodeIdx => traverse(nodeIdx, null));
    }

    return globalTransforms;
};

/**
 * Load texture from GLB binary data.
 * Supports PNG/JPEG and KTX2 (via Basis Universal transcoder).
 * Handles KHR_texture_basisu extension for KTX2-embedded GLBs.
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - GLB binary chunk
 * @param {number} textureIndex - glTF texture index
 * @param {GPUDevice} device - WebGPU device
 * @returns {Promise<GPUTexture|null>}
 */
export const loadTextureFromGLB = async (gltf, bin, textureIndex, device) => {
  if (!gltf.textures || textureIndex >= gltf.textures.length) return null;

  const texture = gltf.textures[textureIndex];
  // KHR_texture_basisu stores source in extension (top-level source may be null)
  const imageIndex = texture.extensions?.KHR_texture_basisu?.source ?? texture.source;
  if (imageIndex == null || !gltf.images) return null;

  const image = gltf.images[imageIndex];
  if (!image || image.bufferView === undefined) return null;

  const bufferView = gltf.bufferViews[image.bufferView];
  const byteOffset = bufferView.byteOffset || 0;
  const byteLength = bufferView.byteLength;
  const imageData = new Uint8Array(bin, byteOffset, byteLength);

  // KTX2 path — transcode via Basis Universal
  if (image.mimeType === 'image/ktx2') {
    try {
      const { loadKTX2Texture } = await import('../textures/ktx2-loader.js');
      const blob = new Blob([imageData], { type: 'image/ktx2' });
      const url = URL.createObjectURL(blob);
      try {
        return await loadKTX2Texture(device, url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Failed to load KTX2 texture from GLB:', e);
      return null;
    }
  }

  // PNG/JPEG path
  const blob = new Blob([imageData], { type: image.mimeType || 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const bitmap = await createImageBitmap(blob);
    const gpuTexture = device.createTexture({
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: gpuTexture },
      [bitmap.width, bitmap.height]
    );

    return gpuTexture;
  } catch (e) {
    console.error('Failed to load texture:', e);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Extract mesh data from glTF (No transforms, used for skinned meshes/avatars).
 * Supports KHR_draco_mesh_compression for compressed geometry.
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - GLB binary chunk
 * @returns {Promise<Array>}
 */
export const extractMeshData = async (gltf, bin) => {
  const meshes = [];
  const dataView = new DataView(bin);
  const hasDraco = gltf.extensionsUsed?.includes('KHR_draco_mesh_compression');

  const getAccessorData = (accessorIndex, componentsPerElement) => {
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined) return null;
    const bufferView = gltf.bufferViews[accessor.bufferView];

    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const componentType = accessor.componentType;
    const normalized = accessor.normalized === true;

    let componentSize = 4;
    if (componentType === 5120 || componentType === 5121) componentSize = 1;
    else if (componentType === 5122 || componentType === 5123) componentSize = 2;
    else if (componentType === 5125 || componentType === 5126) componentSize = 4;

    const stride = bufferView.byteStride || (componentsPerElement * componentSize);
    const result = new Float32Array(count * componentsPerElement);

    for (let i = 0; i < count; i++) {
      const elementOffset = baseOffset + i * stride;
      for (let j = 0; j < componentsPerElement; j++) {
        const offset = elementOffset + j * componentSize;
        let value = 0;

        if (componentType === 5126) value = dataView.getFloat32(offset, true);
        else if (componentType === 5123) value = dataView.getUint16(offset, true);
        else if (componentType === 5122) value = dataView.getInt16(offset, true);
        else if (componentType === 5121) value = dataView.getUint8(offset);
        else if (componentType === 5120) value = dataView.getInt8(offset);
        else if (componentType === 5125) value = dataView.getUint32(offset, true);

        if (normalized) {
          if (componentType === 5123) value /= 65535.0;
          else if (componentType === 5122) value = Math.max(value / 32767.0, -1.0);
          else if (componentType === 5121) value /= 255.0;
          else if (componentType === 5120) value = Math.max(value / 127.0, -1.0);
        }
        result[i * componentsPerElement + j] = value;
      }
    }
    return result;
  };

  const getIndexData = (accessorIndex) => {
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined) return null;
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;

    const result = new Uint32Array(count);
    if (accessor.componentType === 5123) {
      for (let i = 0; i < count; i++) result[i] = dataView.getUint16(baseOffset + i * 2, true);
    } else if (accessor.componentType === 5125) {
      for (let i = 0; i < count; i++) result[i] = dataView.getUint32(baseOffset + i * 4, true);
    } else if (accessor.componentType === 5121) {
      for (let i = 0; i < count; i++) result[i] = dataView.getUint8(baseOffset + i);
    }
    return result;
  };

  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const dracoExt = hasDraco ? primitive.extensions?.KHR_draco_mesh_compression : null;

      let positions, normals, uvs, indices;

      if (dracoExt) {
        const { decodeDracoPrimitive } = await import('./draco-decoder.js');
        const decoded = await decodeDracoPrimitive(bin, gltf, dracoExt, primitive);
        ({ positions, normals, uvs, indices } = decoded);
      } else {
        if (primitive.attributes.POSITION === undefined) continue;
        positions = getAccessorData(primitive.attributes.POSITION, 3);
        normals = primitive.attributes.NORMAL !== undefined
          ? getAccessorData(primitive.attributes.NORMAL, 3) : null;
        uvs = primitive.attributes.TEXCOORD_0 !== undefined
          ? getAccessorData(primitive.attributes.TEXCOORD_0, 2) : null;
        indices = primitive.indices !== undefined
          ? getIndexData(primitive.indices) : null;
      }

      if (positions && positions.length > 0) {
        let baseColorTextureIndex = null;
        let baseColorFactor = [1, 1, 1, 1];

        if (primitive.material !== undefined && gltf.materials) {
          const material = gltf.materials[primitive.material];
          if (material.pbrMetallicRoughness) {
            const pbr = material.pbrMetallicRoughness;
            if (pbr.baseColorTexture) baseColorTextureIndex = pbr.baseColorTexture.index;
            if (pbr.baseColorFactor) baseColorFactor = pbr.baseColorFactor;
          }
        }

        meshes.push({ positions, normals, uvs, indices, baseColorTextureIndex, baseColorFactor });
      }
    }
  }

  return meshes;
};

/**
 * Extract mesh data with baked-in scene transforms (For static scene objects like vehicles).
 * Supports KHR_draco_mesh_compression for compressed geometry.
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - GLB binary chunk
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.skipColliders=false] - Skip nodes ending with '_collider'
 * @returns {Promise<Array>}
 */
export const extractSceneMeshData = async (gltf, bin, { skipColliders = false } = {}) => {
  const globalTransforms = computeGlobalTransforms(gltf);
  const meshes = [];
  const dataView = new DataView(bin);
  const hasDraco = gltf.extensionsUsed?.includes('KHR_draco_mesh_compression');

  const getAccessorData = (accessorIndex, componentsPerElement) => {
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined) return null;
    const bufferView = gltf.bufferViews[accessor.bufferView];

    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const componentType = accessor.componentType;
    const normalized = accessor.normalized === true;

    let componentSize = 4;
    if (componentType === 5120 || componentType === 5121) componentSize = 1;
    else if (componentType === 5122 || componentType === 5123) componentSize = 2;
    else if (componentType === 5125 || componentType === 5126) componentSize = 4;

    const stride = bufferView.byteStride || (componentsPerElement * componentSize);
    const result = new Float32Array(count * componentsPerElement);

    for (let i = 0; i < count; i++) {
      const elementOffset = baseOffset + i * stride;
      for (let j = 0; j < componentsPerElement; j++) {
        const offset = elementOffset + j * componentSize;
        let value = 0;

        if (componentType === 5126) value = dataView.getFloat32(offset, true);
        else if (componentType === 5123) value = dataView.getUint16(offset, true);
        else if (componentType === 5122) value = dataView.getInt16(offset, true);
        else if (componentType === 5121) value = dataView.getUint8(offset);
        else if (componentType === 5120) value = dataView.getInt8(offset);
        else if (componentType === 5125) value = dataView.getUint32(offset, true);

        if (normalized) {
          if (componentType === 5123) value /= 65535.0;
          else if (componentType === 5122) value = Math.max(value / 32767.0, -1.0);
          else if (componentType === 5121) value /= 255.0;
          else if (componentType === 5120) value = Math.max(value / 127.0, -1.0);
        }
        result[i * componentsPerElement + j] = value;
      }
    }
    return result;
  };

  const getIndexData = (accessorIndex) => {
    const accessor = gltf.accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined) return null;
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;

    const result = new Uint32Array(count);
    if (accessor.componentType === 5123) {
      for (let i = 0; i < count; i++) result[i] = dataView.getUint16(baseOffset + i * 2, true);
    } else if (accessor.componentType === 5125) {
      for (let i = 0; i < count; i++) result[i] = dataView.getUint32(baseOffset + i * 4, true);
    } else if (accessor.componentType === 5121) {
      for (let i = 0; i < count; i++) result[i] = dataView.getUint8(baseOffset + i);
    }
    return result;
  };

  // Bake world transform into raw positions/normals
  const bakeTransform = (rawPositions, rawNormals, mat) => {
    const positions = new Float32Array(rawPositions.length);
    for (let i = 0; i < rawPositions.length; i += 3) {
      const x = rawPositions[i], y = rawPositions[i + 1], z = rawPositions[i + 2];
      positions[i]     = x * mat[0] + y * mat[4] + z * mat[8]  + mat[12];
      positions[i + 1] = x * mat[1] + y * mat[5] + z * mat[9]  + mat[13];
      positions[i + 2] = x * mat[2] + y * mat[6] + z * mat[10] + mat[14];
    }

    let normals = null;
    if (rawNormals) {
      normals = new Float32Array(rawNormals.length);
      for (let i = 0; i < rawNormals.length; i += 3) {
        const x = rawNormals[i], y = rawNormals[i + 1], z = rawNormals[i + 2];
        normals[i]     = x * mat[0] + y * mat[4] + z * mat[8];
        normals[i + 1] = x * mat[1] + y * mat[5] + z * mat[9];
        normals[i + 2] = x * mat[2] + y * mat[6] + z * mat[10];
        const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
        if (len > 0) { normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len; }
      }
    }
    return { positions, normals };
  };

  for (let nodeIdx = 0; nodeIdx < gltf.nodes.length; nodeIdx++) {
    const node = gltf.nodes[nodeIdx];
    if (node.mesh === undefined) continue;
    if (skipColliders && node.name?.endsWith('_collider')) continue;

    const mesh = gltf.meshes[node.mesh];
    const mat = globalTransforms[nodeIdx] || new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    for (const primitive of mesh.primitives) {
      const dracoExt = hasDraco ? primitive.extensions?.KHR_draco_mesh_compression : null;

      let rawPositions, rawNormals, uvs, indices;

      if (dracoExt) {
        const { decodeDracoPrimitive } = await import('./draco-decoder.js');
        const decoded = await decodeDracoPrimitive(bin, gltf, dracoExt, primitive);
        rawPositions = decoded.positions;
        rawNormals = decoded.normals;
        uvs = decoded.uvs;
        indices = decoded.indices;
      } else {
        if (primitive.attributes.POSITION === undefined) continue;
        rawPositions = getAccessorData(primitive.attributes.POSITION, 3);
        if (!rawPositions) continue;
        rawNormals = primitive.attributes.NORMAL !== undefined
          ? getAccessorData(primitive.attributes.NORMAL, 3) : null;
        uvs = primitive.attributes.TEXCOORD_0 !== undefined
          ? getAccessorData(primitive.attributes.TEXCOORD_0, 2) : null;
        indices = primitive.indices !== undefined
          ? getIndexData(primitive.indices) : null;
      }

      if (!rawPositions || rawPositions.length === 0) continue;

      const { positions, normals } = bakeTransform(rawPositions, rawNormals, mat);

      let baseColorTextureIndex = null;
      let baseColorFactor = [1, 1, 1, 1];
      const materialIndex = primitive.material;  // Preserve material index for grouping
      if (primitive.material !== undefined && gltf.materials) {
        const material = gltf.materials[primitive.material];
        if (material.pbrMetallicRoughness) {
          const pbr = material.pbrMetallicRoughness;
          if (pbr.baseColorTexture) baseColorTextureIndex = pbr.baseColorTexture.index;
          if (pbr.baseColorFactor) baseColorFactor = pbr.baseColorFactor;
        }
      }

      meshes.push({ positions, normals, uvs, indices, baseColorTextureIndex, baseColorFactor, materialIndex });
    }
  }

  return meshes;
};

/**
 * Extract bounding cylinder from _collider nodes in a GLB.
 * Computes AABB of all collider positions with baked transforms, returns cylinder approximation.
 * @param {Object} gltf - Parsed glTF JSON
 * @param {ArrayBuffer} bin - GLB binary chunk
 * @returns {{ radius: number, height: number }|null} Cylinder approximation (model-space units)
 */
export const extractColliderBounds = (gltf, bin) => {
  if (!gltf.nodes) return null;
  const globalTransforms = computeGlobalTransforms(gltf);
  const dataView = new DataView(bin);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let found = false;

  for (let i = 0; i < gltf.nodes.length; i++) {
    const node = gltf.nodes[i];
    if (!node.name?.endsWith('_collider') || node.mesh === undefined) continue;
    found = true;

    const mesh = gltf.meshes[node.mesh];
    const mat = globalTransforms[i] || new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    for (const prim of mesh.primitives) {
      if (prim.attributes.POSITION === undefined) continue;
      const acc = gltf.accessors[prim.attributes.POSITION];
      if (!acc || acc.bufferView === undefined) continue;
      const bv = gltf.bufferViews[acc.bufferView];
      const baseOff = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = bv.byteStride || 12;

      for (let v = 0; v < acc.count; v++) {
        const off = baseOff + v * stride;
        const lx = dataView.getFloat32(off, true);
        const ly = dataView.getFloat32(off + 4, true);
        const lz = dataView.getFloat32(off + 8, true);
        // Bake global transform
        const wx = lx * mat[0] + ly * mat[4] + lz * mat[8]  + mat[12];
        const wy = lx * mat[1] + ly * mat[5] + lz * mat[9]  + mat[13];
        const wz = lx * mat[2] + ly * mat[6] + lz * mat[10] + mat[14];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      }
    }
  }

  if (!found) return null;
  return {
    radius: Math.max(maxX - minX, maxZ - minZ) * 0.5,
    height: maxY - minY,
  };
};

/**
 * Extract skeleton/skin data from glTF
 */
export const extractSkeleton = (gltf, bin) => {
  if (!gltf.skins || gltf.skins.length === 0) return null;

  const skin = gltf.skins[0];
  const joints = skin.joints;
  const jointNames = joints.map(idx => gltf.nodes[idx].name || `Joint_${idx}`);

  let inverseBindMatrices = null;
  if (skin.inverseBindMatrices !== undefined) {
    const accessor = gltf.accessors[skin.inverseBindMatrices];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const dataView = new DataView(bin);

    inverseBindMatrices = [];
    for (let i = 0; i < accessor.count; i++) {
      const mat = new Float32Array(16);
      for (let j = 0; j < 16; j++) {
        mat[j] = dataView.getFloat32(byteOffset + (i * 16 + j) * 4, true);
      }
      inverseBindMatrices.push(mat);
    }
  }

  const jointHierarchy = joints.map(idx => {
    const node = gltf.nodes[idx];
    return {
      name: node.name || `Joint_${idx}`,
      translation: node.translation || [0, 0, 0],
      rotation: node.rotation || [0, 0, 0, 1],
      scale: node.scale || [1, 1, 1],
      children: (node.children || []).map(childIdx => joints.indexOf(childIdx)).filter(i => i >= 0)
    };
  });

  return {
    joints: jointNames,
    inverseBindMatrices,
    hierarchy: jointHierarchy,
    jointCount: joints.length
  };
};

/**
 * Extract skinning weights from mesh primitives
 */
export const extractSkinningData = (gltf, bin) => {
  const dataView = new DataView(bin);
  const readFloat32 = (offset) => dataView.getFloat32(offset, true);
  const readUint8 = (offset) => dataView.getUint8(offset);
  const readUint16 = (offset) => dataView.getUint16(offset, true);

  const getAccessorDataTyped = (accessorIndex, componentsPerElement, readFunc, bytesPerComponent) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const stride = bufferView.byteStride || (componentsPerElement * bytesPerComponent);

    const result = [];
    for (let i = 0; i < count; i++) {
      const elementOffset = baseOffset + i * stride;
      const element = [];
      for (let j = 0; j < componentsPerElement; j++) {
        element.push(readFunc(elementOffset + j * bytesPerComponent));
      }
      result.push(element);
    }
    return result;
  };

  let allJoints = [];
  let allWeights = [];

  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.attributes.JOINTS_0 !== undefined) {
        const accessor = gltf.accessors[primitive.attributes.JOINTS_0];
        if (accessor.componentType === 5121) {
          allJoints.push(...getAccessorDataTyped(primitive.attributes.JOINTS_0, 4, readUint8, 1));
        } else if (accessor.componentType === 5123) {
          allJoints.push(...getAccessorDataTyped(primitive.attributes.JOINTS_0, 4, readUint16, 2));
        }
      }

      if (primitive.attributes.WEIGHTS_0 !== undefined) {
        const accessor = gltf.accessors[primitive.attributes.WEIGHTS_0];
        const bufferView = gltf.bufferViews[accessor.bufferView];
        const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
        const count = accessor.count;
        const stride = bufferView.byteStride || 16;

        for (let i = 0; i < count; i++) {
          const offset = baseOffset + i * stride;
          allWeights.push([
            readFloat32(offset),
            readFloat32(offset + 4),
            readFloat32(offset + 8),
            readFloat32(offset + 12)
          ]);
        }
      }
    }
  }

  return { joints: allJoints, weights: allWeights };
};

/**
 * Extract animations from glTF
 */
export const extractAnimations = (gltf, bin) => {
  if (!gltf.animations || gltf.animations.length === 0) return {};

  const dataView = new DataView(bin);
  const readFloat32 = (offset) => dataView.getFloat32(offset, true);

  const getFloatAccessor = (accessorIndex) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const baseOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;

    let components = 1;
    if (accessor.type === 'VEC3') components = 3;
    else if (accessor.type === 'VEC4') components = 4;

    const result = [];
    for (let i = 0; i < count; i++) {
      if (components === 1) {
        result.push(readFloat32(baseOffset + i * 4));
      } else {
        const vec = [];
        for (let j = 0; j < components; j++) {
          vec.push(readFloat32(baseOffset + (i * components + j) * 4));
        }
        result.push(vec);
      }
    }
    return result;
  };

  const animations = {};

  for (const anim of gltf.animations) {
    const name = anim.name || 'default';
    const tracks = [];

    for (const channel of anim.channels) {
      const sampler = anim.samplers[channel.sampler];
      const targetNode = channel.target.node;
      const targetPath = channel.target.path;

      const times = getFloatAccessor(sampler.input);
      const values = getFloatAccessor(sampler.output);
      const nodeName = gltf.nodes[targetNode]?.name || `Node_${targetNode}`;

      tracks.push({
        nodeName,
        property: targetPath,
        times,
        values,
        interpolation: sampler.interpolation || 'LINEAR'
      });
    }

    animations[name] = {
      name,
      tracks,
      duration: Math.max(...tracks.flatMap(t => t.times))
    };
  }

  return animations;
};

/**
 * Create interleaved vertex buffer for character with skinning data
 */
export const createCharacterBuffers = (meshData, skinningData) => {
  const allVertices = [];
  const allIndices = [];
  let indexOffset = 0;
  let globalVertexIndex = 0;

  for (const mesh of meshData) {
    const vertexCount = mesh.positions.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      // Position (3)
      allVertices.push(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]);

      // Normal (3)
      if (mesh.normals) {
        allVertices.push(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
      } else {
        allVertices.push(0, 1, 0);
      }

      // UV (2)
      if (mesh.uvs) {
        allVertices.push(mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]);
      } else {
        allVertices.push(0, 0);
      }

      // Joint indices (4)
      if (skinningData?.joints[globalVertexIndex]) {
        const joints = skinningData.joints[globalVertexIndex];
        allVertices.push(joints[0], joints[1], joints[2], joints[3]);
      } else {
        allVertices.push(0, 0, 0, 0);
      }

      // Weights (4)
      if (skinningData?.weights[globalVertexIndex]) {
        const weights = skinningData.weights[globalVertexIndex];
        allVertices.push(weights[0], weights[1], weights[2], weights[3]);
      } else {
        allVertices.push(1, 0, 0, 0);
      }

      // Color (3) — GLB avatars shade procedurally/textured and ignore this;
      // present only to share one vertex layout with voxel avatars.
      const bcf = mesh.baseColorFactor;
      allVertices.push(bcf?.[0] ?? 1, bcf?.[1] ?? 1, bcf?.[2] ?? 1);

      globalVertexIndex++;
    }

    if (mesh.indices) {
      for (const idx of mesh.indices) {
        allIndices.push(idx + indexOffset);
      }
    }

    indexOffset += vertexCount;
  }

  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices)
  };
};
