/**
 * Weather Presets
 *
 * A weather preset is a complete, curated climate + sky state — the unit the
 * autonomous weather system distributes across the world. Each preset carries
 * the full 32-field schema: clouds, precipitation, sky and aurora. The sun
 * position is intentionally NOT part of a preset — it is driven by the
 * astronomical model. See docs/WEATHER_SYSTEM_PLAN.md.
 */

/**
 * Neutral sky + aurora block — matches the ATMOSPHERE_CONFIG defaults. Spread
 * into every preset so each one is complete; preset authoring overrides these.
 */
const NEUTRAL_SKY = {
  // Fixed exposure for every preset — a sunlit sky reads correctly at 1.0.
  // 2.0 washed out the terrain textures. No longer exposed in the UI.
  exposure: 1.0,
  skySaturation: 1.0,
  skyVibrance: 0.0,
  skyTintR: 1.0, skyTintG: 1.0, skyTintB: 1.0,
  auroraIntensity: 0.0,
  auroraSpeed: 0.5,
  auroraAltitude: 0.5,
  auroraBaseR: 0.08, auroraBaseG: 0.95, auroraBaseB: 0.25,
  auroraTopR: 0.75, auroraTopG: 0.08, auroraTopB: 0.55,
};

export const WEATHER_PRESETS = {
  clean: {
    cloudCoverage: 0.0,
    cloudSpeed: 0.3,
    cloudLayer1Opacity: 0.6, cloudLayer2Opacity: 0.2, cloudLayer3Opacity: 0.1,
    cloudLayer1R: 1.0, cloudLayer1G: 1.0, cloudLayer1B: 1.0,
    cloudLayer2R: 1.0, cloudLayer2G: 1.0, cloudLayer2B: 1.0,
    cloudLayer3R: 1.0, cloudLayer3G: 1.0, cloudLayer3B: 1.1,
    rainIntensity: 0.0, snowEnabled: false, stormEnabled: false,
    ...NEUTRAL_SKY,
  },
  normal: {
    cloudCoverage: 0.5,
    cloudSpeed: 0.5,
    cloudLayer1Opacity: 1.0, cloudLayer2Opacity: 0.4, cloudLayer3Opacity: 0.2,
    cloudLayer1R: 1.0, cloudLayer1G: 1.0, cloudLayer1B: 1.0,
    cloudLayer2R: 1.0, cloudLayer2G: 1.0, cloudLayer2B: 1.0,
    cloudLayer3R: 1.0, cloudLayer3G: 1.0, cloudLayer3B: 1.1,
    rainIntensity: 0.0, snowEnabled: false, stormEnabled: false,
    ...NEUTRAL_SKY,
  },
  storm: {
    cloudCoverage: 1.0,
    cloudSpeed: 2.0,
    cloudLayer1Opacity: 1.2, cloudLayer2Opacity: 0.6, cloudLayer3Opacity: 0.4,
    cloudLayer1R: 0.6, cloudLayer1G: 0.7, cloudLayer1B: 0.9,
    cloudLayer2R: 0.5, cloudLayer2G: 0.6, cloudLayer2B: 0.8,
    cloudLayer3R: 0.4, cloudLayer3G: 0.5, cloudLayer3B: 0.7,
    rainIntensity: 1.0, snowEnabled: false, stormEnabled: true,
    ...NEUTRAL_SKY,
  },
  snow: {
    cloudCoverage: 0.85,
    cloudSpeed: 0.4,
    cloudLayer1Opacity: 1.0, cloudLayer2Opacity: 0.5, cloudLayer3Opacity: 0.3,
    cloudLayer1R: 0.9, cloudLayer1G: 0.95, cloudLayer1B: 1.0,
    cloudLayer2R: 0.9, cloudLayer2G: 0.95, cloudLayer2B: 1.0,
    cloudLayer3R: 0.9, cloudLayer3G: 0.95, cloudLayer3B: 1.1,
    rainIntensity: 0.0, snowEnabled: true, stormEnabled: false,
    ...NEUTRAL_SKY,
  },
  rain: {
    cloudCoverage: 0.95,
    cloudSpeed: 0.8,
    cloudLayer1Opacity: 1.1, cloudLayer2Opacity: 0.6, cloudLayer3Opacity: 0.4,
    cloudLayer1R: 0.5, cloudLayer1G: 0.55, cloudLayer1B: 0.65,
    cloudLayer2R: 0.4, cloudLayer2G: 0.45, cloudLayer2B: 0.55,
    cloudLayer3R: 0.4, cloudLayer3G: 0.45, cloudLayer3B: 0.55,
    rainIntensity: 0.8, snowEnabled: false, stormEnabled: false,
    ...NEUTRAL_SKY,
  },
  overcast: {
    cloudCoverage: 1.0,
    cloudSpeed: 0.15,
    cloudLayer1Opacity: 0.9, cloudLayer2Opacity: 0.5, cloudLayer3Opacity: 0.3,
    cloudLayer1R: 0.8, cloudLayer1G: 0.8, cloudLayer1B: 0.8,
    cloudLayer2R: 0.7, cloudLayer2G: 0.7, cloudLayer2B: 0.7,
    cloudLayer3R: 0.6, cloudLayer3G: 0.6, cloudLayer3B: 0.6,
    rainIntensity: 0.0, snowEnabled: false, stormEnabled: false,
    ...NEUTRAL_SKY,
  },
};

