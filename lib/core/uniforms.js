/**
 * uniforms.js - Atmosphere Uniform Buffer Management
 * 
 * Handles packing and updating uniform data for atmospheric rendering.
 * Extracted from mainPlanet.js for better organization.
 */

import { 
  EARTH_CENTER, 
  EARTH_RADIUS, 
  SCENE_OBJECTS 
} from '../config/index.js';

// ============================================================
// UNIFORM BUFFER LAYOUT
// ============================================================
// 72 floats = 288 bytes
// Layout:
//   0-15:  view_from_clip (mat4x4)
//   16-31: model_from_view (mat4x4)
//   32-35: camera_exposure (altitude, radius, discriminant, exposure)
//   36-39: sun_direction_size
//   40-43: white_point_size
//   44-47: earth_center (offset from camera)
//   48-51: extra_data (maxLevel, camera nadir xyz)
//   52-55: _reserved0 (struct alignment)
//   56-59: avatar_sphere (offset xyz, radius)
//   60-63: projection_params (near, far, M10, M14)
//   64-67: cloud_params (coverage, storm, altitude, thickness)
//   68-71: time_data (time, cloudSpeed, reserved, reserved)

const viewFromClip = new Float32Array(16);
const modelFromView = new Float32Array(16);
const uniformScratch = new Float32Array(72);

/**
 * Copy matrix from row-major to column-major order
 */
const copyRowMajorToColumnMajor = (target, offset, source) => {
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      target[offset + column * 4 + row] = source[row * 4 + column];
    }
  }
};

/**
 * Normalize a 3D vector
 */
const normalize = (v) => {
  const l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return l > 0 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 1];
};

/**
 * Multiply two 4x4 matrices
 */
const multiplyMatrices = (a, b) => {
  const result = new Float32Array(16);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i + k * 4] * b[k + j * 4];
      }
      result[i + j * 4] = sum;
    }
  }
  return result;
};

/**
 * Updates atmosphere uniforms for rendering
 * 
 * @param {HTMLCanvasElement} canvas - Render target
 * @param {Object} cam - Camera state with position, right, up, backward
 * @param {Object} env - Environment state (sun, exposure, clouds)
 * @param {number} terrainDebugMode - Debug visualization mode
 * @param {number} debugGridFlags - Grid overlay flags
 * @param {number} maxLevel - Current max LOD level
 * @param {number[]} meshPosition - Avatar mesh position [x,y,z]
 * @param {number} time - Current time for animations
 * @returns {Object} Uniform data and computed values
 */
