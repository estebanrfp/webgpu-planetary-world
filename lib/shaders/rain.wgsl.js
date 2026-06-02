/**
 * rain.wgsl.js - Rain and Lightning shaders
 */

import { LIGHTING_CONFIG, getGridConstantsWGSL, getGridOutputStructWGSL, PHYSICS_GRID_CONFIG } from '../config/index.js';
import { globalsWGSL } from './modules/globals.wgsl.js';

const { LUMINANCE_WEIGHTS } = LIGHTING_CONFIG;
const vec3_LUM = 'vec3f(' + LUMINANCE_WEIGHTS[0] + ', ' + LUMINANCE_WEIGHTS[1] + ', ' + LUMINANCE_WEIGHTS[2] + ')';

export const rainShader = /* wgsl */`
  ${globalsWGSL}

  struct Rain {
    numParticles: f32,
    speed: f32,
    length: f32,
    width: f32,
    windStrength: f32,
    spawnRadius: f32,
    spawnHeight: f32,
    intensity: f32,
    color: vec3f,
    opacity: f32,
    gridCenter: vec4f,
    gridRight: vec4f,
    gridForward: vec4f,
    gridUp: vec4f,
    cameraPos: vec4f,
  }

  ${getGridConstantsWGSL()}
  ${getGridOutputStructWGSL()}

  @group(0) @binding(0) var<uniform> globals : Globals;
  @group(0) @binding(1) var<uniform> rain : Rain;
  @group(0) @binding(2) var<storage, read> grid : GridOutput;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) alpha: f32,
    @location(2) dist: f32,
  }

  // Improved hash function for less patterned distribution
  fn rain_hash(p: f32) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 = p3 * (p3 + 33.33);
    return fract((p3 + p3) * p3);
  }

  // World-anchored rain: the drop volume follows the camera (so we never waste
  // particles far away), but each drop is pinned to a tangent-world position
  // during its fall. As the avatar walks, drops stay in the world and slide
  // past — running through it reads as running through real rain, not "rain
  // glued to my head". Same tile-wrap formula as the snow shader.

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;

    let intensity = rain.intensity * globals.rain_params.x;
    if (intensity < 0.01) {
      out.pos = vec4f(0.0, 0.0, -10.0, 1.0);
      return out;
    }

    let quadVertex = vertexIndex % 6u;
    let seed = f32(instanceIndex);

    // Quad with origin at the TOP — the fall direction sweeps down from there
    var quadPos = array<vec2f, 6>(
      vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
      vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
    );
    var quadUV = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    out.uv = quadUV[quadVertex];

    // Golden-angle disk distribution: stable per-drop position in the tangent
    // plane. baseX_m / baseZ_m are the drop's "world tangent" coords in metres.
    let goldenAngle = 2.399963;
    let angle = seed * goldenAngle;
    let radiusSeed = rain_hash(seed * 127.1);
    let radius_m = sqrt(radiusSeed) * rain.spawnRadius;
    let baseX_m = cos(angle) * radius_m;
    let baseZ_m = sin(angle) * radius_m;

    // World-anchored tile wrap: visible position = (base − camOff) mod 2R − R.
    // The drop holds its world tangent coord; as the camera walks, the visible
    // offset slides; when it would exit [−R, R] the wrap relocates it to the
    // opposite side (where the radial fade is already 0 → jump is invisible).
    // The drop that wraps is effectively a new draw with the same seed at a
    // new world point — to the player the disk feels continuously full.
    let camOffX_m = rain.cameraPos.x;
    let camOffZ_m = rain.cameraPos.y;
    let areaSize_m = 2.0 * rain.spawnRadius;
    let visX_m = fract((baseX_m - camOffX_m) / areaSize_m + 0.5) * areaSize_m - rain.spawnRadius;
    let visZ_m = fract((baseZ_m - camOffZ_m) / areaSize_m + 0.5) * areaSize_m - rain.spawnRadius;

    // Per-drop independent timing
    let h1 = rain_hash(seed * 173.7);
    let h2 = rain_hash(seed * 259.3);
    let h3 = rain_hash(seed * 347.9);

    let speedVar = 0.8 + h1 * 0.4;
    let dropSpeed = rain.speed * speedVar;
    let totalFallHeight = rain.spawnHeight * 2.0;
    let cycleTime = totalFallHeight / dropSpeed;
    let startPhase = h2;

    let time = globals.time_data.x;
    let cycleProgress = fract(time / cycleTime + startPhase);
    let worldY_m = rain.spawnHeight - cycleProgress * totalFallHeight;

    let sizeVar = 0.6 + h3 * 0.8;

    // Subtle wind
    let windPhase = rain_hash(seed * 419.1);
    let windX_m = sin(time * 0.3 + windPhase * 20.0) * rain.windStrength * 0.3;
    let windZ_m = cos(time * 0.2 + windPhase * 15.0) * rain.windStrength * 0.15;

    let posX_m = visX_m + windX_m;
    let posZ_m = visZ_m + windZ_m;

    // Transform from world metres (camera-relative) to view space.
    // The basis vectors are world axes expressed in view space; the * 0.001
    // converts metres to the kilometre units the projection matrix expects.
    let dropPos = rain.gridRight.xyz   * (posX_m * 0.001)
                + rain.gridForward.xyz * (posZ_m * 0.001)
                + rain.gridUp.xyz      * (worldY_m * 0.001);

    let distToCamera_m = length(dropPos) * 1000.0;
    out.dist = distToCamera_m;

    // Drop dimensions in metres
    let dropLength_m = rain.length * sizeVar;
    let dropWidth_m = rain.width * sizeVar;

    // Billboard right axis (perpendicular to world up AND view direction)
    let toCam = normalize(-dropPos);
    var rightDir = cross(rain.gridUp.xyz, toCam);
    let rLen = length(rightDir);
    if (rLen < 0.001) {
      rightDir = rain.gridRight.xyz;
    } else {
      rightDir = rightDir / rLen;
    }

    // Fall direction stays near-vertical — only a sub-degree wind sway. The
    // streak shape is along fallDir, so any meaningful tilt makes the drop
    // read as an "arrow pointing somewhere" instead of falling rain.
    let tiltVec = rain.gridRight.xyz   * (windX_m * 0.05)
                + rain.gridForward.xyz * (windZ_m * 0.05);
    let fallDir = normalize(-rain.gridUp.xyz + tiltVec);

    var worldPos = dropPos;
    worldPos += rightDir * (quadPos[quadVertex].x * dropWidth_m * 0.001);
    worldPos += fallDir * (quadPos[quadVertex].y * dropLength_m * 0.001);

    out.pos = globals.clip_from_view * vec4f(worldPos, 1.0);

    // Multi-fade alpha (in metres, from the reference)
    let nearFade = smoothstep(1.0, 4.0, distToCamera_m);
    let farFade = 1.0 - smoothstep(rain.spawnRadius * 0.5, rain.spawnRadius * 0.95, distToCamera_m);
    let heightFade = smoothstep(-rain.spawnHeight * 0.8, -rain.spawnHeight * 0.3, worldY_m);
    let topFade = smoothstep(rain.spawnHeight, rain.spawnHeight * 0.7, worldY_m);

    out.alpha = rain.opacity * intensity * nearFade * farFade * heightFade * topFade * sizeVar;
    return out;
  }

  @fragment
  fn fs_main(in: VSOut) -> @location(0) vec4f {
    // Reference's elongated drop shape — narrow horizontally (x4 stretch
    // in UV compresses the visible ellipse), full quad height, then a
    // smooth taper at top/bottom edges.
    let centerX = (in.uv.x - 0.5) * 4.0;
    let centerY = (in.uv.y - 0.5) * 1.0;
    let centerDist = length(vec2f(centerX, centerY));

    let shape = smoothstep(1.0, 0.1, centerDist);
    let taper = smoothstep(0.0, 0.1, in.uv.y) * smoothstep(1.0, 0.9, in.uv.y);

    let alpha = shape * taper * in.alpha;
    let tint = 0.8 + globals.lightning_params.x * 0.4;
    return vec4f(rain.color * tint, alpha);
  }
`;

