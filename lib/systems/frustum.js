/**
 * FrustumCuller.js - Frustum and Horizon Culling Utilities
 * 
 * Extracts frustum planes from view-projection matrix and provides
 * culling tests for terrain mesh visibility optimization.
 */

import { EARTH_RADIUS, QUADTREE_CONFIG } from '../config/index.js';

/**
 * Extract 6 frustum planes from a column-major view-projection matrix
 * Each plane is [nx, ny, nz, d] where nx*x + ny*y + nz*z + d = 0
 * @param {Float32Array} vp - 4x4 view-projection matrix (column-major)
 * @returns {number[][]} Array of 6 planes: [left, right, bottom, top, near, far]
 */
export const extractFrustumPlanes = (vp) => {
  // Column-major access: vp[col * 4 + row]
  // Row 0: vp[0], vp[4], vp[8], vp[12]
  // Row 1: vp[1], vp[5], vp[9], vp[13]
  // Row 2: vp[2], vp[6], vp[10], vp[14]
  // Row 3: vp[3], vp[7], vp[11], vp[15]
  
  const planes = [];
  
  // Left: row3 + row0
  planes.push(normalizePlane([
    vp[3] + vp[0],
    vp[7] + vp[4],
    vp[11] + vp[8],
    vp[15] + vp[12]
  ]));
  
  // Right: row3 - row0
  planes.push(normalizePlane([
    vp[3] - vp[0],
    vp[7] - vp[4],
    vp[11] - vp[8],
    vp[15] - vp[12]
  ]));
  
  // Bottom: row3 + row1
  planes.push(normalizePlane([
    vp[3] + vp[1],
    vp[7] + vp[5],
    vp[11] + vp[9],
    vp[15] + vp[13]
  ]));
  
  // Top: row3 - row1
  planes.push(normalizePlane([
    vp[3] - vp[1],
    vp[7] - vp[5],
    vp[11] - vp[9],
    vp[15] - vp[13]
  ]));
  
  // Near: row2 (WebGPU: 0 <= z <= w)
  planes.push(normalizePlane([
    vp[2],
    vp[6],
    vp[10],
    vp[14]
  ]));
  
  // Far: row3 - row2
  planes.push(normalizePlane([
    vp[3] - vp[2],
    vp[7] - vp[6],
    vp[11] - vp[10],
    vp[15] - vp[14]
  ]));
  
  return planes;
};

/**
 * Normalize a plane so the normal has unit length
 * @param {number[]} plane - [nx, ny, nz, d]
 * @returns {number[]} Normalized plane
 */
const normalizePlane = (plane) => {
  const len = Math.sqrt(plane[0] * plane[0] + plane[1] * plane[1] + plane[2] * plane[2]);
  if (len < 1e-10) return [0, 0, 0, 0];
  return [plane[0] / len, plane[1] / len, plane[2] / len, plane[3] / len];
};

/**
 * Check if a mesh center is above the horizon (visible from camera)
 * Uses horizon culling - if the mesh is on the far side of the planet, cull it
 * @param {number[]} meshCenter - Mesh bounding sphere center [x, y, z]
 * @param {number[]} cameraPos - Camera position [x, y, z]
 * @param {number[]} planetCenter - Planet center [x, y, z]
 * @param {number} planetRadius - Planet radius in km
 * @param {number} meshRadius - Radius of the mesh bounding sphere in km
 * @returns {boolean} True if potentially visible (above horizon)
 */