export const updateAtmosphereUniforms = (
  canvas, cam, env,
  terrainDebugMode = 0, debugGridFlags = 0, maxLevel = 0,
  meshPosition = [0, 0, 0], time = 0,
  bypassFlags = 0
) => {
  const kFovY = (50 / 180) * Math.PI;
  const kTanFovY = Math.tan(kFovY / 2);
  const aspect = canvas.width / canvas.height;
  
  const near = 0.0005;  // 50 centimeters - balance between close terrain and depth precision
  const far = 100000.0; // FIX: Increased to 100,000 km for deep space viewing
  
  viewFromClip.set([
    kTanFovY * aspect, 0, 0, 0,
    0, kTanFovY, 0, 0,
    0, 0, 0, -1,
    0, 0, 1, 1,
  ]);

  const camX = cam.position[0];
  const camY = cam.position[1];
  const camZ = cam.position[2];
  
  const xAxis = cam.right;
  const yAxis = cam.up;
  const zAxis = cam.backward;

  modelFromView.set([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    0, 0, 0, 1,
  ]);

  const camera = [camX, camY, camZ];
  // Sun direction comes from the WorldClock as a ready-made vector in the
  // avatar's local frame — no axis-convention round-trip through angles.
  const sunDir = env.sunDir ?? [0, 1, 0];
  const SUN_ANGULAR_RADIUS = 0.00935 / 2.0;
  const sunSize = [Math.tan(SUN_ANGULAR_RADIUS), Math.cos(SUN_ANGULAR_RADIUS)];
  const whitePoint = [1, 1, 1];

  copyRowMajorToColumnMajor(uniformScratch, 0, viewFromClip);
  copyRowMajorToColumnMajor(uniformScratch, 16, modelFromView);
  
  // Camera altitude and radius with Float64 precision
  const dx = camera[0] - EARTH_CENTER[0];
  const dy = camera[1] - EARTH_CENTER[1];
  const dz = camera[2] - EARTH_CENTER[2];
  const cameraRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const cameraAltitude = cameraRadius - EARTH_RADIUS;
  const discriminantBase = -cameraAltitude * (2 * EARTH_RADIUS + cameraAltitude);
  
  uniformScratch.set([cameraAltitude, cameraRadius, discriminantBase, env.exposure], 32);
  uniformScratch.set([sunDir[0], sunDir[1], sunDir[2], sunSize[0]], 36);
  
  const encodedW = debugGridFlags + sunSize[1];
  uniformScratch.set([whitePoint[0], whitePoint[1], whitePoint[2], encodedW], 40);
  
  const earthCenterOffset = [
    EARTH_CENTER[0] - camera[0],
    EARTH_CENTER[1] - camera[1],
    EARTH_CENTER[2] - camera[2]
  ];
  // earthCenter.w encodes: terrainDebugMode + bypassFlags * 100 (so the int is safely
  // recoverable as integer arithmetic on both shader sides; see uiConfig.BYPASS_FLAGS).
  const encodedTerrainMode = terrainDebugMode + bypassFlags * 100;
  uniformScratch.set([earthCenterOffset[0], earthCenterOffset[1], earthCenterOffset[2], encodedTerrainMode], 44);
  
  const cameraNadir = normalize([
    camera[0] - EARTH_CENTER[0],
    camera[1] - EARTH_CENTER[1],
    camera[2] - EARTH_CENTER[2]
  ]);
  uniformScratch.set([maxLevel, cameraNadir[0], cameraNadir[1], cameraNadir[2]], 48);

  const nf = 1 / (near - far);
  const m10 = (far + near) * nf;
  const m14 = 2 * far * near * nf;
  uniformScratch.set([near, far, m10, m14], 60);

  const effectiveCoverage = env.cloudsEnabled ? env.cloudCoverage : 0.0;
  uniformScratch.set([effectiveCoverage, env.cloudStorm, 330.0, 1.5], 64);
  uniformScratch.set([time, env.cloudSpeed || 1.0, env.cloudMaxAltitude || 500.0, 0.0], 68);

  // Reserved slot for struct alignment (no longer used)
  uniformScratch.set([0, 0, 0, 0], 52);
  
  const meshOffset = [
    meshPosition[0] - camera[0],
    meshPosition[1] - camera[1],
    meshPosition[2] - camera[2]
  ];
  const avatarLocalUp = normalize([
    meshPosition[0] - EARTH_CENTER[0],
    meshPosition[1] - EARTH_CENTER[1],
    meshPosition[2] - EARTH_CENTER[2]
  ]);
  const avatarRadius = SCENE_OBJECTS.avatar.radius;
  const avatarHeight = SCENE_OBJECTS.avatar.height || 0.002;
  const avatarLift = (avatarHeight / 2) + 0.0005;
  const avatarOffset = [
    meshOffset[0] + avatarLocalUp[0] * avatarLift,
    meshOffset[1] + avatarLocalUp[1] * avatarLift,
    meshOffset[2] + avatarLocalUp[2] * avatarLift
  ];
  uniformScratch.set([
    avatarOffset[0], avatarOffset[1], avatarOffset[2],
    avatarRadius
  ], 56);

  // View-projection matrix
  const viewMatrix = new Float32Array([
    xAxis[0], xAxis[1], xAxis[2], 0,
    yAxis[0], yAxis[1], yAxis[2], 0,
    zAxis[0], zAxis[1], zAxis[2], 0,
    0, 0, 0, 1,
  ]);
  
  const f = 1.0 / kTanFovY;
  const projMatrix = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, near / (far - near), (far * near) / (far - near),
    0, 0, -1, 0,
  ]);
  
  const viewProj = multiplyMatrices(projMatrix, viewMatrix);
  
  const reservedData = [0, 0, 0, 0];  // Struct alignment only
  const avatarSphereData = [
    avatarOffset[0], avatarOffset[1], avatarOffset[2],
    avatarRadius
  ];

  return { uniformData: uniformScratch, camera, sunDir, viewProj, reservedData, avatarSphereData };
};
