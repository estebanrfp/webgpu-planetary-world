/**
 * Parcel Preview Baker — renders 2D terrain thumbnails via WebGPU.
 * Uses the REAL terrain noise (gradientNoise quintic, ridgeNoise),
 * height generation (domain warping, fBM, biome topography),
 * and biome coloring from the production terrain shader.
 * @module terrain/parcel-preview
 */

import { TERRAIN_GENERATION_PARAMS } from '../config/terrainConfig.js'

const BAKE_SIZE = 64
const BAKE_BYTES_PER_ROW = 256 // Must be multiple of 256 for WebGPU

/** Ensure JS number serializes as WGSL float (e.g. 0 → "0.0", 1 → "1.0") */
const f = v => String(v).includes('.') ? String(v) : `${v}.0`

/**
 * Build WGSL shader with terrain params hardcoded as constants.
 * @param {object} tp - Terrain generation params
 * @returns {string} WGSL shader code
 */
const buildBakeShader = (tp) => /* wgsl */`
struct BakeUniforms {
  face: f32,
  localX: f32,
  localY: f32,
  faceSize: f32,
}

@group(0) @binding(0) var<uniform> uniforms: BakeUniforms;

// ── Terrain params (hardcoded from terrainConfig.js) ────────────────────────
const TP_warpFactor = ${f(tp.warpFactor)};
const TP_mountMaskFreq = ${f(tp.mountMaskFreq)};
const TP_baseAmplitude = ${f(tp.baseAmplitude)};
const TP_baseFrequency = ${f(tp.baseFrequency)};
const TP_persistence = ${f(tp.persistence)};
const TP_lacunarity = ${f(tp.lacunarity)};
const TP_contrastExp = ${f(tp.contrastExp)};
const TP_contrastScale = ${f(tp.contrastScale)};
const TP_seaLevelOffset = ${f(tp.seaLevelOffset)};
const TP_ridgeDetail = ${f(tp.ridgeDetail)};
const TP_abyssDetail = ${f(tp.abyssDetail)};
const TP_detailScale = ${f(tp.detailScale)};
const TP_octaves = ${f(tp.octaves)};
const TP_warpScale = ${f(tp.warpScale)};
const TP_warpStrength2 = ${f(tp.warpStrength2)};
const TP_peakSoftness = ${f(tp.peakSoftness)};
const TP_terraceAmount = ${f(tp.terraceAmount)};
const TP_terraceSmooth = ${f(tp.terraceSmooth)};
const TP_mountainSharpness = ${f(tp.mountainSharpness)};
const TP_shelfWidth = ${f(tp.shelfWidth)};
const TP_beachWidth = ${f(tp.beachWidth)};
const TP_snowLine = ${f(tp.snowLine)};
const TP_sandSharpness = ${f(tp.sandSharpness)};
const TP_rockThreshold = ${f(tp.rockThreshold)};
const TP_grassThreshold = ${f(tp.grassThreshold)};
const TP_globalMoisture = ${f(tp.globalMoisture)};
const TP_lakeDetail = ${f(tp.lakeDetail)};

// Biome colors
const COL_GRASS = vec3f(${f(tp.colGrass[0])}, ${f(tp.colGrass[1])}, ${f(tp.colGrass[2])});
const COL_FOREST = vec3f(${f(tp.colForest[0])}, ${f(tp.colForest[1])}, ${f(tp.colForest[2])});
const COL_ROCK = vec3f(${f(tp.colRock[0])}, ${f(tp.colRock[1])}, ${f(tp.colRock[2])});
const COL_SNOW = vec3f(${f(tp.colSnow[0])}, ${f(tp.colSnow[1])}, ${f(tp.colSnow[2])});
const COL_SAND = vec3f(${f(tp.colSand[0])}, ${f(tp.colSand[1])}, ${f(tp.colSand[2])});
const COL_GROUND = vec3f(${f(tp.colGround[0])}, ${f(tp.colGround[1])}, ${f(tp.colGround[2])});
const COL_SHALLOW = vec3f(${f(tp.colShallowSea[0])}, ${f(tp.colShallowSea[1])}, ${f(tp.colShallowSea[2])});
const COL_DEEP = vec3f(${f(tp.colDeepSea[0])}, ${f(tp.colDeepSea[1])}, ${f(tp.colDeepSea[2])});

// ── Noise functions (exact copy from noise.wgsl.js) ─────────────────────────

fn hash33(p: vec3f) -> vec3f {
  var q = fract(p * vec3f(443.897, 441.423, 437.195));
  q += dot(q, q.yxz + 19.19);
  return fract((q.xxy + q.yxx) * q.zyx);
}

fn gradientNoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // Quintic

  let n000 = dot(hash33(i + vec3f(0.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3f(0.0, 0.0, 0.0));
  let n001 = dot(hash33(i + vec3f(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3f(0.0, 0.0, 1.0));
  let n010 = dot(hash33(i + vec3f(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3f(0.0, 1.0, 0.0));
  let n011 = dot(hash33(i + vec3f(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3f(0.0, 1.0, 1.0));
  let n100 = dot(hash33(i + vec3f(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3f(1.0, 0.0, 0.0));
  let n101 = dot(hash33(i + vec3f(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3f(1.0, 0.0, 1.0));
  let n110 = dot(hash33(i + vec3f(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3f(1.0, 1.0, 0.0));
  let n111 = dot(hash33(i + vec3f(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3f(1.0, 1.0, 1.0));

  let n00 = mix(n000, n001, u.z);
  let n01 = mix(n010, n011, u.z);
  let n10 = mix(n100, n101, u.z);
  let n11 = mix(n110, n111, u.z);
  let n0 = mix(n00, n01, u.y);
  let n1 = mix(n10, n11, u.y);
  return mix(n0, n1, u.x);
}

fn ridgeNoise(p: vec3f) -> f32 {
  return 1.0 - abs(gradientNoise(p));
}

// ── Terrain height (exact copy from terrain.wgsl.js) ────────────────────────

fn getMoisture(p: vec3f) -> f32 {
  var m: f32 = 0.0;
  var amp: f32 = 0.5;
  var freq: f32 = 1.2;
  for (var i = 0; i < 4; i = i + 1) {
    m += amp * gradientNoise(p * freq);
    freq *= 2.2;
    amp *= 0.5;
  }
  return clamp(smoothstep(-0.25, 0.45, m + 0.15) + TP_globalMoisture, 0.0, 1.0);
}

fn getTerrainHeight(p_in: vec3f) -> f32 {
  // 1. Domain warping
  let q = vec3f(
    gradientNoise(p_in * TP_warpScale + vec3f(0.0, 0.0, 0.0)),
    gradientNoise(p_in * TP_warpScale + vec3f(5.2, 1.3, 0.0)),
    gradientNoise(p_in * TP_warpScale + vec3f(1.1, 0.0, 2.4))
  ) * TP_warpFactor;

  let p1 = p_in + q;
  let r = vec3f(
    gradientNoise(p1 * TP_warpScale * 2.0 + vec3f(3.3, 0.0, 0.0)),
    gradientNoise(p1 * TP_warpScale * 2.0 + vec3f(0.0, 4.4, 0.0)),
    gradientNoise(p1 * TP_warpScale * 2.0 + vec3f(0.0, 0.0, 5.5))
  ) * TP_warpStrength2;

  let p = p1 + r;

  // 2. Mountain/plains mask
  let mount_mask = smoothstep(-0.1, 0.35, gradientNoise(p * TP_mountMaskFreq + vec3f(12.3)));

  // 3. Base fBM
  var h: f32 = 0.0;
  var a: f32 = TP_baseAmplitude;
  var f: f32 = TP_baseFrequency;
  let totalOctaves = i32(TP_octaves + 0.5);

  for (var i = 0; i < 24; i = i + 1) {
    if (i >= totalOctaves) { break; }
    h += a * gradientNoise(p * f);
    a *= TP_persistence;
    f *= TP_lacunarity;
  }

  // 4. Contrast & peak softening
  let hSign = sign(h);
  var cExp = TP_contrastExp;
  cExp = mix(cExp, cExp * 0.5, smoothstep(0.1, 0.5, abs(h)) * TP_peakSoftness);
  h = (hSign * pow(abs(h), cExp) * TP_contrastScale) + TP_seaLevelOffset;

  // 5. Biome topography
  if (h > 0.0) {
    h = mix(h * 0.1, h, smoothstep(0.0, 0.1, h));

    // Mountain ridges
    let ridgeFreq = TP_baseFrequency * 1.6;
    let r1 = ridgeNoise(p * ridgeFreq);
    let r2 = ridgeNoise(p * ridgeFreq * 2.7);
    let sharp_r1 = pow(r1, TP_mountainSharpness);
    let ridge_detail = (0.4 * sharp_r1 * sharp_r1 + 0.15 * r2) * TP_ridgeDetail;
    h = h + ridge_detail * mount_mask * h * 1.4;

    // Terracing
    if (TP_terraceAmount > 0.0) {
      let cell = floor(h * TP_terraceAmount);
      let frac_h = fract(h * TP_terraceAmount);
      let smooth_frac = smoothstep(0.0, TP_terraceSmooth, frac_h);
      h = (cell + smooth_frac) / TP_terraceAmount;
    }

    // Inland lakes
    if (TP_lakeDetail > 0.0) {
      let lakeFreq = TP_baseFrequency * 2.5;
      let lakeN = gradientNoise(p * lakeFreq + vec3f(7.7, 3.3, 9.9));
      let inlandMask = smoothstep(0.0, 0.01, h);
      h -= max(0.0, lakeN) * TP_lakeDetail * inlandMask * 0.15;
    }
  } else {
    // Ocean shelf + abyss
    h = mix(h * 0.1, h, smoothstep(0.0, -0.2 * TP_shelfWidth, h));

    let tr1 = ridgeNoise(p * 5.0 + vec3f(12.3));
    let tr2 = ridgeNoise(p * 15.0);
    let abyss_detail = (tr1 * tr1 * 1.5 + tr2 * 0.4) * TP_abyssDetail;
    h -= abyss_detail * abs(h) * 1.8 * smoothstep(0.0, -0.15, h);
  }

  return h * TP_detailScale;
}

// ── Biome coloring (exact copy from terrain.wgsl.js) ────────────────────────

fn getTerrainColor(altitude: f32, moisture: f32, slope: f32) -> vec3f {
  let landFactor = smoothstep(-0.001, 0.001, altitude);

  // Land color
  var landColor = COL_GRASS;
  {
    let m = moisture;
    let gThresh = TP_grassThreshold;
    if (m < gThresh) {
      landColor = mix(COL_GROUND, COL_GRASS, smoothstep(gThresh - 0.2, gThresh, m));
    } else {
      landColor = mix(COL_GRASS, COL_FOREST, smoothstep(gThresh, gThresh + 0.35, m));
    }

    // Sandy coasts
    let bWidth = TP_beachWidth * 30.0;
    let sSharp = TP_sandSharpness;
    let rThresh = TP_rockThreshold;
    let rockBlend = smoothstep(rThresh, rThresh + 0.3, slope);

    if (altitude < bWidth) {
      let beachMix = 1.0 - smoothstep(bWidth * (1.0 - sSharp), bWidth, altitude);
      landColor = mix(landColor, COL_SAND, beachMix * (1.0 - rockBlend * 0.8));
    }

    if (slope > rThresh) {
      landColor = mix(landColor, COL_ROCK, rockBlend);
    }

    // Snow line
    let sLine = TP_snowLine * 30.0;
    if (altitude > sLine) {
      let rockSnow = mix(COL_ROCK, COL_SNOW, smoothstep(sLine, sLine + 10.0, altitude));
      landColor = mix(landColor, rockSnow, smoothstep(sLine, sLine + 5.0, altitude));
    }
  }

  // Ocean color
  var oceanColor = COL_SHALLOW;
  {
    let depthFactor = smoothstep(0.0, -0.25, altitude);
    let midSea = mix(COL_SHALLOW, COL_DEEP, 0.5);
    if (depthFactor < 0.5) {
      oceanColor = mix(COL_SHALLOW, midSea, depthFactor * 2.0);
    } else {
      oceanColor = mix(midSea, COL_DEEP, (depthFactor - 0.5) * 2.0);
    }
    if (altitude < -5.0) {
      let abyssBlue = vec3f(0.01, 0.04, 0.12);
      oceanColor = mix(oceanColor, abyssBlue, smoothstep(-15.0, -40.0, altitude));
    }
  }

  return mix(oceanColor, landColor, landFactor);
}

// ── Cube-sphere projection ──────────────────────────────────────────────────

fn faceToSphereNormal(face: i32, u: f32, v: f32) -> vec3f {
  let cu = u * 2.0 - 1.0;
  let cv = v * 2.0 - 1.0;
  var pos: vec3f;
  switch(face) {
    case 0: { pos = vec3f(cu, cv, 1.0); }
    case 1: { pos = vec3f(-cu, cv, -1.0); }
    case 2: { pos = vec3f(1.0, cv, -cu); }
    case 3: { pos = vec3f(-1.0, cv, cu); }
    case 4: { pos = vec3f(cu, 1.0, -cv); }
    default: { pos = vec3f(cu, -1.0, cv); }
  }
  return normalize(pos);
}

// ── Vertex / Fragment ───────────────────────────────────────────────────────

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VSOut;
  out.position = vec4f(pos[vi], 0.0, 1.0);
  out.uv = (pos[vi] + 1.0) * 0.5;
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let u = (uniforms.localX + in.uv.x) / uniforms.faceSize;
  let v = (uniforms.localY + in.uv.y) / uniforms.faceSize;
  let sN = faceToSphereNormal(i32(uniforms.face), u, v);

  // Height + moisture on unit sphere (same input as production terrain)
  let altitude = getTerrainHeight(sN);
  let moisture = getMoisture(sN);

  // Analytical slope via finite differences
  let eps = 0.002;
  var t = normalize(cross(sN, vec3f(0.0, 0.0, 1.0)));
  if (abs(sN.z) > 0.9) { t = normalize(cross(sN, vec3f(1.0, 0.0, 0.0))); }
  let bt = cross(sN, t);
  let h1 = getTerrainHeight(normalize(sN + t * eps));
  let h2 = getTerrainHeight(normalize(sN + bt * eps));
  let dh1 = (h1 - altitude) / eps;
  let dh2 = (h2 - altitude) / eps;
  let analyticNormal = normalize(sN - t * dh1 * 2.0 - bt * dh2 * 2.0);
  let slope = 1.0 - max(dot(analyticNormal, sN), 0.0);

  let color = getTerrainColor(altitude, moisture, slope);
  return vec4f(color, 1.0);
}
`

