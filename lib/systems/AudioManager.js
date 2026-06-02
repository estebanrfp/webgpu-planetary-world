/**
 * createAudioManager
 * Handles spatial audio using Web Audio API for immersive sound.
 * Designed for the Floating Origin system where Listener is at [0,0,0].
 * @returns {Object} AudioManager instance
 */

import { AUDIO_CONFIG } from '../config/audioConfig.js';

export const createAudioManager = () => {
  let context = null;
  let masterGain = null;
  const sounds = new Map();
  let isInitialized = false;
  let isEnabled = false;

  const init = async () => {
    if (isInitialized) return;
    
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = context.createGain();
      masterGain.gain.value = AUDIO_CONFIG.volumes.master;
      masterGain.connect(context.destination);

      if (context.listener.positionX) {
        context.listener.positionX.setValueAtTime(0, context.currentTime);
        context.listener.positionY.setValueAtTime(0, context.currentTime);
        context.listener.positionZ.setValueAtTime(0, context.currentTime);
        context.listener.forwardX.setValueAtTime(0, context.currentTime);
        context.listener.forwardY.setValueAtTime(0, context.currentTime);
        context.listener.forwardZ.setValueAtTime(-1, context.currentTime);
        context.listener.upX.setValueAtTime(0, context.currentTime);
        context.listener.upY.setValueAtTime(1, context.currentTime);
        context.listener.upZ.setValueAtTime(0, context.currentTime);
      } else {
        context.listener.setOrientation(0, 0, -1, 0, 1, 0);
        context.listener.setPosition(0, 0, 0);
      }

      await _loadAllSounds();
      isInitialized = true;
      isEnabled = true;
      console.log('✅ AudioManager initialized with 3D Spatial Audio');
    } catch (e) {
      console.error('❌ Failed to initialize AudioManager:', e);
    }
  };

  const _loadAllSounds = async () => {
    const loadPromises = Object.entries(AUDIO_CONFIG.sounds).map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);
        
        const gainNode = context.createGain();
        gainNode.gain.value = AUDIO_CONFIG.volumes[name] || 1.0;
        
        const pannerNode = context.createPanner();
        pannerNode.panningModel = AUDIO_CONFIG.spatial.panningModel;
        pannerNode.distanceModel = AUDIO_CONFIG.spatial.distanceModel;
        
        // Apply spatial settings with optional overrides
        const spatial = AUDIO_CONFIG.spatial;
        const overrides = spatial.overrides?.[name] || {};
        
        pannerNode.refDistance = overrides.refDistance ?? spatial.refDistance;
        pannerNode.maxDistance = overrides.maxDistance ?? spatial.maxDistance;
        pannerNode.rolloffFactor = overrides.rolloffFactor ?? spatial.rolloffFactor;
        
        pannerNode.connect(gainNode);
        gainNode.connect(masterGain);
        
        sounds.set(name, { buffer: audioBuffer, gain: gainNode, panner: pannerNode, isPlaying: false, activeSource: null });
      } catch (e) {
        console.error(`Failed to load sound: ${name} from ${url}`, e);
      }
    });

    await Promise.all(loadPromises);
  };

  const play = (name, options = {}) => {
    if (!isEnabled || !sounds.has(name)) return;
    
    const sound = sounds.get(name);
    const { loop = false, playbackRate = 1.0, restart = false, volumeMultiplier = 1.0 } = options;
    const FADE_TIME = 0.05;
    const targetGain = (AUDIO_CONFIG.volumes[name] || 1.0) * volumeMultiplier;

    if (sound.isPlaying && !restart) {
      if (sound.activeSource) {
        sound.activeSource.playbackRate.setTargetAtTime(playbackRate, context.currentTime, FADE_TIME);
        sound.gain.gain.setTargetAtTime(targetGain, context.currentTime, FADE_TIME);
      }
      return;
    }

    if (sound.isPlaying && restart) stop(name);

    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = loop;
    source.playbackRate.value = playbackRate;
    source.connect(sound.panner);
    
    sound.gain.gain.cancelScheduledValues(context.currentTime);
    sound.gain.gain.setValueAtTime(0, context.currentTime);
    sound.gain.gain.linearRampToValueAtTime(targetGain, context.currentTime + FADE_TIME);
    
    source.start(0);
    sound.activeSource = source;
    sound.isPlaying = true;
    
    if (!loop) {
      source.onended = () => { if (sound.activeSource === source) { sound.isPlaying = false; sound.activeSource = null; } };
    }
  };

  const stop = (name) => {
    if (!sounds.has(name)) return;
    const sound = sounds.get(name);
    const FADE_TIME = 0.08;

    if (sound.activeSource) {
      const source = sound.activeSource;
      sound.activeSource = null;
      sound.isPlaying = false;

      sound.gain.gain.cancelScheduledValues(context.currentTime);
      sound.gain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_TIME);
      
      setTimeout(() => { try { source.stop(); source.disconnect(); } catch (e) {} }, FADE_TIME * 1000 + 5);
    }
  };

  const updatePosition = (name, relativePos) => {
    if (!sounds.has(name)) return;
    const sound = sounds.get(name);
    
    if (!Number.isFinite(relativePos[0]) || !Number.isFinite(relativePos[1]) || !Number.isFinite(relativePos[2])) return;
    
    const TIME_CONSTANT = 0.02;
    if (sound.panner.positionX) {
      sound.panner.positionX.setTargetAtTime(relativePos[0], context.currentTime, TIME_CONSTANT);
      sound.panner.positionY.setTargetAtTime(relativePos[1], context.currentTime, TIME_CONSTANT);
      sound.panner.positionZ.setTargetAtTime(relativePos[2], context.currentTime, TIME_CONSTANT);
    } else {
      sound.panner.setPosition(relativePos[0], relativePos[1], relativePos[2]);
    }
  };

  const resume = () => { if (context && context.state === 'suspended') context.resume(); };
  const suspend = () => { if (context && context.state === 'running') context.suspend(); };

  return {
    init, play, stop, updatePosition, resume, suspend,
    get isInitialized() { return isInitialized; },
    get isEnabled() { return isEnabled; },
    set isEnabled(v) { isEnabled = v; }
  };
};
