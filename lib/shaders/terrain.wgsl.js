import { PLANET_RADIUS, ATMOSPHERE_CONFIG, LIGHTING_CONFIG, TERRAIN_LIMITS, TERRAIN_SCALES } from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

const { 
  SOLAR_IRRADIANCE_BASE, 
  LUMINANCE_WEIGHTS, 
  SUN_INTENSITY_TERRAIN, 
  SUN_INTENSITY_SPACE,
  NIGHT_AMBIENT_FLOOR 
} = LIGHTING_CONFIG;

const vec3_SOLAR = `vec3f(${SOLAR_IRRADIANCE_BASE[0]}, ${SOLAR_IRRADIANCE_BASE[1]}, ${SOLAR_IRRADIANCE_BASE[2]})`;
const vec3_LUM = `vec3f(${LUMINANCE_WEIGHTS[0]}, ${LUMINANCE_WEIGHTS[1]}, ${LUMINANCE_WEIGHTS[2]})`;

/**
 * Triplanar cloud UV scales for terrain shadow projection.
 * Must match atmosphere.wgsl.js scales for shadow/cloud pattern alignment.
 * @see atmosphere.wgsl.js for formula documentation.
 */
const _cloudR = PLANET_RADIUS + ATMOSPHERE_CONFIG.cloudAltitude;
const _horizonAngle = Math.acos(PLANET_RADIUS / _cloudR);
const _triScale1 = ATMOSPHERE_CONFIG.cloudLayer1Scale * 1000 / _horizonAngle;
const _triScale2 = ATMOSPHERE_CONFIG.cloudLayer2Scale * 1000 / _horizonAngle;
const _triScale3 = ATMOSPHERE_CONFIG.cloudLayer3Scale * 1000 / _horizonAngle;

