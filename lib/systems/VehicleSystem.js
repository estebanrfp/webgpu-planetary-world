import {
    VEHICLE_CONFIG,
    EARTH_RADIUS,
    EARTH_CENTER
} from '../config/index.js';

/**
 * createVehicleSystem
 * Manages the state, occupancy, and movement logic of a vehicle entity.
 * @param {Object} [vehicleConfig] - Vehicle configuration (defaults to VEHICLE_CONFIG)
 * @returns {Object} VehicleSystem instance
 */
export const createVehicleSystem = (vehicleConfig = VEHICLE_CONFIG) => {
    const config = vehicleConfig;
    const pos = { x: 0, y: 0, z: 0 };
    let rotation = 0;
    let isOccupied = false;
    let active = false;
    const velocity = { x: 0, y: 0, z: 0 };

    let _bankAngle = 0;
    let _lastTurnRate = 0;
    let _pitchAngle = 0;
    let _lastPitchRate = 0;
    let _alignmentUp = null;
    let _alignmentWeight = 0;
    let _lastForward = null;
    let _prevForward = null;

    const _cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];

    const _getPlanetUp = () => {
        const dx = pos.x - EARTH_CENTER[0];
        const dy = pos.y - EARTH_CENTER[1];
        const dz = pos.z - EARTH_CENTER[2];
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        return [dx/dist, dy/dist, dz/dist];
    };

    const _getHorizontalForward = (camForward, up) => {
        const dot = camForward[0] * up[0] + camForward[1] * up[1] + camForward[2] * up[2];
        const hx = camForward[0] - up[0] * dot;
        const hy = camForward[1] - up[1] * dot;
        const hz = camForward[2] - up[2] * dot;
        const hLen = Math.sqrt(hx*hx + hy*hy + hz*hz);
        if (hLen < 0.001) return _lastForward || [0, 0, 1];
        return [hx/hLen, hy/hLen, hz/hLen];
    };

    const spawn = (newPos) => {
        pos.x = newPos.x; pos.y = newPos.y; pos.z = newPos.z;
        active = true;
    };

    const spawnNear = (targetPos, forwardDir) => {
        const offset = config.spawnOffset;
        const hLen = Math.sqrt(forwardDir[0]**2 + forwardDir[2]**2);
        const fx = hLen > 0 ? forwardDir[0] / hLen : 0;
        const fz = hLen > 0 ? forwardDir[2] / hLen : 1;

        pos.x = targetPos.x + fx * offset.forward;
        pos.y = targetPos.y + offset.up;
        pos.z = targetPos.z + fz * offset.forward;

        velocity.x = 0; velocity.y = 0; velocity.z = 0;
        _lastForward = [fx, 0, fz];
        active = true;
        isOccupied = false;
        console.log(`[Vehicle:${config.type}] Summoned to`, pos);
    };

    const canInteract = (playerPos) => {
        if (!active) return false;
        const dx = playerPos.x - pos.x;
        const dy = playerPos.y - pos.y;
        const dz = playerPos.z - pos.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const interactionRadiusSq = config.interactionRadius * config.interactionRadius;
        return distSq <= interactionRadiusSq;
    };

    const toggleOccupancy = () => {
        isOccupied = !isOccupied;
        return isOccupied;
    };

    const syncPosition = (newPos) => {
        pos.x = newPos.x; pos.y = newPos.y; pos.z = newPos.z;
    };

    const syncOrientation = (targetForward, lerpFactor = 0.05, allowTilt = true) => {
        if (!_lastForward) { _lastForward = [...targetForward]; return; }

        _lastForward[0] += (targetForward[0] - _lastForward[0]) * lerpFactor;
        _lastForward[1] += (targetForward[1] - _lastForward[1]) * lerpFactor;
        _lastForward[2] += (targetForward[2] - _lastForward[2]) * lerpFactor;

        const len = Math.sqrt(_lastForward[0]**2 + _lastForward[1]**2 + _lastForward[2]**2);
        if (len > 1e-6) { _lastForward[0] /= len; _lastForward[1] /= len; _lastForward[2] /= len; }

        if (_prevForward && allowTilt) {
            const cross = _cross(_prevForward, _lastForward);
            const planetUp = _getPlanetUp();
            const yawRate = cross[0]*planetUp[0] + cross[1]*planetUp[1] + cross[2]*planetUp[2];
            const controls = config.controls || {};
            _lastTurnRate = yawRate * (controls.bankMultiplier || 30.0);
            const pitchChange = _lastForward[1] - _prevForward[1];
            _lastPitchRate = pitchChange * (controls.pitchMultiplier || 20.0);
        } else if (!allowTilt) {
            const controls = config.controls || {};
            const decay = controls.tiltDecay || 0.8;
            _lastTurnRate *= decay;
            _lastPitchRate *= decay;
        }
        _prevForward = [..._lastForward];
    };

    const updateBanking = (deltaTime) => {
        const controls = config.controls || {};
        if (!controls.bankEnabled) { _bankAngle = 0; _pitchAngle = 0; return; }

        const maxBank = controls.maxBankAngle || 0.4;
        const maxPitch = controls.maxPitchAngle || 0.3;
        const smoothing = controls.bankSmoothing || 0.03;

        const targetBank = Math.max(-maxBank, Math.min(maxBank, _lastTurnRate));
        const targetPitch = Math.max(-maxPitch, Math.min(maxPitch, _lastPitchRate));

        _bankAngle += (targetBank - _bankAngle) * smoothing;
        _pitchAngle += (targetPitch - _pitchAngle) * smoothing;

        const decay = controls.tiltDecay || 0.9;
        _lastTurnRate *= decay;
        _lastPitchRate *= decay;
    };

    const syncTerrainNormal = (normal, altitude) => {
        const movement = config.movement || {};
        if (!movement.terrainAlignment || !normal) { _alignmentUp = null; return; }

        const threshold = movement.alignmentThreshold || 0.5;
        _alignmentWeight = Math.max(0, Math.min(1, 1.0 - (altitude / threshold)));
        if (_alignmentWeight <= 0) return;

        const lerp = movement.alignmentSmoothing || 0.05;
        if (!_alignmentUp) {
            _alignmentUp = [...normal];
        } else {
            _alignmentUp[0] += (normal[0] - _alignmentUp[0]) * lerp;
            _alignmentUp[1] += (normal[1] - _alignmentUp[1]) * lerp;
            _alignmentUp[2] += (normal[2] - _alignmentUp[2]) * lerp;
            const len = Math.sqrt(_alignmentUp[0]**2 + _alignmentUp[1]**2 + _alignmentUp[2]**2);
            if (len > 0.01) { _alignmentUp[0] /= len; _alignmentUp[1] /= len; _alignmentUp[2] /= len; }
        }
    };

    const update = (deltaTime, keys, camVectors) => {
        if (!active) return;
        const up = _getPlanetUp();

        if (isOccupied) {
            const { forward: camForward } = camVectors;

            if (keys.w) {
                const targetForward = _getHorizontalForward(camForward, up);
                if (!_lastForward) {
                    _lastForward = [...targetForward];
                } else {
                    const steeringFactor = deltaTime * config.steeringSmoothing;
                    _lastForward[0] += (targetForward[0] - _lastForward[0]) * steeringFactor;
                    _lastForward[1] += (targetForward[1] - _lastForward[1]) * steeringFactor;
                    _lastForward[2] += (targetForward[2] - _lastForward[2]) * steeringFactor;
                    const fLen = Math.sqrt(_lastForward[0]**2 + _lastForward[1]**2 + _lastForward[2]**2);
                    if (fLen > 0.001) { _lastForward[0] /= fLen; _lastForward[1] /= fLen; _lastForward[2] /= fLen; }
                }
            }

            const moveSpeed = keys.shift ? config.boostSpeed : config.baseSpeed;
            const amount = moveSpeed * deltaTime;

            if (keys.w && _lastForward) { pos.x += _lastForward[0] * amount; pos.y += _lastForward[1] * amount; pos.z += _lastForward[2] * amount; }
            if (keys.s && _lastForward) { pos.x -= _lastForward[0] * amount; pos.y -= _lastForward[1] * amount; pos.z -= _lastForward[2] * amount; }
            if (keys.a && _lastForward) { const r = _cross(up, _lastForward); pos.x -= r[0] * amount; pos.y -= r[1] * amount; pos.z -= r[2] * amount; }
            if (keys.d && _lastForward) { const r = _cross(up, _lastForward); pos.x += r[0] * amount; pos.y += r[1] * amount; pos.z += r[2] * amount; }
            if (keys.q) { pos.x += up[0] * amount; pos.y += up[1] * amount; pos.z += up[2] * amount; }
            if (keys.c) { pos.x -= up[0] * amount; pos.y -= up[1] * amount; pos.z -= up[2] * amount; }
        }
    };

    const getBasis = () => {
        const planetUp = _getPlanetUp();
        let up = planetUp;
        if (_alignmentUp && _alignmentWeight > 0.001) {
            const w = _alignmentWeight;
            up = [planetUp[0]*(1-w)+_alignmentUp[0]*w, planetUp[1]*(1-w)+_alignmentUp[1]*w, planetUp[2]*(1-w)+_alignmentUp[2]*w];
            const uLen = Math.sqrt(up[0]**2+up[1]**2+up[2]**2);
            if (uLen > 0.001) { up[0] /= uLen; up[1] /= uLen; up[2] /= uLen; }
        }

        let forward, right;
        if (_lastForward) {
            forward = [..._lastForward];
            right = _cross(up, forward);
            const rLen = Math.sqrt(right[0]**2+right[1]**2+right[2]**2);
            if (rLen > 0.001) { right[0] /= rLen; right[1] /= rLen; right[2] /= rLen; }
            forward = _cross(right, up);
        } else {
            let ref = [0, 0, 1];
            if (Math.abs(up[0]*ref[0]+up[1]*ref[1]+up[2]*ref[2]) > 0.9) ref = [1, 0, 0];
            right = _cross(up, ref);
            const rLen = Math.sqrt(right[0]**2+right[1]**2+right[2]**2);
            right[0] /= rLen; right[1] /= rLen; right[2] /= rLen;
            forward = _cross(right, up);
        }

        let finalForward = forward, finalUp = up, finalRight = right;

        if (_bankAngle && Math.abs(_bankAngle) > 0.001) {
            const cosB = Math.cos(_bankAngle), sinB = Math.sin(_bankAngle);
            finalUp = [cosB*finalUp[0]+sinB*finalRight[0], cosB*finalUp[1]+sinB*finalRight[1], cosB*finalUp[2]+sinB*finalRight[2]];
            finalRight = [cosB*right[0]-sinB*up[0], cosB*right[1]-sinB*up[1], cosB*right[2]-sinB*up[2]];
        }

        if (_pitchAngle && Math.abs(_pitchAngle) > 0.001) {
            const cosP = Math.cos(_pitchAngle), sinP = Math.sin(_pitchAngle);
            finalForward = [cosP*finalForward[0]+sinP*finalUp[0], cosP*finalForward[1]+sinP*finalUp[1], cosP*finalForward[2]+sinP*finalUp[2]];
            finalUp = [cosP*finalUp[0]-sinP*forward[0], cosP*finalUp[1]-sinP*forward[1], cosP*finalUp[2]-sinP*forward[2]];
        }

        return { forward: finalForward, up: finalUp, right: finalRight };
    };

    const getCockpitPosition = () => {
        const { forward, up, right } = getBasis();
        const offset = config.cockpitOffset;
        return {
            x: pos.x + right[0]*offset.x + up[0]*offset.y + forward[0]*offset.z,
            y: pos.y + right[1]*offset.x + up[1]*offset.y + forward[1]*offset.z,
            z: pos.z + right[2]*offset.x + up[2]*offset.y + forward[2]*offset.z
        };
    };

    return {
        spawn, spawnNear, canInteract, toggleOccupancy, syncPosition, syncOrientation,
        updateBanking, syncTerrainNormal, update, getBasis, getCockpitPosition,
        get config() { return config; },
        get pos() { return pos; },
        get rotation() { return rotation; }, set rotation(v) { rotation = v; },
        get isOccupied() { return isOccupied; }, set isOccupied(v) { isOccupied = v; },
        get active() { return active; }, set active(v) { active = v; },
        get velocity() { return velocity; }
    };
};
