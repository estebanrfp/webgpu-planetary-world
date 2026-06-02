/**
 * Marketplace Mockup - Styles Module
 *
 * Injects CSS dynamically from modular CSS files.
 * Uses link tags for development flexibility.
 *
 * @module marketplace/styles
 */

const STYLE_ID = 'mockup-marketplace-styles'
const LINK_PREFIX = 'mockup-marketplace-css-'

/** CSS files to load (relative to marketplace folder) */
const CSS_FILES = ['css/main.css', 'css/land-map.css']

/**
 * Check if styles are already injected
 * @returns {boolean}
 */
export const isStylesInjected = () => !!document.getElementById(STYLE_ID)

/**
 * Get base path for CSS files
 * @returns {string}
 */
const getBasePath = () => {
  // Detect if running from bundled or development
  const scripts = document.querySelectorAll('script[src]')
  for (const script of scripts) {
    if (script.src.includes('mainPlanet') || script.src.includes('main.js')) {
      const url = new URL(script.src)
      return url.origin + '/lib/marketplace/'
    }
  }
  // Fallback for module imports
  return '/lib/marketplace/'
}

/** Overlay and close button styles */
const OVERLAY_CSS = `
.mockup-marketplace-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: none;
  align-items: center;
  justify-content: center;
}
.mockup-marketplace-overlay.open {
  display: flex;
}
.mockup-marketplace-overlay .mp-close-btn {
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  color: var(--mp-text-muted, #888);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
  margin-right: 8px;
}
.mockup-marketplace-overlay .mp-close-btn:hover {
  color: var(--mp-danger, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}
`

/**
 * Inject marketplace styles into document head
 * Only injects once - subsequent calls are no-ops
 */
export const injectStyles = () => {
  if (isStylesInjected()) return

  const basePath = getBasePath()
  const head = document.head

  // Add marker element
  const marker = document.createElement('meta')
  marker.id = STYLE_ID
  marker.name = 'mockup-marketplace-styles'
  head.appendChild(marker)

  // Add overlay styles inline
  const overlayStyle = document.createElement('style')
  overlayStyle.id = `${STYLE_ID}-overlay`
  overlayStyle.textContent = OVERLAY_CSS
  head.appendChild(overlayStyle)

  // Load CSS files
  CSS_FILES.forEach((file, i) => {
    const link = document.createElement('link')
    link.id = `${LINK_PREFIX}${i}`
    link.rel = 'stylesheet'
    link.href = basePath + file
    head.appendChild(link)
  })

  // Add Google Fonts if not already loaded
  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Inter"]')) {
    const fontLink = document.createElement('link')
    fontLink.rel = 'stylesheet'
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
    head.appendChild(fontLink)
  }
}

/**
 * Remove injected styles
 */
export const removeStyles = () => {
  document.getElementById(STYLE_ID)?.remove()
  document.getElementById(`${STYLE_ID}-overlay`)?.remove()
  CSS_FILES.forEach((_, i) => {
    document.getElementById(`${LINK_PREFIX}${i}`)?.remove()
  })
}

export default { injectStyles, removeStyles, isStylesInjected }
