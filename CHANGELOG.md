# Changelog

## 2026-02-04 (Marketplace v2.1.0 - Auction Updates)

### Added
- **`updateAuction` Function**: Allows auction sellers to modify the auction duration while no bids have been placed.
  - Contract function: `updateAuction(uint256 auctionId, uint256 newDuration)`
  - Emits `AuctionUpdated(auctionId, seller, newEndTime)` event
  - Validations: only seller, no bids placed, auction not settled, duration within limits

### Changed
- **Contract Size Optimization**: Reduced OVGMarketplace contract size from 35KB to under 24KB using custom Solidity errors instead of string-based `require()` messages.
- **Custom Errors Added**:
  - `NotSeller()`, `HasBids()`, `DurationInvalid()`, `AuctionAlreadySettled()`, `AuctionNotFound()`, `AuctionEnded()`, `AuctionNotEnded()`, `BidTooLow()`
  - Plus general errors: `NotAllowed()`, `ZeroValue()`, `NotActive()`, `InvalidData()`, `InvalidBatch()`, `NotAvailable()`, `TokenMismatch()`, `NoBid()`, `SellerCantBid()`, `NotRenter()`, `RentalActive()`, `RentalExpired()`, `InvalidAddress()`, `NoFees()`

### Fixed
- **Auction Duration Persistence**: Fixed bug where auction duration wasn't persisting after refresh.
  - Root cause: `loadBlockchainData()` was saving `endsAt` but not calculating `duration`
  - Solution: Calculate `duration = (endTime - startTime) / 86400` days when loading auctions from blockchain
  - File: `lib/marketplace/js/app-core.js`

### Technical
- **Deployed to Polygon Mainnet**:
  - New Implementation: `0x4841042cA9D864d5A16678Cc1830dBd0D0dFfbc4`
  - Proxy (unchanged): `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA`
  - Version: 2.1.0
  - Verified on Polygonscan

---

## 2026-01-16 (Technical UI Separation & Debug Panel)

### Added
- **Technical Debug UI (`G` Key)**:
    - Extracted technical statistics (FPS, MSL, AGL, Quads) and terrain debugging toggles into a dedicated `DebugUI.js`.
    - Repositioned the Debug Panel to the **top-left** of the screen for better information hierarchy.
    - Implemented asynchronous lazy-loading for the Debug Panel via dynamic `import()`.
- **Minimalist Control Legend (`H` Key)**:
    - Refactored `ControlPanelUI.js` to serve as a clean, minimalist legend for movement and shortcuts.
    - Improved styling with `backdrop-filter` and premium borders.

### Technical
- **New Files**:
    - `lib/ui/DebugUI.js`: Houses the technical stats HTML and injection/toggle logic.
- **Refactored**:
    - `UIManager.js`: Updated with dynamic element getters to support late-binding of UI elements after injection. Added `rebindDebugListeners` to ensure events attach correctly to new DOM nodes.
    - `InputManager.js`: Added tracking and triggering for the `G` key.
    - `mainPlanet.js`: Integrated `toggleDebug` logic and coordinated the rebinding of UI listeners.
    - `index.html`: Unified CSS styles for the new UI components and fixed positioning.

---

### Added
- **Granular UI Lazy Loading**:
    - Split the monolithic `ControlPanelUI.js` into independent modules: `EnvironmentUI.js` and `TerrainUI.js`.
    - **T/V Shortcuts**: Added keyboard shortcuts for independent panel loading:
        - **`T` Key**: Toggles the **Terrain Configuration** panel (Lazy Loaded).
        - **`V` Key**: Toggles the **Environment Configuration** panel (Lazy Loaded).
    - Sub-panels now only download and inject HTML when first activated, reducing initial script execution time.
- **HUD Shortcuts Display**:
    - Updated the bottom-left HUD to display `[T] Terrain` and `[V] Env` indicators in the control section.

### Technical
- **New Files**:
    - `lib/ui/EnvironmentUI.js`: Contains Environment Config HTML and injection logic.
    - `lib/ui/TerrainUI.js`: Contains Terrain Config HTML and injection logic.
- **Improved**:
    - `UIManager.js`: Refactored to handle dynamic exports and lazy event binding. Removed external `initListeners` dependency.
    - `InputManager.js`: Added tracking for 'T' and 'V' key events with toggle safety.
    - `mainPlanet.js`: Orchestrates UI bootstrapping; pressing T/V now triggers full UI load if not already resident.

---

## 2026-01-16 (Bun Bundler & Progressive Modular Loading)

### Added
- **Bun as Bundler**:
    - Migrated from vanilla ES modules to Bun for production builds.
    - Added `package.json` with `dev`, `build`, and `preview` scripts.
    - Added `bunfig.toml` for Bun configuration.
- **Progressive Modular Loading**:
    - Created `lib/loaders/index.js` with lazy loading utilities.
    - Weather systems (Snow, Rain) now load on-demand when weather changes.
    - Vehicle, Cockpit, Auth, and Profile UIs load lazily when needed.
- **Code-Splitting**:
    - Production build generates 9 lazy-loaded chunks.
    - Main bundle reduced from ~400KB to ~320KB initial load.
    - Build time: 15ms for 80 modules.

### Technical
- **New Files**:
    - `package.json`: npm configuration with Bun scripts
    - `bunfig.toml`: Bun bundler configuration
    - `lib/loaders/index.js`: Lazy loading utilities
    - `lib/blockchain/index.js`: Barrel export for blockchain module
- **Refactored**:
    - `mainPlanet.js`: Static imports replaced with dynamic `import()` for non-critical systems.
    - Added `ensureWeatherSystems()` for on-demand weather initialization.

---

## 2026-01-16 (Polygon Blockchain Integration & Metaverse Economy)

### Added
- **OVG Token (ERC-20)**:
    - Deployed `OVGToken.sol` to Polygon Amoy (Testnet).
    - Includes `MINTER_ROLE` for minting rewards and `ERC20Permit` (EIP-2612) for gasless approvals.
    - **Initial Supply**: 21,000,000 OVG minted to the deployer (Genesis) account.
- **OVG Assets (ERC-1155)**:
    - Manages tool licenses (Auditoriums), planetary land, and user badges.
- **OVG Marketplace**:
    - Supports direct sales of assets using OVG tokens and a rental/leasing model.
- **Frontend Wallet Integration**:
    - **OVG & MATIC Balance Display**: Profile panel shows real-time OVG token balance and MATIC (gas) balance.
    - **P2P Token Transfers**: Users can send OVG tokens directly to another address via a secure form in the Profile UI.
    - **Address & Gas Validation**: Transfer form validates `0x` address format and checks for sufficient MATIC before submitting.
- **GenosDB Signer Bridge**:
    - Seamlessly connects GenosDB identity (BIP39 mnemonic or WebAuthn) to `ethers.js` for signing blockchain transactions.
- **Multi-RPC Fallback**:
    - `BlockchainManager.js` implements a robust multi-RPC fallback system for reliable connectivity to Polygon Amoy.

### Technical
- **Deployed Addresses (Polygon Amoy V2)**:
    - OVGToken: `0xbc2A3A9ff61a82b58F886e048715c485063A52fC`
    - OVGAssets: `0x503f5Da02884fc2c048c28830b9Efcd9cD6c213b`
    - OVGMarketplace: `0xFE73ca7F771fEB3BD7eF9D8d3622a542e3c042E2`
- **New Files**:
    - `blockchain/` directory with Hardhat project, Solidity contracts, and deployment scripts.
    - `lib/blockchain/BlockchainManager.js`: Main API for blockchain interactions.
    - `lib/blockchain/GenosDBSigner.js`: Bridge for signing transactions with GenosDB identity.
    - `lib/blockchain/contracts.js`: ABIs and deployed addresses.

