/**
 * WorldClock — astronomical world clock.
 *
 * Time is a pure function of the real wall clock, so there is no drift and
 * every client derives an identical world time. A day is `REAL_MS_PER_DAY`
 * long; a year is four 28-day seasons (`DAYS_PER_YEAR`).
 *
 * Sun & moon are anchored to the **avatar's local frame**, not to a fixed
 * planetary axis. The sun rises on the eastern horizon, climbs through the
 * avatar's zenith at noon, sets on the western horizon, and the moon rides
 * the opposite arc. The orbital plane re-tilts automatically as the avatar
 * moves, so any location on the planet enjoys the same overhead arc — no
 * polar day/night, no astronomically penalised parcels. The trade-off is
 * geographic sky identity; regional variety still comes through climate,
 * biomes and weather.
 *
 * The lunar cycle drives the moon's phase only (brightness/disc), not its
 * position — it stays exactly anti-solar.
 *
 * Seasons are kept as a calendar/climate signal: declination still drives
 * `climateBandAt(lat)` (the shared warmth signal for weather and biomes),
 * but no longer tilts the sun arc geometrically.
 *
 * @module systems/WorldClock
 */

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const DEG2RAD = Math.PI / 180;

// --- Calendar dials (docs/WEATHER_SYSTEM_PLAN.md) — all configurable here ---
const REAL_MS_PER_DAY = 20 * 60 * 1000;        // a game day lasts 20 real minutes
const DAYS_PER_SEASON = 28;                    // a season is 4 weeks (Stardew-style)
const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;     // 4 seasons → 112 days
const DAYS_PER_LUNAR_CYCLE = 7;                // one lunar cycle per week
const AXIAL_TILT = 23.5 * DEG2RAD;
// Fixed shared epoch so the world time is identical for every client.
const EPOCH = Date.UTC(2026, 0, 1);

const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Create the world clock.
 * @returns {object} The world clock: update(), query getters, seasonAt(), …
 */
