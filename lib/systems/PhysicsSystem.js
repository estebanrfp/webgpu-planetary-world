import { 
    MOVEMENT_CONFIG, 
    PHYSICS_GRID_CONFIG, 
    EARTH_RADIUS, 
    EARTH_CENTER, 
    AVATAR_CONFIG, 
    TERRAIN_SCALES 
} from '../config/index.js';
import { getTerrainHeightMultiplier } from '../terrain/height.js';

/**
 * createPhysicsSystem
 * Handles physics simulation including position, velocity, gravity, and terrain collision.
 * @param {Object} initialPosState - Initial position {x, y, z}
 * @returns {Object} PhysicsSystem instance
 */
export const createPhysicsSystem = (initialPosState) => {
    // State
    const pos = { 
        x: initialPosState.x, 
        y: initialPosState.y, 
        z: initialPosState.z 
    };
    let velocityY = 0;
    let isGrounded = false;
    
    // GPU height grid around avatar
    const _gpuGrid = {
        heights: new Float32Array(PHYSICS_GRID_CONFIG.GRID_POINTS),
        centerPos: { x: 0, y: 0, z: 0 },
        basis: { up: [0,1,0], right: [1,0,0], forward: [0,0,1] },
        spacing: PHYSICS_GRID_CONFIG.GRID_SPACING,
        size: PHYSICS_GRID_CONFIG.GRID_SIZE,
        valid: false,
        pending: false
    };

    const syncPosition = (newPos) => {
        pos.x = newPos.x;
        pos.y = newPos.y;
        pos.z = newPos.z;
    };

    const requestGPUHeightGrid = async (renderer, terrainParams = {}, skipBake = false) => {
        if (!renderer?.getTerrainHeightGrid || _gpuGrid.pending) return;

        // Skip when the caller signals an "in-flight" state — physics on a
        // height grid is only needed while walking. While flying we drift
        // 100+ m/s and would trigger a bake every couple of seconds without
        // anyone consuming the result.
        if (skipBake) return;

        // Compute distance from Earth center and sea-level altitude
        const dxe = pos.x - EARTH_CENTER[0];
        const dye = pos.y - EARTH_CENTER[1];
        const dze = pos.z - EARTH_CENTER[2];
        const distToCenter = Math.sqrt(dxe*dxe + dye*dye + dze*dze);
        const seaLevelAlt = distToCenter - EARTH_RADIUS;

        // Quick exit: above atmosphere, definitely no terrain
        if (seaLevelAlt > MOVEMENT_CONFIG.atmosphereBoundary) return;

        // Altitude gate: decide if bake is needed
        const gridHeight = _gpuGrid.valid ? _getHeightFromGrid(pos.x, pos.y, pos.z) : null;
        let terrainAlt;

        if (gridHeight !== null) {
            // Grid valid — precise AGL, only rebake within 200m of surface
            terrainAlt = distToCenter - (EARTH_RADIUS + gridHeight);
            if (terrainAlt > PHYSICS_GRID_CONFIG.MAX_BAKE_ALTITUDE_KM) return;
        } else {
            // No grid — use seaLevelAlt directly (CPU noise is too inaccurate)
            // First bake triggers at 5 km MSL for 795 km planet
            terrainAlt = seaLevelAlt;
            if (seaLevelAlt > 5.0) return;
        }

        // Distance check: skip rebake if grid valid and avatar hasn't moved much
        const dx = pos.x - _gpuGrid.centerPos.x;
        const dy = pos.y - _gpuGrid.centerPos.y;
        const dz = pos.z - _gpuGrid.centerPos.z;
        const distToCenterSq = dx*dx + dy*dy + dz*dz;
        const rebakeThreshold = PHYSICS_GRID_CONFIG.REBAKE_THRESHOLD_KM;

        if (_gpuGrid.valid && distToCenterSq < (rebakeThreshold * rebakeThreshold)) {
            return;
        }

        // Capture position at bake START (pos mutates during async bake)
        const bakeX = pos.x, bakeY = pos.y, bakeZ = pos.z;

        _gpuGrid.pending = true;
        console.log(`[PhysicsSystem] 🏔️ Rebaking Grid (AGL: ${terrainAlt.toFixed(3)} km, Offset: ${Math.sqrt(distToCenterSq).toFixed(5)} km)`);
        try {
            const result = await renderer.getTerrainHeightGrid(bakeX, bakeY, bakeZ);
            _gpuGrid.heights = result.heights;
            _gpuGrid.centerPos = { x: bakeX, y: bakeY, z: bakeZ };
            if (result.basis) {
                _gpuGrid.basis.up = result.basis.up;
                _gpuGrid.basis.right = result.basis.right;
                _gpuGrid.basis.forward = result.basis.forward;
            }
            _gpuGrid.valid = true;
        } catch (e) {
            console.warn('[PhysicsSystem] Grid bake failed:', e);
            _gpuGrid.valid = false;
        }
        _gpuGrid.pending = false;
    };
    
    const _worldToGrid = (x, y, z) => {
        if (!_gpuGrid.valid) return null;
        const dx = x - _gpuGrid.centerPos.x;
        const dy = y - _gpuGrid.centerPos.y;
        const dz = z - _gpuGrid.centerPos.z;
        // Reuse basis vectors from bake time — prevents refVec flip between bake and lookup
        const { up, right, forward } = _gpuGrid.basis;
        const localX = dx*right[0] + dy*right[1] + dz*right[2];
        const localY = dx*forward[0] + dy*forward[1] + dz*forward[2];
        const gridSize = _gpuGrid.size;
        const halfGrid = (gridSize - 1) / 2;
        const gridSpacingKm = _gpuGrid.spacing * TERRAIN_SCALES.M_TO_KM;
        const gridX = (localX / gridSpacingKm) + halfGrid;
        const gridY = (localY / gridSpacingKm) + halfGrid;
        return { gridX, gridY, up, right, forward };
    };

    const _getHeightFromGrid = (x, y, z) => {
        const gridData = _worldToGrid(x, y, z);
        if (!gridData) return null;
        const { gridX, gridY } = gridData;
        const gridSize = _gpuGrid.size;
        if (gridX < 0 || gridX >= gridSize - 1 || gridY < 0 || gridY >= gridSize - 1) return null;
        const x0 = Math.floor(gridX), y0 = Math.floor(gridY);
        const fx = gridX - x0, fy = gridY - y0;
        const h00 = _gpuGrid.heights[y0 * gridSize + x0];
        const h10 = _gpuGrid.heights[y0 * gridSize + (x0 + 1)];
        const h01 = _gpuGrid.heights[(y0 + 1) * gridSize + x0];
        const h11 = _gpuGrid.heights[(y0 + 1) * gridSize + (x0 + 1)];
        return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
    };

    const _getNormalFromGrid = (x, y, z) => {
        const gridData = _worldToGrid(x, y, z);
        if (!gridData) return null;
        const { gridX, gridY, up, right, forward } = gridData;
        const gridSize = _gpuGrid.size;
        
        if (gridX < 1 || gridX >= gridSize - 1 || gridY < 1 || gridY >= gridSize - 1) return null;
        
        const ix = Math.floor(gridX);
        const iy = Math.floor(gridY);
        const gridSpacingKm = _gpuGrid.spacing * TERRAIN_SCALES.M_TO_KM;

        const hL = _gpuGrid.heights[iy * gridSize + (ix - 1)];
        const hR = _gpuGrid.heights[iy * gridSize + (ix + 1)];
        const hD = _gpuGrid.heights[(iy - 1) * gridSize + ix];
        const hU = _gpuGrid.heights[(iy + 1) * gridSize + ix];

        const dhdx = (hR - hL) / (2 * gridSpacingKm);
        const dhdy = (hU - hD) / (2 * gridSpacingKm);

        const nx = -dhdx, ny = 1.0, nz = -dhdy;
        const nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);
        const lnx = nx/nlen, lny = ny/nlen, lnz = nz/nlen;

        return [
            lnx * right[0] + lny * up[0] + lnz * forward[0],
            lnx * right[1] + lny * up[1] + lnz * forward[1],
            lnx * right[2] + lny * up[2] + lnz * forward[2]
        ];
    };

    const getState = (terrainParams = {}) => {
        const dx_to_earth = pos.x - EARTH_CENTER[0];
        const dy_to_earth = pos.y - EARTH_CENTER[1];
        const dz_to_earth = pos.z - EARTH_CENTER[2];
        const distToCenter = Math.sqrt(dx_to_earth*dx_to_earth + dy_to_earth*dy_to_earth + dz_to_earth*dz_to_earth);
        const normalToEarth = [dx_to_earth/distToCenter, dy_to_earth/distToCenter, dz_to_earth/distToCenter];
        
        const seaLevelAltitude = distToCenter - EARTH_RADIUS;
        const gridHeight = _getHeightFromGrid(pos.x, pos.y, pos.z);
        
        let terrainHeight;
        if (gridHeight !== null) {
            terrainHeight = gridHeight;
        } else {
            const cpuMultiplier = getTerrainHeightMultiplier(normalToEarth, terrainParams.octaves || 16, terrainParams);
            terrainHeight = cpuMultiplier * TERRAIN_SCALES.HEIGHT_SCALE;
        }

        const terrainAltitude = distToCenter - (EARTH_RADIUS + terrainHeight);
        const terrainNormal = _getNormalFromGrid(pos.x, pos.y, pos.z) || normalToEarth;
        
        return {
            pos,
            distToCenter,
            normalToEarth,
            terrainAltitude,
            seaLevelAltitude,
            terrainNormal,
            isGrounded,
            usingGPU: gridHeight !== null
        };
    };

    const update = (deltaTime, moveDir, verticalMove, jump, config = MOVEMENT_CONFIG, speedMultiplier = 1.0, terrainParams = {}, treeCylinders = []) => {
        const state = getState(terrainParams);
        const { normalToEarth, terrainAltitude, seaLevelAltitude } = state;
        
        const atmBoundary = config.atmosphereBoundary || 100;
        const minSpeed = config.minSpeed || 0.1;
        
        let moveSpeed;
        if (terrainAltitude > atmBoundary) {
            const safeAltitude = Math.max(terrainAltitude, 0.0001);
            const logScale = 1 + (config.logScaleFactor || 0.3) * Math.log10(safeAltitude + 1);
            moveSpeed = safeAltitude * (config.speedPerKmAltitude || 0.4) * logScale;
        } else {
            const logScaleAtBoundary = 1 + (config.logScaleFactor || 0.3) * Math.log10(atmBoundary + 1);
            const entrySpeed = atmBoundary * (config.speedPerKmAltitude || 0.4) * logScaleAtBoundary;
            const progress = Math.max(0, terrainAltitude / atmBoundary);
            moveSpeed = minSpeed + (entrySpeed - minSpeed) * progress;
        }
        
        moveSpeed = Math.min(config.maxSpeedCap || 6000, moveSpeed) * speedMultiplier;

        const moveAmount = moveSpeed * deltaTime;
        const up = normalToEarth;

        // Soft ceiling - smoothly reduce upward movement as approaching max altitude
        const maxAlt = config.maxAltitude ?? Infinity;
        const softZone = config.ceilingSoftZone ?? 50;
        const softStart = maxAlt - softZone;

        // Calculate ceiling damping factor (1.0 = full speed, 0.0 = stopped)
        let ceilingFactor = 1.0;
        if (maxAlt < Infinity && seaLevelAltitude > softStart) {
            // Smoothstep: smooth transition from 1 to 0
            const t = Math.min(1, (seaLevelAltitude - softStart) / softZone);
            ceilingFactor = 1 - (t * t * (3 - 2 * t)); // smoothstep curve
        }

        const isMoving = Math.sqrt(moveDir[0]**2 + moveDir[1]**2 + moveDir[2]**2) > 0.001;
        if (isMoving) {
            // Calculate upward component of movement direction
            const upwardComponent = moveDir[0] * up[0] + moveDir[1] * up[1] + moveDir[2] * up[2];

            if (upwardComponent > 0 && ceilingFactor < 1.0) {
                // Dampen only the upward component, keep lateral movement
                const lateralX = moveDir[0] - upwardComponent * up[0];
                const lateralY = moveDir[1] - upwardComponent * up[1];
                const lateralZ = moveDir[2] - upwardComponent * up[2];

                const dampedUpward = upwardComponent * ceilingFactor;

                pos.x += (lateralX + dampedUpward * up[0]) * moveSpeed * deltaTime;
                pos.y += (lateralY + dampedUpward * up[1]) * moveSpeed * deltaTime;
                pos.z += (lateralZ + dampedUpward * up[2]) * moveSpeed * deltaTime;
            } else {
                pos.x += moveDir[0] * moveSpeed * deltaTime;
                pos.y += moveDir[1] * moveSpeed * deltaTime;
                pos.z += moveDir[2] * moveSpeed * deltaTime;
            }
        }

        if (verticalMove !== 0) {
            // Apply soft ceiling to vertical movement (Q/E keys)
            const effectiveVertical = verticalMove > 0 ? verticalMove * ceilingFactor : verticalMove;
            pos.x += up[0] * effectiveVertical * moveAmount;
            pos.y += up[1] * effectiveVertical * moveAmount;
            pos.z += up[2] * effectiveVertical * moveAmount;
        }

        const gravityConfig = config.gravity || 0;
        
        if (gravityConfig > 0 && terrainAltitude < atmBoundary && verticalMove === 0) {
            velocityY -= gravityConfig * deltaTime;
            
            if (jump && isGrounded && !config.useHoverSprings) {
                velocityY = config.jumpVelocity || 0.008;
                isGrounded = false;
            }
        } else if (verticalMove === 0 && !config.useHoverSprings) {
            velocityY = 0;
        }
        
        // Safety clamp - enforce hard ceiling (should rarely trigger with soft zone)
        if (maxAlt < Infinity) {
            const currentState = getState(terrainParams);
            if (currentState.seaLevelAltitude > maxAlt) {
                const overshoot = currentState.seaLevelAltitude - maxAlt;
                pos.x -= currentState.normalToEarth[0] * overshoot;
                pos.y -= currentState.normalToEarth[1] * overshoot;
                pos.z -= currentState.normalToEarth[2] * overshoot;
            }
        }

        let finalState = getState(terrainParams);
        let finalAltitude = finalState.terrainAltitude;
        const groundThreshold = config.minAltitude || 0;
        
        // Apply vertical velocity
        pos.x += up[0] * velocityY * deltaTime;
        pos.y += up[1] * velocityY * deltaTime;
        pos.z += up[2] * velocityY * deltaTime;

        // Re-check altitude after velocity applied
        finalState = getState(terrainParams);
        finalAltitude = finalState.terrainAltitude;

        // Ground collision: if below terrain, place on surface and stop falling
        if (finalAltitude < groundThreshold) {
            const correction = groundThreshold - finalAltitude;
            const n = finalState.normalToEarth ?? up;
            pos.x += n[0] * correction;
            pos.y += n[1] * correction;
            pos.z += n[2] * correction;
            if (velocityY < 0) velocityY = 0;
            isGrounded = true;
        } else {
            isGrounded = finalAltitude <= (groundThreshold + (config.groundedThreshold || 0.0001));
        }

        // Tree cylinder push-back (after ground collision, before return)
        if (treeCylinders.length > 0) {
            for (const cyl of treeCylinders) {
                // Vector from tree base to avatar
                const dx = pos.x - cyl.x;
                const dy = pos.y - cyl.y;
                const dz = pos.z - cyl.z;

                // Project onto tree up vector (sphere normal at tree position)
                const upX = cyl.nx, upY = cyl.ny, upZ = cyl.nz;
                const dotUp = dx * upX + dy * upY + dz * upZ;
                if (dotUp < 0 || dotUp > cyl.height) continue; // Above or below cylinder

                // Lateral distance (perpendicular to tree up axis)
                const latX = dx - dotUp * upX;
                const latY = dy - dotUp * upY;
                const latZ = dz - dotUp * upZ;
                const latDist = Math.sqrt(latX * latX + latY * latY + latZ * latZ);

                if (latDist < cyl.radius && latDist > 0.0001) {
                    const pushDist = cyl.radius - latDist;
                    const invLat = 1.0 / latDist;
                    pos.x += latX * invLat * pushDist;
                    pos.y += latY * invLat * pushDist;
                    pos.z += latZ * invLat * pushDist;
                }
            }
        }

        return {
            pos: { x: pos.x, y: pos.y, z: pos.z },
            seaLevelAltitude,
            terrainAltitude: Math.max(finalAltitude, groundThreshold),
            terrainNormal: finalState.terrainNormal,
            maxSpeed: moveSpeed,
            usingGPU: finalState.usingGPU,
            isGrounded,
            isJumping: velocityY > 0.001,
            isFalling: velocityY < -0.001 && !isGrounded,
            isMoving,
            moveDir
        };
    };
    
    const getPosition = () => pos;

    return {
        syncPosition,
        requestGPUHeightGrid,
        getState,
        update,
        getPosition,
        getHeightAt: _getHeightFromGrid,
        get velocityY() { return velocityY; },
        set velocityY(v) { velocityY = v; },
        get isGrounded() { return isGrounded; },
        set isGrounded(v) { isGrounded = v; },
        get pos() { return pos; }
    };
};