---

## 2026-01-14 (Avatar Customization, Persistence & Robustness)

### Added
- **High-Altitude Persistence**:
    - **Avatar & Vehicle State**: Positions and orientations are now saved every second to `localStorage`, allowing users to resume exactly where they left off.
    - **Navigation Mode Persistence**: The engine now remembers if the user was in "Avatar" or "Ship" mode, restoring the correct context on reload.
- **Ready Player Me Customization**:
    - **Live Iframe Integration**: Modal editor for real-time avatar customization.
    - **Hot-Swapping**: Swapping avatars in-world without page reload using the new `CharacterSystem.reload()` method.
    - **Visual Feedback**: Profile badge and panel now display high-quality avatar thumbnails.

### Improved
- **Centralized Configuration**:
    - Moved all hardcoded avatar and storage constants to `lib/config/avatarConfig.js` and `lib/config/storageConfig.js`.
- **Code Audit & Cleanup**:
    - Removed non-essential `console.log` statements from `mainPlanet.js`, `CharacterSystem.js`, and `RPMManager.js`.
    - Refactored coordinate access and state management in core navigation strategies.

### Fixed
- **WebGPU Initialization Conflicts**:
    - **Singleton Pattern**: Implemented a module-level lock in `initWebGPU` to ensure initialization logic runs exactly once.
    - **Execution Guard**: Added a global flag in `mainPlanet.js` to block duplicate `main()` calls.
    - **Enforced High-Performance**: Strictly requires `high-performance` power preference.
- **Regressions**:
    - Fixed `ReferenceError` and `SyntaxError` issues in `lib/network/index.js` and `mainPlanet.js` caused during cleanup.

## 2026-01-10 (Procedural Biomes & VRAM Optimization)

### Added
- **Enhanced Procedural Biomes**:
    - **Moisture-Aware Grass**: Wet grass near water (darker with teal tint), dry savanna (yellow/ochre), and forest patches in high moisture areas.
    - **Altitude-Aware Sand**: Beach wetness near waterline, dune ridges with lighter peaks, and white sand in low moisture deserts.
    - **Slope-Aware Rock**: Cliff faces with lighter exposure, and mineral vein streaks using large-scale noise.
- **World-Stable XL Rain Effects**:
    - **Absolute Rotation Invariance**: Implemented a "Face-Local" coordinate system for rain ripples, ensuring they remain perfectly pinned to the ground even during 360° camera rotation.
    - **XL Ripple Scale**: Increased rain impact circles to **2.5 meters** for maximum visibility and impact.
    - **High-Intensity "Gotitas"**: Enhanced glistening dots at impact points using 150x specular intensity for a premium wet look.
    - **Zero-Stripe Precision**: Eliminated floating-point artifacts ("rallas") using a fractional unit-modulo technique at planetary scales.
    - **Uniform Wet Sheen**: Unified surface wetness across terrain tiles to mask physics grid reconfiguration flickering.

### Optimized
- **Bump Texture Consolidation (8 → 5 textures)**:
    - Reduced VRAM footprint by ~16 MB.
    - Reduced network requests from 8 to 5 KTX2 files.
    - `ground` now reuses `grass` bump, `seabedShallow` reuses `sand`, `seabedDeep` reuses `rock`.
- **GC Pressure Elimination**:
    - Pre-allocated `gridInputData` (12 floats) and `gridHeightsBuffer` for physics grid.
    - Eliminated ~240 Float32Array allocations per second at 120 FPS.
    - Fixed gradual FPS degradation over time.

### Refactored
- **Terrain Texture Configuration**:
    - Replaced array-based `texturePaths` with semantic `normalMaps` object.
    - Added `textureOrder` array for GPU binding sequence.
    - Implemented texture caching in `renderer.js` to avoid re-loading duplicates.
- **Renderer Synchronization**:
    - `renderer.js` now initializes `_currentParams` directly from `TERRAIN_GENERATION_PARAMS`.
    - Externalized ocean wave scales/speeds to `OCEAN_CONFIG` in the shader.
- **UI & Config Cleanup**:
    - Removed redundant `storm intensity` slider and logic (parameter had no visual effect).
    - Updated weather presets to rely directly on `cloudCoverage` and `cloudSpeed`.
- **UI Restoration & Parameter Sync**:
    - Restored vertical, compact layout for the Terrain Editor UI, matching the Environment UI.
    - Synchronized all 35 terrain parameters between shader, configuration, and UI.
    - **Added procedural color pickers for all 8 terrain biomes (Grass, Rock, Snow, Sand, etc.) with real-time intensity control.**
    - **Expanded terrain uniform buffer for dynamic color synchronization and persistent biome customization.**
    - Fixed broken HTML nesting and rendering bugs in the Terrain Editor.
    - Added missing sliders: `Warp Strength 2`, `Peak Softness`, and `Detail Scale`.
    - Sanitized `UIManager.js` to eliminate hardcoded initialization logic.

---

## 2026-01-09 (UI Modernization & HUD Proximity Fade)

### Added
- **HUD Proximity Fade**:
    - Implemented a smooth proximity-based visibility system for avatar nameplates.
    - **Focused Range**: Reduced maximum visibility from 500m to 80m for a cleaner "localized" HUD feel.
    - **Dual-Fade Curve**: HUD starts fading at 20m and completes at 80m. Also fades out within 5m to prevent camera clipping.
- **Environment UI Modernization**:
    - Replaced 12 legacy RGB sliders with 4 compact **Color Pickers** (Cloud Layer Tints + Sky Tint).
    - Integrated high-intensity (0.0 - 2.0) sliders for emissive artistic control.
    - Optimized UI panel height by ~60%, reducing visual clutter.

### Refactored
- **HUD Configuration Externalization**:
    - Created `lib/config/hudConfig.js` to centralize all HUD and nameplate constants.
    - Optimized `lib/systems/index.js` by cleaning up broken and obsolete exports.
    - Migrated `NameplateSystem.js` to the centralized config architecture.

### Fixed
- **Sky Tint Persistence**: Manual sky tint changes no longer get overridden by the preset interpolation system.
- **Preset Synchronization**: Sky presets now correctly update the new color pickers and intensity sliders in real-time.
- **ReferenceErrors**: Resolved a `ReferenceError` where `NAMEPLATE_CONFIG` was still being accessed after refactoring to `HUD_CONFIG`.

---

## 2026-01-09 (High-Intensity Ambient Sky Tinting)

### Added
- **Powerful Ambient Light Injection**:
    - Implemented a transformative sky tinting system that injects preset colors directly into the ambient lighting equations.
    - **4.0x Ambient Boost**: Quadrupled the sky irradiance weight for dramatic shadow and surfacing tinting.
    - **80% Direct Sun Tint**: Atmospheric color now bleeds into direct sunlight for a holistic environmental "wash".
    - **Albedo Integration**: Surface colors (albedo) now absorb 20% of the active sky tint for maximum visual integration.
- **Synchronized Environmental Shaders**:
    - Updated **Terrain**, **Avatar**, and **Snow** shaders to share a unified 64-float `GlobalUniforms` layout.
    - Replaced hardcoded blue shadow tints with dynamic `skyTint` for cloud shadows.
- **Artistic Parameter Support**:
    - Expanded global uniform buffers to pass `skySaturation`, `skyVibrance`, and `skyTint` from the CPU to all active GPU pipelines.

