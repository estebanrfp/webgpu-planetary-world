import { VEHICLE_CONFIG } from '../config/vehicleConfig.js';

/**
 * createShipStrategy
 * Handles orbital flight with momentum-based steering.
 * @param {Object} [vehicleConfig] - Vehicle config (defaults to VEHICLE_CONFIG)
 * @returns {Object} ShipStrategy instance
 */
export const createShipStrategy = (vehicleConfig = VEHICLE_CONFIG) => {
    const config = vehicleConfig;
    const momentum = [0, 0, 0];

    const _cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];

    const update = (dt, input, physicsState, cameraVectors) => {
        const { forward, right } = cameraVectors;
        const planetUp = physicsState?.normalToEarth ?? [0, 1, 0];
        
        const controls = config.controls || {};
        const accelRate = controls.acceleration || 0.04;
        const decayRate = controls.inertiaDecay || 0.985;

        let targetMoveX = 0, targetMoveY = 0, targetMoveZ = 0;
        
        // Forward/Backward (W/S)
        if (input.w) {
            targetMoveX += forward[0];
            targetMoveY += forward[1];
            targetMoveZ += forward[2];
        }
        if (input.s) {
            targetMoveX -= forward[0];
            targetMoveY -= forward[1];
            targetMoveZ -= forward[2];
        }
        
        // Strafe (A/D)
        if (input.a) {
            targetMoveX -= right[0];
            targetMoveY -= right[1];
            targetMoveZ -= right[2];
        }
        if (input.d) {
            targetMoveX += right[0];
            targetMoveY += right[1];
            targetMoveZ += right[2];
        }
        
        // Vertical Movement (Q/C)
        if (input.q) {
            targetMoveX += planetUp[0];
            targetMoveY += planetUp[1];
            targetMoveZ += planetUp[2];
        }
        if (input.c) {
            targetMoveX -= planetUp[0];
            targetMoveY -= planetUp[1];
            targetMoveZ -= planetUp[2];
        }

        // --- MOMENTUM PHYSICS ---
        const inputLen = Math.sqrt(targetMoveX**2 + targetMoveY**2 + targetMoveZ**2);
        
        if (inputLen > 0.001) {
            const invLen = 1.0 / inputLen;
            momentum[0] += (targetMoveX * invLen - momentum[0]) * accelRate;
            momentum[1] += (targetMoveY * invLen - momentum[1]) * accelRate;
            momentum[2] += (targetMoveZ * invLen - momentum[2]) * accelRate;
        } else {
            momentum[0] *= decayRate;
            momentum[1] *= decayRate;
            momentum[2] *= decayRate;
        }

        // Clamp momentum length to 1.0
        const mLenSq = momentum[0]**2 + momentum[1]**2 + momentum[2]**2;
        if (mLenSq > 1.0) {
            const mLen = Math.sqrt(mLenSq);
            momentum[0] /= mLen; momentum[1] /= mLen; momentum[2] /= mLen;
        }

        return {
            moveDir: [momentum[0], momentum[1], momentum[2]],
            verticalMove: 0,
            jump: false
        };
    };

    const getBasis = (physicsState) => {
        const up = physicsState?.normalToEarth ?? [0, 1, 0];
        
        let forward = [0, 0, 1];
        if (Math.abs(up[0]*forward[0] + up[1]*forward[1] + up[2]*forward[2]) > 0.9) {
            forward = [1, 0, 0];
        }
        
        const right = _cross(up, forward);
        forward = _cross(right, up);
        
        return { forward, right, up };
    };

    const getConfig = () => config;

    return {
        update,
        getBasis,
        getConfig
    };
};
