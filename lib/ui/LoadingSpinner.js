/**
 * Global loading spinner — a small, non-blocking pill badge shown while async
 * modules / network work is in flight (blockchain init, marketplace load, …).
 *
 * Ref-counted: concurrent loads share one badge (it hides when the last one
 * finishes). Backed by a `window` global so the bundled main app and the
 * raw-loaded marketplace modules use the *same* instance (same pattern as
 * PlanetBridge). Visuals live in styles.css (`.app-spinner*`).
 *
 * Usage:
 *   window.appSpinner?.show('Loading blockchain…')
 *   window.appSpinner?.hide()
 *   await window.appSpinner?.wrap(somePromise, 'Loading…')
 *
 * @module ui/LoadingSpinner
 */

const create = () => {
  let el = null
  let labelEl = null
  let count = 0

  const build = () => {
    if (el || typeof document === 'undefined') return
    el = document.createElement('div')
    el.className = 'app-spinner'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.innerHTML = '<span class="app-spinner__ring"></span><span class="app-spinner__label"></span>'
    labelEl = el.querySelector('.app-spinner__label')
    document.body.appendChild(el)
  }

  const api = {
    /** Show the spinner (ref-counted). @param {string} [label] */
    show(label = 'Loading…') {
      build()
      count++
      if (labelEl) labelEl.textContent = label
      el?.classList.add('is-visible')
    },
    /** Hide one ref; the badge disappears when the last load finishes. */
    hide() {
      count = Math.max(0, count - 1)
      if (count === 0) el?.classList.remove('is-visible')
    },
    /** Show while a promise runs, then hide. @template T @param {Promise<T>} p */
    async wrap(p, label) {
      this.show(label)
      try { return await p } finally { this.hide() }
    },
  }
  return api
}

/** @type {ReturnType<typeof create>} */
export const appSpinner =
  (typeof window !== 'undefined'
    ? (window.appSpinner ??= create())
    : create())
