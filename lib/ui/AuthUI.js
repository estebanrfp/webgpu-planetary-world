/**
 * Auth UI - Authentication Overlay Component
 * 
 * Minimalist login/registration interface matching the project's
 * dark glassmorphism design language.
 * 
 * @module AuthUI
 */

import { AuthManager } from '../network/index.js'

/**
 * Auth UI States
 * @enum {string}
 */
const UI_STATES = {
  LOADING: 'loading',
  LOGIN: 'login',
  REGISTRATION: 'registration',
  AUTHENTICATED: 'authenticated'
}

/**
 * Create the Auth UI controller
 * 
 * @returns {object} AuthUI API
 */
export const createAuthUI = () => {
  /** @type {HTMLElement | null} */
  let overlay = null
  
  /** @type {string} */
  let currentState = UI_STATES.LOADING
  
  /** @type {(() => void) | null} */
  let onAuthenticatedCallback = null

  /**
   * Generate the overlay HTML
   * @returns {string}
   */
  const generateHTML = () => `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h2 class="auth-title">OVGrid</h2>
          <p class="auth-subtitle">Distributed Virtual World</p>
        </div>
        
        <div class="auth-content" id="auth-content">
          <!-- Dynamic content inserted here -->
        </div>
        
        <div class="auth-status" id="auth-status"></div>
      </div>
    </div>
  `

  /**
   * Generate login view HTML
   * @param {object} state - Auth state
   * @returns {string}
   */
  const generateLoginView = (state) => `
    <div class="auth-section">
      <textarea 
        id="auth-mnemonic" 
        class="auth-textarea" 
        placeholder="Enter your 12-word recovery phrase..."
        rows="3"
      ></textarea>
    </div>
    
    <div class="auth-actions">
      <button id="btn-login-mnemonic" class="auth-btn auth-btn-primary">
        Login with Mnemonic
      </button>
      
      ${state.hasWebAuthnRegistration ? `
        <button id="btn-login-webauthn" class="auth-btn auth-btn-secondary">
          🔐 Login with Passkey
        </button>
      ` : ''}
      
      <div class="auth-divider">
        <span>or</span>
      </div>
      
      <button id="btn-register" class="auth-btn auth-btn-outline">
        Generate New Identity
      </button>
    </div>
  `

  /**
   * Generate registration view HTML
   * @param {object} state - Auth state
   * @returns {string}
   */
  const generateRegistrationView = (state) => `
    <div class="auth-section">
      <div class="auth-warning">
        ⚠️ SAVE THIS PHRASE SECURELY!<br>
        This is your only way to recover your account.
      </div>
      
      <textarea 
        id="auth-mnemonic" 
        class="auth-textarea auth-textarea-readonly" 
        readonly
        rows="3"
      >${state.mnemonic || ''}</textarea>
      
      <button id="btn-copy-mnemonic" class="auth-btn-icon" title="Copy to clipboard">
        📋 Copy Phrase
      </button>
    </div>
    
    <div class="auth-actions">
      <button id="btn-protect-webauthn" class="auth-btn auth-btn-accent">
        🔐 Protect with Passkey (Recommended)
      </button>
      
      <button id="btn-login-mnemonic-after" class="auth-btn auth-btn-secondary">
        Continue without Passkey
      </button>
    </div>
  `

  /**
   * Generate loading view HTML
   * @returns {string}
   */
  const generateLoadingView = () => `
    <div class="auth-loading">
      <div class="auth-spinner"></div>
      <p>Connecting to network...</p>
    </div>
  `

  /**
   * Update the content area based on current state
   * @param {object} authState - Current auth state
   */
  const updateContent = (authState) => {
    const content = document.getElementById('auth-content')
    if (!content) return

    let html = ''
    
    if (authState.isActive) {
      // Authenticated - hide overlay
      hide()
      return
    }

    switch (currentState) {
      case UI_STATES.LOADING:
        html = generateLoadingView()
        break
      case UI_STATES.REGISTRATION:
        html = generateRegistrationView(authState)
        break
      case UI_STATES.LOGIN:
      default:
        html = generateLoginView(authState)
        break
    }

    content.innerHTML = html
    bindEvents(authState)
  }

  /**
   * Show status message
   * @param {string} message
   * @param {'info' | 'error' | 'success'} type
   */
  const showStatus = (message, type = 'info') => {
    const status = document.getElementById('auth-status')
    if (!status) return
    
    status.textContent = message
    status.className = `auth-status auth-status-${type}`
    
    if (type !== 'error') {
      setTimeout(() => {
        if (status.textContent === message) {
          status.textContent = ''
          status.className = 'auth-status'
        }
      }, 3000)
    }
  }

  /**
   * Bind event listeners
   * @param {object} authState
   */
  const bindEvents = (authState) => {
    // Login with mnemonic
    const btnLoginMnemonic = document.getElementById('btn-login-mnemonic')
    btnLoginMnemonic?.addEventListener('click', async () => {
      const textarea = document.getElementById('auth-mnemonic')
      const mnemonic = textarea?.value?.trim()
      
      if (!mnemonic || mnemonic.split(/\s+/).length < 12) {
        showStatus('Please enter a valid 12-word mnemonic phrase', 'error')
        return
      }
      
      showStatus('Logging in...', 'info')
      
      try {
        const result = await AuthManager.loginWithMnemonic(mnemonic)
        if (result) {
          showStatus('Login successful!', 'success')
        } else {
          showStatus('Invalid mnemonic phrase', 'error')
        }
      } catch (e) {
        showStatus(`Login failed: ${e.message}`, 'error')
      }
    })

    // Login with WebAuthn
    const btnWebAuthn = document.getElementById('btn-login-webauthn')
    btnWebAuthn?.addEventListener('click', async () => {
      showStatus('Authenticating...', 'info')
      
      try {
        const result = await AuthManager.loginWithWebAuthn()
        if (result) {
          showStatus('Authenticated!', 'success')
        } else {
          showStatus('Authentication failed', 'error')
        }
      } catch (e) {
        showStatus(`Authentication failed: ${e.message}`, 'error')
      }
    })

    // Generate new identity
    const btnRegister = document.getElementById('btn-register')
    btnRegister?.addEventListener('click', async () => {
      showStatus('Generating identity...', 'info')
      
      try {
        const result = await AuthManager.startRegistration()
        if (result) {
          currentState = UI_STATES.REGISTRATION
          updateContent(AuthManager.getState())
          showStatus('Identity generated! Save your recovery phrase.', 'success')
        } else {
          showStatus('Failed to generate identity', 'error')
        }
      } catch (e) {
        showStatus(`Generation failed: ${e.message}`, 'error')
      }
    })

    // Copy mnemonic
    const btnCopy = document.getElementById('btn-copy-mnemonic')
    btnCopy?.addEventListener('click', async () => {
      const textarea = document.getElementById('auth-mnemonic')
      if (textarea?.value) {
        try {
          await navigator.clipboard.writeText(textarea.value)
          showStatus('Copied to clipboard!', 'success')
        } catch {
          showStatus('Copy failed - select and copy manually', 'error')
        }
      }
    })

    // Protect with WebAuthn
    const btnProtect = document.getElementById('btn-protect-webauthn')
    btnProtect?.addEventListener('click', async () => {
      showStatus('Setting up passkey...', 'info')
      
      try {
        const result = await AuthManager.protectWithWebAuthn()
        if (result) {
          showStatus('Account secured!', 'success')
        } else {
          showStatus('Passkey setup failed', 'error')
        }
      } catch (e) {
        showStatus(`Setup failed: ${e.message}`, 'error')
      }
    })

    // Continue without passkey (login with volatile identity)
    const btnContinue = document.getElementById('btn-login-mnemonic-after')
    btnContinue?.addEventListener('click', async () => {
      const state = AuthManager.getState()
      if (state.mnemonic) {
        showStatus('Logging in...', 'info')
        try {
          const result = await AuthManager.loginWithMnemonic(state.mnemonic)
          if (result) {
            showStatus('Login successful!', 'success')
          } else {
            showStatus('Login failed', 'error')
          }
        } catch (e) {
          showStatus(`Login failed: ${e.message}`, 'error')
        }
      }
    })
  }

  /**
   * Inject styles into the document
   */
  const injectStyles = () => {
    if (document.getElementById('auth-ui-styles')) return

    const styles = document.createElement('style')
    styles.id = 'auth-ui-styles'
    styles.textContent = `
      .auth-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(5, 5, 10, 0.95);
        backdrop-filter: blur(20px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 1;
        transition: opacity 0.3s ease;
      }
      
      .auth-overlay.hidden {
        opacity: 0;
        pointer-events: none;
      }
      
      .auth-container {
        width: 100%;
        max-width: 420px;
        padding: 20px;
      }
      
      .auth-card {
        background: rgba(25, 25, 35, 0.9);
        border: 1px solid rgba(100, 100, 140, 0.3);
        border-radius: 16px;
        padding: 32px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      }
      
      .auth-header {
        text-align: center;
        margin-bottom: 28px;
      }
      
      .auth-title {
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 28px;
        font-weight: 600;
        color: #ffffff;
        margin: 0 0 6px 0;
        letter-spacing: 1px;
      }
      
      .auth-subtitle {
        font-size: 13px;
        color: #888;
        margin: 0;
      }
      
      .auth-section {
        margin-bottom: 20px;
      }
      
      .auth-warning {
        background: rgba(255, 180, 0, 0.15);
        border: 1px solid rgba(255, 180, 0, 0.4);
        border-radius: 8px;
        padding: 12px;
        color: #ffc107;
        font-size: 12px;
        line-height: 1.5;
        margin-bottom: 14px;
        text-align: center;
      }
      
      .auth-textarea {
        width: 100%;
        background: rgba(40, 40, 50, 0.9);
        border: 1px solid rgba(100, 100, 140, 0.3);
        border-radius: 8px;
        padding: 14px;
        color: #e0e0e0;
        font-family: 'SF Mono', 'Consolas', monospace;
        font-size: 13px;
        line-height: 1.5;
        resize: none;
        box-sizing: border-box;
        transition: border-color 0.2s;
      }
      
      .auth-textarea:focus {
        outline: none;
        border-color: #4a9eff;
      }
      
      .auth-textarea-readonly {
        background: rgba(30, 40, 50, 0.9);
        border-color: rgba(74, 158, 255, 0.4);
        color: #79c0ff;
      }
      
      .auth-btn-icon {
        display: block;
        width: 100%;
        background: transparent;
        border: 1px dashed rgba(100, 100, 140, 0.4);
        border-radius: 6px;
        padding: 8px;
        color: #888;
        font-size: 12px;
        cursor: pointer;
        margin-top: 10px;
        transition: all 0.2s;
      }
      
      .auth-btn-icon:hover {
        border-color: #4a9eff;
        color: #4a9eff;
        background: rgba(74, 158, 255, 0.1);
      }
      
      .auth-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .auth-btn {
        width: 100%;
        padding: 14px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
      }
      
      .auth-btn-primary {
        background: linear-gradient(135deg, #4a9eff, #3d7dd4);
        color: white;
        box-shadow: 0 4px 12px rgba(74, 158, 255, 0.3);
      }
      
      .auth-btn-primary:hover {
        background: linear-gradient(135deg, #5aa8ff, #4a9eff);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(74, 158, 255, 0.4);
      }
      
      .auth-btn-secondary {
        background: rgba(60, 60, 80, 0.8);
        color: #e0e0e0;
        border: 1px solid rgba(100, 100, 140, 0.3);
      }
      
      .auth-btn-secondary:hover {
        background: rgba(80, 80, 100, 0.9);
        border-color: rgba(150, 150, 180, 0.5);
      }
      
      .auth-btn-accent {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
      
      .auth-btn-accent:hover {
        background: linear-gradient(135deg, #34d399, #10b981);
        transform: translateY(-1px);
      }
      
      .auth-btn-outline {
        background: transparent;
        color: #888;
        border: 1px solid rgba(100, 100, 140, 0.3);
      }
      
      .auth-btn-outline:hover {
        color: #e0e0e0;
        border-color: rgba(150, 150, 180, 0.5);
        background: rgba(60, 60, 80, 0.4);
      }
      
      .auth-divider {
        display: flex;
        align-items: center;
        margin: 6px 0;
      }
      
      .auth-divider::before,
      .auth-divider::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid rgba(100, 100, 140, 0.2);
      }
      
      .auth-divider span {
        padding: 0 12px;
        color: #666;
        font-size: 11px;
        text-transform: uppercase;
      }
      
      .auth-status {
        margin-top: 16px;
        text-align: center;
        font-size: 12px;
        min-height: 20px;
        transition: all 0.2s;
      }
      
      .auth-status-info { color: #888; }
      .auth-status-error { color: #ef4444; }
      .auth-status-success { color: #10b981; }
      
      .auth-loading {
        text-align: center;
        padding: 40px 0;
      }
      
      .auth-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(74, 158, 255, 0.2);
        border-top-color: #4a9eff;
        border-radius: 50%;
        animation: auth-spin 1s linear infinite;
        margin: 0 auto 16px;
      }
      
      @keyframes auth-spin {
        to { transform: rotate(360deg); }
      }
      
      .auth-loading p {
        color: #888;
        font-size: 13px;
        margin: 0;
      }
    `
    document.head.appendChild(styles)
  }

  /**
   * Show the auth overlay
   */
  const show = () => {
    if (!overlay) return
    overlay.classList.remove('hidden')
  }

  /**
   * Hide the auth overlay
   */
  const hide = () => {
    if (!overlay) return
    overlay.classList.add('hidden')
    
    // Notify callback after animation
    setTimeout(() => {
      if (onAuthenticatedCallback) {
        onAuthenticatedCallback()
      }
    }, 300)
  }

  /**
   * Initialize the Auth UI
   * 
   * @param {HTMLElement} container - Container element (or id)
   * @param {object} [options]
   * @param {() => void} [options.onAuthenticated] - Callback when authenticated
   * @returns {Promise<void>}
   */
  const init = async (container, options = {}) => {
    onAuthenticatedCallback = options.onAuthenticated ?? null
    
    // Get container element
    overlay = typeof container === 'string' 
      ? document.getElementById(container)
      : container
    
    if (!overlay) {
      console.error('[AuthUI] Container not found')
      return
    }
    
    // Inject styles
    injectStyles()
    
    // Set initial HTML
    overlay.className = 'auth-overlay'
    overlay.innerHTML = generateHTML()
    
    // Set loading state
    currentState = UI_STATES.LOADING
    updateContent({ isActive: false, hasWebAuthnRegistration: false })
    
    // Initialize auth manager
    try {
      const state = await AuthManager.init()
      
      // Check if already authenticated (silent resume)
      if (state.isActive) {
        console.log('[AuthUI] Already authenticated')
        hide()
        return
      }
      
      // Show login view
      currentState = UI_STATES.LOGIN
      updateContent(state)
      
      // Subscribe to state changes
      AuthManager.onStateChange((authState) => {
        if (authState.isActive) {
          hide()
        } else {
          updateContent(authState)
        }
      })
      
    } catch (e) {
      console.error('[AuthUI] Initialization failed:', e)
      showStatus(`Connection failed: ${e.message}`, 'error')
    }
  }

  /**
   * Destroy the UI and cleanup
   */
  const destroy = () => {
    if (overlay) {
      overlay.innerHTML = ''
      overlay.className = ''
    }
    overlay = null
    onAuthenticatedCallback = null
  }

  return {
    init,
    show,
    hide,
    destroy
  }
}

export default createAuthUI
