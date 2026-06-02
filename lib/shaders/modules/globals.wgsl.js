/**
 * globals.wgsl.js - Shared Globals struct for all weather shaders
 * 
 * Centralizes the Globals uniform struct definition to avoid duplication
 * across rain, snow, atmosphere, and fog shaders.
 */

export const globalsWGSL = /* wgsl */`
struct Globals {
  view_from_clip : mat4x4f,
  model_from_view : mat4x4f,
  camera_exposure : vec4f,
  sun_direction_size : vec4f,
  white_point_size : vec4f,
  earth_center : vec4f,
  extra_data : vec4f,
  _reserved0 : vec4f,
  avatar_sphere : vec4f,
  projection_params : vec4f,
  cloud_params : vec4f,
  time_data : vec4f,
  sky_stylization : vec4f,
  sky_tint : vec4f,
  cloud_layer1_color : vec4f,
  cloud_layer2_color : vec4f,
  cloud_layer3_color : vec4f,
  rain_params : vec4f,
  lightning_params : vec4f,
  clip_from_view : mat4x4f,
}
`;
