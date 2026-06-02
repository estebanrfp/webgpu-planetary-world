export const AUDIO_CONFIG = {
  // Sound Asset URLs
  sounds: {
    footstepsLand: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/running.mp3',
    footstepsWater: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/walking-in-water-trim.mp3',
    jump: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/jump.mp3',
    fly: 'https://raw.githubusercontent.com/estebanrfp/ovgrid-assets/master/sounds/wind.mp3',
    shipEntry: './assets/sounds/Flight/Voicy_Spaceship SFX.mp3',
    shipFlight: './assets/sounds/Flight/space-flight.mp3',
    rain: './assets/sounds/Rain/rain.mp3',     // Light/moderate rain loop
    storm: './assets/sounds/Rain/storm.mp3',   // Heavy rain + wind for the storm tier
    thunder: './assets/sounds/Rain/thunder.mp3',
    snow: './assets/sounds/Snow/snow.mp3',     // Cold-wind ambient for snowfall
    beach: './assets/sounds/Beach/beach.mp3',  // Trees + breeze ambient near shoreline
    aurae: './assets/sounds/Ambient/Aurae.mp3' // Calm ambient loop played in parcel map mode
  },

  // Playback parameters
  walkRate: 0.6,
  runRate: 1.2,
  
  // Volumes
  volumes: {
    footstepsLand: 1.5,
    footstepsWater: 1.5,
    jump: 1.5,
    fly: 0.15,
    shipEntry: 0.8,
    shipFlight: 0.5,
    master: 1.0
  },

  // Volume modifiers for specific states
  modifiers: {
    jumpWindMultiplier: 0.5         // Wind volume during jump arc
    // In-water detection lives in lib/terrain/water.js (shared by player + NPCs).
  },

  // Spatial audio settings
  spatial: {
    panningModel: 'HRTF',           // High quality 3D audio
    distanceModel: 'inverse',       // Natural fall-off
    refDistance: 0.02,              // 20 meters in km (Full volume zone)
    maxDistance: 10.0,              // Increased to 10km for thunder/distant sounds
    rolloffFactor: 0.3,             // Lower rolloff for more distant-reaching sound
    
    // Per-sound overrides
    overrides: {
      thunder: {
        refDistance: 0.1,           // 100m full volume for thunder
        maxDistance: 20.0,          // Thunder travels far
        rolloffFactor: 0.2          // Very gentle drop-off
      }
    }
  }
};
