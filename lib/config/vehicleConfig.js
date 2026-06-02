/**
 * VEHICLE CONFIGURATION REGISTRY
 *
 * Multi-vehicle support via config registry.
 * Each vehicle type has its own movement, controls, and visual parameters.
 * Add new vehicle types by adding entries to VEHICLE_CONFIGS.
 */

/** @type {string} Default vehicle type */
export const DEFAULT_VEHICLE_TYPE = 'ship';

/**
 * Apply flat compatibility aliases to a vehicle config.
 * @param {Object} config - Vehicle config object
 * @returns {Object} Same config with aliases added
 */
const applyAliases = (config) => {
    config.baseSpeed = config.hud.baseSpeed;
    config.boostSpeed = config.hud.boostSpeed;
    config.minSpeed = config.movement.minSpeed;
    config.maxSpeedCap = config.movement.maxSpeedCap;
    config.speedPerKmAltitude = config.movement.speedPerKmAltitude;
    config.logScaleFactor = config.movement.logScaleFactor;
    config.minAcceleration = config.movement.minAcceleration;
    config.maxAcceleration = config.movement.maxAcceleration;
    config.boostMultiplier = config.movement.boostMultiplier;
    config.gravity = config.movement.gravity;
    config.jumpVelocity = config.movement.jumpVelocity;
    config.groundedThreshold = config.movement.groundedThreshold;
    config.atmosphereBoundary = config.movement.atmosphereBoundary;
    config.accelPerKmAltitude = config.movement.accelPerKmAltitude;
    config.minAltitude = config.movement.minAltitude;
    config.autoSteer = true;
    config.steeringSmoothing = config.controls.steeringSmoothing;
    return config;
};

/**
 * Vehicle configs registry.
 * Keys are vehicle type identifiers, values are full config objects.
 * @type {Record<string, Object>}
 */
export const VEHICLE_CONFIGS = {

    // === PRIMARY VEHICLE: Scout Ship ===
    ship: applyAliases({
        id: 'scout-01',
        type: 'ship',

        width: 10.0,
        length: 20.0,
        height: 8.0,

        interactionRadius: 0.050,
        exitOffset: { x: 0.005, y: 0, z: 0 },

        cockpitOffset: { x: 0, y: 0.048, z: 0.015 },

        controls: {
            orbitSpeedH: 0.012,
            orbitSpeedV: 0.024,
            steeringSmoothing: 0.02,
            rotateOnlyWhenMoving: true,
            acceleration: 0.04,
            inertiaDecay: 0.985,
            bankEnabled: true,
            maxBankAngle: 0.15,
            maxPitchAngle: 0.10,
            bankSmoothing: 0.02,
            bankMultiplier: 10.0,
            pitchMultiplier: 5.0,
            tiltDecay: 0.8,
        },

        movement: {
            minAltitude: 0,
            speedPerKmAltitude: 0.5,
            logScaleFactor: 0.35,
            minSpeed: 0.1,
            maxSpeedCap: 6000,
            accelPerKmAltitude: 2.5,
            minAcceleration: 0.04,
            maxAcceleration: 4000,
            boostMultiplier: 5.0,
            gravity: 0.05,
            jumpVelocity: 0,
            groundedThreshold: 0.001,
            atmosphereBoundary: 100,
            useHoverSprings: true,
            springStrength: 10.0,
            springDamping: 2.0,
            hoverHeight: 0.005,
            terrainAlignment: true,
            alignmentThreshold: 0.5,
            alignmentSmoothing: 0.02,
        },

        hud: {
            baseSpeed: 0.3,
            boostSpeed: 0.75,
        },

        spawnOffset: { forward: 0.02, up: 0.01 },
        color: [1.0, 0.0, 0.0, 1.0],
        groundClearance: 0.0005,
        debugLogs: true,
    }),

    // === SECONDARY VEHICLE: Speeder (ground vehicle) ===
    speeder: applyAliases({
        id: 'speeder-01',
        type: 'speeder',

        width: 4.0,
        length: 8.0,
        height: 3.0,

        interactionRadius: 0.030,
        exitOffset: { x: 0.003, y: 0, z: 0 },

        cockpitOffset: { x: 0, y: 0.015, z: 0.005 },

        controls: {
            orbitSpeedH: 0.015,
            orbitSpeedV: 0.020,
            steeringSmoothing: 0.04,
            rotateOnlyWhenMoving: true,
            acceleration: 0.08,
            inertiaDecay: 0.96,
            bankEnabled: true,
            maxBankAngle: 0.25,
            maxPitchAngle: 0.05,
            bankSmoothing: 0.04,
            bankMultiplier: 15.0,
            pitchMultiplier: 3.0,
            tiltDecay: 0.85,
        },

        movement: {
            minAltitude: 0,
            speedPerKmAltitude: 0.2,
            logScaleFactor: 0.2,
            minSpeed: 0.05,
            maxSpeedCap: 500,
            accelPerKmAltitude: 1.0,
            minAcceleration: 0.08,
            maxAcceleration: 200,
            boostMultiplier: 3.0,
            gravity: 0.15,
            jumpVelocity: 0,
            groundedThreshold: 0.001,
            atmosphereBoundary: 100,
            useHoverSprings: true,
            springStrength: 20.0,
            springDamping: 4.0,
            hoverHeight: 0.002,
            terrainAlignment: true,
            alignmentThreshold: 0.3,
            alignmentSmoothing: 0.06,
        },

        hud: {
            baseSpeed: 0.15,
            boostSpeed: 0.45,
        },

        spawnOffset: { forward: 0.01, up: 0.005 },
        color: [0.2, 0.6, 1.0, 1.0],
        groundClearance: 0.0002,
        debugLogs: true,
    }),
};

/**
 * Get a vehicle config by type.
 * @param {string} [type] - Vehicle type key (defaults to DEFAULT_VEHICLE_TYPE)
 * @returns {Object} Vehicle configuration
 */
export const getVehicleConfig = (type = DEFAULT_VEHICLE_TYPE) =>
    VEHICLE_CONFIGS[type] ?? VEHICLE_CONFIGS[DEFAULT_VEHICLE_TYPE];

/**
 * Get all registered vehicle type keys.
 * @returns {string[]}
 */
export const getVehicleTypes = () => Object.keys(VEHICLE_CONFIGS);

// Backward compatibility — default vehicle config
export const VEHICLE_CONFIG = VEHICLE_CONFIGS[DEFAULT_VEHICLE_TYPE];
