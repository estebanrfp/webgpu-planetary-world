import { STORAGE_KEYS } from '../config/index.js'
import { AVATAR_CONFIG } from '../config/avatarConfig.js'

/**
 * RPM Manager - Ready Player Me Avatar Integration
 * 
 * Manages the RPM iframe editor for avatar customization.
 * Uses postMessage API for communication with RPM.
 * 
 * @module RPMManager
 */

/** RPM editor URL with frameApi enabled */
const RPM_EDITOR_URL = `https://demo.readyplayer.me/avatar?frameApi`

/**
 * Create the RPM Manager
 * @returns {object} RPMManager API
 */
export const createRPMManager = () => {
  /** @type {HTMLElement | null} */
  let modal = null
  
  /** @type {HTMLIFrameElement | null} */
  let iframe = null
  
  /** @type {boolean} */
  let isOpen = false
  
  /** @type {Set<(url: string) => void>} */
  const avatarListeners = new Set()

  /**
   * Handle postMessage events from RPM iframe
   * @param {MessageEvent} event
   */
  const handleMessage = (event) => {
    let json
    try {
      json = JSON.parse(event.data)
    } catch {
      return 
    }

    if (json?.source !== 'readyplayerme') return

    if (json.eventName === 'v1.frame.ready') {
      iframe?.contentWindow?.postMessage(
        JSON.stringify({
          target: 'readyplayerme',
          type: 'subscribe',
          eventName: 'v1.**'
        }),
        '*'
      )
    }

    if (json.eventName === 'v1.avatar.exported') {
      const baseUrl = json.data.url
      const optimizedUrl = `${baseUrl}?${AVATAR_CONFIG.modelParams}`
      
      console.log('[RPM] Avatar exported');
      
      localStorage.setItem(STORAGE_KEYS.RPM_AVATAR, optimizedUrl)
      close()
      
      avatarListeners.forEach(fn => {
        try { fn(optimizedUrl) } catch (e) { console.error('[RPM] Listener error:', e) }
      })
    }
  }

  const injectStyles = () => {
    if (document.getElementById('rpm-manager-styles')) return

    const styles = document.createElement('style')
    styles.id = 'rpm-manager-styles'
    styles.textContent = `
      .rpm-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }
      
      .rpm-modal.open {
        opacity: 1;
        pointer-events: auto;
      }
      
      .rpm-container {
        position: relative;
        width: 95%;
        max-width: 900px;
        height: 90%;
        max-height: 700px;
        background: #1a1a2e;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      }
      
      .rpm-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: rgba(30, 30, 45, 0.95);
        border-bottom: 1px solid rgba(100, 100, 140, 0.2);
      }
      
      .rpm-title {
        font-size: 16px;
        font-weight: 600;
        color: #e0e0e0;
        margin: 0;
      }
      
      .rpm-close {
        background: rgba(255, 100, 100, 0.2);
        border: 1px solid rgba(255, 100, 100, 0.4);
        color: #ff6666;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      .rpm-close:hover {
        background: rgba(255, 100, 100, 0.3);
        color: #fff;
      }
      
      .rpm-iframe {
        width: 100%;
        height: calc(100% - 60px);
        border: none;
        background: #0f0f1a;
      }
      
      .rpm-loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #888;
        font-size: 14px;
      }
    `
    document.head.appendChild(styles)
  }

  const createModal = () => {
    if (modal) return

    modal = document.createElement('div')
    modal.className = 'rpm-modal'
    modal.innerHTML = `
      <div class="rpm-container">
        <div class="rpm-header">
          <h3 class="rpm-title">Customize Your Avatar</h3>
          <button class="rpm-close" id="rpm-close-btn">×</button>
        </div>
        <div class="rpm-loading">Loading avatar editor...</div>
        <iframe class="rpm-iframe" id="rpm-iframe" allow="camera *; microphone *"></iframe>
      </div>
    `
    document.body.appendChild(modal)

    iframe = modal.querySelector('#rpm-iframe')
    modal.querySelector('#rpm-close-btn')?.addEventListener('click', close)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close()
    })
  }

  const open = () => {
    if (isOpen) return
    injectStyles()
    createModal()
    if (iframe) iframe.src = RPM_EDITOR_URL
    window.addEventListener('message', handleMessage)
    isOpen = true
    modal?.classList.add('open')
  }

  const close = () => {
    if (!isOpen) return
    isOpen = false
    modal?.classList.remove('open')
    if (iframe) iframe.src = 'about:blank'
    window.removeEventListener('message', handleMessage)
  }

  const onAvatarChanged = (callback) => {
    avatarListeners.add(callback)
    return () => avatarListeners.delete(callback)
  }

  const getAvatarUrl = () => {
    return localStorage.getItem(STORAGE_KEYS.RPM_AVATAR)
  }

  const clearAvatar = () => {
    localStorage.removeItem(STORAGE_KEYS.RPM_AVATAR)
  }

  const destroy = () => {
    close()
    modal?.remove()
    modal = null
    iframe = null
    avatarListeners.clear()
  }

  return {
    open,
    close,
    onAvatarChanged,
    getAvatarUrl,
    clearAvatar,
    destroy,
    get isOpen() { return isOpen }
  }
}

export const RPMManager = createRPMManager()
export default RPMManager;