### Fixed
- **Uniform Memory Mismatches**: Standardized struct layouts across all shaders to prevent memory offset corruption.
- **ReferenceErrors**: Restored `earthCenterOffset` in `mainPlanet.js` to fix a precision-rendering regression.
- **Floating Origin Synchronization**: Ensured `skyTint` correctly handles floating origin offsets for snow and terrain distance math.
- **Codebase Cleanup & Centralization**:
    - Centralized all photometric constants (Solar Irradiance, Luminance Weights, Ambient Baselines) into `lib/config/lightingConfig.js` for "Single Source of Truth".
    - Eliminated "magic numbers" from `terrain.wgsl.js`, `avatar.wgsl.js`, `snow.wgsl.js`, and `atmosphere.wgsl.js`.
    - Removed orphan `rocks.wgsl.js` shader file.
    - Achieved 100% visual parity with zero performance overhead via compile-time template literal injection.

---

## 2026-01-09 (Spherical Cap Clouds & Environment Persistence)

### Added
- **Spherical Cap Cloud Projection**:
    - Replaced flat planar cloud UVs with a more natural spherical cap projection.
    - Clouds now follow the planetary curvature realistically towards the horizon.
    - Improved horizon reach and perspective without polar distortion.
- **Cloud Shadows**:
    - Real-time shadow projection for spherical cap clouds onto the terrain.
    - Synchronized pattern and movement with the 3DSky layers.
- **Advanced Environment Persistence**:
    - Implemented a robust **IndexedDB** storage system (`SettingsStore.js`) for environment settings.
    - Persists weather states, sky presets, exposure, and atmospheric parameters across sessions.
    - Supports atomic updates and reliable storage for large configuration sets.
- **Weather & Sky Preset Lerp Engine**:
    - Refined smooth cinematic transitions between presets (Clean, Normal, Storm, Cinematic, Planet X, Blood).
    - Unified `env` and `targetEnv` interpolation logic in `AtmosphereSystem.js`.

### Refactored
- **UI Cleanup & Optimization**:
    - Removed unused controls: `Cam speed` and `Cloud pattern` sliders.
    - Relocated `CAMERA Pos` telemetry to the main control panel for better visibility.
    - Improved layout of the Stats panel: Aligned `Zone` and `Quads` vertically.
- **Atmosphere System**:
    - Consolidated target environment updates to prevent state flickering.
    - Cleaned up obsolete weather change callbacks.

### Fixed
- **Preset Transition Glitches**: Resolved issues where presets wouldn't interpolate smoothly or would reset unexpectedly.
- **UI State Sync**: Improved synchronization between the configuration panels and the underlying engine state.

---

### Added
- **Cloud Crossing Lite (Performance Optimized)**:
    - High-performance post-processing system for realistic atmospheric entry/exit.
    - **2D Screen-Space Noise**: Uses procedural 2D noise layers with temporal scrolling for an organic "vapor" look without 3D volumetric overhead.
    - **Zero-Depth Dependency**: Skips depth buffer reads and world-position reconstruction, reducing VRAM bandwidth and GPU cycles by ~4x.
    - **Dynamic Altitude Fading**: Smooth mathematical transitions centered at 115km with 90km total thickness (70km to 160km).
    - **Intensity Boost**: Enhanced density (1.25) and range for a more dramatic and immersive cinematic feel.
- **Centralized Fog Configuration** (`lib/config/crossingFogConfig.js`):
    - Independent control for altitude, thickness, intensity, colors, and animation speed.

### Refactored
- **Crossing Fog System**: Extracted into a dedicated factory function `createCrossingFogSystem`.
- **Render Pass Optimization**: Separate post-processing pass in `mainPlanet.js` to ensure the effect correctly washes out the entire frame.

### Fixed
- **Cloud Shadow Sync**: Synchronized sky clouds and ground shadows animation speed, direction, and shape across the entire planet.
- **World-Stable Shadow Projection**: Implemented a fixed world-space planar projection (XZ) for both clouds and shadows, eliminating distortion, stretching, and camera-following ("sliding") effects.
- **Shadow Altitude Fading**: Synchronized shadow disappearance with sky clouds (80km-100km transition) for seamless space transitions.
- **Subtle Sun Parallax**: Re-introduced light solar influence (5% bias) for realistic shadow movement without distortion.
- **WebGPU Precision Mismatches**: Resolved various depth-stencil attachment conflicts when mixing sampled textures with render passes.
- **Uniform Alignment**: Corrected WGSL struct alignment for 12-float uniform buffers (48 bytes).

---

## 2026-01-07 (High-Fidelity Volumetric Shadows / God Rays)

### Added
- **Volumetric Shadows (God Rays)**:
    - Real-time ray-marching integration in the atmosphere shader.
    - **Cascaded Integration**: Samples the 4-cascade shadow map (CSM) system for accurate occlusion by terrain, avatar, and vehicles.
    - **Scattering Occlusion**: Shadows now correctly affect both sky radiance and the atmospheric halo, creating dramatic light beams.
    - **Improved Quality**: Implemented jittering (Blue Noise approximation) to eliminate ray-marching banding.
    - **Centralized Parameters**: All volumetric settings (steps, distance, ambient floor, bias) are now managed in `lib/config/atmosphereConfig.js`.
- **UI Enhancements**:
    - Added "Volumetric Shadows" toggle and intensity slider in the Environment panel.

### Fixed
- **CSM Split Alignment**: Corrected a major mismatch in shadow cascade splits by increasing `SPLIT_LAMBDA` to 0.95 (logarithmic distribution).
- **Atmospheric Halo Masking**: Fixed a logic error where the bright solar halo was "drawing over" volumetric shadows, making them invisible.
- **ReferenceErrors**: Resolved several `ReferenceError` crashes in `AtmosphereSystem.js` and `ShadowSystem.js` during cleanup.

### Refactored
- **Configuration Parity**: Imported `SHADOW_CONFIG` into `PlanetRenderer.js` to synchronize shadow pass filtering with cascade radii.
- **Obsolete Code Cleanup**: Removed legacy `updateMatrix` methods and consolidated all shadow updates into the cascaded `updateMatrices`.

---

## 2026-01-07 (Cascaded Shadow Maps - 4 Cascades + Cloud Shadows)

### Added
- **Cascaded Shadow Maps (CSM) System**:
    - Implemented 4-cascade shadow mapping for high-resolution near shadows and distant terrain coverage.
    - **Cascade 0**: 100m radius - Avatar and immediate surroundings.
    - **Cascade 1**: 500m radius - Nearby terrain and objects.
    - **Cascade 2**: 2km radius - Medium distance hills.
    - **Cascade 3**: 10km radius - Far terrain and mountains.
- **Cloud Shadows**:
    - High-performance 3-layer cloud shadow projection onto terrain.
    - **Stability**: Uses Absolute Spherical Mapping (Planetary coordinates) to eliminate "sliding" artifacts during movement.
    - **Synchronization**: Individually synced density, scale, and animation speeds for all 3 layers with the atmosphere shader.
    - **Dynamic Opacity**: Shadow intensity for each layer is now linked to its corresponding UI opacity slider.
    - **Atmosphere Interaction**: Added realistic blue-ish tinting to shadowed areas based on ambient skylight.
- **New Configuration** (`lib/config/shadowConfig.js`):
    - Centralized cascade radii, near/far clip planes, and PCF bias parameters.
    - `calculateCascadeSplits()` utility for view-space split depth calculation.
- **GPU Texture Array**: Shadow depth texture now uses `texture_depth_2d_array` with 4 layers.

### Changed
- **Shadow System Refactor** (`lib/terrain/shadow-system.js`):
    - Generates 4 orthographic light view-projection matrices per frame.
    - Uniform buffer expanded to 288 bytes (4×mat4x4f + splitDepths + earthCenter).
    - Entity filtering by cascade radius for optimized depth passes.
