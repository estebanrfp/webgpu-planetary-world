/**
 * SCENE_OBJECTS: Configuration for all renderable objects
 * 
 * CPU is the single source of truth for:
 * - Object existence (what objects are in the scene)
 * - Object positions (in world coordinates)
 * - Object sizes/radii
 * 
 * GPU receives offsets relative to camera for rendering.
 * This design scales to: multiple avatars, dynamic objects, etc.
 */
export const SCENE_OBJECTS = {
  // Reserved slot for uniform buffer alignment (no longer used for rendering)
  _reserved0: {
    worldPos: [0, 0, 0],  // Not used
    radius: 0.0,          // Not used
    albedo: [0, 0, 0],    // Not used
  },
  
  // Avatar capsule (follows mesh position)
  avatar: {
    radius: 0.005,          // km = 5 meters (10x larger)
    height: 0.02,           // km = 20 meters (10x larger)
    albedo: [0.8, 0.8, 0.8],
  },
  
  // Vehicle Placeholder
  vehicle: {
    radius: 0.008,          // km = 8 meters
    height: 0.005,          // km = 5 meters
    albedo: [0.3, 0.6, 1.0], // Blue-ish
  },
  
  // Future: Add more objects here
  // npcs: [],
  // structures: [],
};
