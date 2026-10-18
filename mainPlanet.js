/**
 * WebGPU Planet + Atmospheric Scattering Demo
 *
 * Combines:
 * - Precomputed atmospheric scattering for sky
 * - Orbital Camera Navigation System
 * - Altitude-based speed with Shift boost
 * 
 * Controls:
 * - W/S: Move forward/backward (toward camera view)
 * - A/D: Strafe left/right
 * - Q/E: Move up/down (relative to planet surface)
 * - Shift + WSADQE: Speed boost
 * - Mouse drag: Orbit camera 360° around reference point
 * - Mouse wheel: Zoom in/out
 * - Shift+drag: Move sun position
 */

// Core Infrastructure State
let isUserAuthenticated = false;
let presenceSystem = null; // P2P player presence — created after auth
let _presenceWired = false; // renderer wired to presence once (in the frame loop)
let onAuthSuccess = null;

// Config and Math are kept static for now as they are small and critical
import {
  EARTH_RADIUS,
  EARTH_CENTER,
  STORAGE_KEYS,
  TERRAIN_LIMITS,
  TERRAIN_TEXTURE_CONFIG,
  TERRAIN_GENERATION_PARAMS,
  TERRAIN_SCALES,
  AVATAR_CONFIG,
  CAMERA_CONFIG,
  MOVEMENT_CONFIG,
  ATMOSPHERE_CONFIG,
  SCENE_OBJECTS,
  getVehicleConfig,
  getVehicleTypes,
  WEATHER_PRESETS,
  SKY_PRESETS,
  UI_CONFIG,
  HUD_CONFIG,
  OCEAN_CONFIG,
  RAIN_CONFIG,
  AUDIO_CONFIG,
  detectPerformanceProfile,
  applyPerformanceProfile
} from './lib/config/index.js';
import { terrainShader } from './lib/shaders/terrain.wgsl.js';
import { initBasisTranscoder, loadKTX2Texture } from './lib/textures/index.js';
import { 
  vec3, 
  createPerspectiveMatrix, 
  createReversePerspectiveMatrix,
  createLookAtMatrix, 
  multiplyMatrices 
} from './lib/math/index.js';

// Lazy-loaded systems (Phase 1-4)
import {
  loadSnowSystem,
  loadRainSystem,
  loadVehicleSystem,
  loadCockpitUI,
  loadAuthUI,
  loadProfileUI,
  loadMarketplaceUI,
  loadAtmosphereSystem,
  loadPhysicsSystem,
  loadCameraSystem,
  loadNavigationManager,
  loadUIManagerCore,
  loadControlPanelUI,
  loadNpcSystem,
  loadInputManager,
  loadGamepadManager,
  loadPlanetRenderer,
  loadNotificationManager
} from './lib/loaders/index.js';

import { initWebGPU } from './lib/core/init.js';
import { hasHtmlInCanvas, showRequirementGate } from './lib/core/requirements.js';
import { planetBridge } from './lib/core/PlanetBridge.js';
import './lib/ui/LoadingSpinner.js'; // registers window.appSpinner early
import { createParcelDataManager } from './lib/terrain/parcel-data.js';
import { createParcelPicker } from './lib/terrain/parcel-picking.js';
import { createParcelPreviewBaker } from './lib/terrain/parcel-preview.js';
import { readPositionFromURL, updatePositionURL, getDefaultSpawn } from './lib/core/positionLink.js';
import { resolvePlayerAvatar } from './lib/avatar/avatar-identity.js';
import { SWIM_DEPTH } from './lib/terrain/water.js';
import { createSettingsStore, debounce } from './lib/storage/SettingsStore.js';
import { RPMManager } from './lib/network/index.js';
import { createPresenceSystem } from './lib/network/PresenceSystem.js';
import Logger from './lib/core/Logger.js';
import { createWorldClock } from './lib/systems/WorldClock.js';
import { createWeatherSystem } from './lib/systems/WeatherSystem.js';
import { createCalendarUI } from './lib/ui/CalendarUI.js';

// Local aliases for convenience if needed, or just use vec3.func
const normalize = vec3.normalize;
const cross = vec3.cross;
const dot = vec3.dot;
const subtract = vec3.sub;

const canvas = document.getElementById('webgpu-canvas');
// UI Manager handles control panel and status messages now

// Planet configuration using kilometers as base unit
// EARTH_RADIUS imported from config/index.js

// ============================================================
// ============================================================

// POSITION STATE - The reference point that moves through space
const DEFAULT_POSITION_STATE = {
  // Position in world space (km) - Earth center is at (0, 0, -EARTH_RADIUS)
  x: 0,
  y: 0,
  z: 7500,                      // Start 7,500 km above Earth (Deep Space, LOD 0)
  
  // Velocity (km/s)
  vx: 0,
  vy: 0,
  vz: 0,
};

// CAMERA STATE - Third-person camera following the ship
const DEFAULT_CAMERA_STATE = {
  // Target values (set by mouse input)
  targetYaw: 0,
  targetPitch: 1.5,             // Look down at planet (centered in view)
  targetDistance: CAMERA_CONFIG.defaultDistance,
  
  // Current smoothed values (interpolated toward target)
  orbitYaw: 0,
  orbitPitch: 1.5,              // Start looking at planet
  distance: CAMERA_CONFIG.defaultDistance,
};

// Sun and exposure
const DEFAULT_ENV_STATE = { ...ATMOSPHERE_CONFIG };


// ============================================================================
// ============================================================================
// GLOBAL SYSTEMS
// ============================================================================
let snowSystem = null;
let rainSystem = null;

// ============================================================================
// ============================================================================
// MAIN APPLICATION
// ============================================================================