- **Shader Updates**:
    - `shadow.wgsl.js`: `ShadowUniforms` struct now holds 4 cascade matrices.
    - `terrain.wgsl.js`: Implemented `selectCascade(distToCamera)` and `sampleCloudShadow()` functions.
    - PCF sampling uses `textureSampleCompareLevel` with cascade index.
    - Cloud shadows sample all 3 cloud layers with correct UV scales.
- **Renderer Integration** (`lib/terrain/renderer.js`):
    - Bind group layout updated for `2d-array` depth texture.
    - Shadow mesh filter expanded from 500m to 10km radius.

### Performance
- **Maintained 120 FPS**: CSM + cloud shadow overhead is minimal.
- **Floating Origin Compliant**: All calculations use camera-relative coordinates.

---

## 2026-01-06 (Batch 6.1: Configuration Centralization & Docs Sync)


### Added
- **Centralized Configuration System**:
    - Created `lib/config/planetConfig.js` to unify `PLANET_RADIUS`, `EARTH_RADIUS`, and `EARTH_CENTER`.
    - Created `lib/config/storageConfig.js` for clean isolation of local storage keys.
    - Implemented a unified barrel export in `lib/config/index.js` as the Single Source of Truth for the entire engine.
- **Dynamic Shader Injection**:
    - Removed hardcoded constants from WGSL shaders (`terrain`, `atmosphere`, `compute`).
    - Constants are now dynamically injected from the central configuration, ensuring 100% parity between CPU physics and GPU visual logic.

### Refactored
- **Architectural Cleanup**:
    - Deleted the obsolete `lib/core/constants.js`.
    - Updated over 20 files (systems, renderers, math) to import from the new centralized configuration.
    - Synchronized all documentation (`docs/`, `README.md`) to reflect the latest project structure and factory pattern enforcement.

### Fixed
- **Constant Disparity**: Eliminated risks of "vibration" or misalignments caused by differing definitions of planetary scale across multiple files.

## 2026-01-06 (Batch 5 Complete: Final Integration)

### Completed
- **Batch 5: Renderers & Visual Systems** refactoring is now complete.
- All major rendering systems now use factory function pattern:
  - `createAtmosphereSystem`, `createSnowSystem`
  - `createVehicleRenderer`
  - `createShadowSystem`, `createGPUCullingSystem`
  - `createPlanetRenderer`
- Updated `mainPlanet.js` to use factory functions.

---

## 2026-01-06 (Batch 5 Phase 3.4: PlanetRenderer Factory)

### Refactored
- **PlanetRenderer Factory Function**:
    - Completely converted `PlanetRenderer` from an ES6 class to a closure-based factory function.
    - Eliminated all usage of `this` and encapsulated state in closures.
    - Resolved critical initialization and scoping issues found during the conversion.
    - Updated `mainPlanet.js` to use the new factory pattern.
- **Phase 3.3 Skipped**: `_createPipeline` was too tightly coupled (15+ `this.` references) to extract cleanly.

---

## 2026-01-06 (Batch 5 Phase 3.2: GPU Culling System Extraction)

### Refactored
- **Planet Renderer Decomposition**:
    - Extracted all GPU-based frustum and horizon culling logic into `createGPUCullingSystem`.
    - **Modular Culling**: Moved compute pipelines, storage buffers, and culling parameter management out of `PlanetRenderer`.
    - **Performance Integration**: Maintained 1-frame latency async readback for instance count statistics within the new system.
    - **Code Reduction**: Removed over 260 lines of legacy compute code from `renderer.js`.

---

## 2026-01-06 (Batch 5 Phase 3.1: Shadow System Extraction)

### Refactored
- **Planet Renderer Decomposition**:
    - Extracted all shadow-related logic into a dedicated factory function: `createShadowSystem`.
    - **Modular Shadows**: The `PlanetRenderer` now delegates shadow map creation, matrix updates, and render passes to the new system.
    - **Resource Exposure**: Updated `CharacterSystem.js` to expose necessary skeletal and uniform buffers via modern getters.

---

## 2026-01-06 (Batch 5 Phase 2: Vehicle Renderer Refactoring)

### Refactored
- **Vehicle Rendering (Factory Function)**:
    - Successfully migrated `VehicleRenderer` to the factory pattern (`createVehicleRenderer`).
    - **Animation Integration**: Maintained seamless support for node-based GLTF animations via `createNodeAnimationSystem`.
    - **Shadow Mapping**: Preserved shadow rendering capabilities with dynamic bind group generation for depth passes.
    - **Internal Integration**: Updated `PlanetRenderer` to utilize the new factory function.

---

## 2026-01-06 (Batch 5 Phase 1: Snow & Atmosphere Refactoring)

### Refactored
- **Visual Systems (Factory Functions)**:
    - Successfully migrated core visual systems to the factory pattern:
        - `createAtmosphereSystem`: Manages atmospheric scattering, procedural cloud generation (Bake Mode), and uniform updates.
        - `createSnowSystem`: Handles altitude-based particle precipitation.
    - **Stability Fixes**: Exposed internal GPU resources (`uniformBuffer`, `cloudTexture`, `quadBuffer`) via getters to maintain compatibility with `PlanetRenderer` and `SnowSystem` initialization.

---

## 2026-01-06 (Batch 6 Secondary Systems Refactoring)

### Refactored
- **Secondary Systems (Factory Functions)**:
    - Converted all remaining secondary systems from classes to modern factory functions:
        - `createAnimationSystem` (formerly `animation-system.js`)
        - `createNodeAnimationSystem` (formerly `node-animation-system.js`)
        - `createUIManager` (formerly `UIManager.js`)
        - `createVegetationSystem` (formerly `VegetationSystem.js`)
    - **Integration**: Updated `mainPlanet.js`, `CharacterSystem.js`, and `vehicle-renderer.js` to utilize the new factory patterns.
- **Vegetation System**: Refactored to use the factory pattern while remaining **inactive** by default per project requirements.

### Fixed
- **Module Export Redundancy**: Resolved issues where the browser cached old class-based exports, ensuring clean transitions between refactoring stages.
- **Vehicle Animation Integration**: Fixed `vehicle-renderer.js` to correctly instantiate `createNodeAnimationSystem` instead of the legacy `NodeAnimationSystem` class.

---

## 2026-01-06 (Batch 4 Terrain Refactoring & Multi-Planetary Stability)

### Added
- **Batch 4 Terrain Subsystems (Factory Functions)**:
    - Refactored the entire core terrain logic into high-performance factory functions:
        - `createTerrainMesh` (formerly `TerrainMesh.js`)
        - `createTerrainChunkPool` (formerly `pool.js`)
        - `createTerrainChunkBuilder` (formerly `builder.js`)
        - `createPlanetQuadtree` (formerly `quadtree.js`)
    - **Hybrid Architecture**: Integrated these factory functions internally within the `PlanetRenderer` class to provide modularity without breaking established rendering loops.
- **Robust Character Initialization**:
    - Refactored `CharacterSystem.js` to use an explicit `async init()` method, ensuring all avatar assets and skeletal animations are fully loaded before rendering.

### Fixed
- **Atmospheric Projection Bug**:
    - Identified and removed redundant matrix transpositions in `renderer.js` and `AtmosphereSystem.js`. 
    - Resolved the "invisible terrain" issue caused by corrupting the view-projection matrices.
- **Module Export Alignment**:
    - Corrected `lib/terrain/index.js` to accurately export both the `PlanetRenderer` class and the new terrain factory functions.
    - Synchronized imports in `mainPlanet.js` to match the current factory/class hybrid state.

