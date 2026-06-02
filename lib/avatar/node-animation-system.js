/**
 * Node-Based Animation System
 * For animating individual nodes (like ship parts) without skeletal rigging
 * 
 * @param {Array} nodes - Array of node data from glTF
 * @param {Object} animations - Extracted animation data
 * @param {Object} nodeNameToIndex - Map node names to indices
 * @returns {Object} NodeAnimationSystem instance
 */
import { quatSlerp, vec3Lerp, trsToMatrix, mat4Multiply } from './glb-loader.js';

export const createNodeAnimationSystem = (nodes, animations, nodeNameToIndex) => {
    // --- STATE ---
    let _nodes = nodes;
    let _animations = animations;
    let _nodeNameToIndex = nodeNameToIndex;
    
    let currentAnimation = null;
    let currentTime = 0;
    let speed = 1;
    let loop = true;
    let isPlaying = false;
    
    // Store original node transforms for reset
    const defaultTransforms = nodes.map(node => ({
        translation: [...(node.translation || [0, 0, 0])],
        rotation: [...(node.rotation || [0, 0, 0, 1])],
        scale: [...(node.scale || [1, 1, 1])]
    }));
    
    // Current animated transforms (will be modified during animation)
    let animatedTransforms = defaultTransforms.map(t => ({
        translation: [...t.translation],
        rotation: [...t.rotation],
        scale: [...t.scale]
    }));
    
    // Compute node hierarchy for world transforms
    const nodeParent = new Array(nodes.length).fill(-1);
    nodes.forEach((node, i) => {
        if (node.children) {
            node.children.forEach(childIdx => {
                nodeParent[childIdx] = i;
            });
        }
    });
    
    // World matrices for each node
    const worldMatrices = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
        worldMatrices[i] = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }

    // --- CORE LOGIC ---

    /**
     * Compute world matrices from local transforms by traversing hierarchy
     */
    const computeWorldMatrices = () => {
        const visited = new Set();
        
        const computeNode = (nodeIndex, parentMatrix) => {
            if (visited.has(nodeIndex)) return;
            visited.add(nodeIndex);
            
            const t = animatedTransforms[nodeIndex];
            const localMatrix = trsToMatrix(t.translation, t.rotation, t.scale);
            
            const world = parentMatrix ? mat4Multiply(parentMatrix, localMatrix) : localMatrix;
            worldMatrices[nodeIndex].set(world);
            
            // Process children
            const node = _nodes[nodeIndex];
            if (node.children) {
                for (const childIndex of node.children) {
                    computeNode(childIndex, worldMatrices[nodeIndex]);
                }
            }
        };
        
        // Find root nodes (no parent) and start downward traversal
        for (let i = 0; i < _nodes.length; i++) {
            if (nodeParent[i] === -1) {
                computeNode(i, null);
            }
        }
    };
    
    /**
     * Play an animation by name
     */
    const play = (animationName, options = {}) => {
        const anim = _animations[animationName];
        if (!anim) {
            console.warn(`[NodeAnimation] Animation "${animationName}" not found. Available:`, Object.keys(_animations));
            return false;
        }
        
        currentAnimation = anim;
        currentTime = options.startTime || 0;
        speed = options.speed || 1;
        loop = options.loop !== undefined ? options.loop : true;
        isPlaying = true;
        
        console.log(`[NodeAnimation] Playing "${animationName}" (duration: ${anim.duration.toFixed(2)}s)`);
        return true;
    };
    
    /**
     * Stop animation and reset to default pose
     */
    const stop = () => {
        isPlaying = false;
        currentTime = 0;
        // Reset to default transforms
        animatedTransforms = defaultTransforms.map(t => ({
            translation: [...t.translation],
            rotation: [...t.rotation],
            scale: [...t.scale]
        }));
    };
    
    const pause = () => {
        isPlaying = false;
    };
    
    const resume = () => {
        isPlaying = true;
    };
    
    /**
     * Update animation state and compute matrices
     */
    const update = (deltaTime) => {
        if (!isPlaying || !currentAnimation) return;
        
        // Update time
        currentTime += deltaTime * speed;
        
        // Handle looping
        if (currentTime >= currentAnimation.duration) {
            if (loop) {
                currentTime %= currentAnimation.duration;
            } else {
                currentTime = currentAnimation.duration;
                isPlaying = false;
            }
        }
        
        // Reset to default transforms first
        for (let i = 0; i < _nodes.length; i++) {
            animatedTransforms[i].translation = [...defaultTransforms[i].translation];
            animatedTransforms[i].rotation = [...defaultTransforms[i].rotation];
            animatedTransforms[i].scale = [...defaultTransforms[i].scale];
        }
        
        // Apply animation tracks
        for (const track of currentAnimation.tracks) {
            const nodeIndex = _nodeNameToIndex[track.nodeName];
            if (nodeIndex === undefined) continue;
            
            // Find keyframe
            const times = track.times;
            let keyIndex = 0;
            for (let i = 0; i < times.length - 1; i++) {
                if (currentTime >= times[i] && currentTime < times[i + 1]) {
                    keyIndex = i;
                    break;
                }
                if (i === times.length - 2) keyIndex = i;
            }
            
            const t0 = times[keyIndex];
            const t1 = times[Math.min(keyIndex + 1, times.length - 1)];
            const alpha = t1 > t0 ? (currentTime - t0) / (t1 - t0) : 0;
            
            const v0 = track.values[keyIndex];
            const v1 = track.values[Math.min(keyIndex + 1, track.values.length - 1)];
            
            if (track.property === 'rotation') {
                animatedTransforms[nodeIndex].rotation = quatSlerp(v0, v1, alpha);
            } else if (track.property === 'translation') {
                animatedTransforms[nodeIndex].translation = vec3Lerp(v0, v1, alpha);
            } else if (track.property === 'scale') {
                animatedTransforms[nodeIndex].scale = vec3Lerp(v0, v1, alpha);
            }
        }
        
        // Compute world matrices
        computeWorldMatrices();
    };

    const getNodeWorldMatrix = (nodeIndex) => worldMatrices[nodeIndex];
    
    const getNodeWorldMatrixByName = (nodeName) => {
        const idx = _nodeNameToIndex[nodeName];
        return idx !== undefined ? worldMatrices[idx] : null;
    };

    return {
        play,
        stop,
        pause,
        resume,
        update,
        getNodeWorldMatrix,
        getNodeWorldMatrixByName,
        get currentAnimation() { return currentAnimation; },
        get duration() { return currentAnimation?.duration || 0; },
        get time() { return currentTime; },
        set time(t) { currentTime = t; },
        get isPlaying() { return isPlaying; },
        get speed() { return speed; },
        set speed(v) { speed = v; }
    };
};
