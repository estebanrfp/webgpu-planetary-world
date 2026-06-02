/**
 * PlanetQuadtree.js - Proland-style Quadtree LOD System
 * 
 * Implements adaptive Level of Detail terrain rendering using a quadtree
 * structure on a cube-sphere projection.
 */

import { vec3 } from '../math/vector.js';
import { PLANET_RADIUS, QUADTREE_CONFIG } from '../config/index.js';

// ============================================================
// CONFIGURATION (from centralized config)
// ============================================================

const {
  MAX_LOD_LEVEL,
  SPLIT_FACTOR,
  HYSTERESIS_FACTOR,
  LOD_BASE_ELEVATION,
  LOD_RING_RADIUS,
  LOD_MAX_DISTANCE,
  HORIZON_GROUND_MARGIN,
  HORIZON_SPACE_MARGIN,
  HORIZON_TRANSITION_ALT,
} = QUADTREE_CONFIG;

// ============================================================
// CUBE FACES
// ============================================================

export const CUBE_FACES = [
  { id: 0, normal: [0, 0, 1],  up: [0, 1, 0],  right: [1, 0, 0]  },  // +Z (front)
  { id: 1, normal: [0, 0, -1], up: [0, 1, 0],  right: [-1, 0, 0] },  // -Z (back)
  { id: 2, normal: [1, 0, 0],  up: [0, 1, 0],  right: [0, 0, -1] },  // +X (right)
  { id: 3, normal: [-1, 0, 0], up: [0, 1, 0],  right: [0, 0, 1]  },  // -X (left)
  { id: 4, normal: [0, 1, 0],  up: [0, 0, -1], right: [1, 0, 0]  },  // +Y (top)
  { id: 5, normal: [0, -1, 0], up: [0, 0, 1],  right: [1, 0, 0]  },  // -Y (bottom)
];

// ============================================================
// HELPERS
// ============================================================

const calculateTargetLOD = (agl) => {
  if (agl <= 0) return MAX_LOD_LEVEL; 
  if (agl > LOD_MAX_DISTANCE) return 0;
  const level = Math.floor(Math.log2(LOD_BASE_ELEVATION / Math.max(0.0001, agl)));
  return Math.max(0, Math.min(MAX_LOD_LEVEL, level));
};

// ============================================================
// FACTORY: Create Quad Node
// ============================================================

