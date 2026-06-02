/**
 * snow.wgsl.js — Snow shader
 *
 * World-anchored "cinta caminadora" technique (lib/shaders/rain.wgsl.js,
 * docs/rain-system.md): drops live in a disk that follows the camera, each
 * pinned to a tangent-world position via the (baseX − camOff) mod 2R wrap.
 *
 * Flake motion + look ported from reference/ovgrid-webgpu/lib/shaders/
 * effects.wgsl.js (Peter Adams' snow): each flake swirls in a gentle spiral
 * that opens up mid-fall and closes again at the top and ground, sums a
 * second-axis side-to-side wobble on top, picks its size from three discrete
 * tiers (most small, few large), and the fragment carries a bright sparkle
 * highlight at the centre. That combination reads much more naturally than
 * a single sinusoidal drift.
 */

import { LIGHTING_CONFIG, getGridConstantsWGSL, getGridOutputStructWGSL } from '../config/index.js';
import { globalsWGSL } from './modules/globals.wgsl.js';

const { LUMINANCE_WEIGHTS } = LIGHTING_CONFIG;
const vec3_LUM = `vec3f(${LUMINANCE_WEIGHTS[0]}, ${LUMINANCE_WEIGHTS[1]}, ${LUMINANCE_WEIGHTS[2]})`;

