import { PLANET_RADIUS, ATMOSPHERE_CONFIG, LIGHTING_CONFIG, TERRAIN_LIMITS, TERRAIN_SCALES } from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

const { SOLAR_IRRADIANCE_BASE } = LIGHTING_CONFIG;
const vec3_SOLAR = `vec3f(${SOLAR_IRRADIANCE_BASE[0]}, ${SOLAR_IRRADIANCE_BASE[1]}, ${SOLAR_IRRADIANCE_BASE[2]})`;

/**
 * Triplanar cloud UV scales — auto-adjust with planet radius.
 *
 * Formula: configScale * 1000 / acos(R / (R + cloudAlt))
 *
 * This maps cloud layer scales from the config (designed for ~6360 km Earth)
 * to the visible angular dome of any planet radius. On a 795 km planet the
 * cloud dome subtends ~5.7°, so scales are amplified to fill the sky.
 *
 * Used by both the atmosphere sky shader and terrain cloud shadow shader.
 */
const _cloudR = PLANET_RADIUS + ATMOSPHERE_CONFIG.cloudAltitude;
const _horizonAngle = Math.acos(PLANET_RADIUS / _cloudR);
const _triScale1 = ATMOSPHERE_CONFIG.cloudLayer1Scale * 1000 / _horizonAngle;
const _triScale2 = ATMOSPHERE_CONFIG.cloudLayer2Scale * 1000 / _horizonAngle;
const _triScale3 = ATMOSPHERE_CONFIG.cloudLayer3Scale * 1000 / _horizonAngle;