export const terrainShader = /* wgsl */`
/**
 * terrain.wgsl.js - Terrain Mesh Rendering Shader
 * 
 * High-performance planetary terrain rendering with:
 * - LOD-based vertex morphing
 * - Atmospheric scattering integration
 * - Procedural biome generation (Planetary Style)
 */

// ============================================================================
// UNIFORMS AND BINDINGS
// ============================================================================

struct GlobalUniforms {
  viewProjection : mat4x4f,      // Combined view-projection matrix
  cameraPos : vec4f,             // Camera position (xyz), exposure (w)
  sunDirection : vec4f,          // Sun direction (xyz), sun size (w)
  earthCenter : vec4f,           // Earth center (xyz), planet radius (w)
  whitePoint : vec4f,            // White point (xyz), debug mode (w)
  cloudOpacities : vec4f,        // L1 (x), L2 (y), L3 (z), shadowStrength (w)
  avatarSphere : vec4f,          // Avatar sphere position (xyz), radius (w) - for shadows
  moonDir : vec4f,               // Moon direction (xyz), brightness (w) - lunar illumination
  miscParams : vec4f,            // cloudTime (x), reserved (y), cloudCoverage (z), rawTime (w)
  skyStylization : vec4f,        // saturation (x), vibrance (y), fog (z), reserved (w)
  skyTint : vec4f,               // rgb (xyz), density/reserved (w)
  rainParams : vec4f,            // x=rainIntensity, y=shadowDayWeight, z=snowIntensity, w=reserved
  lightning_params : vec4f,      // x=flash, yzw=strike position
  oceanParams : vec4f,           // x=waveScale, y=waveSpeed, z=reflectionStr, w=foamIntensity
  oceanColors1 : vec4f,          // xyz=shallowColor, w=clarity
  oceanColors2 : vec4f,          // xyz=deepColor, w=specularPower
  oceanMisc : vec4f,             // x=foamStart, y=waveNormalStr, zw=reserved
}

struct ChunkData {
  morphParams : vec4f,           // x: morph, y: lod, z: fog, w: checker
  chunkCenter : vec4f,           // xyz: relative cam pos, w: quadSize
  quadParams : vec4f,            // x: quadX, y: quadY, z: faceIndex, w: reserved
  chunkNormal : vec4f,           // xyz: world normal of chunk center, w: midLen (unnormalized cube distance)
}

struct TerrainParams {
  warpFactor : f32,
  mountMaskFreq : f32,
  baseAmplitude : f32,
  baseFrequency : f32,
  persistence : f32,
  lacunarity : f32,
  contrastExp : f32,
  contrastScale : f32,
  seaLevelOffset : f32,
  ridgeDetail : f32,
  abyssDetail : f32,
  detailScale : f32,
  // Biome coverage
  grassCoverage : f32,
  sandCoverage : f32,
  snowCoverage : f32,
  rockCoverage : f32,
  // NEW PARAMETERS
  octaves : f32,
  warpScale : f32,
  warpStrength2 : f32,
  peakSoftness : f32,
  
  // Planetary Style
  terraceAmount : f32,
  terraceSmooth : f32,
  mountainSharpness : f32,
  shelfWidth : f32,
  beachWidth : f32,
  snowLine : f32,
  sandSharpness : f32,
  rockThreshold : f32,
  grassThreshold : f32,
  globalMoisture : f32,
  debugFlags : f32,
  lakeDetail : f32,
  // Biome Colors (vec4 for 16-byte alignment)
  colGrass : vec4f,
  colForest : vec4f,
  colRock : vec4f,
  colSnow : vec4f,
  colSand : vec4f,
  colGround : vec4f,
  colShallowSea : vec4f,
  colDeepSea : vec4f
}

@group(0) @binding(0) var<uniform> globals : GlobalUniforms;
@group(0) @binding(13) var<storage, read> visibleIndices : array<u32>;
@group(0) @binding(14) var<storage, read> instances : array<ChunkData>;
@group(0) @binding(12) var<storage, read> allVertices : array<f32>;
@group(0) @binding(15) var<uniform> terrainParams : TerrainParams;
@group(0) @binding(1) var transmittance_texture : texture_2d<f32>;
@group(0) @binding(2) var scattering_texture : texture_3d<f32>;
@group(0) @binding(3) var irradiance_texture : texture_2d<f32>;
@group(0) @binding(4) var lut_sampler : sampler;
@group(0) @binding(6) var normal_array : texture_2d_array<f32>;
@group(0) @binding(10) var cloud_texture : texture_2d<f32>;

// CSM Shadow Uniforms: 4 cascade matrices + split depths
struct ShadowGlobals {
  cascadeViewProj0: mat4x4f,
  cascadeViewProj1: mat4x4f,
  cascadeViewProj2: mat4x4f,
  cascadeViewProj3: mat4x4f,
  splitDepths: vec4f,
  earthCenter: vec4f,
}

// CSM uses texture array with 4 layers
@group(0) @binding(7) var shadowMapArray: texture_depth_2d_array;
@group(0) @binding(8) var shadowSampler: sampler_comparison;
@group(0) @binding(9) var<uniform> shadowGlobals: ShadowGlobals;

// Helper: Get cascade matrix by index
fn getCascadeViewProj(idx: u32) -> mat4x4f {
  switch(idx) {
    case 0u: { return shadowGlobals.cascadeViewProj0; }
    case 1u: { return shadowGlobals.cascadeViewProj1; }
    case 2u: { return shadowGlobals.cascadeViewProj2; }
    default: { return shadowGlobals.cascadeViewProj3; }
  }
}

// Helper: Select cascade based on view-space distance
fn selectCascade(distToCamera: f32) -> u32 {
  if (distToCamera < shadowGlobals.splitDepths.x) { return 0u; }
  if (distToCamera < shadowGlobals.splitDepths.y) { return 1u; }
  if (distToCamera < shadowGlobals.splitDepths.z) { return 2u; }
  return 3u;
}

// === CLOUD SHADOW PROJECTION (Triplanar) ===
// Uses triplanar mapping to match cloud shader - no polar singularity
fn sampleCloudShadow(worldPos: vec3f, sunDir: vec3f, cloudTime: f32, cloudCoverage: f32) -> f32 {
  // Position from Earth center (absolute planetary coordinate)
  let posFromEarth = worldPos - globals.earthCenter.xyz;
  let up = normalize(posFromEarth);

  // Triplanar blending weights (cubic for sharp transitions)
  let absN = abs(up);
  let triW = absN * absN * absN;
  let triWSum = triW.x + triW.y + triW.z;

  // Speed factor 0.1 matches cloud shader (time_val * 0.1)
  let animatedOffset = cloudTime * 0.1;
  let opacities = globals.cloudOpacities;

  // Layer 1 (Primary) - triplanar sampling
  let s1 = ${_triScale1.toFixed(1)};
  let off1 = animatedOffset * ${ATMOSPHERE_CONFIG.cloudLayer1Speed.toFixed(2)};
  let n1 = (
    textureSampleLevel(cloud_texture, lut_sampler, up.yz * s1 + off1, 2.0).r * triW.x +
    textureSampleLevel(cloud_texture, lut_sampler, up.xz * s1 + off1, 2.0).r * triW.y +
    textureSampleLevel(cloud_texture, lut_sampler, up.xy * s1 + off1, 2.0).r * triW.z
  ) / triWSum;
  let d1 = smoothstep(${ATMOSPHERE_CONFIG.cloudLayer1Threshold.toFixed(2)} - (cloudCoverage * ${ATMOSPHERE_CONFIG.cloudLayer1CoverageScale.toFixed(2)}), ${ATMOSPHERE_CONFIG.cloudLayer1Threshold.toFixed(2)} - (cloudCoverage * ${ATMOSPHERE_CONFIG.cloudLayer1CoverageScale.toFixed(2)}) + 0.2, n1) * opacities.x;

  // Layer 2 (Broad) - triplanar sampling
  let s2 = ${_triScale2.toFixed(1)};
  let off2 = animatedOffset * ${ATMOSPHERE_CONFIG.cloudLayer2Speed.toFixed(2)};
  let n2 = (
    textureSampleLevel(cloud_texture, lut_sampler, up.yz * s2 + off2, 2.0).r * triW.x +
    textureSampleLevel(cloud_texture, lut_sampler, up.xz * s2 + off2, 2.0).r * triW.y +
    textureSampleLevel(cloud_texture, lut_sampler, up.xy * s2 + off2, 2.0).r * triW.z
  ) / triWSum;
  let d2 = smoothstep(${ATMOSPHERE_CONFIG.cloudLayer2Threshold.toFixed(2)} - (cloudCoverage * ${ATMOSPHERE_CONFIG.cloudLayer2CoverageScale.toFixed(2)}), ${ATMOSPHERE_CONFIG.cloudLayer2Threshold.toFixed(2)} - (cloudCoverage * ${ATMOSPHERE_CONFIG.cloudLayer2CoverageScale.toFixed(2)}) + 0.3, n2) * 0.4 * opacities.y;

  // Layer 3 (Stratospheric) - triplanar sampling
  let s3 = ${_triScale3.toFixed(1)};
  let off3 = animatedOffset * ${ATMOSPHERE_CONFIG.cloudLayer3Speed.toFixed(2)};
  let n3 = (
    textureSampleLevel(cloud_texture, lut_sampler, up.yz * s3 + off3, 2.0).r * triW.x +
    textureSampleLevel(cloud_texture, lut_sampler, up.xz * s3 + off3, 2.0).r * triW.y +
    textureSampleLevel(cloud_texture, lut_sampler, up.xy * s3 + off3, 2.0).r * triW.z
  ) / triWSum;
  let d3 = smoothstep(${ATMOSPHERE_CONFIG.cloudLayer3Threshold.toFixed(2)} - (cloudCoverage * ${ATMOSPHERE_CONFIG.cloudLayer3CoverageScale.toFixed(2)}), ${ATMOSPHERE_CONFIG.cloudLayer3Threshold.toFixed(2)} - (cloudCoverage * ${ATMOSPHERE_CONFIG.cloudLayer3CoverageScale.toFixed(2)}) + 0.4, n3) * 0.2 * opacities.z;

  let totalDensity = saturate(d1 + d2 + d3);

  // Altitude fade: shadows dissolve with clouds between 80km and 100km
  let cameraRadius = length(globals.earthCenter.xyz);
  let cameraAlt = cameraRadius - EARTH_RADIUS;
  let altitudeFade = 1.0 - smoothstep(${ATMOSPHERE_CONFIG.cloudFadeStart.toFixed(1)}, ${ATMOSPHERE_CONFIG.cloudFadeEnd.toFixed(1)}, cameraAlt);

  return mix(1.0, ${ATMOSPHERE_CONFIG.cloudShadowIntensity.toFixed(1)}, totalDensity * altitudeFade);
}


// ============================================================================
// CONSTANTS
// ============================================================================

const PI : f32 = 3.14159265358979323846;
const EARTH_RADIUS : f32 = ${PLANET_RADIUS.toFixed(1)};  // km (sea level)
const ATMOSPHERE_TOP : f32 = 6560.0;  // km (200km above sea level)
const ATMOSPHERE_BOTTOM : f32 = 6280.0;  // km (80km below sea level for trenches)


const col_deep_sea_base = vec3f(0.06, 0.25, 0.55); // Azure Majesty (Lighter and more vibrant)
const col_shallow_sea_base = vec3f(0.12, 0.75, 0.78); // Bright Crystal Turquoise
const col_sand_base   = vec3f(0.78, 0.68, 0.48);  
const col_grass_base  = vec3f(0.15, 0.45, 0.12);   // Natural grass green
const col_forest_base = vec3f(0.04, 0.25, 0.05);   // Darker forest green
const col_rock_base   = vec3f(0.4, 0.38, 0.35); 
const col_snow_base   = vec3f(0.85, 0.85, 0.9); // Slightly dimmer snow to reduce 100% white contrast
const col_ground_base = vec3f(0.55, 0.45, 0.35); // Desert/Arid ground

// ============================================================================
// VERTEX SHADER STRUCTURES
// ============================================================================

struct VertexInput {
  @builtin(vertex_index) vertexIdx : u32,
  @builtin(instance_index) instanceIdx : u32,
}

struct VertexOutput {
  @builtin(position) clipPos : vec4f,
  @location(0) normal : vec3f,       // Interpolated analytical normal
  @location(1) uv : vec2f,
  @location(2) worldPos : vec3f,
  @location(3) rawHeight : f32,
  @location(4) moisture : f32,
  @location(5) distToCamera : f32,
  @location(6) morphParams : vec4f,
  @location(7) sphereNormal : vec3f, // Stable normal for precision
  @location(8) shadowPos : vec4f,
  @location(9) viewDir : vec3f,
  @location(10) @interpolate(flat) quadSize : f32, // Passed for stable rain scaling
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn ClampCosine(mu : f32) -> f32 {
  return clamp(mu, -1.0, 1.0);
}

fn SafeSqrt(v : f32) -> f32 {
  return sqrt(max(v, 0.0));
}

// ============================================================================
// ATMOSPHERIC SCATTERING (Simplified for terrain)
// ============================================================================

/**
 * Simplified transmittance lookup for terrain rendering
 * Uses same LUT as atmosphere shader
 */
fn GetSimpleTransmittance(altitude : f32, mu : f32) -> vec3f {
  // Map to transmittance texture coordinates
  // Use ATMOSPHERE_BOTTOM as floor to support deep trenches
  let H = sqrt(ATMOSPHERE_TOP * ATMOSPHERE_TOP - ATMOSPHERE_BOTTOM * ATMOSPHERE_BOTTOM);
  let r = max(ATMOSPHERE_BOTTOM, EARTH_RADIUS + altitude);
  let rho = SafeSqrt(r * r - ATMOSPHERE_BOTTOM * ATMOSPHERE_BOTTOM);
  
  // Distance to top of atmosphere
  let d = max(-r * mu + sqrt(r * r * (mu * mu - 1.0) + ATMOSPHERE_TOP * ATMOSPHERE_TOP), 0.0);
  let d_min = ATMOSPHERE_TOP - r;
  let d_max = rho + H;
  let x_mu = (d - d_min) / (d_max - d_min);
  let x_r = rho / H;
  
  let uv = vec2f(
    0.5 / 256.0 + x_mu * (1.0 - 1.0 / 256.0),
    0.5 / 64.0 + x_r * (1.0 - 1.0 / 64.0)
  );
  
  return textureSampleLevel(transmittance_texture, lut_sampler, uv, 0.0).rgb;
}

/**
 * Get sky irradiance for lighting terrain
 */
fn GetSkyIrradiance(altitude : f32, sunCosZenith : f32) -> vec3f {
  // Simplified irradiance lookup - handle negative altitudes
  let r = max(ATMOSPHERE_BOTTOM, EARTH_RADIUS + altitude);
  let x_r = sqrt(max(r - ATMOSPHERE_BOTTOM, 0.0) / (ATMOSPHERE_TOP - ATMOSPHERE_BOTTOM));
  let x_mu_s = sunCosZenith * 0.5 + 0.5;
  
  let uv = vec2f(
    0.5 / 64.0 + x_mu_s * (1.0 - 1.0 / 64.0),
    0.5 / 16.0 + x_r * (1.0 - 1.0 / 16.0)
  );
  
  return textureSampleLevel(irradiance_texture, lut_sampler, uv, 0.0).rgb;
}

/**
 * Rayleigh phase function for atmospheric scattering
 * P(theta) = 3/(16*pi) * (1 + cos^2(theta))
 */
fn RayleighPhase(cosTheta : f32) -> f32 {
  return 0.0596831 * (1.0 + cosTheta * cosTheta);  // 3/(16*PI)
}

/**
 * Mie phase function (Henyey-Greenstein approximation)
 * Creates forward scattering glow around sun
 */
fn MiePhase(cosTheta : f32, g : f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(denom, 1.5));
}

/**
 * Compute aerial perspective (atmospheric fog) for distant terrain
 * Uses physically-based Rayleigh/Mie scattering approximation
 * Works correctly when camera is at high altitude (space)
 */
fn GetAerialPerspective(in : VertexOutput, cameraPos : vec3f, sunDir : vec3f) -> vec4f {
  let earthCenter = globals.earthCenter.xyz;
  let distance = in.distToCamera;
  
  // Altitudes relative to sea level (EARTH_RADIUS)
  // cameraPos is at [0,0,0], earthCenter is camera -> center vector
  let cameraDistToCenter = length(earthCenter);
  let cameraAlt = cameraDistToCenter - ${PLANET_RADIUS.toFixed(1)};
  
  // CRITICAL PRECISION FIX: Use rawHeight (altitude) directly instead of calculating 
  // length(worldPos - earthCenter) - ${PLANET_RADIUS.toFixed(1)}, avoiding large float subtractions.
  let terrainAlt = in.rawHeight;
  
  // Density: Thicker at sea level, fades with height
  let H_fog = 4.0; 
  let density = exp(-max(terrainAlt, 0.0) / H_fog);
  
  // Scattering colors based on sun elevation
  // Use stable sphereNormal for zenith calculations
  let sunElevation = dot(sunDir, in.sphereNormal);
  let dayFactor = smoothstep(-0.15, 0.15, sunElevation);
  
  // Artistic fog colors matching the precomputed sky
  let col_day = vec3f(0.4, 0.6, 0.9) * 1.5;   // Bright sky blue
  let col_sunset = vec3f(1.0, 0.4, 0.1) * 2.0; // Deep orange
  let col_night = vec3f(0.01, 0.02, 0.06);     // Dark night blue
  
  var fogColor = mix(col_sunset, col_day, smoothstep(0.0, 0.25, sunElevation));
  fogColor = mix(col_night, fogColor, dayFactor);
  
  // Fog reach: how far we see through it
  let baseReach = mix(12.0, 400.0, smoothstep(0.0, 60.0, cameraAlt));
  
  // Exponential haze calculation
  let distFactor = 1.0 - exp(-(distance * distance) / (baseReach * baseReach * 1.5));
  
  // Final opacity: combine distance, density and add a tiny bit of ambient haze
  let opacity = saturate(distFactor * density + 0.02);
  
  return vec4f(fogColor, opacity);
}



/**
 * Get sun visibility for terrain point, checking sphere occlusion
 * Used for projecting shadows from demo sphere and avatar sphere onto terrain
 */
fn getSunVisibility(worldPos : vec3f, sunDir : vec3f) -> f32 {
  return 1.0;
}

// ============================================================================
// TERRAIN COLORING
// ============================================================================

// ============================================================================
// NOISE SYSTEM (Imported)
// ============================================================================

${noiseWGSL}

fn getMoisture(p: vec3f) -> f32 {
  var m: f32 = 0.0;
  var amp: f32 = 0.5;
  var freq: f32 = 1.2;
  for (var i = 0; i < 4; i = i + 1) {
    m += amp * gradientNoise(p * freq);
    freq *= 2.2;
    amp *= 0.5;
  }
  return clamp(smoothstep(-0.25, 0.45, m + 0.15) + terrainParams.globalMoisture, 0.0, 1.0);
}

fn getTerrainHeight(p_in: vec3f, octaves: f32, showNoise: bool, dist: f32) -> f32 {

  // ============================================================================
  // PROLAND-STYLE TWO-STAGE NOISE
  // Stage 1: SHAPE - Fixed low-frequency octaves (always identical)
  // Stage 2: DETAIL - High-frequency octaves (only at high LOD)
  // ============================================================================

  // 1. DOMAIN WARPING: Broken, natural shapes
  let warpFactor = terrainParams.warpFactor;
  let warpScale = terrainParams.warpScale;
  let q = vec3f(
    gradientNoise(p_in * warpScale + vec3f(0.0, 0.0, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(5.2, 1.3, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(1.1, 0.0, 2.4))
  ) * warpFactor;
  
  // Secondary Warping for more organic flow
  let p1 = p_in + q;
  let warpFactor2 = terrainParams.warpStrength2;
  let r = vec3f(
    gradientNoise(p1 * warpScale * 2.0 + vec3f(3.3, 0.0, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 4.4, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 0.0, 5.5))
  ) * warpFactor2;
  
  let p = p1 + r;
  
  // 2. MOUNTAIN/PLAINS MASK
  let mount_mask = smoothstep(-0.1, 0.35, gradientNoise(p * terrainParams.mountMaskFreq + vec3f(12.3)));
  
  // ============================================================================
  // STAGE 1: SHAPE NOISE (ALWAYS IDENTICAL - defines continents and major features)
  // ============================================================================
  // These 6 octaves use VERY LOW frequency for continental shapes
  
  // 3. BASE fBM - SYNCHRONIZED WITH terrain.wgsl.js
  // Uses fixed octaves for GEOMETRY to ensure physics/visual sync
  var h: f32 = 0.0;
  var a: f32 = terrainParams.baseAmplitude;
  var f: f32 = terrainParams.baseFrequency;
  
  let totalOctaves = i32(terrainParams.octaves + 0.5);

  for (var i = 0; i < 24; i = i + 1) {
    if (i >= totalOctaves) { break; }
    h += a * gradientNoise(p * f);
    a *= terrainParams.persistence;
    f *= terrainParams.lacunarity;
  }
  
  // 4. VERTICAL CONTRAST BOOST & PEAK SOFTENING
  let hSign = sign(h);
  var exp = terrainParams.contrastExp;
  
  // Soften peaks: higher altitude = lower contrast exponent
  let softness = terrainParams.peakSoftness;
  exp = mix(exp, exp * 0.5, smoothstep(0.1, 0.5, abs(h)) * softness);
  
  h = (hSign * pow(abs(h), exp) * terrainParams.contrastScale) + terrainParams.seaLevelOffset;
  
  // 5. BIOME-SPECIFIC TOPOGRAPHY
  if (h > 0.0) {
    // Smoothen beaches: Flatten height significantly near sea level
    h = mix(h * 0.1, h, smoothstep(0.0, 0.1, h));
    
    // Mountain ridges: Soften significantly when Noise is OFF
    if (showNoise) {
      let ridgeFreq = terrainParams.baseFrequency * 1.6;
      let r1 = ridgeNoise(p * ridgeFreq);
      let r2 = ridgeNoise(p * ridgeFreq * 2.7);
      
      // Ridge Sharpness: Apply exponent to the ridge noise for sharper peaks
      let sharpness = terrainParams.mountainSharpness;
      let sharp_r1 = pow(r1, sharpness);
      
      let ridge_detail = (0.4 * sharp_r1 * sharp_r1 + 0.15 * r2) * terrainParams.ridgeDetail;
      h = h + ridge_detail * mount_mask * h * 1.4;
      
      // MOUNTAIN TERRACING (Planetary Style)
      let tAmt = terrainParams.terraceAmount;
      if (tAmt > 0.0) {
          let tSmooth = terrainParams.terraceSmooth;
          let cell = floor(h * tAmt);
          let frac = fract(h * tAmt);
          let smooth_frac = smoothstep(0.0, tSmooth, frac);
          h = (cell + smooth_frac) / tAmt;
      }
    } else {
      // Very soft organic variation when Noise is OFF
      h = h + gradientNoise(p * 2.5) * mount_mask * h * 0.3;
    }

    // 5c. INLAND LAKES: Carve depressions into land to create lakes
    let lakeD = terrainParams.lakeDetail;
    if (lakeD > 0.0) {
      let lakeFreq = terrainParams.baseFrequency * 2.5;
      let lakeNoise = gradientNoise(p * lakeFreq + vec3f(7.7, 3.3, 9.9));
      let inlandMask = smoothstep(0.0, 0.01, h);
      h -= max(0.0, lakeNoise) * lakeD * inlandMask * 0.15;
    }

  } else {
    // 5b. OCEAN TOPOGRAPHY: Deeper submarine relief for the "ondiduras"
    
    // Ocean Shelf: Flatten the floor near sea level to create a gentle shelf
    let shelfWidth = terrainParams.shelfWidth;
    h = mix(h * 0.1, h, smoothstep(0.0, -0.2 * shelfWidth, h));
    
    // Submarine Detail: Create deep, cavernous trenches
    // Roughness here is strictly subtractive (downwards)
    let tr1 = ridgeNoise(p * 5.0 + vec3f(12.3));
    let tr2 = ridgeNoise(p * 15.0);
    let abyss_detail = (tr1 * tr1 * 1.5 + tr2 * 0.4) * terrainParams.abyssDetail;
    
    // Scale abyss depth by current depth - makes trenches massive and cavernous
    h -= abyss_detail * abs(h) * 1.8 * smoothstep(0.0, -0.15, h);
  }
  
  return h * terrainParams.detailScale;
}

/**
 * Compute analytical normal for fragment shading
 * Calculates gradient of the height function to get high-quality normals
 */
fn computeAnalyticalNormal(p: vec3f, oct: f32, showNoise: bool, dist: f32) -> vec3f {
    // Larger epsilon for smoother normals
    let eps = 0.004;
    var t = normalize(cross(p, vec3f(0.0, 0.0, 1.0)));
    if (abs(p.z) > 0.9) { t = normalize(cross(p, vec3f(1.0, 0.0, 0.0))); }
    let bt = cross(p, t);
    
    let h0 = getTerrainHeight(p, oct, showNoise, dist);
    let h1 = getTerrainHeight(normalize(p + t * eps), oct, showNoise, dist);
    let h2 = getTerrainHeight(normalize(p + bt * eps), oct, showNoise, dist);


    
    // Calculate raw gradient
    let dh1 = (h1 - h0) / eps;
    let dh2 = (h2 - h0) / eps;
    
    // FLAT AREA DETECTION: Force smooth normals for water and near-sea-level areas
    let isFlat = smoothstep(0.05, 0.0, h0);
    let beachSmooth = smoothstep(0.1, 0.0, abs(h0));
    let flatFactor = max(isFlat, beachSmooth * 0.8);
    
    // Amplification: very low for flat areas, moderate for terrain
    let baseAmp = 2.0;
    let gradient = sqrt(dh1*dh1 + dh2*dh2);
    let steepAmp = smoothstep(0.0, 2.0, gradient) * 2.0;
    let terrainAmp = baseAmp + steepAmp;
    
    // Blend: flat areas get almost zero amplification (smooth normals)
    let s = mix(terrainAmp, 0.1, flatFactor);
    
    return normalize(p - t * dh1 * s - bt * dh2 * s);
}


fn getProceduralGrassColor(sNorm: vec3f, moisture: f32, altitude: f32) -> vec3f {
  // Multi-octave noise for natural variation
  let baseNoise = gradientNoise(sNorm * 500.0) * 0.6 + gradientNoise(sNorm * 1200.0) * 0.3 + gradientNoise(sNorm * 3000.0) * 0.1;
  let n = baseNoise * 0.5 + 0.5;
  
  // Base grass with variation
  var grass = mix(terrainParams.colGrass.rgb * 0.7, terrainParams.colGrass.rgb * 1.3, clamp(n, 0.0, 1.0));
  
  // WET GRASS: Darker and slightly bluer near water or high moisture
  let wetFactor = smoothstep(0.6, 0.9, moisture) * smoothstep(0.01, 0.0, altitude); // Near water AND high moisture
  let wetGrass = grass * vec3f(0.6, 0.75, 0.65); // Darker, slight teal tint
  grass = mix(grass, wetGrass, wetFactor * 0.7);
  
  // DRY GRASS / SAVANNA: Yellower in low moisture areas
  let dryFactor = smoothstep(0.4, 0.2, moisture);
  let dryGrass = mix(grass, vec3f(0.45, 0.42, 0.22), dryFactor * 0.6); // Straw/ochre tint
  grass = mix(grass, dryGrass, dryFactor);
  
  // FOREST PATCHES: Darker green in high moisture, mid altitude
  let forestNoise = gradientNoise(sNorm * 80.0) * 0.5 + 0.5;
  let forestFactor = smoothstep(0.7, 0.9, moisture) * smoothstep(0.0, 0.3, altitude) * forestNoise;
  grass = mix(grass, terrainParams.colForest.rgb, forestFactor * 0.5);
  
  return grass;
}

fn getProceduralRockColor(sNorm: vec3f, slope: f32) -> vec3f {
  // Multi-scale noise for geological strata effect
  let n1 = gradientNoise(sNorm * 800.0) * 0.5;
  let n2 = gradientNoise(sNorm * 2000.0) * 0.3;
  let n3 = gradientNoise(sNorm * 50.0) * 0.2; // Large scale variation (veins)
  let n = (n1 + n2 + n3) * 0.5 + 0.5;
  
  // Base rock variation
  var rock = mix(terrainParams.colRock.rgb * 0.7, terrainParams.colRock.rgb * 1.4, clamp(n, 0.0, 1.0));
  
  // CLIFF FACES: Slightly lighter on steep slopes (exposed rock)
  let cliffFactor = smoothstep(0.5, 0.8, slope);
  rock = mix(rock, rock * 1.2, cliffFactor * 0.3);
  
  // MINERAL VEINS: Occasional darker/lighter streaks
  let veinNoise = gradientNoise(sNorm * 20.0);
  if (abs(veinNoise) > 0.7) {
    rock = mix(rock, rock * vec3f(0.7, 0.6, 0.5), 0.4); // Darker vein
  }
  
  return rock;
}

fn getProceduralSandColor(sNorm: vec3f, altitude: f32, moisture: f32) -> vec3f {
  // Fine grain noise for sand texture
  let fineNoise = gradientNoise(sNorm * 400.0) * 0.4 + gradientNoise(sNorm * 1500.0) * 0.2;
  let n = fineNoise * 0.5 + 0.5;
  
  // Base sand variation
  var sand = mix(terrainParams.colSand.rgb * 0.85, terrainParams.colSand.rgb * 1.15, clamp(n, 0.0, 1.0));
  
  // WET BEACH SAND: Darker near waterline
  let beachWetFactor = smoothstep(0.02, 0.0, altitude) * smoothstep(0.0, -0.01, altitude - 0.02);
  let wetSand = sand * 0.55; // Significantly darker when wet
  sand = mix(sand, wetSand, beachWetFactor);
  
  // DUNE RIDGES: Slightly lighter on exposed peaks (wind-blown)
  let duneNoise = gradientNoise(sNorm * 60.0) * 0.5 + 0.5;
  let ridgeFactor = smoothstep(0.6, 0.8, duneNoise) * smoothstep(0.05, 0.2, altitude);
  sand = mix(sand, sand * 1.15, ridgeFactor * 0.4);
  
  // WHITE SAND: In very low moisture (desert) areas, sand becomes whiter
  let whiteSandFactor = smoothstep(0.3, 0.1, moisture);
  sand = mix(sand, vec3f(0.9, 0.85, 0.78), whiteSandFactor * 0.3);
  
  return sand;
}

fn GetTerrainColor(worldPos : vec3f, normal : vec3f, altitude : f32, moisture : f32, viewDir : vec3f) -> vec3f {
  let debugFlags = u32(globals.whitePoint.w + 0.5);
  let showNoise = (debugFlags & 32u) != 0u;
  
  let earthCenter = globals.earthCenter.xyz;
  let sunDir = normalize(globals.sunDirection.xyz);
  let localUp = normalize(worldPos - earthCenter);
  let slope = 1.0 - max(dot(normal, localUp), 0.0);

  
  // --- Planetary Palette is now defined globally ---


  
  // PRECISION FIX: Use smooth blending instead of hard if/else
  // to prevent float32 jitter at the coastline (altitude near 0)
  var color = vec3f(0.0);
  // SHORELINE PRECISION: Transition zone from -0.001 to 0.001 km (2 meters total)
  // This prevents turquoise "halos" on land and ensures beaches are born from the earth.
  let landFactor = smoothstep(-0.001, 0.001, altitude);
  
  // === LAND COLOR ===
  var landColor = terrainParams.colGrass.rgb;
  {
    // NOISE GATING: Smooth out moisture/biomes when Noise is OFF
    let m = select(0.5, moisture, showNoise);
    
    // Low moisture = Arid/Desert, High moisture = Forest
    let gThresh = terrainParams.grassThreshold;
    if (m < gThresh) {
        landColor = mix(terrainParams.colGround.rgb, terrainParams.colGrass.rgb, smoothstep(gThresh - 0.2, gThresh, m));
    } else {
        landColor = mix(terrainParams.colGrass.rgb, terrainParams.colForest.rgb, smoothstep(gThresh, gThresh + 0.35, m));
    }
    
    // Sandy coasts (Planetary Style)
    let bWidth = terrainParams.beachWidth * 30.0; 
    let sSharp = terrainParams.sandSharpness;
    
    // Rock takes precedence over sand only on STEEP slopes
    let rThresh = terrainParams.rockThreshold;
    let rockBlend = smoothstep(rThresh, rThresh + 0.3, slope);
    
    // Apply sand if low AND not purely steep rock
    if (altitude < bWidth) {
       let beachMix = (1.0 - smoothstep(bWidth * (1.0 - sSharp), bWidth, altitude));
       // Mix sand into landColor, but reduce it if it's already a steep rock cliff
       landColor = mix(landColor, terrainParams.colSand.rgb, beachMix * (1.0 - rockBlend * 0.8));
    }
    
    // Final Rocky Overlays for all altitudes
    if (slope > rThresh) {
       landColor = mix(landColor, terrainParams.colRock.rgb, rockBlend);
    }
    
    // Altitude overrides (High mountains - Planetary Style)
    let sLine = terrainParams.snowLine * 30.0; 
    if (altitude > sLine) {
       let rockSnow = mix(terrainParams.colRock.rgb, terrainParams.colSnow.rgb, smoothstep(sLine, sLine + 10.0, altitude));
       landColor = mix(landColor, rockSnow, smoothstep(sLine, sLine + 5.0, altitude));
    }
  }
  
  // === OCEAN COLOR ===
  var oceanColor = terrainParams.colShallowSea.rgb;
  {
    // Ocean: Depth-based gradient (Sharpened transition)
    // 3-way mix: Coastal (0-150m) -> Mid (150-1000m) -> Deep (>1000m)
    let depthFactor = smoothstep(0.0, -0.25, altitude); // Sharpened for smaller turquoise zone
    let midSea = mix(terrainParams.colShallowSea.rgb, terrainParams.colDeepSea.rgb, 0.5); // Dynamic mid-blue
    
    if (depthFactor < 0.5) {
        oceanColor = mix(terrainParams.colShallowSea.rgb, midSea, depthFactor * 2.0);
    } else {
        oceanColor = mix(midSea, terrainParams.colDeepSea.rgb, (depthFactor - 0.5) * 2.0);
    }
    
    // Very deep trenches: Subtle darkening (Abyss)
    if (altitude < -5.0) {
        let abyssBlue = vec3f(0.01, 0.04, 0.12);
        oceanColor = mix(oceanColor, abyssBlue, smoothstep(-15.0, -40.0, altitude));
    }
  }
  
  // Blend between ocean and land based on smooth transition
  color = mix(oceanColor, landColor, landFactor);


  
  return color;
}

// ============================================================================
// SURFACE DETAIL FUNCTIONS
// ============================================================================
// Procedural surface detail functions have been replaced by the KTX2 Array texture system in fs_main.

// ============================================================================
// BASIS VECTORS FOR CUBE-SPHERE PROJECTION
// ============================================================================

const FaceNormals = array<vec3f, 6>(
  vec3f(0.0, 0.0, 1.0),  // 0: +Z
  vec3f(0.0, 0.0, -1.0), // 1: -Z
  vec3f(1.0, 0.0, 0.0),  // 2: +X
  vec3f(-1.0, 0.0, 0.0), // 3: -X
  vec3f(0.0, 1.0, 0.0),  // 4: +Y
  vec3f(0.0, -1.0, 0.0)  // 5: -Y
);

const FaceUps = array<vec3f, 6>(
  vec3f(0.0, 1.0, 0.0),  // 0: +Z
  vec3f(0.0, 1.0, 0.0),  // 1: -Z
  vec3f(0.0, 1.0, 0.0),  // 2: +X
  vec3f(0.0, 1.0, 0.0),  // 3: -X
  vec3f(0.0, 0.0, -1.0), // 4: +Y
  vec3f(0.0, 0.0, 1.0)   // 5: -Y
);

const FaceRights = array<vec3f, 6>(
  vec3f(1.0, 0.0, 0.0),  // 0: +Z
  vec3f(-1.0, 0.0, 0.0), // 1: -Z
  vec3f(0.0, 0.0, -1.0), // 2: +X
  vec3f(0.0, 0.0, 1.0),  // 3: -X
  vec3f(1.0, 0.0, 0.0),  // 4: +Y
  vec3f(1.0, 0.0, 0.0)   // 5: -Y
);

// ============================================================================
// VERTEX SHADER
// ============================================================================

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  
  // VERTEX PULLING: Optimized to only pull relative position and UVs
  let slotIdx = visibleIndices[in.instanceIdx];
  let baseIdx = (slotIdx * 625u + in.vertexIdx) * 5u; // Reduced from 11u to 5u
  
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  let uv = vec2f(allVertices[baseIdx + 3u], allVertices[baseIdx + 4u]);

  let chunk = instances[slotIdx];
  let debugFlagsV = u32(globals.whitePoint.w + 0.5);
  let showNoise = (debugFlagsV & 32u) != 0u;
  
  // 1. RECONSTRUCCIÓN PROCEDURAL DE LA NORMAL (Garantiza sincronía absoluta entre Quads)
  let faceIdx = u32(chunk.quadParams.z + 0.5);
  let quadX = chunk.quadParams.x;
  let quadY = chunk.quadParams.y;
  let quadSize = chunk.chunkCenter.w;
  
  // Posición exacta en el cubo usando UVs de la malla
  let cubeU = quadX + uv.x * quadSize;
  let cubeV = quadY + uv.y * quadSize;
  
  let fNormal = FaceNormals[faceIdx];
  let fRight  = FaceRights[faceIdx];
  let fUp     = FaceUps[faceIdx];
  
  let cubePos = fNormal + fRight * cubeU + fUp * cubeV;
  let sNorm = normalize(cubePos);

  // 2. DISTANCIA Y ALTURA
  let basePosRel = chunk.chunkCenter.xyz + pulledPos;
  let distToCamera = length(basePosRel); // Distancia estable antes de deformación
  
  let octaves = terrainParams.octaves;
  let heightMultiplier = getTerrainHeight(sNorm, octaves, showNoise, distToCamera);
  let heightKm = clamp(heightMultiplier * ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)}, ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)}, ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)});
  
  // Add height offset along sphere normal
  let snappedHeightKm = max(0.0, heightKm);
  let pos = basePosRel + sNorm * snappedHeightKm;
  
  out.rawHeight = max(heightKm, -1.0) / ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
  out.moisture = getMoisture(sNorm * 3.0);
  
  // 3. SKIRT MÍNIMO (Sella errores de precisión microscópicos)
  var finalPos = pos;
  if ((debugFlagsV & 4u) != 0u) {
    let edgeEps = 0.01; 
    let isEdge = (uv.x < edgeEps || uv.x > 0.99 || uv.y < edgeEps || uv.y > 0.99);
    if (isEdge) {
      finalPos = pos - sNorm * ${TERRAIN_LIMITS.SKIRT_DEPTH.toFixed(2)}; 
    }
  }

  out.clipPos = globals.viewProjection * vec4f(finalPos, 1.0);
  out.normal = computeAnalyticalNormal(sNorm, octaves, showNoise, distToCamera);
  out.sphereNormal = sNorm;
  out.uv = uv;
  out.worldPos = pos;
  out.viewDir = normalize(pos - globals.cameraPos.xyz);
  out.distToCamera = distToCamera;
  out.quadSize = quadSize;
  out.sphereNormal = sNorm;
  
  // Calculate shadow position using cascade 0 (for interpolants)
  // Fragment shader will recalculate per-cascade
  out.shadowPos = shadowGlobals.cascadeViewProj0 * vec4f(finalPos, 1.0);
  
  return out;
}

// ============================================================================
// FRAGMENT SHADER
// ============================================================================

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  // Use same uniform packing as atmosphere shader:
  // whitePoint.w stores flags, earthCenter.w stores mode + bypass bits (mode = w % 100)
  let debugMode = i32(globals.earthCenter.w) % 100;
  
  let sunDir = globals.sunDirection.xyz;
  let earthCenter = globals.earthCenter.xyz;
  let cameraPos = globals.cameraPos.xyz;
  let exposure = globals.cameraPos.w;
  
  let distToCamera = length(in.worldPos - cameraPos);
  
  // PRECISION FIX: Use the stable sphereNormal interpolant passed from Vertex Shader
  // This replaces 'normalize(in.worldPos - earthCenter)' which lost precision with float32
  let p = in.sphereNormal;
  
  // Extract flags early to gate analytical normals
  let debugFlags = u32(globals.whitePoint.w + 0.5);
  let showNoise = (debugFlags & 32u) != 0u;

  // Altitude calculation matching VS scale (110x)
  let altitude = in.rawHeight * ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
  
  // Use interpolated normal from Vertex Shader (High Performance)
  let normal = normalize(in.normal);
  let viewDir = in.viewDir;

  let localUp = p; // localUp is the normalized vector from earthCenter to worldPos
  
  // Mode 1: Normal visualization
  
  // Localized chunk variables from vertex interpolants
  let morphParams = in.morphParams;
  let lodLevel = morphParams.y;
  let isLod0 = lodLevel < 0.5;
  
  // Helper for debug colors (reused in multiple modes)
  var debugTint = vec3f(1.0);
  let showQuads = (debugFlags & 1u) != 0;
  let showSubQuads = (debugFlags & 2u) != 0;
  let showColor = (debugFlags & 8u) != 0;      // Bit 3: terrain color (GetTerrainColor)
  let showProcedural = (debugFlags & 64u) != 0; // Bit 6: procedural textures
  // Perf bypass bits live in earthCenter.w (encoded as terrainDebugMode + bypassFlags * 100).
  // They are NOT packed into debugFlags/whitePoint.w because the atmosphere shader reads
  // the fractional part of whitePoint.w as cos(sun_angular_radius), and float32 precision
  // loss from large bit values would clamp that fraction to 0 (sun fills the entire sky).
  let bypassRaw = i32(globals.earthCenter.w) / 100;
  let bypassTextures = (bypassRaw & 1) != 0;
  let bypassLighting = (bypassRaw & 2) != 0;
  let bypassShadows  = (bypassRaw & 4) != 0;




  // Track if this cell gets a tint (for checkerboard effect)
  var applyQuadTint = false;
  
  if (showQuads) {
    // Use per-quad checkerIndex from CPU (passed via morphParams.w)
    // Each quad is a SOLID color based on its grid position
    let checkerIndex = i32(in.morphParams.w + 0.5);
    if (checkerIndex == 0) { 
      // Red semi-transparent tint (30% opacity)
      debugTint = vec3f(1.0, 0.2, 0.3);
      applyQuadTint = true;
    }
    // else: transparent (no tint, terrain shows through)
  }


  // Mode 1: Normal visualization
  if (debugMode == 1) {
    var normalVis = normal * 0.5 + 0.5;
    if (applyQuadTint) {
      normalVis = mix(normalVis, debugTint, 0.6);
    }
    if (showSubQuads) {
      let sChecker = (i32(floor(in.uv.x * 24.0)) + i32(floor(in.uv.y * 24.0))) % 2;
      if (sChecker == 0) { normalVis = mix(normalVis, vec3f(0.0, 1.0, 0.0), 0.4); }
    }
    return vec4f(normalVis, 1.0);
  }
  
  // Mode 2: Elevation visualization (Grayscale)
  if (debugMode == 2) {
    var elevColor = vec3f(clamp((in.rawHeight + 0.9) / 2.0, 0.0, 1.0));
    if (applyQuadTint) {
      elevColor = mix(elevColor, debugTint, 0.5);
    }
    if (showSubQuads) {
      let sChecker = (i32(floor(in.uv.x * 24.0)) + i32(floor(in.uv.y * 24.0))) % 2;
      if (sChecker == 0) { elevColor = mix(elevColor, vec3f(0.0, 1.0, 0.0), 0.4); }
    }
    return vec4f(elevColor, 1.0);
  }

  // Mode 4: LOD level visualization (Exclusive mode)
  if (debugMode == 4) {
    let lodColor = vec3f(fract(lodLevel / 10.0), fract(lodLevel / 5.0), fract(lodLevel / 2.0));
    let finalLodColor = select(lodColor, vec3f(0.8, 0.2, 0.2), isLod0);
    return vec4f(finalLodColor, 1.0);
  }
  
  // === STANDARD RENDERING (ORTHO MODE) ===
  
  // Final surface color (assuming ambient, diffuse, hemiFill are calculated elsewhere or will be added)
  // For now, initialize with a placeholder or base color
  // Base terrain color
  var terrainColor = vec3f(0.5);  // Gray when Color is disabled
  if (showColor) {
    // Pass the SCALED altitude (KM) for proper biome/ocean gradients
    terrainColor = GetTerrainColor(in.worldPos, normal, altitude, in.moisture, in.viewDir);
  }


  // === SURFACE DETAIL (only when not in debug mode) ===
  var detailNormal = normal;
  
  // Decouple textures and bump mapping logic
  if (!showQuads && !showSubQuads) {
    let lodDetail = in.morphParams.y;
    let showBump = (debugFlags & 128u) != 0u;

    // KTX2 Textures are visible at all LOD levels (from space to ground)
    let texFade = 1.0; 
    let texUV = in.uv * 4.0;
    let ddx = dpdx(texUV);
    let ddy = dpdy(texUV);

    // We always compute blending factors if we need either color OR bump mapping
    if (showColor || showBump) {
      let slope = 1.0 - max(dot(normal, localUp), 0.0);
      let altKm = altitude;

      let landMask = smoothstep(-0.0001, 0.0001, in.rawHeight);
      var blendedTex = vec3f(0.0);
      var blendedNorm = vec3f(0.0, 0.0, 1.0);

      if (landMask > 0.0) {
        let bWidth = terrainParams.beachWidth * 30.0;
        let sSharp = terrainParams.sandSharpness;
        let beachAlt = (1.0 - smoothstep(bWidth * (1.0 - sSharp), bWidth, altKm));

        let sLine = terrainParams.snowLine * 30.0;
        let snowAlt = smoothstep(sLine, sLine + 10.0, altKm);

        let flatness = 1.0 - slope;

        let sandBlend = beachAlt * flatness * 0.8 * terrainParams.sandCoverage;
        let rockThreshold = terrainParams.rockThreshold;
        let rockBlend = smoothstep(rockThreshold, rockThreshold + 0.3, slope) * (1.0 - snowAlt) * terrainParams.rockCoverage;
        let snowBlend = snowAlt * (1.0 - rockBlend * 0.5) * terrainParams.snowCoverage;

        let grassThreshold = terrainParams.grassThreshold;
        let groundBlend = (1.0 - smoothstep(grassThreshold - 0.15, grassThreshold + 0.05, in.moisture)) * (1.0 - beachAlt) * (1.0 - snowAlt) * (1.0 - rockBlend);
        let grassBlend = terrainParams.grassCoverage;

        // === SHADING LOD: aggressive distance-based quality reduction ===
        // > 30km: flat color by biome blend (no procedural noise, no normal maps)
        // 10-30km: procedural color but no normal maps (sub-pixel detail)
        // < 10km: full quality

        // Shading LOD fade factors (smooth transitions — no visible seams)
        let proceduralFade = 1.0 - smoothstep(20.0, 35.0, distToCamera); // procedural → flat
        let bumpFade = 1.0 - smoothstep(5.0, 15.0, distToCamera);       // normal maps → sphere normal

        if (showColor) {
          // Flat biome colors (always cheap to compute)
          var flatTex = terrainParams.colGrass.rgb * grassBlend;
          flatTex = mix(flatTex, terrainParams.colGround.rgb, groundBlend);
          flatTex = mix(flatTex, terrainParams.colSand.rgb, sandBlend);
          flatTex = mix(flatTex, terrainParams.colRock.rgb, rockBlend);
          flatTex = mix(flatTex, terrainParams.colSnow.rgb, snowBlend);

          if (!bypassTextures && proceduralFade > 0.01) {
            // Procedural albedo — skip non-dominant biomes (blend < 0.05)
            // Uses if-branches so GPU can skip gradientNoise calls entirely
            // Saves 4-7 noise calls per pixel in most cases
            var grassSample = terrainParams.colGrass.rgb;
            var rockSample  = terrainParams.colRock.rgb;
            var sandSample  = terrainParams.colSand.rgb;
            if (grassBlend > 0.05) { grassSample = getProceduralGrassColor(p, in.moisture, altKm); }
            if (rockBlend > 0.05)  { rockSample  = getProceduralRockColor(p, slope); }
            if (sandBlend > 0.05)  { sandSample  = getProceduralSandColor(p, altKm, in.moisture); }

            var procTex = grassSample * grassBlend;
            procTex = mix(procTex, terrainParams.colGround.rgb, groundBlend);
            procTex = mix(procTex, sandSample, sandBlend);
            procTex = mix(procTex, rockSample, rockBlend);
            procTex = mix(procTex, terrainParams.colSnow.rgb, snowBlend);

            blendedTex = mix(flatTex, procTex, proceduralFade);
          } else {
            blendedTex = flatTex;
          }
        }

        // Normal maps with smooth fade-out (no hard seam)
        if (!bypassTextures && showBump && bumpFade > 0.01) {
          let grassIdx  = 0;
          let rockIdx   = 1;
          let sandIdx   = 2;
          let snowIdx   = 3;
          let groundIdx = 0;

          let gNorm = textureSampleGrad(normal_array, lut_sampler, texUV, grassIdx, ddx, ddy).rgb * 2.0 - 1.0;
          let rNorm = textureSampleGrad(normal_array, lut_sampler, texUV, rockIdx, ddx, ddy).rgb * 2.0 - 1.0;
          let sNorm = textureSampleGrad(normal_array, lut_sampler, texUV, sandIdx, ddx, ddy).rgb * 2.0 - 1.0;
          let snNorm = textureSampleGrad(normal_array, lut_sampler, texUV, snowIdx, ddx, ddy).rgb * 2.0 - 1.0;
          let groundNorm = textureSampleGrad(normal_array, lut_sampler, texUV, groundIdx, ddx, ddy).rgb * 2.0 - 1.0;

          var detailedNorm = mix(gNorm, groundNorm, groundBlend);
          detailedNorm = mix(detailedNorm, sNorm, sandBlend);
          detailedNorm = mix(detailedNorm, rNorm, rockBlend);
          detailedNorm = mix(detailedNorm, snNorm, snowBlend);

          // Blend from detailed normals to flat (0,0,1) based on distance
          blendedNorm = mix(vec3f(0.0, 0.0, 1.0), detailedNorm, bumpFade);
        }
      }

      // === OCEAN COLOR (Ultra-lightweight — flat color from uniforms) ===
      if (showColor && landMask < 1.0) {
        let depthFactor = smoothstep(0.0, 10.0, abs(altKm));
        let oceanColor = mix(globals.oceanColors1.xyz, globals.oceanColors2.xyz, depthFactor);
        terrainColor = mix(oceanColor, blendedTex, landMask);
      }

      // TBN + bump with smooth fade (land normals only — ocean is flat)
      let tbnFade = 1.0 - smoothstep(15.0, 25.0, distToCamera);
      if (showBump && tbnFade > 0.01 && landMask > 0.01) {
        let localNormal = p;
        var tangent = normalize(cross(localNormal, vec3f(0.0, 0.0, 1.0)));
        if (abs(localNormal.z) > 0.9) { tangent = normalize(cross(localNormal, vec3f(1.0, 0.0, 0.0))); }
        let bitangent = normalize(cross(localNormal, tangent));
        let TBN = mat3x3f(tangent, bitangent, localNormal);

        let bumpNormal = normalize(TBN * normalize(blendedNorm));
        detailNormal = normalize(mix(normal, bumpNormal, 0.7 * texFade * tbnFade * landMask));
      }
    }

    // === OCEAN REFLECTIONS (Minimal — Fresnel + Specular only) ===
    if (in.rawHeight < 0.1 && distToCamera < 30.0) {
        let oceanMaskR = 1.0 - smoothstep(-0.0001, 0.0001, in.rawHeight);
        let fresnel = pow(1.0 - max(dot(normal, -viewDir), 0.0), 4.0);
        let halfVec = normalize(sunDir - viewDir);
        let spec = pow(max(dot(normal, halfVec), 0.0), 128.0) * 0.3;
        terrainColor += vec3f(0.4, 0.5, 0.7) * fresnel * 0.3 * oceanMaskR + vec3f(1.0, 1.0, 0.9) * spec * oceanMaskR;
    }

    // High frequency roughness / micro-detail gated by showBump and showNoise
    // Continuous fading based on distance to camera (equivalent to LOD 12-16)
    if (showBump && showNoise && in.rawHeight > 0.0) {
      let normalFade = 1.0 - smoothstep(10.0, 50.0, distToCamera); // Continuous across boundaries
      if (normalFade > 0.0) {
        let noiseCoord = in.uv * 16.0;
        let roughness = gradientNoise(vec3f(noiseCoord, 0.0) * 10.0) * 0.15 * normalFade;
        detailNormal = normalize(detailNormal + p * roughness);
      }
    }

    if (showNoise && in.rawHeight > 0.0) {
      let grainFade = 1.0 - smoothstep(0.5, 5.0, distToCamera); // Sharp micro-detail near camera
      if (grainFade > 0.0) {
        let grainNoise = gradientNoise(vec3f(in.uv * 64.0, 0.0)) * 0.05 * grainFade;
        terrainColor = terrainColor + grainNoise;
      }
    }
  }

  // Apply debug tint overlays (red/transparent checkerboard)
  if (applyQuadTint) {
    // Red tint at 30% opacity as requested
    terrainColor = mix(terrainColor, debugTint, 0.3);
  }
  if (showSubQuads) {
    let sChecker = (i32(floor(in.uv.x * 24.0)) + i32(floor(in.uv.y * 24.0))) % 2;
    if (sChecker == 0) { terrainColor = mix(terrainColor, vec3f(0.0, 1.0, 0.0), 0.5); }
  }

  // Lighting (using detail normal for roughness)
  // LIGHTING WRAP: Avoid absolute black in the "half-shadow" by adding a slight wrap factor
  let NdotL_raw = dot(detailNormal, sunDir);
  let NdotL = max(NdotL_raw * 0.9 + 0.1, 0.0); // Wrap light slightly into shadow
  let NdotUp = max(dot(detailNormal, localUp), 0.0);


  
  // DAY/NIGHT CALCULATION
  // localUp points away from planet center, sunDir points toward sun
  // When dot(localUp, sunDir) > 0: day side (sun above horizon)
  // When dot(localUp, sunDir) < 0: night side (sun below horizon)
  let sunElevation = dot(localUp, sunDir);
  
  // Smooth transition at terminator — wide twilight zone for small planet
  let dayFactor = smoothstep(-0.25, 0.15, sunElevation);
  
  // TINTED SKY IRRADIANCE (User strategy: Powerful Ambient Light)
  let skyTint = globals.skyTint.rgb;
  let skyIrradianceRaw = GetSkyIrradiance(altitude, dot(localUp, sunDir));
  
  // Powerfully tint the ambient irradiance
  let skyIrradiance = clamp(skyIrradianceRaw * skyTint * 4.0, vec3f(0.0), vec3f(40.0)); // MAX BOOST (x4.0)
  
  let nightAmbient = ${NIGHT_AMBIENT_FLOOR.toFixed(2)} * globals.skyTint.w; 
  let ambientStrength = mix(nightAmbient, 0.8, dayFactor); // Boosted ambient influence
  let ambient = skyIrradiance * (terrainColor * mix(vec3f(1.0), skyTint, 0.2)) * ambientStrength; // Tinted albedo too
  
  // Hemispherical fill (also tinted)
  let hemiFill = skyIrradiance * terrainColor * 0.2 * max(dot(detailNormal, localUp), 0.0) * dayFactor;


  
  // Direct sunlight — dayFactor is the single smooth terminator control
  // Transmittance only tints color on the day side, not the cutoff shape
  let sunTransmittanceRaw = GetSimpleTransmittance(altitude, max(dot(localUp, sunDir), 0.0));
  let sunTransmittance = mix(vec3f(1.0), clamp(sunTransmittanceRaw, vec3f(0.0), vec3f(1.0)), dayFactor);
  let sunIrradiance = ${vec3_SOLAR} * ${SUN_INTENSITY_TERRAIN.toFixed(1)};
  let sunVisibility = getSunVisibility(in.worldPos, sunDir);

  // TINT DIRECT LIGHT (HIGH INTENSITY): 80% of sun light now takes on the sky color
  let sunTint = mix(vec3f(1.0), skyTint, 0.8);
  let direct = sunIrradiance * sunTransmittance * terrainColor * NdotL * sunVisibility * dayFactor * sunTint;
  
  // LUNAR ILLUMINATION - Blue-tinted soft light on night side
  let moonDir = globals.moonDir.xyz;
  let moonBrightness = globals.moonDir.w;  // Typically 0.03 (3% of sun)
  let NdotMoon = max(dot(normal, moonDir), 0.0);
  let moonElevation = dot(localUp, moonDir);
  let nightFactor = 1.0 - dayFactor;  // Inverse of day - 1.0 at night
  
  // Moon lingers below horizon (atmospheric refraction effect)
  let moonVisible = smoothstep(-0.2, 0.1, moonElevation);
  
  // Lunar light is blue-ish and much dimmer than sun
  let moonColor = vec3f(0.6, 0.7, 1.0);  // Blue tint
  let lunar = moonColor * terrainColor * NdotMoon * moonBrightness * nightFactor * moonVisible;
  
  // Combine lighting - ensure no negative values
  // ABSOLUTE MINIMUM FLOOR: 5% of terrain color is always visible, but tinted by sky
  let lightFloor = terrainColor * 0.05 * dayFactor * skyTint;
  // Constant blue ambient floor — prevents total darkness during sun/moon transition
  let globalAmbientFloor = terrainColor * vec3f(0.01, 0.015, 0.04);
  var color = max(ambient + direct + lunar + hemiFill + lightFloor, vec3f(0.0));

  // Shadow day weight (needed for CSM and combine)
  let shadowDayWeight = globals.rainParams.y;

  // === CASCADED SHADOW MAPPING (CSM + PCF + cascade fallback) ===
  var shadowVisibility = 1.0;
  if (!bypassShadows && distToCamera < 15.0) {
    let shadowLightDir = select(moonDir, sunDir, shadowDayWeight > 0.5);
    var startCascade = selectCascade(distToCamera);

    // Try selected cascade, fall back to wider cascades if out of bounds
    var found = false;
    for (var ci = 0u; ci < 4u; ci = ci + 1u) {
      if (found) { break; }
      let idx = startCascade + ci;
      if (idx > 3u) { break; }
      let vp = getCascadeViewProj(idx);
      let clip = vp * vec4f(in.worldPos, 1.0);
      let ndc = clip.xyz / clip.w;
      let uv = vec2f(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
      let inB = all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)) && ndc.z <= 1.0;
      if (inB) {
        let bs = 1.0 + f32(idx) * 0.5;
        let depth = ndc.z - (0.0003 * bs + 0.0012 * (1.0 - saturate(dot(detailNormal, shadowLightDir))) * bs);
        var avg = textureSampleCompareLevel(shadowMapArray, shadowSampler, uv, idx, depth);
        if (distToCamera < 10.0 && idx < 3u) {
          let ts = 1.0 / 2048.0;
          avg += textureSampleCompareLevel(shadowMapArray, shadowSampler, uv + vec2f(ts, 0.0), idx, depth);
          avg += textureSampleCompareLevel(shadowMapArray, shadowSampler, uv + vec2f(-ts, 0.0), idx, depth);
          avg += textureSampleCompareLevel(shadowMapArray, shadowSampler, uv + vec2f(0.0, ts), idx, depth);
          avg += textureSampleCompareLevel(shadowMapArray, shadowSampler, uv + vec2f(0.0, -ts), idx, depth);
          avg /= 5.0;
        }
        shadowVisibility = avg;
        found = true;
      }
    }
  }
  // Smooth fade: CSM shadows dissolve 10-15km (no visible circle)
  let csmFade = smoothstep(10.0, 15.0, distToCamera);
  shadowVisibility = mix(shadowVisibility, 1.0, csmFade);

  // === CLOUD SHADOWS WITH COLOR TINT ===
  let cloudTime = globals.miscParams.x;
  let cloudCoverage = globals.miscParams.z;
  let shadowToggle = globals.cloudOpacities.w;  // 1.0 = on, 0.0 = off

  // Cloud shadows need wider fade (very visible on uniform water surfaces)
  var cloudShadow = 1.0;
  if (!bypassShadows && shadowToggle > 0.5 && distToCamera < 20.0) {
    cloudShadow = sampleCloudShadow(in.worldPos, sunDir, cloudTime, cloudCoverage);
  }
  // Wide fade 5-20km: eliminates visible arc on ocean
  let cloudFade = smoothstep(5.0, 20.0, distToCamera);
  cloudShadow = mix(cloudShadow, 1.0, cloudFade);

  // Cloud shadow color: Use skyTint instead of hardcoded blue for deeper integration
  let cloudShadowTint = mix(skyTint, vec3f(1.0), cloudShadow);
  
  // CSM shadow applies to whichever light is the shadow caster
  // Day: shadow on direct sunlight, Night: shadow on lunar light
  let directShadow = mix(1.0, shadowVisibility, shadowDayWeight);
  let lunarShadow = mix(shadowVisibility, 1.0, shadowDayWeight);

  // Cloud shadows only affect sunlight (daytime phenomenon)
  let cloudAmbientDim = mix(1.0, cloudShadow, 0.5 * dayFactor);
  let cloudShadowTinted = mix(vec3f(1.0), cloudShadowTint, dayFactor);
  let directWithShadow = direct * directShadow * cloudShadow * cloudShadowTinted;
  let lunarWithShadow = lunar * lunarShadow;
  color = max(ambient * cloudAmbientDim + directWithShadow + lunarWithShadow + hemiFill + lightFloor + globalAmbientFloor, vec3f(0.0));

  // Lighting bypass for perf measurement — replace fully-lit color with raw albedo.
  // Placed after the normal path so the original render is byte-identical when the bypass is off.
  if (bypassLighting) {
    color = terrainColor;
  }

  // === RAIN SPLASH EFFECTS (Circles) — near the player only ===
  // Beyond splashRange the whole 3x3 ripple loop is skipped; a soft falloff
  // fades the effect out before the cut so there is no hard ring on the ground.
  let rainIntensity = globals.rainParams.x;
  let splashRange = 1.0;    // 1 km — intentionally wider than the rain-drop disk
                            // (RAIN_CONFIG.baseSpawnRadius = 40 m). The procedural
                            // splashes carry the "it's raining everywhere" sense
                            // out to the horizon where individual drops are too
                            // small to render. Don't shrink this to match the
                            // particles — it's the splash field that sells the
                            // scale of the storm beyond the close-up volume.
  if (rainIntensity > 0.01 && in.distToCamera < splashRange) {
    let splashFalloff = 1.0 - smoothstep(splashRange * 0.7, splashRange, in.distToCamera);
    // ROTATION-STABLE HYPER-PRECISION COORDINATES
    // quadSize is in KM, faceScale is approx planet radius in Meters.
    // By using (uv * quadSize * faceScale), we get meters local to the chunk.
    // This is 100% stable during camera rotation.
    let faceScale = ${PLANET_RADIUS.toFixed(1)} * 1000.0;
    let worldXZ = in.uv * in.quadSize * faceScale;

    let splashGridSize = 18.0; // ~1 circle per 320 m² — big, well-separated rings
                               // that read as a few impacts per visible patch of
                               // terrain instead of a "field of dots".
    var totalSplash = 0.0;
    var totalGlisten = 0.0;
    var rippleNormal = vec3f(0.0);
    let time = globals.miscParams.w;
    
    let halfVec = normalize(sunDir - viewDir);
    let NdotH = max(dot(detailNormal, halfVec), 0.0);
    
    // Basis for perturbation
    let localUp = p;
    let localRight = normalize(cross(vec3f(0.0, 1.0, 0.0), localUp));
    let localForward = cross(localUp, localRight);
    
    // DISTANCE-BASED LOD: Reduce calculations for distant fragments
    let splashDist = in.distToCamera; // in km
    let nearThreshold = 0.03;  // 30m - full detail
    let farThreshold = 0.05;   // 50m - reduced detail
    let maxRipples = select(1u, 2u, splashDist < nearThreshold); // 1 ripple if far, 2 if near
    let doExpensiveGlisten = splashDist < farThreshold; // Skip specSparkle beyond 50m
    
    for (var gx = -1; gx <= 1; gx++) {
      for (var gz = -1; gz <= 1; gz++) {
        let cellCoord = floor(worldXZ / splashGridSize) + vec2f(f32(gx), f32(gz));
        let cellHash = fract(sin(dot(cellCoord, vec2f(12.9898, 78.233))) * 43758.5453);
        let cellHash2 = fract(sin(dot(cellCoord, vec2f(37.112, 13.411))) * 21543.123);
        let splashPos = (cellCoord + vec2f(cellHash * 0.7 + 0.15, cellHash2 * 0.7 + 0.15)) * splashGridSize;
        let dist = length(worldXZ - splashPos);
        
        for (var rippleIdx = 0u; rippleIdx < maxRipples; rippleIdx++) {
          let rippleSeed = cellHash + f32(rippleIdx) * 0.5;
          let ripplePhase = fract(time * 0.6 / (1.2 + rippleSeed) + rippleSeed);
          let maxRadius = 7.0 + f32(rippleIdx) * 5.0;
          let currentRadius = ripplePhase * maxRadius;
          
          let distToRing = dist - currentRadius;
          let ringIntensity = exp(-150.0 * distToRing * distToRing);
          let fade = pow(1.0 - ripplePhase, 2.0);
          
          totalSplash += ringIntensity * fade * 0.8; 
          
          let ringGradient = -300.0 * distToRing * ringIntensity * fade;
          let distortion = normalize(worldXZ - splashPos) * ringGradient * 0.06;
          rippleNormal += vec3f(distortion.x, 0.0, distortion.y);
        }
        
        // IMPACT Glistening Dots (GOTITAS) — tiny, subtle wet specks at the
        // splash centre. Kept much dimmer than the expanding rings so the
        // dot reads as "ah, that's where the drop landed" instead of a
        // bright white spotlight on the terrain.
        let impactPhase = fract(time * 2.0 / (0.6 + cellHash * 0.3) + cellHash2);
        if (impactPhase < 0.15) {
          let impactLife = 1.0 - impactPhase / 0.15;
          let impactRadius = 0.5 * impactLife;
          let impactPoint = smoothstep(impactRadius, 0.0, dist);

          totalSplash += impactPoint * 1.0 * impactLife;

          // Only calculate expensive specular sparkle for near fragments.
          if (doExpensiveGlisten) {
            let specSparkle = pow(NdotH, 8.0) * impactPoint * 15.0 * impactLife;
            let omniSparkle = impactPoint * 1.0 * impactLife;
            totalGlisten += (specSparkle + omniSparkle);
          } else {
            totalGlisten += impactPoint * 1.0 * impactLife;
          }

          rippleNormal += vec3f(0.0, impactPoint * 10.0 * impactLife, 0.0);
        }
      }
    }
    
    let groundAlignment = dot(detailNormal, p);
    let horizontalFactor = smoothstep(0.7, 0.85, groundAlignment);
    
    // APPLY RIPPLE NORMALS
    let finalNormal = normalize(detailNormal + (localRight * rippleNormal.x + localForward * rippleNormal.z + localUp * rippleNormal.y) * horizontalFactor);
    let newNdotH = max(dot(finalNormal, halfVec), 0.0);

    // UNIFORM WET SURFACE
    let wetLook = rainIntensity * horizontalFactor * splashFalloff;
    color = mix(color, color * 0.3 + vec3f(0.001, 0.002, 0.004) * skyTint, wetLook);
    
    // Squared intensity gain — when rain fades out (rainIntensity exponential
    // decay), the brain notices a slow tail because each ring still has to
    // play out its 1.2 s expansion. Squaring makes the visible decay much
    // steeper than the underlying lerp, so when the rain stops the circles
    // are gone in ~1 s instead of ~4 s. Ramp-in feels the same.
    let splashGain = rainIntensity * rainIntensity;
    let ambientSplash = totalSplash * (0.5 * skyTint + vec3f(0.35)) * splashGain;
    let directSplash = totalSplash * 1.6 * dayFactor * splashGain;

    let splashColorV = vec3f(0.95, 0.98, 1.0) * (ambientSplash + directSplash) * horizontalFactor;
    // Glisten tint dialled back from (skyTint * 7 + 3) to (skyTint * 2 + 0.8)
    // — the old multiplier blew the impact specks to pure white spotlights;
    // this keeps them shiny but subtle.
    let glistenPop = totalGlisten * splashGain * horizontalFactor * (skyTint * 2.0 + vec3f(0.8));
    color = color + (splashColorV + glistenPop) * splashFalloff;

    let wetSpec = pow(newNdotH, 24.0) * 0.8 * wetLook;
    color += skyTint * 1.8 * wetSpec * dayFactor;
  }

  // === SNOW ACCUMULATION — procedural white cover on flat surfaces ===
  // Drives the visual "it's snowing" feeling without faking real accumulation
  // (we don't bake into a texture). Reads snowIntensity from rainParams.z and
  // mixes the terrain colour toward white wherever the surface faces up. The
  // patch noise breaks up the otherwise-uniform wash so it doesn't look like
  // someone painted the ground.
  let snowIntensity = globals.rainParams.z;
  if (snowIntensity > 0.01) {
    // Land mask (smoothstep for soft beach edge) only computed when we're
    // actually going to render snow — hoisting this out of the gate was
    // costing ~11 GFLOPS per frame even when snowIntensity was 0.
    let snowLandMask = smoothstep(-0.0001, 0.0001, in.rawHeight);
    if (snowLandMask > 0.01) {
    // World tangent coords for the patch noise. Cheap recomputation.
    let snowFaceScale = ${PLANET_RADIUS.toFixed(1)} * 1000.0;
    let snowWorldXZ = in.uv * in.quadSize * snowFaceScale;

    // 1. Horizontal bias — snow accumulates on ground, not on cliffs. Use a
    // sharp pow so vertical surfaces stay bare. (p is the surface normal in
    // planet-local up; detailNormal is the perturbed shading normal.)
    let snowAlignment = max(dot(detailNormal, p), 0.0);
    let horizontalSnow = pow(snowAlignment, 3.5);

    // 2. Patch noise — two-scale value noise so the cover varies in chunks
    // (big patches) with a smaller secondary detail (drift edges, smaller
    // bare spots within patches). Range remapped to [0.55, 1.05] so the
    // minimum is still mostly-covered but the maximum can go a touch
    // over-bright for highlights.
    let snowPatchCoarse = fract(sin(dot(floor(snowWorldXZ * 0.08), vec2f(127.1, 311.7))) * 43758.5453);
    let snowPatchFine = fract(sin(dot(floor(snowWorldXZ * 0.4), vec2f(269.5, 183.3))) * 43758.5453);
    let snowPatch = mix(0.55, 1.05, snowPatchCoarse * 0.7 + snowPatchFine * 0.3);

    // 3. Coverage factor in [0, 1] — clamped so even at intensity 1 you don't
    // fully bury the terrain colour (some peaks of rock or grass poke through).
    // Multiplied by landMask so the beach edge fades to no snow at the shore.
    // snowIntensity squared so the cover *builds up* gradually: at intensity
    // 0.5 the visual is 25 %, at 0.8 it's 64 %. The linear lerp upstream
    // already smooths the value over ~3.7 s; squaring extends that into a
    // subtle "dusting → light cover → full mantle" feel instead of a plateau.
    let snowGrowth = snowIntensity * snowIntensity;
    let snowCoverage = clamp(snowGrowth * horizontalSnow * snowPatch * snowLandMask, 0.0, 0.92);

    // 4. Mix terrain toward a slightly blue-white. Cool sky tint contributes
    // a soft shadow tone so the snow doesn't read as paper-white in night
    // scenes where the rest of the world is dim. The snow tint is then
    // attenuated by the SAME shadow factors used on the direct lighting
    // (CSM + cloud) — without this the snow paints over both lit and
    // shadowed ground equally, washing the shadows out at high coverage.
    let snowBaseColor = vec3f(0.94, 0.96, 1.0);
    let snowSkyTinted = mix(snowBaseColor, snowBaseColor * (skyTint * 0.6 + vec3f(0.5)), 0.4);
    let snowShadow = 0.45 + 0.55 * directShadow * cloudShadow;  // shadowed snow ≥ 45 % brightness
    color = mix(color, snowSkyTinted * snowShadow, snowCoverage);

    // 5. Subtle specular sparkle — snow catches sunlight as tiny crystals.
    // Uses the existing half-vector to avoid recomputing.
    let snowHalf = normalize(sunDir - viewDir);
    let snowNdotH = max(dot(detailNormal, snowHalf), 0.0);
    let snowSparkle = pow(snowNdotH, 32.0) * snowCoverage * 0.4 * dayFactor;
    color += skyTint * snowSparkle;
    }
  }

  // LIGHTNING AMBIENT FLASH — lights the terrain near the strike at any camera
  // distance, so it stays outside the near-player splash cull above.
  let lightningFlash = globals.lightning_params.x;
  if (lightningFlash > 0.01) {
      let strikeRelPos = globals.lightning_params.yzw; // Relative to camera
      // Transform relative strike pos to planet-centered (worldPos) space
      // strikeRelativeToEarth = strikeRelPos - globals.earthCenter.xyz
      let strikeWorldPos = strikeRelPos - globals.earthCenter.xyz;
      let distToStrike = length(in.worldPos - strikeWorldPos);
      let terrainGlow = exp(-distToStrike * 0.8) * lightningFlash * 2.0;
      color += (skyTint * 0.5 + vec3f(0.5)) * terrainGlow;
  }

  // Apply aerial perspective (atmospheric fog) — base 0.02, scales up with
  // rain so heavy storms veil the distance more strongly. Scaling is linear
  // so the change is barely perceptible during drizzle, prominent at full
  // storm intensity.
  let fogIntensity = 0.02 + globals.rainParams.x * 0.08;
  let aerial = GetAerialPerspective(in, cameraPos, sunDir);
  let aerialColor = clamp(aerial.rgb, vec3f(0.0), vec3f(5.0));  // Clamp fog color
  
  // Opacity depends on scattering amount and user slider, independent of day/night
  let fogBlend = aerial.a * fogIntensity; 
  color = mix(color, aerialColor, fogBlend);
  
  // Add sun disk for very distant terrain (gives illusion of sun in sky)
  let rayDir = normalize(in.worldPos - cameraPos);
  let sunDotView = dot(rayDir, sunDir);
  let SUN_ANGULAR_RADIUS = 0.00467; // Half of 0.00935
  let cosSunRadius = cos(SUN_ANGULAR_RADIUS);
  if (sunDotView > cosSunRadius && in.distToCamera > 500.0) {
    // Sun disk contribution - fade based on distance and angle
    let sunStrength = smoothstep(cosSunRadius, cosSunRadius + 0.002, sunDotView);
    let distFade = smoothstep(500.0, 2000.0, in.distToCamera);
    let sunColor = ${vec3_SOLAR} * ${SUN_INTENSITY_SPACE.toFixed(1)}; // Bright solar radiance
    color = mix(color, sunColor, sunStrength * distFade * 0.8);
  }
  // Apply exposure and tone mapping
  let white_point = globals.whitePoint.xyz;
  // Ensure color is never negative (can happen with some lighting calculations)
  let safeColor = max(color, vec3f(0.0));
  // Tone mapping with Reinhard-style exposure
  var mapped = pow(vec3f(1.0) - exp(-safeColor / white_point * exposure), vec3f(1.0 / 2.2));
  
  // Apply final saturation pass
  let saturation = globals.skyStylization.x;
  let gray = dot(mapped, ${vec3_LUM});
  mapped = mix(vec3f(gray), mapped, saturation);
  
  // Ensure minimum visible value on night side to prevent transparency artifacts
  mapped = max(mapped, vec3f(0.005));  // Very dark but not black
  
  return vec4f(mapped, 1.0);
}


// ============================================================================
// WIREFRAME DEBUG SHADER (Alternative entry points)
// ============================================================================

@vertex
fn vs_wireframe(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  
  // VERTEX PULLING (Sync with vs_main)
  let slotIdx = visibleIndices[in.instanceIdx];
  let baseIdx = (slotIdx * 625u + in.vertexIdx) * 5u;
  
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  let uv = vec2f(allVertices[baseIdx + 3u], allVertices[baseIdx + 4u]);

  let chunk = instances[slotIdx];
  let debugFlagsV = u32(globals.whitePoint.w + 0.5);
  let showNoise = (debugFlagsV & 32u) != 0u;
  
  // 1. PROCEDURAL NORMAL
  let faceIdx = u32(chunk.quadParams.z + 0.5);
  let quadX = chunk.quadParams.x;
  let quadY = chunk.quadParams.y;
  let quadSize = chunk.chunkCenter.w;
  let cubePos = FaceNormals[faceIdx] + FaceRights[faceIdx] * (quadX + uv.x * quadSize) + FaceUps[faceIdx] * (quadY + uv.y * quadSize);
  let sNorm = normalize(cubePos);

  // 2. DISTANCE & HEIGHT matching vs_main
  let basePosRel = chunk.chunkCenter.xyz + pulledPos;
  let distToCamera = length(basePosRel);
  
  let octaves = terrainParams.octaves;
  let heightMultiplier = getTerrainHeight(sNorm, octaves, showNoise, distToCamera);
  let heightKm = clamp(heightMultiplier * ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)}, ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)}, ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)});
  let pos = basePosRel + sNorm * heightKm;
  
  // 3. SKIRT MÍNIMO
  var finalPos = pos;
  if ((debugFlagsV & 4u) != 0u) {
    let edgeEps = 0.01; 
    if (uv.x < edgeEps || uv.x > 0.99 || uv.y < edgeEps || uv.y > 0.99) {
      finalPos = pos - sNorm * ${TERRAIN_LIMITS.SKIRT_DEPTH.toFixed(2)};
    }
  }

  out.rawHeight = heightKm / ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
  out.clipPos = globals.viewProjection * vec4f(finalPos, 1.0);
  out.worldPos = pos;
  out.normal = sNorm; // Use reconstructed normal for wireframe too
  out.uv = uv;
  out.viewDir = normalize(pos - globals.cameraPos.xyz);
  out.distToCamera = distToCamera;
  out.sphereNormal = sNorm;
  out.quadSize = quadSize;
  return out;
}



@fragment
fn fs_wireframe(in : VertexOutput) -> @location(0) vec4f {
  // Read debug flags from uniforms
  let debugFlags = i32(floor(globals.whitePoint.w));
  let showQuads = (debugFlags & 1) != 0;
  let showSubQuads = (debugFlags & 2) != 0;
  
  // Wireframe grid lines (internal mesh detail - 24×24 cells)
  let gridRes = 24.0;
  let gridUV = fract(in.uv * gridRes);
  let gridEdge = min(gridUV.x, min(gridUV.y, min(1.0 - gridUV.x, 1.0 - gridUV.y)));
  let gridLine = smoothstep(0.08, 0.0, gridEdge);
  
  // Quad border lines (edges of each terrain chunk) and Fills
  var quadLine = 0.0;
  var quadFill = 0.0;
  if (showQuads) {
    let quadEdge = min(in.uv.x, min(in.uv.y, min(1.0 - in.uv.x, 1.0 - in.uv.y)));
    quadLine = smoothstep(0.02, 0.0, quadEdge);
    
    // RED checkerboard fill for quads (50% opacity as requested)
    let checkerIndex = i32(in.morphParams.w + 0.5);
    if (checkerIndex == 0) {
      quadFill = 0.5;
    }
  }
  
  // Sub-quad checkerboard fill (24×24 translucent orange caps)
  var subQuadFill = 0.0;
  if (showSubQuads) {
    let subGridX = i32(floor(in.uv.x * 24.0));
    let subGridY = i32(floor(in.uv.y * 24.0));
    let checker = (subGridX + subGridY) % 2;
    if (checker == 0) {
      subQuadFill = 0.5;  // 50% opacity for orange fill
    }
  }
  
  // Combine lines for wireframe
  let totalLine = max(gridLine, quadLine * 1.5);
  
  // Determine final color and alpha
  var finalColor = vec3f(0.0);
  var finalAlpha = 0.0;
  
  // Quad fills (red translucent) - lowest priority
  if (quadFill > 0.1) {
    finalColor = vec3f(1.0, 0.2, 0.3);  // Red
    finalAlpha = 0.5;                    // 50% opacity as requested
  }

  // Sub-quad fills (green translucent caps) - medium priority
  if (subQuadFill > 0.1) {
    // If quad is already red, we mix it or just overwrite with green
    // The user wants "tapitas", so green on top of red/transparent
    finalColor = mix(finalColor, vec3f(0.0, 1.0, 0.0), 0.6); 
    finalAlpha = max(finalAlpha, 0.3); 
  }
  
  // Grid lines (cyan) - drawn on top of fills
  if (gridLine > 0.1) {
    finalColor = vec3f(0.0, 1.0, 0.8);  // Cyan
    finalAlpha = 0.7 * gridLine;
  }
  
  // Quad borders (red) - highest priority
  if (quadLine > 0.1) {
    finalColor = vec3f(1.0, 0.2, 0.2);  // Red
    finalAlpha = 0.9 * quadLine;
  }
  
  if (finalAlpha < 0.05) { discard; }
  
  return vec4f(finalColor, finalAlpha);
}
`;
