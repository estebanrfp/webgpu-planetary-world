/**
 * cloudBake.compute.wgsl.js - GPU Compute Shader for Baking Cloud Textures
 */

export const cloudBakeComputeShader = /* wgsl */`

@group(0) @binding(0) var cloud_texture : texture_storage_2d<rgba8unorm, write>;

/**
 * cloud_hash22: Fast trig-free hash for 2D noise
 */
fn cloud_hash22(p: vec2f) -> vec2f {
    let p3 = fract(p.xyx * vec3f(0.1031, 0.1030, 0.0973));
    let q  = p3 + dot(p3, p3.yzx + 33.33);
    return fract((q.xx + q.yz) * q.zy);
}

/**
 * cloud_noise: Seamless 2D value noise
 */
fn cloud_noise(p: vec2f, period: f32) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    // Seamless wrapping of integer coordinates
    // We use a small epsilon to avoid precision issues at exact boundaries
    let i0 = vec2f(round(i.x % period), round(i.y % period));
    let i1 = vec2f(round((i.x + 1.0) % period), round((i.y + 1.0) % period));

    let a = cloud_hash22(i0);
    let b = cloud_hash22(vec2f(i1.x, i0.y));
    let c = cloud_hash22(vec2f(i0.x, i1.y));
    let d = cloud_hash22(i1);

    return mix(
        mix(a.x, b.x, u.x),
        mix(c.x, d.x, u.x),
        u.y
    );
}

/**
 * fractalNoise: 5-octave FBM for seamless cloud density
 */
fn fractalNoise(p: vec2f, base_period: f32) -> f32 {
    var value = 0.0;
    var scale = 1.0;
    var weight = 0.5;

    for (var i = 0; i < 5; i = i + 1) {
        // Each octave frequency is multiplied by scale, so period must be too
        value += weight * cloud_noise(p * scale, base_period * scale);
        scale *= 2.0;
        weight *= 0.5;
    }

    return value;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let dims = textureDimensions(cloud_texture);
    if (global_id.x >= dims.x || global_id.y >= dims.y) { return; }

    let uv = vec2f(global_id.xy) / vec2f(dims);
    
    // Base period of 8.0 makes it easy for octaves (8,16,32,64,128) to tile
    let base_period = 8.0;
    let noiseValue = fractalNoise(uv * base_period, base_period);
    
    // Store density
    textureStore(cloud_texture, global_id.xy, vec4f(noiseValue, noiseValue, noiseValue, 1.0));
}
`;