export const snowShader = /* wgsl */`
  ${globalsWGSL}

  struct Snow {
    numParticles: f32,
    speed: f32,
    spawnRadius: f32,
    spawnHeight: f32,
    color: vec3f,
    opacity: f32,
    intensity: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    gridCenter: vec4f,
    gridRight: vec4f,
    gridForward: vec4f,
    gridUp: vec4f,
    cameraPos: vec4f,
  }

  ${getGridConstantsWGSL()}
  ${getGridOutputStructWGSL()}

  @group(0) @binding(0) var<uniform> globals : Globals;
  @group(0) @binding(1) var<uniform> snow : Snow;
  @group(0) @binding(2) var<storage, read> grid : GridOutput;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) alpha: f32,
    @location(2) dist: f32,
  }

  fn snow_hash(p: f32) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 = p3 * (p3 + 33.33);
    return fract((p3 + p3) * p3);
  }

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VSOut {
    var out: VSOut;

    let intensity = snow.intensity;
    if (intensity < 0.01) {
      out.pos = vec4f(0.0, 0.0, -10.0, 1.0);
      return out;
    }

    let quadVertex = vertexIndex % 6u;
    let seed = f32(instanceIndex);

    // Centered quad — flakes are round, billboard around the centre.
    var quadPos = array<vec2f, 6>(
      vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
      vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
    );
    var quadUV = array<vec2f, 6>(
      vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
    );
    out.uv = quadUV[quadVertex];

    // Snow config keeps spawnRadius/Height in km; convert to metres for the
    // wrap math.
    let spawnRadius_m = snow.spawnRadius * 1000.0;
    let spawnHeight_m = snow.spawnHeight * 1000.0;

    // Golden-angle disk distribution — stable per-flake tangent-world coord.
    let goldenAngle = 2.399963;
    let angle = seed * goldenAngle;
    let radiusSeed = snow_hash(seed * 127.1);
    let radius_m = sqrt(radiusSeed) * spawnRadius_m;
    let baseX_m = cos(angle) * radius_m;
    let baseZ_m = sin(angle) * radius_m;

    // World-anchored tile wrap — identical to rain.
    let camOffX_m = snow.cameraPos.x;
    let camOffZ_m = snow.cameraPos.y;
    let areaSize_m = 2.0 * spawnRadius_m;
    let visX_m = fract((baseX_m - camOffX_m) / areaSize_m + 0.5) * areaSize_m - spawnRadius_m;
    let visZ_m = fract((baseZ_m - camOffZ_m) / areaSize_m + 0.5) * areaSize_m - spawnRadius_m;

    // Per-flake hashes for timing, wobble and size.
    let h1 = snow_hash(seed * 173.7);
    let h2 = snow_hash(seed * 259.3);
    let h3 = snow_hash(seed * 347.9);

    let speedVar = 0.8 + h1 * 0.4;
    let dropSpeed = snow.speed * speedVar;
    let totalFallHeight = spawnHeight_m * 2.0;
    let cycleTime = totalFallHeight / dropSpeed;
    let startPhase = h2;

    let time = globals.time_data.x;
    let cycleProgress = fract(time / cycleTime + startPhase);
    let worldY_m = spawnHeight_m - cycleProgress * totalFallHeight;

    // ── Reference-style motion (ported from reference/ovgrid-webgpu) ───────
    // Gentle spiral that opens to ~1.5 m at mid-fall and closes at top and
    // ground — flakes don't fall straight, they twirl. The phase is offset by
    // seed so each flake spirals out of sync.
    let spiralAngle = cycleProgress * 3.14159 + seed;
    let spiralRadius_m = sin(cycleProgress * 3.14159) * 1.5;
    let spiralX_m = cos(spiralAngle) * spiralRadius_m;
    let spiralZ_m = sin(spiralAngle) * spiralRadius_m;

    // Side-to-side wobble — independent per-flake oscillation summed onto the
    // spiral. Slightly different X and Z frequencies so the flake never
    // traces a closed loop. wobbleAmount = 0.6 m matches the reference feel.
    let wobblePhase = snow_hash(seed * 456.7) * 6.283185;
    let wobbleSpeed = 2.0;
    let wobbleAmount = 0.6;
    let wobbleX_m = sin(time * wobbleSpeed + wobblePhase) * wobbleAmount;
    let wobbleZ_m = cos(time * wobbleSpeed * 0.7 + wobblePhase + 1.0) * wobbleAmount * 0.7;

    let posX_m = visX_m + spiralX_m + wobbleX_m;
    let posZ_m = visZ_m + spiralZ_m + wobbleZ_m;

    // ── Size in three discrete tiers (reference) ───────────────────────────
    // 60 % small (varied), 30 % medium (fixed), 10 % large (fixed). Real snow
    // is mostly tiny dust with the occasional fat flake; uniform sampling
    // looks too "uniformly sized".
    let sizeRand = h3;
    let minFlakeSize_m = 0.05;
    let maxFlakeSize_m = 0.20;
    var flakeSize_m = minFlakeSize_m;
    if (sizeRand < 0.6) {
      flakeSize_m = minFlakeSize_m + sizeRand * (maxFlakeSize_m - minFlakeSize_m) * 0.3;
    } else if (sizeRand < 0.9) {
      flakeSize_m = minFlakeSize_m + (maxFlakeSize_m - minFlakeSize_m) * 0.5;
    } else {
      flakeSize_m = maxFlakeSize_m;
    }

    // Camera-relative rendering — same as rain.
    let flakePos = snow.gridRight.xyz   * (posX_m * 0.001)
                 + snow.gridForward.xyz * (posZ_m * 0.001)
                 + snow.gridUp.xyz      * (worldY_m * 0.001);

    let distToCamera_m = length(flakePos) * 1000.0;
    out.dist = distToCamera_m;

    // Camera-facing billboard.
    let toCam = normalize(-flakePos);
    var rightDir = cross(snow.gridUp.xyz, toCam);
    let rLen = length(rightDir);
    if (rLen < 0.001) {
      rightDir = snow.gridRight.xyz;
    } else {
      rightDir = rightDir / rLen;
    }
    let upDir = normalize(cross(toCam, rightDir));

    var worldPos = flakePos;
    worldPos += rightDir * (quadPos[quadVertex].x * flakeSize_m * 0.001);
    worldPos += upDir    * (quadPos[quadVertex].y * flakeSize_m * 0.001);

    out.pos = globals.clip_from_view * vec4f(worldPos, 1.0);

    // Multi-fade alpha — same pattern as rain.
    let nearFade = smoothstep(1.0, 4.0, distToCamera_m);
    let farFade = 1.0 - smoothstep(spawnRadius_m * 0.5, spawnRadius_m * 0.95, distToCamera_m);
    let heightFade = smoothstep(-spawnHeight_m * 0.8, -spawnHeight_m * 0.3, worldY_m);
    let topFade = smoothstep(spawnHeight_m, spawnHeight_m * 0.7, worldY_m);

    out.alpha = snow.opacity * intensity * nearFade * farFade * heightFade * topFade;
    return out;
  }

  @fragment
  fn fs_main(in: VSOut) -> @location(0) vec4f {
    // Soft circular flake with a brighter sparkle at the centre — the
    // sparkle is the reference's "lit ice crystal" detail that lifts the
    // flake from a flat disc into something that catches the eye.
    let dist = length(in.uv - vec2f(0.5, 0.5)) * 2.0;
    if (dist > 1.0) { discard; }

    let softEdge = 1.0 - smoothstep(0.3, 1.0, dist);
    let sparkle = pow(1.0 - dist, 3.0) * 0.3;

    let color = snow.color + vec3f(sparkle);
    return vec4f(color, softEdge * in.alpha);
  }
`;