### Stabilized
- **Renderer & Visual Systems (Batch 5 Deferral)**:
    - Intentionally maintained `PlanetRenderer`, `AtmosphereSystem`, and `VehicleRenderer` as stable classes to prevent regressions during the core logic refactor.

---

## 2026-01-02 (3D Spatial Audio & Professional Immosphere)

### Added
- **Web Audio 3D Spatial Engine**:
    - Implemented `AudioManager` using the native Web Audio API. 
    - **HRTF Panning**: High-fidelity 3D spatialization using the `Head-Related Transfer Function` model.
    - **Inverse Distance Model**: Realistic volume attenuation with a configurable 20m full-volume reference zone.
- **Surface-Aware Audio State Machine**:
    - **Environmental Detection**: Automatic switching between `footstepsLand` and `footstepsWater` using real-time sea-level altitude sampling.
    - **Intelligent Priority**: Flight and Jump sounds now correctly override footsteps to prevent "ghost walking" in mid-air.
    - **Falling Ambience**: Automatically triggers a low-volume wind loop during freefall and jump arcs.
- **Basis Transformation for Floating Origin**:
    - Implemented a relative coordinate projection that transforms world-space audio positions into Camera-Local space.
    - This allows a fixed `AudioListener` at [0,0,0] for perfect spatial parity with the project's Floating Origin architecture.

### Optimized
- **Click-Free Transitions**: 
    - Implemented 50ms linear gain ramps (`RampToValueAtTime`) to eliminate audible clicks during sound triggers.
    - Used `setTargetAtTime` for smooth playback rate interpolation (interpolating between Walk/Run rates).
- **Responsive Tracking**: Reduced spatial update time constants to 20ms for ultra-responsive low-latency 3D tracking.

### Fixed
- **Audio Context Suspension**: Added a global interaction listener to explicitly `resume()` the AudioContext, satisfying modern browser security policies.
- **Non-Finite Audio Params**: Resolved a crash caused by passing `NaN` or `undefined` positions during frame transitions.
- **Asset Parity**: Synchronized all sound URLs and playback parameters with the reference project.

---

## 2025-12-30 (Smooth Avatar Atmospheric Fade & Two-Pass Rendering)

### Added
- **Avatar Position & State Persistence**:
    - Implemented a complete session persistence system using `localStorage`.
    - **Position Tracking**: Saves exact world coordinates ($x, y, z$) to return the user to their last location.
    - **Camera Memory**: Remembers camera zoom (distance), yaw, and pitch for consistent perspective.
    - **Orientation Recovery**: Restores the avatar's looking direction (forward vector) upon reload.
    - **Periodic Sync**: Automatically saves state every 1 second and during page exit (`beforeunload`).
- **Two-Pass Alpha Transparency**:
    - Implemented a high-quality materialization effect for the avatar during atmospheric descent.
    - **Depth Pre-pass (`avatarDepthOnlyPipeline`)**: Masks the avatar's outer shell to prevent "X-ray" artifacts where internal geometry was visible.
    - **Alpha Blending Pass (`avatarTransparentPipeline`)**: Provides perfectly smooth transparency using hardware blending.
- **Dynamic Transition Lifecycle**:
    - **Space (>1.5km)**: Avatar is fully deactivated (rendering and animations skipped).
    - **Materialization (1.5km - 500m)**: Rapid but smooth Alpha Fade-in.
    - **Solid Ground (<500m)**: Standard opaque rendering for maximum depth precision.

### Optimized
- **Smart Render Skipping**: Entirely bypasses character rendering and animation updates when visibility is zero, saving performance at high altitudes.
- **Narrower Transition Window**: Refined the fade range to 1.5km - 0.5km for a snappier, more professional feel.

### Fixed
- **Transparency Artifacts**: Resolved the issue where internal body parts (back, neck) were visible through the front surface of the transparent avatar.
- **WebGPU Validation Errors**: Fixed pipeline attachment mismatches and missing depth states that caused black screen errors.

### Cleaned
- Purged all obsolete "Bayer Dither" and screen-space dot code from the shader and main loop.
- Removed redundant debug logs and updated internal comments for code clarity.

---

## 2025-12-30 (Ocean Visual Refinement: Crystalline & Animated)

### Added
- **Crystalline Ocean & Procedural Caustics**:
    - **Liquid Opacity**: Implemented a 35% baseline "Water Coat" that ensures a liquid appearance even at the shore.
    - **Moving Caustics**: Added procedural light-refraction "webs" that dance on the seabed in shallow waters.
    - **Azure Majesty Palette**: Replaced dark indigo tones with vibrant, majestic Azure and Crystal Turquoise for a more natural look.
- **Dynamic Reflection & Animation**:
    - **Perceptible Waves**: Increased wave animation speeds by 4x for visible surface movement without performance impact.
    - **Reflective Shimmer**: Moved Sky, Cloud, and Avatar reflections to the final shading pass, allowing them to be distorted by animated normals.

### Improved
- **High-Precision Coastal Biomes**:
    - **Sharpened Shoreline**: Reduced the land/ocean blend zone from 1,000m to **2 meters**, eliminating turquoise tints on mountains and beaches.
    - **Natural Sand Anchoring**: Fixed the "sand born from water" artifact; beaches now correctly emerge from rock and earth bases.
    - **Rock Overrides**: Steep slopes now correctly transition to rock cliffs at the water line instead of being forced into sand.

### Optimized
- **Zero-Cost Translucency**: Reached high-end visual fidelity using "Virtual Translucency" (mathematical blending) instead of expensive alpha-blending passes.

---
## 2025-12-27 (High-Precision Terrain Correction & Reverse-Z)

### Added
- **High-Precision Reverse-Z Depth System**:
    - Implemented a **Reverse-Z** projection matrix mapping $Near \rightarrow 1.0$ and $Far \rightarrow 0.0$ for optimal precision distribution.
    - Upgraded the depth buffer from `depth24plus` to **`depth32float`** across all rendering pipelines (Terrain, Avatar, Snow, Atmosphere).
    - Restored physically correct occlusion by switching `depthCompare` from `always` to **`greater`**.
- **GPU Floating Origin (Final Correction)**:
    - Resolved terrain flickering and "vibration" by passing `chunkNormal` (pre-calculated in CPU float64) to the vertex shader.
    - Implemented high-precision vertex offsets relative to chunk centers on the GPU.

### Changed
- **Consistent Depth Clear**: All render passes now clear to `0.0` (standard for Reverse-Z) instead of `1.0`.
- **Unified Depth Testing**: Atmosphere and snow systems now correctly test against the high-precision terrain depth.

### Fixed
- **Overlapping Terrain Quads**: Resolved the critical bug where distant terrain quads would draw over near ones (due to legacy `depthCompare: always`).
- **Avatar Self-Occlusion**: Fixed artifacts in the skeletal character by removing hardcoded legacy logarithmic depth overrides.
- **Ocean Restoration**: Re-enabled `landMask` logic in the terrain shader, restoring the sea-level transition and translucent water.

---

## 2025-12-27 (Instanced Terrain Rendering & GPU-Side Projection)

### Added
- **GPU-Driven Instanced Rendering**:
    - Reduced terrain draw calls from **~500 to 1** per frame using a single `drawIndexedInstanced` call.
    - Massive CPU performance gains by offloading geometric orchestration to the GPU.
- **Unified Shared Geometry**:
    - Implemented a static `unitGridBuffer` and `unitGridIndexBuffer` shared by all chunks globally.
    - Eliminated redundant per-mesh vertex/index buffers, significantly reducing VRAM usage and initialization lag.
