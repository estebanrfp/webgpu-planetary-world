/**
 * HUD & Nameplate Configuration
 * Distributed billboard and overlay settings
 */

export const HUD_CONFIG = {
    // Visibility & Fading — calibrated for the current (base-mesh) avatar and
    // the recalibrated camera orbit range (~0.045 .. 0.6).
    maxDistance: 0.9,           // hard cull beyond this camera distance
    fadeStartDistance: 0.25,    // starts fading out past this camera distance
    fadeEndDistance: 0.5,       // fully invisible — reached before the 0.6 zoom-out limit
    minDistance: 0.005,         // fade out when too close to camera

    // Altitude fade — the head nameplate dissolves once the avatar lifts off the
    // ground (flying with Q/E). World units ≈ km; avatar height ~0.092. Tuned to
    // survive normal jumps but vanish during sustained ascent. Nameplate only;
    // the avatar mesh stays fully visible while flying.
    altitudeFadeStart: 0.12,    // begin fading above this height over terrain
    altitudeFadeEnd: 0.45,      // fully hidden at/above this height

    // Position & Scale — calibrated for the current (base-mesh) avatar
    heightOffset: 0.105,        // above the avatar's head (head top ~0.092)
    baseScale: 0.05,            // billboard width in world units
    
    // Canvas dimensions
    canvasWidth: 120,
    canvasHeight: 85,
    
    // Visual Styling
    style: {
        fontSize: 14,
        statusFontSize: 10,
        fontFamily: 'Arial, Helvetica, sans-serif',
        panelAlpha: 0.8,
        borderRadius: 8
    }
};
