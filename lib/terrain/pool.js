/**
 * createTerrainChunkPool - Object Pool for Terrain Mesh Reuse
 * 
 * Manages a pool of TerrainMesh objects to prevent constant allocation/deallocation.
 * 
 * @param {GPUDevice} device - WebGPU device
 * @param {number} resolution - Grid resolution per chunk
 * @param {number} maxPoolSize - Maximum number of chunks
 * @param {number} initialSize - Initial pool size to pre-allocate
 * @returns {Object} TerrainChunkPool instance
 */

import { createTerrainMesh } from './mesh.js';

export const createTerrainChunkPool = (device, resolution = 25, maxPoolSize = 512, initialSize = 64) => {
  const _device = device;
  const _resolution = resolution;
  const _maxPoolSize = maxPoolSize;
  
  const available = [];
  const active = new Map();
  
  const stats = {
    totalCreated: 0,
    totalRecycled: 0,
    peakActive: 0,
  };

  const _preallocate = (count) => {
    const toCreate = Math.min(count, _maxPoolSize);
    
    for (let i = 0; i < toCreate; i++) {
      const mesh = createTerrainMesh(_device, stats.totalCreated, _resolution);
      available.push(mesh);
      stats.totalCreated++;
    }
    
    console.log(`[TerrainChunkPool] Pre-allocated ${toCreate} meshes`);
  };

  const acquire = (quadId) => {
    if (active.has(quadId)) {
      return active.get(quadId);
    }
    
    const totalCount = active.size + available.length;
    
    let mesh;
    
    if (available.length > 0) {
      mesh = available.pop();
      mesh.reset();
      stats.totalRecycled++;
    } else if (totalCount < _maxPoolSize) {
      mesh = createTerrainMesh(_device, stats.totalCreated, _resolution);
      stats.totalCreated++;
    } else {
      console.warn(`[TerrainChunkPool] At max capacity (${_maxPoolSize})`);
      return null;
    }
    
    mesh.quadId = quadId;
    active.set(quadId, mesh);
    
    stats.peakActive = Math.max(stats.peakActive, active.size);
    
    return mesh;
  };

  const release = (quadId) => {
    const mesh = active.get(quadId);
    if (!mesh) return;
    
    active.delete(quadId);
    mesh.reset();
    available.push(mesh);
  };

  const releaseMany = (quadIds) => {
    for (const quadId of quadIds) {
      release(quadId);
    }
  };

  const get = (quadId) => active.get(quadId);
  const has = (quadId) => active.has(quadId);
  const getActiveIds = () => Array.from(active.keys());
  const getActiveMeshes = () => Array.from(active.values());

  const getStats = () => ({
    activeCount: active.size,
    availableCount: available.length,
    totalCount: active.size + available.length,
    maxPoolSize: _maxPoolSize,
    totalCreated: stats.totalCreated,
    totalRecycled: stats.totalRecycled,
    peakActive: stats.peakActive,
    recycleRatio: stats.totalCreated > 0 
      ? (stats.totalRecycled / stats.totalCreated).toFixed(2) 
      : 0,
  });

  const destroy = () => {
    for (const mesh of active.values()) mesh.destroy();
    active.clear();
    
    for (const mesh of available) mesh.destroy();
    available.length = 0;
    
    console.log('[TerrainChunkPool] Destroyed all resources');
  };

  // Pre-allocate initial pool
  _preallocate(initialSize);

  return {
    acquire, release, releaseMany, get, has,
    getActiveIds, getActiveMeshes, getStats, destroy,
    get device() { return _device; },
    get resolution() { return _resolution; },
    get maxPoolSize() { return _maxPoolSize; },
    get active() { return active; },
    get available() { return available; },
    get stats() { return stats; }
  };
};
