import { MOVEMENT_CONFIG } from '../config/movementConfig.js';

/**
 * createAvatarStrategy
 * Handles grounded walking (horizon-locked) and high-altitude flight (6-DOF)
 * @returns {Object} AvatarStrategy instance
 */
export const createAvatarStrategy = () => {
    const config = MOVEMENT_CONFIG;
    const flightThreshold = 0.05; // 50 meters

    const update = (dt, input, physicsState, cameraVectors) => {
        const { forward, right, up } = cameraVectors;
        
        // Defensive: handle first frame with missing data
        const terrainAltitude = physicsState?.terrainAltitude ?? 0;
        const normalToEarth = physicsState?.normalToEarth ?? [0, 1, 0];
        
        // Flight mode requires significant altitude
        const isFlying = terrainAltitude >= flightThreshold;
        
        let finalForward = [...forward];
        let finalRight = [...right];

        // HORIZON LOCK: If near ground, project movement onto the tangent plane
        if (!isFlying) {
            const dotF = finalForward[0] * normalToEarth[0] + finalForward[1] * normalToEarth[1] + finalForward[2] * normalToEarth[2];
            finalForward[0] -= normalToEarth[0] * dotF;
            finalForward[1] -= normalToEarth[1] * dotF;
            finalForward[2] -= normalToEarth[2] * dotF;

            const dotR = finalRight[0] * normalToEarth[0] + finalRight[1] * normalToEarth[1] + finalRight[2] * normalToEarth[2];
            finalRight[0] -= normalToEarth[0] * dotR;
            finalRight[1] -= normalToEarth[1] * dotR;
            finalRight[2] -= normalToEarth[2] * dotR;

            // Re-normalize for consistent speed
            const fLen = Math.sqrt(finalForward[0]**2 + finalForward[1]**2 + finalForward[2]**2);
            const rLen = Math.sqrt(finalRight[0]**2 + finalRight[1]**2 + finalRight[2]**2);
            
            if (fLen > 1e-6) {
                finalForward[0] /= fLen; finalForward[1] /= fLen; finalForward[2] /= fLen;
            } else {
                // Fallback to a default forward if looking straight up/down
                let ref = [0, 0, 1];
                if (Math.abs(normalToEarth[0]*ref[0] + normalToEarth[1]*ref[1] + normalToEarth[2]*ref[2]) > 0.9) ref = [1, 0, 0];
                const hRight = [
                    normalToEarth[1]*ref[2] - normalToEarth[2]*ref[1],
                    normalToEarth[2]*ref[0] - normalToEarth[0]*ref[2],
                    normalToEarth[0]*ref[1] - normalToEarth[1]*ref[0]
                ];
                finalForward = [
                    hRight[1]*normalToEarth[2] - hRight[2]*normalToEarth[1],
                    hRight[2]*normalToEarth[0] - hRight[0]*normalToEarth[2],
                    hRight[0]*normalToEarth[1] - hRight[1]*normalToEarth[0]
                ];
            }
            if (rLen > 1e-6) {
                finalRight[0] /= rLen; finalRight[1] /= rLen; finalRight[2] /= rLen;
            }
        }

        // Calculate move direction (8-way)
        let moveX = 0, moveY = 0, moveZ = 0;
        if (input.w) { moveX += finalForward[0]; moveY += finalForward[1]; moveZ += finalForward[2]; }
        if (input.s) { moveX -= finalForward[0]; moveY -= finalForward[1]; moveZ -= finalForward[2]; }
        if (input.a) { moveX -= finalRight[0]; moveY -= finalRight[1]; moveZ -= finalRight[2]; }
        if (input.d) { moveX += finalRight[0]; moveY += finalRight[1]; moveZ += finalRight[2]; }

        const moveLen = Math.sqrt(moveX * moveX + moveY * moveY + moveZ * moveZ);
        let moveDir = [0, 0, 0];
        if (moveLen > 0.001) {
            moveDir = [moveX / moveLen, moveY / moveLen, moveZ / moveLen];
        }

        // Manual Vertical Control (Q: Up, C: Down)
        let verticalMove = 0;
        if (input.q) verticalMove += 1;
        if (input.c) verticalMove -= 1;

        return {
            moveDir,
            verticalMove,
            jump: input.space && physicsState.isGrounded
        };
    };

    const getBasis = (physicsState) => {
        const up = physicsState?.normalToEarth ?? [0, 1, 0];
        const forward = [0, 0, 1];
        const right = [1, 0, 0];
        return { forward, right, up };
    };

    const getConfig = () => config;

    return {
        update,
        getBasis,
        getConfig
    };
};
