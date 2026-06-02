/**
 * AVATAR CONFIGURATION
 * Centralized settings for character model, animations, and world positioning
 */
export const AVATAR_CONFIG = {
  // Model data — both tracked under assets/character/.
  // avatar-rig.glb: rigged Mixamo skeleton (Y-up, 1.8m, feet at origin); only its
  //   skeleton is used (the voxel mesh is built from voxelParams).
  // avatar-anims.glb: Idle / Walk / Run / Jump / Floating, built from the source
  //   Mixamo FBX — see scripts/avatar-anims/README.md. 'Floating' is the real
  //   Flying clip; the bake folds the armature root into the bone tracks (metres).
  url: './assets/character/avatar-rig.glb',
  animationsUrl: './assets/character/avatar-anims.glb',

  // Voxel mode: build a blocky avatar from `voxelParams` rigged to the GLB's
  // skeleton (the GLB above is loaded only for its rig). Animates with the same
  // Mixamo clips. Set false to render the GLB mesh instead.
  voxel: true,
  voxelParams: {
    skin: '#ffdbac', hairColor: '#3a2618', eyeColor: '#2563eb', mouthColor: '#be123c',
    shirtColor: '#1f6feb', pantsColor: '#1e3a8a', shoeColor: '#7c2d12',
    hair: 'short', beard: 'none', glasses: 'none', hat: 'none',
    nose: 'small', ears: 'human', pattern: 'tech',
    articulated: true,   // split arms/legs at elbow/knee so they bend with the animation
    height: 1, head: 1, width: 1,
  },

  maxBones: 128,
  npcWalkBuckets: 6,     // Staggered phases per NPC locomotion clip (walk & run) so the crowd doesn't move in lockstep. Slots = 2 + 2×this.
  vertexPaint: true,     // Use procedural shader patterns instead of textures

  // Shader pattern defaults (when vertexPaint is true)
  baseColor: [0.75, 0.75, 0.75], // Avatar base mesh color (parametric, not per-vertex)
  pattern: 6,            // Pulse Grid
  lineScale: 20,
  lineWidth: 0.06,
  lineGlow: 0.5,
  lineColor: [0, 1, 1],  // Cyan
  lineColor2: [1, 0, 1], // Magenta
  multiColor: true,
  animSpeed: 1.0,
  glowMul: 3.0,

  // Transform
  // 0.051 makes the 1.80m rigged avatar render at the SAME on-screen height
  // (~0.092 world units) as the old Z-up base mesh (9.17 tall × 0.01), so the
  // camera framing and HUD nameplate stay calibrated.
  scale: 0.051,
  // Rigged avatar is already Y-up with feet at the origin — NO bake-time rotation
  // or ground-shift. Baking those onto a skinned mesh desyncs it from the skeleton
  // (vertices move but bones don't) and explodes the deformation. Keep 0 / false.
  modelRotationXDeg: 0,
  modelGroundToFeet: false,
  headHeight: 1.43,      // Camera target (local units) — headHeight*scale ≈ 0.073, same upper-chest framing as before.
  
  // Positioning
  heightOffset: 0.0001,  // Vertical offset in km (0.0001 = 10cm).
                         // positive = floats, negative = sinks.

  // How far a swimming NPC's root sinks below sea level (km). Surface-swim look:
  // the waterline sits around the swimmer's torso so head/shoulders/arms stay
  // visible above the (opaque) water and the lower body is in it. The model
  // origin is at the feet, the body ~hip height above. Ramps in with depth, never
  // below the seabed. Lower = more of the body shows above water; higher = more
  // submerged (the body disappears under the opaque surface).
  swimSubmerge: 0.045,

  // RPM Integration
  subdomain: 'ovgrid',
  modelParams: 'lod=2&morphTargets=none&textureAtlas=1024&pose=A',

  // Smoothing
  rotationSmoothing: 8.0,
};
