/**
 * WeatherSystem — autonomous, localized, seasonal weather controller.
 *
 * Every frame it reads the avatar's latitude, asks the WorldClock for the
 * local season, samples a drifting FBM noise field at the avatar's position
 * and blends a weather preset into `targetEnv`. The existing transition
 * smoothing then fades the environment toward it.
 *
 * The noise field is low-frequency (large weather cells) and drifts with time,
 * so fronts move on their own — the avatar walks in and out of showers and
 * sees the sky clear by zone. It is evaluated at a single point (the avatar),
 * so the cost is negligible.
 *
 * Clear days take a per-day colour palette (sky tint + the three cloud-layer
 * tints) from a 5-stop harmonic ramp, so no two clear days look alike; rain
 * greys the sky over them. See docs/WEATHER_SYSTEM_PLAN.md.
 *
 * @module systems/WeatherSystem
 */

import { WEATHER_PRESETS, SKY_PRESETS, AUTONOMOUS_SKY } from '../config/presets.js';

// Sky-grade fields a "special sky" day overrides on top of the daily palette.
// Cloud-layer tints stay from the harmonic ramp so only the sky colour changes.
const SKY_GRADE_FIELDS = ['skyTintR', 'skyTintG', 'skyTintB', 'skySaturation', 'skyVibrance'];

// The 32-field weather preset schema (docs/WEATHER_SYSTEM_PLAN.md).
const PRESET_FIELDS = [
  'cloudCoverage', 'cloudSpeed',
  'cloudLayer1Opacity', 'cloudLayer2Opacity', 'cloudLayer3Opacity',
  'cloudLayer1R', 'cloudLayer1G', 'cloudLayer1B',
  'cloudLayer2R', 'cloudLayer2G', 'cloudLayer2B',
  'cloudLayer3R', 'cloudLayer3G', 'cloudLayer3B',
  'rainIntensity', 'snowEnabled', 'stormEnabled',
  'exposure', 'skySaturation', 'skyVibrance',
  'skyTintR', 'skyTintG', 'skyTintB',
  'auroraIntensity', 'auroraSpeed', 'auroraAltitude',
  'auroraBaseR', 'auroraBaseG', 'auroraBaseB',
  'auroraTopR', 'auroraTopG', 'auroraTopB',
];

// Precipitation fields lag the clouds — they only ramp in once the sky is grey.
const PRECIP_FIELDS = new Set(['rainIntensity', 'snowEnabled', 'stormEnabled']);

// Fields driven by the per-day colour palette instead of the calm preset, so no
// two clear days look alike — rain still greys them out via the active preset.
const DAILY_FIELDS = new Set([
  'skyTintR', 'skyTintG', 'skyTintB', 'skySaturation', 'skyVibrance',
  'cloudLayer1R', 'cloudLayer1G', 'cloudLayer1B',
  'cloudLayer2R', 'cloudLayer2G', 'cloudLayer2B',
  'cloudLayer3R', 'cloudLayer3G', 'cloudLayer3B',
]);

// Per-season weather profiles. The calm baseline is always a clear sky (so
// every season gets bright, colour-varied clear days from the daily palette);
// the season picks the active weather a front brings AND how the shared noise
// field maps to it — `onset`/`range` shape cloud frequency, `precipOnset`
// shapes precipitation. Calibrated against the real FBM field (mean ~0.46) for
// Stardew-like season characters: summer mostly clear with rare storms, winter
// snow-dominated, autumn a grey transition, spring temperate.
//   spring ~62% clear · summer ~80% · autumn ~52% · winter ~35%
const SEASON_DECKS = {
  spring: { calm: 'clean', active: 'rain',  onset: 0.47, range: 0.20, precipOnset: 0.35 },
  summer: { calm: 'clean', active: 'storm', onset: 0.53, range: 0.22, precipOnset: 0.40 },
  autumn: { calm: 'clean', active: 'rain',  onset: 0.44, range: 0.20, precipOnset: 0.35 },
  winter: { calm: 'clean', active: 'snow',  onset: 0.38, range: 0.24, precipOnset: 0.30 },
};