async function main() {
  if (window._isMainInitializing) {
    console.warn('[Main] Initialization already in progress or completed. Skipping...');
    return;
  }
  window._isMainInitializing = true;

  // Early gate: no WebGPU at all → stop now (definitive, no false positives).
  // The HTML-in-Canvas requirement is checked authoritatively after the device
  // exists (the method only appears on the real GPUQueue instance), so we never
  // wrongly block a browser that does have the flag.
  if (!navigator.gpu) {
    showRequirementGate({ reason: 'webgpu' });
    window._isMainInitializing = false;
    return;
  }

  // --- STORAGE MIGRATION (legacy Nervland keys -> current keys) ---
  const MIGRATIONS = {
      'terrainParams_nervland': STORAGE_KEYS.TERRAIN,
      'avatar_state_nervland': STORAGE_KEYS.AVATAR,
      'vehicle_state_nervland': STORAGE_KEYS.VEHICLE,
      'navigation_mode_nervland': STORAGE_KEYS.NAVIGATION_MODE,
      'readyplayerme-avatar': STORAGE_KEYS.RPM_AVATAR
  };
  
  Object.entries(MIGRATIONS).forEach(([oldKey, newKey]) => {
      const data = localStorage.getItem(oldKey);
      if (data && !localStorage.getItem(newKey)) {
          localStorage.setItem(newKey, data);
          localStorage.removeItem(oldKey);
          Logger.info('Main', `Migrated storage key: ${oldKey} -> ${newKey}`);
      }
  });

  try {
    // 1. Start parallel loading of ALL critical infrastructure
    const [
      createAtmosphereSystem,
      createPhysicsSystem,
      createCameraSystem,
      createNavigationManager,
      createInputManager,
      createGamepadManager,
      createPlanetRenderer,
      createCockpitUI
    ] = await Promise.all([
      loadAtmosphereSystem(),
      loadPhysicsSystem(),
      loadCameraSystem(),
      loadNavigationManager(),
      loadInputManager(),
      loadGamepadManager(),
      loadPlanetRenderer(),
      loadCockpitUI()
    ]);

    // 2. Initialize WebGPU
    const gpuState = await initWebGPU(canvas);
    const { device, context, format } = gpuState;
    window._currentWebGPUDevice = device;

    // Hard requirement: the in-world UI (nameplates, panels, parcel tooltips) is
    // rasterized with the experimental HTML-in-Canvas API. Without it the game
    // would run blind, so gate here — show the modal and stop booting.
    if (!hasHtmlInCanvas(device)) {
      showRequirementGate({ reason: 'html-in-canvas' });
      window._isMainInitializing = false;
      return;
    }

    // Create depth texture
    let depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const atmosphereSystem = createAtmosphereSystem(device, format);
    const worldClock = createWorldClock();
    window.worldClock = worldClock;   // debug: worldClock.setTimeScale(n)
    const weatherSystem = createWeatherSystem(worldClock);
    // Weather is fully autonomous now that the Environment panel is gone — the
    // WeatherSystem always drives targetEnv. The time-warp control lives in the
    // calendar; the sky surprises (special-sky days) are scheduled internally.
    const autonomousWeather = true;
    // Manual rain override (R key): cycles 0 → 1 → 2 → 3 → 0 to let the
    // tester walk through the three precipitation intensities and back to off
    // without spam-toggling the autonomous weather. Each step changes both
    // the precipitation strength and the storm-sky look together.
    //   0 = off (autonomous weather)
    //   1 = drizzle (light rain, partly cloudy, mild dim)
    //   2 = moderate rain (rain preset, no lightning)
    //   3 = storm (heavy rain + lightning, storm sky)
    let forceRainMode = 0;
    let prevRKeyDown = false;
    let forceSnow = false;          // manual override (Ñ key): pins snow on for testing
    let prevNTildeKeyDown = false;  // rising-edge detector so Ñ toggles forceSnow once per press
    let sitToggle = false;          // Sit emote state (X toggles, cancels on move)
    let playerEmote = null;         // active one-shot emote clip ('Greeting' / 'Dance'), or null
    let playerEmoteTimer = 0;       // seconds left of the active emote
    const cockpitUI = createCockpitUI();
    
    // VehicleSystem - lazy loaded on first E key press
    let vehicleSystem = null;
    let isVehicleSystemLoaded = false;
    let activeVehicleType = 'ship';

    /**
     * Lazy-load vehicle system with optional type.
     * @param {string} [vehicleType='ship'] - Vehicle type key from VEHICLE_CONFIGS
     */
    const ensureVehicleSystem = async (vehicleType = activeVehicleType) => {
      const vehicleConfig = getVehicleConfig(vehicleType);
      if (!isVehicleSystemLoaded) {
        const createVehicleSystem = await loadVehicleSystem();
        vehicleSystem = createVehicleSystem(vehicleConfig);
        activeVehicleType = vehicleType;

        // Sync navigation strategy with this vehicle's config
        navigationManager.setVehicleConfig(vehicleConfig);

        // Restore saved state if exists
        if (savedVehicleState && savedVehicleState.pos) {
          vehicleSystem.spawn(savedVehicleState.pos);
          if (savedVehicleState.forward) {
            vehicleSystem.syncOrientation(savedVehicleState.forward, 1.0);
          }
          if (savedVehicleState.isOccupied) {
            vehicleSystem.isOccupied = true;
            navigationManager.setMode('ship');
            physicsSystem.syncPosition(vehicleSystem.pos);
          }
        }
        isVehicleSystemLoaded = true;
        return vehicleSystem;
      }
      return vehicleSystem;
    };

    /**
     * Switch to a different vehicle type (destroys current, creates new).
     * @param {string} vehicleType - Vehicle type key
     */
    const switchVehicle = async (vehicleType) => {
      if (vehicleType === activeVehicleType && vehicleSystem) return vehicleSystem;
      const wasOccupied = vehicleSystem?.isOccupied ?? false;
      const savedPos = vehicleSystem ? { ...vehicleSystem.pos } : null;
      const savedFwd = vehicleSystem ? vehicleSystem.getBasis().forward : null;

      // Destroy old state
      isVehicleSystemLoaded = false;
      vehicleSystem = null;

      // Create new vehicle system
      const vs = await ensureVehicleSystem(vehicleType);

      // Restore position and state
      if (savedPos) {
        vs.spawnNear(savedPos, savedFwd ?? [0, 0, 1]);
        if (wasOccupied) {
          vs.isOccupied = true;
          navigationManager.setMode('ship');
          physicsSystem.syncPosition(vs.pos);
        }
      }

      console.log(`[Vehicle] Switched to ${vehicleType}`);
      return vs;
    };

    // Expose vehicle switching API
    window.switchVehicle = switchVehicle;
    window.getVehicleTypes = getVehicleTypes;

    const { lutSampler, precomputedTextures } = await atmosphereSystem.init();
    const atmosphereUniformBuffer = atmosphereSystem.uniformBuffer;

    // --- STATE PERSISTENCE ---
    const terrainParams = { ...TERRAIN_GENERATION_PARAMS };
    const posState = { ...DEFAULT_POSITION_STATE };
    const camStateInitial = { ...DEFAULT_CAMERA_STATE };
    let initialForward = [0, 0, 1];
    let restoredFromSave = false;

    // Restoring state if authenticated (or just from local storage for now)
    const savedAvatarState = localStorage.getItem(STORAGE_KEYS.AVATAR);
    if (savedAvatarState) {
        try {
            const parsed = JSON.parse(savedAvatarState);
            if (parsed.pos) Object.assign(posState, parsed.pos);
            if (parsed.camera) Object.assign(camStateInitial, parsed.camera);
            if (parsed.forward) initialForward = parsed.forward;
            restoredFromSave = true;
            Logger.info('Main', 'Restored saved avatar/camera state — cinematic intro skipped');
        } catch (e) {
            Logger.warn('Main', 'Failed to parse saved avatar state', e);
        }
    }

    // Shared position deep-link (?p=) takes priority over local storage: open a
    // link and drop straight at that spot/camera. See lib/core/positionLink.js.
    const urlPosition = readPositionFromURL();
    if (urlPosition) {
        Object.assign(posState, urlPosition.pos);
        const { targetYaw, targetPitch, targetDistance } = urlPosition.camera;
        Object.assign(camStateInitial, {
            targetYaw, targetPitch, targetDistance,
            orbitYaw: targetYaw, orbitPitch: targetPitch, distance: targetDistance
        });
        restoredFromSave = true;
        Logger.info('Main', 'Restored position from shared ?p= link');
    }

    let savedVehicleState = null;
    const sVehicle = localStorage.getItem(STORAGE_KEYS.VEHICLE);
    if (sVehicle) {
        try {
            savedVehicleState = JSON.parse(sVehicle);
        } catch (e) {
            Logger.warn('Main', 'Failed to parse saved vehicle state', e);
        }
    }

    // Initialize core engine components
    const physicsSystem = createPhysicsSystem(posState);
    const cameraSystem = createCameraSystem(CAMERA_CONFIG, camStateInitial);
    // Let the orbital camera probe the CPU height grid so it shrinks the distance
    // when the requested position would clip into terrain (e.g. a hill behind the avatar).
    cameraSystem.setTerrainProbe(physicsSystem.getHeightAt);
    const navigationManager = createNavigationManager(physicsSystem);
    const planetRenderer = createPlanetRenderer(device, format);

    let uiManager = null;
    let uiUtils = null;
    let isUIManagerLoading = false;

    const heightSampler = (nx, ny, nz) => {
      const multiplier = getTerrainHeightMultiplier([nx, ny, nz], terrainParams.octaves, terrainParams);
      return Math.max(TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP, Math.min(TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP, multiplier * TERRAIN_SCALES.HEIGHT_SCALE));
    };

    // Initialize Planet Renderer
    await planetRenderer.init(
      terrainShader,
      canvas.width,
      canvas.height,
      precomputedTextures.transmittance.createView(),
      precomputedTextures.scattering.createView(),
      precomputedTextures.irradiance.createView(),
      lutSampler,
      heightSampler,
      atmosphereSystem.cloudTexture.createView(),
      initialForward
    );

    // Link CSM shadow resources
    const ss = planetRenderer.shadowSystem;
    atmosphereSystem.setShadowResources(ss.depthTextureArray, ss.sampler, ss.uniformBuffer);

    // ─── Parcel Map Mode ───
    planetBridge.renderer = planetRenderer;
    planetBridge.camera = cameraSystem;
    planetBridge.device = device;
    planetBridge.format = format;

    const MAP_MODE_DISTANCE = 80; // km AGL — orbital altitude for map view
    let parcelMapMode = false;
    let savedCameraState = null;
    const parcelDataManager = createParcelDataManager(window.db);
    window.parcelDataManager = parcelDataManager;
    const parcelPicker = createParcelPicker();
    let previewBaker = null;
    let parcelHoveredIdx = -1;
    let parcelSelectedIdx = -1;
    let pinnedParcel = null; // Parcel pinned by click — tooltip persists

    /** Check if parcel matches active filter for tooltips/labels (strict type match, no grid lines) */
    const FILTER_TYPE_MAP = { sale: 2, auction: 3, rent: 4, owned: 5 };
    const TYPE_REVERSE = { 2: 'sale', 3: 'auction', 4: 'rent', 5: 'owned' };
    const parcelPassesFilter = (parcel) => {
      if (!parcel || parcel.type <= 1) return false;
      if (parcelDataManager.allActive) return true;
      return parcelDataManager.activeTypes.has(TYPE_REVERSE[parcel.type]);
    };

    // Aurae ambient loop — lazy-loaded the first time the parcel map opens.
    /** @type {HTMLAudioElement | null} */
    let aurae = null;
    const playAurae = () => {
      if (!aurae) {
        aurae = new Audio(AUDIO_CONFIG.sounds.aurae);
        aurae.loop = true;
        aurae.volume = 0.6;
      }
      aurae.currentTime = 0;
      aurae.play().catch(() => {});
    };
    const stopAurae = () => {
      if (aurae && !aurae.paused) aurae.pause();
    };

    /** @param {boolean} enabled */
    const setParcelMapMode = async (enabled) => {
      parcelMapMode = enabled;
      planetBridge.parcelModeActive = enabled;
      console.log(`[Parcel] map mode ${enabled ? 'ON' : 'OFF'}`);
      if (enabled) playAurae(); else stopAurae();

      if (enabled) {
        const pos = physicsSystem.getPosition();
        // Save camera + avatar position + rendering state
        savedCameraState = {
          yaw: cameraSystem.targetYaw,
          pitch: cameraSystem.targetPitch,
          distance: cameraSystem.targetDistance,
          pos: { x: pos.x, y: pos.y, z: pos.z },
          volumetricShadows: env.volumetricShadowsEnabled,
          cloudShadows: env.cloudShadowsEnabled,
        };
        // Move avatar to MAP_MODE_DISTANCE km AGL along planet normal
        const dx = pos.x - EARTH_CENTER[0];
        const dy = pos.y - EARTH_CENTER[1];
        const dz = pos.z - EARTH_CENTER[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const targetDist = EARTH_RADIUS + MAP_MODE_DISTANCE;
        const scale = targetDist / dist;
        physicsSystem.syncPosition({
          x: EARTH_CENTER[0] + dx * scale,
          y: EARTH_CENTER[1] + dy * scale,
          z: EARTH_CENTER[2] + dz * scale,
        });
        // Camera: look straight down (nadir view over current parcel).
        // Snap the whole orbital state — target + current — so the switch
        // is instant, with no swing/turn animation when entering map mode.
        cameraSystem.targetPitch = 1.5;
        cameraSystem.orbitPitch = 1.5;
        cameraSystem.orbitYaw = cameraSystem.targetYaw;
        cameraSystem.distance = cameraSystem.targetDistance;
        // Disable CSM shadows + volumetric god rays (not visible at 320 km, saves ~20% GPU)
        planetRenderer.setShadowsEnabled(false);
        env.volumetricShadowsEnabled = false;
        env.cloudShadowsEnabled = false;
        planetRenderer.setParcelMode(true);
        const gpuData = parcelDataManager.buildGPUBuffer();
        planetRenderer.updateParcelData(gpuData);
      } else {
        // Restore camera + avatar position + rendering state
        if (savedCameraState) {
          cameraSystem.targetYaw = savedCameraState.yaw;
          cameraSystem.targetPitch = savedCameraState.pitch;
          cameraSystem.targetDistance = savedCameraState.distance;
          // Snap the orbital state too so the switch is instant — no
          // swing back from the top-down map view to the avatar view.
          cameraSystem.orbitYaw = savedCameraState.yaw;
          cameraSystem.orbitPitch = savedCameraState.pitch;
          cameraSystem.distance = savedCameraState.distance;
          if (savedCameraState.pos) {
            physicsSystem.syncPosition(savedCameraState.pos);
          }
          env.volumetricShadowsEnabled = savedCameraState.volumetricShadows ?? true;
          env.cloudShadowsEnabled = savedCameraState.cloudShadows ?? true;
          savedCameraState = null;
        }
        planetRenderer.setShadowsEnabled(true);
        parcelHoveredIdx = -1;
        parcelSelectedIdx = -1;
        pinnedParcel = null;
        planetRenderer.setParcelMode(false);
        planetRenderer.hideParcelTooltip();
        planetRenderer.hideParcelLabels();
        planetRenderer.hideAvatarMarker();
      }
    };

    // Parcel (Map) mode mirrors the marketplace: ON iff the overlay is open AND
    // the Map ("land") tab is active. Deriving from the DOM rather than trusting
    // each enter/exit event makes it resilient to the marketplace emitting
    // spurious or out-of-order events in the production build (bundled main app
    // + raw-loaded marketplace can double-fire view changes).
    const reconcileParcelMode = () => {
      const overlayOpen = !!document.querySelector('.mockup-marketplace-overlay.open');
      const landActive = !!document.querySelector('.mp-nav-tab[data-view="land"].active');
      const want = overlayOpen && landActive;
      if (want !== parcelMapMode) setParcelMapMode(want);
    };
    planetBridge.on('enterParcelMode', reconcileParcelMode);
    planetBridge.on('exitParcelMode', reconcileParcelMode);
    /** Collect filtered parcels and send to label system */
    const updateParcelLabels = () => {
      const parcels = parcelDataManager.allParcels.filter(p => parcelPassesFilter(p));
      const toWorldFn = (face, lx, ly) => parcelPicker.parcelToWorld(face, lx, ly, EARTH_CENTER);
      planetRenderer.updateParcelLabels(parcels, lastAbsoluteCameraPos ?? [0, 0, 0], EARTH_CENTER, toWorldFn);
    };

    planetBridge.on('parcelFilterChanged', (e) => {
      const activeTypes = e.detail?.activeTypes ?? ['sale', 'auction', 'rent', 'owned'];
      parcelDataManager.setActiveTypes(activeTypes);
      const gpuData = parcelDataManager.buildGPUBuffer();
      planetRenderer.updateParcelData(gpuData);

      // Unpin tooltip if pinned parcel no longer passes the new filter
      if (pinnedParcel && !parcelPassesFilter(pinnedParcel)) {
        pinnedParcel = null;
        planetRenderer.hideParcelTooltip();
      }

      // Labels: always show for all non-empty parcels
      if (lastAbsoluteCameraPos) updateParcelLabels();
    });

    // Route window-level filter events from non-module scripts (app-ui.js)
    window.addEventListener('parcelFilterChanged', (e) => {
      planetBridge.emit('parcelFilterChanged', e.detail);
    });

    window.addEventListener('landDataChanged', (e) => {
      if (!parcelMapMode) return;
      if (e.detail?.id && e.detail?.value) {
        parcelDataManager.updateParcel(e.detail.id, e.detail.value);
      } else if (e.detail?.removed && e.detail?.face != null) {
        parcelDataManager.clearParcelAt(e.detail.face, e.detail.localX, e.detail.localY);
      }
      const gpuData = parcelDataManager.buildGPUBuffer();
      planetRenderer.updateParcelData(gpuData);
      if (lastAbsoluteCameraPos) updateParcelLabels();
    });
    
    // Subscribe to RPM avatar changes
    RPMManager.onAvatarChanged(async (newUrl) => {
      if (planetRenderer.characterSystem) {
        await planetRenderer.characterSystem.reload(newUrl);
      }
    });
// ============================================================================
// STATE INITIALIZATION
// ============================================================================

    // Vehicle state restoration is handled in ensureVehicleSystem()
    // If ship mode was saved, load vehicle immediately
    const savedMode = localStorage.getItem(STORAGE_KEYS.NAVIGATION_MODE);
    if (savedMode === 'ship' && savedVehicleState) {
        // Load vehicle immediately if user was in ship mode, restore vehicle type
        await ensureVehicleSystem(savedVehicleState.vehicleType ?? 'ship');
    } else if (savedMode) {
        navigationManager.setMode(savedMode);
    }
    
    // --- ENVIRONMENT STATE PERSISTENCE (IndexedDB) ---
    const settingsStore = await createSettingsStore();
    const savedEnv = await settingsStore.loadWithDefault('environment', DEFAULT_ENV_STATE);
    const env = { ...DEFAULT_ENV_STATE, ...savedEnv };
    // Exposure is now a fixed engine-wide value (ATMOSPHERE_CONFIG.exposure) and is
    // no longer user-adjustable — discard any value persisted from the old UI slider.
    env.exposure = ATMOSPHERE_CONFIG.exposure;
    // Initialize ocean sub-object from saved state or OCEAN_CONFIG defaults
    env.ocean = { ...OCEAN_CONFIG, ...(env.ocean ?? {}) };
    delete env.ocean.reflectionsEnabled; // Compile-time only, not a runtime param
    const targetEnv = { ...env };
    const activePreset = env.weatherPreset || 'normal';

    // Detect + apply the performance profile (default / low) before the render
    // loop starts. Fully automatic; settings live in
    // lib/config/performanceProfiles.js. URL override `?profile=low` to test the
    // reduced-quality preset on this machine.
    const perfProfileKey = await detectPerformanceProfile();
    applyPerformanceProfile(perfProfileKey, { planetRenderer, env });

    // Debounced save functions
    const saveEnvironmentToStorage = async (envData) => {
        await settingsStore.save('environment', envData);
    };
    const saveEnvironment = debounce(() => saveEnvironmentToStorage(env), 500);

    const saveTerrainToStorage = async (params) => {
        await settingsStore.save('terrain_params', params);
    };
    const saveTerrain = debounce(() => saveTerrainToStorage(terrainParams), 500);
    
    let time = 0;
    let cloudTime = 0;
    
    // Weather transition state. When autonomousWeather is on the seasonal
    // WeatherSystem decides the actual target each frame, so we start at 0
    // to avoid a 5-second "ghost snowfall" right after launch when the
    // user's saved env had snowEnabled=true from a previous /Ñ test.
    let rainIntensityCurrent = autonomousWeather ? 0 : (env.rainIntensity || 0);
    let snowIntensityCurrent = (autonomousWeather || !env.snowEnabled) ? 0.0 : 1.0;
    const WEATHER_TRANSITION_RATE = 0.02; // Very smooth: ~2% per frame approach
    const WEATHER_TRANSITION_SPEED = WEATHER_TRANSITION_RATE; // Temporary alias for debugging/backward compatibility

    // World-anchored rain accumulator. The shader pins drops to a tangent-world
    // position using (baseX − offset) mod 2R, so we need the AVATAR's tangent
    // displacement in metres. Tracked from `pos` (physicsSystem) — not from
    // `cam.position`, because the third-person camera orbits around the avatar,
    // and using camera deltas would make drops slide every time the player
    // rotates the view without actually walking.
    let rainAvatarOffsetX_m = 0;
    let rainAvatarOffsetZ_m = 0;
    let rainPrevAvatarPos = null;

    // Beach ambient — trees + breeze loop that fades in at sea-level
    // altitudes. Lazy-created on the first frame the avatar dips near the
    // shore so the asset isn't fetched until it's needed.
    let beachAudio = null;
    
    // Preparation for weather systems (provided to lazy loaders)
    const weatherSystemsContext = {
      device,
      format,
      atmosphereUniformBuffer,
      planetRenderer,
      get gridOutputBuffer() { return planetRenderer.gridOutputBuffer; }
    };

    let isSnowSystemLoaded = false;
    let isRainSystemLoaded = false;
    let isSnowSystemLoading = false;
    let isRainSystemLoading = false;

    // Lazy weather system initialization
    const ensureWeatherSystems = async (type) => {
      const ctx = weatherSystemsContext;
      
      // Initialize snow system on demand. The loading guard is set before the
      // first await so per-frame calls don't kick off duplicate loads.
      if (type === 'snow' && !isSnowSystemLoaded && !isSnowSystemLoading) {
        isSnowSystemLoading = true;
        const createSnowSystem = await loadSnowSystem();
        snowSystem = createSnowSystem(ctx.device, ctx.format);
        await snowSystem.init(ctx.atmosphereUniformBuffer);
        if (ctx.gridOutputBuffer) {
          snowSystem.setGridBuffer(ctx.gridOutputBuffer, ctx.atmosphereUniformBuffer);
        }
        isSnowSystemLoaded = true;
      }

      // Initialize rain system on demand (same loading guard).
      if (type === 'rain' && !isRainSystemLoaded && !isRainSystemLoading) {
        isRainSystemLoading = true;
        const createRainSystem = await loadRainSystem();
        rainSystem = createRainSystem(ctx.device, ctx.format);
        await rainSystem.init(ctx.atmosphereUniformBuffer, ctx.planetRenderer.characterSystem?.audioManager);
        if (ctx.gridOutputBuffer) {
          rainSystem.setGridBuffer(ctx.gridOutputBuffer, ctx.atmosphereUniformBuffer);
        }
        isRainSystemLoaded = true;
      }
    };
    
    // Display mode state (0=Ortho/Normal, 1=Normal debug, 2=Elevation debug)
    let displayMode = 0;
    let terrainDebugMode = 0;
    let gridModeActive = false;
    let debugGridFlags = UI_CONFIG.DEFAULT_DEBUG_FLAGS;
    // Per-pass bypass bits for perf measurement. Encoded into earthCenter.w (see uiConfig.BYPASS_FLAGS).
    let bypassFlags = 0;
    if (terrainParams.showNoise) debugGridFlags |= UI_CONFIG.DEBUG_FLAGS.NOISE; // Sync with param state
    
    // Atmosphere toggle
    let atmosphereEnabled = true;

    // Initialize Managers
    const inputManager = createInputManager();
    const gamepadManager = createGamepadManager(inputManager);

    // --- UI LAZY LOADING (INDEPENDENT PATHS) ---
    // State flags for each UI component
    let isUIManagerCoreLoaded = false;
    let isControlPanelLoaded = false;
    let npcSystem = null;

    // Shared UI utilities (loaded with control panel)
    let controlPanelUtils = null;

    // Ensure UIManager core is loaded (shared by all UIs)
    const ensureUIManagerCore = async () => {
        if (!isUIManagerCoreLoaded) {
            const { createUIManager } = await loadUIManagerCore();
            
            // Initialize UIManager with callbacks
            uiManager = createUIManager(env, {
                onCloudCoverageChange: (val) => { env.cloudCoverage = val; targetEnv.cloudCoverage = val; saveEnvironment(); },
                onCloudSpeedChange: (val) => { env.cloudSpeed = val; targetEnv.cloudSpeed = val; saveEnvironment(); },
                onRainIntensityChange: (val) => { targetEnv.rainIntensity = val; env.rainIntensity = val; saveEnvironment(); },
                onCloudLayer1Change: (val) => { env.cloudLayer1Opacity = val; targetEnv.cloudLayer1Opacity = val; saveEnvironment(); },
                onCloudL1RChange: (val) => { env.cloudLayer1R = val; targetEnv.cloudLayer1R = val; saveEnvironment(); },
                onCloudL1GChange: (val) => { env.cloudLayer1G = val; targetEnv.cloudLayer1G = val; saveEnvironment(); },
                onCloudL1BChange: (val) => { env.cloudLayer1B = val; targetEnv.cloudLayer1B = val; saveEnvironment(); },
                onCloudLayer2Change: (val) => { env.cloudLayer2Opacity = val; targetEnv.cloudLayer2Opacity = val; saveEnvironment(); },
                onCloudL2RChange: (val) => { env.cloudLayer2R = val; targetEnv.cloudLayer2R = val; saveEnvironment(); },
                onCloudL2GChange: (val) => { env.cloudLayer2G = val; targetEnv.cloudLayer2G = val; saveEnvironment(); },
                onCloudL2BChange: (val) => { env.cloudLayer2B = val; targetEnv.cloudLayer2B = val; saveEnvironment(); },
                onCloudLayer3Change: (val) => { env.cloudLayer3Opacity = val; targetEnv.cloudLayer3Opacity = val; saveEnvironment(); },
                onCloudL3RChange: (val) => { env.cloudLayer3R = val; targetEnv.cloudLayer3R = val; saveEnvironment(); },
                onCloudL3GChange: (val) => { env.cloudLayer3G = val; targetEnv.cloudLayer3G = val; saveEnvironment(); },
                onCloudL3BChange: (val) => { env.cloudLayer3B = val; targetEnv.cloudLayer3B = val; saveEnvironment(); },
                onSkySaturationChange: (val) => { env.skySaturation = val; targetEnv.skySaturation = val; saveEnvironment(); },
                onSkyVibranceChange: (val) => { env.skyVibrance = val; targetEnv.skyVibrance = val; saveEnvironment(); },
                onAuroraIntensityChange: (val) => { env.auroraIntensity = val; targetEnv.auroraIntensity = val; saveEnvironment(); },
                onAuroraSpeedChange: (val) => { env.auroraSpeed = val; targetEnv.auroraSpeed = val; saveEnvironment(); },
                onAuroraAltitudeChange: (val) => { env.auroraAltitude = val; targetEnv.auroraAltitude = val; saveEnvironment(); },
                onAuroraBaseRChange: (val) => { env.auroraBaseR = val; targetEnv.auroraBaseR = val; saveEnvironment(); },
                onAuroraBaseGChange: (val) => { env.auroraBaseG = val; targetEnv.auroraBaseG = val; saveEnvironment(); },
                onAuroraBaseBChange: (val) => { env.auroraBaseB = val; targetEnv.auroraBaseB = val; saveEnvironment(); },
                onAuroraTopRChange: (val) => { env.auroraTopR = val; targetEnv.auroraTopR = val; saveEnvironment(); },
                onAuroraTopGChange: (val) => { env.auroraTopG = val; targetEnv.auroraTopG = val; saveEnvironment(); },
                onAuroraTopBChange: (val) => { env.auroraTopB = val; targetEnv.auroraTopB = val; saveEnvironment(); },
                onSkyTintRChange: (val) => { env.skyTintR = val; targetEnv.skyTintR = val; saveEnvironment(); },
                onSkyTintGChange: (val) => { env.skyTintG = val; targetEnv.skyTintG = val; saveEnvironment(); },
                onSkyTintBChange: (val) => { env.skyTintB = val; targetEnv.skyTintB = val; saveEnvironment(); },
                onWeatherPresetChange: (presetName) => {
                    const preset = WEATHER_PRESETS[presetName];
                    if (preset) {
                        Object.assign(targetEnv, preset);
                        env.weatherPreset = presetName;
                        if (preset.snowEnabled !== undefined) env.snowEnabled = preset.snowEnabled;
                        if (preset.stormEnabled !== undefined) env.stormEnabled = preset.stormEnabled;
                        if (preset.rainIntensity !== undefined) env.rainIntensity = preset.rainIntensity;
                        uiManager.syncSliders(targetEnv);
                        uiManager.setActiveWeatherPreset(presetName);
                        settingsStore.save('environment', { ...env, ...preset, weatherPreset: presetName });
                    }
                },
                onSkyPresetChange: (presetName) => {
                   const preset = SKY_PRESETS[presetName];
                   if (preset) {
                       Object.assign(targetEnv, preset);
                       if (uiManager.syncStyleSliders) uiManager.syncStyleSliders(targetEnv);
                       settingsStore.save('environment', { ...env, ...targetEnv, skyPreset: presetName });
                   }
                },
                onDisplayModeChange: (mode) => { 
                    displayMode = mode; 
                    terrainDebugMode = mode;
                    gridModeActive = false;
                    planetRenderer.setDebugMode(mode);
                    planetRenderer.setWireframe(false);
                },
                onGridModeToggle: () => { 
                    gridModeActive = true; 
                    displayMode = 5;
                    planetRenderer.setWireframe(true);
                    planetRenderer.setDebugMode(0);
                },
                onDebugFlagChange: (flagBit, enabled) => {
                    if (enabled) debugGridFlags |= flagBit;
                    else debugGridFlags &= ~flagBit;
                    if (flagBit === 32) {
                        terrainParams.showNoise = enabled;
                        planetRenderer.updateTerrainParams(terrainParams);
                    }
                },
                onAtmosphereChange: (enabled) => { atmosphereEnabled = enabled; },
                onScatterBypassChange: (bypassed) => { planetRenderer.setScatterBypassed(bypassed); },
                onBypassTexturesChange: (on) => {
                    bypassFlags = on ? (bypassFlags | 1) : (bypassFlags & ~1);
                    planetRenderer.setBypassFlags(bypassFlags);
                },
                onBypassLightingChange: (on) => {
                    bypassFlags = on ? (bypassFlags | 2) : (bypassFlags & ~2);
                    planetRenderer.setBypassFlags(bypassFlags);
                },
                onBypassShadowsChange: (on) => {
                    bypassFlags = on ? (bypassFlags | 4) : (bypassFlags & ~4);
                    planetRenderer.setBypassFlags(bypassFlags);
                },
                onCloudsChange: (enabled) => { env.cloudsEnabled = enabled; saveEnvironment(); },
                onCloudShadowsChange: (enabled) => { env.cloudShadowsEnabled = enabled; saveEnvironment(); },
                onSnowChange: (enabled) => { env.snowEnabled = enabled; targetEnv.snowEnabled = enabled; saveEnvironment(); },
                onNpcsToggle: (enabled) => { if (npcSystem) npcSystem.config.enabled = enabled; },
                onVolumetricShadowsChange: (enabled) => {
                    env.volumetricShadowsEnabled = enabled;
                    saveEnvironment();
                },
                onGenerateRequest: () => {
                    const random = (min, max) => min + Math.random() * (max - min);
                    const randomParams = {
                        warpFactor: random(0.1, 0.5),
                        mountMaskFreq: random(1.0, 3.0),
                        baseAmplitude: random(0.2, 1.0),
                        baseFrequency: random(1.5, 6.0),
                        persistence: random(0.3, 0.7),
                        lacunarity: random(1.8, 2.5),
                        contrastExp: random(1.0, 2.0),
                        contrastScale: random(1.5, 4.0),
                        seaLevelOffset: random(-0.3, 0.3),
                        ridgeDetail: random(0.5, 2.0),
                        abyssDetail: random(0.5, 2.0),
                        detailScale: random(0.5, 1.5),
                        octaves: random(12, 16),
                        warpScale: random(0.5, 2.5),
                        warpStrength2: random(0.0, 0.4),
                        peakSoftness: random(0.0, 0.3),
                        terraceAmount: Math.random() > 0.5 ? random(2, 12) : 0,
                        terraceSmooth: random(0.1, 0.8),
                        mountainSharpness: random(0.8, 2.5),
                        shelfWidth: random(0.1, 0.9),
                        beachWidth: random(0.01, 0.15),
                        snowLine: random(0.4, 0.9),
                        sandSharpness: random(0.05, 0.5)
                    };
                    Object.assign(terrainParams, randomParams);
                    planetRenderer.updateTerrainParams(terrainParams);
                    uiManager.syncTerrainSliders(terrainParams);
                    saveTerrain();
                },
                onResetTerrain: () => {
                   Object.assign(terrainParams, TERRAIN_GENERATION_PARAMS);
                   planetRenderer.updateTerrainParams(terrainParams);
                   uiManager.syncTerrainSliders(terrainParams);
                   saveTerrain();
                },
                onResetShape: () => {
                  const defaults = TERRAIN_GENERATION_PARAMS;
                  ['warpFactor', 'mountMaskFreq', 'baseFrequency', 'baseAmplitude', 'persistence', 'lacunarity', 'contrastExp', 'contrastScale', 'seaLevelOffset'].forEach(k => terrainParams[k] = defaults[k]);
                  planetRenderer.updateTerrainParams(terrainParams);
                  uiManager.syncTerrainSliders(terrainParams);
                },
                onResetBiomes: () => {
                  const defaults = TERRAIN_GENERATION_PARAMS;
                  ['grassCoverage', 'sandCoverage', 'snowCoverage', 'rockCoverage', 'colGrass', 'colForest', 'colRock', 'colSnow', 'colSand', 'colGround', 'colShallowSea', 'colDeepSea', 'globalMoisture', 'beachWidth', 'snowLine', 'sandSharpness', 'rockThreshold', 'grassThreshold'].forEach(k => terrainParams[k] = defaults[k]);
                  planetRenderer.updateTerrainParams(terrainParams);
                  uiManager.syncTerrainSliders(terrainParams);
                },
                onResetLandforms: () => {
                  const defaults = TERRAIN_GENERATION_PARAMS;
                  ['terraceAmount', 'terraceSmooth', 'mountainSharpness', 'shelfWidth', 'octaves', 'warpScale', 'ridgeDetail', 'abyssDetail', 'warpStrength2', 'peakSoftness', 'detailScale'].forEach(k => terrainParams[k] = defaults[k]);
                  planetRenderer.updateTerrainParams(terrainParams);
                  uiManager.syncTerrainSliders(terrainParams);
                },
                onTerrainParamsChange: (newParams) => {
                    Object.assign(terrainParams, newParams);
                    planetRenderer.updateTerrainParams(terrainParams);
                    saveTerrain();
                },
                onGetTerrainParams: () => terrainParams
            });

            uiManager.initPositionListeners(physicsSystem.getPosition());
            isUIManagerCoreLoaded = true;
        }
        return uiManager;
    };

    // MAIN UI (H key) - Loads Control Panel independently
    const toggleMainUI = async () => {
        if (!isControlPanelLoaded) {
            const { injectControlPanel, toggleControlPanel } = await loadControlPanelUI();
            controlPanelUtils = { injectControlPanel, toggleControlPanel };
            injectControlPanel();
            isControlPanelLoaded = true;
            
            // Also ensure UIManager is ready for stats display
            await ensureUIManagerCore();
            uiManager?.syncSliders(env);
            uiManager?.syncTerrainSliders(terrainParams);
            uiManager?.setActiveWeatherPreset(activePreset);
        }
        
        // Toggle visibility
        controlPanelUtils?.toggleControlPanel();
    };

    // TERRAIN UI (T key) - Loads Terrain panel independently

    // Environment is fully autonomous (WeatherSystem) — no manual panel. Sky
    // tonalities, weather and the day cycle run on their own; the time-warp
    // control lives in the calendar.

    // NPCs are part of the world by default: they spawn spread across the
    // quadrant where the avatar lands (the NpcSystem seeds a uniform disk around
    // the landing anchor). Toggled from the Debug panel (NPCs checkbox) — there
    // is no dedicated NPC UI.
    const ensureNpcSystem = async () => {
        if (npcSystem) return npcSystem;
        const createNpcSystem = await loadNpcSystem();
        npcSystem = createNpcSystem();
        npcSystem.config.enabled = true;
        // NPCs read the EXACT ground from the GPU physics grid (shared with the player) to decide
        // swim/walk — getHeightAt returns the baked height (km) or null outside the grid coverage.
        npcSystem.setGroundSampler(physicsSystem.getHeightAt);
        planetRenderer.setNpcSystem(npcSystem);
        return npcSystem;
    };
    ensureNpcSystem();

    // DEBUG UI (G key) - Loads Debug panel independently
    const toggleDebug = async () => {
        // Ensure core UIManager (for callbacks/sync)
        await ensureUIManagerCore();
        
        // Load Debug UI if not loaded
        const { loadDebugUI } = await import('./lib/loaders/index.js');
        const { injectDebugPanel } = await loadDebugUI();
        injectDebugPanel();

        // Wire the debug controls and sync current state.
        uiManager?.rebindDebugListeners?.();
        uiManager?.syncSliders(env);
        uiManager?.syncTerrainSliders(terrainParams);
        uiManager?.updateStats(currentFps, planetRenderer.tileCount, planetRenderer.mslKm, planetRenderer.aglKm, planetRenderer.zone, planetRenderer.lod);

        // Show the panel in the 3D world (HTML-in-Canvas billboard beside the player).
        planetRenderer.togglePanel(document.getElementById('debug-panel'));
    };

    // Initial Load of Terrain from IndexedDB (Migrate from localStorage if exists)
    const savedTerrain = await settingsStore.loadWithDefault('terrain_params', TERRAIN_GENERATION_PARAMS);
    Object.assign(terrainParams, savedTerrain);
    
    // Migration from old localStorage
    const legacyTerrain = localStorage.getItem(STORAGE_KEYS.TERRAIN);
    if (legacyTerrain) {
        try {
            const parsed = JSON.parse(legacyTerrain);
            Object.assign(terrainParams, parsed);
            saveTerrain();
            localStorage.removeItem(STORAGE_KEYS.TERRAIN);
        } catch(e) {}
    }

    // Sync Renderer with final terrain params
    planetRenderer.updateTerrainParams(terrainParams);

    // Auto-bake visual terrain heightmap on startup if Hybrid mode is active
    if (terrainParams.useBake > 0.5) {
        planetRenderer.bakeTerrainHeightmap();
    }

    let currentMaxLevel = 0;
    let lastTime = performance.now();
    let frameCount = 0;
    // Cached at the end of each physics frame so the next frame can decide
    // whether to skip the grid rebake. Without this we'd burn ~10 bakes/s
    // every time the avatar takes off (jetpack / jump-fly) before the grid
    // even matters again.
    let _lastIsGrounded = true;
    let currentFps = 0;
    // Persistent FPS overlay (bottom-right). Independent of any panel.
    let _fpsOverlay = document.getElementById('fps-overlay');
    if (!_fpsOverlay) {
      _fpsOverlay = document.createElement('div');
      _fpsOverlay.id = 'fps-overlay';
      _fpsOverlay.textContent = '-- fps';
      document.body.appendChild(_fpsOverlay);
    }
    let fpsStartTime = performance.now();
    // Render loop
    // Shared state for parcel picking (updated each frame)
    let lastViewProjection = null;
    let lastAvatarSphereData = null;
    let lastEarthCenterOffset = null;
    let lastAbsoluteCameraPos = null;
    let prevCameraPos = null;

    // Parcel coordinate overlay (top-right)
    const REGION_NAMES = ['Frontera', 'Oriente', 'Posterior', 'Occidente', 'Boreal', 'Austral'];
    const parcelCoordEl = document.createElement('div');
    parcelCoordEl.id = 'parcel-coord-overlay';
    parcelCoordEl.textContent = 'F0:0,0 Frontera';
    document.body.appendChild(parcelCoordEl);
    let lastParcelFace = -1, lastParcelX = -1, lastParcelY = -1;

    // Force-rain test badge — a persistent HUD chip shown only while the R
    // override is active, so the rain test state is always visible.
    const forceRainBadgeEl = document.createElement('div');
    forceRainBadgeEl.id = 'weather-force-badge';
    forceRainBadgeEl.textContent = 'RAIN FORCED ON — press R to disable';
    document.body.appendChild(forceRainBadgeEl);

    // Force-snow test badge — same idea, shown while Ñ override is active.
    const forceSnowBadgeEl = document.createElement('div');
    forceSnowBadgeEl.id = 'weather-force-badge-snow';
    forceSnowBadgeEl.className = 'weather-force-badge';
    forceSnowBadgeEl.textContent = 'SNOW FORCED ON — press Ñ to disable';
    document.body.appendChild(forceSnowBadgeEl);

    // Calendar HUD — Stardew-style date widget; clicking it opens the calendar
    // as an in-world panel that faces the camera (the avatar hides while it is
    // open), trailing the view with a little inertia.
    const calendarUI = createCalendarUI(worldClock, weatherSystem, () => {
      planetRenderer.togglePanel(document.getElementById('calendar-panel'), 'camera');
    });

    const render = () => {
      const now = performance.now();
      const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
      
      // Lazy-load the rain/snow particle systems the first time the weather
      // actually calls for them (non-blocking; guarded against re-entry).
      if (targetEnv.rainIntensity > 0.001) ensureWeatherSystems('rain');
      if (targetEnv.snowEnabled) ensureWeatherSystems('snow');

      // === PRIMARY POSITION STATE ===
      const pos = physicsSystem.getPosition();
      
      // Update physics and state

      // Broadcast this player's presence to P2P peers (throttled internally):
      // absolute position + facing + current animation + voxel avatar identity.
      if (presenceSystem) {
        // Wire the renderer once, here, where planetRenderer is in scope (it isn't
        // in the auth callback that creates presenceSystem).
        if (!_presenceWired) { planetRenderer.setPresenceSystem(presenceSystem); _presenceWired = true; }
        const cs = planetRenderer.characterSystem;
        presenceSystem.broadcast(pos, cs?.forward, cs?.animationSystem?.currentAnimation?.name, AVATAR_CONFIG.voxelParams);
      }

      // Define entities for HUD & Nameplates — local player + remote P2P peers
      const entities = [
        {
          name: "Player", // The player's nameplate
          x: pos.x, y: pos.y, z: pos.z,
          health: 1.0, energy: 0.9, state: 0, tint: "#00d4ff"
        },
        ...(presenceSystem?.getRemoteEntities() ?? [])
      ];
      
      frameCount++;
      
      // Calculate FPS as average over 30 frames
      if (frameCount % 30 === 0) {
        const elapsed = (now - fpsStartTime) / 1000; // seconds for 30 frames
        currentFps = Math.round(30 / elapsed);
        fpsStartTime = now;
        if (_fpsOverlay) _fpsOverlay.textContent = `${currentFps} fps`;
      }
      
      lastTime = now;
      // The Lighting "Time scale" slider fast-forwards the world clock, the
      // clouds and the weather. It deliberately does NOT touch `time`: surface
      // animations (ocean waves, raindrops, snowflakes) keep their natural speed.
      const scaledDelta = deltaTime * worldClock.timeScale;
      time = (time + deltaTime) % 600.0;           // Wrap every 10min — keeps Float32 precision for GPU UVs
      cloudTime = (cloudTime + scaledDelta * env.cloudSpeed) % 600.0;

      // Astronomical clock: the sun follows its real diurnal arc and the moon
      // its own orbit, derived from the planet rotation/orbit and the avatar's
      // latitude. Replaces the manual azimuth-only day cycle.
      const avatarNormalRel = [
        pos.x - EARTH_CENTER[0],
        pos.y - EARTH_CENTER[1],
        pos.z - EARTH_CENTER[2],
      ];
      worldClock.update(avatarNormalRel);
      env.sunDir = worldClock.sunDir;
      env.moonDir = worldClock.moonDir;
      env.moonPhase = worldClock.moonPhase;
      calendarUI.update(avatarNormalRel);

      // Autonomous weather — drives targetEnv from the local season and a
      // drifting noise field; the existing env→targetEnv smoothing fades it in.
      if (autonomousWeather) weatherSystem.update(avatarNormalRel, targetEnv);
      // Manual rain override — three precipitation tiers cycled by R. Each
      // tier writes a complete environment (clouds, sky tint, exposure, rain
      // intensity, storm flag) so the look matches the strength: drizzle
      // stays bright with thin clouds, moderate rain greys the sky, the
      // storm tier brings the full dark-blue thunderhead + lightning. The
      // env↔targetEnv lerp does the smooth fade between tiers (~3 s).
      if (forceRainMode === 1) {
          // DRIZZLE — light rain but visibly raining (bumped from 0.25 to 0.5
          // because 0.25 dropped the particle count to ~6 k and looked empty).
          // Partly cloudy, mild gray, sky still bright.
          Object.assign(targetEnv, WEATHER_PRESETS.normal, {
              exposure: 1.6,
              skyTintR: 0.92, skyTintG: 0.94, skyTintB: 0.98,
              skySaturation: 0.9,
              skyVibrance: 0.0,
              cloudCoverage: 0.55,
          });
          targetEnv.rainIntensity = 0.5;
          targetEnv.snowEnabled = false;
          targetEnv.stormEnabled = false;
      } else if (forceRainMode === 2) {
          // MODERATE RAIN — full cloud cover, grey-blue sky, no lightning.
          Object.assign(targetEnv, WEATHER_PRESETS.rain, {
              exposure: 1.4,
              skyTintR: 0.80, skyTintG: 0.85, skyTintB: 0.93,
              skySaturation: 0.8,
              skyVibrance: 0.0,
          });
          targetEnv.rainIntensity = 0.7;
          targetEnv.snowEnabled = false;
          targetEnv.stormEnabled = false;
      } else if (forceRainMode === 3) {
          // STORM — heavy rain, dark steel-blue sky, lightning on. Uses the
          // user-tuned palette (low-sat / high-vibrance / full cloud lid).
          Object.assign(targetEnv, WEATHER_PRESETS.storm, {
              exposure: 1.3,
              skyTintR: 0.72, skyTintG: 0.78, skyTintB: 0.9,
              skySaturation: 0.25,
              skyVibrance: 1.0,
              cloudCoverage: 1.0,
              cloudLayer1Opacity: 1.0,
              cloudLayer2Opacity: 1.0,
              cloudLayer3Opacity: 1.0,
          });
          targetEnv.rainIntensity = 0.9;
          targetEnv.snowEnabled = false;
          targetEnv.stormEnabled = true;
      }
      // Manual snow override (Ñ) — mirrors force-rain but for the snow preset.
      // Mutually exclusive: turning this on switches off forceRain so the two
      // pinned overrides never fight each other.
      if (forceSnow) {
          Object.assign(targetEnv, WEATHER_PRESETS.snow, {
              // Slightly muted, cooler sky to match heavy snowfall — the snow
              // preset uses NEUTRAL_SKY which is too bright/warm for a blizzard.
              exposure: 1.5,
              skyTintR: 0.82, skyTintG: 0.86, skyTintB: 0.95,
              skySaturation: 0.6,
              skyVibrance: 0.0,
          });
          targetEnv.snowEnabled = true;
          targetEnv.rainIntensity = 0;
      }

      // --- AUTHENTICATION & CINEMATIC CAMERA ---
      // Skip the cinematic when state was restored from a previous session —
      // it would overwrite the restored camera and drag the avatar into orbit.
      if (!isUserAuthenticated && !restoredFromSave) {
          // Slow cinematic rotation around the planet while waiting for login
          cameraSystem.targetYaw += deltaTime * 0.05;
          cameraSystem.targetPitch = 1.6; // Slightly looking down at the globe
          cameraSystem.targetDistance = CAMERA_CONFIG.maxDistance * 0.7;
          
          // Ensure we are in high orbit for the cinematic view
          const cinematicAltitude = EARTH_RADIUS + 6250;
          if (pos.z < cinematicAltitude) {
              // Smoothly transition to high orbit if starting from ground
              const alpha = 0.05; 
              pos.z = pos.z * (1 - alpha) + cinematicAltitude * alpha;
          }
      }

      const allKeys = inputManager.getKeys();
      
      // --- UI TOGGLE (HOTKEYS H, G, N) ---
      if (allKeys.hTriggered) {
          toggleMainUI();
      }
      if (allKeys.gTriggered) {
          toggleDebug();
      }
      // Force rain (R) cycles 4 modes; force snow (Ñ) toggles on/off. Each
      // flip uses a rising-edge detector so it triggers exactly once per
      // physical press. Rain and snow are mutually exclusive — entering
      // either clears the other.
      if (allKeys.r && !prevRKeyDown) {
          forceRainMode = (forceRainMode + 1) % 4;
          if (forceRainMode > 0) forceSnow = false;
      }
      prevRKeyDown = allKeys.r;
      if (allKeys['ñ'] && !prevNTildeKeyDown) {
          forceSnow = !forceSnow;
          if (forceSnow) forceRainMode = 0;
      }
      prevNTildeKeyDown = allKeys['ñ'];
      const rainBadgeLabels = ['',
          'DRIZZLE — press R for rain',
          'RAIN — press R for storm',
          'STORM — press R to disable'];
      forceRainBadgeEl.classList.toggle('visible', forceRainMode > 0);
      if (forceRainMode > 0) forceRainBadgeEl.textContent = rainBadgeLabels[forceRainMode];
      forceSnowBadgeEl.classList.toggle('visible', forceSnow);

      // Filter movement keys based on authentication
      const keys = isUserAuthenticated ? allKeys : {};

      // === CAMERA & PHYSICS SYNC ===
      const headOffset = AVATAR_CONFIG.headHeight * AVATAR_CONFIG.scale; 
      const camState = cameraSystem.getOrbitalState(pos, { headOffset });
      
      const cameraVectors = {
        forward: camState.forward,
        right: camState.right,
        up: camState.meshUp
      };

      // Feed the camera basis to in-world panels: `up` keeps the billboard
      // upright; `forward` lets the panel place itself centred in front of the
      // camera at a distance scaled to its own size.
      planetRenderer.setCameraBasis(camState.up, camState.forward);

      // Update Physics Grid — the skip applies ONLY while the avatar is
      // both airborne (or in the vehicle) AND clearly high in the sky.
      // The moment seaLevelAlt drops below 2 km we let the bake run so
      // the grid is already populated when feet touch ground — without
      // this the avatar would clip through the terrain on landing while
      // waiting for the first bake.
      const _seaLevelAltKm = Math.sqrt(
        (pos.x - EARTH_CENTER[0]) ** 2 +
        (pos.y - EARTH_CENTER[1]) ** 2 +
        (pos.z - EARTH_CENTER[2]) ** 2
      ) - EARTH_RADIUS;
      const _airborne = (vehicleSystem && vehicleSystem.isOccupied) || !_lastIsGrounded;
      const _skipBake = _airborne && _seaLevelAltKm > 2.0;
      physicsSystem.requestGPUHeightGrid(planetRenderer, terrainParams, _skipBake);

      // --- Get camera vectors for navigation ---
      let navCameraVectors = cameraVectors;
      if (isUserAuthenticated && vehicleSystem && vehicleSystem.isOccupied) {
          const vBasisPre = vehicleSystem.getBasis();
          const vConfig = vehicleSystem.config;
          const interiorCam = cameraSystem.getInteriorState(pos, vConfig.cockpitOffset, vBasisPre);
          navCameraVectors = {
              forward: interiorCam.forward,
              right: interiorCam.right,
              up: interiorCam.up
          };
      }

      // --- PARCEL MAP MODE: flatten W/S to tangent plane + boost speed ---
      let navKeys = keys;
      let finalNavCameraVectors = navCameraVectors;
      if (parcelMapMode) {
        const up = navCameraVectors.up;
        const fwd = navCameraVectors.forward;
        const dot = fwd[0] * up[0] + fwd[1] * up[1] + fwd[2] * up[2];
        const flat = [fwd[0] - dot * up[0], fwd[1] - dot * up[1], fwd[2] - dot * up[2]];
        const len = Math.sqrt(flat[0] ** 2 + flat[1] ** 2 + flat[2] ** 2);
        if (len > 1e-6) { flat[0] /= len; flat[1] /= len; flat[2] /= len; }
        finalNavCameraVectors = { ...navCameraVectors, forward: flat };
        navKeys = { ...keys, shift: true, q: false, c: false };
      }

      // --- MODULAR NAVIGATION UPDATE ---
      // Compute tree collision cylinders (CPU-side, uses GPU height grid)
      const treeCylinders = planetRenderer.updateTreeCollision(physicsSystem.getHeightAt);

      // Update active mode and apply desires to physics
      // Note: If not authenticated, navigationManager.update will just be a pass-through
      const physicsResult = navigationManager.update(deltaTime, navKeys, finalNavCameraVectors, terrainParams, treeCylinders);

      // Cache grounded state for next frame's grid-skip decision.
      _lastIsGrounded = !!physicsResult.isGrounded;

      // In map mode: kill gravity and lock altitude
      if (parcelMapMode) {
        physicsSystem.velocityY = 0;
        const dx = physicsResult.pos.x - EARTH_CENTER[0];
        const dy = physicsResult.pos.y - EARTH_CENTER[1];
        const dz = physicsResult.pos.z - EARTH_CENTER[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const target = EARTH_RADIUS + MAP_MODE_DISTANCE;
        if (Math.abs(dist - target) > 0.01) {
          const s = target / dist;
          physicsResult.pos.x = EARTH_CENTER[0] + dx * s;
          physicsResult.pos.y = EARTH_CENTER[1] + dy * s;
          physicsResult.pos.z = EARTH_CENTER[2] + dz * s;
          physicsSystem.syncPosition(physicsResult.pos);
        }
      }

      // Update global pos reference
      pos.x = physicsResult.pos.x;
      pos.y = physicsResult.pos.y;
      pos.z = physicsResult.pos.z;

      // Handle interactions (Entry/Exit/Summon)
      if (keys.interactTriggered) {
          // Lazy load vehicle system on first E press. The first press
          // used to only summon the (now-invisible) ship — now we also
          // enter flight mode immediately so a single E activates flight
          // instead of requiring two presses.
          if (!vehicleSystem) {
              ensureVehicleSystem().then(vs => {
                  if (vs) {
                      vs.spawnNear(physicsSystem.pos, cameraVectors.forward);
                      navigationManager.handleInteraction(vs, navCameraVectors);
                  }
              });
          } else {
              const modeSwitched = navigationManager.handleInteraction(vehicleSystem, navCameraVectors);
          if (modeSwitched) {
              // Immediately save vehicle state on exit
              if (!vehicleSystem.isOccupied) {
                  const vBasis = vehicleSystem.getBasis();
                  const vState = {
                      pos: vehicleSystem.pos,
                      forward: vBasis.forward
                  };
                   localStorage.setItem(STORAGE_KEYS.VEHICLE, JSON.stringify(vState));

                  // Stop ship entry sound on exit
                  if (planetRenderer.characterSystem) {
                      planetRenderer.characterSystem.stopAudio('shipEntry');
                      planetRenderer.characterSystem.stopAudio('shipFlight');
                  }
              } else {
                  // Entering ship: Reset camera to face forward (0,0)
                  cameraSystem.targetYaw = 0;
                  cameraSystem.targetPitch = 0;
                  // Snap immediately to avoid weird interpolation from previous walking angle
                  cameraSystem.orbitYaw = 0;
                  cameraSystem.orbitPitch = 0;
                  
                  // Trigger ship entry sound
                   if (planetRenderer.characterSystem) {
                       planetRenderer.characterSystem.playAudio('shipEntry');
                       planetRenderer.characterSystem.playAudio('shipFlight', { loop: true });
                   }
              }
          }
      }
      } // Close else block for vehicleSystem loaded case

      // Sync vehicle position FROM physics (ship movement is handled by NavigationManager)
      if (vehicleSystem && vehicleSystem.isOccupied) {
          // Update vehicle visual position to match physics
          vehicleSystem.syncPosition(physicsSystem.pos);
          
          // Smoothly rotate vehicle model toward camera direction
          const controls = vehicleSystem.config.controls || {};
          const movesForward = keys.w || keys.s;
          const movesVertical = keys.q || keys.c;
          const shouldRotate = controls.rotateOnlyWhenMoving ? (movesForward || movesVertical) : true;
          
          if (shouldRotate) {
              const steeringLerp = controls.steeringSmoothing || 0.02;
              const allowTilt = movesForward; // Only tilt when moving forward/backward
              vehicleSystem.syncOrientation(navCameraVectors.forward, steeringLerp, allowTilt);
          }
          
          // Update banking (visual tilt when turning)
          vehicleSystem.updateBanking(deltaTime);
          
          // Sync terrain alignment (visual tilt on slopes)
          vehicleSystem.syncTerrainNormal(physicsResult.terrainNormal, physicsResult.terrainAltitude);
      }

      // Update camera with latest physics state
      cameraSystem.update(deltaTime, keys, physicsSystem.pos, physicsResult.isGrounded);

      const { seaLevelAltitude, terrainAltitude } = physicsResult;

      // Beach ambient — fades in when the avatar's terrain altitude is near
      // sea level. terrainAltitude is in km. Full volume at 0-3 m above water,
      // fading to silent by 25 m. We lazy-create the Audio element on the
      // first frame inside the window so the asset isn't fetched in space.
      const altMeters = terrainAltitude * 1000;
      const beachFade = Math.max(0, Math.min(1, (25 - altMeters) / 22)) * (altMeters >= -1 ? 1 : 0);
      if (beachFade > 0.01) {
        if (!beachAudio) {
          beachAudio = new Audio(AUDIO_CONFIG.sounds.beach);
          beachAudio.loop = true;
          beachAudio.volume = 0;
        }
        if (beachAudio.paused) beachAudio.play().catch(() => {});
        beachAudio.volume = Math.min(1.0, beachFade * 0.35);
      } else if (beachAudio && !beachAudio.paused) {
        beachAudio.pause();
      }

      // Avatar visibility: hidden when marketplace is open or while in
      // flight mode (E key) — the avatar mesh itself is hidden inside the
      // ship, so its nameplate / HUD bars must also vanish.
      const marketplaceOpen = document.getElementById('mockup-marketplace-overlay')?.classList.contains('open') ?? false;
      const inFlightMode = !!(vehicleSystem && vehicleSystem.isOccupied);
      const visibility = (marketplaceOpen || inFlightMode) ? 0.0 : 1.0;

      // Nameplate-only altitude fade: the head HUD dissolves as the avatar lifts
      // off the ground (flying with Q/E). The avatar mesh itself stays visible —
      // only entities[0].visibility (the nameplate) gets this factor.
      const alt = physicsResult.terrainAltitude ?? 0;
      const { altitudeFadeStart: aStart, altitudeFadeEnd: aEnd } = HUD_CONFIG;
      const altFade = alt <= aStart
        ? 1.0
        : Math.max(0, 1.0 - (alt - aStart) / (aEnd - aStart));

      if (entities.length > 0) {
        entities[0].visibility = visibility * altFade;
      }
      
      const vBasis = vehicleSystem ? vehicleSystem.getBasis() : null;

      if (vehicleSystem && vehicleSystem.isOccupied) {
          cockpitUI.show();
          const currentSpeed = keys.shift ? vehicleSystem.config.boostSpeed : vehicleSystem.config.baseSpeed;
          cockpitUI.update(keys.w || keys.s || keys.a || keys.d ? currentSpeed : 0);
      } else {
          cockpitUI.hide();
      }

      // Sit emote (X toggles) — auto-cancels on movement or leaving the ground.
      if (keys.xTriggered) sitToggle = !sitToggle;
      if (physicsResult.isMoving || !physicsResult.isGrounded) sitToggle = false;

      // One-shot emotes: 1 = wave, 2 = dance. They auto-cancel on movement / leaving the ground,
      // and are seen by P2P peers because presence broadcasts the played animation name.
      if (keys.greetTriggered) { playerEmote = 'Greeting'; playerEmoteTimer = 2.5; }
      else if (keys.danceTriggered) { playerEmote = 'Dance'; playerEmoteTimer = 6.0; }
      if (playerEmoteTimer > 0) {
        playerEmoteTimer -= deltaTime;
        if (physicsResult.isMoving || !physicsResult.isGrounded) playerEmoteTimer = 0;
      }
      // In water — read the BAKED terrain height under the avatar (the GPU physics-grid "truth":
      // exactly where the avatar steps, same code as the visible terrain, no octave/float-origin
      // mismatch — see docs/GPU_PHYSICS_GRID.md). terrainHeight = seaLevelAltitude − terrainAltitude
      // isolates the seabed elevation; sea level is elevation 0, so water depth = −terrainHeight.
      const terrainHeight = seaLevelAltitude - terrainAltitude;
      const inWater = terrainHeight < -SWIM_DEPTH;   // swim once the seabed is ~waist-deep below sea level

      const movementState = {
        isMoving: physicsResult.isMoving,
        isSprinting: keys.shift,
        isJumping: physicsResult.isJumping,
        // Flying = airborne while actively thrusting up (Q) or down (C) — the real
        // avatar flight keys (AvatarStrategy). Don't exclude isFalling: descending
        // with C makes velocityY negative (= "falling"), but we still want the hover pose.
        isFlying: !physicsResult.isGrounded && !physicsResult.isJumping && (keys.q || keys.c),
        isFalling: physicsResult.isFalling,
        isGrounded: physicsResult.isGrounded,
        inWater,
        // Seabed below sea level → in the water at all (wading or swimming). Suppresses the airborne
        // Fall pose while wading through shallow water over an uneven seabed.
        touchingWater: terrainHeight < 0,
        sit: sitToggle,
        emote: playerEmoteTimer > 0 ? playerEmote : null,   // 'Greeting' / 'Dance' (1/2 keys)
        desiredMoveDir: physicsResult.moveDir,
        cameraVectors: cameraVectors,
        visibility: visibility
      };
      
      const cam = (vehicleSystem && vehicleSystem.isOccupied && vBasis) ?
                  cameraSystem.getInteriorState(pos, vehicleSystem.config.cockpitOffset, vBasis) :
                  camState;
      
      const cameraPos = cam.position;

      // === MATRIX CALCULATIONS (Floating Origin) ===
      const fovY = (50 / 180) * Math.PI;
      const aspect = canvas.width / canvas.height;
      const near = Math.max(0.0001, Math.min(0.001, cameraSystem.distance * 0.01));
      const far = 100000.0;
      
      const lookTarget = cam.lookAt;
      const upVec = cam.up;
      
      // Use Reverse-Z perspective for maximum precision at planetary scales
      const projection = createReversePerspectiveMatrix(fovY, aspect, near, far);
      
      // FLOATING ORIGIN: Create view matrix with camera at origin [0, 0, 0]
      const lookRelative = [
        lookTarget[0] - cameraPos[0],
        lookTarget[1] - cameraPos[1],
        lookTarget[2] - cameraPos[2]
      ];
      const view = createLookAtMatrix([0, 0, 0], lookRelative, upVec);
      const viewProjection = multiplyMatrices(projection, view);

      // Store for parcel picking
      lastViewProjection = viewProjection;

      // Rotation-only view matrix for atmosphere and static objects
      const viewFromOrigin = createLookAtMatrix([0, 0, 0], cam.forward, cam.up);
      const viewProjAtOrigin = multiplyMatrices(projection, viewFromOrigin);

      // --- Planet & Entity Updates ---
      if (planetRenderer.isInitialized) {
        // Optimization: Entirely skip update/render if invisible. Flight mode
        // hides the avatar body, giving an effective first-person cockpit view
        // (the ship is a HUD simulation — there is no vehicle model).
        if (visibility > 0.0 && (!vehicleSystem || !vehicleSystem.isOccupied)) {
          planetRenderer.updateCharacter(deltaTime, movementState);
          
          if (planetRenderer.characterSystem) {
            planetRenderer.characterSystem.updateSounds(
              movementState, 
              cameraPos, 
              pos, 
              terrainAltitude, 
              seaLevelAltitude, 
              cam
            );
          }
        } else {
          // Tell the sound system to go into idle/stop state when not active
          if (planetRenderer.characterSystem) {
            planetRenderer.characterSystem.updateSounds(
                { isMoving: false, isFlying: false, isJumping: false, isGrounded: true },
                cameraPos,
                pos,
                terrainAltitude,
                seaLevelAltitude,
                cam
            );
          }
          planetRenderer.characterVisibility = 0.0;
        }

      }

      // Update planet terrain quadtree and instance buffer
      const cameraRelativeToEarth = [
        cameraPos[0] - EARTH_CENTER[0],
        cameraPos[1] - EARTH_CENTER[1],
        cameraPos[2] - EARTH_CENTER[2]
      ];
      
      planetRenderer.update(cameraRelativeToEarth, cam.forward, terrainAltitude);
      planetRenderer.setDebugFlags(debugGridFlags); // Sync flags (skirts, etc.)
      
      // Get planet stats for display and atmosphere logic
      const planetStats = planetRenderer.getStats();

      // --- Smooth Interpolation Engine for Environment ---
      const lerp = (a, b, t) => a + (b - a) * t;
      // Scales with the time scale so accelerated time fast-forwards the env→
      // targetEnv weather/colour transitions, keeping the visible weather in
      // step with the (accelerated) target the calendar forecasts from.
      const LERP_FACTOR = Math.min(1, 0.025 * worldClock.timeScale);
      let needsUISync = false;
      
      // Calculate current altitude scale for weather effects
      // 1.0 at ground level, increasing as camera goes up
      const currentCamAlt = Math.max(0, cameraPos[1] - terrainAltitude);
      const altitudeScale = Math.max(1.0, Math.log10(currentCamAlt + 1) * 2.0);
      
      const paramsToLerp = [
          'cloudCoverage', 'cloudSpeed',
          'cloudLayer1Opacity', 'cloudLayer2Opacity', 'cloudLayer3Opacity',
          'cloudLayer1R', 'cloudLayer1G', 'cloudLayer1B',
          'cloudLayer2R', 'cloudLayer2G', 'cloudLayer2B',
          'cloudLayer3R', 'cloudLayer3G', 'cloudLayer3B',
          'rainIntensity',
          // Sky stylization (for color preset transitions)
          'skySaturation', 'skyVibrance', 'skyTintR', 'skyTintG', 'skyTintB'
      ];
      
      paramsToLerp.forEach(param => {
          if (Math.abs(env[param] - targetEnv[param]) > 0.0001) {
              env[param] = lerp(env[param], targetEnv[param], LERP_FACTOR);
              needsUISync = true;
          }
      });

      // Booleans don't interpolate — copy them straight so autonomous snow and
      // storms reach the renderer (the lerp loop above is numeric-only).
      env.snowEnabled = targetEnv.snowEnabled;
      env.stormEnabled = targetEnv.stormEnabled;

      // 1. Calculate Grid Basis for grounded rain (16x16)
      let gridData = null;
      if (planetRenderer.gridExists) {
        const gcPos = planetRenderer.gridCenterPos; // avatarNormal(3) + distToCenter(1)
        const gBasis = planetRenderer.gridBasis;   // right(3) + 0 + forward(3) + 0
        
        const avatarNormal = [gcPos[0], gcPos[1], gcPos[2]];
        const distToCenter = gcPos[3];
        const gridRightWorld = [gBasis[0], gBasis[1], gBasis[2]];
        const gridForwardWorld = [gBasis[4], gBasis[5], gBasis[6]];
        const gridUpWorld = avatarNormal;

        const gridCenterWorld = [
          EARTH_CENTER[0] + avatarNormal[0] * distToCenter,
          EARTH_CENTER[1] + avatarNormal[1] * distToCenter,
          EARTH_CENTER[2] + avatarNormal[2] * distToCenter
        ];

        // Transform to View Space
        const relCenter = [
            gridCenterWorld[0] - cam.position[0],
            gridCenterWorld[1] - cam.position[1],
            gridCenterWorld[2] - cam.position[2]
        ];

        const transformToView = (v) => [
            v[0] * cam.right[0] + v[1] * cam.right[1] + v[2] * cam.right[2],
            v[0] * cam.up[0] + v[1] * cam.up[1] + v[2] * cam.up[2],
            v[0] * cam.backward[0] + v[1] * cam.backward[1] + v[2] * cam.backward[2]
        ];

        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const camOffsetWorld = [-relCenter[0], -relCenter[1], -relCenter[2]];

        // World-anchored rain: accumulate the AVATAR's tangent displacement in
        // metres, modulo 2R so float precision stays tight. Avatar position
        // (pos) — not cam.position — because the third-person camera orbits
        // around the avatar; using camera deltas would slide the drops every
        // time the player rotates the view without actually walking.
        //
        // Damping (< 1) makes the slide feel less aggressive than a 1:1 world-
        // anchor. Strict physics says drops slide at exactly the avatar's
        // tangent speed — but the brain reads fall+slide as a single diagonal
        // motion vector, so a literal 1:1 slide makes the rain feel "shot
        // sideways" instead of falling. 0.1 keeps just enough cinta-caminadora
        // cue (drops drift past) without compromising the perception of fall.
        const WORLD_ANCHOR_DAMPING = 0.1;
        if (rainPrevAvatarPos) {
          const dx_km = pos.x - rainPrevAvatarPos.x;
          const dy_km = pos.y - rainPrevAvatarPos.y;
          const dz_km = pos.z - rainPrevAvatarPos.z;
          const deltaTangentX_m = (dx_km * gridRightWorld[0] + dy_km * gridRightWorld[1] + dz_km * gridRightWorld[2]) * 1000 * WORLD_ANCHOR_DAMPING;
          const deltaTangentZ_m = (dx_km * gridForwardWorld[0] + dy_km * gridForwardWorld[1] + dz_km * gridForwardWorld[2]) * 1000 * WORLD_ANCHOR_DAMPING;
          const AREA_SIZE_M = 2 * RAIN_CONFIG.baseSpawnRadius;
          rainAvatarOffsetX_m = ((rainAvatarOffsetX_m + deltaTangentX_m) % AREA_SIZE_M + AREA_SIZE_M) % AREA_SIZE_M;
          rainAvatarOffsetZ_m = ((rainAvatarOffsetZ_m + deltaTangentZ_m) % AREA_SIZE_M + AREA_SIZE_M) % AREA_SIZE_M;
        }
        rainPrevAvatarPos = { x: pos.x, y: pos.y, z: pos.z };

        gridData = {
          centerView: [...transformToView(relCenter), distToCenter - EARTH_RADIUS], // [x,y,z, altitude]
          rightView: [...transformToView(gridRightWorld), 0],
          forwardView: [...transformToView(gridForwardWorld), 0],
          upView: [...transformToView(gridUpWorld), 0],
          localCamOffset: [dot(camOffsetWorld, gridRightWorld), dot(camOffsetWorld, gridForwardWorld)],
          rainCamOffsetMeters: [rainAvatarOffsetX_m, rainAvatarOffsetZ_m]
        };
      }

      // 2. Update Rain System — the single update() call per frame; the render
      // pass below only draws. Uses the smoothed intensity (one-frame-old here)
      // so the lightning state machine sees the same value the renderer shows.
      const rainResult = rainSystem ? rainSystem.update(
        time,
        rainIntensityCurrent,
        env.stormEnabled,
        altitudeScale,
        gridData,
        cameraRelativeToEarth
      ) : { lightningFlash: 0, lightningPos: [0, 0, 0] };
      const lightningFlash = rainResult.lightningFlash;
      const lightningPos = rainResult.lightningPos || [0, 0, 0];

      // Update atmosphere uniforms using CURRENT frame's maxLod
      const atmosphereData = atmosphereSystem.update(
        canvas, 
        cam, 
        env, 
        terrainDebugMode, 
        debugGridFlags, 
        planetStats.maxLod, 
        cam.meshPosition, 
        cloudTime,
        physicsResult.terrainAltitude,
        [rainIntensityCurrent, 0, 0, 0],
        [lightningFlash, 0, 0, 0],
        lightningPos,
        bypassFlags
      );
      const sunDirAtmo = atmosphereData.sunDir;
      const avatarSphereData = atmosphereData.avatarSphereData;
      lastAvatarSphereData = avatarSphereData;
      const cloudOpacities = atmosphereData.cloudOpacities;

      // Moon direction comes straight from the WorldClock — anti-solar in
      // the avatar's local frame, so the night shadows stay aligned with
      // the visible moon. Brightness scales with the lunar phase, but never to zero —
      // the moon is always overhead at night (moonDir = −sunDir), so keep a faint floor
      // (~0.028 at new moon) so it's always visible and still casts a soft shadow.
      const moonDirData = [env.moonDir[0], env.moonDir[1], env.moonDir[2], 0.08 * (0.35 + 0.65 * env.moonPhase)];
      
      // Earth center offset for GPU precision
      const earthCenterOffset = [
        EARTH_CENTER[0] - cameraPos[0],
        EARTH_CENTER[1] - cameraPos[1],
        EARTH_CENTER[2] - cameraPos[2]
      ];
      lastEarthCenterOffset = earthCenterOffset;
      lastAbsoluteCameraPos = cameraPos;

      // Pinned parcel: update tooltip position every frame so it stays anchored in 3D
      if (parcelMapMode && pinnedParcel) {
        const absWorldPos = parcelPicker.parcelToWorld(
          pinnedParcel.face, pinnedParcel.localX, pinnedParcel.localY, EARTH_CENTER
        );
        planetRenderer.updateParcelTooltip(pinnedParcel, absWorldPos, cameraPos, EARTH_CENTER);
      } else if (parcelMapMode && prevCameraPos) {
        // No pin — hide tooltip when camera moves
        const cdx = cameraPos[0] - prevCameraPos[0];
        const cdy = cameraPos[1] - prevCameraPos[1];
        const cdz = cameraPos[2] - prevCameraPos[2];
        if (cdx * cdx + cdy * cdy + cdz * cdz > 0.0001) {
          planetRenderer.hideParcelTooltip();
        }
      }
      prevCameraPos = cameraPos;

      // Update parcel label positions every frame (camera moves)
      if (parcelMapMode) {
        updateParcelLabels();
        // Avatar position marker — show saved ground position as glowing cyan dot
        if (savedCameraState?.pos) {
          const sp = savedCameraState.pos;
          planetRenderer.updateAvatarMarker([sp.x, sp.y, sp.z], cameraPos);
        }
      }

      const artisticParams = {
        skySaturation: env.skySaturation,
        skyVibrance: env.skyVibrance,
        skyTintR: env.skyTintR,
        skyTintG: env.skyTintG,
        skyTintB: env.skyTintB
      };
      
      const commonDepthView = depthTexture.createView();

      // Update weather transitions (smooth fade in/out)
      const targetRain = env.rainIntensity || 0;
      const targetSnow = env.snowEnabled ? 1.0 : 0.0;
      
      // Approach the target; the rate scales with the time scale so accelerated
      // time fast-forwards rain/snow transitions instead of letting them lag
      // behind the (accelerated) target the calendar forecasts from.
      const weatherRate = Math.min(1, WEATHER_TRANSITION_RATE * worldClock.timeScale);
      if (Math.abs(targetRain - rainIntensityCurrent) > 0.0001) {
          rainIntensityCurrent += (targetRain - rainIntensityCurrent) * weatherRate;
      } else {
          rainIntensityCurrent = targetRain;
      }
      // Manual override (R) — pin the intensity hard so no lerp, weather pass
      // or transition can fade it; the rain stays full until R is pressed again.
      // Snow is also pinned to zero so it cannot bleed back during the test.
      // Three intensities matching the three R-cycle tiers.
      if (forceRainMode > 0) {
          const forceRainIntensities = [0, 0.5, 0.7, 0.9];
          rainIntensityCurrent = forceRainIntensities[forceRainMode];
          snowIntensityCurrent = 0;
      }

      if (Math.abs(targetSnow - snowIntensityCurrent) > 0.0001) {
          snowIntensityCurrent += (targetSnow - snowIntensityCurrent) * weatherRate;
      } else {
          snowIntensityCurrent = targetSnow;
      }
      // Manual override (Ñ): we do NOT hard-pin snowIntensityCurrent (the way
      // forceRain pins rain to 0.9). Snow accumulates as a uniform terrain
      // tint, so a hard pin makes the ground snap to white instantly — looks
      // unnatural. Instead the forceSnow block above just sets targetEnv,
      // and the lerp here grows snowIntensityCurrent toward 1 over ~3.7 s.
      // We still zero rainIntensityCurrent so the rain particles cut out
      // cleanly when snow takes over.
      if (forceSnow) {
          rainIntensityCurrent = 0;
      }
      // Parcel map mode silences weather effects so the calm Aurae loop plays alone.
      if (parcelMapMode) {
          rainIntensityCurrent = 0;
          snowIntensityCurrent = 0;
      }
      // Atmosphere boundary fade — past ~5 km above the planet surface
      // we're in the upper atmosphere; by 8 km we're effectively in space
      // where rain/snow physically can't form. Uses the real planetary
      // altitude (distance to Earth center − radius) instead of the local
      // `cameraPos.y - terrainAltitude`, which only matches at the poles.
      const camDistToCenter = Math.sqrt(
          earthCenterOffset[0] ** 2 + earthCenterOffset[1] ** 2 + earthCenterOffset[2] ** 2
      );
      const camAltOverSurface = camDistToCenter - EARTH_RADIUS;
      if (camAltOverSurface > 5.0) {
          const atmFactor = Math.max(0, 1 - (camAltOverSurface - 5.0) / 3.0);
          rainIntensityCurrent *= atmFactor;
          snowIntensityCurrent *= atmFactor;
      }
      planetRenderer.updateUniforms(
        viewProjAtOrigin,
        [0, 0, 0],
        sunDirAtmo,
        earthCenterOffset,
        env.exposure,
        planetStats.maxLod,
        cloudOpacities,
        avatarSphereData,
        moonDirData,
        0.02, // Fixed fog intensity (hardcoded in shader)
        env.cloudCoverage,
        cloudTime,
        artisticParams,
        rainIntensityCurrent,
        lightningFlash,
        lightningPos,
        time,
        env.ocean,
        snowIntensityCurrent
      );
      
      // Update parcel overlay uniforms when in map mode
      if (parcelMapMode) {
        // Camera altitude = distance from camera to planet surface (approx)
        const ecLen = Math.sqrt(
          earthCenterOffset[0] ** 2 + earthCenterOffset[1] ** 2 + earthCenterOffset[2] ** 2
        );
        const cameraAltitude = ecLen - EARTH_RADIUS;
        planetRenderer.updateParcelUniforms({
          hoveredIdx: parcelHoveredIdx,
          selectedIdx: parcelSelectedIdx,
          cameraAltitude,
        });
      }

      // Update UI with planet stats
      currentMaxLevel = planetStats.maxLod;

      // Update debug info (MSL & AGL) and UI
      let zoneText = 'Transition';
      let zoneColor = '#6f6';
      if (seaLevelAltitude < MOVEMENT_CONFIG.lowOrbitAltitude) {
          zoneText = 'Atmosphere';
          zoneColor = '#6af';
      } else if (seaLevelAltitude > MOVEMENT_CONFIG.highOrbitAltitude) {
          zoneText = 'Deep Space';
          zoneColor = '#a6f';
      }

      // Calculate culled count for display
      const totalMeshes = planetStats.culling.total || planetStats.visibleQuads;
      const renderedMeshes = planetStats.culling.rendered;
      const culledMeshes = totalMeshes - renderedMeshes;
      
      if (uiManager) {
          uiManager.updateStats(
              currentFps,
              { total: totalMeshes, culled: culledMeshes, rendered: renderedMeshes },
              seaLevelAltitude,
              terrainAltitude, 
              { text: zoneText, color: zoneColor },
              currentMaxLevel
          );
          
          uiManager.updatePositionInfo(pos.x, pos.y, pos.z);
      }

      // Update parcel coordinate overlay (avatar position → cube-sphere face)
      const pDir = [
        pos.x - EARTH_CENTER[0],
        pos.y - EARTH_CENTER[1],
        pos.z - EARTH_CENTER[2]
      ];
      const parcelCoord = parcelPicker.pointToFace(pDir);
      if (parcelCoord && (parcelCoord.face !== lastParcelFace || parcelCoord.localX !== lastParcelX || parcelCoord.localY !== lastParcelY)) {
        lastParcelFace = parcelCoord.face;
        lastParcelX = parcelCoord.localX;
        lastParcelY = parcelCoord.localY;
        parcelCoordEl.textContent = `F${parcelCoord.face}:${parcelCoord.localX},${parcelCoord.localY}`;

        // Highlight overlay when standing on own parcel
        const currentParcel = parcelDataManager?.getParcelAt(parcelCoord.face, parcelCoord.localX, parcelCoord.localY);
        parcelCoordEl.classList.toggle('owned', currentParcel?.type === 5);
      }

      // Debug: log stats periodically (disabled to reduce console spam)

      // Begin render pass
      const commandEncoder = device.createCommandEncoder();
      
      // Guard against WebGPU context loss (can happen during Vite HMR)
      let textureView;
      try {
        const currentTexture = context.getCurrentTexture();
        if (!currentTexture) {
          console.warn('WebGPU context lost, skipping frame');
          return;
        }
        textureView = currentTexture.createView();
      } catch (e) {
        console.warn('WebGPU texture error:', e.message);
        return;
      }

      const backgroundPassDescriptor = {
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: commonDepthView,
          depthClearValue: 0.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      };

      const backgroundPass = commandEncoder.beginRenderPass(backgroundPassDescriptor);

      // Render atmosphere FIRST (sky background, sun, stars)
      // Only render when enabled and not in debug overlay mode (Grid or Quads)
      const debugOverlaysActive = gridModeActive || (debugGridFlags & 1) !== 0;
      if (!debugOverlaysActive) {
        atmosphereSystem.render(backgroundPass, atmosphereEnabled);
      }
      backgroundPass.end();

      // Render geometric terrain SECOND (over atmosphere)
      // Note: PlanetRenderer handles its own render pass and clears depth by default
      if (planetRenderer.isInitialized) {
        planetRenderer.render(commandEncoder, textureView, commonDepthView, cloudOpacities, avatarSphereData, sunDirAtmo, entities, cameraPos);
      }

      // Render Transparent/VFX THIRD (after all opaques)
      // We need to LOAD color and depth to test against terrain correctly
      const vfxPassDescriptor = {
        colorAttachments: [{
          view: textureView,
          loadOp: 'load',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: commonDepthView,
          depthLoadOp: 'load', // Don't clear! We need the terrain depth
          depthStoreOp: 'store',
        },
      };

      const vfxPass = commandEncoder.beginRenderPass(vfxPassDescriptor);

      // Render snow particles
      if (snowIntensityCurrent > 0.001 && snowSystem) {
        snowSystem.update(time, altitudeScale, snowIntensityCurrent, gridData);
        snowSystem.render(vfxPass);
      }

      // Render rain and lightning — update() already ran once, above.
      if (rainIntensityCurrent > 0.001 && rainSystem) {
        rainSystem.render(vfxPass);
      }

      vfxPass.end();
      
      device.queue.submit([commandEncoder.finish()]);

      // --- END OF MAIN RENDER LOOP ---




      // Poll controllers before keyboard's per-frame cleanup (W3C Gamepad API).
      gamepadManager.update();

      // Right stick → camera orbit. Mirrors the canvas pointermove drag path
      // above so a connected pad (Xbox, DualSense, …) rotates the
      // camera the same way mouse drag does. Without this, the lookX/lookY
      // axes the input managers write are read by nobody.
      const padAxes = inputManager.getAxes();
      if (padAxes.lookX !== 0 || padAxes.lookY !== 0) {
        const isInShip = vehicleSystem ? vehicleSystem.isOccupied : false;
        const vcfg = vehicleSystem?.config?.controls;
        const orbitH = (isInShip && vcfg) ? vcfg.orbitSpeedH : CAMERA_CONFIG.orbitSpeed;
        const orbitV = (isInShip && vcfg) ? vcfg.orbitSpeedV : (CAMERA_CONFIG.orbitSpeedVertical || CAMERA_CONFIG.orbitSpeed);
        // Convert -1..1 stick to a per-frame angular delta comparable to a
        // ~8 px mouse drag — tweak STICK_TO_PIXEL if it feels too fast/slow.
        const STICK_TO_PIXEL = 8;
        cameraSystem.targetYaw -= padAxes.lookX * orbitH * STICK_TO_PIXEL;
        cameraSystem.targetPitch += padAxes.lookY * orbitV * STICK_TO_PIXEL;
        cameraSystem.targetPitch = Math.max(
          CAMERA_CONFIG.orbitPitchMin,
          Math.min(CAMERA_CONFIG.orbitPitchMax, cameraSystem.targetPitch)
        );
      }

      // Update Input Manager (clear justPressed flags)
      inputManager.update();

      requestAnimationFrame(render);
    };
    if (uiManager) uiManager.setActiveWeatherPreset(activePreset); 

    // --- AUTHENTICATION TRANSITION ---
    window._triggerAuthSuccess = () => {
        if (isUserAuthenticated) return;
        isUserAuthenticated = true;
        Logger.info('Main', 'Auth success triggered, switching to player mode');
        
        // Hide auth overlay if still there
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) {
            authOverlay.classList.add('fade-out');
            setTimeout(() => { authOverlay.style.display = 'none'; }, 500);
        }

        // Land precisely. Priority: shared ?p= link > saved session > default island (fresh visitor).
        if (urlPosition) {
            physicsSystem.syncPosition(urlPosition.pos);
            cameraSystem.targetYaw = urlPosition.camera.targetYaw;
            cameraSystem.targetPitch = urlPosition.camera.targetPitch;
            cameraSystem.targetDistance = urlPosition.camera.targetDistance;
        } else if (savedAvatarState) {
            const parsed = JSON.parse(savedAvatarState);
            if (parsed.pos) physicsSystem.syncPosition(parsed.pos);
            if (parsed.camera) {
                cameraSystem.targetYaw = parsed.camera.targetYaw;
                cameraSystem.targetPitch = parsed.camera.targetPitch;
                cameraSystem.targetDistance = parsed.camera.targetDistance;
            }
        } else {
            // Fresh visitor (no link, no saved session) → land on the curated default island.
            const island = getDefaultSpawn();
            if (island) {
                physicsSystem.syncPosition(island.pos);
                cameraSystem.targetYaw = island.camera.targetYaw;
                cameraSystem.targetPitch = island.camera.targetPitch;
                cameraSystem.targetDistance = island.camera.targetDistance;
            }
        }
    };

    // If already authenticated by some fallback
    if (isUserAuthenticated) window._triggerAuthSuccess();

    // --- Periodic State Saving (Avatar & Vehicle) ---
    const saveState = () => {
        // Skip while in map mode: physicsSystem.pos is held at map altitude,
        // not the avatar's real ground position. The ground pos is snapshotted
        // into savedCameraState on entry and restored on exit, so the last
        // pre-map-mode save remains the persisted state — including across
        // a window close, since beforeunload also routes through here.
        if (parcelMapMode) return;

        // Save Navigation Mode
        localStorage.setItem(STORAGE_KEYS.NAVIGATION_MODE, navigationManager.activeMode);

        // Save Avatar State
        const currentPos = physicsSystem.pos; // Use the internal pos object directly
        const aState = {
            pos: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            camera: {
                targetYaw: cameraSystem.targetYaw,
                targetPitch: cameraSystem.targetPitch,
                targetDistance: cameraSystem.targetDistance,
                orbitYaw: cameraSystem.orbitYaw,
                orbitPitch: cameraSystem.orbitPitch,
                distance: cameraSystem.distance
            },
            forward: planetRenderer.characterSystem ? planetRenderer.characterSystem.forward : initialForward
        };
        localStorage.setItem(STORAGE_KEYS.AVATAR, JSON.stringify(aState));

        // Keep the address bar in sync so the current spot is always shareable (?p=).
        updatePositionURL(currentPos, cameraSystem);

        // Save Vehicle State (if active)
        if (vehicleSystem && vehicleSystem.active) {
            const vBasis = vehicleSystem.getBasis();
            const vState = {
                pos: vehicleSystem.pos,
                forward: vBasis.forward,
                isOccupied: vehicleSystem.isOccupied,
                vehicleType: activeVehicleType
            };
            localStorage.setItem(STORAGE_KEYS.VEHICLE, JSON.stringify(vState));
        }
    };

    // Save every 1 second
    const saveInterval = setInterval(saveState, 1000);

    // Save on page exit
    window.addEventListener('beforeunload', saveState);

    // Show the Help / controls panel by default so new players see the keybindings (H toggles it).
    toggleMainUI();

    // === MAIN LOOP ===
    render();

    // === MOUSE UTILITIES ===
    function getMovementX(event) { return event.movementX || 0; }
    function getMovementY(event) { return event.movementY || 0; }
    
    function getMouseWheelDelta(event) {
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta /= 3; // lines
      else if (event.deltaMode === 2) delta *= 80; // pages
      else delta /= 100; // pixels
      return delta;
    }

    // === AVATAR RAYCAST FOR PAINTING ===

    /**
     * Unproject screen point through inverse VP matrix
     * @returns {number[]} [x,y,z] in camera-relative world space
     */
    const _unproject = (ndcX, ndcY, ndcZ, invVP) => {
      const w = invVP[3]*ndcX + invVP[7]*ndcY + invVP[11]*ndcZ + invVP[15];
      return [
        (invVP[0]*ndcX + invVP[4]*ndcY + invVP[8]*ndcZ + invVP[12]) / w,
        (invVP[1]*ndcX + invVP[5]*ndcY + invVP[9]*ndcZ + invVP[13]) / w,
        (invVP[2]*ndcX + invVP[6]*ndcY + invVP[10]*ndcZ + invVP[14]) / w,
      ];
    };

    // === MOUSE CONTROLS ===
    // Left drag: orbit camera around ship
    let dragMode = null;

    canvas.addEventListener('pointerdown', (event) => {
      dragMode = 'orbit';
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!dragMode || !canvas.hasPointerCapture(event.pointerId)) return;

      const dx = getMovementX(event);
      const dy = getMovementY(event);

      // Orbit camera around ship - update TARGET values
      // Use per-entity control configs (vehicle vs avatar)
      const isInShip = vehicleSystem ? vehicleSystem.isOccupied : false;
      
      // Get sensitivity from active entity's config
      let orbitSpeedH, orbitSpeedV;
      const activeVehicleControls = vehicleSystem?.config?.controls;
      if (isInShip && activeVehicleControls) {
          orbitSpeedH = activeVehicleControls.orbitSpeedH;
          orbitSpeedV = activeVehicleControls.orbitSpeedV;
      } else {
          // Avatar/default sensitivity
          orbitSpeedH = CAMERA_CONFIG.orbitSpeed;
          orbitSpeedV = CAMERA_CONFIG.orbitSpeedVertical || CAMERA_CONFIG.orbitSpeed;
      }
      
      // Horizontal: orbit yaw (full 360° rotation)
      cameraSystem.targetYaw -= dx * orbitSpeedH;
      
      // Vertical: orbit pitch (higher sensitivity for easier climbing/diving)
      cameraSystem.targetPitch += dy * orbitSpeedV;
      // Clamp pitch to prevent flipping over
      cameraSystem.targetPitch = Math.max(CAMERA_CONFIG.orbitPitchMin, 
                                    Math.min(CAMERA_CONFIG.orbitPitchMax, cameraSystem.targetPitch));
    });

    const endDrag = (event) => {
      if (!canvas.hasPointerCapture(event.pointerId)) return;
      canvas.releasePointerCapture(event.pointerId);
      dragMode = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    
    // Mouse wheel: zoom camera (update target)
    canvas.addEventListener('wheel', (event) => {
      const delta = getMouseWheelDelta(event);
      cameraSystem.targetDistance *= (1 + delta * CAMERA_CONFIG.zoomSpeed);
      cameraSystem.targetDistance = Math.max(CAMERA_CONFIG.minDistance, Math.min(CAMERA_CONFIG.maxDistance, cameraSystem.targetDistance));
      event.preventDefault();
    }, { passive: false });
    
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // === PARCEL MAP PICKING ===
    /** Invert a 4x4 column-major matrix (Float32Array) */
    const invertMatrix4 = (m) => {
      const inv = new Float32Array(16);
      const [m0,m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12,m13,m14,m15] = m;
      inv[0]  =  m5*m10*m15 - m5*m11*m14 - m9*m6*m15 + m9*m7*m14 + m13*m6*m11 - m13*m7*m10;
      inv[4]  = -m4*m10*m15 + m4*m11*m14 + m8*m6*m15 - m8*m7*m14 - m12*m6*m11 + m12*m7*m10;
      inv[8]  =  m4*m9*m15  - m4*m11*m13 - m8*m5*m15 + m8*m7*m13 + m12*m5*m11 - m12*m7*m9;
      inv[12] = -m4*m9*m14  + m4*m10*m13 + m8*m5*m14 - m8*m6*m13 - m12*m5*m10 + m12*m6*m9;
      inv[1]  = -m1*m10*m15 + m1*m11*m14 + m9*m2*m15 - m9*m3*m14 - m13*m2*m11 + m13*m3*m10;
      inv[5]  =  m0*m10*m15 - m0*m11*m14 - m8*m2*m15 + m8*m3*m14 + m12*m2*m11 - m12*m3*m10;
      inv[9]  = -m0*m9*m15  + m0*m11*m13 + m8*m1*m15 - m8*m3*m13 - m12*m1*m11 + m12*m3*m9;
      inv[13] =  m0*m9*m14  - m0*m10*m13 - m8*m1*m14 + m8*m2*m13 + m12*m1*m10 - m12*m2*m9;
      inv[2]  =  m1*m6*m15  - m1*m7*m14  - m5*m2*m15 + m5*m3*m14 + m13*m2*m7  - m13*m3*m6;
      inv[6]  = -m0*m6*m15  + m0*m7*m14  + m4*m2*m15 - m4*m3*m14 - m12*m2*m7  + m12*m3*m6;
      inv[10] =  m0*m5*m15  - m0*m7*m13  - m4*m1*m15 + m4*m3*m13 + m12*m1*m7  - m12*m3*m5;
      inv[14] = -m0*m5*m14  + m0*m6*m13  + m4*m1*m14 - m4*m2*m13 - m12*m1*m6  + m12*m2*m5;
      inv[3]  = -m1*m6*m11  + m1*m7*m10  + m5*m2*m11 - m5*m3*m10 - m9*m2*m7   + m9*m3*m6;
      inv[7]  =  m0*m6*m11  - m0*m7*m10  - m4*m2*m11 + m4*m3*m10 + m8*m2*m7   - m8*m3*m6;
      inv[11] = -m0*m5*m11  + m0*m7*m9   + m4*m1*m11 - m4*m3*m9  - m8*m1*m7   + m8*m3*m5;
      inv[15] =  m0*m5*m10  - m0*m6*m9   - m4*m1*m10 + m4*m2*m9  + m8*m1*m6   - m8*m2*m5;
      const det = m0*inv[0] + m1*inv[4] + m2*inv[8] + m3*inv[12];
      if (Math.abs(det) < 1e-10) return null;
      const invDet = 1.0 / det;
      for (let i = 0; i < 16; i++) inv[i] *= invDet;
      return inv;
    };

    const doParcelPick = (screenX, screenY) => {
      if (!parcelMapMode || !lastViewProjection || !lastEarthCenterOffset) return null;
      const invVP = invertMatrix4(lastViewProjection);
      if (!invVP) return null;
      const coords = parcelPicker.pick(screenX, screenY, canvas, invVP, lastEarthCenterOffset);
      if (!coords) return null;
      return parcelDataManager.getParcelAt(coords.face, coords.localX, coords.localY);
    };

    // Hover (no capture — fires even when not dragging)
    canvas.addEventListener('pointermove', (event) => {
      if (!parcelMapMode || dragMode) return;

      // Cursor feedback: pointer when hovering over tooltip buttons
      if (pinnedParcel && lastViewProjection) {
        const action = planetRenderer.tooltipHitTest(
          event.clientX, event.clientY, canvas, lastViewProjection
        );
        canvas.style.cursor = action ? 'pointer' : 'default';
      } else {
        canvas.style.cursor = 'default';
      }

      const parcel = doParcelPick(event.clientX, event.clientY);
      parcelHoveredIdx = parcel?.idx ?? -1;

      // If a parcel is pinned, don't change tooltip on hover
      if (!pinnedParcel) {
        if (parcel && lastAbsoluteCameraPos && parcelPassesFilter(parcel)) {
          const absWorldPos = parcelPicker.parcelToWorld(
            parcel.face, parcel.localX, parcel.localY, EARTH_CENTER
          );
          planetRenderer.updateParcelTooltip(parcel, absWorldPos, lastAbsoluteCameraPos, EARTH_CENTER);
        } else {
          planetRenderer.hideParcelTooltip();
        }
      }

      planetBridge.emit('parcelHover', { parcel });
    });

    /**
     * Handle tooltip button actions (two-step confirm for claim/burn)
     * @param {string} action - 'close' | 'tp' | 'primary' | 'burn'
     * @param {object} parcel - Current pinned parcel
     */
    const handleTooltipAction = async (action, parcel) => {
      if (!parcel) return;

      if (action === 'close') {
        pinnedParcel = null;
        planetRenderer.hideParcelTooltip();
        canvas.style.cursor = 'default';
        return;
      }

      if (action === 'tp') {
        // setParcelMapMode(false) restores the saved avatar position, so the
        // teleport must run after it. parcelToWorld returns a fixed radius, not
        // the terrain height — bake the height grid and drop onto the surface.
        const [px, py, pz] = parcelPicker.parcelToWorld(parcel.face, parcel.localX, parcel.localY, EARTH_CENTER);
        await setParcelMapMode(false);
        physicsSystem.syncPosition({ x: px, y: py, z: pz });
        await physicsSystem.requestGPUHeightGrid(planetRenderer, terrainParams);
        const groundHeight = physicsSystem.getHeightAt(px, py, pz);
        if (groundHeight !== null) {
          const dx = px - EARTH_CENTER[0], dy = py - EARTH_CENTER[1], dz = pz - EARTH_CENTER[2];
          const len = Math.hypot(dx, dy, dz) || 1;
          const r = EARTH_RADIUS + groundHeight;
          physicsSystem.syncPosition({
            x: EARTH_CENTER[0] + dx / len * r,
            y: EARTH_CENTER[1] + dy / len * r,
            z: EARTH_CENTER[2] + dz / len * r,
          });
        }
        canvas.style.cursor = 'default';
        return;
      }

      const currentConfirm = planetRenderer.tooltipConfirmState;
      const isEmpty = parcel.type === 0 || parcel.action === 'claim';

      if (action === 'primary') {
        if (currentConfirm === 'confirm') {
          // Second click — execute operation
          pinnedParcel = null;
          planetRenderer.hideParcelTooltip();
          canvas.style.cursor = 'default';

          if (isEmpty) {
            // Claim land
            const { showToast } = await import('./lib/marketplace/js/services/toast.js');
            showToast('info', 'Processing', 'Claiming land...');
            let imageFile = null;
            if (previewBaker) {
              try {
                const dataUrl = await previewBaker.bake(parcel);
                if (dataUrl) {
                  const res = await fetch(dataUrl);
                  const blob = await res.blob();
                  imageFile = new File([blob], `land_${parcel.face}_${parcel.localX}_${parcel.localY}.png`, { type: 'image/png' });
                }
              } catch (e) {
                console.warn('[Tooltip] Preview bake failed:', e);
              }
            }
            const { blockchain } = await import('./lib/marketplace/js/services/blockchain.js');
            blockchain.mintLand({ face: parcel.face, localX: parcel.localX, localY: parcel.localY, imageFile });
          } else {
            // Buy/Bid/Rent — emit to marketplace
            planetBridge.emit('parcelSelected', { parcel });
          }
        } else {
          // First click — enter confirm state
          planetRenderer.setTooltipConfirmState('confirm', parcel);
        }
        return;
      }

      if (action === 'burn') {
        if (currentConfirm === 'burn-confirm') {
          // Second click — execute burn
          pinnedParcel = null;
          planetRenderer.hideParcelTooltip();
          canvas.style.cursor = 'default';
          const { showToast } = await import('./lib/marketplace/js/services/toast.js');
          showToast('info', 'Processing', 'Burning land...');
          try {
            const { blockchain } = await import('./lib/marketplace/js/services/blockchain.js');
            const { BlockchainManager } = await import('./lib/blockchain/BlockchainManager.js');
            const tokenId = parcel.tokenId;
            const coords = parcel.coordinates ?? { face: parcel.face, localX: parcel.localX, localY: parcel.localY };
            const x = coords.face * 1000 + coords.localX;
            await BlockchainManager.releaseLand(x, coords.localY);
            await blockchain.burn(tokenId, 1, parcel);
            await window.db?.remove(`asset_${tokenId}`).catch(() => {});
            await window.db?.remove(`land_${coords.face}_${coords.localX}_${coords.localY}`).catch(() => {});
            window.dispatchEvent(new CustomEvent('landDataChanged', {
              detail: { removed: true, face: coords.face, localX: coords.localX, localY: coords.localY }
            }));
            showToast('success', 'Burned', `Land F${coords.face}:${coords.localX},${coords.localY} has been burned`);
          } catch (e) {
            console.error('[Tooltip] Burn failed:', e);
            const { showToast: st } = await import('./lib/marketplace/js/services/toast.js');
            st('error', 'Burn Failed', e.message);
          }
        } else {
          // First click — enter burn-confirm state
          planetRenderer.setTooltipConfirmState('burn-confirm', parcel);
        }
        return;
      }
    };

    // Click — hit-test tooltip buttons first, then pick parcel
    canvas.addEventListener('click', (event) => {
      if (!parcelMapMode) return;

      // 1. Check tooltip button hit first
      if (pinnedParcel && lastViewProjection) {
        const action = planetRenderer.tooltipHitTest(
          event.clientX, event.clientY, canvas, lastViewProjection
        );
        if (action) {
          handleTooltipAction(action, pinnedParcel);
          return;
        }
      }

      // 2. Parcel picking
      const parcel = doParcelPick(event.clientX, event.clientY);
      if (parcel) {
        parcelSelectedIdx = parcel.idx;
        parcel.regionName = parcelDataManager.getRegionName(parcel.face);

        // Lazy-init preview baker
        if (!previewBaker) {
          previewBaker = createParcelPreviewBaker(device);
        }

        // Any parcel type — select with GPU tooltip
        if (parcel.type === 0 || parcelPassesFilter(parcel)) {
          pinnedParcel = parcel;
          const absWorldPos = parcelPicker.parcelToWorld(
            parcel.face, parcel.localX, parcel.localY, EARTH_CENTER
          );
          planetRenderer.selectParcelTooltip(parcel, absWorldPos, lastAbsoluteCameraPos, EARTH_CENTER, previewBaker);
        } else {
          pinnedParcel = null;
          planetRenderer.hideParcelTooltip();
        }
      } else {
        // Click on empty space — dismiss tooltip
        parcelSelectedIdx = -1;
        pinnedParcel = null;
        planetRenderer.hideParcelTooltip();
        canvas.style.cursor = 'default';
      }
    });

    // Resize handling
    window.addEventListener('resize', () => {
      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
      context.configure({ device, format, alphaMode: 'opaque' });
      
      // Recreate depth texture
      depthTexture.destroy();
      depthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      
      // Recreate planet renderer depth texture
      planetRenderer.resize(canvas.width, canvas.height);
    });
      
    // Explicitly resume audio on first click to satisfy browser policies
    window.addEventListener('mousedown', () => {
        if (planetRenderer && planetRenderer.characterSystem && planetRenderer.characterSystem.audioManager) {
            planetRenderer.characterSystem.audioManager.resume();
        }
    }, { once: true });

  } catch (error) {
    console.group('Initialization Error');
    console.error(error);
    if (error.stack) console.error(error.stack);
    console.groupEnd();
    
    const msg = error instanceof Error && error.message ? error.message : 'Failed to start demo.';
    console.error(msg);
    // WebGPU acquisition failures get the requirements gate (with how-to-fix);
    // any other init error falls back to a plain alert.
    if (!navigator.gpu || /webgpu|adapter|secure context/i.test(msg)) {
      showRequirementGate({ reason: 'webgpu', detail: msg });
    } else {
      alert(msg);
    }
  }
}

// ============================================================================
// AUTHENTICATION & STARTUP
// ============================================================================

/**
 * Initialize authentication and start the application
 * World loads immediately in background, player systems load after authentication
 */
const initWithAuth = async () => {
  // Start the background engine immediately
  main();

  // Signal main() to unlock player systems (auth done)
  const unlockPlayerSystems = () => {
    if (window._triggerAuthSuccess) {
      window._triggerAuthSuccess();
    } else {
      // Fallback if main() is still loading
      isUserAuthenticated = true;
    }
  };

  const createProfileUI = await loadProfileUI();
  const profileUI = createProfileUI();

  // Full mnemonic auth + marketplace + offline notifications.
  const createAuthUI = await loadAuthUI();
  const authUI = createAuthUI();

  await authUI.init('auth-overlay', {
    onAuthenticated: async () => {
      Logger.info('Main', 'User authenticated...');
      profileUI.init();
      unlockPlayerSystems();
      // P2P presence — uses the shared WORLD DB ("ovgrid-world", rtc enabled), NOT
      // window.db (that's the marketplace DB, only set once the marketplace loads).
      if (!presenceSystem) {
        const { AuthManager } = await import('./lib/network/AuthManager.js');
        const { getDB } = await import('./lib/network/GenosDBManager.js');
        const worldDb = await getDB();
        const st = AuthManager.getState();

        // Give the player a distinct avatar: their saved custom look, else one derived
        // deterministically from their Ethereum address — so peers don't all look alike.
        // It's broadcast live via AVATAR_CONFIG.voxelParams, so customizing propagates too.
        const look = resolvePlayerAvatar(st.address);
        if (look) {
          AVATAR_CONFIG.voxelParams = look;
          window._avatarCharacterSystem?.reload?.();
        }

        presenceSystem = createPresenceSystem({
          db: worldDb,
          identity: { id: st.address ?? 'web', name: st.abbrAddr ?? 'Player' }
        });
        // (renderer is wired in the frame loop where planetRenderer is in scope)
      }
    }
  });

  // Initialize marketplace UI (M key shortcut)
  const createMarketplaceUI = await loadMarketplaceUI();
  const marketplaceUI = createMarketplaceUI();
  marketplaceUI.init();

  // Initialize Notification Manager (Offline Alerts)
  const createNotificationManager = await loadNotificationManager();
  const { createToastManager } = await import('./lib/ui/ToastManager.js');
  const toastManager = createToastManager();
  const notificationManager = createNotificationManager(toastManager);

  // Re-init on auth state change to listen for current user's events
  const { AuthManager } = await import('./lib/network/AuthManager.js');
  AuthManager.onStateChange((state) => {
    if (state.isActive && state.address) {
      notificationManager.init(state.address);
    } else {
      notificationManager.destroy();
    }
  });
};

// Start bootstrapping
initWithAuth();
