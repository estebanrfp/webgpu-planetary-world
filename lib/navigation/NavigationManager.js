import { createAvatarStrategy } from './AvatarStrategy.js';
import { createShipStrategy } from './ShipStrategy.js';

/**
 * createNavigationManager
 * Orchestrates movement strategies and bridges them with the Physics System.
 * @param {Object} physicsSystem - The physics system instance
 * @returns {Object} NavigationManager instance
 */
export const createNavigationManager = (physicsSystem) => {
    const physics = physicsSystem;

    // Initialize strategies — ship strategy is recreated per vehicle config
    const strategies = {
        'avatar': createAvatarStrategy(),
        'ship': createShipStrategy()
    };

    let activeMode = 'avatar';

    /**
     * Switch the current navigation mode
     */
    const setMode = (mode) => {
        if (strategies[mode]) {
            activeMode = mode;
            console.log(`[Navigation] Switched to ${mode} mode`);
        }
    };

    /**
     * Update the active strategy and apply demands to physics system
     */
    const update = (dt, input, cameraVectors, terrainParams, treeCylinders = []) => {
        // 1. Get current physics state (pure data)
        const physicsState = physics.getState(terrainParams);

        // 2. Run the active strategy to get "desires"
        const strategy = strategies[activeMode];
        const desires = strategy.update(dt, input, physicsState, cameraVectors);

        // 3. Apply desires and multiplier to physics system
        const config = strategy.getConfig();
        const speedMultiplier = input.shift ? (config.boostMultiplier || 1.0) : 1.0;

        const physicsResult = physics.update(
            dt,
            desires.moveDir,
            desires.verticalMove,
            desires.jump,
            config,
            speedMultiplier,
            terrainParams,
            treeCylinders
        );

        return {
            ...physicsResult,
            mode: activeMode,
            basis: strategy.getBasis(physicsState)
        };
    };

    /**
     * Unified interaction handler (triggered by 'E')
     */
    const handleInteraction = (vehicleSystem, cameraVectors) => {
        const pos = physics.getPosition();
        const isNear = vehicleSystem.canInteract(pos);
        
        if (isNear) {
            const nowOccupied = vehicleSystem.toggleOccupancy();
            
            // Reset vertical momentum on transition
            physics.velocityY = 0;
            
            if (nowOccupied) {
                setMode('ship');
                physics.syncPosition(vehicleSystem.pos);
            } else {
                setMode('avatar');
                const offset = vehicleSystem.config?.exitOffset ?? { x: 0.005, y: 0, z: 0 };
                physics.syncPosition({
                    x: vehicleSystem.pos.x + offset.x,
                    y: vehicleSystem.pos.y + offset.y,
                    z: vehicleSystem.pos.z + offset.z
                });
            }
            return true;
        } else {
            if (vehicleSystem.active && cameraVectors) {
                vehicleSystem.spawnNear(pos, cameraVectors.forward);
                
                vehicleSystem.isOccupied = true;
                setMode('ship');
                physics.syncPosition(vehicleSystem.pos);
                physics.velocityY = 0;
                
                console.log('[Navigation] Vehicle summoned and auto-entered');
                return true;
            }
            return false;
        }
    };

    /**
     * Rebuild the ship strategy with a new vehicle config.
     * Called when switching vehicle types.
     * @param {Object} vehicleConfig - New vehicle configuration
     */
    const setVehicleConfig = (vehicleConfig) => {
        strategies['ship'] = createShipStrategy(vehicleConfig);
    };

    /**
     * Get the active strategy's basis for rendering
     */
    const getBasis = () => strategies[activeMode].getBasis(physics.getState());

    return {
        setMode,
        update,
        handleInteraction,
        setVehicleConfig,
        getBasis,
        get activeMode() { return activeMode; }
    };
};