const CELL_SCALE = 3;          // low frequency → large weather cells
const FRONT_DRIFT = 0.15;      // how fast weather fronts move across the world
// Forecast icon thresholds — read from the blended weather so the calendar
// icon always matches what the engine renders. RAIN_VISIBLE matches the
// RainSystem audio cutoff: rain you can hear is rain on the calendar.
const RAIN_VISIBLE = 0.05;     // blended rainIntensity above this reads as rain
const CLOUDY_COVER = 0.5;      // blended cloudCoverage above this reads as overcast
const PARTLY_COVER = 0.15;     // cloudCoverage above this reads as partly cloudy

/**
 * Clear-day colour palettes — a harmonic ramp from cool to warm. Each stop is a
 * complete clear-sky look: sky tint, saturation/vibrance and the three
 * cloud-layer tints. Tints are RGB multipliers (1,1,1 = untinted). Adjacent
 * stops blend cleanly; computeDailySky interpolates along the ramp per day.
 */
const SKY_PALETTES = [
  { // turquoise
    skyTintR: 0.80, skyTintG: 1.05, skyTintB: 1.12, skySaturation: 1.15, skyVibrance: 0.18,
    cloudLayer1R: 0.92, cloudLayer1G: 1.04, cloudLayer1B: 1.06,
    cloudLayer2R: 0.82, cloudLayer2G: 1.02, cloudLayer2B: 1.08,
    cloudLayer3R: 0.75, cloudLayer3G: 0.98, cloudLayer3B: 1.10,
  },
  { // sky blue
    skyTintR: 0.85, skyTintG: 0.95, skyTintB: 1.20, skySaturation: 1.05, skyVibrance: 0.12,
    cloudLayer1R: 0.95, cloudLayer1G: 0.99, cloudLayer1B: 1.08,
    cloudLayer2R: 0.88, cloudLayer2G: 0.94, cloudLayer2B: 1.10,
    cloudLayer3R: 0.82, cloudLayer3G: 0.90, cloudLayer3B: 1.12,
  },
  { // lavender / mauve
    skyTintR: 1.05, skyTintG: 0.94, skyTintB: 1.15, skySaturation: 1.05, skyVibrance: 0.15,
    cloudLayer1R: 1.04, cloudLayer1G: 0.98, cloudLayer1B: 1.07,
    cloudLayer2R: 1.06, cloudLayer2G: 0.92, cloudLayer2B: 1.08,
    cloudLayer3R: 1.05, cloudLayer3G: 0.86, cloudLayer3B: 1.10,
  },
  { // soft rose
    skyTintR: 1.20, skyTintG: 0.94, skyTintB: 1.02, skySaturation: 1.12, skyVibrance: 0.20,
    cloudLayer1R: 1.10, cloudLayer1G: 1.00, cloudLayer1B: 1.02,
    cloudLayer2R: 1.16, cloudLayer2G: 0.94, cloudLayer2B: 0.98,
    cloudLayer3R: 1.18, cloudLayer3G: 0.88, cloudLayer3B: 0.96,
  },
  { // warm gold / amber
    skyTintR: 1.28, skyTintG: 1.04, skyTintB: 0.80, skySaturation: 1.18, skyVibrance: 0.26,
    cloudLayer1R: 1.10, cloudLayer1G: 1.03, cloudLayer1B: 0.94,
    cloudLayer2R: 1.16, cloudLayer2G: 1.00, cloudLayer2B: 0.85,
    cloudLayer3R: 1.18, cloudLayer3G: 0.92, cloudLayer3B: 0.78,
  },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smootherstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Integer hash → [0,1). */
const hashNoise = (ix, iy, iz) => {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(iz | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Trilinearly-interpolated 3D value noise. */
const valueNoise3 = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smootherstep(x - ix), fy = smootherstep(y - iy), fz = smootherstep(z - iz);
  const n = (dx, dy, dz) => hashNoise(ix + dx, iy + dy, iz + dz);
  const y0 = lerp(lerp(n(0,0,0), n(1,0,0), fx), lerp(n(0,1,0), n(1,1,0), fx), fy);
  const y1 = lerp(lerp(n(0,0,1), n(1,0,1), fx), lerp(n(0,1,1), n(1,1,1), fx), fy);
  return lerp(y0, y1, fz);
};

/** 4-octave fractal Brownian motion, output ~0..1. */
const fbm = (x, y, z) => {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * valueNoise3(x * freq, y * freq, z * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return v;
};

/**
 * Sample the raw drifting weather noise at a sphere position and world day —
 * season-independent. Deterministic: the same (position, day) always yields the
 * same value, which is what lets the calendar forecast future days.
 * @param {number[]} avatarNormal - Vector from the planet centre to the avatar.
 * @param {number} worldDay - The world day to sample (fractional allowed).
 * @returns {number} Raw FBM weather field value (~0..1).
 */
const sampleNoise = (avatarNormal, worldDay) => {
  const l = Math.hypot(avatarNormal[0], avatarNormal[1], avatarNormal[2]) || 1;
  const t = worldDay * FRONT_DRIFT;
  return fbm(
    (avatarNormal[0] / l) * CELL_SCALE + t,
    (avatarNormal[1] / l) * CELL_SCALE,
    (avatarNormal[2] / l) * CELL_SCALE + t,
  );
};

/**
 * Map raw weather noise to activity through a season's profile: `f` is the
 * cloud/activity factor, `precip` the delayed precipitation factor — clouds
 * lead and precipitation follows, so rain/snow never fall from a clear sky.
 * @param {number} w - Raw noise from sampleNoise().
 * @param {object} deck - A SEASON_DECKS entry (onset, range, precipOnset).
 * @returns {{f:number, precip:number}}
 */
const classifyNoise = (w, deck) => {
  const f = smootherstep(clamp01((w - deck.onset) / deck.range));
  const precip = smootherstep(clamp01((f - deck.precipOnset) / (1 - deck.precipOnset)));
  return { f, precip };
};

/**
 * Per-day clear-sky palette: a smooth position along the harmonic colour ramp,
 * so no two clear days look alike. Deterministic — the same day always yields
 * the same sky and cloud tints.
 * @param {number} day - Day of the year.
 * @returns {object} The interpolated palette (DAILY_FIELDS).
 */
const computeDailySky = (day) => {
  const pos = valueNoise3(day * 0.35, 17.5, 0) * (SKY_PALETTES.length - 1);
  const i = Math.min(SKY_PALETTES.length - 2, Math.floor(pos));
  const frac = pos - i;
  const a = SKY_PALETTES[i], b = SKY_PALETTES[i + 1];
  const out = {};
  for (const k in a) out[k] = lerp(a[k], b[k], frac);
  return out;
};

/**
 * Pick a dramatic SKY_PRESET for an absolute world day, or null on an ordinary
 * day. Deterministic per day: roughly one day in `AUTONOMOUS_SKY.everyNDays`
 * is "special", and which preset it gets is also stable for that day — so every
 * client renders the same surprise sky without any coordination.
 * @param {number} day - Absolute world day (integer).
 * @returns {object|null} A SKY_PRESETS entry (skyTint/saturation/vibrance) or null.
 */
const specialSkyForDay = (day) => {
  const d = Math.floor(day);
  if (hashNoise(d, 91, 0) >= 1 / AUTONOMOUS_SKY.everyNDays) return null;
  const pool = AUTONOMOUS_SKY.pool;
  const idx = Math.floor(hashNoise(d, 137, 7) * pool.length) % pool.length;
  return SKY_PRESETS[pool[idx]] ?? null;
};

/**
 * Create the autonomous weather controller.
 * @param {object} worldClock - The WorldClock (latitudeOf, seasonAt, worldDays).
 * @returns {object} The weather system: { update }.
 */
export const createWeatherSystem = (worldClock) => {
  return {
    /**
     * Compute the autonomous weather and write it into the transition target.
     * @param {number[]} avatarNormal - Vector from the planet centre to the avatar.
     * @param {object} targetEnv - The environment transition target to drive.
     */
    update(avatarNormal, targetEnv) {
      const lat = worldClock.latitudeOf(avatarNormal);
      const season = worldClock.seasonAt(lat);
      const deck = SEASON_DECKS[season.name] ?? SEASON_DECKS.spring;
      const calm = WEATHER_PRESETS[deck.calm];
      const active = WEATHER_PRESETS[deck.active];

      // Weather field — a drifting FBM front sampled at the avatar, mapped to
      // activity through this season's own profile.
      const w = sampleNoise(avatarNormal, worldClock.worldDays);
      const { f, precip } = classifyNoise(w, deck);

      // Per-day clear-sky palette — clear days vary in colour, rain greys them.
      const dailySky = computeDailySky(worldClock.dayOfYear);

      // Some days the autonomous system grades the sky with a dramatic preset
      // (aurora-gold, alien green, cyberpunk magenta…) — a deterministic, shared
      // surprise. It overrides only the sky-colour fields; cloud-layer tints stay
      // from the harmonic ramp, and a passing front still greys it out via `f`.
      const special = specialSkyForDay(worldClock.worldDays);
      if (special) for (const k of SKY_GRADE_FIELDS) dailySky[k] = special[k];

      // Blend calm → active: sky/cloud colour comes from the daily palette on
      // the calm side; clouds track `f`, precipitation tracks the delayed
      // `precip` factor so a grey sky always precedes the rain.
      for (const k of PRESET_FIELDS) {
        const cv = DAILY_FIELDS.has(k) ? dailySky[k] : calm[k];
        const av = active[k];
        const ff = PRECIP_FIELDS.has(k) ? precip : f;
        targetEnv[k] = typeof cv === 'boolean' ? (ff > 0.5 ? av : cv) : lerp(cv, av, ff);
      }
    },

    /**
     * Forecast the weather category at a position on a given world day — the
     * same deterministic field `update` uses, so the calendar shows exactly
     * what each day will bring.
     * @param {number[]} avatarNormal - Vector from the planet centre to the avatar.
     * @param {number} worldDay - The world day to forecast.
     * @param {string} seasonName - Local season at that day ('spring'…'winter').
     * @returns {'clear'|'partly'|'cloudy'|'rain'|'snow'|'storm'}
     */
    forecast(avatarNormal, worldDay, seasonName) {
      const deck = SEASON_DECKS[seasonName] ?? SEASON_DECKS.spring;
      const { f, precip } = classifyNoise(sampleNoise(avatarNormal, worldDay), deck);
      const calm = WEATHER_PRESETS[deck.calm];
      const active = WEATHER_PRESETS[deck.active];
      // Three precipitation intensities — drizzle, heavy rain, and storm
      // (heavy rain WITH lightning). The icon mirrors what the engine renders:
      //   - snow: winter precipitation peak
      //   - storm: summer precipitation peak (stormEnabled preset)
      //   - heavy: spring/autumn rain at full intensity
      //   - drizzle: any season's early/late rain ramp
      if (precip > 0.5 && active.snowEnabled) return 'snow';
      if (precip > 0.5 && active.stormEnabled) return 'storm';
      const blendedRain = lerp(calm.rainIntensity, active.rainIntensity, precip);
      if (blendedRain > 0.5) return 'heavy';
      if (blendedRain > RAIN_VISIBLE) return 'drizzle';
      const clouds = lerp(calm.cloudCoverage, active.cloudCoverage, f);
      if (clouds > CLOUDY_COVER) return 'cloudy';
      if (clouds > PARTLY_COVER) return 'partly';
      return 'clear';
    },
  };
};
