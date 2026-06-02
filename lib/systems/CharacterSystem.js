import {
  loadGLB,
  loadTextureFromGLB,
  extractMeshData,
  extractSkeleton,
  extractSkinningData,
  extractAnimations,
  createCharacterBuffers,
  createAnimationSystem
} from '../avatar/index.js';
import { buildVoxelAvatar } from '../avatar/voxel-builder.js';
import { MOVEMENT_CONFIG, STORAGE_KEYS } from '../config/index.js';
import { AVATAR_CONFIG } from '../config/avatarConfig.js';
import { AUDIO_CONFIG } from '../config/audioConfig.js';
import { createAudioManager } from './AudioManager.js';

/**
 * Creates the character system for avatar loading and animation
 * @param {GPUDevice} device - WebGPU device
 * @param {number[]} initialForward - Optional initial forward vector [x, y, z]
 * @returns {Object} Character system with state and methods
 */
export const createCharacterSystem = (device, initialForward = [0, 0, 1]) => {
  const MAX_BONES = AVATAR_CONFIG.maxBones;
  // Per-instance skinning slot layout (each slot = MAX_BONES matrices):
  //   0            local player (own state machine)
  //   IDLE_SLOT    shared idle pose
  //   WALK_BASE..  K staggered walk phases
  //   RUN_BASE..   K staggered run phases
  //   FLY_SLOT     shared floating pose (active flight)
  //   FALL_SLOT    shared falling pose (passive descent)
  //   SWIM_SLOT    shared swimming pose (moving in water)
  //   TREAD_SLOT   shared treading-water pose (idle in water)
  const NPC_PHASES = AVATAR_CONFIG.npcWalkBuckets ?? 6;
  const IDLE_SLOT = 1;
  const WALK_BASE = 2;
  const RUN_BASE = WALK_BASE + NPC_PHASES;
  const FLY_SLOT = RUN_BASE + NPC_PHASES;
  const FALL_SLOT = FLY_SLOT + 1;
  const SWIM_SLOT = FALL_SLOT + 1;
  const TREAD_SLOT = SWIM_SLOT + 1;
  const IDLE2_SLOT = TREAD_SLOT + 1;   // idle variants → the standing crowd isn't all one pose
  const IDLE3_SLOT = IDLE2_SLOT + 1;
  const IDLE4_SLOT = IDLE3_SLOT + 1;
  const GREET_SLOT = IDLE4_SLOT + 1;   // occasional greeting/wave emote
  const DANCE_SLOT = GREET_SLOT + 1;   // occasional dance emote
  const BONE_SLOTS = DANCE_SLOT + 1;
  const SLOT_FLOATS = MAX_BONES * 16;

  // Animation system instance
  let animationSystem = null;
  let boneMatricesBuffer = null;
  let instanceBoneArray = null;     // CPU-side assembly of all instance bone slots
  let npcWalkSamplers = [];         // K staggered Walk-cycle samplers
  let npcRunSamplers = [];          // K staggered Run-cycle samplers
  let npcIdleSampler = null;        // single shared Idle sampler
  let npcIdleSamplers = [];         // Idle + variants (Idle2/3/4) so the still crowd isn't in lockstep
  let npcGreetSampler = null;       // occasional wave/greeting emote
  let npcDanceSampler = null;       // occasional dance emote
  let playerIdleClips = ['Idle'];   // idle variants the player rotates through while standing
  let playerIdleClip = 'Idle';      // the player's current idle variant
  let playerIdleTimer = 0;          // seconds until the player re-rolls its idle variant
  let npcFloatSampler = null;       // single shared Floating (fly) sampler
  let npcFallSampler = null;        // single shared Fall (descent) sampler
  let npcSwimSampler = null;        // single shared Swim sampler (moving in water)
  let npcTreadSampler = null;       // single shared TreadWater sampler (idle in water)
  
  // Audio system instance
  const audioManager = createAudioManager();
  let audioInitialized = false;
  let lastAudioState = 'idle';
  let lastInWater = false;

  // Store skeleton and animations for reuse
  let avatarSkeleton = null;
  let avatarAnimations = null;

  // Avatar state
  let avatarVB = null;
  let avatarIB = null;
  let avatarIndexCount = 0;
  let avatarLoaded = false;
  let avatarTexture = null;
  let avatarSampler = null;
  let currentAvatarUrl = null;

  // Vertex layout: floats per vertex — pos(3)+norm(3)+uv(2)+joints(4)+weights(4)+color(3)
  let vtxStride = 19;
  
  // Rotation state (camera-relative)
  let currentForward = [...initialForward]; // Current smoothed forward
  let targetForward = [...initialForward];  // Desired forward (camera projected on surface)
  let airTime = 0;   // accumulated airborne time (animation debouncing)
  let landTimer = 0; // countdown for the brief hard-landing pose

  /**
   * Get the avatar URL (custom from localStorage or default from config)
   * @returns {string}
   */
  const getAvatarUrl = () => {
    const customUrl = localStorage.getItem(STORAGE_KEYS.RPM_AVATAR);
    if (customUrl) return customUrl;
    return AVATAR_CONFIG.url;
  };

  /**
   * Initializes the character system by loading avatar and animations
   * @param {string} [avatarUrl] - Optional URL override
   */
  const init = async (avatarUrl = null) => {
    try {
      const url = avatarUrl || getAvatarUrl();
      currentAvatarUrl = url;
      
      const avatarGlb = await loadGLB(url);
      const skeleton = extractSkeleton(avatarGlb.json, avatarGlb.bin);

      // Voxel avatars are built from parameters against the skeleton (the GLB is
      // loaded only for its rig). GLB avatars extract their mesh as usual.
      const isVoxel = !!AVATAR_CONFIG.voxel && skeleton?.joints?.length > 0;
      const meshData = isVoxel ? null : await extractMeshData(avatarGlb.json, avatarGlb.bin);
      const skinningData = isVoxel ? null : extractSkinningData(avatarGlb.json, avatarGlb.bin);

      // Only load animations if model has skeleton
      if (skeleton?.joints?.length > 0) {
        try {
          const animGlb = await loadGLB(AVATAR_CONFIG.animationsUrl);
          const animations = extractAnimations(animGlb.json, animGlb.bin);
          const animSkeleton = extractSkeleton(animGlb.json, animGlb.bin);

          if (animSkeleton) {
            const boneMapping = {};
            const stripPrefix = s => s.replace(/^mixamorig:/i, '').toLowerCase().replace(/[_.\s]/g, '');
            for (const avatarBone of skeleton.joints) {
              if (animSkeleton.joints.includes(avatarBone)) {
                boneMapping[avatarBone] = avatarBone;
              } else {
                const avatarNormalized = stripPrefix(avatarBone);
                for (const animBone of animSkeleton.joints) {
                  const animNormalized = stripPrefix(animBone);
                  if (avatarNormalized === animNormalized) {
                    boneMapping[animBone] = avatarBone;
                    break;
                  }
                }
              }
            }

            const retargetedAnims = {};
            for (const [name, anim] of Object.entries(animations)) {
              retargetedAnims[name] = {
                ...anim,
                tracks: anim.tracks.map(track => ({
                  ...track,
                  nodeName: boneMapping[track.nodeName] || track.nodeName
                }))
              };
            }

            avatarSkeleton = skeleton;
            avatarAnimations = retargetedAnims;
            animationSystem = createAnimationSystem(skeleton, retargetedAnims);

            // NPC locomotion: independent samplers per state so NPCs that walk vs
            // run vs idle show the right clip. Walk/Run get K staggered phases each
            // (so the crowd isn't in lockstep); idle shares one pose. Same skeleton.
            const makePhaseSamplers = (animName, n) => {
              if (!retargetedAnims[animName]) return [];
              const dur = retargetedAnims[animName].duration || 1;
              const arr = [];
              for (let k = 0; k < n; k++) {
                const s = createAnimationSystem(skeleton, retargetedAnims);
                s.play(animName);
                s.update((k / n) * dur); // offset starting phase
                arr.push(s);
              }
              return arr;
            };
            npcWalkSamplers = makePhaseSamplers('Walk', NPC_PHASES);
            npcRunSamplers = makePhaseSamplers('Run', NPC_PHASES);
            // Idle + variants — one sampler per clip at its own slot. NPCs are spread across them
            // by roster index so a standing crowd shows different poses instead of one shared idle.
            npcIdleSamplers = [];
            for (const [clip, slot] of [['Idle', IDLE_SLOT], ['Idle2', IDLE2_SLOT], ['Idle3', IDLE3_SLOT], ['Idle4', IDLE4_SLOT]]) {
              if (!retargetedAnims[clip]) continue;
              const s = createAnimationSystem(skeleton, retargetedAnims);
              s.play(clip);
              npcIdleSamplers.push({ sampler: s, slot });
            }
            npcIdleSampler = npcIdleSamplers[0]?.sampler ?? null;   // legacy reference (player/start fallbacks)
            if (retargetedAnims['Greeting']) {
              npcGreetSampler = createAnimationSystem(skeleton, retargetedAnims);
              npcGreetSampler.play('Greeting');
            }
            if (retargetedAnims['Dance']) {
              npcDanceSampler = createAnimationSystem(skeleton, retargetedAnims);
              npcDanceSampler.play('Dance');
            }
            // Idle variants the player rotates through while standing (so its idle isn't static).
            playerIdleClips = ['Idle', 'Idle2', 'Idle3', 'Idle4'].filter(c => retargetedAnims[c]);
            if (playerIdleClips.length === 0) playerIdleClips = ['Idle'];
            playerIdleClip = playerIdleClips[0];
            if (retargetedAnims['Floating']) {
              npcFloatSampler = createAnimationSystem(skeleton, retargetedAnims);
              npcFloatSampler.play('Floating');
            }
            if (retargetedAnims['Fall']) {
              npcFallSampler = createAnimationSystem(skeleton, retargetedAnims);
              npcFallSampler.play('Fall');
            }
            if (retargetedAnims['Swim']) {
              npcSwimSampler = createAnimationSystem(skeleton, retargetedAnims);
              npcSwimSampler.play('Swim');
            }
            if (retargetedAnims['TreadWater']) {
              npcTreadSampler = createAnimationSystem(skeleton, retargetedAnims);
              npcTreadSampler.play('TreadWater');
            }

            const startAnim = retargetedAnims['Idle'] ? 'Idle' : Object.keys(retargetedAnims)[0];
            if (startAnim) animationSystem.play(startAnim);
          }
        } catch (e) {
          console.warn('[Character] Animation load skipped:', e.message);
        }
      } else {
        console.log('[Character] No skeleton — static mesh mode (vertex paint)');
      }

      // Ensure bone matrices buffer exists (identity for static meshes)
      ensureBoneMatricesBuffer();

      const buffers = isVoxel
        ? buildVoxelAvatar(AVATAR_CONFIG.voxelParams || {}, skeleton)
        : createCharacterBuffers(meshData, skinningData);

      // GLB meshes may need Z-up→Y-up rotation + a ground-to-feet drop (placeholder
      // base mesh). Voxel meshes are already bind-space (Y-up, feet at origin) and
      // share the skeleton's exact coordinates, so they skip both.
      if (!isVoxel) {
        const rotXDeg = AVATAR_CONFIG.modelRotationXDeg || 0;
        if (rotXDeg !== 0) {
          const rad = rotXDeg * Math.PI / 180;
          const cs = Math.cos(rad), sn = Math.sin(rad);
          const vtx = buffers.vertices;
          for (let i = 0; i < vtx.length; i += vtxStride) {
            for (const o of [0, 3]) { // position = floats 0-2, normal = floats 3-5
              const y = vtx[i + o + 1], z = vtx[i + o + 2];
              vtx[i + o + 1] = y * cs - z * sn;
              vtx[i + o + 2] = y * sn + z * cs;
            }
          }
        }
        if (AVATAR_CONFIG.modelGroundToFeet) {
          const gv = buffers.vertices;
          let minY = Infinity;
          for (let i = 1; i < gv.length; i += vtxStride) {
            if (gv[i] < minY) minY = gv[i];
          }
          for (let i = 1; i < gv.length; i += vtxStride) {
            gv[i] -= minY;
          }
        }
      }

      avatarVB = device.createBuffer({
        size: buffers.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(avatarVB, 0, buffers.vertices);

      avatarIB = device.createBuffer({
        size: buffers.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(avatarIB, 0, buffers.indices);

      // Load textures from GLB (skipped for voxel — it uses per-vertex colors).
      if (meshData) {
        const textureIndices = new Set();
        for (const mesh of meshData) {
          if (mesh.baseColorTextureIndex !== null) {
            textureIndices.add(mesh.baseColorTextureIndex);
          }
        }

        for (const texIdx of textureIndices) {
          const tex = await loadTextureFromGLB(avatarGlb.json, avatarGlb.bin, texIdx, device);
          if (tex) {
            avatarTexture = tex;
            break;
          }
        }
      }

      if (!avatarTexture) {
        avatarTexture = device.createTexture({
          size: [1, 1, 1],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
          { texture: avatarTexture },
          new Uint8Array([255, 255, 255, 255]),
          { bytesPerRow: 4 },
          [1, 1, 1]
        );
      }

      avatarSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      });

      avatarIndexCount = buffers.indices.length;
      avatarLoaded = true;
      console.log('[Character] Avatar system ready');
    } catch (e) {
      console.error('[Character] Load failed:', e);
    }
  };

  /**
   * Ensures boneMatricesBuffer exists (creates identity matrices if needed)
   */
  const ensureBoneMatricesBuffer = () => {
    if (!instanceBoneArray) {
      // One slot per (player + NPC bucket). Init every bone to identity so unused
      // slots/bones render the bind pose instead of garbage.
      instanceBoneArray = new Float32Array(BONE_SLOTS * SLOT_FLOATS);
      for (let i = 0; i < BONE_SLOTS * MAX_BONES; i++) {
        instanceBoneArray[i * 16 + 0] = 1;
        instanceBoneArray[i * 16 + 5] = 1;
        instanceBoneArray[i * 16 + 10] = 1;
        instanceBoneArray[i * 16 + 15] = 1;
      }
    }
    if (!boneMatricesBuffer) {
      boneMatricesBuffer = device.createBuffer({
        size: BONE_SLOTS * SLOT_FLOATS * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(boneMatricesBuffer, 0, instanceBoneArray);
    }
    return boneMatricesBuffer;
  };

  /**
   * Updates animation based on movement state
   * @param {number} dt - Delta time
   * @param {Object} state - Movement state flags
   * @param {number[]} camForward - Camera forward vector [x, y, z]
   * @param {number[]} up - Local surface up vector [x, y, z]
   */
  const updateAnimation = (dt, state, camForward = null, up = null) => {
    const { isMoving, isSprinting, isFlying, isJumping, isGrounded, inWater, touchingWater, sit, emote } = state;

    // --- Update Rotation (always, with or without skeleton) ---
    if (isMoving && camForward && up) {
      const dot = camForward[0] * up[0] + camForward[1] * up[1] + camForward[2] * up[2];
      targetForward = [
        camForward[0] - dot * up[0],
        camForward[1] - dot * up[1],
        camForward[2] - dot * up[2]
      ];

      const len = Math.sqrt(targetForward[0]**2 + targetForward[1]**2 + targetForward[2]**2);
      if (len > 0.0001) {
        targetForward[0] /= len;
        targetForward[1] /= len;
        targetForward[2] /= len;
      }
    }

    if (up) {
      const rotateSpeed = AVATAR_CONFIG.rotationSmoothing || 8.0;
      const factor = Math.min(dt * rotateSpeed, 1.0);

      currentForward[0] += (targetForward[0] - currentForward[0]) * factor;
      currentForward[1] += (targetForward[1] - currentForward[1]) * factor;
      currentForward[2] += (targetForward[2] - currentForward[2]) * factor;

      const upDot = currentForward[0] * up[0] + currentForward[1] * up[1] + currentForward[2] * up[2];
      currentForward[0] -= upDot * up[0];
      currentForward[1] -= upDot * up[1];
      currentForward[2] -= upDot * up[2];

      const clen = Math.sqrt(currentForward[0]**2 + currentForward[1]**2 + currentForward[2]**2);
      if (clen > 0.0001) {
        currentForward[0] /= clen;
        currentForward[1] /= clen;
        currentForward[2] /= clen;
      }
    }

    // --- Update Animation State (only with skeleton) ---
    if (!animationSystem) return;

    let targetAnim = 'Idle';

    // airTime must exceed airTimeThreshold (a slope debounce) before the airborne
    // pose engages, and resets instantly on landing so the walk/idle anim resumes
    // with no delay. isFalling is deliberately NOT used here: it has no debounce,
    // so it flipped the animation to Floating for a single frame on bumps/slopes.
    const prevAir = airTime;
    if (!isGrounded) airTime += dt;
    else airTime = 0;

    const actuallyAirborne = airTime > (MOVEMENT_CONFIG.airTimeThreshold || 0.15) || isJumping;

    // Brief hard-landing pose: started on touchdown after a real fall, when not in
    // water and not still moving (so a running landing flows straight into Run).
    if (isGrounded && prevAir > 0.6 && !inWater && !isMoving) landTimer = 0.45;
    if (landTimer > 0) landTimer = Math.max(0, landTimer - dt);

    // Priority: emote → water → airborne → landing → ground locomotion.
    if (sit && isGrounded && !isMoving && !inWater) {
      targetAnim = 'Sit';
    } else if (emote && isGrounded && !isMoving && !inWater) {
      targetAnim = emote;               // wave / dance (1/2 keys) — broadcast to peers via the anim name
    } else if (inWater) {
      targetAnim = isMoving ? 'Swim' : 'TreadWater';
    } else if (isJumping) {
      targetAnim = 'Jump';
    } else if (!touchingWater && isFlying) {
      // Advancing horizontally → fly pose; pure vertical thrust (Q/C up/down) or hover → fall pose.
      targetAnim = isMoving ? 'Floating' : 'Fall';
    } else if (!touchingWater && actuallyAirborne) {
      targetAnim = 'Fall';            // airborne over land, not flying (descending/drifting)
    } else if (landTimer > 0) {
      targetAnim = 'Land';
    } else if (isMoving && isSprinting) {
      targetAnim = 'Run';
    } else if (isMoving) {
      targetAnim = 'Walk';
    }

    // Player idle variety: while standing, rotate through the loaded idle variants every ~8-16 s
    // (play()'s 250 ms blend makes the swap smooth). Re-rolls on the next time it goes idle.
    if (targetAnim === 'Idle') {
      playerIdleTimer -= dt;
      if (playerIdleTimer <= 0 && playerIdleClips.length > 1) {
        playerIdleClip = playerIdleClips[(Math.random() * playerIdleClips.length) | 0];
        playerIdleTimer = 8 + Math.random() * 8;
      }
      targetAnim = playerIdleClip;
    } else {
      playerIdleTimer = 0;
    }

    if (!avatarAnimations?.[targetAnim]) targetAnim = 'Idle';

    if (animationSystem.currentAnimation?.name !== targetAnim) {
      const shouldLoop = targetAnim !== 'Jump' && targetAnim !== 'Land';
      animationSystem.play(targetAnim, shouldLoop);
    }

    animationSystem.update(dt);

    // Assemble the per-instance bone buffer: slot 0 = local player, slots 1..K =
    // NPC walk phases. NPCs are always walking (they wander); the player uses its
    // own state machine above.
    ensureBoneMatricesBuffer();
    instanceBoneArray.set(animationSystem.getBoneMatrices(), 0); // slot 0 = player
    for (const { sampler, slot } of npcIdleSamplers) {
      sampler.update(dt);
      instanceBoneArray.set(sampler.getBoneMatrices(), slot * SLOT_FLOATS);
    }
    if (npcGreetSampler) {
      npcGreetSampler.update(dt);
      instanceBoneArray.set(npcGreetSampler.getBoneMatrices(), GREET_SLOT * SLOT_FLOATS);
    }
    if (npcDanceSampler) {
      npcDanceSampler.update(dt);
      instanceBoneArray.set(npcDanceSampler.getBoneMatrices(), DANCE_SLOT * SLOT_FLOATS);
    }
    if (npcFloatSampler) {
      npcFloatSampler.update(dt);
      instanceBoneArray.set(npcFloatSampler.getBoneMatrices(), FLY_SLOT * SLOT_FLOATS);
    }
    if (npcFallSampler) {
      npcFallSampler.update(dt);
      instanceBoneArray.set(npcFallSampler.getBoneMatrices(), FALL_SLOT * SLOT_FLOATS);
    }
    if (npcSwimSampler) {
      npcSwimSampler.update(dt);
      instanceBoneArray.set(npcSwimSampler.getBoneMatrices(), SWIM_SLOT * SLOT_FLOATS);
    }
    if (npcTreadSampler) {
      npcTreadSampler.update(dt);
      instanceBoneArray.set(npcTreadSampler.getBoneMatrices(), TREAD_SLOT * SLOT_FLOATS);
    }
    for (let k = 0; k < npcWalkSamplers.length; k++) {
      npcWalkSamplers[k].update(dt);
      instanceBoneArray.set(npcWalkSamplers[k].getBoneMatrices(), (WALK_BASE + k) * SLOT_FLOATS);
    }
    for (let k = 0; k < npcRunSamplers.length; k++) {
      npcRunSamplers[k].update(dt);
      instanceBoneArray.set(npcRunSamplers[k].getBoneMatrices(), (RUN_BASE + k) * SLOT_FLOATS);
    }
    device.queue.writeBuffer(boneMatricesBuffer, 0, instanceBoneArray);
  };

  return {
    get animationSystem() { return animationSystem; },
    get boneMatricesBuffer() { return boneMatricesBuffer; },
    get avatarVB() { return avatarVB; },
    get avatarIB() { return avatarIB; },
    get avatarIndexCount() { return avatarIndexCount; },
    get avatarLoaded() { return avatarLoaded; },
    get avatarTexture() { return avatarTexture; },
    get avatarSampler() { return avatarSampler; },
    get MAX_BONES() { return MAX_BONES; },
    get skeleton() { return avatarSkeleton; },
    get animations() { return avatarAnimations; },
    get audioManager() { return audioManager; },
    get currentAvatarUrl() { return currentAvatarUrl; },
    ensureBoneMatricesBuffer,

    /**
     * Bone slot for an NPC by movement state + roster index.
     * @param {number} state - 0 idle · 1 walking · 2 running · 3 swimming · 4 treading water
     * @param {number} index - stable roster index (for phase staggering)
     * @returns {number} bone slot to write into the instance data
     */
    npcBoneSlot: (state, index) => {
      const k = npcWalkSamplers.length;
      if (k === 0) return 0; // no NPC anims loaded → identity/player slot
      const phase = ((index % k) + k) % k;
      if (state === 3 && npcSwimSampler) return SWIM_SLOT;
      if (state === 4 && npcTreadSampler) return TREAD_SLOT;
      if (state === 5 && npcGreetSampler) return GREET_SLOT;   // greeting/wave emote
      if (state === 6 && npcDanceSampler) return DANCE_SLOT;   // dance emote
      if (state === 2 && npcRunSamplers.length) return RUN_BASE + phase;
      // Idle: spread the crowd across the loaded idle variants by roster index (not all one pose).
      if (state === 0 && npcIdleSamplers.length) return npcIdleSamplers[index % npcIdleSamplers.length].slot;
      return WALK_BASE + phase;
    },

    /**
     * Bone slot for a remote player by its current animation clip name. Maps the
     * rich clip set onto the shared slots (idle / walk / run phases / floating).
     * @param {string} anim - animation name (Walk/Run/Floating/Fall/Jump/…)
     * @param {number} index - stable peer index (for phase staggering)
     * @returns {number} bone slot
     */
    animBoneSlot: (anim, index) => {
      const k = npcWalkSamplers.length;
      if (k === 0) return 0;
      const phase = ((index % k) + k) % k;
      if (anim === 'Run' && npcRunSamplers.length) return RUN_BASE + phase;
      if (anim === 'Walk') return WALK_BASE + phase;
      if (anim === 'Fall' && npcFallSampler) return FALL_SLOT;          // passive descent
      if ((anim === 'Floating' || anim === 'Jump' || anim === 'Land') && npcFloatSampler) return FLY_SLOT;
      if (anim === 'Swim' && npcSwimSampler) return SWIM_SLOT;          // moving in water
      if (anim === 'TreadWater' && npcTreadSampler) return TREAD_SLOT;  // idle in water
      if (anim === 'Greeting' && npcGreetSampler) return GREET_SLOT;    // emote: peer waving
      if (anim === 'Dance' && npcDanceSampler) return DANCE_SLOT;       // emote: peer dancing
      if (anim === 'Idle2') return IDLE2_SLOT;                          // peer idle variants
      if (anim === 'Idle3') return IDLE3_SLOT;
      if (anim === 'Idle4') return IDLE4_SLOT;
      return IDLE_SLOT; // Idle / Sit / unknown
    },

    playAudio: audioManager.play.bind(audioManager),
    stopAudio: audioManager.stop.bind(audioManager),
    
    reload: async (newUrl = null) => {
      avatarLoaded = false;
      avatarVB = null;
      avatarIB = null;
      avatarTexture = null;
      avatarIndexCount = 0;
      await init(newUrl);
    },
    
    updateSounds: (state, camPos, avatarPos, terrainAltitude, seaLevelAltitude, cameraState = null) => {
      if (!audioInitialized) {
        audioManager.init();
        audioInitialized = true;
        return;
      }

      audioManager.resume();
      const { isMoving, isSprinting, isFlying, isJumping, isGrounded } = state;
      const inWater = !!state.inWater; // computed once in mainPlanet (lib/terrain/water.js) — same test as anim/NPCs

      const relX = avatarPos.x - camPos[0];
      const relY = avatarPos.y - camPos[1];
      const relZ = avatarPos.z - camPos[2];
      
      let relPos = [relX, relY, relZ];

      if (cameraState) {
        const { forward, right, up } = cameraState;
        const localX = relX * right[0] + relY * right[1] + relZ * right[2];
        const localY = relX * up[0] + relY * up[1] + relZ * up[2];
        const localZ = -(relX * forward[0] + relY * forward[1] + relZ * forward[2]);
        relPos = [localX, localY, localZ];
      }

      let targetAudio = 'idle';
      if (isFlying) {
        targetAudio = 'fly';
      } else if (isJumping) {
        targetAudio = 'jump';
      } else if (!isGrounded) {
        targetAudio = 'fly'; 
      } else if (isMoving) {
        targetAudio = isSprinting ? 'run' : 'walk';
      }

      const footstepSound = inWater ? 'footstepsWater' : 'footstepsLand';
      const otherFootstep = inWater ? 'footstepsLand' : 'footstepsWater';
      const playbackRate = isSprinting ? AUDIO_CONFIG.runRate : AUDIO_CONFIG.walkRate;
      const stateChanged = targetAudio !== lastAudioState || inWater !== lastInWater;

      if (targetAudio === 'walk' || targetAudio === 'run') {
        audioManager.play(footstepSound, { loop: true, playbackRate });
        audioManager.updatePosition(footstepSound, relPos);
        if (stateChanged) {
          audioManager.stop(otherFootstep);
          audioManager.stop('fly');
          audioManager.stop('jump');
        }
      } else if (targetAudio === 'fly') {
        audioManager.play('fly', { loop: true });
        audioManager.updatePosition('fly', relPos);
        if (stateChanged) {
          audioManager.stop('footstepsLand');
          audioManager.stop('footstepsWater');
        }
      } else if (targetAudio === 'jump') {
        if (lastAudioState !== 'jump') {
          audioManager.play('jump', { restart: true });
        }
        audioManager.play('fly', { 
          loop: true, 
          volumeMultiplier: AUDIO_CONFIG.modifiers.jumpWindMultiplier 
        });
        audioManager.updatePosition('fly', relPos);
        audioManager.updatePosition('jump', relPos);
        if (stateChanged) {
          audioManager.stop('footstepsLand');
          audioManager.stop('footstepsWater');
        }
      } else {
        if (stateChanged) {
          audioManager.stop('footstepsLand');
          audioManager.stop('footstepsWater');
          audioManager.stop('fly');
          audioManager.stop('jump');
        }
      }

      lastAudioState = targetAudio;
      lastInWater = inWater;
    },

    updateAnimation,
    init,
    get forward() { return currentForward; },
    get avatarLoaded() { return avatarLoaded; },
    get avatarVB() { return avatarVB; },
    get avatarIB() { return avatarIB; },
    get avatarIndexCount() { return avatarIndexCount; },
    get boneMatricesBuffer() { return boneMatricesBuffer; }
  };
};
