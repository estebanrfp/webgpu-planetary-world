/**
 * planetConfig.js - Physical Planet Constants
 * 
 * Single source of truth for the physical dimensions and 
 * coordinate system of the planet.
 */

/** Planet radius in kilometers (matches atmosphere model) */
export const PLANET_RADIUS = 795.0;

/** Alias for compatibility with legacy systems */
export const EARTH_RADIUS = PLANET_RADIUS;

/** Earth center position in world coordinates (Y is UP) */
export const EARTH_CENTER = [0, -PLANET_RADIUS, 0];

/** Length unit conversion: 1 unit = 1000 meters (1 km) */
export const LENGTH_UNIT_IN_METERS = 1000.0;