export const createQuadNode = (faceIndex, x, y, size, level, parent = null) => {
  const face = CUBE_FACES[faceIndex];
  const faceNormal = face.normal;
  const faceUp = face.up;
  const faceRight = face.right;
  
  let children = null;
  let needsMesh = true;
  let meshReady = false;
  let _worldCenter = null;
  let _worldSize = null;
  
  const id = `${faceIndex}_${x.toFixed(6)}_${y.toFixed(6)}_${level}`;
  
  const node = {
    id,
    faceIndex,
    x, y, size,
    level,
    parent,
    faceNormal,
    faceUp,
    faceRight,
    
    get quadIndexX() {
      const divisionsPerAxis = Math.pow(2, level);
      return Math.floor((x + 1) / 2 * divisionsPerAxis);
    },
    get quadIndexY() {
      const divisionsPerAxis = Math.pow(2, level);
      return Math.floor((y + 1) / 2 * divisionsPerAxis);
    },
    get checkerIndex() {
      return (this.quadIndexX + this.quadIndexY + faceIndex) % 2;
    },
    
    get children() { return children; },
    set children(val) { children = val; },
    get needsMesh() { return needsMesh; },
    set needsMesh(val) { needsMesh = val; },
    get meshReady() { return meshReady; },
    set meshReady(val) { meshReady = val; },
    
    getWorldCenter: () => {
      if (_worldCenter) return _worldCenter;
      const centerU = x + size / 2;
      const centerV = y + size / 2;
      const cubePos = vec3.add(faceNormal, vec3.add(vec3.scale(faceRight, centerU), vec3.scale(faceUp, centerV)));
      const sphereNormal = vec3.normalize(cubePos);
      _worldCenter = vec3.scale(sphereNormal, PLANET_RADIUS);
      return _worldCenter;
    },
    
    getWorldSize: () => {
      if (_worldSize) return _worldSize;
      _worldSize = (size / 2) * Math.PI * PLANET_RADIUS;
      return _worldSize;
    },
    
    shouldSubdivide: (cameraPos, cameraAGL, radiusFactor = 1.0) => {
      const targetLOD = calculateTargetLOD(cameraAGL);
      const getPhysicalDepth = (visualLOD) => {
        if (visualLOD <= 10) return visualLOD;
        // /4 stretches each physical-depth bucket across 4 visual LODs
        // instead of 3 — depth ramps up later, so the densest mesh ring
        // only kicks in much closer to the ground.
        return 10 + Math.floor((visualLOD - 10) / 4);
      };

      const maxPhysicalDepth = 14;
      if (level >= maxPhysicalDepth) return false;

      const targetDepth = getPhysicalDepth(targetLOD);
      if (level >= targetDepth) return false;

      const cameraNorm = vec3.normalize(cameraPos);
      const quadCenter = node.getWorldCenter();
      const quadNorm = vec3.normalize(quadCenter);
      const dotProduct = vec3.dot(cameraNorm, quadNorm);
      const angularDist = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
      const nextLevelAngularSize = (Math.PI / 2) / Math.pow(2, level + 1);
      const dynamicRadius = LOD_RING_RADIUS + Math.min(cameraAGL / 10, 1.5);
      const splitRadius = dynamicRadius * nextLevelAngularSize * radiusFactor;

      return angularDist < splitRadius;
    },

    containsPoint: (sphereNormal) => {
      const dotNormal = vec3.dot(sphereNormal, faceNormal);
      if (dotNormal <= 0) return false;
      const dotRight = vec3.dot(sphereNormal, faceRight);
      const dotUp = vec3.dot(sphereNormal, faceUp);
      const u = dotRight / dotNormal;
      const v = dotUp / dotNormal;
      return u >= x && u < (x + size) && v >= y && v < (y + size);
    },

    subdivide: () => {
      if (children) return;
      if (level >= MAX_LOD_LEVEL) return;
      const halfSize = size / 2;
      const childLevel = level + 1;
      children = [
        createQuadNode(faceIndex, x, y, halfSize, childLevel, node),
        createQuadNode(faceIndex, x + halfSize, y, halfSize, childLevel, node),
        createQuadNode(faceIndex, x, y + halfSize, halfSize, childLevel, node),
        createQuadNode(faceIndex, x + halfSize, y + halfSize, halfSize, childLevel, node),
      ];
    },
    
    merge: () => {
      if (!children) return;
      children.forEach(child => child.merge());
      children = null;
      needsMesh = true;
      meshReady = false;
    },
    
    isLeaf: () => !children,
    
    setMeshReady: () => {
      meshReady = true;
      needsMesh = false;
    },
    
    isVisible: (cameraPos, cameraForward, cameraAGL) => {
      const worldCenter = node.getWorldCenter();
      const isValidAGL = cameraAGL !== undefined && !isNaN(cameraAGL) && cameraAGL >= 0;
      
      if (isValidAGL) {
        const cameraRad = vec3.length(cameraPos);
        if (cameraRad < PLANET_RADIUS * 0.9 || cameraRad > PLANET_RADIUS * 10) return true;
        
        const horizonCos = PLANET_RADIUS / cameraRad;
        const dotToCenter = vec3.dot(vec3.normalize(cameraPos), vec3.normalize(worldCenter));

        // Quad's angular radius on the sphere — prevents parent quads covering
        // large areas from being culled and removing entire subtrees of children
        const quadAngularRadius = node.getWorldSize() / PLANET_RADIUS;
        const altFactor = Math.min(1.0, cameraAGL / HORIZON_TRANSITION_ALT);
        const baseMargin = HORIZON_GROUND_MARGIN + (HORIZON_SPACE_MARGIN - HORIZON_GROUND_MARGIN) * altFactor;
        const margin = baseMargin + quadAngularRadius;

        if (dotToCenter < horizonCos - margin) return false;

      }

      if (!cameraForward) return true;
      const worldSize = node.getWorldSize();
      const toQuad = vec3.sub(worldCenter, cameraPos);
      const distance = vec3.length(toQuad);
      
      const NEAR_DISTANCE = QUADTREE_CONFIG.CULL_NEAR_LIMIT;
      const FAR_DISTANCE = QUADTREE_CONFIG.CULL_FAR_LIMIT;
      
      if (distance < worldSize * 3.0 + NEAR_DISTANCE) return true;
      
      const toQuadNorm = vec3.scale(toQuad, 1 / distance);
      const dotProduct = vec3.dot(toQuadNorm, cameraForward);
      const distFactor = Math.min(1.0, Math.max(0.0, (distance - NEAR_DISTANCE) / (FAR_DISTANCE - NEAR_DISTANCE)));
      const backConeThreshold = QUADTREE_CONFIG.BACK_CONE_THRESHOLD_JS + (QUADTREE_CONFIG.BACK_CONE_FAR_MULT * distFactor);
      
      return dotProduct > backConeThreshold;
    },
    
    getMorphFactor: (cameraPos) => {
      const worldCenter = node.getWorldCenter();
      const worldSize = node.getWorldSize();
      const distance = vec3.distance(cameraPos, worldCenter);
      const splitDist = worldSize * SPLIT_FACTOR;
      const mergeDist = splitDist * 1.3;
      if (distance <= splitDist) return 0;
      if (distance >= mergeDist) return 1;
      return (distance - splitDist) / (mergeDist - splitDist);
    },
  };
  
  return node;
};

