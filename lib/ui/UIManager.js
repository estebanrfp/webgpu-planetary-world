import { STORAGE_KEYS, UI_CONFIG } from '../config/index.js'

/**
 * UIManager
 * Handles DOM elements, event listeners, and UI updates.
 * 
 * @param {Object} initialEnv - Initial environment state
 * @param {Object} callbacks - Map of UI event callbacks
 * @returns {Object} UIManager instance
 */
export const createUIManager = (initialEnv, callbacks = {}) => {
  // --- STATE ---
  let _callbacks = callbacks;
  let _env = initialEnv;

  // --- HELPERS ---
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  };

  const rgbToHex = (r, g, b) => {
    const toHex = (c) => {
      const hex = Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  };
  
  // UI Elements Cache
  const elements = {
    // Stats (Core) - Use getters because these might be injected late via DebugUI
    get fpsSpan() { return document.getElementById('fps'); },
    get tileSpan() { return document.getElementById('tile-count'); },
    get mslSpan() { return document.getElementById('msl-height'); },
    get heightSpan() { return document.getElementById('camera-height'); },
    get lodSpan() { return document.getElementById('lod-levels'); },
    get zoneIndicator() { return document.getElementById('zone-indicator'); },
    get positionInfo() { return document.getElementById('position-info'); },
    
    // Checkboxes (Core Debug)
    get cbShowQuads() { return document.getElementById('cb-show-quads'); },
    get cbShowSubquads() { return document.getElementById('cb-show-subquads'); },
    get cbDrawSkirts() { return document.getElementById('cb-draw-skirts'); },
    get cbTerrainColor() { return document.getElementById('cb-terrain-color'); },
    get cbTerrainNoise() { return document.getElementById('cb-terrain-noise'); },
    get cbTerrainBump() { return document.getElementById('cb-terrain-bump'); },
    get cbAtmosphere() { return document.getElementById('cb-atmosphere'); },
    get cbSnow() { return document.getElementById('cb-snow'); },
    get cbNpcs() { return document.getElementById('cb-npcs'); },
    get cbBypassScatter() { return document.getElementById('cb-bypass-scatter'); },
    get cbBypassTextures() { return document.getElementById('cb-bypass-textures'); },
    get cbBypassLighting() { return document.getElementById('cb-bypass-lighting'); },
    get cbBypassShadows() { return document.getElementById('cb-bypass-shadows'); },
    
    // Core Buttons
    get modeButtons() { return document.querySelectorAll('.mode-btn'); },
    get btnGrid() { return document.getElementById('btn-mode-grid'); },

    // --- Sub-panels (Loaded on demand) ---
    // Environment
    envConfigPanel: null,
    btnCloseEnvConfig: null,
    sliderCloudCoverage: null,
    valueCloudCoverage: null,
    sliderCloudLayer1: null,
    valueCloudLayer1: null,
    sliderCloudLayer2: null,
    valueCloudLayer2: null,
    sliderCloudLayer3: null,
    valueCloudLayer3: null,
    pickerCloudL1: null,
    sliderCloudL1Int: null,
    valueCloudL1Int: null,
    pickerCloudL2: null,
    sliderCloudL2Int: null,
    valueCloudL2Int: null,
    pickerCloudL3: null,
    sliderCloudL3Int: null,
    valueCloudL3Int: null,
    btnWeatherClean: null,
    btnWeatherNormal: null,
    btnWeatherStorm: null,
    btnWeatherSnow: null,
    btnWeatherRain: null,
    btnWeatherOvercast: null,
    sliderRainIntensity: null,
    valueRainIntensity: null,
    sliderCloudSpeed: null,
    valueCloudSpeed: null,
    sliderSkySaturation: null,
    valueSkySaturation: null,
    sliderSkyVibrance: null,
    valueSkyVibrance: null,
    pickerSkyTint: null,
    sliderSkyTintInt: null,
    valueSkyTintInt: null,
    cbVolumetricShadows: null,
    sliderAuroraIntensity: null,
    valueAuroraIntensity: null,
    sliderAuroraSpeed: null,
    valueAuroraSpeed: null,
    sliderAuroraAltitude: null,
    valueAuroraAltitude: null,
    pickerAuroraBase: null,
    sliderAuroraBaseInt: null,
    valueAuroraBaseInt: null,
    pickerAuroraTop: null,
    sliderAuroraTopInt: null,
    valueAuroraTopInt: null,
    sliderDayCycleSpeed: null,
    valueDayCycleSpeed: null,

    // Terrain
    terrainConfigPanel: null,
    btnCloseTerrainConfig: null,
    sliderMaskFreq: null,
    valueMaskFreq: null,
    sliderBaseFreq: null,
    valueBaseFreq: null,
    sliderBaseAmp: null,
    valueBaseAmp: null,
    sliderPersistence: null,
    valuePersistence: null,
    sliderLacunarity: null,
    valueLacunarity: null,
    sliderContrastExp: null,
    valueContrastExp: null,
    sliderContrastScale: null,
    valueContrastScale: null,
    sliderAbyssDetail: null,
    valueAbyssDetail: null,
    sliderDetailScale: null,
    valueDetailScale: null,
    sliderOctaves: null,
    valueOctaves: null,
    sliderWarp2: null,
    valueWarp2: null,
    sliderLakeDetail: null,
    valueLakeDetail: null,
    sliderGrassCoverage: null,
    valueGrassCoverage: null,
    sliderSandCoverage: null,
    valueSandCoverage: null,
    sliderSnowCoverage: null,
    valueSnowCoverage: null,
    sliderRockCoverage: null,
    valueRockCoverage: null,
    sliderMoisture: null,
    valueMoisture: null,
    pickerColGrass: null,
    sliderColGrassInt: null,
    valueColGrassInt: null,
    pickerColForest: null,
    sliderColForestInt: null,
    valueColForestInt: null,
    pickerColRock: null,
    sliderColRockInt: null,
    valueColRockInt: null,
    pickerColSnow: null,
    sliderColSnowInt: null,
    valueColSnowInt: null,
    pickerColSand: null,
    sliderColSandInt: null,
    valueColSandInt: null,
    pickerColGround: null,
    sliderColGroundInt: null,
    valueColGroundInt: null,
    pickerColShallow: null,
    sliderColShallowInt: null,
    valueColShallowInt: null,
    pickerColDeep: null,
    sliderColDeepInt: null,
    valueColDeepInt: null,
    sliderTerraceAmt: null,
    valueTerraceAmt: null,
    sliderTerraceSmooth: null,
    valueTerraceSmooth: null,
    sliderSharpness: null,
    valueSharpness: null,
    sliderShelfWidth: null,
    valueShelfWidth: null,
    sliderBeachWidth: null,
    valueBeachWidth: null,
    sliderSnowLine: null,
    valueSnowLine: null,
    sliderSandSharp: null,
    valueSandSharp: null,
    sliderRockThreshold: null,
    valueRockThreshold: null,
    sliderGrassThreshold: null,
    valueGrassThreshold: null,
    btnGenerateTerrain: null,
    btnResetTerrain: null,
    btnResetShape: null,
    btnResetBiomes: null,
    btnResetLandforms: null,
  };
  
  /**
   * Initialize Terrain Editor Tab switching
   */
  /**
   * Initialize generic tab switching for panels
   * @param {string} tabContainerSelector - Container with .tab-btn elements
   * @param {string} contentContainerId - Container with .tab-content elements
   */
  const _initPanelTabs = (tabContainerSelector, contentContainerId) => {
    const tabContainer = document.querySelector(tabContainerSelector);
    if (!tabContainer) return;
    
    const tabBtns = tabContainer.querySelectorAll('.tab-btn');
    const contentContainer = document.getElementById(contentContainerId);
    if (!contentContainer) return;
    
    const tabContents = contentContainer.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        
        // Update buttons
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `tab-${targetTab}`) {
            content.classList.add('active');
          }
        });
      });
    });
  };

  /**
   * Initialize Environment panel listeners
   */
  const initEnvironmentListeners = () => {
    console.log('[UIManager] Binding Environment listeners...');
    const el = elements;
    
    // Populate cache
    el.envConfigPanel = document.getElementById('env-config-panel');
    el.btnCloseEnvConfig = document.getElementById('btn-close-env-config');
    el.sliderCloudCoverage = document.getElementById('slider-cloud-coverage');
    el.valueCloudCoverage = document.getElementById('value-cloud-coverage');
    el.sliderCloudLayer1 = document.getElementById('slider-cloud-layer1');
    el.valueCloudLayer1 = document.getElementById('value-cloud-layer1');
    el.sliderCloudLayer2 = document.getElementById('slider-cloud-layer2');
    el.valueCloudLayer2 = document.getElementById('value-cloud-layer2');
    el.sliderCloudLayer3 = document.getElementById('slider-cloud-layer3');
    el.valueCloudLayer3 = document.getElementById('value-cloud-layer3');
    el.pickerCloudL1 = document.getElementById('picker-cloud-l1');
    el.sliderCloudL1Int = document.getElementById('slider-cloud-l1-intensity');
    el.valueCloudL1Int = document.getElementById('value-cloud-l1-intensity');
    el.pickerCloudL2 = document.getElementById('picker-cloud-l2');
    el.sliderCloudL2Int = document.getElementById('slider-cloud-l2-intensity');
    el.valueCloudL2Int = document.getElementById('value-cloud-l2-intensity');
    el.pickerCloudL3 = document.getElementById('picker-cloud-l3');
    el.sliderCloudL3Int = document.getElementById('slider-cloud-l3-intensity');
    el.valueCloudL3Int = document.getElementById('value-cloud-l3-intensity');
    el.btnWeatherClean = document.getElementById('btn-weather-clean');
    el.btnWeatherNormal = document.getElementById('btn-weather-normal');
    el.btnWeatherStorm = document.getElementById('btn-weather-storm');
    el.btnWeatherSnow = document.getElementById('btn-weather-snow');
    el.btnWeatherRain = document.getElementById('btn-weather-rain');
    el.btnWeatherOvercast = document.getElementById('btn-weather-overcast');
    el.sliderRainIntensity = document.getElementById('slider-rain-intensity');
    el.valueRainIntensity = document.getElementById('value-rain-intensity');
    el.sliderCloudSpeed = document.getElementById('slider-cloud-speed');
    el.valueCloudSpeed = document.getElementById('value-cloud-speed');
    el.sliderSkySaturation = document.getElementById('slider-sky-saturation');
    el.valueSkySaturation = document.getElementById('value-sky-saturation');
    el.sliderSkyVibrance = document.getElementById('slider-sky-vibrance');
    el.valueSkyVibrance = document.getElementById('value-sky-vibrance');
    el.pickerSkyTint = document.getElementById('picker-sky-tint');
    el.sliderSkyTintInt = document.getElementById('slider-sky-tint-intensity');
    el.valueSkyTintInt = document.getElementById('value-sky-tint-intensity');
    el.cbVolumetricShadows = document.getElementById('cb-volumetric-shadows');
    el.cbAutonomousWeather = document.getElementById('cb-autonomous-weather');
    el.sliderAuroraIntensity = document.getElementById('slider-aurora-intensity');
    el.valueAuroraIntensity = document.getElementById('value-aurora-intensity');
    el.sliderAuroraSpeed = document.getElementById('slider-aurora-speed');
    el.valueAuroraSpeed = document.getElementById('value-aurora-speed');
    el.sliderAuroraAltitude = document.getElementById('slider-aurora-altitude');
    el.valueAuroraAltitude = document.getElementById('value-aurora-altitude');
    el.pickerAuroraBase = document.getElementById('picker-aurora-base');
    el.sliderAuroraBaseInt = document.getElementById('slider-aurora-base-int');
    el.valueAuroraBaseInt = document.getElementById('value-aurora-base-int');
    el.pickerAuroraTop = document.getElementById('picker-aurora-top');
    el.sliderAuroraTopInt = document.getElementById('slider-aurora-top-int');
    el.valueAuroraTopInt = document.getElementById('value-aurora-top-int');
    el.sliderDayCycleSpeed = document.getElementById('slider-day-cycle-speed');
    el.valueDayCycleSpeed = document.getElementById('value-day-cycle-speed');

    _initPanelTabs('#env-config-panel .panel-tabs', 'env-design-content');

    if (el.btnCloseEnvConfig) {
      el.btnCloseEnvConfig.addEventListener('click', () => el.envConfigPanel?.classList.remove('visible'));
    }

    // Bind sliders
    const setupSlider = (slider, span, callbackName) => {
      if (!slider) return;
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (span) span.textContent = val.toFixed(2);
        if (_callbacks[callbackName]) _callbacks[callbackName](val);
      });
    };

    setupSlider(el.sliderCloudCoverage, el.valueCloudCoverage, 'onCloudCoverageChange');
    setupSlider(el.sliderRainIntensity, el.valueRainIntensity, 'onRainIntensityChange');
    setupSlider(el.sliderCloudLayer1, el.valueCloudLayer1, 'onCloudLayer1Change');
    setupSlider(el.sliderCloudLayer2, el.valueCloudLayer2, 'onCloudLayer2Change');
    setupSlider(el.sliderCloudLayer3, el.valueCloudLayer3, 'onCloudLayer3Change');
    setupSlider(el.sliderCloudSpeed, el.valueCloudSpeed, 'onCloudSpeedChange');
    setupSlider(el.sliderSkySaturation, el.valueSkySaturation, 'onSkySaturationChange');
    setupSlider(el.sliderSkyVibrance, el.valueSkyVibrance, 'onSkyVibranceChange');
    setupSlider(el.sliderAuroraIntensity, el.valueAuroraIntensity, 'onAuroraIntensityChange');
    setupSlider(el.sliderAuroraSpeed, el.valueAuroraSpeed, 'onAuroraSpeedChange');
    setupSlider(el.sliderAuroraAltitude, el.valueAuroraAltitude, 'onAuroraAltitudeChange');

    if (el.cbSnow) {
      el.cbSnow.addEventListener('change', (e) => _callbacks.onSnowChange?.(e.target.checked));
    }
    if (el.cbVolumetricShadows) {
      el.cbVolumetricShadows.addEventListener('change', (e) => _callbacks.onVolumetricShadowsChange?.(e.target.checked));
    }
    if (el.cbAutonomousWeather) {
      el.cbAutonomousWeather.addEventListener('change', (e) => _callbacks.onAutonomousWeatherChange?.(e.target.checked));
    }
    setupSlider(el.sliderDayCycleSpeed, el.valueDayCycleSpeed, 'onDayCycleSpeedChange');

    const setupColorControl = (picker, intensitySlider, intensitySpan, callbackNames) => {
        if (!picker || !intensitySlider) return;
        const update = () => {
            const rgb = hexToRgb(picker.value);
            const intensity = parseFloat(intensitySlider.value);
            if (intensitySpan) intensitySpan.textContent = intensity.toFixed(2);
            if (_callbacks[callbackNames[0]]) _callbacks[callbackNames[0]](rgb[0] * intensity);
            if (_callbacks[callbackNames[1]]) _callbacks[callbackNames[1]](rgb[1] * intensity);
            if (_callbacks[callbackNames[2]]) _callbacks[callbackNames[2]](rgb[2] * intensity);
        };
        picker.addEventListener('input', update);
        intensitySlider.addEventListener('input', update);
    };

    setupColorControl(el.pickerCloudL1, el.sliderCloudL1Int, el.valueCloudL1Int, ['onCloudL1RChange', 'onCloudL1GChange', 'onCloudL1BChange']);
    setupColorControl(el.pickerCloudL2, el.sliderCloudL2Int, el.valueCloudL2Int, ['onCloudL2RChange', 'onCloudL2GChange', 'onCloudL2BChange']);
    setupColorControl(el.pickerCloudL3, el.sliderCloudL3Int, el.valueCloudL3Int, ['onCloudL3RChange', 'onCloudL3GChange', 'onCloudL3BChange']);
    setupColorControl(el.pickerSkyTint, el.sliderSkyTintInt, el.valueSkyTintInt, ['onSkyTintRChange', 'onSkyTintGChange', 'onSkyTintBChange']);
    setupColorControl(el.pickerAuroraBase, el.sliderAuroraBaseInt, el.valueAuroraBaseInt, ['onAuroraBaseRChange', 'onAuroraBaseGChange', 'onAuroraBaseBChange']);
    setupColorControl(el.pickerAuroraTop, el.sliderAuroraTopInt, el.valueAuroraTopInt, ['onAuroraTopRChange', 'onAuroraTopGChange', 'onAuroraTopBChange']);

    const bindPreset = (btn, preset) => btn?.addEventListener('click', () => _callbacks.onWeatherPresetChange?.(preset));
    bindPreset(el.btnWeatherClean, 'clean');
    bindPreset(el.btnWeatherNormal, 'normal');
    bindPreset(el.btnWeatherStorm, 'storm');
    bindPreset(el.btnWeatherSnow, 'snow');
    bindPreset(el.btnWeatherRain, 'rain');
    bindPreset(el.btnWeatherOvercast, 'overcast');

    document.querySelectorAll('#env-config-panel .preset-btn[data-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => _callbacks.onSkyPresetChange?.(e.target.dataset.preset));
    });

    // Initial sync
    syncSliders(_env);
    console.log('[UIManager] Environment listeners bound');
  };

  /**
   * Initialize Terrain panel listeners
   */
  const initTerrainListeners = () => {
    console.log('[UIManager] Binding Terrain listeners...');
    const el = elements;

    // Populate cache
    el.terrainConfigPanel = document.getElementById('terrain-config-panel');
    el.btnCloseTerrainConfig = document.getElementById('btn-close-terrain-config');
    el.sliderMaskFreq = document.getElementById('slider-mask-freq');
    el.valueMaskFreq = document.getElementById('value-mask-freq');
    el.sliderBaseFreq = document.getElementById('slider-base-freq');
    el.valueBaseFreq = document.getElementById('value-base-freq');
    el.sliderBaseAmp = document.getElementById('slider-base-amp');
    el.valueBaseAmp = document.getElementById('value-base-amp');
    el.sliderPersistence = document.getElementById('slider-persistence');
    el.valuePersistence = document.getElementById('value-persistence');
    el.sliderLacunarity = document.getElementById('slider-lacunarity');
    el.valueLacunarity = document.getElementById('value-lacunarity');
    el.sliderContrastExp = document.getElementById('slider-contrast-exp');
    el.valueContrastExp = document.getElementById('value-contrast-exp');
    el.sliderContrastScale = document.getElementById('slider-contrast-scale');
    el.valueContrastScale = document.getElementById('value-contrast-scale');
    el.sliderAbyssDetail = document.getElementById('slider-abyss-detail');
    el.valueAbyssDetail = document.getElementById('value-abyss-detail');
    el.sliderDetailScale = document.getElementById('slider-detail-scale');
    el.valueDetailScale = document.getElementById('value-detail-scale');
    el.sliderOctaves = document.getElementById('slider-octaves');
    el.valueOctaves = document.getElementById('value-octaves');
    el.sliderWarp2 = document.getElementById('slider-warp2');
    el.valueWarp2 = document.getElementById('value-warp2');
    el.sliderLakeDetail = document.getElementById('slider-lake-detail');
    el.valueLakeDetail = document.getElementById('value-lake-detail');
    el.sliderGrassCoverage = document.getElementById('slider-grass-coverage');
    el.valueGrassCoverage = document.getElementById('value-grass-coverage');
    el.sliderSandCoverage = document.getElementById('slider-sand-coverage');
    el.valueSandCoverage = document.getElementById('value-sand-coverage');
    el.sliderSnowCoverage = document.getElementById('slider-snow-coverage');
    el.valueSnowCoverage = document.getElementById('value-snow-coverage');
    el.sliderRockCoverage = document.getElementById('slider-rock-coverage');
    el.valueRockCoverage = document.getElementById('value-rock-coverage');
    el.sliderMoisture = document.getElementById('slider-moisture');
    el.valueMoisture = document.getElementById('value-moisture');
    el.pickerColGrass = document.getElementById('picker-col-grass');
    el.sliderColGrassInt = document.getElementById('slider-col-grass-int');
    el.valueColGrassInt = document.getElementById('value-col-grass-int');
    el.pickerColForest = document.getElementById('picker-col-forest');
    el.sliderColForestInt = document.getElementById('slider-col-forest-int');
    el.valueColForestInt = document.getElementById('value-col-forest-int');
    el.pickerColRock = document.getElementById('picker-col-rock');
    el.sliderColRockInt = document.getElementById('slider-col-rock-int');
    el.valueColRockInt = document.getElementById('value-col-rock-int');
    el.pickerColSnow = document.getElementById('picker-col-snow');
    el.sliderColSnowInt = document.getElementById('slider-col-snow-int');
    el.valueColSnowInt = document.getElementById('value-col-snow-int');
    el.pickerColSand = document.getElementById('picker-col-sand');
    el.sliderColSandInt = document.getElementById('slider-col-sand-int');
    el.valueColSandInt = document.getElementById('value-col-sand-int');
    el.pickerColGround = document.getElementById('picker-col-ground');
    el.sliderColGroundInt = document.getElementById('slider-col-ground-int');
    el.valueColGroundInt = document.getElementById('value-col-ground-int');
    el.pickerColShallow = document.getElementById('picker-col-shallow');
    el.sliderColShallowInt = document.getElementById('slider-col-shallow-int');
    el.valueColShallowInt = document.getElementById('value-col-shallow-int');
    el.pickerColDeep = document.getElementById('picker-col-deep');
    el.sliderColDeepInt = document.getElementById('slider-col-deep-int');
    el.valueColDeepInt = document.getElementById('value-col-deep-int');
    el.sliderTerraceAmt = document.getElementById('slider-terrace-amt');
    el.valueTerraceAmt = document.getElementById('value-terrace-amt');
    el.sliderTerraceSmooth = document.getElementById('slider-terrace-smooth');
    el.valueTerraceSmooth = document.getElementById('value-terrace-smooth');
    el.sliderSharpness = document.getElementById('slider-sharpness');
    el.valueSharpness = document.getElementById('value-sharpness');
    el.sliderShelfWidth = document.getElementById('slider-shelf-width');
    el.valueShelfWidth = document.getElementById('value-shelf-width');
    el.sliderBeachWidth = document.getElementById('slider-beach-width');
    el.valueBeachWidth = document.getElementById('value-beach-width');
    el.sliderSnowLine = document.getElementById('slider-snow-line');
    el.valueSnowLine = document.getElementById('value-snow-line');
    el.sliderSandSharp = document.getElementById('slider-sand-sharp');
    el.valueSandSharp = document.getElementById('value-sand-sharp');
    el.sliderRockThreshold = document.getElementById('slider-rock-threshold');
    el.valueRockThreshold = document.getElementById('value-rock-threshold');
    el.sliderGrassThreshold = document.getElementById('slider-grass-threshold');
    el.valueGrassThreshold = document.getElementById('value-grass-threshold');
    el.btnGenerateTerrain = document.getElementById('btn-generate-terrain');
    el.btnResetTerrain = document.getElementById('btn-reset-terrain');
    el.btnResetShape = document.getElementById('btn-reset-shape');
    el.btnResetBiomes = document.getElementById('btn-reset-biomes');
    el.btnResetLandforms = document.getElementById('btn-reset-landforms');

    _initPanelTabs('#terrain-config-panel .panel-tabs', 'terrain-design-content');

    if (el.btnCloseTerrainConfig) {
      el.btnCloseTerrainConfig.addEventListener('click', () => el.terrainConfigPanel?.classList.remove('visible'));
    }

    const setupTerrainSlider = (slider, span, paramName) => {
      if (!slider) return;
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (span) span.textContent = val.toFixed(2);
        _callbacks.onTerrainParamsChange?.({ [paramName]: val });
      });
    };

    setupTerrainSlider(el.sliderMaskFreq, el.valueMaskFreq, 'mountMaskFreq');
    setupTerrainSlider(el.sliderBaseFreq, el.valueBaseFreq, 'baseFrequency');
    setupTerrainSlider(el.sliderBaseAmp, el.valueBaseAmp, 'baseAmplitude');
    setupTerrainSlider(el.sliderPersistence, el.valuePersistence, 'persistence');
    setupTerrainSlider(el.sliderLacunarity, el.valueLacunarity, 'lacunarity');
    setupTerrainSlider(el.sliderContrastExp, el.valueContrastExp, 'contrastExp');
    setupTerrainSlider(el.sliderContrastScale, el.valueContrastScale, 'contrastScale');
    setupTerrainSlider(el.sliderAbyssDetail, el.valueAbyssDetail, 'abyssDetail');
    setupTerrainSlider(el.sliderDetailScale, el.valueDetailScale, 'detailScale');
    setupTerrainSlider(el.sliderOctaves, el.valueOctaves, 'octaves');
    setupTerrainSlider(el.sliderWarp2, el.valueWarp2, 'warpStrength2');
    setupTerrainSlider(el.sliderGrassCoverage, el.valueGrassCoverage, 'grassCoverage');
    setupTerrainSlider(el.sliderSandCoverage, el.valueSandCoverage, 'sandCoverage');
    setupTerrainSlider(el.sliderRockCoverage, el.valueRockCoverage, 'rockCoverage');
    setupTerrainSlider(el.sliderTerraceAmt, el.valueTerraceAmt, 'terraceAmount');
    setupTerrainSlider(el.sliderTerraceSmooth, el.valueTerraceSmooth, 'terraceSmooth');
    setupTerrainSlider(el.sliderSharpness, el.valueSharpness, 'mountainSharpness');
    setupTerrainSlider(el.sliderShelfWidth, el.valueShelfWidth, 'shelfWidth');
    setupTerrainSlider(el.sliderLakeDetail, el.valueLakeDetail, 'lakeDetail');
    setupTerrainSlider(el.sliderBeachWidth, el.valueBeachWidth, 'beachWidth');
    setupTerrainSlider(el.sliderSnowLine, el.valueSnowLine, 'snowLine');
    setupTerrainSlider(el.sliderSandSharp, el.valueSandSharp, 'sandSharpness');
    setupTerrainSlider(el.sliderRockThreshold, el.valueRockThreshold, 'rockThreshold');
    setupTerrainSlider(el.sliderGrassThreshold, el.valueGrassThreshold, 'grassThreshold');
    setupTerrainSlider(el.sliderMoisture, el.valueMoisture, 'globalMoisture');

    const setupTerrainColorControl = (picker, intensitySlider, intensitySpan, paramName) => {
        if (!picker || !intensitySlider) return;
        const update = () => {
            const rgb = hexToRgb(picker.value);
            const intensity = parseFloat(intensitySlider.value);
            if (intensitySpan) intensitySpan.textContent = intensity.toFixed(2);
            _callbacks.onTerrainParamsChange?.({ [paramName]: [rgb[0] * intensity, rgb[1] * intensity, rgb[2] * intensity] });
        };
        picker.addEventListener('input', update);
        intensitySlider.addEventListener('input', update);
    };

    setupTerrainColorControl(el.pickerColGrass, el.sliderColGrassInt, el.valueColGrassInt, 'colGrass');
    setupTerrainColorControl(el.pickerColForest, el.sliderColForestInt, el.valueColForestInt, 'colForest');
    setupTerrainColorControl(el.pickerColRock, el.sliderColRockInt, el.valueColRockInt, 'colRock');
    setupTerrainColorControl(el.pickerColSnow, el.sliderColSnowInt, el.valueColSnowInt, 'colSnow');
    setupTerrainColorControl(el.pickerColSand, el.sliderColSandInt, el.valueColSandInt, 'colSand');
    setupTerrainColorControl(el.pickerColGround, el.sliderColGroundInt, el.valueColGroundInt, 'colGround');
    setupTerrainColorControl(el.pickerColShallow, el.sliderColShallowInt, el.valueColShallowInt, 'colShallowSea');
    setupTerrainColorControl(el.pickerColDeep, el.sliderColDeepInt, el.valueColDeepInt, 'colDeepSea');

    if (el.btnGenerateTerrain) {
        el.btnGenerateTerrain.addEventListener('click', () => {
            el.btnGenerateTerrain.innerText = "🎲 ...";
            _callbacks.onGenerateRequest?.();
            setTimeout(() => { el.btnGenerateTerrain.innerText = "🎲 Random"; }, 500);
        });
    }

    el.btnResetTerrain?.addEventListener('click', () => _callbacks.onResetTerrain?.());
    el.btnResetShape?.addEventListener('click', () => _callbacks.onResetShape?.());
    el.btnResetBiomes?.addEventListener('click', () => _callbacks.onResetBiomes?.());
    el.btnResetLandforms?.addEventListener('click', () => _callbacks.onResetLandforms?.());

    // Initial sync
    if (_callbacks.onGetTerrainParams) {
        syncTerrainSliders(_callbacks.onGetTerrainParams());
    }
    console.log('[UIManager] Terrain listeners bound');
  };

  /**
   * Initialize core UI event listeners
   */
  const initListeners = () => {
    const el = elements;
    
    // Core Debug Checkboxes
    const setupCheckbox = (elem, flagBit, callbackName) => {
      if (elem) {
        elem.addEventListener('change', (e) => {
            _callbacks.onDebugFlagChange?.(flagBit, e.target.checked);
            if (callbackName) _callbacks[callbackName]?.(e.target.checked);
        });
      }
    };

    setupCheckbox(el.cbShowQuads, UI_CONFIG.DEBUG_FLAGS.QUADS);
    setupCheckbox(el.cbShowSubquads, UI_CONFIG.DEBUG_FLAGS.SUBQUADS);
    setupCheckbox(el.cbDrawSkirts, UI_CONFIG.DEBUG_FLAGS.SKIRTS);
    setupCheckbox(el.cbTerrainColor, UI_CONFIG.DEBUG_FLAGS.COLOR);
    setupCheckbox(el.cbTerrainNoise, UI_CONFIG.DEBUG_FLAGS.NOISE);
    setupCheckbox(el.cbTerrainBump, UI_CONFIG.DEBUG_FLAGS.BUMP);
    // Bypass checkboxes do NOT go through the debugFlags bitfield — they have dedicated callbacks
    // because the bits live in earthCenter.w (see uiConfig.BYPASS_FLAGS and renderer.setBypassFlags).
    el.cbBypassTextures?.addEventListener('change', (e) => _callbacks.onBypassTexturesChange?.(e.target.checked));
    el.cbBypassLighting?.addEventListener('change', (e) => _callbacks.onBypassLightingChange?.(e.target.checked));
    el.cbBypassShadows?.addEventListener('change', (e) => _callbacks.onBypassShadowsChange?.(e.target.checked));
    
    el.cbAtmosphere?.addEventListener('change', (e) => _callbacks.onAtmosphereChange?.(e.target.checked));
    el.cbBypassScatter?.addEventListener('change', (e) => _callbacks.onScatterBypassChange?.(e.target.checked));
    // Snow + NPC toggles live in the Debug panel (Environment panel is gone).
    el.cbSnow?.addEventListener('change', (e) => _callbacks.onSnowChange?.(e.target.checked));
    el.cbNpcs?.addEventListener('change', (e) => _callbacks.onNpcsToggle?.(e.target.checked));

    // Mode Buttons
    el.modeButtons.forEach(btn => {
        if (btn.id === 'btn-mode-grid') return;
        btn.addEventListener('click', (e) => {
            el.modeButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const mode = parseInt(e.target.dataset.mode);
            _callbacks.onDisplayModeChange?.(mode);
        });
    });

    el.btnGrid?.addEventListener('click', () => {
         el.modeButtons.forEach(b => b.classList.remove('active'));
         el.btnGrid.classList.add('active');
         _callbacks.onGridModeToggle?.();
    });
  };

  /**
   * Re-bind core debug listeners (called when DebugUI is injected)
   */
  const rebindDebugListeners = () => {
      initListeners();
  };

  /**
   * Update real-time statistics in the UI
   */
  const updateStats = (fps, tileCount, mslKm, aglKm, zone, lod) => {
    const el = elements;
    if (el.fpsSpan) el.fpsSpan.textContent = fps;
    
    if (el.tileSpan) {
      if (typeof tileCount === 'object') {
        const culled = tileCount.total - tileCount.rendered;
        if (culled > 0) {
          el.tileSpan.innerHTML = `<span style="color:#6f6">${tileCount.rendered}</span>/<span style="color:#888">${tileCount.total}</span> <span style="color:#f66">(-${culled})</span>`;
        } else {
          el.tileSpan.innerHTML = `<span style="color:#6f6">${tileCount.rendered}</span>`;
        }
      } else {
        el.tileSpan.textContent = tileCount;
      }
    }
    
    if (el.lodSpan) el.lodSpan.textContent = lod;
    
    if (el.mslSpan && mslKm != null) {
        el.mslSpan.textContent = Math.abs(mslKm) < 1 ? (mslKm * 1000).toFixed(1) + ' m' : 
                                 (Math.abs(mslKm) < 100 ? mslKm.toFixed(2) + ' km' : mslKm.toFixed(0) + ' km');
    }
    
    if (el.heightSpan && aglKm != null) {
        el.heightSpan.textContent = aglKm < 1 ? (aglKm * 1000).toFixed(1) + ' m' : 
                                    (aglKm < 100 ? aglKm.toFixed(2) + ' km' : aglKm.toFixed(0) + ' km');
    }
    
    if (el.zoneIndicator && zone) {
        el.zoneIndicator.textContent = zone.text;
        el.zoneIndicator.style.color = zone.color;
    }
  };

  /**
   * Update avatar/camera world position display
   */
  const initPositionListeners = (pos) => {
      if (pos) updatePositionInfo(pos[0], pos[1], pos[2]);
  };

  /**
   * Update avatar/camera world position display
   */
  const updatePositionInfo = (x, y, z) => {
      if (elements.positionInfo && x != null && y != null && z != null) {
          elements.positionInfo.textContent = `Pos: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`;
      }
  };

  /**
   * Highlight the active weather preset button
   */
  const setActiveWeatherPreset = (presetName) => {
      const el = elements;
      if (el.btnWeatherClean) el.btnWeatherClean.classList.toggle('active', presetName === 'clean');
      if (el.btnWeatherNormal) el.btnWeatherNormal.classList.toggle('active', presetName === 'normal');
      if (el.btnWeatherStorm) el.btnWeatherStorm.classList.toggle('active', presetName === 'storm');
      if (el.btnWeatherSnow) el.btnWeatherSnow.classList.toggle('active', presetName === 'snow');
      if (el.btnWeatherRain) el.btnWeatherRain.classList.toggle('active', presetName === 'rain');
      if (el.btnWeatherOvercast) el.btnWeatherOvercast.classList.toggle('active', presetName === 'overcast');
  };

  /**
   * Shared helper to sync color pickers and intensity sliders
   */
  const syncPicker = (picker, slider, span, r, g, b) => {
      const el = elements;
      if (!picker || !slider) return;
      const maxComp = Math.max(r, g, b, 0.001);
      let intensity = 1.0;
      let br = r, bg = g, bb = b;

      if (maxComp > 1.0) {
          intensity = maxComp;
          br /= intensity;
          bg /= intensity;
          bb /= intensity;
      }

      picker.value = rgbToHex(br, bg, bb);
      slider.value = intensity;
      if (span) span.textContent = intensity.toFixed(2);
  };
  
  /**
   * Synchronize sliders with external environment state
   */
  const syncSliders = (env) => {
      const el = elements;
      if (el.sliderCloudCoverage && env.cloudCoverage !== undefined) {
          el.sliderCloudCoverage.value = env.cloudCoverage;
          if (el.valueCloudCoverage) el.valueCloudCoverage.textContent = env.cloudCoverage.toFixed(2);
      }
      if (el.sliderCloudLayer1 && env.cloudLayer1Opacity !== undefined) {
          el.sliderCloudLayer1.value = env.cloudLayer1Opacity;
          if (el.valueCloudLayer1) el.valueCloudLayer1.textContent = env.cloudLayer1Opacity.toFixed(2);
      }
      if (el.sliderCloudLayer2 && env.cloudLayer2Opacity !== undefined) {
          el.sliderCloudLayer2.value = env.cloudLayer2Opacity;
          if (el.valueCloudLayer2) el.valueCloudLayer2.textContent = env.cloudLayer2Opacity.toFixed(2);
      }
      if (el.sliderCloudLayer3 && env.cloudLayer3Opacity !== undefined) {
          el.sliderCloudLayer3.value = env.cloudLayer3Opacity;
          if (el.valueCloudLayer3) el.valueCloudLayer3.textContent = env.cloudLayer3Opacity.toFixed(2);
      }

      syncPicker(el.pickerCloudL1, el.sliderCloudL1Int, el.valueCloudL1Int, env.cloudLayer1R, env.cloudLayer1G, env.cloudLayer1B);
      syncPicker(el.pickerCloudL2, el.sliderCloudL2Int, el.valueCloudL2Int, env.cloudLayer2R, env.cloudLayer2G, env.cloudLayer2B);
      syncPicker(el.pickerCloudL3, el.sliderCloudL3Int, el.valueCloudL3Int, env.cloudLayer3R, env.cloudLayer3G, env.cloudLayer3B);
      syncPicker(el.pickerSkyTint, el.sliderSkyTintInt, el.valueSkyTintInt, env.skyTintR, env.skyTintG, env.skyTintB);

       if (el.sliderCloudSpeed && env.cloudSpeed !== undefined) {
           el.sliderCloudSpeed.value = env.cloudSpeed;
           if (el.valueCloudSpeed) el.valueCloudSpeed.textContent = env.cloudSpeed.toFixed(2);
       }
       if (el.cbVolumetricShadows && env.volumetricShadowsEnabled !== undefined) {
           el.cbVolumetricShadows.checked = !!env.volumetricShadowsEnabled;
       }
       // Sync snow checkbox
       if (el.cbSnow && env.snowEnabled !== undefined) {
           el.cbSnow.checked = !!env.snowEnabled;
       }
       // Sync rain intensity slider
       if (el.sliderRainIntensity && env.rainIntensity !== undefined) {
           el.sliderRainIntensity.value = env.rainIntensity;
           if (el.valueRainIntensity) el.valueRainIntensity.textContent = env.rainIntensity.toFixed(2);
       }
       // Sync aurora sliders
       if (el.sliderAuroraIntensity && env.auroraIntensity !== undefined) {
           el.sliderAuroraIntensity.value = env.auroraIntensity;
           if (el.valueAuroraIntensity) el.valueAuroraIntensity.textContent = env.auroraIntensity.toFixed(2);
       }
       if (el.sliderAuroraSpeed && env.auroraSpeed !== undefined) {
           el.sliderAuroraSpeed.value = env.auroraSpeed;
           if (el.valueAuroraSpeed) el.valueAuroraSpeed.textContent = env.auroraSpeed.toFixed(2);
       }
       if (el.sliderAuroraAltitude && env.auroraAltitude !== undefined) {
           el.sliderAuroraAltitude.value = env.auroraAltitude;
           if (el.valueAuroraAltitude) el.valueAuroraAltitude.textContent = env.auroraAltitude.toFixed(2);
       }
       if (el.sliderDayCycleSpeed && env.dayCycleSpeed !== undefined) {
           el.sliderDayCycleSpeed.value = env.dayCycleSpeed;
           if (el.valueDayCycleSpeed) el.valueDayCycleSpeed.textContent = env.dayCycleSpeed.toFixed(2);
       }
  };

  /**
   * Synchronize terrain sliders with world params
   */
  const syncTerrainSliders = (params) => {
      const el = elements;
      const _syncSlider = (slider, span, val) => {
          if (slider && val !== undefined) {
              slider.value = val;
              if (span) span.textContent = typeof val === 'number' ? val.toFixed(2) : val;
          }
      };

      _syncSlider(el.sliderMaskFreq, el.valueMaskFreq, params.mountMaskFreq);
      _syncSlider(el.sliderBaseFreq, el.valueBaseFreq, params.baseFrequency);
      _syncSlider(el.sliderBaseAmp, el.valueBaseAmp, params.baseAmplitude);
      _syncSlider(el.sliderPersistence, el.valuePersistence, params.persistence);
      _syncSlider(el.sliderLacunarity, el.valueLacunarity, params.lacunarity);
      _syncSlider(el.sliderContrastExp, el.valueContrastExp, params.contrastExp);
      _syncSlider(el.sliderContrastScale, el.valueContrastScale, params.contrastScale);
      _syncSlider(el.sliderAbyssDetail, el.valueAbyssDetail, params.abyssDetail);
      _syncSlider(el.sliderDetailScale, el.valueDetailScale, params.detailScale);
      
      _syncSlider(el.sliderOctaves, el.valueOctaves, params.octaves);
      _syncSlider(el.sliderWarp2, el.valueWarp2, params.warpStrength2);
      _syncSlider(el.sliderRockCoverage, el.valueRockCoverage, params.rockCoverage);
      _syncSlider(el.sliderGrassCoverage, el.valueGrassCoverage, params.grassCoverage);
      _syncSlider(el.sliderSandCoverage, el.valueSandCoverage, params.sandCoverage);
      _syncSlider(el.sliderSnowCoverage, el.valueSnowCoverage, params.snowCoverage);
      
      _syncSlider(el.sliderTerraceAmt, el.valueTerraceAmt, params.terraceAmount);
      _syncSlider(el.sliderTerraceSmooth, el.valueTerraceSmooth, params.terraceSmooth);
      _syncSlider(el.sliderSharpness, el.valueSharpness, params.mountainSharpness);
      _syncSlider(el.sliderShelfWidth, el.valueShelfWidth, params.shelfWidth);
      _syncSlider(el.sliderLakeDetail, el.valueLakeDetail, params.lakeDetail);
      _syncSlider(el.sliderBeachWidth, el.valueBeachWidth, params.beachWidth);
      _syncSlider(el.sliderSnowLine, el.valueSnowLine, params.snowLine);
      _syncSlider(el.sliderSandSharp, el.valueSandSharp, params.sandSharpness);
      _syncSlider(el.sliderRockThreshold, el.valueRockThreshold, params.rockThreshold);
      _syncSlider(el.sliderGrassThreshold, el.valueGrassThreshold, params.grassThreshold);
      _syncSlider(el.sliderMoisture, el.valueMoisture, params.globalMoisture);

      // Biome Color Sync
      syncPicker(el.pickerColGrass, el.sliderColGrassInt, el.valueColGrassInt, ...(params.colGrass || [0,0,0]));
      syncPicker(el.pickerColForest, el.sliderColForestInt, el.valueColForestInt, ...(params.colForest || [0,0,0]));
      syncPicker(el.pickerColRock, el.sliderColRockInt, el.valueColRockInt, ...(params.colRock || [0,0,0]));
      syncPicker(el.pickerColSnow, el.sliderColSnowInt, el.valueColSnowInt, ...(params.colSnow || [0,0,0]));
      syncPicker(el.pickerColSand, el.sliderColSandInt, el.valueColSandInt, ...(params.colSand || [0,0,0]));
      syncPicker(el.pickerColGround, el.sliderColGroundInt, el.valueColGroundInt, ...(params.colGround || [0,0,0]));
      syncPicker(el.pickerColShallow, el.sliderColShallowInt, el.valueColShallowInt, ...(params.colShallowSea || [0,0,0]));
      syncPicker(el.pickerColDeep, el.sliderColDeepInt, el.valueColDeepInt, ...(params.colDeepSea || [0,0,0]));

      if (el.cbTerrainNoise) el.cbTerrainNoise.checked = !!params.showNoise;
  };

  /**
   * Synchronize artistic stylization sliders
   */
  const syncStyleSliders = (env) => {
      const el = elements;
      const syncVal = (slider, span, val) => {
          if (slider) slider.value = val;
          if (span) span.textContent = val.toFixed(2);
      };
      
      syncVal(el.sliderSkySaturation, el.valueSkySaturation, env.skySaturation);
      syncVal(el.sliderSkyVibrance, el.valueSkyVibrance, env.skyVibrance);
      if (env.auroraIntensity !== undefined) syncVal(el.sliderAuroraIntensity, el.valueAuroraIntensity, env.auroraIntensity);
      if (env.auroraSpeed !== undefined) syncVal(el.sliderAuroraSpeed, el.valueAuroraSpeed, env.auroraSpeed);
      if (env.auroraAltitude !== undefined) syncVal(el.sliderAuroraAltitude, el.valueAuroraAltitude, env.auroraAltitude);
      syncPicker(el.pickerSkyTint, el.sliderSkyTintInt, el.valueSkyTintInt, env.skyTintR, env.skyTintG, env.skyTintB);
      syncPicker(el.pickerAuroraBase, el.sliderAuroraBaseInt, el.valueAuroraBaseInt, env.auroraBaseR ?? 0.08, env.auroraBaseG ?? 0.95, env.auroraBaseB ?? 0.25);
      syncPicker(el.pickerAuroraTop, el.sliderAuroraTopInt, el.valueAuroraTopInt, env.auroraTopR ?? 0.75, env.auroraTopG ?? 0.08, env.auroraTopB ?? 0.55);
  };

  // Initialize listeners immediately
  initListeners();

  return {
    updateStats,
    initPositionListeners,
    updatePositionInfo,
    setActiveWeatherPreset,
    syncSliders,
    syncTerrainSliders,
    initTerrainListeners,
    rebindDebugListeners,
    get env() { return _env; },
    get callbacks() { return _callbacks; }
  };
};
