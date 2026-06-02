import { vec3 } from '../math/index.js';
import { EARTH_RADIUS, EARTH_CENTER } from '../config/index.js';

const normalize = vec3.normalize;
const cross = vec3.cross;

/**
 * createCameraSystem
 * Handles camera smoothing and view calculation for orbital/interior modes.
 * @param {Object} config - Camera configuration
 * @param {Object} initialState - Initial camera state
 * @returns {Object} CameraSystem instance
 */
export const createCameraSystem = (config, initialState) => {
    // Target values (set by input)
    let targetYaw = initialState.targetYaw || 0;
    let targetPitch = initialState.targetPitch || 1.5;
    let targetDistance = initialState.targetDistance || config.defaultDistance;

    // Current smoothed values
    let orbitYaw = initialState.orbitYaw || 0;
    let orbitPitch = initialState.orbitPitch || 1.5;
    let distance = initialState.distance || config.defaultDistance;

    // Terrain height probe (km above sea level at a world point). Injected by
    // the host so the orbital camera can shrink its distance to avoid clipping
    // through hills behind the avatar. Returns null when out of the grid.
    /** @type {((x:number,y:number,z:number)=>number|null) | null} */
    let _terrainProbe = null;

    /**
     * Updates internal smoothed state based on delta time
     */
    const update = (deltaTime) => {
        const orbitSmoothFactor = 1 - Math.exp(-config.orbitSmoothing * deltaTime);
        const zoomSmoothFactor = 1 - Math.exp(-config.zoomSmoothing * deltaTime);
        
        orbitYaw += (targetYaw - orbitYaw) * orbitSmoothFactor;
        orbitPitch += (targetPitch - orbitPitch) * orbitSmoothFactor;
        distance += (targetDistance - distance) * zoomSmoothFactor;
    };

    /**
     * Get the local "up" direction at a position
     */
    const getLocalUp = (x, y, z) => {
        const dx = x - EARTH_CENTER[0];
        const dy = y - EARTH_CENTER[1];
        const dz = z - EARTH_CENTER[2];
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        return [dx/len, dy/len, dz/len];
    };

    /**
     * Calculate altitude above planet surface
     */
    const getAltitude = (x, y, z) => {
        const dx = x - EARTH_CENTER[0];
        const dy = y - EARTH_CENTER[1];
        const dz = z - EARTH_CENTER[2];
        return Math.sqrt(dx*dx + dy*dy + dz*dz) - EARTH_RADIUS;
    };

    /**
     * Calculate camera for INTERIOR (Cockpit) view
     */
    const getInteriorState = (refPoint, cockpitOffset, basis) => {
        const forward = basis.forward;
        const localUp = basis.up;
        const right = basis.right;
        
        const cosYaw = Math.cos(orbitYaw);
        const sinYaw = Math.sin(orbitYaw);
        const cosPitch = Math.cos(orbitPitch);
        const sinPitch = Math.sin(orbitPitch);
        
        const horizontalDir = [
            forward[0] * cosYaw + right[0] * sinYaw,
            forward[1] * cosYaw + right[1] * sinYaw,
            forward[2] * cosYaw + right[2] * sinYaw
        ];
        
        const viewForwardNorm = normalize([
            horizontalDir[0] * cosPitch - localUp[0] * sinPitch,
            horizontalDir[1] * cosPitch - localUp[1] * sinPitch,
            horizontalDir[2] * cosPitch - localUp[2] * sinPitch
        ]);

        const camPos = [
            refPoint.x + right[0] * cockpitOffset.x + localUp[0] * cockpitOffset.y + forward[0] * cockpitOffset.z,
            refPoint.y + right[1] * cockpitOffset.x + localUp[1] * cockpitOffset.y + forward[1] * cockpitOffset.z,
            refPoint.z + right[2] * cockpitOffset.x + localUp[2] * cockpitOffset.y + forward[2] * cockpitOffset.z
        ];

        const camForward = viewForwardNorm;
        let camRight = cross(camForward, localUp);
        camRight = normalize(camRight);
        const camUp = normalize(cross(camRight, camForward));

        return {
            position: camPos,
            lookAt: [camPos[0] + camForward[0], camPos[1] + camForward[1], camPos[2] + camForward[2]],
            forward: camForward,
            right: camRight,
            up: camUp,
            backward: [-camForward[0], -camForward[1], -camForward[2]],
            distance: 0,
            meshPosition: [refPoint.x, refPoint.y, refPoint.z],
            meshForward: forward,
            meshUp: localUp,
            meshRight: right
        };
    };

    /**
     * Calculate camera for THIRD-PERSON view
     */
    const getOrbitalState = (refPoint, options = {}) => {
        const localUp = getLocalUp(refPoint.x, refPoint.y, refPoint.z);
        
        let east = cross(localUp, [0, 1, 0]);
        let lenEast = Math.sqrt(east[0]**2 + east[1]**2 + east[2]**2);
        if (lenEast < 0.001) {
            east = cross(localUp, [0, 0, 1]);
            lenEast = Math.sqrt(east[0]**2 + east[1]**2 + east[2]**2);
        }
        east = [east[0]/lenEast, east[1]/lenEast, east[2]/lenEast];
        
        let north = cross(east, localUp);
        north = normalize(north);
        
        const cosYaw = Math.cos(orbitYaw);
        const sinYaw = Math.sin(orbitYaw);
        const cosPitch = Math.cos(orbitPitch);
        const sinPitch = Math.sin(orbitPitch);
        
        const horizontalDir = [
            north[0] * cosYaw + east[0] * sinYaw,
            north[1] * cosYaw + east[1] * sinYaw,
            north[2] * cosYaw + east[2] * sinYaw
        ];
        
        const meshForward = [
            horizontalDir[0] * cosPitch - localUp[0] * sinPitch,
            horizontalDir[1] * cosPitch - localUp[1] * sinPitch,
            horizontalDir[2] * cosPitch - localUp[2] * sinPitch
        ];
        const meshForwardNorm = normalize(meshForward);
        
        const headOffset = options.headOffset !== undefined ? options.headOffset : 0.0018;
        
        const orbitCenter = [
            refPoint.x + localUp[0] * headOffset,
            refPoint.y + localUp[1] * headOffset,
            refPoint.z + localUp[2] * headOffset
        ];

        // Default orbit offset; shrunk below if the camera would clip into terrain.
        let safeDistance = distance;

        // Terrain-collision probe: binary-search for the largest distance at which
        // the camera stays above the worst-case terrain height along the
        // avatar→camera ray. This prevents clipping through hills/mountains.
        if (_terrainProbe) {
            const clearance = config.groundClearance ?? 0.0008;

            // Baseline: terrain height at the avatar's position. Always inside the
            // physics grid (grid is centred on the avatar), so this is the reliable
            // floor we use when the camera sample falls outside the grid coverage.
            const refX = refPoint.x - EARTH_CENTER[0];
            const refY = refPoint.y - EARTH_CENTER[1];
            const refZ = refPoint.z - EARTH_CENTER[2];
            const refRadius = Math.sqrt(refX * refX + refY * refY + refZ * refZ);
            const avatarTerrainAlt = _terrainProbe(refPoint.x, refPoint.y, refPoint.z);
            const baselineH = (avatarTerrainAlt != null)
                ? avatarTerrainAlt
                : (refRadius - EARTH_RADIUS); // fallback: assume avatar sits on terrain

            // Sample the ray from the avatar out to the requested distance to catch
            // hills that rise between the avatar and the requested camera position.
            const RAY_SAMPLES = 5;
            const sampleMaxTerrainAlt = (d) => {
                let hMax = baselineH;
                for (let i = 1; i <= RAY_SAMPLES; i++) {
                    const t = (i / RAY_SAMPLES) * d;
                    const upOff = t * 0.2;
                    const sx = orbitCenter[0] - meshForwardNorm[0] * t + localUp[0] * upOff;
                    const sy = orbitCenter[1] - meshForwardNorm[1] * t + localUp[1] * upOff;
                    const sz = orbitCenter[2] - meshForwardNorm[2] * t + localUp[2] * upOff;
                    const h = _terrainProbe(sx, sy, sz);
                    if (h != null && h > hMax) hMax = h;
                }
                return hMax;
            };

            const camAltAt = (d) => {
                const upOff = d * 0.2;
                const cx = orbitCenter[0] - meshForwardNorm[0] * d + localUp[0] * upOff;
                const cy = orbitCenter[1] - meshForwardNorm[1] * d + localUp[1] * upOff;
                const cz = orbitCenter[2] - meshForwardNorm[2] * d + localUp[2] * upOff;
                const dx = cx - EARTH_CENTER[0];
                const dy = cy - EARTH_CENTER[1];
                const dz = cz - EARTH_CENTER[2];
                return Math.sqrt(dx * dx + dy * dy + dz * dz) - EARTH_RADIUS;
            };

            const isClear = (d) => camAltAt(d) > sampleMaxTerrainAlt(d) + clearance;

            if (!isClear(safeDistance)) {
                let lo = 0, hi = safeDistance;
                for (let i = 0; i < 10; i++) {
                    const mid = (lo + hi) * 0.5;
                    if (isClear(mid)) lo = mid; else hi = mid;
                }
                safeDistance = lo;
            }
        }

        const offsetDistance = safeDistance;
        const offsetUp = safeDistance * 0.2;

        const camPos = [
            orbitCenter[0] - meshForwardNorm[0] * offsetDistance + localUp[0] * offsetUp,
            orbitCenter[1] - meshForwardNorm[1] * offsetDistance + localUp[1] * offsetUp,
            orbitCenter[2] - meshForwardNorm[2] * offsetDistance + localUp[2] * offsetUp
        ];
        
        const lookAt = orbitCenter;
        
        const camForward = normalize([
            lookAt[0] - camPos[0],
            lookAt[1] - camPos[1],
            lookAt[2] - camPos[2]
        ]);
        
        let camRight = cross(camForward, localUp);
        camRight = normalize(camRight);
        const camUp = normalize(cross(camRight, camForward));
        
        return {
            position: camPos,
            lookAt: lookAt,
            forward: camForward,
            right: camRight,
            up: camUp,
            backward: [-camForward[0], -camForward[1], -camForward[2]],
            distance: distance,
            meshPosition: [refPoint.x, refPoint.y, refPoint.z],
            meshForward: meshForwardNorm,
            meshUp: localUp,
            meshRight: normalize(cross(meshForwardNorm, localUp))
        };
    };

    return {
        update,
        getLocalUp,
        getAltitude,
        getInteriorState,
        getOrbitalState,
        /** Inject a function that returns the terrain height (km) at a world point.
         *  When set, the orbital camera will shrink its distance to avoid clipping
         *  the ground or any hill/mountain behind the avatar. */
        setTerrainProbe(fn) { _terrainProbe = typeof fn === 'function' ? fn : null; },
        get config() { return config; },
        get targetYaw() { return targetYaw; },
        set targetYaw(v) { targetYaw = v; },
        get targetPitch() { return targetPitch; },
        set targetPitch(v) { targetPitch = v; },
        get targetDistance() { return targetDistance; },
        set targetDistance(v) { targetDistance = v; },
        get orbitYaw() { return orbitYaw; },
        set orbitYaw(v) { orbitYaw = v; },
        get orbitPitch() { return orbitPitch; },
        set orbitPitch(v) { orbitPitch = v; },
        get distance() { return distance; },
        set distance(v) { distance = v; }
    };
};