- **GPU-Side Cube-to-Sphere Projection**:
    - Relocated all projection mathematics (normalized cube-to-sphere mapping) from CPU to WGSL vertex shaders.
    - Uses `earthCenter` as the common origin for all instances, ensuring perfect alignment.
- **Proximity Shadow Instancing**:
    - Refactored the shadow mapping system to utilize the instanced layout.
    - High-fidelity shadows now align perfectly with GPU-displaced terrain.

### Changed
- **Zero-Wait Initialization**: Chunks are now "virtual" metadata objects until they reach the GPU, eliminating the heavy CPU geometry generation loop.
- **Simplified Instance Data**: Each terrain instance is now represented by a compact 48-byte structure in a global storage buffer.

### Fixed
- **"Exploded Quads" Artifact**: Resolved visual gaps between chunks by synchronizing projection origins in shaders.
- **Initialization Crash**: Fixed `GPUBindGroup` and `writeBuffer` errors related to buffer sizing and missing `maxChunks` references.

### Removed
- Obsolete per-mesh coordinate storage and redundant CPU vertex generation logic in `TerrainMesh.js`.
- Legacy `chunkUniformBuffer` and dynamic offset system.

---

## 2025-12-27 (GPU Frustum Culling)

### Added
- **GPU Compute Culling**:
    - Implemented horizon culling on GPU via WGSL compute shader (`lib/shaders/frustumCull.compute.wgsl.js`).
    - Async 1-frame latency pattern for non-blocking GPU readback.
    - Adaptive horizon margin based on altitude and chunk radius.
    - Safety override: chunks with camera inside bounding sphere always visible.
- **GPU Back-Cone Culling**:
    - Cull chunks more than 120° behind camera (outside frustum).
    - Angular radius compensation prevents popping at boundaries.
    - Typical ~5% additional culling at high LOD levels.
- **Visual Culling Stats**: 
    - UI now shows `rendered/total (-culled)` format.
    - Green = rendered, Gray = total, Red = GPU-culled count.

### Changed
- **100% GPU Culling**: Removed CPU fallback culling in render loop. All visibility is now GPU-determined.
- **Simplified UI**: Removed Horizon Cull, Frustum Cull, and Quadtree Cull checkboxes from control panel (now always active).

### Removed
- `gpuCullingEnabled` toggle and `setGPUCulling()` method.
- CPU-based `frustumCuller.shouldRender()` calls in render loop.
- Debug logging in GPU culling async callback.
- Culling checkbox event listeners and callbacks.

---

## 2025-12-27 (Avatar High-Fidelity & Infrastructure Cleanup)

### Added
- **High-Fidelity Skeletal Shadow Mapping**:
    - Implemented real-time humanoid shadow projection with **20m radius** (40m coverage) for long-range shadows.
    - Added **Percentage Closer Filtering (PCF)** for soft, jitter-free shadow edges.
    - Perfect planetary alignment: shadows account for the local "up" vector in the floating origin system.
- **Modular Avatar Configuration**:
    - Created `lib/config/avatarConfig.js` to centralize model URLs, scale, and max bones.
    - Introduced **`heightOffset`**: Millimetric control for avatar ground seating (sinking/floating adjustments).
- **Configurable Gravity**:
    - Moved planetary downward pull to `lib/config/movementConfig.js` for easy physics tuning.
- **Atmospheric Avatar Lighting**:
    - Rewrote character shader to be "Planetary Aware": avatar color and brightness now transition during sunset/night.
    - Synchronized character tonemapping with terrain to eliminate the "incandilado" (overexposed) appearance.

### Changed
- **Pure GPU Physics (Hard Transition)**:
    - Completely removed all CPU-side height sampling logic (`getAltitudeAboveTerrain`).
    - The engine is now **100% GPU-compute driven** for terrain interaction, maximizing main-thread FPS.
    - Implemented a "Movement Lock" safeguard during initial GPU data readback for stability.

### Refactored & Cleaned
- **Legacy Removal**: 
    - Deleted `lib/terrain/avatar-mesh.js` and removed all capsule/box fallback logic from `PlanetRenderer.js`.
    - Pure humanoid skeletal rendering is now the only path.
- **Codebase Consolidation**:
    - Purged dead code in `height.js` and consolidated terrain exports in `index.js`.
    - Commented out verbose skeletal mapping logs in `CharacterSystem.js` for a cleaner dev console.

## 2025-12-26 (Nervland Style & Biome Synchronization)

### Added
- **Nervland Topography Controls**:
    - **Terracing**: Added layered mountain effects with adjustable amount and smoothness.
    - **Mountain Sharpness**: Ridge-based sharpness control for more aggressive peaks.
    - **Ocean Shelf Width**: Parametric control for continental shelf extension.
- **Advanced Biome Transitions**:
    - **Snow Line**: Real-time altitude control for snow coverage.
    - **Beach Width**: Adjustable shoreline depth for tropical coastlines.
    - **Rock Slope**: Threshold control for rocky outcrops on ridges.
    - **Grass Line**: Moisture-based vegetation thresholds.
- **Texture-Biome Synchronization**:
    - KTX2 detail textures (Sand, Snow, Rock, Grass) now perfectly synchronize with procedural color transitions for a coherent visual.
- **Parametric Reset & Randomization**:
    - Optimized "Generate Random" and "Reset" buttons to leverage all new Nervland parameters.

### Changed
- **Pure Procedural Architecture**: Completely removed the retired terrain baking system, reducing complexity and ensuring 100% real-time generation.
- **Unified Shader Parity**: Synchronized render and compute shaders to ensure visual topography matches physical collisions and gravity.

### Fixed
- **Zero-Value Parameter Handling**: Fixed a bug where parameters set to 0.0 in the UI would fallback to default values.
- **Altitude Scaling**: Re-calibrated biome altitude units for better sensitivity at planetary scales.

## 2025-12-26 (Terrain Stabilization & Ocean Color Restoration)

### Added
- **Organized Water Assets**: Moved all ocean and water textures to `assets/textures/sources-textures/water/` for better project structure.
- **Enhanced Biome Thresholds**: 
  - **Beach**: Now restricted to $< 3$km altitude to prevent sandy mountains.
  - **Snow**: Lowered visibility threshold from $12$km to $8$km for more majestic high peaks.

### Fixed
- **Ocean Color Restoration**: Standardized altitude scaling in the terrain fragment shader, restoring deep blue and turquoise gradients based on kilometer-scale depth.
- **Stable Texture Indexing**: Reverted terrain shader to a rock-solid 11-layer fixed indexing system, eliminating all "halo" artifacts and jitter.
- **Missing Texture Paths**: Updated `terrainConfig.js` to resolve 404 errors by pointing to the newly organized texture locations.
- **Altitude Consistency**: Fixed several shader calculations that were incorrectly using unscaled raw height instead of kilometers.

## 2025-12-24 (Definitive Triple-Layer Cloud System & UI)

### Added
- **Triple-Layer Cloud Architecture**: Implemented a high-performance system with three independent layers:
  - **Layer 1 (Base)**: Primary detailed structure ($1.0x$ speed, $0.008$ scale).
  - **Layer 2 (Dynamic)**: High-altitude wind effect ($1.5x$ speed, $0.005$ scale).
  - **Layer 3 (Stratospheric)**: Slow, ultra-broad haze ($0.5x$ speed, $0.002$ scale) for deep parallax.
- **Granular Cloud Controls**: 
  - Independent **Visibility (Opacity)** sliders for all 3 layers.
  - Independent **RGB Tinting** controls for all 3 layers to simulate depth and atmospheric scattering/tinting.