export const createWorldClock = () => {
  // --- Calendar state (recomputed every tick) ---
  let worldDays = 0, dayOfYear = 0, timeOfDay = 0;
  let localTimeOfDay = 0;
  let rotation = 0, orbit = 0, lunarAngle = 0, declination = 0;
  let timeScale = 1;   // debug only — accelerates the clock to inspect the cycle
  let epoch = EPOCH;   // reanchored on time-scale changes so worldDays stays continuous

  // --- Sun / moon: vectors anchored to the avatar's local frame ---
  const _sunDir = [0, 1, 0];
  const _moonDir = [0, -1, 0];
  let sunElevation = 0, moonPhase = 0;

  /** Advance the calendar from the real wall clock. */
  const tickCalendar = () => {
    worldDays = ((Date.now() - epoch) / REAL_MS_PER_DAY) * timeScale;
    const dayFrac = worldDays - Math.floor(worldDays);
    rotation = dayFrac * TAU;
    timeOfDay = dayFrac * 24;
    dayOfYear = ((Math.floor(worldDays) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
    orbit = ((worldDays / DAYS_PER_YEAR) % 1) * TAU;
    lunarAngle = ((worldDays / DAYS_PER_LUNAR_CYCLE) % 1) * TAU;
    declination = AXIAL_TILT * Math.sin(orbit);
  };

  return {
    /**
     * Recompute the calendar and the sun/moon directions. The avatar normal is
     * only used to derive the local sun elevation (isNight); the sun and moon
     * themselves are world-space and observer-independent.
     * @param {number[]} avatarNormal - Vector from the planet centre to the avatar.
     */
    update(avatarNormal) {
      tickCalendar();

      // Local frame at the avatar: zenith is the radial up; east is the
      // horizontal tangent perpendicular to the world polar axis (+Y).
      // Near a pole (localUp ≈ ±Y) that cross product degenerates, so we
      // fall back to a +X reference instead.
      const nx = avatarNormal[0], ny = avatarNormal[1], nz = avatarNormal[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const ux = nx / nl, uy = ny / nl, uz = nz / nl;
      let ex, ey, ez;
      if (Math.abs(uy) > 0.999) {
        // Pole fallback: east = cross([1,0,0], localUp) = [0, -uz, uy]
        ex = 0; ey = -uz; ez = uy;
      } else {
        // Default: east = cross([0,1,0], localUp) = [uz, 0, -ux]
        ex = uz; ey = 0; ez = -ux;
      }
      const el = Math.hypot(ex, ey, ez) || 1;
      ex /= el; ey /= el; ez /= el;

      // dayAngle: −π/2 = midnight, 0 = sunrise (east), π/2 = noon (zenith),
      // π = sunset (west). sunDir traces a great circle through the avatar's
      // zenith, so every location on the planet sees the same overhead arc
      // and the moon (= −sunDir) rides the opposite one.
      const dayAngle = rotation - HALF_PI;
      const c = Math.cos(dayAngle), s = Math.sin(dayAngle);
      _sunDir[0] = c * ex + s * ux;
      _sunDir[1] = c * ey + s * uy;
      _sunDir[2] = c * ez + s * uz;
      _moonDir[0] = -_sunDir[0];
      _moonDir[1] = -_sunDir[1];
      _moonDir[2] = -_sunDir[2];

      sunElevation = s;                              // = dot(localUp, sunDir)
      moonPhase = (1 - Math.cos(lunarAngle)) / 2;    // 0 = new, 1 = full
      // Arc is identical at every location, so local solar time matches the
      // global clock — no per-longitude offset needed.
      localTimeOfDay = timeOfDay;
    },

    /**
     * Local season at a latitude — opposite hemispheres, temperate equator.
     * @param {number} latRad - Latitude in radians.
     * @returns {{ name:string, index:number, intensity:number }}
     */
    seasonAt(latRad) {
      const yearFrac = dayOfYear / DAYS_PER_YEAR;
      const localFrac = latRad >= 0 ? yearFrac : (yearFrac + 0.5) % 1;
      const index = Math.floor(localFrac * 4) % 4;
      return { name: SEASON_NAMES[index], index, intensity: Math.abs(Math.sin(latRad)) };
    },

    /**
     * The avatar's full local calendar — season, day within it, and year.
     * Opposite hemispheres run half a year apart, matching seasonAt(). Used by
     * the calendar HUD; the day index is 0-based.
     * @param {number} latRad - Latitude in radians.
     * @returns {{season:string, seasonIndex:number, dayInSeason:number,
     *   daysPerSeason:number, year:number, timeOfDay:number}}
     */
    localCalendar(latRad) {
      const localDay = latRad >= 0
        ? dayOfYear
        : (dayOfYear + DAYS_PER_YEAR / 2) % DAYS_PER_YEAR;
      const seasonIndex = Math.floor(localDay / DAYS_PER_SEASON) % 4;
      return {
        season: SEASON_NAMES[seasonIndex],
        seasonIndex,
        dayInSeason: localDay % DAYS_PER_SEASON,
        daysPerSeason: DAYS_PER_SEASON,
        year: Math.floor(worldDays / DAYS_PER_YEAR) + 1,
        // Local solar time — what the player's wristwatch should read. The
        // HUD shows this, not the global timeOfDay, so the clock matches
        // the sun in the sky for the avatar's current longitude.
        timeOfDay: localTimeOfDay,
      };
    },

    /**
     * Lunar-cycle fraction of a world day — 0 = new moon, 0.5 = full moon.
     * The cycle spans exactly one season, so each day of a season owns a
     * distinct phase; the calendar grid draws one moon icon per day from this.
     * @param {number} day - A world day (integer).
     * @returns {number} Cycle fraction in 0..1.
     */
    moonPhaseAt(day) {
      const d = ((day % DAYS_PER_LUNAR_CYCLE) + DAYS_PER_LUNAR_CYCLE) % DAYS_PER_LUNAR_CYCLE;
      return d / DAYS_PER_LUNAR_CYCLE;
    },

    /**
     * Per-latitude climate warmth, 0 (frozen pole) to 1 (hot equator), with a
     * mild seasonal swing. Shared signal for weather decks and, later, terrain
     * biome colour and vegetation.
     * @param {number} latRad - Latitude in radians.
     * @returns {number} Warmth in 0..1.
     */
    climateBandAt(latRad) {
      const base = Math.cos(latRad);
      const seasonal = 0.15 * Math.sin(declination) * Math.sin(latRad);
      return clamp(base + seasonal, 0, 1);
    },

    /** Latitude (radians, -π/2..π/2) of a surface normal — the axis is world +Y. */
    latitudeOf(n) {
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      return Math.asin(clamp(n[1] / l, -1, 1));
    },

    /** Debug: accelerate the clock (1 = real time). Production always runs at 1.
     *  The epoch is reanchored on every change so worldDays stays continuous —
     *  no flicker when the slider is dragged. */
    setTimeScale(scale) {
      const s = Math.max(0, scale);
      if (s > 0 && s !== timeScale) {
        const days = ((Date.now() - epoch) / REAL_MS_PER_DAY) * timeScale;
        epoch = Date.now() - (days / s) * REAL_MS_PER_DAY;
      }
      timeScale = s;
    },
    get timeScale() { return timeScale; },

    get worldDays() { return worldDays; },
    get dayOfYear() { return dayOfYear; },
    get timeOfDay() { return timeOfDay; },          // global (UTC-like)
    get localTimeOfDay() { return localTimeOfDay; }, // avatar's solar time
    get season() { return SEASON_NAMES[Math.floor((dayOfYear / DAYS_PER_YEAR) * 4) % 4]; },
    get sunDir() { return _sunDir; },
    get moonDir() { return _moonDir; },
    get sunElevation() { return sunElevation; },
    get isNight() { return sunElevation < 0; },
    get moonPhase() { return moonPhase; },
  };
};
