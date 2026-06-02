/**
 * Character Shader Module
 * 
 * Renders skinned character mesh with skeletal animation.
 * Positioned at avatarSphere location, aligned to planet surface.
 */

import { LIGHTING_CONFIG } from '../config/index.js';
import { AVATAR_CONFIG } from '../config/avatarConfig.js';

const {
  LUMINANCE_WEIGHTS,
  SUN_INTENSITY_AVATAR,
  NIGHT_AMBIENT_FLOOR
} = LIGHTING_CONFIG;

// Per-instance skinning: the bone slot each instance reads comes from its instance
// data (renderer picks it from NPC state/phase). Slot 0 = local player.
const MAX_BONES = AVATAR_CONFIG.maxBones;

const vec3_LUM = `vec3f(${LUMINANCE_WEIGHTS[0]}, ${LUMINANCE_WEIGHTS[1]}, ${LUMINANCE_WEIGHTS[2]})`;

export const characterShader = /* wgsl */`
/**
 * Character Shader - Skeletal Animation
 * 
 * Handles bone deformation and local planetary orientation.
 */

struct CameraUniforms {
  viewProjection : mat4x4f,
  cameraPos : vec4f,             // w = exposure
  sunDirection : vec4f,          // w = time
  earthCenter : vec4f,           // w = planet scale
  whitePoint : vec4f,            // For tone mapping (indices 28-31)
  cloudOpacities : vec4f,        // (indices 32-35)
  avatarSphere : vec4f,          // (indices 36-39)
  moonDir : vec4f,               // (indices 40-43)
  miscParams : vec4f,            // (indices 44-47)
  skyStylization : vec4f,        // (indices 48-51)
  skyTint : vec4f,               // (indices 52-55)
}

// Per-avatar instance data — one entry per avatar (GPU instancing).
// 112 bytes / 28 floats. Layout must match the CPU-side writer in renderer.js.
struct AvatarInstance {
  center : vec3f,                // camera-relative world position
  scale : f32,                   // meters-to-km scale
  forward : vec3f,               // facing direction
  visibility : f32,              // atmospheric materialization (0..1)
  baseColor : vec3f,             // avatar base color
  patternType : f32,             // 0=none, 1=grid, 2=hex, ...
  lineColor : vec3f,
  lineScale : f32,
  lineColor2 : vec3f,
  lineWidth : f32,
  lineGlow : f32,
  glowMul : f32,
  multiColor : f32,
  animTime : f32,
  vertexPaint : f32,             // 0=texture mode, 1=procedural pattern
  boneSlot : f32,                // which per-instance bone slot to skin from (0 = player)
  _pad1 : f32,
  _pad2 : f32,
}

@group(0) @binding(0) var<uniform> camera : CameraUniforms;
@group(0) @binding(1) var<storage, read> instances : array<AvatarInstance>;
@group(0) @binding(2) var avatarTex : texture_2d<f32>;
@group(0) @binding(3) var avatarSampler : sampler;
@group(0) @binding(4) var<storage, read> boneMatrices : array<mat4x4f>;

// Vertex input with skinning data
struct VertexInput {
  @location(0) position : vec3f,   // Local position (meters)
  @location(1) normal : vec3f,     // Surface normal
  @location(2) uv : vec2f,         // Texture coordinates
  @location(3) joints : vec4f,     // Bone indices (as floats for WebGPU)
  @location(4) weights : vec4f,    // Bone weights
  @location(5) color : vec3f,      // Per-vertex flat color (voxel avatars)
}

struct VertexOutput {
  @builtin(position) clipPos : vec4f,
  @location(0) worldPos : vec3f,
  @location(1) normal : vec3f,
  @location(2) uv : vec2f,
  @location(3) localPos : vec3f,
  @location(4) @interpolate(flat) instIdx : u32,
  @location(5) vColor : vec3f,
}

/**
 * Build a rotation matrix that aligns +Y axis to the given up vector
 * and +Z axis to the forward vector (projected and ortho-normalized)
 */
fn buildRotationMatrix(up : vec3f, fwd : vec3f) -> mat3x3f {
  // Orthogonalize forward relative to up
  let fwd_ortho = normalize(fwd - dot(fwd, up) * up);
  
  // Build orthonormal basis
  let right = normalize(cross(up, fwd_ortho));
  let forward = cross(right, up); // Normalized by construction
  
  // Return rotation matrix (columns are basis vectors)
  return mat3x3f(right, up, forward);
}

@vertex
fn vs_main(in : VertexInput, @builtin(instance_index) ii : u32) -> VertexOutput {
  var out : VertexOutput;
  let inst = instances[ii];

  // Apply skeletal animation (skinning)
  var skinnedPos = vec3f(0.0);
  var skinnedNormal = vec3f(0.0);
  
  let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
  
  if (totalWeight > 0.001) {
    // Per-instance bone slot from the instance data (renderer assigns it by NPC
    // state/phase): 0 = local player, plus idle/walk/run phase slots for NPCs.
    let boneBase = u32(inst.boneSlot) * ${MAX_BONES}u;
    let bone0 = boneMatrices[boneBase + u32(in.joints.x)];
    let bone1 = boneMatrices[boneBase + u32(in.joints.y)];
    let bone2 = boneMatrices[boneBase + u32(in.joints.z)];
    let bone3 = boneMatrices[boneBase + u32(in.joints.w)];
    
    // Blend position
    skinnedPos += (bone0 * vec4f(in.position, 1.0)).xyz * in.weights.x;
    skinnedPos += (bone1 * vec4f(in.position, 1.0)).xyz * in.weights.y;
    skinnedPos += (bone2 * vec4f(in.position, 1.0)).xyz * in.weights.z;
    skinnedPos += (bone3 * vec4f(in.position, 1.0)).xyz * in.weights.w;
    
    // Blend normal
    skinnedNormal += (bone0 * vec4f(in.normal, 0.0)).xyz * in.weights.x;
    skinnedNormal += (bone1 * vec4f(in.normal, 0.0)).xyz * in.weights.y;
    skinnedNormal += (bone2 * vec4f(in.normal, 0.0)).xyz * in.weights.z;
    skinnedNormal += (bone3 * vec4f(in.normal, 0.0)).xyz * in.weights.w;
  } else {
    skinnedPos = in.position;
    skinnedNormal = in.normal;
  }
  
  // Scale from meters to kilometers
  let scaledPos = skinnedPos * inst.scale;

  // Avatar center: camera-relative world position from this instance
  let avatarCenter = inst.center;

  // Calculate local "up" direction at avatar position
  let earthCenter = camera.earthCenter.xyz;
  let localUp = normalize(avatarCenter - earthCenter);

  // Build rotation matrix to align character +Y with local up and +Z with forward
  let rotMatrix = buildRotationMatrix(localUp, inst.forward);
  
  // Rotate character to align with local up
  let rotatedPos = rotMatrix * scaledPos;
  let rotatedNormal = rotMatrix * skinnedNormal;
  
  // Translate to world position (camera-relative)
  let worldPos = rotatedPos + avatarCenter;
  
  // Calculate clip position
  out.clipPos = camera.viewProjection * vec4f(worldPos, 1.0);
  
  out.worldPos = worldPos;
  out.normal = normalize(rotatedNormal);
  out.uv = in.uv;
  out.localPos = skinnedPos; // Local model-space position (meters) for patterns
  out.instIdx = ii;
  out.vColor = in.color;

  return out;

}

// --- Procedural pattern functions for vertex paint mode ---

fn vpGrid(p: vec3f, s: f32, w: f32) -> f32 {
  let g = abs(fract(p * s) - 0.5);
  return max(max(step(g.x, w), step(g.y, w)), step(g.z, w));
}

fn vpHex(p: vec3f, s: f32, w: f32) -> f32 {
  let q = p.xy * s; let r = vec2f(1.0, 1.732); let h = r * 0.5;
  let a = (q % r) - h; let b = ((q + h) % r) - h;
  let d = sqrt(min(dot(a, a), dot(b, b)));
  let q2 = p.yz * s; let a2 = (q2 % r) - h; let b2 = ((q2 + h) % r) - h;
  let d2 = sqrt(min(dot(a2, a2), dot(b2, b2)));
  return max(smoothstep(w * 2.0, 0.0, d - 0.4), smoothstep(w * 2.0, 0.0, d2 - 0.4));
}

fn vpCircuit(p: vec3f, s: f32, w: f32) -> f32 {
  let g = fract(p * s);
  let gx = abs(g.x - 0.5); let gy = abs(g.y - 0.5);
  return min(1.0, max(step(gx, w), step(gy, w)) + step(gx, w * 3.0) * step(gy, w * 3.0) * 0.5);
}

fn vpPulseGrid(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let g = fract(p * s);
  let lx = step(abs(g.y - 0.5), w); let ly = step(abs(g.x - 0.5), w);
  let grid = max(lx, ly);
  let px = smoothstep(0.08, 0.0, abs(fract(p.x * s * 0.25 - t * 0.8) - 0.5) - 0.04);
  let py = smoothstep(0.08, 0.0, abs(fract(p.y * s * 0.25 + t * 0.6) - 0.5) - 0.04);
  return min(1.0, grid * 0.4 + (px * ly + py * lx) * 1.5);
}

fn vpPlasma(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p * s * 0.5;
  let v = (sin(q.x + t) + sin(q.y + t * 0.7) + sin((q.x + q.y + q.z) * 0.7 + t * 0.5)) / 3.0 + 0.5;
  return smoothstep(w, w * 0.2, abs(fract(v * 4.0) - 0.5));
}

fn vpScan(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let scan = step(abs(fract(p.y * s) - 0.5), w);
  let sweep = smoothstep(0.1, 0.0, abs(fract(p.y * 0.5 - t * 0.3) - 0.5) - 0.05);
  return max(scan, sweep);
}

fn vpPlaid(p: vec3f, s: f32, w: f32) -> f32 {
  let sx = smoothstep(w, 0.0, abs(fract(p.x * s) - 0.5) - 0.2 + w);
  let sy = smoothstep(w, 0.0, abs(fract(p.y * s) - 0.5) - 0.2 + w);
  return min(1.0, sx + sy - sx * sy);
}

fn vpTesla(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 4u; i++) {
    let fi = f32(i); let seed = fi * 31.7 + t * (1.5 + fi * 0.3);
    let boltX = sin(p.y * s * (0.8 + fi * 0.3) + seed) * 0.15;
    let dx = p.x - boltX - sin(fi) * 0.3;
    let dist = abs(dx);
    let arc = smoothstep(w * 1.5, w * 0.1, dist);
    total += arc * (0.5 + 0.5 * sin(t * 20.0 + fi * 8.0 + p.y * 30.0));
  }
  return min(1.0, total);
}

fn vpDNA(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let y = p.y * s; let twist = y * 1.5 + t * 2.0;
  let d1 = length(vec2f(p.x - sin(twist) * 0.15, p.z - cos(twist) * 0.15));
  let d2 = length(vec2f(p.x - sin(twist + 3.14159) * 0.15, p.z - cos(twist + 3.14159) * 0.15));
  let s1 = smoothstep(w * 1.5, w * 0.3, d1); let s2 = smoothstep(w * 1.5, w * 0.3, d2);
  let rung = step(abs(fract(y * 0.3) - 0.5), 0.05) * smoothstep(0.16, 0.14, max(d1, d2));
  return min(1.0, s1 + s2 + rung * 0.6);
}

fn vpReactor(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let dist = length(p); let ang = atan2(p.z, p.x);
  let rings = smoothstep(w, w * 0.2, abs(fract(dist * s * 0.3 - t * 0.5) - 0.5));
  let field = smoothstep(w * 1.5, w * 0.3, abs(fract(ang * 3.0 / 6.283 + p.y * s * 0.2) - 0.5));
  let core = smoothstep(0.3, 0.0, dist) * (0.5 + 0.5 * sin(t * 3.0));
  return min(1.0, rings * 0.25 + field * 0.3 + core);
}

fn vpFire(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let hf = smoothstep(2.0, -0.5, p.y * s * 0.3);
  let q = vec2f((p.x + p.z) * s, p.y * s * 0.5 - t * 3.0);
  var fl = 0.0; var am = 1.0; var fr = 1.0;
  for (var i = 0u; i < 5u; i++) {
    fl += sin(q.x * fr * 1.7 + q.y * fr * 0.9 + t * (1.0 + f32(i) * 0.5)) *
         sin(q.x * fr * 0.9 + q.y * fr * 1.3 - t * (0.8 + f32(i) * 0.3)) * am;
    am *= 0.5; fr *= 2.1;
  }
  return smoothstep(0.3 + sin(p.y * 15.0 - t * 5.0 + p.x * 8.0) * 0.1, 0.1, abs(p.x) + abs(p.z) * 0.5) * hf * (fl * 0.5 + 0.5) * hf;
}

fn vpEmber(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p * s * 0.5; let cell = floor(q.xy);
  var mD = 1.0; var mD2 = 1.0; var cc = vec2f(0.0);
  for (var dx: i32 = -1; dx <= 1; dx++) { for (var dy: i32 = -1; dy <= 1; dy++) {
    let nb = cell + vec2f(f32(dx), f32(dy));
    let nh = fract(sin(nb.x * 127.1 + nb.y * 311.7) * 43758.5);
    let d = length(q.xy - nb - vec2f(nh, fract(nh * 43.23)));
    if (d < mD) { mD2 = mD; mD = d; cc = nb; } else if (d < mD2) { mD2 = d; }
  }}
  let crk = smoothstep(w * 3.0, w * 0.3, mD2 - mD);
  let ch = fract(sin(cc.x * 43.23 + cc.y * 78.91) * 43758.5);
  let gp = fract(t * 0.2 + ch * 5.0);
  return min(1.0, crk * (0.5 + 0.5 * sin(t * 1.5 + mD * 5.0)) * 0.7 + (1.0 - crk) * smoothstep(0.0, 0.3, gp) * smoothstep(1.0, 0.4, gp) * 0.6);
}

fn vpFluid(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p * s * 0.3;
  let f1 = sin(q.x * 2.0 + sin(q.y * 1.5 + t) * 0.8 + t * 0.7);
  let f2 = sin(q.y * 1.8 + sin(q.x * 1.3 - t * 0.5) * 0.6 - t * 0.5);
  let f3 = sin((q.x + q.z) * 1.2 + sin(q.y * 2.0 + t * 0.3) * 0.5 + t * 0.4);
  let combined = (f1 + f2 + f3) / 3.0;
  let surface = smoothstep(w * 2.0, 0.0, abs(combined));
  return min(1.0, surface * 0.6 + smoothstep(w, 0.0, abs(f1) + abs(f2) - 0.3) * 0.3);
}

fn vpMatrix(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let col = floor(p.x * s);
  let h = fract(sin(col * 45.23) * 43758.5);
  let speed = 0.5 + h * 1.5;
  let colLine = step(abs(fract(p.x * s) - 0.5), w);
  let lead = fract(-p.y * 0.5 + t * speed * 0.3 + h);
  let trail = smoothstep(0.0, 0.5, lead) * smoothstep(1.0, 0.5, lead);
  let charHash = fract(sin(col * 127.1 + floor(p.y * s * 2.0) * 311.7 + floor(t * speed)) * 43758.5);
  let charBlock = step(0.3, charHash) * step(abs(fract(p.y * s * 2.0) - 0.5), 0.35);
  return colLine * trail * charBlock;
}

fn vpVein(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p * s;
  let warp = vec3f(sin(q.y * 1.3 + t * 0.2) * 0.3, cos(q.x * 1.1 + t * 0.15) * 0.3, sin(q.z * 0.9 + t * 0.1) * 0.3);
  let wp2 = q + warp;
  let g1 = abs(fract(wp2 * 1.0) - 0.5); let v1 = min(g1.x, min(g1.y, g1.z));
  let g2 = abs(fract(wp2 * 2.3 + 0.5) - 0.5); let v2 = min(g2.x, min(g2.y, g2.z));
  let vein = smoothstep(w * 1.5, w * 0.3, min(v1, v2 * 0.7));
  let pulse = smoothstep(0.3, 0.0, abs(fract(v1 * 3.0 - t * 0.8) - 0.5) - 0.1);
  return min(1.0, vein + pulse * vein * 0.8);
}

fn vpGlitch(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let blockT = floor(t * 8.0);
  let h1 = fract(sin(blockT * 43.23) * 43758.5);
  let bandY = floor(p.y * s * 0.5);
  let bandHash = fract(sin(bandY * 127.1 + blockT) * 43758.5);
  let glitchBand = step(0.85, bandHash);
  let offset = glitchBand * (h1 - 0.5) * 0.3;
  let gp = vec3f(p.x + offset, p.y, p.z);
  let scan = step(abs(fract(gp.y * s) - 0.5), w);
  let blockX = floor(gp.x * s * 2.0); let blockYv = floor(gp.y * s * 2.0);
  let blockVal = fract(sin(blockX * 17.0 + blockYv * 43.0 + blockT * 3.0) * 43758.5);
  let flicker = 0.7 + 0.3 * sin(t * 30.0 + p.y * 50.0);
  return min(1.0, (scan * 0.3 + step(0.7, blockVal) * glitchBand * 0.6) * flicker);
}

fn vpShockwave(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 5u; i++) {
    let fi = f32(i);
    let o = vec3f(sin(fi * 2.4) * 0.3, fract(fi * 0.37) * 1.5, cos(fi * 1.8) * 0.3);
    let d = length(p - o); let phase = fract(t * 0.3 + fi * 0.2);
    let ring = smoothstep(w * 2.0, 0.0, abs(d - phase * s * 0.1));
    total += ring * (1.0 - phase) * (1.0 - phase);
  }
  return min(1.0, total);
}

fn vpHeartbeat(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let phase = (p.x + p.z) * s; let beat = fract(phase * 0.1 - t * 2.0);
  var wave = 0.0;
  if (beat < 0.15) { wave = (beat - 0.1) * 20.0; }
  else if (beat < 0.2) { wave = (0.2 - beat) * 20.0 - 0.5; }
  else { wave = sin(beat * 6.28) * 0.05; }
  let gridY = fract(p.y * s);
  let waveMatch = smoothstep(w * 3.0, 0.0, abs(gridY - 0.5 - wave * 0.3));
  let bgGrid = step(abs(fract(p.y * s) - 0.5), w * 0.3) * 0.15;
  return min(1.0, waveMatch * 0.9 + bgGrid);
}

// 21: Stargate
fn vpStargate(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let dist = length(p.xz); let ang = atan2(p.z, p.x);
  var total = 0.0;
  for (var i = 0u; i < 5u; i++) {
    let fi = f32(i); let ringY = (fi - 2.0) * 0.3;
    let ringBand = smoothstep(w * 3.0, w * 0.5, abs(p.y - ringY));
    let rotAng = ang + t * (1.0 + fi * 0.4) * select(-1.0, 1.0, i % 2u == 0u);
    let segs = 8.0 + fi * 4.0; let segLocal = fract(rotAng * segs / 6.283);
    let sym = step(abs(segLocal - 0.5), 0.15);
    total += ringBand * sym * 0.5;
  }
  return min(1.0, total + smoothstep(0.2, 0.0, abs(dist - 0.15)) * (0.5 + 0.5 * sin(t * 5.0)));
}

// 22: Firefly
fn vpFirefly(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 15u; i++) {
    let fi = f32(i); let seed = fi * 17.31;
    let px = sin(t * 0.3 + seed) * 0.5 + fract(sin(seed * 127.1) * 43758.5);
    let py = sin(t * 0.2 + seed * 1.3) * 0.8 + fract(sin(seed * 311.7) * 23421.6) * 1.5;
    let pz = cos(t * 0.25 + seed * 0.7) * 0.5 + fract(sin(seed * 74.7) * 65432.1);
    let d = length(p - vec3f(px, py, pz));
    let pulse = max(0.0, sin(t * (2.0 + fi * 0.5) + fi));
    total += smoothstep(w * 6.0, 0.0, d) * pulse * 0.4;
  }
  return min(1.0, total);
}

// 23: Rune
fn vpRune(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let cell = floor(p * s * 0.3); let local = (fract(p * s * 0.3) - 0.5) * 2.0;
  let ch = fract(sin(cell.x * 127.1 + cell.y * 311.7 + cell.z * 74.7) * 43758.5);
  let runeType = floor(ch * 4.0); let lw = w * 5.0;
  var rune = 0.0;
  if (runeType < 1.0) { rune = max(step(abs(local.x), lw), step(abs(local.y), lw)); }
  else if (runeType < 2.0) { let d = length(local); rune = step(abs(d - 0.5), lw); }
  else if (runeType < 3.0) { rune = step(abs(local.x), lw * (1.0 - local.y * 0.5)) * step(local.y, 0.7); }
  else { rune = step(abs(local.x - sin(local.y * 4.0) * 0.3), lw); }
  let gp = fract(t * 0.3 + ch * 3.0);
  let glow = smoothstep(0.0, 0.1, gp) * smoothstep(0.6, 0.3, gp);
  let outerD = length(local);
  return min(1.0, rune * (0.15 + glow * 0.85) + step(abs(outerD - 0.85), lw * 0.5) * 0.3);
}

// 24: PCB Trace
fn vpPCB(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let g = p.xy * s; let gi = floor(g); let gf = fract(g);
  let h = fract(sin(gi.x * 127.1 + gi.y * 311.7) * 43758.5);
  let tw = w * 1.2;
  var trace = 0.0;
  if (h < 0.5) { trace = max(trace, step(abs(gf.y - 0.5), tw)); }
  if (h > 0.4) { trace = max(trace, step(abs(gf.x - 0.5), tw)); }
  let padDist = length(gf - 0.5);
  let isPad = step(0.8, h) * step(padDist, tw * 3.0);
  let sig = smoothstep(0.1, 0.0, abs(fract(g.x * 0.3 - t * 2.0 + h * 5.0) - 0.5) - 0.05);
  return min(1.0, trace * 0.25 + isPad * 0.4 + sig * trace * 0.7);
}

// 25: Warp
fn vpWarp(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let dist = length(p.xz); let ang = atan2(p.z, p.x);
  let streak = smoothstep(w * 2.0, w * 0.3, abs(fract(ang * s * 0.08) - 0.5));
  let stretch = smoothstep(w, w * 0.1, abs(fract(p.y * s * 0.3 - t * 3.0 + ang * 0.5) - 0.5));
  let compress = smoothstep(0.3, 0.0, dist) * (sin(dist * s * 2.0 - t * 8.0) * 0.5 + 0.5);
  return min(1.0, streak * stretch * 0.3 + compress * 0.5);
}

// 26: Synapses
fn vpSynapses(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let cell = floor(p * s * 0.5); let local = fract(p * s * 0.5) - 0.5;
  let nh = fract(sin(cell.x * 127.1 + cell.y * 311.7 + cell.z * 74.7) * 43758.5);
  let nodeDist = length(local);
  let node = smoothstep(w * 3.0 * (0.5 + nh * 0.5), w, nodeDist);
  let ang = atan2(local.y, local.x);
  let branches = 3.0 + floor(nh * 4.0);
  let branchLine = smoothstep(w * 2.0, w * 0.5, abs(fract(ang / 6.283 * branches) - 0.5)) * step(w * 3.0, nodeDist) * smoothstep(0.5, 0.15, nodeDist);
  let firePhase = fract(t * 0.5 + nh * 5.0);
  let firing = smoothstep(0.0, 0.05, firePhase) * smoothstep(0.3, 0.1, firePhase);
  return min(1.0, node * (0.3 + firing * 0.7) + branchLine * 0.25);
}

// 27: Nano
fn vpNano(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p.xy * s * 2.0; let r = vec2f(1.0, 1.732); let h = r * 0.5;
  let a = (q % r) - h; let hexD = sqrt(min(dot(a, a), dot(((q + h) % r) - h, ((q + h) % r) - h)));
  let hexEdge = smoothstep(w, w * 0.2, hexD - 0.3);
  let cellId = floor((q + h) / r);
  let ch = fract(sin(cellId.x * 127.1 + cellId.y * 311.7) * 43758.5);
  let rot = t * (1.0 + ch * 2.0);
  let rx = a.x * cos(rot) - a.y * sin(rot); let ry = a.x * sin(rot) + a.y * cos(rot);
  let inner = min(1.0, step(abs(rx), w * 0.8) + step(abs(ry), w * 0.8)) * step(hexD, 0.25);
  return min(1.0, hexEdge * 0.3 + inner * 0.5);
}

// 28: Radar
fn vpRadar(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let ang = atan2(p.z, p.x); let dist = length(p.xz);
  let rings = smoothstep(w, w * 0.2, abs(fract(dist * s * 0.3) - 0.5));
  let sweepAng = fract(t * 0.4) * 6.283;
  let angDiff = ang - sweepAng;
  let sweep = smoothstep(0.0, -0.5, angDiff - 0.05) * smoothstep(-1.5, -0.3, angDiff);
  var blips = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let fi = f32(i);
    let bAng = fract(sin(fi * 127.1) * 43758.5) * 6.283;
    let bDist = 0.1 + fract(sin(fi * 311.7) * 23421.6) * 0.4;
    let bx = cos(bAng) * bDist; let bz = sin(bAng) * bDist;
    let d = length(p - vec3f(bx, p.y, bz));
    blips += smoothstep(w * 4.0, w, d) * 0.5;
  }
  return min(1.0, rings * 0.15 + sweep * 0.5 + blips);
}

// 29: Sonar
fn vpSonar(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 3u; i++) {
    let fi = f32(i); let center = vec3f(sin(fi * 2.09) * 0.2, fi * 0.5 + 0.3, cos(fi * 2.09) * 0.2);
    let dist = length(p - center);
    for (var e = 0u; e < 3u; e++) {
      let fe = f32(e); let ringR = fract(t * 0.5 + fi * 0.33 + fe * 0.33) * s * 0.15;
      let fade = 1.0 - fract(t * 0.5 + fi * 0.33 + fe * 0.33);
      total += smoothstep(w * 2.0, 0.0, abs(dist - ringR)) * fade * fade;
    }
    total += smoothstep(w * 3.0, w, dist) * (0.5 + 0.5 * sin(t * 4.0 + fi * 2.0)) * 0.4;
  }
  return min(1.0, total);
}

// 30: Dot Wave
fn vpDotWave(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let g = floor(p * s); let f2 = fract(p * s) - 0.5;
  let wave = sin(g.x * 0.5 + g.y * 0.3 + t * 2.0) * 0.15 + sin(g.y * 0.4 - g.x * 0.2 + t * 1.5) * 0.1;
  let dotSize = w * (1.5 + wave * 3.0);
  return smoothstep(dotSize, dotSize * 0.3, length(f2)) * max(0.0, 0.3 + (wave + 0.25) * 0.7);
}

// 31: Dot Orbit
fn vpDotOrbit(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let cell = floor(p * s * 0.4); let cc = (cell + 0.5) / (s * 0.4);
  let ch = fract(sin(cell.x * 127.1 + cell.y * 311.7 + cell.z * 74.7) * 43758.5);
  var total = 0.0;
  for (var i = 0u; i < 3u; i++) {
    let fi = f32(i); let phase = t * (1.0 + fi * 0.7) + fi * 1.57;
    let ox = cc.x + cos(phase) * 0.07; let oy = cc.y + sin(phase) * 0.07;
    total += smoothstep(w * 2.5, w * 0.5, length(p.xy - vec2f(ox, oy))) * 0.5;
  }
  total += smoothstep(w * 1.5, w * 0.5, length(p.xy - cc.xy)) * 0.2;
  return min(1.0, total);
}

// 32: IC Chip
fn vpICChip(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let g = p * s * 0.5; let cell = floor(g); let local = fract(g) - 0.5;
  let ch = fract(sin(cell.x * 127.1 + cell.y * 311.7 + cell.z * 74.7) * 43758.5);
  let chipEdge = max(abs(local.x), abs(local.y));
  let isChip = step(chipEdge, 0.35);
  let chipBorder = step(0.32, chipEdge) * isChip;
  let dieGrid = min(1.0, step(abs(fract(local.x * 8.0) - 0.5), w) + step(abs(fract(local.y * 8.0) - 0.5), w));
  let die = dieGrid * isChip * step(chipEdge, 0.3);
  let pinX = step(abs(local.y), w * 2.0) * step(0.35, abs(local.x)) * step(abs(local.x), 0.48);
  let pinY = step(abs(local.x), w * 2.0) * step(0.35, abs(local.y)) * step(abs(local.y), 0.48);
  let pins = max(pinX, pinY);
  let activ = sin(t * 3.0 + ch * 10.0) * 0.5 + 0.5;
  return min(1.0, chipBorder * 0.4 + die * 0.15 + pins * activ * 0.7);
}

// 33: Bus Line
fn vpBusLine(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let fi = f32(i); let lineY = (fi - 2.5) * 0.06;
    let onLine = smoothstep(w, w * 0.2, abs(fract((p.y + lineY) * s * 4.0) - fi / 6.0));
    let bitPhase = floor((p.x + p.z) * s * 2.0 - t * (3.0 + fi * 0.5));
    let bitHash = fract(sin(bitPhase * 127.1 + fi * 311.7) * 43758.5);
    total += onLine * (step(0.4, bitHash) * 0.6 + 0.15);
  }
  let clockY = step(abs(fract(p.y * s * 0.5) - 0.5), w * 2.0);
  total += clockY * (0.2 + step(0.5, fract((p.x + p.z) * s - t * 4.0)) * 0.6);
  return min(1.0, total);
}

// 34: Motherboard
fn vpMotherboard(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let g = p * s; let gi = floor(g); let gf = fract(g);
  let h1 = fract(sin(gi.x * 127.1 + gi.y * 311.7) * 43758.5);
  let h2 = fract(sin((gi.x + 1.0) * 78.91 + gi.y * 43.23) * 23421.6);
  let trH = step(abs(gf.y - 0.5), w) * step(h1, 0.6);
  let trV = step(abs(gf.x - 0.5), w) * step(h2, 0.5);
  let traces = max(trH, trV);
  let viaDist = length(gf - 0.5);
  let via = step(viaDist, w * 2.5) * step(0.7, h1);
  let sig = smoothstep(0.1, 0.0, abs(fract(g.x * 0.3 - t * 2.5 + h1 * 5.0) - 0.5) - 0.05) * traces;
  return min(1.0, traces * 0.2 + via * 0.3 + sig * 0.7);
}

// 35: LED Grid
fn vpLEDGrid(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let g = floor(p * s * 2.0); let f2 = fract(p * s * 2.0) - 0.5;
  let ledDist = max(abs(f2.x), abs(f2.y));
  let led = smoothstep(w * 2.0, w, ledDist);
  let mode = floor(fract(t * 0.1) * 3.0);
  var brightness = 0.0;
  let gxy = g.xy + g.z * 17.0;
  if (mode < 1.0) { brightness = sin(gxy.x * 0.3 + gxy.y * 0.2 - t * 3.0) * 0.5 + 0.5; }
  else if (mode < 2.0) { brightness = step(0.85, fract(sin(gxy.x * 127.1 + gxy.y * 311.7 + floor(t * 8.0)) * 43758.5)); }
  else { brightness = sin(atan2(gxy.y - s * 0.5, gxy.x - s * 0.5) * 3.0 + length(gxy - vec2f(s * 0.5)) * 0.5 - t * 4.0) * 0.5 + 0.5; }
  return led * brightness;
}

// 36: Signal
fn vpSignal(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 4u; i++) {
    let fi = f32(i); let traceY = (fi - 1.5) * 0.3 + 0.8;
    let inBand = smoothstep(0.12, 0.1, abs(p.y - traceY));
    let x = (p.x + p.z) * s; let freq = 2.0 + fi * 1.5; let phase = t * (2.0 + fi * 0.5);
    var wave = sin(x * freq - phase);
    if (fi > 1.0) { wave = sign(wave); }
    let waveY = traceY + wave * 0.08;
    total += smoothstep(w * 2.0, w * 0.3, abs(p.y - waveY)) * inBand * 0.5;
  }
  return min(1.0, total);
}

// 37: Particle Field
fn vpParticleField(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let a1 = vec3f(sin(t * 0.7) * 0.2, 0.8 + cos(t * 0.5) * 0.3, cos(t * 0.7) * 0.2);
  let a2 = vec3f(cos(t * 0.6) * 0.2, 0.8 + sin(t * 0.4) * 0.3, sin(t * 0.6) * 0.2);
  var total = smoothstep(0.08, 0.0, length(p - a1)) * 0.5 + smoothstep(0.08, 0.0, length(p - a2)) * 0.5;
  for (var i = 0u; i < 10u; i++) {
    let fi = f32(i); let which = select(a2, a1, i < 5u);
    let phase = t * (2.0 + fi * 0.5) + fi * 0.89;
    let pp = which + vec3f(cos(phase), sin(phase * 0.7), sin(phase)) * 0.08;
    total += smoothstep(w * 3.0, w * 0.3, length(p - pp)) * 0.3;
  }
  return min(1.0, total);
}

// 38: P2P Mesh
fn vpP2PMesh(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  var total = 0.0;
  for (var i = 0u; i < 8u; i++) {
    let fi = f32(i);
    let h1 = fract(sin(fi * 127.1) * 43758.5); let h2 = fract(sin(fi * 311.7) * 23421.6); let h3 = fract(sin(fi * 74.7) * 65432.1);
    let nodePos = vec3f((h1 - 0.5) * 0.6, h2 * 1.5 + 0.2, (h3 - 0.5) * 0.6);
    let d = length(p - nodePos);
    let pulse = 0.5 + 0.5 * sin(t * 2.0 + fi * 1.3);
    total += smoothstep(w * 4.0, w, d) * (0.3 + pulse * 0.5);
  }
  return min(1.0, total);
}

// 39: Fluid
fn vpFluidAdv(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p * s * 0.3;
  let f1 = sin(q.x * 2.0 + sin(q.y * 1.5 + t) * 0.8 + t * 0.7);
  let f2 = sin(q.y * 1.8 + sin(q.x * 1.3 - t * 0.5) * 0.6 - t * 0.5);
  let combined = (f1 + f2) / 2.0;
  let surface = smoothstep(w * 2.0, 0.0, abs(combined));
  let foam = smoothstep(w, 0.0, abs(f1) + abs(f2) - 0.3);
  return min(1.0, surface * 0.6 + foam * 0.3 + (combined * 0.5 + 0.5) * 0.15);
}

// 40: Lava Flow
fn vpLavaFlow(p: vec3f, s: f32, w: f32, t: f32) -> f32 {
  let q = p * s * 0.4;
  let flowX = sin(q.y * 0.8 + t * 0.3) * 0.4;
  let wq = vec2f(q.x + flowX, q.y - t * 0.5);
  let cell = floor(wq); var mD = 1.0; var mD2 = 1.0;
  for (var dx: i32 = -1; dx <= 1; dx++) { for (var dy: i32 = -1; dy <= 1; dy++) {
    let nb = cell + vec2f(f32(dx), f32(dy));
    let nh = fract(sin(nb.x * 127.1 + nb.y * 311.7) * 43758.5);
    let d = length(wq - nb - vec2f(nh, fract(nh * 43.23)));
    if (d < mD) { mD2 = mD; mD = d; } else if (d < mD2) { mD2 = d; }
  }}
  let crack = smoothstep(w * 3.0, w * 0.5, mD2 - mD);
  let heat = smoothstep(0.2, 0.0, mD2 - mD);
  return min(1.0, crack * 0.4 + heat * 0.8);
}

// Ordered 4×4 Bayer dither — identical to the trees/scatter (TreeSystem.js) so the avatar
// distance-LOD dissolve reads as the same clean structured pattern, not noisy speckle.
fn bayerDither(pos : vec2f) -> f32 {
  let bayer = array<f32, 16>(
    0.0/16.0, 8.0/16.0, 2.0/16.0, 10.0/16.0,
    12.0/16.0, 4.0/16.0, 14.0/16.0, 6.0/16.0,
    3.0/16.0, 11.0/16.0, 1.0/16.0, 9.0/16.0,
    15.0/16.0, 7.0/16.0, 13.0/16.0, 5.0/16.0,
  );
  let x = u32(pos.x) % 4u;
  let y = u32(pos.y) % 4u;
  return bayer[y * 4u + x];
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let inst = instances[in.instIdx];

  // Flat shading: compute face normal from screen-space derivatives of world position
  // This makes each triangle a visible flat facet regardless of vertex normals
  let flatNormal = normalize(cross(dpdx(in.worldPos), dpdy(in.worldPos)));
  // Use flat normal for lighting, keep interpolated normal for edge detection
  let normal = flatNormal;

  // Polygon-edge detection — screen-space derivatives must run in uniform
  // control flow, so compute edgeLine before any per-instance branch.
  let dNx = dpdx(in.normal);
  let dNy = dpdy(in.normal);
  let edgeLine = smoothstep(0.3, 1.5, length(dNx) + length(dNy));

  // Skip the fragment entirely if this avatar instance is fully invisible
  // (e.g. local player while inside the vehicle). visibility comes from
  // the CPU side as charData[23] / inst.visibility and is set to 0 in
  // mainPlanet when vehicleSystem.isOccupied is true.
  if (inst.visibility < 0.01) { discard; }

  // Distance-LOD dissolve (NPCs fading out toward the scatter horizon, see renderer.js).
  // Ordered Bayer dither — the SAME clean screen-door pattern the trees use — so the opaque
  // avatar dissolves structured, not as noisy "broken" speckle, with no alpha blending needed.
  if (inst.visibility < bayerDither(in.clipPos.xy)) { discard; }

  let avatarCenter = inst.center;
  let earthCenter = camera.earthCenter.xyz;
  let localUp = normalize(avatarCenter - earthCenter);
  let sunDir = normalize(camera.sunDirection.xyz);

  // --- Base Color --- voxel avatars (vertexPaint == 2) use per-vertex flat
  // colors; everything else uses the per-instance procedural base color.
  let baseColor = select(inst.baseColor, in.vColor, inst.vertexPaint > 1.5);

  // --- Planetary Lighting ---
  let sunElevation = dot(localUp, sunDir);
  let dayFactor = smoothstep(-0.1, 0.1, sunElevation);
  let NdotL = max(dot(normal, sunDir) * 0.9 + 0.1, 0.0);

  let skyTint = camera.skyTint.rgb;
  let skyColor = vec3f(0.8, 0.9, 1.0) * skyTint;
  let ambientStrength = mix(${NIGHT_AMBIENT_FLOOR.toFixed(2)}, 0.5, dayFactor);
  let ambient = skyColor * ambientStrength;

  let sunIrradiance = ${SUN_INTENSITY_AVATAR.toFixed(1)};
  let sunTint = mix(vec3f(1.0), camera.skyTint.rgb, 0.4);
  let sunLight = sunIrradiance * NdotL * dayFactor * sunTint;

  let lighting = ambient + sunLight;
  var color = baseColor * lighting;

  // --- Vertex Paint: Procedural Patterns (mode 1 only; voxel mode 2 is flat) ---
  if (inst.vertexPaint > 0.5 && inst.vertexPaint < 1.5) {
    let wp = in.localPos; // Local model-space position (meters), scale-independent
    let s = inst.lineScale;
    let w = inst.lineWidth;
    let t = inst.animTime;
    let pt = i32(inst.patternType);

    var patVal = 0.0;
    if (pt == 1) { patVal = vpGrid(wp, s, w); }
    else if (pt == 2) { patVal = vpHex(wp, s, w); }
    else if (pt == 3) { patVal = vpCircuit(wp, s, w); }
    else if (pt == 4) { patVal = smoothstep(w * 2.0, w * 0.5, length(fract(wp * s) - 0.5)); }
    else if (pt == 5) { patVal = smoothstep(w, 0.0, abs(fract((wp.x + wp.y + wp.z) * s * 0.577) - 0.5) - 0.25 + w); }
    else if (pt == 6) { patVal = vpPulseGrid(wp, s, w, t); }
    else if (pt == 7) { patVal = vpPlasma(wp, s, w, t); }
    else if (pt == 8) { patVal = vpScan(wp, s, w, t); }
    else if (pt == 9) { patVal = vpPlaid(wp, s, w); }
    else if (pt == 10) { patVal = vpTesla(wp, s, w, t); }
    else if (pt == 11) { patVal = vpDNA(wp, s, w, t); }
    else if (pt == 12) { patVal = vpReactor(wp, s, w, t); }
    else if (pt == 13) { patVal = vpFire(wp, s, w, t); }
    else if (pt == 14) { patVal = vpEmber(wp, s, w, t); }
    else if (pt == 15) { patVal = vpFluid(wp, s, w, t); }
    else if (pt == 16) { patVal = vpMatrix(wp, s, w, t); }
    else if (pt == 17) { patVal = vpVein(wp, s, w, t); }
    else if (pt == 18) { patVal = vpGlitch(wp, s, w, t); }
    else if (pt == 19) { patVal = vpShockwave(wp, s, w, t); }
    else if (pt == 20) { patVal = vpHeartbeat(wp, s, w, t); }
    else if (pt == 21) { patVal = vpStargate(wp, s, w, t); }
    else if (pt == 22) { patVal = vpFirefly(wp, s, w, t); }
    else if (pt == 23) { patVal = vpRune(wp, s, w, t); }
    else if (pt == 24) { patVal = vpPCB(wp, s, w, t); }
    else if (pt == 25) { patVal = vpWarp(wp, s, w, t); }
    else if (pt == 26) { patVal = vpSynapses(wp, s, w, t); }
    else if (pt == 27) { patVal = vpNano(wp, s, w, t); }
    else if (pt == 28) { patVal = vpRadar(wp, s, w, t); }
    else if (pt == 29) { patVal = vpSonar(wp, s, w, t); }
    else if (pt == 30) { patVal = vpDotWave(wp, s, w, t); }
    else if (pt == 31) { patVal = vpDotOrbit(wp, s, w, t); }
    else if (pt == 32) { patVal = vpICChip(wp, s, w, t); }
    else if (pt == 33) { patVal = vpBusLine(wp, s, w, t); }
    else if (pt == 34) { patVal = vpMotherboard(wp, s, w, t); }
    else if (pt == 35) { patVal = vpLEDGrid(wp, s, w, t); }
    else if (pt == 36) { patVal = vpSignal(wp, s, w, t); }
    else if (pt == 37) { patVal = vpParticleField(wp, s, w, t); }
    else if (pt == 38) { patVal = vpP2PMesh(wp, s, w, t); }
    else if (pt == 39) { patVal = vpFluidAdv(wp, s, w, t); }
    else if (pt == 40) { patVal = vpLavaFlow(wp, s, w, t); }

    // Multicolor
    var lineCol = inst.lineColor;
    if (inst.multiColor > 0.5) {
      let phase = fract((wp.x * 2.3 + wp.y * 1.7 + wp.z * 3.1 + t) * 0.15 + patVal * 0.3);
      lineCol = mix(inst.lineColor, inst.lineColor2, smoothstep(0.0, 1.0, phase));
    }

    let patColor = lineCol * patVal;

    // Mix: darken base where pattern is, add pattern color with lighting
    color = color * (1.0 - patVal * 0.7) + patColor * lighting;

    // Glow: additive HDR emission (bypasses lighting for neon effect)
    // lineGlow controls intensity, glowMul amplifies into HDR range (>1.0)
    // The engine's tone mapping (1-exp(-c*exposure)) compresses HDR → visible bloom-like glow
    let glowIntensity = patVal * inst.lineGlow;
    let glowHDR = lineCol * glowIntensity * inst.glowMul;
    color += glowHDR;

    // Edge wireframe glow
    let edgeGlow = edgeLine * inst.lineGlow * inst.glowMul * 0.3;
    color += lineCol * edgeGlow;

  }

  // --- Tone Mapping ---
  let exposure = camera.cameraPos.w;
  let whitePoint = camera.whitePoint.xyz;
  let safeWhitePoint = max(whitePoint, vec3f(0.001));
  let safeColor = max(color, vec3f(0.0));

  let mapped = vec3f(1.0) - exp(-safeColor * exposure / safeWhitePoint);
  var colorOut = pow(mapped, vec3f(1.0 / 2.2));

  let saturation = camera.skyStylization.x;
  let gray = dot(colorOut, ${vec3_LUM});
  let finalColor = mix(vec3f(gray), colorOut, saturation);

  return vec4f(finalColor, inst.visibility);
}

`;

export const avatarShader = characterShader;