export const atmosphereShader = /* wgsl */`
/**
 * WebGPU Atmospheric Scattering Shader
 *
 * This shader implements Eric Bruneton's precomputed atmospheric scattering model.
 * It renders physically-based sky colors, aerial perspective, and atmospheric effects
 * by sampling precomputed lookup tables (LUTs) for transmittance, scattering, and irradiance.
 *
 * Key concepts:
 * - Rayleigh scattering: Molecular scattering (blue sky)
 * - Mie scattering: Aerosol scattering (haze, sun glow)
 * - Transmittance: Light absorption through the atmosphere
 * - Irradiance: Ground-level lighting from sky and sun
 *
 * The LUTs are parameterized by:
 * - r: Distance from Earth's center
 * - mu: Cosine of zenith angle
 * - mu_s: Cosine of sun zenith angle
 * - nu: Cosine of angle between view and sun directions
 */

/**
 * Globals struct - Uniform parameters passed from CPU
 *
 * 🔑 REGLA: CPU = qué existe, GPU = cómo se ve
 * 
 * Fields are packed into vec4s for alignment:
 * - view_from_clip: Inverse projection matrix
 * - model_from_view: Inverse view matrix (rotation only, no translation for camera-at-origin)
 * - camera_exposure: altitude (x), camera radius (y), reserved (z), exposure (w)
 *   Altitude and radius are precomputed on CPU with Float64 precision
 * - sun_direction_size: Sun direction (xyz) + tan(sun_angular_radius) (w)
 * - white_point_size: White point (xyz) + debug flags (w)
 *   Debug flags: bit 0 = show quads, bit 1 = show sub-quads
 * - earth_center: Earth center offset from camera (xyz) + terrain debug mode (w)
 *   Debug modes: 0=Ortho (default), 1=Normal visualization, 2=Elevation
 * - extra_data: maxLevel (x), reserved (yzw) - avatar position now in avatar_sphere
 * - moon_dir: Moon direction (xyz) + brightness (w)
 * - avatar_sphere: Avatar sphere data (xyz=offset from camera, w=radius in km)
 * - projection_params: x=near, y=far, z=M10, w=M14
 * - cloud_params: x=coverage, y=thickness, z=altitude, w=reserved
 * - time_data: x=time, y=cloudSpeed, z=cloudMaxAltitude, w=reserved
 * - sky_stylization: x=saturation, y=vibrance, z=auroraIntensity, w=auroraSpeed
 * - sky_tint: xyz=rgb tint, w=auroraAltitude
 * - cloud_layer1_color: xyz=rgb tint, w=auroraTopR
 * - cloud_layer2_color: xyz=rgb tint, w=auroraTopG
 * - cloud_layer3_color: xyz=rgb tint, w=auroraTopB
 * - rain_params: x=intensity, yzw=aurora base color RGB
 * - lightning_params: x=flash, yzw=reserved
 * - clip_from_view: Projection Matrix (added for particles)
 */
struct Globals {
  view_from_clip : mat4x4f,
  model_from_view : mat4x4f,
  camera_exposure : vec4f,    // x=altitude, y=radius, z=reserved, w=exposure
  sun_direction_size : vec4f,
  white_point_size : vec4f,   // xyz = white point, w = debug flags (encoded)
  earth_center : vec4f,       // xyz = earth center offset, w = terrain debug mode
  extra_data : vec4f,         // x = maxLevel, yzw = camera nadir direction (precomputed Float64)
  moon_dir : vec4f,            // xyz = moon direction (normalized), w = brightness
  avatar_sphere : vec4f,      // xyz = offset from camera, w = radius (CPU decides what exists)
  projection_params : vec4f,  // x=near, y=far, z=M10, w=M14
  cloud_params : vec4f,       // x=coverage, y=thickness, z=altitude, w=reserved
  time_data : vec4f,          // x=time, y=cloudSpeed, z=cloudMaxAltitude, w=reserved
  sky_stylization : vec4f,    // x=saturation, y=vibrance, z=auroraIntensity, w=auroraSpeed
  sky_tint : vec4f,           // xyz=rgb tint, w=auroraAltitude
  cloud_layer1_color : vec4f, // xyz=rgb tint, w=auroraTopR
  cloud_layer2_color : vec4f, // xyz=rgb tint, w=auroraTopG
  cloud_layer3_color : vec4f, // xyz=rgb tint, w=auroraTopB
  rain_params : vec4f,        // x=intensity, yzw=aurora base color RGB
  lightning_params : vec4f,   // x=flash, yzw=reserved
  clip_from_view : mat4x4f,   // 100-115: Projection Matrix (added for particles)
}

struct ShadowGlobals {
  cascadeViewProj0: mat4x4f,
  cascadeViewProj1: mat4x4f,
  cascadeViewProj2: mat4x4f,
  cascadeViewProj3: mat4x4f,
  splitDepths: vec4f,
  earthCenter: vec4f,
}

// Bind group 0: All shader resources
@group(0) @binding(0) var<uniform> globals : Globals;
@group(0) @binding(1) var transmittance_texture : texture_2d<f32>;   // Atmospheric transmittance LUT
@group(0) @binding(2) var scattering_texture : texture_3d<f32>;      // Combined scattering LUT (4D packed into 3D)
@group(0) @binding(3) var irradiance_texture : texture_2d<f32>;      // Ground irradiance LUT
@group(0) @binding(4) var lut_sampler : sampler;                      // Linear sampler for all LUTs
@group(0) @binding(5) var cloud_texture : texture_2d<f32>;           // Cloud density LUT (Procedurally baked)
@group(0) @binding(6) var shadowMapArray: texture_depth_2d_array;
@group(0) @binding(7) var shadowSampler: sampler_comparison;
@group(0) @binding(8) var<uniform> shadowGlobals: ShadowGlobals;

// Helper: Get cascade matrix by index
fn getAtmoCascadeViewProj(idx: u32) -> mat4x4f {
  switch(idx) {
    case 0u: { return shadowGlobals.cascadeViewProj0; }
    case 1u: { return shadowGlobals.cascadeViewProj1; }
    case 2u: { return shadowGlobals.cascadeViewProj2; }
    default: { return shadowGlobals.cascadeViewProj3; }
  }
}

// Helper: Select cascade based on distance to camera
fn selectAtmoCascade(distToCamera: f32) -> u32 {
  if (distToCamera < shadowGlobals.splitDepths.x) { return 0u; }
  if (distToCamera < shadowGlobals.splitDepths.y) { return 1u; }
  if (distToCamera < shadowGlobals.splitDepths.z) { return 2u; }
  return 3u;
}

/**
 * SampleCSMShadow: Samples the Cascaded Shadow Map for a given world position.
 * Returns 1.0 (lit) or 0.0 (shadowed).
 */
fn SampleCSMShadow(worldPos: vec3f) -> f32 {
  let distToCamera = length(worldPos);
  let cascadeIdx = selectAtmoCascade(distToCamera);
  let cascadeViewProj = getAtmoCascadeViewProj(cascadeIdx);
  let shadowClip = cascadeViewProj * vec4f(worldPos, 1.0);
  let shadowNDC = shadowClip.xyz / shadowClip.w;
  let shadowUV = vec2f(shadowNDC.x * 0.5 + 0.5, 1.0 - (shadowNDC.y * 0.5 + 0.5));
  
  let inBounds = all(shadowUV >= vec2f(0.0)) && all(shadowUV <= vec2f(1.0)) && shadowNDC.z <= 1.0;
  if (!inBounds) { return 1.0; }
  
  // Single sample for volumetric (performance)
  // Using a small bias to avoid self-shadowing artifacts on near-surface segments
  let shadowBias = ${ATMOSPHERE_CONFIG.volumetricShadowBias};
  return textureSampleCompareLevel(shadowMapArray, shadowSampler, shadowUV, cascadeIdx, shadowNDC.z - shadowBias);
}

/**
 * atmo_rand: Simple hash for jittering
 */
fn atmo_rand(co: vec2f) -> f32 {
    return fract(sin(dot(co, vec2f(12.9898, 78.233))) * 43758.5453);
}

/**
 * SampleCloudShadow: Traces from a point toward the sun and checks cloud occlusion.
 * Returns 1.0 (no cloud) to ~0.2 (dense cloud shadow).
 * sample_earth: point in earth-centered coordinates
 * sun_dir: normalized sun direction
 */
fn SampleCloudShadow(sample_earth: vec3f, sun_dir: vec3f) -> f32 {
    let R_cloud = ATMOSPHERE.bottom_radius + ${ATMOSPHERE_CONFIG.cloudAltitude.toFixed(1)};
    let r_sample = length(sample_earth);

    // If above cloud shell, no shadow
    if (r_sample >= R_cloud) { return 1.0; }

    // Ray-sphere intersection: |sample_earth + t * sun_dir|^2 = R_cloud^2
    let b = dot(sample_earth, sun_dir);
    let c = r_sample * r_sample - R_cloud * R_cloud;
    let discriminant = b * b - c;
    if (discriminant < 0.0) { return 1.0; }

    let t_hit = -b + sqrt(discriminant);
    if (t_hit < 0.0) { return 1.0; }

    // Triplanar UV at cloud intersection (matches cloud rendering projection)
    let cloud_pos = sample_earth + sun_dir * t_hit;
    let cloud_dir = normalize(cloud_pos);
    let absN = abs(cloud_dir);
    let triW = absN * absN * absN;
    let triWSum = triW.x + triW.y + triW.z;

    // Sample cloud density (layer 1 only for performance)
    let time_val = globals.time_data.x;
    let animOffset = time_val * 0.1;
    let s1 = ${_triScale1.toFixed(1)};
    let off1 = animOffset * ${ATMOSPHERE_CONFIG.cloudLayer1Speed.toFixed(2)};
    let noise = (
      textureSampleLevel(cloud_texture, lut_sampler, cloud_dir.yz * s1 + off1, 0.0).r * triW.x +
      textureSampleLevel(cloud_texture, lut_sampler, cloud_dir.xz * s1 + off1, 0.0).r * triW.y +
      textureSampleLevel(cloud_texture, lut_sampler, cloud_dir.xy * s1 + off1, 0.0).r * triW.z
    ) / triWSum;

    let coverage = globals.cloud_params.x;
    let layer1_vis = globals.time_data.y;
    let threshold = ${ATMOSPHERE_CONFIG.cloudLayer1Threshold.toFixed(2)} - (coverage * ${ATMOSPHERE_CONFIG.cloudLayer1CoverageScale.toFixed(2)});
    let density = smoothstep(threshold, threshold + 0.4, noise) * layer1_vis;

    // Max 80% shadow from clouds (keep some ambient light through)
    return 1.0 - density * 0.8;
}

/**
 * GetVolumetricShadowVisibility: Marches along the view ray and samples CSM + clouds
 * returns 0.0 (full shadow) to 1.0 (full light)
 */
fn GetVolumetricShadowVisibility(view_dir: vec3f, sun_dir: vec3f, frag_coord: vec2f) -> f32 {
    // Only perform ray-marching if the sun is above the horizon
    if (sun_dir.y < -0.1) { return 1.0; }

    // Optimized for visibility over smoothness (centralized in atmosphereConfig.js)
    const steps = ${ATMOSPHERE_CONFIG.volumetricShadowSteps.toFixed(1)};
    // Distance for God Rays (Covers the densest part of atmosphere + cascade coverage)
    const max_dist = ${ATMOSPHERE_CONFIG.volumetricShadowMaxDist.toFixed(1)};

    let step_dist = max_dist / steps;
    var lit_sum = 0.0;

    // Jittering to convert banding into fine noise (Blue Noise approximation)
    let jitter = atmo_rand(frag_coord) * step_dist;

    // Cloud shadow: single sample per pixel at ray midpoint (angular variation creates bands)
    let cam_from_earth = -globals.earth_center.xyz;
    let mid_t = max_dist * 0.5 + jitter;
    let mid_earth = cam_from_earth + view_dir * mid_t;
    let cloud_vis = SampleCloudShadow(mid_earth, sun_dir);

    for (var i = 0.0; i < steps; i += 1.0) {
        let t = i * step_dist + jitter;
        let p = view_dir * t;

        // Combine terrain shadow (CSM) with cloud shadow
        lit_sum += SampleCSMShadow(p) * cloud_vis;
    }

    return lit_sum / steps;
}

// ============================================================================
// ATMOSPHERE CONSTANTS AND TYPE DEFINITIONS
// ============================================================================

/**
 * Precomputed Texture Dimensions
 *
 * These match the dimensions used during LUT precomputation:
 * - Transmittance: 2D texture parameterized by (r, mu)
 * - Scattering: 4D texture (r, mu, mu_s, nu) packed into 3D by treating nu as texture slices
 * - Irradiance: 2D texture parameterized by (r, mu_s)
 */
const TRANSMITTANCE_TEXTURE_WIDTH : i32 = 256;
const TRANSMITTANCE_TEXTURE_HEIGHT : i32 = 64;
const SCATTERING_TEXTURE_R_SIZE : i32 = 32;        // Altitude resolution
const SCATTERING_TEXTURE_MU_SIZE : i32 = 128;      // View zenith angle resolution
const SCATTERING_TEXTURE_MU_S_SIZE : i32 = 32;     // Sun zenith angle resolution
const SCATTERING_TEXTURE_NU_SIZE : i32 = 8;        // View-sun angle resolution
const IRRADIANCE_TEXTURE_WIDTH : i32 = 64;
const IRRADIANCE_TEXTURE_HEIGHT : i32 = 16;

/**
 * Physical Units
 *
 * These constants define the base units used in the atmospheric model.
 * All are set to 1.0 for dimensional analysis clarity (the model uses kilometers internally).
 */
const m : f32 = 1.0;      // Meters
const nm : f32 = 1.0;     // Nanometers (wavelength)
const rad : f32 = 1.0;    // Radians (angle)
const sr : f32 = 1.0;     // Steradians (solid angle)
const watt : f32 = 1.0;   // Watts (power)
const lm : f32 = 1.0;     // Lumens (luminous flux)
const PI : f32 = 3.14159265358979323846;

// Derived units for radiometric quantities
const m2 : f32 = m * m;
const m3 : f32 = m * m * m;
const watt_per_square_meter : f32 = watt / m2;                        // Irradiance
const watt_per_square_meter_per_sr : f32 = watt / (m2 * sr);          // Radiance
const watt_per_square_meter_per_nm : f32 = watt / (m2 * nm);          // Spectral irradiance
const watt_per_square_meter_per_sr_per_nm : f32 = watt / (m2 * sr * nm);  // Spectral radiance
const watt_per_cubic_meter_per_sr_per_nm : f32 = watt / (m3 * sr * nm);   // Scattering coefficient

/**
 * Conversion Factors: Spectral Radiance to Luminance
 *
 * These constants convert RGB spectral radiance (at wavelengths ~680nm, 550nm, 440nm)
 * to CIE luminance values. Different conversion factors are used for sky and sun
 * because they have different spectral distributions.
 */
const SKY_SPECTRAL_RADIANCE_TO_LUMINANCE : vec3f =
    vec3f(114974.916437, 71305.954816, 65310.548555);
const SUN_SPECTRAL_RADIANCE_TO_LUMINANCE : vec3f =
    vec3f(98242.786222, 69954.398112, 66475.012354);

/**
 * Scene Object Constants
 *
 * 🔑 REGLA: CPU = qué existe, GPU = cómo se ve
 * 
 * Object positions and radii come from CPU via uniforms.
 * This design scales to multiple objects, avatars, vehicles, etc.
 */
const kLengthUnitInMeters : f32 = 1000.0;
const kGroundAlbedo : vec3f = vec3f(0.0, 0.0, 0.04);

// ============================================================================
// OBJECT ACCESSORS - Read from CPU-provided uniforms
// ============================================================================

// Avatar sphere offset and radius from CPU
fn getAvatarOffset() -> vec3f {
  return globals.avatar_sphere.xyz;
}

fn getAvatarRadius() -> f32 {
  return globals.avatar_sphere.w;
}


// ============================================================================
// TERRAIN NOISE SYSTEM - Proland-style additive residuals
// ============================================================================
// Key principle: Base form NEVER changes, only detail is ADDED per LOD level
// Each level adds noise at higher frequency with decreasing amplitude
// Amplitudes from Proland: -140,-100,-15,-8,5,2.5,1.5,1,0.5,0.25,0.1,0.05

/**
 * getStars: Procedural star field based on view direction
 * Returns star brightness for the given direction
 */
fn getStars(viewDir: vec3f) -> vec3f {
  // Create a grid of cells on the celestial sphere
  let cellSize = 100.0;  // Controls star density (lower = more stars)
  let scaledDir = viewDir * cellSize;
  let cellId = floor(scaledDir);
  let cellFrac = fract(scaledDir);
  
  // Get random position and brightness within cell
  let starHash = hash33(cellId);
  let starPos = starHash.xy;
  let starBrightness = starHash.z;
  
  // Distance from star center to fragment
  let distToStar = length(cellFrac.xy - starPos);
  
  // Only show bright stars (threshold) with sharp point appearance
  let starThreshold = 0.92;  // How rare stars are (higher = fewer but brighter)
  if (starBrightness > starThreshold) {
    // Normalize brightness above threshold
    let normalizedBright = (starBrightness - starThreshold) / (1.0 - starThreshold);
    
    // Sharp star with tiny core
    let starRadius = 0.03;  // Very small stars
    let starIntensity = smoothstep(starRadius, 0.0, distToStar) * normalizedBright;
    
    // Star color: mostly white with slight color variation
    let starColor = vec3f(0.9 + starHash.x * 0.1, 0.9 + starHash.y * 0.1, 1.0);
    
    return starColor * starIntensity * 0.5;  // Final star brightness
  }
  
  return vec3f(0.0);
}

// ============================================================================
// NOISE SYSTEM (Imported)
// ============================================================================

${noiseWGSL}
// Cloud system functions moved to clouds.wgsl (Static textures version uses textureSampleLevel)


/**
 * getCubeFaceAndUV: Maps a sphere normal to cube face index and UV coordinates
 * Returns: vec3f where x=faceIndex, y=u, z=v
 */
fn getCubeFaceAndUV(normal: vec3f) -> vec3f {
  let absN = abs(normal);
  var faceIndex = 0.0;
  var u = 0.0;
  var v = 0.0;
  
  if (absN.z >= absN.x && absN.z >= absN.y) {
    if (normal.z > 0.0) {
      faceIndex = 0.0;
      u = (normal.x / absN.z + 1.0) * 0.5;
      v = (normal.y / absN.z + 1.0) * 0.5;
    } else {
      faceIndex = 1.0;
      u = (-normal.x / absN.z + 1.0) * 0.5;
      v = (normal.y / absN.z + 1.0) * 0.5;
    }
  } else if (absN.x >= absN.y && absN.x >= absN.z) {
    if (normal.x > 0.0) {
      faceIndex = 2.0;
      u = (-normal.z / absN.x + 1.0) * 0.5;
      v = (normal.y / absN.x + 1.0) * 0.5;
    } else {
      faceIndex = 3.0;
      u = (normal.z / absN.x + 1.0) * 0.5;
      v = (normal.y / absN.x + 1.0) * 0.5;
    }
  } else {
    if (normal.y > 0.0) {
      faceIndex = 4.0;
      u = (normal.x / absN.y + 1.0) * 0.5;
      v = (-normal.z / absN.y + 1.0) * 0.5;
    } else {
      faceIndex = 5.0;
      u = (normal.x / absN.y + 1.0) * 0.5;
      v = (normal.z / absN.y + 1.0) * 0.5;
    }
  }
  
  return vec3f(faceIndex, u, v);
}

// ============================================================================
// QUAD DEBUG GRID FUNCTIONS - Planetary Style cube-sphere tessellation
// ============================================================================

// ============================================================================
// CENTRALIZED LOD SYSTEM - Single source of truth for all LOD calculations
// ============================================================================

/**
 * LODResult: Contains all LOD-related data needed by terrain and debug systems
 */
struct LODResult {
  baseLevel: f32,       // Base LOD level from quadtree
  finalLevel: f32,      // Final LOD after ring bonus applied
  baseDivisions: f32,   // pow(2, baseLevel) - divisions for uniform quads
  divisions: f32,       // pow(2, finalLevel) - divisions for sub-quads
  faceIndex: i32,       // Which cube face this pixel is on
  baseQuadU: f32,       // Quad index U at base level (for uniform quads)
  baseQuadV: f32,       // Quad index V at base level (for uniform quads)
  quadU: f32,           // Quad index U at final level (for sub-quads)
  quadV: f32,           // Quad index V at final level (for sub-quads)
  faceU: f32,           // Raw UV coordinate U [0,1]
  faceV: f32,           // Raw UV coordinate V [0,1]
}

/**
 * calculateLOD: Centralized LOD calculation for terrain and debug systems
 * LOD level comes from PlanetQuadtree.js via uniforms (single source of truth)
 * 
 * @param pixelNormal: Normalized direction from planet center to pixel
 * @param cameraNadir: Normalized direction from planet center to camera
 * @return LODResult with all computed values
 */

/**
 * getLODDivisions: Calculate divisions per axis for LOD level
 * Simple exponential: pow(2, level)
 * LOD 0: 1 division = 6 quads (cube faces), rendered as 1 visual quad
 * LOD 1: 2 divisions = 24 quads (4/face × 6)
 * LOD 2: 4 divisions = 96 quads
 * LOD 3: 8 divisions = 384 quads
 * ...up to LOD 22
 */
fn getLODDivisions(level: f32) -> f32 {
  return pow(2.0, level);
}

fn calculateLOD(pixelNormal: vec3f, cameraNadir: vec3f) -> LODResult {
  var result: LODResult;
  
  // === STEP 1: Get LOD from PlanetQuadtree (single source of truth) ===
  // maxLevel is passed from JavaScript via uniforms
  let level = globals.extra_data.x;
  
  result.baseLevel = level;
  
  // === STEP 2: Get cube face and UV for pixel ===
  let pixelFaceData = getCubeFaceAndUV(pixelNormal);
  let pixelFace = i32(pixelFaceData.x);
  let pixelU = pixelFaceData.y;
  let pixelV = pixelFaceData.z;
  
  result.faceIndex = pixelFace;
  result.faceU = pixelU;
  result.faceV = pixelV;
  
  // === STEP 3: Calculate quad indices at base level ===
  let baseDivisions = getLODDivisions(level);
  let pixelQuadU = floor(pixelU * baseDivisions);
  let pixelQuadV = floor(pixelV * baseDivisions);
  
  // === STEP 4: Get nadir quad position ===
  let nadirFaceData = getCubeFaceAndUV(cameraNadir);
  let nadirFace = i32(nadirFaceData.x);
  let nadirU = nadirFaceData.y;
  let nadirV = nadirFaceData.z;
  let nadirQuadU = floor(nadirU * baseDivisions);
  let nadirQuadV = floor(nadirV * baseDivisions);
  
  // === STEP 5: Apply progressive ring LOD with distance-based freeze ===
  // Terrain within 50m of camera: freeze LOD to avoid visual changes when rotating
  // Terrain beyond 50m: apply ring LOD system with hysteresis
  
  var finalLevel = level;
  
  // Get camera altitude and calculate approximate world distance to quad center
  let camera_altitude = globals.camera_exposure.x;
  
  // Calculate approximate distance from camera to this quad in world units
  // baseDivisions already calculated above
  // At LOD 22, there are 2^22 = 4M quads, each ~1.5m wide
  // At LOD 10, there are 2^10 = 1024 quads, each ~6km wide
  let quadSizeKm = (ATMOSPHERE.bottom_radius * 2.0 * 3.14159 / 6.0) / baseDivisions;  // Approx quad size in km
  
  if (pixelFace == nadirFace) {
    let distU = abs(pixelQuadU - nadirQuadU);
    let distV = abs(pixelQuadV - nadirQuadV);
    let maxDist = max(distU, distV);
    
    // Convert quad distance to world distance (km)
    let worldDistanceKm = maxDist * quadSizeKm;
    
    // Within 5 meters (0.005 km): freeze ring system
    if (worldDistanceKm < 0.005) {
      finalLevel = level;  // Use base level, no ring adjustments
    } else {
      // Beyond 50m: apply ring LOD with hysteresis
      let activeRings = clamp(level, 1.0, 4.0);
      
      let ring1_outer = 2.5;
      let ring2_outer = 4.5;
      let ring3_outer = 8.5;
      let ring4_outer = 16.5;
      
      if (activeRings >= 1.0 && maxDist <= ring1_outer) {
        finalLevel = min(level + 1.0, 22.0);   // Ring 1: +1 level
      } else if (activeRings >= 2.0 && maxDist <= ring2_outer) {
        finalLevel = level;                     // Ring 2: base level
      } else if (activeRings >= 3.0 && maxDist <= ring3_outer) {
        finalLevel = max(level - 1.0, 0.0);    // Ring 3: -1 level
      } else if (activeRings >= 4.0 && maxDist <= ring4_outer) {
        finalLevel = max(level - 2.0, 0.0);    // Ring 4: -2 levels
      } else {
        finalLevel = max(level - 3.0, 0.0);    // Beyond: -3 levels
      }
    }
  } else {
    // Different face than nadir: reduced detail
    finalLevel = max(level - 1.0, 0.0);
  }
  
  result.finalLevel = finalLevel;
  result.baseDivisions = baseDivisions;
  result.divisions = getLODDivisions(finalLevel);
  
  // Base quad indices - for uniform quad display (no deformation)
  result.baseQuadU = pixelQuadU;
  result.baseQuadV = pixelQuadV;
  
  // Final quad indices - for sub-quad detail
  result.quadU = floor(pixelU * result.divisions);
  result.quadV = floor(pixelV * result.divisions);
  
  return result;
}
/**
 * getQuadGridDebug: Cube-sphere based debug grid overlay
 * Uses centralized LOD system for consistent quad sizes
 * Returns TINT COLOR for translucent overlay (Planetary Style - red/green)
 */
fn getQuadGridDebug(normal: vec3f, showQuads: bool, showSubQuads: bool) -> vec3f {
  if (!showQuads && !showSubQuads) {
    return vec3f(1.0, 1.0, 1.0);
  }
  
  // Use CAMERA nadir precomputed in CPU (Float64 precision)
  // This avoids recalculating nadir in Float32 which caused jitter
  let nadirDirection = globals.extra_data.yzw;  // Precomputed: normalize(camera - earth_center)
  
  // Use centralized LOD calculation (LOD from PlanetQuadtree via uniforms)
  let lod = calculateLOD(normal, nadirDirection);
  
  // Red for quads, Green for sub-quads, both at 40% opacity
  let colorRed = vec3f(1.0, 0.0, 0.0);
  let colorGreen = vec3f(0.0, 1.0, 0.0);
  let opacity = 0.4;
  
  var tintColor = vec3f(1.0, 1.0, 1.0);
  
  if (showQuads) {
    // Quads use FINAL level to show ring-based subdivisions
    // Near nadir: more subdivisions (smaller quads)
    // Far from nadir: fewer subdivisions (larger quads)
    var checker = 0;
    if (lod.finalLevel < 1.0) {
      // LOD 0: single quad for entire planet
      checker = 0;
    } else {
      let qU = i32(lod.quadU);
      let qV = i32(lod.quadV);
      checker = (qU + qV + lod.faceIndex) % 2;
    }
    if (checker == 0) {
      tintColor = mix(tintColor, colorRed, opacity);
    }
  }
  
  if (showSubQuads) {
    let subDivisions = lod.divisions * 24.0;  // 24x24 sub-quads per quad (matches QUAD_GRID_SIZE)
    let subU = i32(floor(lod.faceU * subDivisions));
    let subV = i32(floor(lod.faceV * subDivisions));
    let subChecker = (subU + subV) % 2;
    if (subChecker == 0) {
      tintColor = mix(tintColor, colorGreen, opacity);
    }
  }
  
  return tintColor;
}

/**
 * DensityProfileLayer: Defines atmospheric density as a function of altitude
 *
 * The density at altitude h is computed as:
 * density(h) = exp_term * exp(exp_scale * h) + linear_term * h + constant_term
 *
 * This allows modeling of exponential density falloff (e.g., molecular atmosphere)
 * as well as linear regions (e.g., ozone layer).
 */
struct DensityProfileLayer {
  width : f32,          // Layer thickness (km)
  exp_term : f32,       // Coefficient for exponential term
  exp_scale : f32,      // Exponent scale factor
  linear_term : f32,    // Coefficient for linear term
  constant_term : f32,  // Constant offset
}

/**
 * DensityProfile: Two-layer density profile
 *
 * Most atmospheric constituents can be modeled with two layers
 * (e.g., lower and upper atmosphere)
 */
struct DensityProfile {
  layers : array<DensityProfileLayer, 2>,
}

/**
 * AtmosphereParameters: Complete description of atmospheric properties
 *
 * This struct contains all physical parameters needed to compute scattering:
 * - Solar irradiance and sun size
 * - Planet geometry (radii defining atmosphere shell)
 * - Rayleigh scattering (molecular) - wavelength dependent, causes blue sky
 * - Mie scattering (aerosol) - larger particles, causes haze and sun glow
 * - Absorption (ozone) - removes light at certain wavelengths
 * - Ground albedo for surface reflections
 */
struct AtmosphereParameters {
  solar_irradiance : vec3f,         // Sun's spectral irradiance at top of atmosphere (RGB)
  sun_angular_radius : f32,         // Angular size of the sun (radians)
  bottom_radius : f32,              // Planet radius (km)
  top_radius : f32,                 // Atmosphere outer radius (km)
  rayleigh_density : DensityProfile, // Rayleigh scattering density vs altitude
  rayleigh_scattering : vec3f,      // Rayleigh scattering coefficients (RGB, wavelength-dependent)
  mie_density : DensityProfile,     // Mie scattering density vs altitude
  mie_scattering : vec3f,           // Mie scattering coefficient (wavelength-independent)
  mie_extinction : vec3f,           // Mie extinction = scattering + absorption
  mie_phase_function_g : f32,       // Mie phase function asymmetry parameter (-1 to 1)
  absorption_density : DensityProfile, // Absorption (ozone) density vs altitude
  absorption_extinction : vec3f,    // Absorption coefficients (RGB)
  ground_albedo : vec3f,            // Ground surface reflectance (RGB)
  mu_s_min : f32,                   // Minimum sun zenith angle cosine for LUT
}

/**
 * ATMOSPHERE: Earth's atmosphere parameters
 *
 * These values are calibrated to match Earth's real atmosphere:
 * - Bottom radius: ${PLANET_RADIUS.toFixed(0)} km (Earth's radius)
 * - Top radius: 6420 km (60 km atmosphere thickness)
 * - Rayleigh scattering: Exponential with 8km scale height
 * - Mie scattering: Exponential with 1.2km scale height
 * - Absorption (ozone): Peaked around 25km altitude
 * - Mie asymmetry g=0.8: Strongly forward-scattering (typical for aerosols)
 */
const ATMOSPHERE : AtmosphereParameters = AtmosphereParameters(
  ${vec3_SOLAR},  // Solar irradiance (RGB)
  0.004675,                              // Sun angular radius
  ${PLANET_RADIUS.toFixed(1)},                                // Earth radius (km)
  835.0,                                 // Atmosphere top (km) - 795 + 40km atmosphere layer

  // Rayleigh density: exponential with scale height ~8km
  DensityProfile(array<DensityProfileLayer, 2>(
    DensityProfileLayer(0.0, 0.0, 0.0, 0.0, 0.0),
    DensityProfileLayer(0.0, 1.0, -0.125, 0.0, 0.0)
  )),
  vec3f(0.005802, 0.013558, 0.033100),  // Rayleigh scattering (blue-weighted)
  // Mie density: exponential with scale height ~1.2km
  DensityProfile(array<DensityProfileLayer, 2>(
    DensityProfileLayer(0.0, 0.0, 0.0, 0.0, 0.0),
    DensityProfileLayer(0.0, 1.0, -0.833333, 0.0, 0.0)
  )),
  vec3f(0.003996, 0.003996, 0.003996) * 0.03,  // Mie scattering (3% - clear sky with subtle haze)
  vec3f(0.004440, 0.004440, 0.004440) * 0.03,  // Mie extinction (3%)
  0.8,                                   // Mie phase function g (Default baseline)
  // Ozone absorption: peaked at 25km altitude
  DensityProfile(array<DensityProfileLayer, 2>(
    DensityProfileLayer(25.0, 0.0, 0.0, 0.066667, -0.666667),
    DensityProfileLayer(0.0, 0.0, 0.0, -0.066667, 2.666667)
  )),
  vec3f(0.000650, 0.001881, 0.000085),  // Absorption extinction (green-weighted)
  vec3f(0.1, 0.1, 0.1),                 // Ground albedo
  -0.207912                              // mu_s_min
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * ClampCosine: Clamps a cosine value to valid range [-1, 1]
 *
 * Prevents numerical errors when computing angles
 */
fn ClampCosine(mu : f32) -> f32 {
  return clamp(mu, -1.0, 1.0);
}

/**
 * ClampDistance: Ensures distance is non-negative
 */
fn ClampDistance(d : f32) -> f32 {
  return max(d, 0.0);
}

/**
 * ClampRadius: Clamps altitude to atmosphere shell
 *
 * Ensures r is within [bottom_radius, top_radius]
 */
fn ClampRadius(atmosphere : AtmosphereParameters, r : f32) -> f32 {
  return clamp(r, atmosphere.bottom_radius, atmosphere.top_radius);
}

/**
 * SafeSqrt: Square root that handles negative values
 *
 * Returns 0 for negative inputs (can occur due to numerical precision)
 */
fn SafeSqrt(v : f32) -> f32 {
  return sqrt(max(v, 0.0));
}

/**
 * RayDistanceToAtmosphereTop: Ray-sphere intersection distance
 *
 * Computes distance from point at radius r, looking in direction mu,
 * to the top atmosphere boundary.
 *
 * This uses the ray-sphere intersection formula:
 * Given ray origin at distance r from center, direction with cos(zenith) = mu,
 * and sphere of radius top_radius, solve for intersection distance.
 *
 * @param r Distance from planet center
 * @param mu Cosine of zenith angle (1 = up, 0 = horizon, -1 = down)
 */
fn RayDistanceToAtmosphereTop(atmosphere : AtmosphereParameters, r : f32, mu : f32) -> f32 {
  let discriminant = r * r * (mu * mu - 1.0) + atmosphere.top_radius * atmosphere.top_radius;
  return ClampDistance(-r * mu + SafeSqrt(discriminant));
}


/**
 * RayIntersectsGround: Checks if a ray hits the planet surface
 *
 * Returns true if the ray (from radius r, direction mu) intersects the ground
 * before exiting the atmosphere. This affects transmittance calculations.
 */
fn RayIntersectsGround(atmosphere : AtmosphereParameters, r : f32, mu : f32) -> bool {
  return mu < 0.0 && (r * r * (mu * mu - 1.0) +
      atmosphere.bottom_radius * atmosphere.bottom_radius >= 0.0);
}

/**
 * NormalizedToTexCoord: Converts [0,1] to texture coordinate
 *
 * Maps unit range to texture space, centering samples in texel centers.
 * For a texture of size N, maps:
 * - 0.0 -> 0.5/N (center of first texel)
 * - 1.0 -> (N-0.5)/N (center of last texel)
 */
fn NormalizedToTexCoord(x : f32, texture_size : i32) -> f32 {
  return 0.5 / f32(texture_size) + x * (1.0 - 1.0 / f32(texture_size));
}

// ============================================================================
// TRANSMITTANCE LOOKUPS
// ============================================================================

/**
 * Transmittance LUT Parameterization
 *
 * The transmittance texture stores the fraction of light that survives
 * traveling from any point (r, mu) to the top of the atmosphere.
 *
 * The 2D texture is parameterized by:
 * - r: Distance from planet center (altitude)
 * - mu: Cosine of zenith angle (view direction)
 *
 * The mapping uses a non-linear parameterization that allocates more
 * precision near the horizon where transmittance changes rapidly.
 */

struct RMuResult {
  r : f32,   // Distance from planet center
  mu : f32,  // Cosine of zenith angle
}

/**
 * MapToTransmittanceTexture: Maps (r, mu) to texture UV coordinates
 *
 * This function implements the non-linear mapping from physical parameters
 * (r, mu) to 2D texture coordinates. The parameterization is designed to:
 * 1. Use more precision near the horizon (mu ≈ 0)
 * 2. Use more precision near the ground (low altitude)
 *
 * The mapping works by:
 * - Computing distance to atmosphere top boundary
 * - Normalizing this distance relative to min/max possible distances
 * - Mapping to texture space with proper texel centering
 *
 * @param r Distance from planet center (km)
 * @param mu Cosine of zenith angle
 * @return UV coordinates in [0,1]^2
 */
fn MapToTransmittanceTexture(atmosphere : AtmosphereParameters, r : f32, mu : f32) -> vec2f {
  // H: Maximum horizontal distance in atmosphere
  let H = sqrt(atmosphere.top_radius * atmosphere.top_radius -
      atmosphere.bottom_radius * atmosphere.bottom_radius);

  // rho: Horizontal distance from planet center axis
  let rho = SafeSqrt(r * r - atmosphere.bottom_radius * atmosphere.bottom_radius);

  // d: Distance to top atmosphere boundary in this direction
  let d = RayDistanceToAtmosphereTop(atmosphere, r, mu);

  // Normalize distance to [0,1] range
  let d_min = atmosphere.top_radius - r;  // Minimum distance (looking up)
  let d_max = rho + H;                     // Maximum distance (looking at horizon)
  let x_mu = (d - d_min) / (d_max - d_min);

  // Normalize altitude to [0,1] range
  let x_r = rho / H;

  return vec2f(
    NormalizedToTexCoord(x_mu, TRANSMITTANCE_TEXTURE_WIDTH),
    NormalizedToTexCoord(x_r, TRANSMITTANCE_TEXTURE_HEIGHT)
  );
}


/**
 * SampleTransmittanceLUT: Samples transmittance LUT
 *
 * Returns the fraction of light (RGB) that reaches the top of the atmosphere
 * when traveling from point (r, mu).
 */
fn SampleTransmittanceLUT(
    atmosphere : AtmosphereParameters, r : f32, mu : f32) -> vec3f {
  let uv = MapToTransmittanceTexture(atmosphere, r, mu);
  return textureSampleLevel(transmittance_texture, lut_sampler, uv, 0.0).rgb;
}

/**
 * GetTransmittance: Computes transmittance between two points
 *
 * Returns the fraction of light that survives traveling distance d
 * along a ray from (r, mu). Handles both ground-intersecting and
 * non-intersecting rays.
 *
 * For rays that don't hit ground: T(r→r_d) = T(r→top) / T(r_d→top)
 * For rays that hit ground: T(r→r_d) = T(r_d→top, looking down) / T(r→top, looking down)
 */
fn GetTransmittance(
    atmosphere : AtmosphereParameters,
    r : f32,
    mu : f32,
    d : f32,
    ray_r_mu_intersects_ground : bool) -> vec3f {
  // Compute endpoint of ray segment
  let r_d = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
  let mu_d = ClampCosine((r * mu + d) / r_d);

  if (ray_r_mu_intersects_ground) {
    // Ray hits ground: use ratio of transmittances looking down
    return min(
        SampleTransmittanceLUT(atmosphere, r_d, -mu_d) /
        SampleTransmittanceLUT(atmosphere, r, -mu),
        vec3f(1.0));
  }

  // Ray doesn't hit ground: use ratio of transmittances looking up
  return min(
      SampleTransmittanceLUT(atmosphere, r, mu) /
      SampleTransmittanceLUT(atmosphere, r_d, mu_d),
      vec3f(1.0));
}

/**
 * GetTransmittanceToSun: Computes atmospheric transmittance to the sun
 *
 * Returns the fraction of sunlight (RGB) that reaches a point at altitude r
 * when the sun is at zenith angle mu_s. This accounts for:
 * 1. Atmospheric absorption along the path to the sun
 * 2. Smooth fadeout when sun is below the horizon (to avoid harsh cutoff)
 *
 * The smoothstep creates a smooth transition as the sun sets/rises, preventing
 * the abrupt change that would occur at the mathematical horizon.
 *
 * @param r Distance from planet center (altitude)
 * @param mu_s Cosine of sun zenith angle
 * @return RGB transmittance factors [0,1]
 */
fn GetTransmittanceToSun(atmosphere : AtmosphereParameters, r : f32, mu_s : f32) -> vec3f {
  // Compute horizon angle at this altitude
  let sin_theta_h = atmosphere.bottom_radius / r;
  let cos_theta_h = -sqrt(max(1.0 - sin_theta_h * sin_theta_h, 0.0));

  // Multiply transmittance by smooth fadeout near horizon
  return SampleTransmittanceLUT(atmosphere, r, mu_s) *
      smoothstep(
        -sin_theta_h * atmosphere.sun_angular_radius / rad,
        sin_theta_h * atmosphere.sun_angular_radius / rad,
        mu_s - cos_theta_h);
}

// ============================================================================
// SCATTERING LOOKUPS
// ============================================================================

/**
 * RayleighPhaseFunction: Angular distribution of Rayleigh scattering
 *
 * Rayleigh scattering (molecular) has a symmetric phase function:
 * - Equal scattering forward and backward
 * - Minimum scattering at 90° (nu = 0)
 * - Maximum scattering at 0° and 180° (nu = ±1)
 *
 * Formula: P(nu) = (3/16π) * (1 + nu²)
 * where nu = cos(angle between view and sun)
 */
fn RayleighPhaseFunction(nu : f32) -> f32 {
  let k = 3.0 / (16.0 * PI * sr);
  return k * (1.0 + nu * nu);
}

/**
 * MiePhaseFunction: Angular distribution of Mie scattering
 *
 * Mie scattering (aerosol) is strongly forward-scattering:
 * - Most light scatters in the forward direction (nu ≈ 1)
 * - Creates bright glow around the sun
 * - Asymmetry parameter g controls the strength (g=0.8 for Earth)
 *
 * Uses the Cornette-Shanks phase function:
 * P(g,nu) = (3/8π) * [(1-g²)/(2+g²)] * (1+nu²) / (1+g²-2g*nu)^1.5
 */
fn MiePhaseFunction(g : f32, nu : f32) -> f32 {
  let k = 3.0 / (8.0 * PI * sr) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + nu * nu) / pow(1.0 + g * g - 2.0 * g * nu, 1.5);
}

/**
 * MapToScatteringTexture: Maps scattering parameters to 4D texture coordinates
 *
 * The scattering LUT is 4-dimensional (r, mu, mu_s, nu) but GPUs only support up to 3D textures.
 * This function packs the 4D data into a 3D texture by treating the nu dimension as horizontal
 * slices laid out side-by-side.
 *
 * Parameters:
 * - r: Distance from planet center (altitude)
 * - mu: Cosine of view zenith angle
 * - mu_s: Cosine of sun zenith angle
 * - nu: Cosine of angle between view and sun directions
 * - ray_r_mu_intersects_ground: Whether the view ray hits the ground
 *
 * Returns vec4(u_nu, u_mu_s, u_mu, u_r) where:
 * - u_nu is used to compute which texture slice and lerp factor
 * - u_mu_s, u_mu, u_r are the 3D texture coordinates
 *
 * The parameterization is non-linear to allocate more precision where scattering
 * changes rapidly (e.g., near the horizon, near the ground).
 */
fn MapToScatteringTexture(
    atmosphere : AtmosphereParameters,
    r : f32,
    mu : f32,
    mu_s : f32,
    nu : f32,
    ray_r_mu_intersects_ground : bool) -> vec4f {
  let H = sqrt(atmosphere.top_radius * atmosphere.top_radius -
      atmosphere.bottom_radius * atmosphere.bottom_radius);
  let rho = SafeSqrt(r * r - atmosphere.bottom_radius * atmosphere.bottom_radius);
  let u_r = NormalizedToTexCoord(rho / H, SCATTERING_TEXTURE_R_SIZE);
  let r_mu = r * mu;
  let discriminant =
      r_mu * r_mu - r * r + atmosphere.bottom_radius * atmosphere.bottom_radius;
  var u_mu : f32;
  if (ray_r_mu_intersects_ground) {
    let d = -r_mu - SafeSqrt(discriminant);
    let d_min = r - atmosphere.bottom_radius;
    let d_max = rho;
    var ratio : f32;
    if (d_max == d_min) {
      ratio = 0.0;
    } else {
      ratio = (d - d_min) / (d_max - d_min);
    }
    u_mu = 0.5 - 0.5 * NormalizedToTexCoord(
        ratio,
        SCATTERING_TEXTURE_MU_SIZE / 2);
  } else {
    let d = -r_mu + SafeSqrt(discriminant + H * H);
    let d_min = atmosphere.top_radius - r;
    let d_max = rho + H;
    u_mu = 0.5 + 0.5 * NormalizedToTexCoord(
        (d - d_min) / (d_max - d_min),
        SCATTERING_TEXTURE_MU_SIZE / 2);
  }
  let d = RayDistanceToAtmosphereTop(atmosphere, atmosphere.bottom_radius, mu_s);
  let d_min = atmosphere.top_radius - atmosphere.bottom_radius;
  let d_max = H;
  let a = (d - d_min) / (d_max - d_min);
  let D = RayDistanceToAtmosphereTop(atmosphere, atmosphere.bottom_radius, atmosphere.mu_s_min);
  let A = (D - d_min) / (d_max - d_min);
  let u_mu_s = NormalizedToTexCoord(
      max(1.0 - a / A, 0.0) / (1.0 + a), SCATTERING_TEXTURE_MU_S_SIZE);
  let u_nu = (nu + 1.0) * 0.5;
  return vec4f(u_nu, u_mu_s, u_mu, u_r);
}

/**
 * MapToIrradianceTexture: Maps (r, mu_s) to irradiance texture coordinates
 *
 * The irradiance LUT stores ground-level lighting (sun + sky) as a function of:
 * - r: Altitude above ground
 * - mu_s: Cosine of sun zenith angle
 *
 * This uses a simple linear parameterization since irradiance varies smoothly.
 *
 * @param r Distance from planet center
 * @param mu_s Cosine of sun zenith angle
 * @return UV texture coordinates
 */
fn MapToIrradianceTexture(atmosphere : AtmosphereParameters, r : f32, mu_s : f32) -> vec2f {
  let x_r = (r - atmosphere.bottom_radius) /
      (atmosphere.top_radius - atmosphere.bottom_radius);
  let x_mu_s = mu_s * 0.5 + 0.5;  // Map [-1,1] to [0,1]
  return vec2f(
      NormalizedToTexCoord(x_mu_s, IRRADIANCE_TEXTURE_WIDTH),
      NormalizedToTexCoord(x_r, IRRADIANCE_TEXTURE_HEIGHT));
}

/**
 * GetIrradiance: Samples the irradiance LUT
 *
 * Returns the total ground irradiance (sum of sun + sky light) at altitude r
 * when the sun is at zenith angle mu_s.
 *
 * @param r Distance from planet center
 * @param mu_s Cosine of sun zenith angle
 * @return RGB irradiance (W/m²)
 */
fn GetIrradiance(atmosphere : AtmosphereParameters, r : f32, mu_s : f32) -> vec3f {
  let uv = MapToIrradianceTexture(atmosphere, r, mu_s);
  return textureSampleLevel(irradiance_texture, lut_sampler, uv, 0.0).rgb;
}

/**
 * ExtrapolateSingleMie: Extracts single Mie scattering from combined scattering
 *
 * The scattering LUT stores Rayleigh + multiple-scattering in RGB, and a ratio in alpha
 * that allows extracting single Mie scattering. This is needed because Mie and Rayleigh
 * have different phase functions.
 *
 * The formula extrapolates the single Mie component using the stored ratio and the
 * known relationship between Rayleigh and Mie scattering coefficients.
 *
 * @param scattering Combined scattering from LUT (rgba)
 * @return Single Mie scattering component (RGB)
 */
fn ExtrapolateSingleMie(atmosphere : AtmosphereParameters, scattering : vec4f) -> vec3f {
  if (scattering.x <= 0.0) {
    return vec3f(0.0);
  }
  return scattering.xyz * scattering.w / scattering.x *
      (atmosphere.rayleigh_scattering.x / atmosphere.mie_scattering.x) *
      (atmosphere.mie_scattering / atmosphere.rayleigh_scattering);
}

struct CombinedScatteringResult {
  scattering : vec3f,
  single_mie : vec3f,
}

/**
 * GetCombinedScattering: Samples the scattering LUT with manual interpolation
 *
 * The scattering LUT is 4D (r, mu, mu_s, nu) but stored as a 3D texture with nu
 * packed as horizontal slices. This function:
 * 1. Maps parameters to 4D texture coordinates
 * 2. Computes which two nu slices to sample
 * 3. Samples both slices and linearly interpolates
 * 4. Separates combined scattering into Rayleigh and Mie components
 *
 * Returns both the total scattering and the single-Mie component (which needs
 * a different phase function applied).
 *
 * @param r Distance from planet center
 * @param mu Cosine of view zenith angle
 * @param mu_s Cosine of sun zenith angle
 * @param nu Cosine of angle between view and sun
 * @param ray_r_mu_intersects_ground Whether view ray hits ground
 * @return Combined scattering and separated single-Mie component
 */
fn GetCombinedScattering(
    atmosphere : AtmosphereParameters,
    r : f32,
    mu : f32,
    mu_s : f32,
    nu : f32,
    ray_r_mu_intersects_ground : bool) -> CombinedScatteringResult {
  // Get 4D texture coordinates
  let uvwz = MapToScatteringTexture(
      atmosphere, r, mu, mu_s, nu, ray_r_mu_intersects_ground);

  // Compute which two nu slices to sample and interpolation factor
  let tex_coord_x = uvwz.x * f32(SCATTERING_TEXTURE_NU_SIZE - 1);
  let tex_x = floor(tex_coord_x);
  let lerp = tex_coord_x - tex_x;

  // Sample two adjacent nu slices
  let uvw0 = vec3f((tex_x + uvwz.y) / f32(SCATTERING_TEXTURE_NU_SIZE), uvwz.z, uvwz.w);
  let uvw1 = vec3f((tex_x + 1.0 + uvwz.y) / f32(SCATTERING_TEXTURE_NU_SIZE), uvwz.z, uvwz.w);
  let combined0 = textureSampleLevel(scattering_texture, lut_sampler, uvw0, 0.0);
  let combined1 = textureSampleLevel(scattering_texture, lut_sampler, uvw1, 0.0);
  let combined = combined0 * (1.0 - lerp) + combined1 * lerp;

  // Separate Rayleigh and Mie components
  var result : CombinedScatteringResult;
  result.scattering = combined.rgb;
  result.single_mie = ExtrapolateSingleMie(atmosphere, combined);
  return result;
}

/**
 * SkySample: Result of atmospheric scattering computation
 *
 * Contains both the in-scattered radiance (sky color) and the transmittance
 * to a point, allowing composition with objects in the scene.
 */
struct SkySample {
  radiance : vec3f,       // In-scattered light (sky glow)
  transmittance : vec3f,  // Fraction of light transmitted through atmosphere
}

/**
 * GetSkyRadiance: Computes sky color along a view ray
 *
 * This is the main atmospheric scattering function. It:
 * 1. Handles camera outside atmosphere (moves it to atmosphere boundary)
 * 2. Samples precomputed scattering LUTs
 * 3. Applies phase functions for Rayleigh and Mie scattering
 * 4. Accounts for shadows from objects (optional)
 *
 * Returns both the scattered radiance (sky color) and transmittance.
 *
 * @param camera Camera position relative to planet center
 * @param view_ray Normalized view direction
 * @param shadow_length Distance along ray that is in shadow (0 = no shadow)
 * @param sun_direction Normalized sun direction
 */
fn GetSkyRadiance(
    atmosphere : AtmosphereParameters,
    camera : vec3f,
    view_ray : vec3f,
    shadow_length : f32,
    sun_direction : vec3f) -> SkySample {
  var local_camera = camera;
  var r = length(local_camera);
  var rmu = dot(local_camera, view_ray);
  let top_radius = atmosphere.top_radius;
  let distance_to_top =
      -rmu - sqrt(rmu * rmu - r * r + top_radius * top_radius);
  if (distance_to_top > 0.0) {
    local_camera = local_camera + view_ray * distance_to_top;
    r = top_radius;
    rmu += distance_to_top;
  } else if (r > top_radius) {
    return SkySample(vec3f(0.0), vec3f(1.0));
  }

  // CLAMP RADIUS FOR LUT SAFETY (MSL < 0 Handling)
  // The atmospheric LUTs are only computed for r >= bottom_radius
  // Clamping here prevents numerical instability and black bands at low altitudes
  let epsilon = 0.001; 
  let r_clamped = max(r, atmosphere.bottom_radius + epsilon);
  
  let mu = rmu / r_clamped;
  
  // GEOMETRIC HORIZON: Calculate the cosine of the horizon angle for this altitude
  let sin_h2 = (atmosphere.bottom_radius * atmosphere.bottom_radius) / (r_clamped * r_clamped);
  let mu_h = -sqrt(max(0.0, 1.0 - sin_h2));
  
  // MU CLAMP: Extend horizon color downwards by clamping mu to the geometric horizon.
  // This handles ground-intersecting rays (in valleys or when msl < 0) by sampling 
  // the sky at the horizon, preventing the hard black cutoff.
  // REVERT: This was causing a fake glow from space. 
  // We only clamp to the LUT range epsilon to avoid artifacts.
  let mu_safe = max(mu, mu_h + 1e-4);
  
  let mu_s = dot(local_camera, sun_direction) / r_clamped;
  let nu = dot(view_ray, sun_direction);
  
  // Always use false for intersects_ground to sample the sky color from LUTs
  let ray_r_mu_intersects_ground = false;

  // GEOMETRIC TERRAIN HANDLING: Always use the sampled transmittance 
  // to prevent the atmosphere from becoming opaque black on ground rays.
  var scatter_result = CombinedScatteringResult(vec3f(0.0), vec3f(0.0));
  var transmittance = SampleTransmittanceLUT(atmosphere, r_clamped, mu_safe);

  if (shadow_length == 0.0) {
    scatter_result = GetCombinedScattering(
        atmosphere, r_clamped, mu_safe, mu_s, nu, ray_r_mu_intersects_ground);
  } else {
    let d = shadow_length;
    let r_p = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r_clamped * mu_safe * d + r_clamped * r_clamped));
    let mu_p = (r_clamped * mu_safe + d) / r_p;
    let mu_s_p = (r_clamped * mu_s + d * nu) / r_p;
    scatter_result = GetCombinedScattering(
        atmosphere, r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground);
    let shadow_transmittance = GetTransmittance(
        atmosphere, r_clamped, mu_safe, shadow_length, ray_r_mu_intersects_ground);
    scatter_result.scattering *= shadow_transmittance;
    scatter_result.single_mie *= shadow_transmittance;
  }

  let radiance = scatter_result.scattering * RayleighPhaseFunction(nu) +
      scatter_result.single_mie * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
  return SkySample(radiance, transmittance);
}

/**
 * GetSkyRadianceToPoint: Computes scattering along a ray segment to a specific point
 *
 * Similar to GetSkyRadiance, but instead of ray-marching to infinity, this computes
 * scattering along a finite ray segment from camera to a specific 3D point. This is
 * used for aerial perspective (atmospheric fog) on objects in the scene.
 *
 * The function:
 * 1. Handles camera outside atmosphere (moves to atmosphere boundary)
 * 2. Computes scattering integral from camera to point
 * 3. Accounts for shadows by subtracting the shadowed portion
 * 4. Returns both scattered radiance and transmittance for compositing
 *
 * @param camera Camera position
 * @param point Target point (e.g., surface intersection)
 * @param shadow_length Length of ray segment that is in shadow
 * @param sun_direction Normalized sun direction
 * @return SkySample with radiance and transmittance
 */
fn GetSkyRadianceToPoint(
    atmosphere : AtmosphereParameters,
    camera : vec3f,
    point : vec3f,
    shadow_length : f32,
    sun_direction : vec3f) -> SkySample {
  let view_ray = normalize(point - camera);
  var local_camera = camera;
  var r = length(local_camera);
  var rmu = dot(local_camera, view_ray);
  let distance_to_top =
      -rmu - sqrt(rmu * rmu - r * r + atmosphere.top_radius * atmosphere.top_radius);
  if (distance_to_top > 0.0) {
    local_camera = local_camera + view_ray * distance_to_top;
    r = atmosphere.top_radius;
    rmu += distance_to_top;
  }

  let mu = rmu / r;
  let mu_s = dot(local_camera, sun_direction) / r;
  let nu = dot(view_ray, sun_direction);
  var d = length(point - local_camera);
  let ray_r_mu_intersects_ground = RayIntersectsGround(atmosphere, r, mu);
  let transmittance = GetTransmittance(atmosphere, r, mu, d, ray_r_mu_intersects_ground);
  var scatter_result = GetCombinedScattering(
      atmosphere, r, mu, mu_s, nu, ray_r_mu_intersects_ground);
  d = max(d - shadow_length, 0.0);
  let r_p = ClampRadius(atmosphere, sqrt(d * d + 2.0 * r * mu * d + r * r));
  let mu_p = (r * mu + d) / r_p;
  let mu_s_p = (r * mu_s + d * nu) / r_p;
  let scatter_p = GetCombinedScattering(
      atmosphere, r_p, mu_p, mu_s_p, nu, ray_r_mu_intersects_ground);
  var shadow_transmittance : vec3f;
  if (shadow_length > 0.0) {
    shadow_transmittance =
        GetTransmittance(atmosphere, r, mu, d, ray_r_mu_intersects_ground);
  } else {
    shadow_transmittance = transmittance;
  }
  scatter_result.scattering -= shadow_transmittance * scatter_p.scattering;
  scatter_result.single_mie -= shadow_transmittance * scatter_p.single_mie;
  scatter_result.single_mie *= smoothstep(0.0, 0.01, mu_s);

  let radiance = scatter_result.scattering * RayleighPhaseFunction(nu) +
      scatter_result.single_mie * MiePhaseFunction(atmosphere.mie_phase_function_g, nu);
  return SkySample(radiance, transmittance);
}

struct SunSkyIrradiance {
  sun : vec3f,
  sky : vec3f,
}

/**
 * GetSunAndSkyIrradiance: Computes direct sun and diffuse sky lighting
 *
 * Returns the total irradiance (incoming light power per area) at a surface point
 * from two sources:
 * 1. Direct sunlight (with atmospheric attenuation)
 * 2. Diffuse skylight (light scattered from the sky dome)
 *
 * The sky irradiance uses a hemisphere integral approximation:
 * - Multiplies by (1 + dot(normal, zenith)) / 2
 * - This is a simple approximation of integrating over the visible hemisphere
 *
 * @param point Surface point position
 * @param normal Surface normal (normalized)
 * @param sun_direction Sun direction (normalized)
 * @return Separated sun and sky irradiance (RGB)
 */
fn GetSunAndSkyIrradiance(
    atmosphere : AtmosphereParameters,
    point : vec3f,
    normal : vec3f,
    sun_direction : vec3f) -> SunSkyIrradiance {
  let r = length(point);
  let mu_s = dot(point, sun_direction) / r;

  // Sky irradiance with hemisphere weighting
  let sky = GetIrradiance(atmosphere, r, mu_s) *
      (1.0 + dot(normal, point) / r) * 0.5;

  // Direct sun irradiance with cosine law (Lambert)
  let sun = atmosphere.solar_irradiance *
      GetTransmittanceToSun(atmosphere, r, mu_s) *
      max(dot(normal, sun_direction), 0.0);

  return SunSkyIrradiance(sun, sky);
}

/**
 * GetSolarRadiance: Converts solar irradiance to radiance
 *
 * The sun is modeled as a uniform disk with angular radius. This function
 * converts the irradiance (W/m²) to radiance (W/m²/sr) by dividing by the
 * solid angle subtended by the sun disk.
 *
 * Solid angle of a disk: Ω = π * sin²(angular_radius) ≈ π * angular_radius²
 *
 * @return Solar radiance (RGB)
 */
fn GetSolarRadiance(atmosphere : AtmosphereParameters) -> vec3f {
  return atmosphere.solar_irradiance /
      (PI * atmosphere.sun_angular_radius * atmosphere.sun_angular_radius);
}


/**
 * GetSunVisibility: Checks if avatar sphere occludes the sun
 *
 * Computes whether the avatar sphere blocks the sun when viewed from a given point.
 * Returns a smooth [0,1] visibility factor.
 * @param point Surface point (relative to camera)
 * @param avatarOffset Avatar sphere offset from camera
 * @param sun_direction Direction to sun
 * @param sun_size Sun angular size parameters
 * @return Visibility factor [0,1]
 */
fn GetSunVisibility(point : vec3f, avatarOffset : vec3f, sun_direction : vec3f, sun_size : vec2f) -> f32 {
  var visibility = 1.0;
  
  // Check avatar sphere occlusion (both point and avatar are relative to camera)
  let p = point - avatarOffset;
  let p_dot_v = dot(p, sun_direction);
  let p_dot_p = dot(p, p);
  let ray_sphere_sq = p_dot_p - p_dot_v * p_dot_v;
  let dist = -p_dot_v - sqrt(max(0.0, getAvatarRadius() * getAvatarRadius() - ray_sphere_sq));
  
  if (dist > 0.0) {
    let ray_dist = getAvatarRadius() - sqrt(ray_sphere_sq);
    let ray_ang_dist = -ray_dist / p_dot_v;
    visibility *= smoothstep(1.0, 0.0, ray_ang_dist / sun_size.x);
  }
  
  return visibility;
}

/**
 * GetSkyVisibility: Computes sky visibility considering avatar sphere
 *
 * Approximates how much sky hemisphere is visible from a point.
 * @param point Surface point (relative to camera)
 * @param avatarOffset Avatar sphere offset from camera
 * @return Sky visibility factor (typically close to 1.0)
 */
fn GetSkyVisibility(point : vec3f, avatarOffset : vec3f) -> f32 {
  var visibility = 1.0;
  
  // Avatar sphere contribution
  let p = point - avatarOffset;
  let p_dot_p = dot(p, p);
  let contrib = 1.0 + p.z / sqrt(p_dot_p) * getAvatarRadius() * getAvatarRadius() / p_dot_p;
  visibility *= clamp(contrib, 0.0, 1.0);
  
  return visibility;
}

// ============================================================================
// SHADER ENTRY POINTS
// ============================================================================

struct VertexInput {
  @location(0) position : vec2f,  // 2D position in clip space [-1,1]
}

struct VertexOutput {
  @builtin(position) position : vec4f,  // Clip space position for rasterizer
  @location(0) view_ray : vec3f,        // View ray direction in world space
}

struct FragmentOutput {
  @location(0) color : vec4f,
  @builtin(frag_depth) depth : f32,
}

/**
 * Vertex Shader: Fullscreen quad with view ray computation
 *
 * This shader:
 * 1. Passes through the clip space position (fullscreen quad vertices)
 * 2. Computes the view ray direction for each vertex by:
 *    - Transforming clip position to view space (inverse projection)
 *    - Transforming to world space (inverse view matrix)
 *
 * The view ray is then interpolated across the triangle and used in the
 * fragment shader to ray-march through the atmosphere.
 */
@vertex
fn vs_main(input : VertexInput) -> VertexOutput {
  var clip = vec4f(input.position, 0.0, 1.0);
  var output : VertexOutput;
  output.position = clip;

  // Transform clip space position to world space direction
  let view_clip = globals.view_from_clip * clip;
  output.view_ray =
      (globals.model_from_view * vec4f(view_clip.xyz, 0.0)).xyz;

  return output;
}

/**
 * Fragment Shader: Main atmospheric rendering
 *
 * This shader renders:
 * 1. Sky - Atmospheric scattering in all directions
 * 2. Sun - Solar disk with proper size and limb darkening
 * 3. Ground - Earth surface with atmospheric effects
 * 4. Demo sphere - Small object demonstrating aerial perspective
 *
 * The rendering process:
 * 1. Ray-cast to find intersections with ground and demo sphere
 * 2. Compute direct lighting (sun + sky irradiance) for surfaces
 * 3. Add atmospheric scattering between camera and surfaces
 * 4. Composite sky, sun disk, and surfaces
 * 5. Apply tone mapping and gamma correction
 *
 * Returns final RGBA color ready for display.
 */
@fragment
fn fs_main(input : VertexOutput) -> FragmentOutput {
  let view_ray = input.view_ray;
  let view_dir = normalize(view_ray);
  var output : FragmentOutput;
  
  // =========================================================================
  // CAMERA-AT-ORIGIN RENDERING (OVGrid Style)
  // The camera is ALWAYS at (0,0,0) in the shader. Everything is relative.
  // This eliminates ALL large-number operations that cause jitter.
  // =========================================================================
  let camera = vec3f(0.0, 0.0, 0.0);  // Camera at origin!
  
  // earth_center_offset is the OFFSET from camera to earth center
  // Since camera = origin, this IS the position of earth center
  let earth_center_offset = globals.earth_center.xyz;
  let earth_center = earth_center_offset;  // No addition needed, camera is at 0!
  
  // camera_from_earth = camera - earth_center = (0,0,0) - earth_center = -earth_center
  let camera_from_earth = -earth_center_offset;
  
  let sun_direction = normalize(globals.sun_direction_size.xyz);
  // white_point_size.w encodes: integer part = debug flags, fractional part = cos(sun_angular_radius)
  let cos_sun_angular_radius = fract(globals.white_point_size.w);
  let sun_size = vec2f(globals.sun_direction_size.w, cos_sun_angular_radius);
  let exposure = globals.camera_exposure.w;
  let white_point = globals.white_point_size.xyz;

  // Compute angular size of this pixel for anti-aliasing
  let fragment_angular_size =
      length(dpdx(view_ray) + dpdy(view_ray)) / max(length(view_ray), 1e-5);

  // Calculate avatar offset (relative to camera) for shadow calculations
  let avatarOffset = getAvatarOffset();       // Avatar position relative to camera

  // Light shaft fade based on sun elevation (avoid artifacts at sunset)
  let lightshaft_fadein_hack = smoothstep(
      0.02, 0.04, dot(normalize(camera_from_earth), sun_direction));

  // Ground intersection disabled - geometric terrain handles ground rendering
  var ground_alpha = 0.0;
  var ground_radiance = vec3f(0.0);
  var ground_distance = -1.0;
  
  // WebGPU FIX: Prevent irradiance_texture (binding 3) from being optimized out
  let dummy_irradiance = textureSampleLevel(irradiance_texture, lut_sampler, vec2f(0.0), 0.0);
  if (dummy_irradiance.a > 1e10) { ground_radiance += dummy_irradiance.rgb; }

  // ======================================================================
  // Sky and Sun Disk Rendering
  // ======================================================================

  let sky = GetSkyRadiance(
      ATMOSPHERE, camera_from_earth, view_dir,
      0.0, sun_direction);

  // ======================================================================
  // Final Composition and Tone Mapping
  // ======================================================================

  // Get terrain mode for composition decision
  let compositeTerrainMode = i32(globals.earth_center.w) % 100;
  
  var radiance: vec3f;
  if (compositeTerrainMode == 1 || compositeTerrainMode == 2) {
    radiance = vec3f(0.0);  // Black background for heightmap modes
  } else {
    // 1. SKY RADIANCE (Initial)
    radiance = sky.radiance;
    
    // Dynamic Sun Irradiance: Soft, Radiant, and Powerful (Inspired by user code)
    let sunDot = dot(view_dir, sun_direction);
    let up = normalize(camera_from_earth);
    let elevation = dot(up, sun_direction);
    
    // Path-based atmosphere factor: Fades in atmospheric personality based on optical depth
    let r_cam = length(camera_from_earth);
    let top_r = ATMOSPHERE.top_radius;
    let is_in_atmosphere = r_cam < top_r;
    
    // atmospherePresence: 1.0 inside air, 0.0 in pure vacuum.
    // FIX: Calculate a uniform factor for the SUN, not per-pixel, to avoid warping.
    let r_clamped_cam = max(r_cam, ATMOSPHERE.bottom_radius + 0.01);
    let mu_s_cam = dot(normalize(camera_from_earth), sun_direction);
    let solarTrans = SampleTransmittanceLUT(ATMOSPHERE, r_clamped_cam, mu_s_cam);
    let avgSolarTrans = dot(solarTrans, vec3f(0.3333));
    
    // Ensure 0.0 in space, smooth fade based on transmittance if in range
    // Broadened range: starts changing much earlier (trans 0.85) for a progressive feel
    let altitudeFactor = 1.0 - smoothstep(top_r - 10.0, top_r + 20.0, r_cam);
    let pathFactor = 1.0 - smoothstep(0.85, 1.0, avgSolarTrans);
    let atmospherePresence = altitudeFactor * pathFactor;
    
    // Smooth atmosphere/horizon factors
    let sunsetFactor = smoothstep(0.2, -0.1, elevation);
    
    // 1. DYNAMIC SOLAR CORE (Sharpness & Color)
    // Ultra-extreme sharpening (35000-85000+) for a true pinpoint look
    let spacePower = 85000.0; 
    // Even sharper midday (45000) to minimize footprint, soft sunset (150)
    let baseAtmospherePower = mix(45000.0, 150.0, sunsetFactor); 
    let corePower = mix(spacePower, baseAtmospherePower, atmospherePresence);
    
    let coreIntensity = pow(max(sunDot, 0.0), corePower);
    
    // CORE COLOR: Cold blueish-white in space, pure neutral white at midday
    let spaceCoreColor = vec3f(500.0, 520.0, 580.0); 
    let atmosphereCoreColor = mix(vec3f(15.0, 13.0, 10.0), vec3f(250.0), smoothstep(0.00, 0.2, elevation));
    
    let coreColor = mix(spaceCoreColor, atmosphereCoreColor, atmospherePresence);
    
    // 2. ATMOSPHERIC HALO (Irradiance)
    // Ultra-tight midday halo, massive diffusion at sunset
    let middayHaloPower = mix(800.0, 500.0, atmospherePresence); 
    // CRITICAL FIX: Only allow bloom boost if in atmosphere. In space, always use pinpoint 18000.
    let targetHaloPower = mix(middayHaloPower, 40.0, sunsetFactor);
    let haloPower = mix(18000.0, targetHaloPower, atmospherePresence);
    let haloIntensity = pow(max(sunDot, 0.0), haloPower);
    
    // Halo Color: Cold Blue/White (Space/Midday) -> Orange (Sunset)
    let spaceHaloColor = vec3f(1.1, 1.3, 2.0); 
    let sunsetOrange = vec3f(2.0, 0.8, 0.2);
    let middayWhite = vec3f(1.8, 1.8, 2.0); 
    let atmosphereHaloColor = mix(middayWhite, sunsetOrange, sunsetFactor);
    let haloColor = mix(spaceHaloColor, atmosphereHaloColor, atmospherePresence);
    
    // NEW: Midday Inner Halo (Fourth Layer)
    let innerHaloFactor = smoothstep(0.1, 0.3, elevation) * atmospherePresence;
    let atmosphereInnerHaloIntensity = pow(max(sunDot, 0.0), 15000.0);
    let atmosphereInnerHaloColor = vec3f(3.0, 3.0, 3.2); 
    let atmosphereInnerHaloStrength = 0.15 * innerHaloFactor;
    
    // 3. TRANSMITTANCE & BOOST COMPENSATION
    // CRITICAL FIX: No minimum transmittance boost from space. 
    // This stops the sun from bleeding through the planet.
    var effectiveTrans = sky.transmittance;
    if (is_in_atmosphere) {
        let minTrans = vec3f(0.25, 0.15, 0.1) * sunsetFactor;
        effectiveTrans = max(sky.transmittance, minTrans);
    }
    
    // 4. FINAL COMPOSITION (Scattering)
    // We combine all scattering components first so we can shadow them together
    let spaceHaloStrength = 0.8; 
    let atmosphereHaloStrength = mix(0.05, 1.2, sunsetFactor);
    let haloStrength = mix(spaceHaloStrength, atmosphereHaloStrength, atmospherePresence);
    
    let spaceOuterHaloPower = 600.0;
    let spaceOuterHaloIntensity = pow(max(sunDot, 0.0), spaceOuterHaloPower);
    let spaceOuterHaloColor = vec3f(1.0, 1.1, 1.4);
    let spaceOuterHaloStrength = 0.0005 * (1.0 - atmospherePresence);
    
    radiance += effectiveTrans * haloColor * haloIntensity * haloStrength;
    radiance += effectiveTrans * spaceOuterHaloColor * spaceOuterHaloIntensity * spaceOuterHaloStrength;
    radiance += effectiveTrans * atmosphereInnerHaloColor * atmosphereInnerHaloIntensity * atmosphereInnerHaloStrength;

    // 5. APPLY VOLUMETRIC SHADOWS (God Rays)
    // We apply this to the haze/scattering components to create light beams
    let volumetricEnabled = globals.cloud_params.w > 0.5;
    if (volumetricEnabled) {
      let volVisibility = GetVolumetricShadowVisibility(view_dir, sun_direction, input.position.xy);
      
      // Dramatic contrast (floor centralized in atmosphereConfig.js)
      let volEffect = mix(${ATMOSPHERE_CONFIG.volumetricShadowAmbient.toFixed(2)}, 1.0, volVisibility);
      radiance *= volEffect;
    }

    // 6. DIRECT SUN LIGHT (Unshadowed Core)
    let spaceCoreStrength = 0.8; 
    let atmosphereCoreStrength = mix(0.3, 3.8, sunsetFactor);
    let coreStrength = mix(spaceCoreStrength, atmosphereCoreStrength, atmospherePresence);
    radiance += effectiveTrans * coreColor * coreIntensity * coreStrength;

    // Sun disk
    if (sunDot > sun_size.y) {
      let diskBoost = max(sky.transmittance, vec3f(0.3) * sunsetFactor * atmospherePresence);
      radiance += diskBoost * GetSolarRadiance(ATMOSPHERE) * mix(0.4, 2.0, atmospherePresence);
    }

    // === RADIANT SUN GLOW — artistic multi-layer halo (ported from reference) ===
    // Three concentric pow() rings stacked on top of the physical scattering give
    // the sun a bright radiant bloom instead of a flat disk. Pure ALU math — no
    // texture taps — so the cost is negligible.
    {
      let sd = max(sunDot, 0.0);
      let sunHorizon = 1.0 - smoothstep(0.0, 0.35, elevation); // 1 at horizon, 0 when high
      let horizonBoost = 1.0 + sunHorizon * 2.0;               // up to 3x brighter at horizon
      let glowTight = pow(sd, 3000.0) * 1.6;
      let glowMed   = pow(sd, 900.0)  * 0.40;
      let glowWide  = pow(sd, 260.0)  * 0.10;
      // Warm white when high, deep orange near the horizon
      let sunGlowCol = mix(vec3f(1.0, 0.97, 0.90), vec3f(1.0, 0.55, 0.25), sunHorizon);
      let sunGlow = (glowTight + glowMed + glowWide) * horizonBoost;
      radiance += effectiveTrans * sunGlowCol * sunGlow * mix(6.0, 22.0, atmospherePresence);
    }

    // === MOON RENDERING (clean disk + soft glow, like sun from space) ===
    let moonBrightness = globals.moon_dir.w;
    let moon_direction = select(vec3f(0.0, 1.0, 0.0), normalize(globals.moon_dir.xyz), moonBrightness > 0.001);
    let moonDot = dot(view_dir, moon_direction);
    let moonElevation = dot(up, moon_direction);
    let moonAboveHorizon = smoothstep(-0.15, 0.05, moonElevation);

    if (moonBrightness > 0.001 && moonAboveHorizon > 0.0) {
      // === RADIANT MOON — multi-layer glow ported from reference ===
      // A bright core plus three concentric pow() rings plus an atmospheric halo.
      // This replaces the old flat 2-layer disk so the moon reads luminous.
      let md = max(moonDot, 0.0);
      let moonHorizon = 1.0 - smoothstep(0.0, 0.4, moonElevation); // 1 at horizon, 0 high
      let moonBoost = 1.0 + moonHorizon * 1.5;                     // up to 2.5x at horizon

      // Bright core disk — saturates to white through tone mapping
      let moonDisk = smoothstep(0.99990, 0.99997, md);

      // Concentric glow rings — the radiant bloom around the disk
      let glowInner = pow(md, 2200.0) * 1.0  * moonBoost;
      let glowOuter = pow(md, 650.0)  * 0.22 * moonBoost;
      let glowWide  = pow(md, 160.0)  * 0.09 * moonBoost;

      // Atmospheric halo — cool blue-white moonlight scattering, wider at horizon
      let haloExp = mix(34.0, 13.0, moonHorizon);
      let haloInt = mix(0.05, 0.16, moonHorizon);
      let moonHalo = pow(md, haloExp) * haloInt;

      // Cool white when high, pale silver-blue near the horizon
      let moonCol = mix(vec3f(0.95, 0.97, 1.0), vec3f(0.78, 0.86, 1.0), moonHorizon);
      let moonHaloCol = vec3f(0.70, 0.80, 1.0);

      let moonLayers = moonDisk * 12.0 + glowInner + glowOuter + glowWide;
      radiance += moonCol * moonLayers * moonBrightness * moonAboveHorizon * 7.0;
      radiance += moonHaloCol * moonHalo * moonBrightness * moonAboveHorizon * 4.0;
    }

    // STARRY SKY - Procedural stars visible in dark sky areas
    // Calculate sky luminance to determine star visibility
    let skyLuminance = dot(radiance, vec3f(0.2126, 0.7152, 0.0722));
    let starVisibility = smoothstep(0.1, 0.0, skyLuminance);  // Stars fade as sky brightens
    
    if (starVisibility > 0.01) {
      let stars = getStars(view_dir);
      radiance = radiance + stars * starVisibility;
    }

    // Lunar atmospheric scattering - dark blue night sky
    if (moonBrightness > 0.001 && moonAboveHorizon > 0.01) {
      let moonSky = GetSkyRadiance(ATMOSPHERE, camera_from_earth, view_dir, 0.0, moon_direction);
      let moonScatter = moonSky.radiance * moonBrightness * 5.0 * moonAboveHorizon;
      radiance += moonScatter * vec3f(0.4, 0.5, 1.0);
    }

    // === AURORA BOREALIS — Configurable procedural curtains ===
    let auroraIntensity = globals.sky_stylization.z;
    let auroraSpeed = globals.sky_stylization.w;
    let auroraAlt = globals.sky_tint.w;           // 0-1 curtain height
    let auroraBaseCol = globals.rain_params.yzw;   // Base color RGB
    let auroraTopCol = vec3f(globals.cloud_layer1_color.w, globals.cloud_layer2_color.w, globals.cloud_layer3_color.w);
    let view_elev = dot(view_dir, up);
    if (auroraIntensity > 0.001 && starVisibility > 0.01 && view_elev > 0.01) {
      let t = globals.time_data.x * auroraSpeed;

      // Ray-sphere: aurora shell altitude controlled by slider (10-25km)
      let aurora_h = mix(10.0, 25.0, auroraAlt);
      let r_aurora = ATMOSPHERE.bottom_radius + aurora_h;
      let oc = camera_from_earth;
      let b_a = dot(oc, view_dir);
      let c_a = dot(oc, oc) - r_aurora * r_aurora;
      let disc_a = b_a * b_a - c_a;

      if (disc_a > 0.0) {
        let sqrt_disc = sqrt(disc_a);
        let t_near = -b_a - sqrt_disc;
        let t_far = -b_a + sqrt_disc;
        let t_hit_a = select(t_far, t_near, t_near > 0.0);

        if (t_hit_a > 0.0) {
          let hit_pos = oc + view_dir * t_hit_a;
          let hit_n = normalize(hit_pos);

          let a_lat = asin(clamp(hit_n.y, -1.0, 1.0));
          let a_lon = atan2(hit_n.z, hit_n.x);

          // Aurora oval — bands at ~55-75 degrees latitude
          let abs_lat = abs(a_lat);
          let oval_center = 1.13;
          let oval_sigma = 0.18;
          let lat_offset = abs_lat - oval_center;

          // Curtain folds with organic undulations
          let warp = sin(a_lon * 4.0 + t * 0.04) * 0.6
                   + sin(a_lon * 9.0 - t * 0.07) * 0.3;
          let warped_lat = lat_offset + warp * 0.08;
          let curtain = exp(-(warped_lat * warped_lat) / (2.0 * oval_sigma * oval_sigma));

          // Brightness variation along longitude
          let bright1 = sin(a_lon * 2.5 + t * 0.06 + sin(a_lon * 6.0 + t * 0.03) * 0.7) * 0.5 + 0.5;
          let bright2 = sin(a_lon * 7.0 - t * 0.09) * 0.5 + 0.5;
          let brightness = bright1 * 0.65 + bright2 * 0.35;

          // Vertical ray streaks
          let ray_base = a_lon * 35.0 + sin(a_lon * 8.0 + t * 0.05) * 3.0;
          let ray_streak = pow(max(sin(ray_base) * 0.5 + 0.5, 0.0), 4.0);
          let vert_structure = mix(0.4, 1.0, ray_streak);

          // Height fade
          let height_param = smoothstep(0.01, 0.7, view_elev);
          let height_fade = exp(-height_param * 1.8) * 0.7 + 0.3;

          // Shimmer
          let pulse = sin(t * 0.25 + a_lon * 1.5) * 0.12 + 0.88;
          let flicker = sin(t * 2.1 + a_lon * 11.0) * 0.06 + 0.94;

          // User-configurable color gradient: base color at low → top color high
          let mid_col = mix(auroraBaseCol, auroraTopCol, 0.5) * vec3f(0.6, 0.4, 1.2);
          let c_low = mix(auroraBaseCol, mid_col, smoothstep(0.1, 0.45, height_param));
          let aurora_col = mix(c_low, auroraTopCol, smoothstep(0.45, 0.85, height_param));

          let horizon_fade = smoothstep(0.01, 0.1, view_elev);
          let zenith_fade = smoothstep(0.95, 0.65, view_elev);

          let alpha = curtain * brightness * vert_structure * height_fade
                    * pulse * flicker * horizon_fade * zenith_fade
                    * auroraIntensity * starVisibility;
          radiance += aurora_col * alpha * 1.5;
        }
      }
    }

    // BAKED CLOUDS - High Performance (Option 2: Sampled Texture)
    let cloud_altitude = r_cam - ATMOSPHERE.bottom_radius;
    let cloud_opacity = 1.0 - smoothstep(${ATMOSPHERE_CONFIG.cloudFadeStart.toFixed(1)}, ${ATMOSPHERE_CONFIG.cloudFadeEnd.toFixed(1)}, cloud_altitude);
    
    var clouds = vec4f(0.0);
    let vdotu = dot(view_dir, up);
    let looking_up = vdotu > 0.01; 
    let should_render_clouds = cloud_opacity > 0.01 && looking_up;
    
    if (should_render_clouds) {
      // 1. HYBRID INTERSECTION (Planar for zenith, Spherical for horizon)
      let h = ${ATMOSPHERE_CONFIG.cloudAltitude.toFixed(1)}; 
      let R = r_cam + h;
      
      let t_flat = h / vdotu;
      
      // Spherical intersection distance
      let b = r_cam * vdotu;
      let c = r_cam * r_cam - R * R;
      let d = b * b - c;
      let t_sphere = select(t_flat, -b + sqrt(max(d, 0.0)), d >= 0.0);
      
      // Curvature weight
      let horizon_weight = smoothstep(0.0, 0.8, 1.0 - vdotu);
      let t_hit = mix(t_flat, t_sphere, horizon_weight);

      let hit_pos_absolute = camera_from_earth + view_dir * t_hit;
      
      // 2. TRIPLANAR CLOUD PROJECTION (No polar singularity)
      let hit_dir = normalize(hit_pos_absolute);
      let absN = abs(hit_dir);
      let triW = absN * absN * absN;
      let triWSum = triW.x + triW.y + triW.z;

      let time_val = globals.time_data.x;
      let animatedOffset = time_val * 0.1;

      // Layer 1 (Primary) - triplanar sampling
      let s1 = ${_triScale1.toFixed(1)};
      let off1 = animatedOffset * ${ATMOSPHERE_CONFIG.cloudLayer1Speed.toFixed(2)};
      let noiseValue1 = (
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.yz * s1 + off1, 0.0).r * triW.x +
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.xz * s1 + off1, 0.0).r * triW.y +
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.xy * s1 + off1, 0.0).r * triW.z
      ) / triWSum;

      // Layer 2 (Broad) - triplanar sampling
      let s2 = ${_triScale2.toFixed(1)};
      let off2 = animatedOffset * ${ATMOSPHERE_CONFIG.cloudLayer2Speed.toFixed(2)};
      let noiseValue2 = (
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.yz * s2 + off2, 0.0).r * triW.x +
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.xz * s2 + off2, 0.0).r * triW.y +
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.xy * s2 + off2, 0.0).r * triW.z
      ) / triWSum;

      // Layer 3 (Stratospheric) - triplanar sampling
      let s3 = ${_triScale3.toFixed(1)};
      let off3 = animatedOffset * ${ATMOSPHERE_CONFIG.cloudLayer3Speed.toFixed(2)};
      let noiseValue3 = (
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.yz * s3 + off3, 0.0).r * triW.x +
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.xz * s3 + off3, 0.0).r * triW.y +
        textureSampleLevel(cloud_texture, lut_sampler, hit_dir.xy * s3 + off3, 0.0).r * triW.z
      ) / triWSum;

      // 5. DENSITY & PARAMETERS
      let coverage = globals.cloud_params.x;
      let layer1_visibility = globals.time_data.y;
      let layer2_visibility = globals.time_data.z;
      let layer3_visibility = globals.time_data.w;
      
      // Layer 1 Density (Base structure)
      // Hard-Shift Tuning: Slider 0.0 = Visible Fair Weather
      let threshold_min1 = ${ATMOSPHERE_CONFIG.cloudLayer1Threshold.toFixed(2)} - (coverage * ${ATMOSPHERE_CONFIG.cloudLayer1CoverageScale.toFixed(2)});
      let threshold_max1 = threshold_min1 + 0.4;
      let density1 = smoothstep(threshold_min1, threshold_max1, noiseValue1) * layer1_visibility;
      
      // Layer 2 Density (Softer & Broad)
      let threshold_min2 = ${ATMOSPHERE_CONFIG.cloudLayer2Threshold.toFixed(2)} - (coverage * ${ATMOSPHERE_CONFIG.cloudLayer2CoverageScale.toFixed(2)});
      let threshold_max2 = threshold_min2 + 0.5;
      let density2 = smoothstep(threshold_min2, threshold_max2, noiseValue2) * (0.4 * layer2_visibility);

      // Layer 3 Density (Soft Cirrus - diffuse connector between layers)
      let threshold_min3 = 0.45 - (coverage * 0.35);
      let threshold_max3 = threshold_min3 + 0.45;
      let density3 = smoothstep(threshold_min3, threshold_max3, noiseValue3) * (0.5 * layer3_visibility);

      // Combine layers (Additive-ish)
      let total_density = saturate(density1 + density2 + density3);
      
      // Fading & Color
      let horizon_fade = 1.0 - smoothstep(150.0, 1000.0, t_hit);
      let adjusted_density = total_density * horizon_fade;
      
      // 6. CLOUD COLORS & TINTING
      let brightCloud = vec3f(1.0, 1.0, 1.0);
      let stormCloud = vec3f(0.5, 0.7, 1.0); // Soft blueish storm base
      
      // Calculate color for each layer with its specific tint
      let color1 = mix(stormCloud, brightCloud, density1) * globals.cloud_layer1_color.rgb;
      let color2 = mix(stormCloud, brightCloud, density2) * globals.cloud_layer2_color.rgb;
      let color3 = mix(stormCloud, brightCloud, density3) * globals.cloud_layer3_color.rgb;
      
      // Combine colors based on density
      // Weighted average to preserve individual tints
      let total_weights = max(density1 + density2 + density3, 0.001);
      let combined_base_color = (color1 * density1 + color2 * density2 + color3 * density3) / total_weights;
      
      let sun_lit = max(dot(view_dir, sun_direction), 0.0) * 0.3 + 0.7;
      var cloud_color = combined_base_color * sun_lit * sky.transmittance;

      // Lunar cloud illumination
      let moon_lit = max(dot(view_dir, moon_direction), 0.0) * 0.2 + 0.8;
      cloud_color += combined_base_color * moon_lit * moonBrightness * vec3f(0.6, 0.7, 1.0) * moonAboveHorizon * 3.0;

      // LIGHTNING CLOUD ILLUMINATION — 4-layer angular glow (ported from
      // reference/ovgrid-webgpu sky.wgsl). The previous single-radius
      // exponential gave a flat ball of light around the strike point; the
      // 4-layer angular version reads as "a flash lit up half the cloud
      // ceiling" — much more dramatic. Each layer is a wider, dimmer cone
      // around the strike direction, and the total is gated by cloud density
      // squared so empty sky doesn't glow.
      let flash = globals.lightning_params.x;
      if (flash > 0.01) {
          let strikePos = globals.lightning_params.yzw;
          // We're on a sphere — world Y is NOT necessarily "up" at the avatar.
          // Use the local up (normalized vector from earth centre through
          // the camera) and build the flash direction in that local frame so
          // the cloud glow always lands on the clouds ABOVE the strike point
          // regardless of where on the planet the avatar is standing.
          let localUp = globals.extra_data.yzw;
          let strikeUp = dot(strikePos, localUp);
          let strikeTangent = strikePos - localUp * strikeUp;
          let strikeTangentLen = max(length(strikeTangent), 0.001);
          let strikeTangentDir = strikeTangent / strikeTangentLen;
          let flashDir = normalize(strikeTangentDir + localUp * 0.25);
          let viewN = normalize(view_dir);
          let dotToFlash = dot(viewN, flashDir);

          let coreGlow = smoothstep(0.85, 0.98, dotToFlash);
          let coreIntensity = pow(coreGlow, 2.0) * 2.5;

          let innerGlow = smoothstep(0.75, 0.92, dotToFlash);
          let innerIntensity = pow(innerGlow, 1.5) * 1.5;

          let outerGlow = smoothstep(0.55, 0.85, dotToFlash);
          let outerIntensity = outerGlow * 0.6;

          let ambientGlow = smoothstep(0.35, 0.7, dotToFlash);
          let ambientIntensity = ambientGlow * 0.25;

          let coreColor = vec3f(1.0, 1.0, 1.0);
          let innerColor = vec3f(1.0, 0.95, 0.85);
          let outerColor = vec3f(1.0, 0.88, 0.7);
          let ambientColor = vec3f(0.9, 0.8, 0.65);

          let cloudInfluence = adjusted_density * adjusted_density;
          let totalGlow = coreColor * coreIntensity
                        + innerColor * innerIntensity
                        + outerColor * outerIntensity
                        + ambientColor * ambientIntensity;
          cloud_color = cloud_color + totalGlow * flash * cloudInfluence;
      }

      let alpha = adjusted_density * 0.9 * cloud_opacity;
      clouds = vec4f(cloud_color * alpha, alpha);
    }
    radiance = radiance * (1.0 - clouds.a) + clouds.rgb;
  }

  // ========================================================================
  // COMPOSITING - Sky only (geometric terrain handles all surfaces)
  // ========================================================================
  var final_radiance = radiance;

  // STORM SKY DARKENING — daytime-aware desaturation + steel-blue tint when
  // rain is heavy (ported from reference/ovgrid-webgpu sky.wgsl). Preserves
  // night sky colour: the gated isDaytime factor only applies the gray
  // wash during the day, so a winter snowstorm at night stays correctly dark
  // instead of turning into a beige fog. Five-step recipe: darken, partial
  // desaturate, push toward steel-blue, contrast tweak, night-only extra dim.
  let stormFactor = globals.rain_params.x;
  if (stormFactor > 0.01) {
    let currentBrightness = (final_radiance.r + final_radiance.g + final_radiance.b) / 3.0;
    let isDaytime = smoothstep(0.05, 0.25, currentBrightness);
    let effectStrength = stormFactor * isDaytime;

    if (effectStrength > 0.01) {
      let luminance = dot(final_radiance, vec3f(0.299, 0.587, 0.114));
      let darkenFactor = 1.0 - effectStrength * 0.40;
      final_radiance = final_radiance * darkenFactor;
      let desatAmount = min(effectStrength * 0.7, 0.6);
      final_radiance = mix(final_radiance, vec3f(luminance * darkenFactor), desatAmount);
      let stormBlueGray = vec3f(0.35, 0.42, 0.55);
      let stormDarkBlue = vec3f(0.25, 0.32, 0.45);
      let stormTarget = mix(stormBlueGray, stormDarkBlue, effectStrength);
      let blueTintStrength = effectStrength * 0.65;
      let tintedStorm = stormTarget * (luminance * 0.8 + 0.4);
      final_radiance = mix(final_radiance, tintedStorm, blueTintStrength);
      let avgBrightness = (final_radiance.r + final_radiance.g + final_radiance.b) / 3.0;
      final_radiance = mix(final_radiance, vec3f(avgBrightness * 0.95, avgBrightness, avgBrightness * 1.08), effectStrength * 0.12);
    }

    if (isDaytime < 0.5 && stormFactor > 0.1) {
      let nightDarken = stormFactor * (1.0 - isDaytime) * 0.3;
      final_radiance = final_radiance * (1.0 - nightDarken);
    }
  }

  // PROCEDURAL SKY BOLT — zigzag rendered into the sky shader so the bolt is
  // visible from any distance (the particle bolt fades by ~100 m). All
  // angles computed in the avatar's LOCAL tangent frame (not world Y/X/Z)
  // because we're on a sphere — world Y is "up" only at the planet's north
  // pole; everywhere else the local up is some arbitrary direction. Without
  // this projection the bolt comes out tilted/horizontal as the avatar
  // walks around the planet.
  let skyFlash = globals.lightning_params.x;
  if (skyFlash > 0.01 && stormFactor > 0.3) {
    let strikePos2 = globals.lightning_params.yzw;
    let localUp2 = globals.extra_data.yzw;

    // Decompose strike into "up component" + "tangent component" in the
    // avatar's local frame.
    let strikeUp2 = dot(strikePos2, localUp2);
    let strikeTan = strikePos2 - localUp2 * strikeUp2;
    let strikeTanLen = length(strikeTan);

    if (strikeTanLen > 0.001) {
      let strikeTanDir = strikeTan / strikeTanLen;
      // strikeRight is a tangent vector perpendicular to strikeTanDir — gives
      // us a signed azimuth axis so the bolt's zigzag has direction (left/right).
      let strikeRight = cross(localUp2, strikeTanDir);

      // Decompose view ray into the same frame.
      let viewN2 = normalize(view_dir);
      let rayUp = dot(viewN2, localUp2);
      let rayTan = viewN2 - localUp2 * rayUp;
      let rayTanLen = length(rayTan);

      if (rayTanLen > 0.05) {
        // Projection of the ray onto the strike's tangent basis.
        let rayAlongStrike = dot(rayTan, strikeTanDir) / rayTanLen;
        let rayAcrossStrike = dot(rayTan, strikeRight) / rayTanLen;

        // Inside the azimuthal cone around the strike?
        // rayAlongStrike > cos(0.25 rad) ≈ 0.97 means the ray points
        // mostly in the same horizontal direction as the strike.
        if (rayAlongStrike > 0.85) {
          let boltTopElev = 0.55;
          let boltBotElev = -0.08;
          let rayElev = rayUp;

          if (rayElev < boltTopElev && rayElev > boltBotElev) {
            let boltProgress = (boltTopElev - rayElev) / (boltTopElev - boltBotElev);

            let boltSeed = strikePos2.x * 17.3 + strikePos2.z * 23.7;
            let zigzagFreq = 7.0 + fract(sin(boltSeed) * 43758.5453) * 5.0;
            let zigzag1 = sin(boltProgress * zigzagFreq + boltSeed) * 0.025;
            let zigzag2 = sin(boltProgress * zigzagFreq * 2.3 + boltSeed * 1.7) * 0.012;
            let zigzag3 = sin(boltProgress * zigzagFreq * 4.7 + boltSeed * 2.3) * 0.005;
            let totalZigzag = zigzag1 + zigzag2 + zigzag3;

            // distFromBolt is the signed azimuthal offset of the ray minus
            // the zigzag offset — measured in the strikeRight axis (≈ small
            // angle in radians since strikeRight is orthogonal in the tangent
            // plane and rayAcrossStrike is sin(angle) ≈ angle for small ones).
            let distFromBolt = abs(rayAcrossStrike - totalZigzag);

            let boltWidth = 0.018 * (1.0 - boltProgress * 0.4);
            let core = smoothstep(boltWidth, boltWidth * 0.1, distFromBolt);
            let glow = smoothstep(boltWidth * 4.0, boltWidth * 0.3, distFromBolt);
            let halo = smoothstep(boltWidth * 10.0, boltWidth * 1.5, distFromBolt);

            let fade = 1.0 - boltProgress * 0.25;
            let boltColor = (vec3f(1.0) * core * 5.0
                           + vec3f(0.85, 0.9, 1.0) * glow * 2.5
                           + vec3f(0.6, 0.7, 0.95) * halo * 0.8) * skyFlash * fade;

            final_radiance = final_radiance + boltColor;
          }
        }
      }
    }
  }

  // Artistic Stylization
  let saturation = globals.sky_stylization.x;
  let vibrance = globals.sky_stylization.y;
  let tint = globals.sky_tint.xyz;

  // 1. Apply Tint
  final_radiance = final_radiance * tint;

  // 2. Apply Saturation (Luminance extraction)
  let luma = dot(final_radiance, vec3f(0.2126, 0.7152, 0.0722));
  final_radiance = mix(vec3f(luma), final_radiance, saturation);
  
  // 3. Simple Vibrance (boost less saturated pixels)
  let max_c = max(final_radiance.r, max(final_radiance.g, final_radiance.b));
  let min_c = min(final_radiance.r, min(final_radiance.g, final_radiance.b));
  let sat = (max_c - min_c) / (max_c + 1e-5);
  final_radiance = final_radiance * (1.0 + vibrance * (1.0 - sat));

  // Exposure and Tone Mapping
  var color: vec3f;
  // Check for debug mode (ground_alpha > 1 = debug quad colors)
  if (ground_alpha > 1.5) {
    // Debug mode: use colors directly with only gamma correction, skip exposure
    color = pow(clamp(ground_radiance, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
    output.depth = 1.0; 
  } else {
    // Normal mode: Apply tone mapping (Reinhard) and gamma correction (sRGB)
    color = pow(
        vec3f(1.0) - exp(-final_radiance / white_point * exposure),
        vec3f(1.0 / 2.2));
        

    // Atmosphere is always at infinity (geometric terrain handles actual surfaces)
    output.depth = 1.0;
  }

  output.color = vec4f(color, 1.0);
  return output;
}`;
