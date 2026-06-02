/**
 * createTerrainMesh - Generates geometric terrain meshes for quadtree nodes
 * 
 * Each mesh is a 25x25 grid of vertices (24×24 quads/cells) displaced by heightmap values.
 * Designed for object pooling - can be reset and reused.
 * 
 * @param {GPUDevice} device - WebGPU device
 * @param {number} poolIndex - Fixed index in the global pool
 * @param {number} resolution - Grid resolution (vertices per side)
 * @returns {Object} TerrainMesh instance
 */

import { PLANET_RADIUS } from '../config/index.js';

export const createTerrainMesh = (device, poolIndex, resolution = 25) => {
  let _device = device;
  const _poolIndex = poolIndex;
  const _resolution = resolution;
  
  // State
  let isGenerated = false;
  let quadId = null;
  
  // LOD and culling data
  let lodLevel = 0;
  let faceIndex = 0;
  let worldSize = 0;
  
  // Bounding sphere for frustum culling
  const boundingSphere = { center: [0, 0, 0], radius: 0 };

  // Quad mapping for GPU projection
  let quadX = 0;
  let quadY = 0;
  let quadSize = 0;
  let checkerIndex = 0;
  let midLen = 1.0;
  let meshCenter = [0, 0, 0];
  
  // Calculate buffer sizes
  const vertexCount = resolution * resolution;
  const indexCount = (resolution - 1) * (resolution - 1) * 6;

  const _uvToSphere = (u, v, face) => {
    const cu = u * 2 - 1;
    const cv = v * 2 - 1;
    let x, y, z;
    switch (face) {
      case 0: x = 1;  y = cv; z = -cu; break;
      case 1: x = -1; y = cv; z = cu;  break;
      case 2: x = cu; y = 1;  z = -cv; break;
      case 3: x = cu; y = -1; z = cv;  break;
      case 4: x = cu; y = cv; z = 1;   break;
      case 5: x = -cu; y = cv; z = -1; break;
      default: x = 0; y = 1; z = 0;
    }
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  };


  const generate = (quadNode, heightSampler, megaBuffer, planetRadius = PLANET_RADIUS) => {
    const res = _resolution;
    const vertices = new Float32Array(vertexCount * 5); // Reduced from 11
    
    const { x, y, size, faceIndex: fi, level } = quadNode;
    quadX = x;
    quadY = y;
    quadSize = size;
    const faceNormal = quadNode.faceNormal;
    const faceUp = quadNode.faceUp;
    const faceRight = quadNode.faceRight;
    
    lodLevel = level;
    faceIndex = fi;
    worldSize = quadNode.getWorldSize();
    checkerIndex = quadNode.checkerIndex ?? 0;
    
    const midU = x + size * 0.5;
    const midV = y + size * 0.5;
    const midCube = [
      faceNormal[0] + faceRight[0] * midU + faceUp[0] * midV,
      faceNormal[1] + faceRight[1] * midU + faceUp[1] * midV,
      faceNormal[2] + faceRight[2] * midU + faceUp[2] * midV
    ];
    midLen = Math.sqrt(midCube[0] ** 2 + midCube[1] ** 2 + midCube[2] ** 2);
    meshCenter = [
      (midCube[0] / midLen) * planetRadius, 
      (midCube[1] / midLen) * planetRadius, 
      (midCube[2] / midLen) * planetRadius
    ];
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    let vertIdx = 0;
    const VERT_STRIDE = 5;
    
    for (let gy = 0; gy < res; gy++) {
      for (let gx = 0; gx < res; gx++) {
        const t = gx / (res - 1);
        const s = gy / (res - 1);
        const cubeU = x + t * size;
        const cubeV = y + s * size;
        const cubePos = [
          faceNormal[0] + faceRight[0] * cubeU + faceUp[0] * cubeV,
          faceNormal[1] + faceRight[1] * cubeU + faceUp[1] * cubeV,
          faceNormal[2] + faceRight[2] * cubeU + faceUp[2] * cubeV
        ];
        const len = Math.sqrt(cubePos[0] ** 2 + cubePos[1] ** 2 + cubePos[2] ** 2);
        const sphereNormal = [cubePos[0] / len, cubePos[1] / len, cubePos[2] / len];
        const radius = planetRadius;
        const position = [
          (sphereNormal[0] * radius) - meshCenter[0],
          (sphereNormal[1] * radius) - meshCenter[1],
          (sphereNormal[2] * radius) - meshCenter[2]
        ];
        
        const absPos = [sphereNormal[0] * radius, sphereNormal[1] * radius, sphereNormal[2] * radius];
        minX = Math.min(minX, absPos[0]);
        minY = Math.min(minY, absPos[1]);
        minZ = Math.min(minZ, absPos[2]);
        maxX = Math.max(maxX, absPos[0]);
        maxY = Math.max(maxY, absPos[1]);
        maxZ = Math.max(maxZ, absPos[2]);
        
        vertices[vertIdx] = position[0];
        vertices[vertIdx + 1] = position[1];
        vertices[vertIdx + 2] = position[2];
        vertices[vertIdx + 3] = t;
        vertices[vertIdx + 4] = s;
        vertIdx += VERT_STRIDE;
      }
    }
    
    boundingSphere.center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    boundingSphere.radius = (Math.sqrt(dx * dx + dy * dy + dz * dz) / 2) + 10.0; 
    
    
    const byteStride = 5 * 4;
    const slotOffset = _poolIndex * vertexCount * byteStride;
    _device.queue.writeBuffer(megaBuffer, slotOffset, vertices);
    
    isGenerated = true;
    quadId = quadNode.id || `${fi}_${x}_${y}_${level}`;
  };
  
  const reset = () => {
    isGenerated = false;
    quadId = null;
    lodLevel = 0;
    faceIndex = 0;
    worldSize = 0;
    boundingSphere.center = [0, 0, 0];
    boundingSphere.radius = 0;
  };
  
  const destroy = () => {
    isGenerated = false;
    _device = null;
  };

  return {
    generate, reset, destroy,
    get device() { return _device; },
    get poolIndex() { return _poolIndex; },
    get resolution() { return _resolution; },
    get isGenerated() { return isGenerated; },
    set isGenerated(v) { isGenerated = v; },
    get quadId() { return quadId; },
    set quadId(v) { quadId = v; },
    get lodLevel() { return lodLevel; },
    set lodLevel(v) { lodLevel = v; },
    get faceIndex() { return faceIndex; },
    set faceIndex(v) { faceIndex = v; },
    get worldSize() { return worldSize; },
    set worldSize(v) { worldSize = v; },
    get boundingSphere() { return boundingSphere; },
    get quadX() { return quadX; },
    set quadX(v) { quadX = v; },
    get quadY() { return quadY; },
    set quadY(v) { quadY = v; },
    get quadSize() { return quadSize; },
    set quadSize(v) { quadSize = v; },
    get checkerIndex() { return checkerIndex; },
    set checkerIndex(v) { checkerIndex = v; },
    get midLen() { return midLen; },
    set midLen(v) { midLen = v; },
    get meshCenter() { return meshCenter; },
    set meshCenter(v) { meshCenter = v; },
    get vertexCount() { return vertexCount; },
    get indexCount() { return indexCount; }
  };
};
