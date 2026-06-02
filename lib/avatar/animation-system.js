/**
 * Animation System for Skeletal Animation
 * Handles smooth animation transitions and bone matrix calculation
 * 
 * @param {Object} skeleton - Skeleton hierarchy and bind matrices
 * @param {Object} animations - Map of animation clips
 * @returns {Object} Animation system instance
 */
import { quatSlerp, vec3Lerp, trsToMatrix, mat4Multiply } from './glb-loader.js';

export const createAnimationSystem = (skeleton, animations) => {
  // --- STATE ---
  let _skeleton = skeleton;
  let _animations = animations;
  let currentAnimation = null;
  let previousAnimation = null;
  let currentTime = 0;
  let previousTime = 0;
  let transitionTime = 0;
  let transitionDuration = 0.25; // 250ms transition between animations
  let isTransitioning = false;
  let loop = true;
  let speed = 1;
  const boneMatrices = new Float32Array(skeleton.jointCount * 16);

  // Store transforms for current and previous animations
  const currentTransforms = skeleton.hierarchy.map(j => ({
    translation: [...j.translation],
    rotation: [...j.rotation],
    scale: [...j.scale]
  }));
  const previousTransforms = skeleton.hierarchy.map(j => ({
    translation: [...j.translation],
    rotation: [...j.rotation],
    scale: [...j.scale]
  }));
  const blendedTransforms = skeleton.hierarchy.map(j => ({
    translation: [...j.translation],
    rotation: [...j.rotation],
    scale: [...j.scale]
  }));

  // Initialize with identity matrices
  for (let i = 0; i < skeleton.jointCount; i++) {
    boneMatrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16);
  }

  // --- CORE LOGIC ---

  /**
   * Sample animation at a specific time and store in transforms array
   */
  const sampleAnimation = (animation, time, transforms) => {
    // Reset to bind pose
    for (let i = 0; i < _skeleton.jointCount; i++) {
      const joint = _skeleton.hierarchy[i];
      transforms[i].translation = [...joint.translation];
      transforms[i].rotation = [...joint.rotation];
      transforms[i].scale = [...joint.scale];
    }

    if (!animation) return;

    // Apply animation tracks
    for (const track of animation.tracks) {
      const jointIndex = _skeleton.joints.indexOf(track.nodeName);
      if (jointIndex === -1) continue;

      // Find keyframes
      const times = track.times;
      let keyIndex = 0;
      for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time < times[i + 1]) {
          keyIndex = i;
          break;
        }
        if (i === times.length - 2) keyIndex = i;
      }

      const t0 = times[keyIndex];
      const t1 = times[Math.min(keyIndex + 1, times.length - 1)];
      // Clamp to [0,1] — never extrapolate. Clips whose keyframes don't start at
      // exactly t=0 (e.g. Mixamo exports starting at frame 1) leave a small window
      // after the loop wrap where time < first keyframe; without clamping, alpha
      // goes negative and the skinned boxes fly apart for a few frames each loop.
      const alpha = t1 > t0 ? Math.max(0, Math.min(1, (time - t0) / (t1 - t0))) : 0;

      const v0 = track.values[keyIndex];
      const v1 = track.values[Math.min(keyIndex + 1, track.values.length - 1)];

      if (track.property === 'rotation') {
        transforms[jointIndex].rotation = quatSlerp(v0, v1, alpha);
      } else if (track.property === 'translation') {
        transforms[jointIndex].translation = vec3Lerp(v0, v1, alpha);
      } else if (track.property === 'scale') {
        transforms[jointIndex].scale = vec3Lerp(v0, v1, alpha);
      }
    }
  };

  /**
   * Play an animation by name
   */
  const play = (animationName, isLoop = true) => {
    if (!_animations[animationName]) {
      console.warn(`Animation "${animationName}" not found. Available:`, Object.keys(_animations));
      return;
    }

    loop = isLoop;

    // If same animation, don't restart
    if (currentAnimation?.name === animationName) return;

    // Start transition from current to new animation
    if (currentAnimation) {
      previousAnimation = currentAnimation;
      previousTime = currentTime;
      // Copy current transforms to previous
      for (let i = 0; i < _skeleton.jointCount; i++) {
        previousTransforms[i].translation = [...currentTransforms[i].translation];
        previousTransforms[i].rotation = [...currentTransforms[i].rotation];
        previousTransforms[i].scale = [...currentTransforms[i].scale];
      }
      isTransitioning = true;
      transitionTime = 0;
    }

    currentAnimation = _animations[animationName];
    currentTime = 0;
  };

  /**
   * Update animation state and compute bone matrices
   */
  const update = (deltaTime) => {
    if (!currentAnimation) return;

    // Update current animation time
    currentTime += deltaTime * speed;
    if (currentTime > currentAnimation.duration) {
      if (loop) {
        currentTime %= currentAnimation.duration;
      } else {
        currentTime = currentAnimation.duration;
      }
    }

    // Sample current animation
    sampleAnimation(currentAnimation, currentTime, currentTransforms);

    // Handle transition blending
    if (isTransitioning) {
      transitionTime += deltaTime;

      // Update previous animation time (keep it running during transition)
      if (previousAnimation) {
        previousTime += deltaTime * speed;
        if (previousTime > previousAnimation.duration) {
          previousTime %= previousAnimation.duration;
        }
        sampleAnimation(previousAnimation, previousTime, previousTransforms);
      }

      // Calculate blend factor (0 = previous, 1 = current)
      const blendFactor = Math.min(1, transitionTime / transitionDuration);
      // Use smooth step for nicer easing
      const smoothBlend = blendFactor * blendFactor * (3 - 2 * blendFactor);

      // Blend transforms
      for (let i = 0; i < _skeleton.jointCount; i++) {
        blendedTransforms[i].translation = vec3Lerp(
          previousTransforms[i].translation,
          currentTransforms[i].translation,
          smoothBlend
        );
        blendedTransforms[i].rotation = quatSlerp(
          previousTransforms[i].rotation,
          currentTransforms[i].rotation,
          smoothBlend
        );
        blendedTransforms[i].scale = vec3Lerp(
          previousTransforms[i].scale,
          currentTransforms[i].scale,
          smoothBlend
        );
      }

      // End transition when complete
      if (blendFactor >= 1) {
        isTransitioning = false;
        previousAnimation = null;
      }
    } else {
      // No transition, use current transforms directly
      for (let i = 0; i < _skeleton.jointCount; i++) {
        blendedTransforms[i].translation = [...currentTransforms[i].translation];
        blendedTransforms[i].rotation = [...currentTransforms[i].rotation];
        blendedTransforms[i].scale = [...currentTransforms[i].scale];
      }
    }

    // Calculate world transforms from blended local transforms
    const worldMatrices = new Array(_skeleton.jointCount);

    // Find root joints (not children of any other joint)
    const childSet = new Set();
    _skeleton.hierarchy.forEach(j => j.children.forEach(c => childSet.add(c)));

    const computeWorldMatrix = (jointIndex, parentMatrix) => {
      const local = blendedTransforms[jointIndex];
      const localMatrix = trsToMatrix(local.translation, local.rotation, local.scale);
      const worldMatrix = parentMatrix ? mat4Multiply(parentMatrix, localMatrix) : localMatrix;
      worldMatrices[jointIndex] = worldMatrix;

      // Process children
      for (const childIndex of _skeleton.hierarchy[jointIndex].children) {
        computeWorldMatrix(childIndex, worldMatrix);
      }
    };

    // Start from root joints
    for (let i = 0; i < _skeleton.jointCount; i++) {
      if (!childSet.has(i)) {
        computeWorldMatrix(i, null);
      }
    }

    // Apply inverse bind matrices
    for (let i = 0; i < _skeleton.jointCount; i++) {
      if (worldMatrices[i] && _skeleton.inverseBindMatrices[i]) {
        const finalMatrix = mat4Multiply(worldMatrices[i], _skeleton.inverseBindMatrices[i]);
        boneMatrices.set(finalMatrix, i * 16);
      }
    }
  };

  const getBoneMatrices = () => boneMatrices;

  return {
    play,
    update,
    getBoneMatrices,
    get skeleton() { return _skeleton; },
    get animations() { return _animations; },
    get currentAnimation() { return currentAnimation; },
    get currentTime() { return currentTime; },
    get speed() { return speed; },
    set speed(v) { speed = v; }
  };
};
