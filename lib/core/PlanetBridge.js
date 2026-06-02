/**
 * PlanetBridge — Singleton event bus between mainPlanet and marketplace overlay.
 * Bridges renderer, camera, device refs and parcel mode events.
 * @module PlanetBridge
 */

const createPlanetBridge = () => {
  const target = new EventTarget()

  /** @type {object|null} */ let renderer = null
  /** @type {object|null} */ let camera = null
  /** @type {GPUDevice|null} */ let device = null
  /** @type {GPUTextureFormat|null} */ let format = null
  /** @type {boolean} */ let parcelModeActive = false

  /**
   * Subscribe to a bridge event
   * @param {string} event
   * @param {EventListener} handler
   */
  const on = (event, handler) => target.addEventListener(event, handler)

  /**
   * Unsubscribe from a bridge event
   * @param {string} event
   * @param {EventListener} handler
   */
  const off = (event, handler) => target.removeEventListener(event, handler)

  /**
   * Emit a bridge event with optional detail payload
   * @param {string} event
   * @param {object} [detail]
   */
  const emit = (event, detail) =>
    target.dispatchEvent(new CustomEvent(event, { detail }))

  return {
    // Refs injected by mainPlanet after init
    get renderer() { return renderer },
    set renderer(v) { renderer = v },
    get camera() { return camera },
    set camera(v) { camera = v },
    get device() { return device },
    set device(v) { device = v },
    get format() { return format },
    set format(v) { format = v },

    get parcelModeActive() { return parcelModeActive },
    set parcelModeActive(v) { parcelModeActive = v },

    on,
    off,
    emit,
  }
}

/**
 * Singleton instance — shared across the **bundled** main app and the
 * **raw-loaded** marketplace modules. In the production build these are two
 * separate module graphs, so a plain module-level instance would be duplicated
 * (mainPlanet would listen on one bridge while the marketplace emits on
 * another). Backing it with a `window` global makes both copies of this module
 * resolve to the *same* instance: whichever loads first creates it, the other
 * reuses it. In dev (all raw modules) there is a single module instance anyway.
 */
export const planetBridge =
  (typeof window !== 'undefined'
    ? (window.__planetBridge ??= createPlanetBridge())
    : createPlanetBridge())