export const isAboveHorizon = (meshCenter, cameraPos, planetCenter, planetRadius = EARTH_RADIUS, meshRadius = 0) => {
  // Vector from planet center to camera
  const camToPlanet = [
    cameraPos[0] - planetCenter[0],
    cameraPos[1] - planetCenter[1],
    cameraPos[2] - planetCenter[2]
  ];
  
  const camDist = Math.sqrt(
    camToPlanet[0] * camToPlanet[0] + 
    camToPlanet[1] * camToPlanet[1] + 
    camToPlanet[2] * camToPlanet[2]
  );
  
  // If camera is inside planet (shouldn't happen), show everything
  if (camDist < planetRadius) return true;
  
  // Vector from planet center to mesh center
  const meshToPlanet = [
    meshCenter[0] - planetCenter[0],
    meshCenter[1] - planetCenter[1],
    meshCenter[2] - planetCenter[2]
  ];
  
  // Horizon angle: angle at which the horizon appears from camera
  // cos(horizonAngle) = planetRadius / cameraDistance
  const horizonCos = planetRadius / camDist;
  
  // Angle between camera direction from planet center and mesh direction
  const camDirNorm = [
    camToPlanet[0] / camDist,
    camToPlanet[1] / camDist,
    camToPlanet[2] / camDist
  ];
  
  const meshDist = Math.sqrt(
    meshToPlanet[0] * meshToPlanet[0] + 
    meshToPlanet[1] * meshToPlanet[1] + 
    meshToPlanet[2] * meshToPlanet[2]
  );
  
  if (meshDist < 1e-10) return true;
  
  const meshDirNorm = [
    meshToPlanet[0] / meshDist,
    meshToPlanet[1] / meshDist,
    meshToPlanet[2] / meshDist
  ];
  
  // Dot product: how aligned is mesh with camera direction from planet center
  const dotProduct = 
    camDirNorm[0] * meshDirNorm[0] + 
    camDirNorm[1] * meshDirNorm[1] + 
    camDirNorm[2] * meshDirNorm[2];
  
  // Mathematically accurate Horizon Culling:
  // A point on the sphere surface is visible if dot(pos, cam) > R/D
  // If dot(pos, cam) < R/D, it is behind the horizon.
  // 
  // ADAPTIVE MARGIN: At high altitude, horizonCos is close to 0 (horizon covers ~half the planet),
  // so we need a larger margin to avoid culling visible quads near the edges.
  // At low altitude, horizonCos approaches 1, so smaller margin is fine.
  const altitudeRatio = camDist / planetRadius; // 1.0 at surface, ~3 at 12000km
  const baseMargin = QUADTREE_CONFIG.HORIZON_BASE_MARGIN + QUADTREE_CONFIG.HORIZON_ALTITUDE_SCALE * Math.max(0, altitudeRatio - 1); 
  
  // Radius-aware margin: If the mesh has a large radius, it can "peek" over the horizon
  // even if its center is below.
  const radiusMargin = meshRadius / planetRadius;
  const margin = baseMargin + radiusMargin;
  
  return dotProduct > (horizonCos - margin);
};

/**
 * createFrustumCuller - Factory for managing culling state per frame
 * @returns {Object} FrustumCuller instance
 */
export const createFrustumCuller = () => {
  let planes = null;
  let cameraPos = [0, 0, 0];
  let planetCenter = [0, 0, 0];
  let earthCenterOffset = [0, 0, 0];
  let horizonCullingEnabled = true;
  let frustumCullingEnabled = true;

  /**
   * Update frustum planes from view-projection matrix
   * Call this once per frame before culling tests
   * @param {Float32Array} viewProjection - 4x4 VP matrix
   * @param {number[]} newCameraPos - Camera position
   * @param {number[]} newEarthCenterOffset - (planetCenter - cameraPos)
   */
  const update = (viewProjection, newCameraPos, newEarthCenterOffset) => {
    planes = extractFrustumPlanes(viewProjection);
    cameraPos = newCameraPos;
    earthCenterOffset = newEarthCenterOffset;
    planetCenter = [
      cameraPos[0] + earthCenterOffset[0],
      cameraPos[1] + earthCenterOffset[1],
      cameraPos[2] + earthCenterOffset[2]
    ];
  };

  return {
    update,
    get planes() { return planes; },
    get cameraPos() { return cameraPos; },
    get planetCenter() { return planetCenter; },
    get earthCenterOffset() { return earthCenterOffset; },
    get horizonCullingEnabled() { return horizonCullingEnabled; },
    set horizonCullingEnabled(val) { horizonCullingEnabled = val; },
    get frustumCullingEnabled() { return frustumCullingEnabled; },
    set frustumCullingEnabled(val) { frustumCullingEnabled = val; }
  };
};
