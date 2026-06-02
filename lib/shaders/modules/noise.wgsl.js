/**
 * noise.wgsl.js - Shared Noise Functions for Shaders
 * 
 * Provides synchronized noise algorithms for visual and compute shaders.
 */

export const noiseWGSL = /* wgsl */`
fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

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
`;