/**
 * Sky Stylization Presets (Cinematic Tones)
 * Color grading presets for atmosphere artistic stylization
 */
export const SKY_PRESETS = {
  // Reset to natural
  reset: {
    skySaturation: 1.0,
    skyVibrance: 0.0,
    skyTintR: 1.0,
    skyTintG: 1.0,
    skyTintB: 1.0
  },
  // Cinematic - Slight teal/orange grade
  cinematic: {
    skySaturation: 1.1,
    skyVibrance: 0.2,
    skyTintR: 1.0,
    skyTintG: 0.95,
    skyTintB: 1.1
  },
  // Planet X - Alien atmosphere (green/purple)
  alien: {
    skySaturation: 1.3,
    skyVibrance: 0.6,
    skyTintR: 0.8,
    skyTintG: 1.2,
    skyTintB: 0.9
  },
  // Blood - Dark red atmosphere
  blood: {
    skySaturation: 1.4,
    skyVibrance: 0.5,
    skyTintR: 1.6,
    skyTintG: 0.5,
    skyTintB: 0.5
  },
  // Midnight - Deep blue/dark
  midnight: {
    skySaturation: 0.7,
    skyVibrance: 0.1,
    skyTintR: 0.6,
    skyTintG: 0.7,
    skyTintB: 1.2
  },
  // Sunset - Warm orange/pink
  sunset: {
    skySaturation: 1.3,
    skyVibrance: 0.4,
    skyTintR: 1.4,
    skyTintG: 0.9,
    skyTintB: 0.7
  },
  // Vintage - Faded, de-saturated warm
  vintage: {
    skySaturation: 0.6,
    skyVibrance: 0.0,
    skyTintR: 1.15,
    skyTintG: 1.05,
    skyTintB: 0.9
  },
  // Cyberpunk - Neon purple/pink
  cyberpunk: {
    skySaturation: 1.5,
    skyVibrance: 0.8,
    skyTintR: 1.2,
    skyTintG: 0.6,
    skyTintB: 1.5
  },
  // Noir - Black and white ish
  noir: {
    skySaturation: 0.1,
    skyVibrance: 0.0,
    skyTintR: 1.0,
    skyTintG: 1.0,
    skyTintB: 1.0
  },
  // Gold - Warm golden hour
  gold: {
    skySaturation: 1.2,
    skyVibrance: 0.3,
    skyTintR: 1.5,
    skyTintG: 1.2,
    skyTintB: 0.7
  }
};

/**
 * Autonomous "special sky" scheduling.
 *
 * The WeatherSystem normally varies each clear day along a subtle harmonic
 * colour ramp. On a deterministic subset of days it instead grades the sky with
 * one of the dramatic SKY_PRESETS above, so roughly one day in `everyNDays`
 * surprises the player with a distinctly tinted sky (aurora-gold, alien green,
 * cyberpunk magenta…). Pure data — tune the rarity and the pool here.
 *
 * @property {number} everyNDays - Average spacing between special-sky days (~1/N chance per day).
 * @property {string[]} pool - SKY_PRESETS keys eligible for a special day.
 */
export const AUTONOMOUS_SKY = {
  everyNDays: 6,
  pool: ['cinematic', 'sunset', 'gold', 'midnight', 'vintage', 'alien', 'cyberpunk', 'blood'],
};