// ============================================================
// FACTORY: Create Planet Quadtree
// ============================================================

export const createPlanetQuadtree = () => {
  const roots = CUBE_FACES.map((_, i) => createQuadNode(i, -1, -1, 2, 0, null));
  let visibleQuads = [];
  let stats = {
    totalQuads: 0,
    culledQuads: 0,
    maxLevel: 0,
    levelsCount: new Array(MAX_LOD_LEVEL + 1).fill(0),
    targetLOD: 0
  };
  
  let cullingEnabled = true;
  
  const countAllLeaves = (node) => {
    if (!node) return 0;
    if (node.isLeaf()) return 1;
    return node.children.reduce((sum, child) => sum + countAllLeaves(child), 0);
  };
  
  const updateNode = (node, cameraPos, cameraForward, cameraAGL) => {
    const wantsSubdivision = node.shouldSubdivide(cameraPos, cameraAGL);
    if (wantsSubdivision) {
      if (!node.children) node.subdivide();
      node.children?.forEach(child => updateNode(child, cameraPos, cameraForward, cameraAGL));
    } else if (node.children) {
      // Hysteresis: keep children until camera moves further than splitRadius * factor
      if (node.shouldSubdivide(cameraPos, cameraAGL, HYSTERESIS_FACTOR)) {
        node.children.forEach(child => updateNode(child, cameraPos, cameraForward, cameraAGL));
      } else {
        node.merge();
      }
    }
  };
  
  const collectLeaves = (node, cameraPos, cameraForward, cameraAGL) => {
    if (!node) return [];
    if (cullingEnabled && !node.isVisible(cameraPos, cameraForward, cameraAGL)) {
      stats.culledQuads += countAllLeaves(node);
      return [];
    }
    if (node.isLeaf()) {
      stats.totalQuads++;
      stats.maxLevel = Math.max(stats.maxLevel, node.level);
      if (node.level <= MAX_LOD_LEVEL) stats.levelsCount[node.level]++;
      return [node];
    }
    return node.children.flatMap(child => collectLeaves(child, cameraPos, cameraForward, cameraAGL));
  };
  
  return {
    update: (cameraPos, cameraForward = null, cameraAGL = 1000) => {
      stats.totalQuads = 0;
      stats.culledQuads = 0;
      stats.maxLevel = 0;
      stats.levelsCount.fill(0);
      stats.targetLOD = calculateTargetLOD(cameraAGL);
      roots.forEach(root => updateNode(root, cameraPos, cameraForward, cameraAGL));
      visibleQuads = roots.flatMap(node => collectLeaves(node, cameraPos, cameraForward, cameraAGL));
    },
    
    getVisibleQuads: () => visibleQuads,
    
    getStats: () => ({
      totalQuads: stats.totalQuads,
      culledQuads: stats.culledQuads,
      maxLevel: stats.targetLOD,
      physicalDepth: stats.maxLevel,
      levelsCount: [...stats.levelsCount],
    }),

    get roots() { return roots; },
    get visibleQuads() { return visibleQuads; },
    get stats() { return stats; },
    get cullingEnabled() { return cullingEnabled; },
    set cullingEnabled(val) { cullingEnabled = val; },
  };
};
