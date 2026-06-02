/**
 * performanceProfiles.js — Hardware-aware performance profiles.
 *
 * `default` is full quality; `low` trims the heaviest effects (scatter,
 * volumetric/cloud shadows) for weaker devices. Applied at startup with no
 * user-facing UI. Append `?profile=low` (or `?profile=default`) to the URL to
 * force one — useful for testing on low-end hardware.
 *
 * @module config/performanceProfiles
 */

/**
 * Per-profile setting bundles.
 */
export const PERFORMANCE_PROFILES = {
  default: {
    label: 'Default',
    scatterEnabled: true,        // trees / rocks / crystals / palms
    volumetricShadows: true,
    cloudShadows: true,
  },
  low: {
    label: 'Low',
    scatterEnabled: false,
    volumetricShadows: false,
    cloudShadows: false,
  },
};

const PROFILE_KEYS = new Set(['default', 'low']);

/**
 * Detect the performance profile for the current session.
 * Order: URL override → default.
 * @returns {Promise<'default'|'low'>}
 */
export const detectPerformanceProfile = async () => {
  if (typeof window !== 'undefined' && window.location?.search) {
    const override = new URLSearchParams(window.location.search).get('profile');
    if (PROFILE_KEYS.has(override)) return override;
  }
  return 'default';
};

/**
 * Apply a profile's settings to the live engine. Safe to call after the
 * environment has been loaded and the renderer is up.
 * @param {'default'|'low'} key
 * @param {{ planetRenderer:object, env:object }} ctx
 * @returns {object} the applied profile
 */
export const applyPerformanceProfile = (key, { planetRenderer, env }) => {
  const profile = PERFORMANCE_PROFILES[key] ?? PERFORMANCE_PROFILES.default;
  console.log(`[Perf] Profile: ${profile.label} (${key})`);

  planetRenderer?.setScatterBypassed?.(!profile.scatterEnabled);
  if (env) {
    env.volumetricShadowsEnabled = profile.volumetricShadows;
    env.cloudShadowsEnabled = profile.cloudShadows;
  }
  return profile;
};
