/**
 * TerrainChunkBuilder.js - Distributed Mesh Generation System
 * 
 * Builds terrain meshes incrementally across multiple frames to prevent
 * stuttering during LOD transitions. Uses JavaScript generators to yield
 * control back to the main thread after processing a configurable number
 * of vertices.
 */

import { PLANET_RADIUS } from '../config/index.js';

const DEFAULT_VERTICES_PER_FRAME = 8192; // ~13 chunks at 25x25 resolution per frame

/**
 * createTerrainChunkBuilder
 * @param {Object} pool - The chunk pool for acquiring/releasing meshes
 * @param {Function} heightSampler - Function(sphereNormal) => height in km
 * @param {GPUBuffer} megaBuffer - Global storage buffer for vertices
 * @param {number} verticesPerFrame - Max vertices to process per frame
 * @returns {Object} TerrainChunkBuilder instance
 */
export const createTerrainChunkBuilder = (pool, heightSampler, megaBuffer, verticesPerFrame = DEFAULT_VERTICES_PER_FRAME) => {
  const _pool = pool;
  const _heightSampler = heightSampler;
  const _megaBuffer = megaBuffer;
  const _verticesPerFrame = verticesPerFrame;
  
  // Build queue - quads waiting to be built
  let buildQueue = [];
  const queuedIds = new Set();
  
  // Currently building generator
  let activeGenerator = null;
  let activeMesh = null;
  let activeQuadNode = null;
  
  // Completed meshes waiting for atomic swap
  const pendingMeshes = new Map();
  
  // Quads that should be removed in next swap
  const pendingRemoves = new Set();
  
  // Warning throttling
  let _lastExhaustionWarning = 0;
  
  // Statistics
  const stats = {
    verticesBuiltThisFrame: 0,
    chunksQueued: 0,
    chunksBuilding: 0,
    chunksPending: 0,
    totalBuilt: 0,
  };

  const _generateQuadId = (quadNode) => {
    return `${quadNode.faceIndex}_${quadNode.x.toFixed(6)}_${quadNode.y.toFixed(6)}_${quadNode.level}`;
  };

  const _distanceToCamera = (quadNode, cameraPos) => {
    const center = quadNode.getWorldCenter();
    const dx = center[0] - cameraPos[0];
    const dy = center[1] - cameraPos[1];
    const dz = center[2] - cameraPos[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  const _findPossibleChildrenInPool = (quad) => {
    const childrenIds = [];
    const nextLevel = quad.level + 1;
    const halfSize = quad.size / 2;
    const face = quad.faceIndex;
    
    const candidates = [
      `${face}_${quad.x.toFixed(6)}_${quad.y.toFixed(6)}_${nextLevel}`,
      `${face}_${(quad.x + halfSize).toFixed(6)}_${quad.y.toFixed(6)}_${nextLevel}`,
      `${face}_${quad.x.toFixed(6)}_${(quad.y + halfSize).toFixed(6)}_${nextLevel}`,
      `${face}_${(quad.x + halfSize).toFixed(6)}_${(quad.y + halfSize).toFixed(6)}_${nextLevel}`
    ];
    
    for (const id of candidates) {
      if (_pool.has(id) || pendingMeshes.has(id)) {
        childrenIds.push(id);
      }
    }
    return childrenIds;
  };

  const updateDesiredQuads = (desiredQuads, cameraPos) => {
    const desiredIds = new Set(desiredQuads.map(q => q.id || _generateQuadId(q)));
    const finalDesiredIds = new Set(desiredIds);
    
    for (const quad of desiredQuads) {
      if (quad.parent) {
        const parentId = quad.parent.id || _generateQuadId(quad.parent);
        if (_pool.has(parentId) || pendingMeshes.has(parentId)) {
          const siblings = quad.parent.children || [];
          let allSiblingsReady = (siblings.length === 4);
          
          for (const sib of siblings) {
            const sibId = sib.id || _generateQuadId(sib);
            if (!_pool.has(sibId) && !pendingMeshes.has(sibId)) {
              allSiblingsReady = false;
              break;
            }
          }
          
          if (!allSiblingsReady) {
            finalDesiredIds.add(parentId);
          }
        }
      }
    }
    
    for (const quad of desiredQuads) {
      const quadId = quad.id || _generateQuadId(quad);
      if (!_pool.has(quadId) && !pendingMeshes.has(quadId)) {
        const children = _findPossibleChildrenInPool(quad);
        for (const childId of children) {
          finalDesiredIds.add(childId);
        }
      }
    }

    for (const quadId of _pool.getActiveIds()) {
      if (!finalDesiredIds.has(quadId) && !pendingRemoves.has(quadId)) {
        pendingRemoves.add(quadId);
      }
    }
    
    for (const quadId of finalDesiredIds) {
      pendingRemoves.delete(quadId);
    }
    
    if (buildQueue.length > 0) {
      buildQueue = buildQueue.filter(q => {
        const id = q.id || _generateQuadId(q);
        return desiredIds.has(id);
      });
      queuedIds.clear();
      for (const q of buildQueue) {
        queuedIds.add(q.id || _generateQuadId(q));
      }
    }
    
    const needsBuild = [];
    for (let i = 0; i < desiredQuads.length; i++) {
      const quad = desiredQuads[i];
      const quadId = quad.id || _generateQuadId(quad);
      
      if (_pool.has(quadId) || pendingMeshes.has(quadId) || queuedIds.has(quadId)) {
        continue;
      }
      
      if (activeQuadNode && (activeQuadNode.id || _generateQuadId(activeQuadNode)) === quadId) {
        continue;
      }
      
      needsBuild.push(quad);
      queuedIds.add(quadId);
    }
    
    if (needsBuild.length > 0) {
      buildQueue.push(...needsBuild);
      buildQueue.sort((a, b) => {
        const distA = _distanceToCamera(a, cameraPos);
        const distB = _distanceToCamera(b, cameraPos);
        return distA - distB;
      });
    }

    if (activeQuadNode) {
        const activeId = activeQuadNode.id || _generateQuadId(activeQuadNode);
        if (!desiredIds.has(activeId)) {
            if (activeMesh) {
                _pool.release(activeId);
            }
            activeGenerator = null;
            activeMesh = null;
            activeQuadNode = null;
            stats.chunksBuilding = 0;
        }
    }
    
    stats.chunksQueued = buildQueue.length;
  };

  function* _buildMeshGenerator(mesh, quadNode) {
    mesh.generate(quadNode, _heightSampler, _megaBuffer, PLANET_RADIUS);
    yield;
  }

  const processFrame = () => {
    stats.verticesBuiltThisFrame = 0;
    let workDone = false;
    
    while (stats.verticesBuiltThisFrame < _verticesPerFrame) {
      if (!activeGenerator) {
        if (buildQueue.length === 0) break;
        
        const quadNode = buildQueue.shift();
        const quadId = quadNode.id || _generateQuadId(quadNode);
        queuedIds.delete(quadId);
        
        const mesh = _pool.acquire(quadId);
        if (!mesh) {
          const now = performance.now();
          if (now - _lastExhaustionWarning > 5000) {
            console.warn('[TerrainChunkBuilder] Pool exhausted, stopping build process for this frame');
            _lastExhaustionWarning = now;
          }
          buildQueue.unshift(quadNode);
          queuedIds.add(quadId);
          break; 
        }
        
        activeGenerator = _buildMeshGenerator(mesh, quadNode);
        activeMesh = mesh;
        activeQuadNode = quadNode;
        stats.chunksBuilding = 1;
      }
      
      const result = activeGenerator.next();
      workDone = true;
      
      if (result.done) {
        const quadId = activeMesh.quadId;
        pendingMeshes.set(quadId, activeMesh);
        _pool.active.delete(quadId);
        
        activeGenerator = null;
        activeMesh = null;
        activeQuadNode = null;
        stats.chunksBuilding = 0;
        stats.totalBuilt++;
      }
    }
    
    stats.chunksQueued = buildQueue.length;
    stats.chunksPending = pendingMeshes.size;
    
    return workDone;
  };

  const commit = () => {
    const added = [];
    const removed = [];
    
    for (const quadId of pendingRemoves) {
      if (_pool.has(quadId)) {
        _pool.release(quadId);
        removed.push(quadId);
      }
      if (pendingMeshes.has(quadId)) {
        const mesh = pendingMeshes.get(quadId);
        mesh.reset();
        _pool.available.push(mesh);
        pendingMeshes.delete(quadId);
      }
    }
    pendingRemoves.clear();
    
    for (const [quadId, mesh] of pendingMeshes) {
      _pool.active.set(quadId, mesh);
      added.push(quadId);
    }
    pendingMeshes.clear();
    
    stats.chunksPending = 0;
    
    return { added, removed };
  };

  const getStats = () => ({ ...stats });

  const clear = () => {
    buildQueue = [];
    queuedIds.clear();
    activeGenerator = null;
    activeMesh = null;
    activeQuadNode = null;
    
    for (const mesh of pendingMeshes.values()) {
      mesh.reset();
      _pool.available.push(mesh);
    }
    pendingMeshes.clear();
    pendingRemoves.clear();
    
    stats.chunksQueued = 0;
    stats.chunksBuilding = 0;
    stats.chunksPending = 0;
  };

  return {
    updateDesiredQuads, processFrame, commit, getStats, clear,
    get buildQueue() { return buildQueue; },
    get pendingMeshes() { return pendingMeshes; },
    get pendingRemoves() { return pendingRemoves; },
    get stats() { return stats; }
  };
};