export const lightningShader = /* wgsl */`
  ${globalsWGSL}

  struct Lightning {
    isActive: f32,
    startTime: f32,
    boltDuration: f32,
    flashIntensity: f32,
    strikePosRelCamera: vec3f,
    seed: f32,
    numBranches: f32,
    glowWidth: f32,
  }

  @group(0) @binding(0) var<uniform> globals : Globals;
  @group(0) @binding(1) var<uniform> lightning : Lightning;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) worldPos: vec3f,
    @location(2) glowLayer: f32,
  }

  fn bolt_hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453);
  }

  fn getBoltPos(t: f32, seed: f32, branchOffset: vec3f) -> vec3f {
    // Multi-frequency fractal noise for jagged lightning bolt
    let noise1 = bolt_hash(t * 15.0 + seed);
    let noise2 = bolt_hash(t * 31.0 + seed * 1.5);
    let noise3 = bolt_hash(t * 63.0 + seed * 2.1);
    
    // Attenuate jaggedness near the top (t=0) and ground (t=1)
    let envelope = sin(t * 3.14159);
    // Scale jaggedness with bolt length (~15km)
    let jaggedX = (noise1 * 1.5 + noise2 * 0.8 + noise3 * 0.4 - 1.35) * 0.8 * envelope;
    let jaggedZ = (bolt_hash(t * 17.1 + seed) * 1.5 + bolt_hash(t * 37.4 + seed) * 0.8 - 1.15) * 0.8 * envelope;
    
    // WORLD ANCHORING: Use the stable strike position passed from JS
    let strikePos = lightning.strikePosRelCamera;
    let centerRelCam = globals.earth_center.xyz;
    
    // upDir at the strike point (from center through strike)
    let upDir = normalize(strikePos - centerRelCam);
    
    // Tangent basis for jaggies
    let rightBase = normalize(cross(upDir, vec3f(0.0, 0.1, 1.0)));
    let forwardBase = normalize(cross(rightBase, upDir));
    
    // Cloud is at ~15km altitude
    let boltHeight = 15.0;
    
    // Interpolated position: t=0 is top (clouds), t=1 is bottom (ground)
    let pos = strikePos + upDir * (boltHeight * (1.0 - t));
    
    // Apply jaggies and branching in tangent space
    let jagPos = pos + rightBase * jaggedX + forwardBase * jaggedZ;
    return jagPos + branchOffset * t;
  }

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;
    
    if (lightning.isActive < 0.5) {
      out.pos = vec4f(0.0, 0.0, -10.0, 1.0);
      return out;
    }
    
    let glowLayers = 5u;
    let segmentsPerBolt = 32u;
    let branches = u32(lightning.numBranches);
    
    // Each instance is a branch
    let branchIdx = instanceIndex; 
    let layer = vertexIndex / (segmentsPerBolt * 6u);
    let segmentIdx = (vertexIndex / 6u) % segmentsPerBolt;
    let quadVertex = vertexIndex % 6u;
    
    out.glowLayer = f32(layer);
    
    let qp = array<vec2f, 6>(
      vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
      vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
    );
    out.uv = qp[quadVertex] + vec2f(0.5, 0.0);
    
    let t = f32(segmentIdx) / f32(segmentsPerBolt);
    let tNext = f32(segmentIdx + 1u) / f32(segmentsPerBolt);
    
    let seed = lightning.seed + f32(branchIdx) * 123.45;
    
    // Calculate branch direction
    var branchDir = vec3f(0.0);
    if (branchIdx > 0u) {
       let bSeed = seed + f32(branchIdx);
       branchDir = vec3f(bolt_hash(bSeed) * 2.0 - 1.0, 0.0, bolt_hash(bSeed + 0.5) * 2.0 - 1.0) * 0.08;
    }

    let p1 = getBoltPos(t, seed, branchDir);
    let p2 = getBoltPos(tNext, seed, branchDir);
    
    let dir = normalize(p2 - p1);
    let right = normalize(cross(dir, vec3f(0.0, 0.0, 1.0)));
    
    // Branches are thinner
    let branchScale = select(1.0, 0.4, branchIdx > 0u);
    
    // Volumetric Glow Expansion: 
    // Layer 0: Core bolt (very thin)
    // Layer 1-2: Outer glow (progressively wider and softer)
    let coreWidth = 0.0005 * branchScale;
    let glowExpansion = lightning.glowWidth * f32(layer) * branchScale;
    let width = (coreWidth + glowExpansion) * (1.1 - t * 0.5);
    
    var localPos = mix(p1, p2, qp[quadVertex].y);
    localPos += right * qp[quadVertex].x * width;
    
    out.worldPos = localPos;
    out.pos = globals.clip_from_view * vec4f(localPos, 1.0);
    
    return out;
  }

  @fragment
  fn fs_main(in: VSOut) -> @location(0) vec4f {
    let distFromCenter = abs(in.uv.x - 0.5) * 2.0;
    var intensity = 0.0;
    if (in.glowLayer < 0.5) {
      intensity = smoothstep(1.0, 0.0, distFromCenter) * 2.5; // Brighter core
    } else {
      // Smoother falloff for outer glow layers
      let falloff = 5.0 - in.glowLayer * 0.8;
      intensity = pow(1.0 - saturate(distFromCenter), falloff);
    }
    
    let timeSinceStart = globals.time_data.x - lightning.startTime;
    let flicker = (bolt_hash(timeSinceStart * 80.0 + lightning.seed) * 0.5 + 0.5) * (sin(timeSinceStart * 40.0) * 0.2 + 0.8);
    
    let lifeFactor = 1.0 - clamp(timeSinceStart / lightning.boltDuration, 0.0, 1.0);
    
    // Color mixing: Core is white, outer glow is blueish
    let coreColor = vec3f(1.0, 1.0, 1.0);
    let glowColor = vec3f(0.5, 0.7, 1.0);
    let finalBaseColor = mix(coreColor, glowColor, saturate(in.glowLayer * 0.5));
    
    var color = finalBaseColor * intensity * flicker * lifeFactor * lightning.flashIntensity;
    
    // Opacity: Inner core is solid, outer layers fade out
    var alpha = intensity * lifeFactor * (1.0 - in.glowLayer * 0.3);
    
    // AERIAL PERSPECTIVE (Atmospheric Fog for distance rendering) - Reduced to almost null
    let dist = length(in.worldPos);
    let fogReach = 500.0; // Pushed far away
    let fogFactor = 0.05 * (1.0 - exp(-(dist * dist) / (fogReach * fogReach * 2.0)));
    
    // Atmospheric color blend: mix with sky tint at distance
    let skyTint = globals.sky_tint.rgb;
    color = mix(color, skyTint * 0.4, saturate(fogFactor));
    
    // Fade out completely far beyond the horizon
    alpha *= (1.0 - saturate(fogFactor * 0.9));

    
    return vec4f(color, alpha);
  }
`;