- **Cloud Pattern Baking**: Shifted to a GPU-compute baking approach for the cloud texture, ensuring **maximum FPS** while maintaining high detail.
- **Weather Presets System**: Added **Clean Sky**, **Normal**, and **Storm** presets for instant atmospheric transformation.
- **Smooth Interpolation Engine**: Implemented a frame-based `lerp` system for all atmospheric parameters, allowing cinematic transitions between weather states.
- **Premium Preset UI**: Modernized the control panel with glassmorphism-styled buttons and active-state highlighting.
- **Refined Cloud Coverage Scale (Hard-Shift)**: Re-mapped the coverage slider to a "Hard-Shift" scale where $0.0$ produces visible fair-weather clouds and $1.0$ yields a dense, non-white-out overcast.

### Fixed
- **Avatar Ground Interaction**: Eliminated the "bouncing/catapulting" behavior when the avatar hits the terrain.
- **WebGPU Buffer Alignment**: Corrected uniform buffer sizing and "offset out of bounds" errors by synchronizing CPU/GPU memory layouts (368 bytes).
- **Shader Realism**: Universal "Soft-Edge" realism applied to all cloud layers for organic transitions.
- **Fixed Clouds Toggle**: Resolved an issue where cloud layers remained partially visible when the global toggle was deactivated.

## 2025-12-24 (Cloud Optimization)

### Added
- **Uniform Cloud Fade at Atmosphere Edge**
  - Clouds smoothly fade out between 80-100km altitude
  - Entire cloud layer fades uniformly as a single unit
  - Natural transition when exiting/entering atmosphere

- **Centralized Atmosphere Config** (`lib/config/atmosphereConfig.js`)
  - Default values for cloud coverage, speed, storm intensity
  - `cloudMaxAltitude` parameter for future configurability

### Performance
- **GPU Early-Out for Clouds**
  - Skip expensive ray-march computation when clouds are invisible (>100km altitude)
  - ~100% performance improvement for cloud rendering in space
  - No performance change at ground level (clouds render normally)

---

## 2025-12-23 (Direct Movement & UI Simplification)

### Changed
- **Direct Movement System**: Replaced the velocity-based physics with a direct position-based system.
- **Inertia & Auto-Braking Removal**: Eliminated automatic braking, drag, and speed-based inertia for instant, precise controls.
- **UI Simplification**: Removed the "Speed" section (bar and value) from the control panel dashboard.
- **Stats Refactor**: Updated `UIManager` and `mainPlanet` to remove real-time velocity tracking and focus on altitude-based navigation.
- **Grid Mode Visual Refinements**: 
  - Implemented a **red checkerboard pattern** (50% opacity) for primary quads in grid mode.
  - Updated sub-quad caps to **green** (30% opacity) for better nested detail visualization.
- **Atmosphere Gating**: Automatically disable atmosphere rendering when Grid mode or Quads debug mode is active to improve technical visualization.

### Fixed
- **LOD 1-5 Texture Transition**: Restored the extended fade range for surface textures and bump mapping for smoother visual progression.

## 2025-12-23 (Float32 Precision Fixes)
- **Ocean Edge Vibration (Float32 Jitter)**
  - Replaced hard `if (altitude > 0.0)` with smooth `smoothstep(-0.5, 0.5, altitude)` blend
  - Creates 1km transition zone between ocean and land colors
  - Eliminates pixel flickering at coastline boundaries

- **Ocean Fresnel Precision**
  - `GetTerrainColor` now receives `viewDir` as interpolated parameter
  - Removes redundant recalculation `normalize(cameraPos - worldPos)` in fragment shader
  - Uses vertex-shader interpolated `in.viewDir` for stability

- **Ocean Noise Precision**
  - Changed `gradientNoise(worldPos * 85.0)` to `gradientNoise(localUp * 500.0)`
  - Uses normalized direction (-1..1) instead of absolute position (~6360 km)
  - Prevents float32 overflow in noise calculation

- **Horizon Culling Coordinates**
  - Fixed coordinate system mismatch in `FrustumCuller.shouldRender()`
  - `mesh.boundingSphere.center` is planet-local (planet at origin)
  - Now correctly converts camera to planet-local: `cameraInPlanetLocal = -earthCenterOffset`

- **Near Clipping Plane**
  - Reduced near plane from 0.001km (1m) to 0.0005km (50cm)
  - Prevents terrain clipping when camera is close to ground

- **Adaptive Horizon Culling Margin**
  - Fixed LOD 0 quads being incorrectly culled at high altitude
  - Margin now adapts: 0.3 at surface, up to 1.1 at high orbit
  - Formula: `margin = 0.3 + 0.4 * (altitudeRatio - 1)`

- **Bump Texture Transition**
  - Extended texture/bump fade range from LOD 2-4 to LOD 1-5
  - Eliminates abrupt appearance when approaching planet
  - Smoother 4-level transition instead of 2-level

---

## 2025-12-23

### Changed
- **Mesh Resolution 24×24 (NervLand Style)**
  - Increased `MESH_RESOLUTION` from 17 to 25 (25×25 vertices = 24×24 cells)
  - Updated `QUAD_GRID_SIZE` to 24 in quadtree.js
  - Updated pool.js and mesh.js default resolution
  - Aligned atmosphere shader sub-divisions to 24.0

- **Sub-Quads Visualization Aligned with Real Mesh**
  - Changed shader sub-quad grid from 32×32 to 24×24 to match actual geometry
  - Grid mode now shows translucent orange checkerboard fills (24×24) for sub-quads
  - Wireframe grid lines now aligned with real mesh cells

### Added
- **Real-Time Terrain Configuration Panel**
  - 12 adjustable parameters: Warp, Mask Freq, Base Frequency, Amplitude, Persistence, Lacunarity, Contrast Exp, Height Scale, Sea Offset, Mountain Detail, Trench Depth, Final Scale.
  - GPU uniform buffer (`terrainParamsBuffer`) updated in real-time.
  - Toggle button 🏔️ Terrain in control panel.

- **Environment Configuration Panel**
  - Moved cloud, fog, lighting, and camera sliders to dedicated popup.
  - Toggle button 🌤️ Environment in control panel.
  - Panels are mutually exclusive (one closes the other).

- **Horizon & Frustum Culling System**
  - Advanced mathematical Horizon Culling based on planet curvature.
  - Relaxed Frustum Culling with back-cone margin (143°) to prevent popping.
  - Dynamic margin scaling for root nodes (65%) vs detail quads (15%).
  - Integrated visibility checks into Quadtree subdivision recursion.
  - UI display for real-time culling statistics.

- **Strict 10x10 Ring-LOD System**
  - Implemented angular-based subdivision (radius 5 for 10x10 block)
  - Logarithmic LOD scaling (`Level = log2(BaseElevation / AGL)`)
  - Constant visual size for terrain quads during descent

### Fixed
- **Floating Origin Compliance Audit**
  - Verified all world math uses Float64 on CPU
  - Confirmed `earth_center` relative offsets for GPU Float32 precision
  - Eliminated jitter at LOD 22 (~64M units from origin)

### Refactored
- **Codebase Cleanup**
  - Unified WebGPU device acquisition in `init.js`
  - Purged redundant `WebGPUInit.js` and `camera.js` files
  - Removed unused `initAtmospherePipeline` and root-level `config.js`
  - Tightened `mainPlanet.js` and updated modular imports

---

## 2025-12-22

### Added
- **Frustum Culling** (`19b6b1f`)
  - Correct floating-origin coordinate system for terrain culling
  - Improved rendering performance at high LOD levels

