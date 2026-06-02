import { 
  getGridConstantsWGSL, 
  getGridOutputStructWGSL, 
  PHYSICS_GRID_CONFIG,
  PLANET_RADIUS,
  TERRAIN_SCALES,
  TERRAIN_LIMITS
} from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

export const terrainHeightGridComputeShader = /* wgsl */`

${getGridConstantsWGSL()}

// Input: Pre-computed avatar data from CPU (float64 precision)
struct GridInput {
  avatarNormal : vec3f,       // Pre-computed sphere normal (unit vector)
  distToCenter : f32,         // Distance from earth center
  right : vec3f,              // Local right vector (pre-computed)
  _pad1 : f32,
  forward : vec3f,            // Local forward vector (pre-computed)
  _pad2 : f32,
}

${getGridOutputStructWGSL()}

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
  grassCoverage : f32,
  sandCoverage : f32,
  snowCoverage : f32,
  rockCoverage : f32,
  octaves : f32,
  warpScale : f32,
  warpStrength2 : f32,
  peakSoftness : f32,
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
  debugFlags : f32, // Bit 5: showNoise
  lakeDetail : f32
}

@group(0) @binding(0) var<uniform> input : GridInput;
@group(0) @binding(1) var<storage, read_write> output : GridOutput;
@group(0) @binding(2) var<uniform> params : TerrainParams;

const EARTH_RADIUS: f32 = ${PLANET_RADIUS.toFixed(1)};
const HEIGHT_SCALE: f32 = ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};

// ============================================================================
// NOISE SYSTEM (Imported)
// ============================================================================

${noiseWGSL}

// ============================================================================
// TERRAIN HEIGHT (Synchronized with terrain.wgsl.js)
// ============================================================================

fn getTerrainHeight(p_in: vec3f, octaves_in: f32) -> f32 {
  // PHYSICS GRID: Always calculate terrain height (ignore showNoise debug flag)
  let showNoise = true;
  
  // 1. DOMAIN WARPING
  let warpFactor = params.warpFactor;
  let warpScale = params.warpScale;
  let q = vec3f(
    gradientNoise(p_in * warpScale + vec3f(0.0, 0.0, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(5.2, 1.3, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(1.1, 0.0, 2.4))
  ) * warpFactor;
  
  let p1 = p_in + q;
  let r = vec3f(
    gradientNoise(p1 * warpScale * 2.0 + vec3f(3.3, 0.0, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 4.4, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 0.0, 5.5))
  ) * params.warpStrength2;
  
  let p = p1 + r;
  
  // 2. MOUNTAIN/PLAINS MASK
  let mount_mask = smoothstep(-0.1, 0.35, gradientNoise(p * params.mountMaskFreq + vec3f(12.3)));
  
  // 3. BASE fBM
  var h: f32 = 0.0;
  var a: f32 = params.baseAmplitude;
  var f: f32 = params.baseFrequency;
  
  let totalOctaves = i32(params.octaves + 0.5);
  
  for (var i = 0; i < 24; i = i + 1) {
    if (i >= totalOctaves) { break; }
    h += a * gradientNoise(p * f);
    a *= params.persistence;
    f *= params.lacunarity;
  }
  
  // 4. VERTICAL CONTRAST BOOST & PEAK SOFTNESS
  let hSign = sign(h);
  var exp = params.contrastExp;
  exp = mix(exp, exp * 0.5, smoothstep(0.1, 0.5, abs(h)) * params.peakSoftness);
  
  h = (hSign * pow(abs(h), exp) * params.contrastScale) + params.seaLevelOffset;
  
  // 5. BIOME-SPECIFIC TOPOGRAPHY
  if (h > 0.0) {
    h = mix(h * 0.1, h, smoothstep(0.0, 0.1, h));
    if (showNoise) {
      let ridgeFreq = params.baseFrequency * 1.6;
      let r1 = ridgeNoise(p * ridgeFreq);
      let r2 = ridgeNoise(p * ridgeFreq * 2.7);

      let sharp_r1 = pow(r1, params.mountainSharpness);
      let ridge_detail = (0.4 * sharp_r1 * sharp_r1 + 0.15 * r2) * params.ridgeDetail;
      h = h + ridge_detail * mount_mask * h * 1.4;
    }
    
    let tAmt = params.terraceAmount;
    if (tAmt > 0.0) {
        let tSmooth = params.terraceSmooth;
        let cell = floor(h * tAmt);
        let frac = fract(h * tAmt);
        let smooth_frac = smoothstep(0.0, tSmooth, frac);
        h = (cell + smooth_frac) / tAmt;
    }

    // 5c. INLAND LAKES
    let lakeD = params.lakeDetail;
    if (lakeD > 0.0) {
      let lakeFreq = params.baseFrequency * 2.5;
      let lakeNoise = gradientNoise(p * lakeFreq + vec3f(7.7, 3.3, 9.9));
      let inlandMask = smoothstep(0.0, 0.01, h);
      h -= max(0.0, lakeNoise) * lakeD * inlandMask * 0.15;
    }

  } else {
    let shelfWidth = params.shelfWidth;
    h = mix(h * 0.1, h, smoothstep(0.0, -0.2 * shelfWidth, h));
    
    let tr1 = ridgeNoise(p * 5.0 + vec3f(12.3));
    let tr2 = ridgeNoise(p * 15.0);
    let abyss_detail = (tr1 * tr1 * 1.5 + tr2 * 0.4) * params.abyssDetail;
    h -= abyss_detail * abs(h) * 1.8 * smoothstep(0.0, -0.15, h);
  }
  
  return h * params.detailScale;
}

// ============================================================================
// COMPUTE ENTRY POINT
// ============================================================================

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
  let x = global_id.x;
  let y = global_id.y;
  
  // Only process valid grid points
  if (x >= GRID_SIZE || y >= GRID_SIZE) {
    return;
  }
  
  let idx = y * GRID_SIZE + x;
  
  // FLOATING ORIGIN FIX: Use pre-computed data from CPU (float64)
  let avatarNorm = input.avatarNormal;
  let right = input.right;
  let forward = input.forward;
  
  // Calculate local offset from avatar center (in meters)
  let halfGrid = f32(GRID_SIZE - 1u) / 2.0;
  let offsetX = (f32(x) - halfGrid) * GRID_SPACING; 
  let offsetY = (f32(y) - halfGrid) * GRID_SPACING;
  
  // Convert meters to km and compute offset on sphere surface
  let localOffsetKm = (right * offsetX + forward * offsetY) * 0.001;
  
  // Compute new sphere normal at grid point
  let gridNormal = normalize(avatarNorm + localOffsetKm / EARTH_RADIUS);
  
  // Calculate terrain height
  let heightRaw = getTerrainHeight(gridNormal, params.octaves);
  let heightKm = clamp(heightRaw * HEIGHT_SCALE, ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)}, ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)});
  
  // Store results
  output.heights[idx] = heightKm;
  output.normals[idx] = gridNormal;
}
`;