/** Gradient placeholders by parcel type */
const TYPE_GRADIENTS = {
  0: 'linear-gradient(135deg, #1a1a24, #2a2a34)',
  2: 'linear-gradient(135deg, #1a4a7a, #2a8a9f)',
  3: 'linear-gradient(135deg, #7a5a10, #bf9030)',
  4: 'linear-gradient(135deg, #0a5a45, #1a9a75)',
  5: 'linear-gradient(135deg, #6a35a0, #9a55d0)',
}

/**
 * Create a parcel preview baker using existing WebGPU device.
 * Shader uses the real terrain noise, height, and biome coloring functions.
 * @param {GPUDevice} device
 * @param {number} faceSize - Grid size per face (default 123)
 * @returns {object} Preview API
 */
export const createParcelPreviewBaker = (device, faceSize = 123) => {
  if (!device) return null

  const cache = new Map()
  let baking = false

  // Build shader with current terrain params
  const shaderCode = buildBakeShader(TERRAIN_GENERATION_PARAMS)
  const module = device.createShaderModule({ code: shaderCode })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsMain' },
    fragment: { module, entryPoint: 'fsMain', targets: [{ format: 'rgba8unorm' }] },
    primitive: { topology: 'triangle-list' },
  })
  const texture = device.createTexture({
    size: [BAKE_SIZE, BAKE_SIZE],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const readBuffer = device.createBuffer({
    size: BAKE_BYTES_PER_ROW * BAKE_SIZE,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  })

  /**
   * Bake a 64x64 terrain preview for a single parcel.
   * @param {object} parcel - { face, localX, localY }
   * @returns {Promise<string|null>} Data URL or null
   */
  const bake = async ({ face, localX, localY }) => {
    if (baking) return null
    baking = true

    try {
      device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([face, localX, localY, faceSize]))

      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView(),
          clearValue: { r: 0.02, g: 0.02, b: 0.06, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bindGroup)
      pass.draw(3)
      pass.end()

      encoder.copyTextureToBuffer(
        { texture },
        { buffer: readBuffer, bytesPerRow: BAKE_BYTES_PER_ROW },
        [BAKE_SIZE, BAKE_SIZE]
      )
      device.queue.submit([encoder.finish()])

      await readBuffer.mapAsync(GPUMapMode.READ)
      const padded = new Uint8Array(readBuffer.getMappedRange())

      const canvas = document.createElement('canvas')
      canvas.width = BAKE_SIZE
      canvas.height = BAKE_SIZE
      const ctx = canvas.getContext('2d')
      const img = ctx.createImageData(BAKE_SIZE, BAKE_SIZE)

      for (let y = 0; y < BAKE_SIZE; y++) {
        const src = y * BAKE_BYTES_PER_ROW
        const dst = y * BAKE_SIZE * 4
        for (let x = 0; x < BAKE_SIZE * 4; x++) img.data[dst + x] = padded[src + x]
      }

      readBuffer.unmap()
      ctx.putImageData(img, 0, 0)

      baking = false
      return canvas.toDataURL()
    } catch (e) {
      console.warn('[ParcelPreview] Bake error:', e)
      baking = false
      return null
    }
  }

  /**
   * Get preview for a parcel — returns cached data URL or gradient placeholder.
   * Triggers async bake if not cached, calls onReady when done.
   * @param {object} parcel - { face, localX, localY, type }
   * @param {Function} [onReady] - Called with data URL when bake completes
   * @returns {string} CSS background-image value (gradient or url)
   */
  const getPreview = (parcel, onReady) => {
    const key = `${parcel.face}:${parcel.localX},${parcel.localY}`

    if (cache.has(key)) return `url(${cache.get(key)})`

    bake(parcel).then(dataUrl => {
      if (!dataUrl) return
      cache.set(key, dataUrl)
      onReady?.(dataUrl)
    })

    return TYPE_GRADIENTS[parcel.type] ?? TYPE_GRADIENTS[0]
  }

  return { bake, getPreview, cache }
}