- **Volumetric Cloud System** (`6119461`, `84a6c5a`)
  - 3D world-space noise with optimized v2.1 algorithm
  - Cloud controls: coverage, speed, fog intensity, storm mode
  - Clouds toggle checkbox in UI

- **Quad-Layer Solar Logic** (`7df524f`, `4e8329b`)
  - Nuclear Core + Tight Halo + Ethereal Aura for space
  - Incandescent 2-tier system for midday atmosphere
  - Extreme Progressive Solar Transition path-based logic

- **Micro-Relief and Procedural Textures** (`794ad13`)
  - Normal mapping for grass, sand, rock, desert
  - Infinite non-tiling surface detail

### Refactored
- **Modular lib/ Architecture** (unreleased)
  - Reorganized codebase into `lib/` with 27 files
  - Modules: `core/`, `shaders/`, `terrain/`, `systems/`, `textures/`, `math/`
  - Removed 11 legacy root-level files
  - Updated all imports to use modular structure

---

## 2025-12-21

### Added
- **Enhanced UI and LOD Visualization** (`a440b4d`, `ab7a247`)
  - Unified quad visualization system
  - Grid overlay refinement
  - Refined LOD visualization UI behavior

### Changed
- **Code Cleanup** (`d375d22`)
  - Removed extra whitespace in mainPlanet.js

---

## 2025-12-20

### Added
- **Mesh-Based Avatar Capsule** (`850b55f`)
  - Replaced ray-traced avatar with proper mesh geometry
  - Capsule rotates to align with local up direction

- **Procedural Starry Sky** (`267adbb`)
  - Dynamic star field based on view direction
  - Visible at high altitudes and night

- **Sun Bloom/Glow Effect** (`2ee3ed7`)
  - Dramatic sunrise appearance
  - Altitude-adaptive intensity

- **Lunar Illumination** (`049ff75`)
  - Night hemisphere lighting from moon
  - Dynamic moon brightness

- **Majestic Scale (110x)** (`cacfd53`)
  - Floating Origin implementation
  - MSL/AGL dual altitude display

### Fixed
- **Terrain Physics Sync** (`19a0561`)
  - CPU physics now matches visual mesh displacement
  
- **Day/Night Cycle** (`428107d`)
  - Fixed terrain culling, normals, and atmospheric fog

- **Avatar Ground Positioning** (`7827ea9`)
  - Lift avatar sphere 1m above terrain surface

- **Performance Optimization** (`cb4bb22`)
  - Eliminated double displacement in terrain rendering

### Refactored
- **Avatar System Cleanup** (`dda2cb1`, `bd67db4`)
  - Removed ray-traced avatar residue
  - Removed spherical shadow projection

---

## 2025-12-19

### Fixed
- **Terrain Jitter Elimination** (`8f03462`)
  - Root cause identified: Float32 precision loss when computing `earth_radius² - camera_radius²` (~40M - ~40M)
  - Solution: CPU precomputes discriminant base with Float64 precision using formula `-altitude * (2*R + altitude)`
  - GPU receives precomputed value, eliminating large number subtraction
  - Also unified ground intersection method (removed dual-method approach that caused visual jumps at 10km altitude)

### Changed
- **MAX_LOD_LEVEL Restored to 22** (`daf3045`)
  - Reverted from 16 back to 22 levels for NervLand compatibility
  - MIN_QUAD_SIZE check remains to prevent excessive subdivisions

---

## 2025-12-18

### Added
- **Visual Preview** (`a991bee`)
  - Added branding updates and author format
  - Included visual preview in documentation

### Fixed
- **LOD Performance Optimization** (`9ace732`)
  - Reduced MAX_LOD_LEVEL from 22 to 16 (later reverted)
  - Added MIN_QUAD_SIZE (10m) to prevent meaningless subdivisions at ground level
  - Fixed issue where quad count exploded to ~1900+ at low altitude causing GPU strain

- **Velocity Deadzone for Terrain Stability** (`e1979e9`)
  - Added adaptive velocity deadzone that activates only when no movement keys are pressed
  - Base threshold: 1 μm/s for high altitudes
  - Low altitude (<1km): adaptive threshold up to 10 m/s
  - Prevents micro-movements that cause terrain recalculation jitter

- **Avatar Ground Positioning** (`b90d13f`)
  - Avatar sphere now sits ON ground instead of being half-buried
  - Added radius offset in local up direction (from Earth center)
  - Base of sphere touches terrain surface rather than center at ground level

- **Sphere Occlusion and Lighting** (`31f3c4f`)
  - Fixed sphere/ground overlap where ground was bleeding through spheres
  - Simplified sphere lighting to use only direct sun illumination
  - Removed atmospheric LUT functions that contained ground-bounce effects
  - Added subtle ambient lighting for shadow areas

- **Depth-Based Occlusion** (`9aeaf91`)
  - Implemented proper depth testing for spheres and ground
  - Closest object fully occludes objects behind it
  - Removed alpha blending for opaque objects that caused translucency bugs

### Changed
- **Code Cleanup** (`c51cc5b`, `e6475cf`, `99dfe5e`)
  - Removed dead code from quad system
  - Moved unused main.js to resources/ directory
  - Phase 5.4: General code cleanup and README update

### Refactored
- **CPU/GPU Separation** (`a27b98c`)
  - Phase 5.1: Moved object definitions from GPU to CPU
  - Following principle: CPU = what exists, GPU = how it looks
  - CPU defines objects with positions/radii, GPU renders them

- **Precision Architecture** (`deef8bd`)
  - Resolved planetary rendering jitter and precision issues
  - Established Float64 (CPU) / Float32 (GPU) separation pattern
  - Camera-relative rendering to avoid large coordinate operations

---

## 2025-12-18 (Initial)

### Added
- **Initial Commit** (`e96dec4`)
  - WebGPU planetary atmospheric scattering implementation
  - Based on- **Cloud Rendering Optimization**: Switched from expensive volumetric ray-marching to a high-performance Cloud LUT (Look-Up Table) approach.
  - Reached **120 FPS constant** with clouds enabled.
  - Implemented **Planar Projection** for realistic horizon perspective.
  - Added organic UV distortion for a more natural, non-spherical look.
- **Artistic Sky Stylization**: Added real-time artistic filters for the atmosphere.
  - New UI controls for **Saturation**, **Vibrance**, and **RGB Tint**.
  - Integrated cinematic presets: *Cinematic Blue*, *Planet X* (Alien), and *Blood Horizon*.
  - Implementation is math-based and has **zero performance impact**.
  - Cube-sphere terrain projection with Proland-style quadtree LOD
  - Real-time rendering of Earth-scale planet with atmosphere

---

## Architecture Decisions

### Float64/Float32 Precision Strategy
The project uses a hybrid precision approach:
- **CPU (JavaScript)**: Float64 for all position calculations, distances, and physics
- **GPU (WGSL)**: Float32 with camera-relative coordinates
- **Data Transfer**: CPU precomputes precision-critical values, passes small offsets to GPU

### Key Formulas (CPU-Precomputed)
```javascript
// Discriminant base (avoids 40M - 40M in shader)
discriminantBase = -altitude * (2 * EARTH_RADIUS + altitude)

// Camera altitude/radius with Float64
cameraRadius = sqrt(dx² + dy² + dz²)
cameraAltitude = cameraRadius - EARTH_RADIUS
```

### LOD System
- 22 levels of detail (matching NervLand)
- Proland-style quadtree subdivision
- MIN_QUAD_SIZE prevents subdivisions below 10cm
- SPLIT_FACTOR 2.0 controls subdivision density

---

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
