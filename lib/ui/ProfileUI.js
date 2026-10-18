import { AuthManager, RPMManager } from '../network/index.js'
import { STORAGE_KEYS } from '../config/index.js'
import { AVATAR_CONFIG } from '../config/avatarConfig.js'
import { saveAvatarLook } from '../avatar/avatar-identity.js'
// Lazy-loaded blockchain manager (loaded on first blockchain operation).
let _blockchainManager = null;
const getBlockchainManager = async () => {
  if (!_blockchainManager) {
    const { BlockchainManager } = await import('../blockchain/BlockchainManager.js');
    _blockchainManager = BlockchainManager;
  }
  return _blockchainManager;
};

/**
 * Profile UI - User Profile Badge & Panel
 * 
 * Minimalist profile icon in top-right corner with
 * expandable panel for account options.
 * 
 * @module ProfileUI
 */

/**
 * Create the Profile UI controller
 * 
 * @returns {object} ProfileUI API
 */
export const createProfileUI = () => {
  /** @type {HTMLElement | null} */
  let badge = null
  
  /** @type {HTMLElement | null} */
  let panel = null
  
  /** @type {boolean} */
  let isOpen = false

  /** @type {string} */
  let ovgBalance = '...'

  /** @type {string} */
  let nativeBalance = '...'

  /** @type {boolean} */
  let isWebAuthnRegistering = false

  /** @type {number | null} */
  let balanceRefreshInterval = null

  /** @type {'profile' | 'send'} */
  let activeView = 'profile'

  /** @type {number} */
  let sendFlowStep = 1

  /** @type {string} */
  let tempSendToken = 'OVG'

  /** @type {string} */
  let tempSendAmount = ''

  /** @type {string} */
  let tempSendRecipient = ''

  /**
   * Render avatar HTML (image or fallback SVG)
   * @param {string | null} imageUrl 
   * @param {string} className 
   * @returns {string}
   */
  const renderAvatarHTML = (imageUrl, className) => {
    const fallbackSvg = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8" r="4"/>
        <path d="M12 14c-6 0-8 3-8 5v1h16v-1c0-2-2-5-8-5z"/>
      </svg>
    `
    
    if (!imageUrl) return fallbackSvg

    return `
      <img src="${imageUrl}" alt="Avatar" class="${className}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
      <div style="display:none">${fallbackSvg}</div>
    `
  }

  /**
   * Copy text to clipboard with fallback
   * @param {string} text 
   * @returns {Promise<void>}
   */
  const performCopy = async (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return await navigator.clipboard.writeText(text)
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement("textarea")
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        document.body.removeChild(textArea)
        return Promise.resolve()
      } catch (err) {
        document.body.removeChild(textArea)
        return Promise.reject(err)
      }
    }
  }

  /**
   * Extract avatar ID from GLB URL and generate PNG thumbnail URL
   * @returns {string | null} Avatar image URL or null if no avatar
   */
  const getAvatarImageUrl = () => {
    const glbUrl = localStorage.getItem(STORAGE_KEYS.RPM_AVATAR) || AVATAR_CONFIG.url
    if (!glbUrl) return null
    
    // Extract ID from URL like: https://models.readyplayer.me/{id}.glb?params
    const match = glbUrl.match(/\/([a-f0-9]+)\.glb/i)
    if (!match) return null
    
    const avatarId = match[1]
    return `https://api.readyplayer.me/v1/avatars/${avatarId}.png?scene=fullbody-portrait-v1`
  }

  /**
   * Generate the badge HTML (avatar icon)
   * @param {object} state - Auth state
   * @returns {string}
   */
  const generateBadgeHTML = (state) => {
    return `
    <div class="profile-badge-avatar" title="${state.isActive ? state.abbrAddr : 'Not logged in'}">
      ${renderAvatarHTML(getAvatarImageUrl(), 'profile-avatar-img')}
      ${state.isActive ? '<span class="profile-status-dot"></span>' : ''}
    </div>
  `
  }

  /**
   * Generate the body content for the send flow wizard
   * @param {object} state - Auth state
   * @returns {string}
   */
  const generateSendViewHTML = (state) => {
    if (sendFlowStep === 1) {
      return `
        <div class="profile-wizard-step">
          <div class="profile-section-title">Step 1: Token & Amount</div>
          <div class="profile-input-group">
            <label>Token</label>
            <select id="send-token" class="profile-input profile-select">
              <option value="OVG" ${tempSendToken === 'OVG' ? 'selected' : ''}>OVG</option>
              <option value="POL" ${tempSendToken === 'POL' ? 'selected' : ''}>POL</option>
            </select>
          </div>
          <div class="profile-input-group">
            <label>Amount</label>
            <input type="number" id="send-amount" placeholder="0.0" step="any" class="profile-input" value="${tempSendAmount}">
            <div class="profile-input-hint" id="send-balance-hint">
              Balance: ${tempSendToken === 'POL' ? nativeBalance : ovgBalance} ${tempSendToken}
            </div>
          </div>
          <button class="profile-btn profile-btn-accent" id="btn-send-next" style="margin-top: 15px; justify-content: center; display: flex;">
            Next: Recipient →
          </button>
        </div>
      `
    } else {
      return `
        <div class="profile-wizard-step">
          <div class="profile-section-title">Step 2: Recipient</div>
          <div class="profile-input-group">
            <label>Recipient Address</label>
            <input type="text" id="send-recipient" placeholder="0x..." class="profile-input" value="${tempSendRecipient}">
            <div class="profile-input-hint">Check carefully! Transactions are final.</div>
          </div>
          <div class="profile-summary">
            Sending <strong>${tempSendAmount} ${tempSendToken}</strong>
          </div>
          <button class="profile-btn profile-btn-accent" id="btn-confirm-send" style="margin-top: 15px; justify-content: center; display: flex;">
            Confirm Transfer
          </button>
        </div>
      `
    }
  }

  /**
   * Generate the body content for the mnemonic (recovery phrase) view
   * @param {object} state - Auth state
   * @returns {string}
   */
  const generateMnemonicViewHTML = (state) => {
    return `
      <div class="profile-wizard-step">
        <div class="profile-section-title">Recovery Phrase</div>
        <div class="profile-warning" style="margin-bottom: 12px; font-size: 11px;">
          ⚠️ Keep this phrase private! Anyone with these 12 words can access your funds.
        </div>
        <textarea class="profile-mnemonic" readonly id="profile-mnemonic" style="height: 80px; margin-bottom: 15px;">${state.mnemonic}</textarea>
        <button class="profile-btn profile-btn-accent" id="btn-profile-copy-mnemonic" style="justify-content: center; display: flex;">
          📋 Copy Phrase
        </button>
        <div class="profile-input-hint" style="text-align: center; margin-top: 10px;">
          Stored securely in your local browser.
        </div>
      </div>
    `
  }

  /**
   * Generate the panel HTML
   * @param {object} state - Auth state
   * @returns {string}
   */
  const generatePanelHTML = (state) => {
    const avatarImg = getAvatarImageUrl()
    const isSendView = activeView === 'send'
    const isMnemonicView = activeView === 'mnemonic'
    const showBack = isSendView || isMnemonicView
    
    let title = 'Profile'
    if (isSendView) title = 'Send Tokens'
    if (isMnemonicView) title = 'Recovery Phrase'

    return `
    <div class="profile-panel-header">
      ${showBack 
        ? `<button class="profile-panel-back" id="btn-view-back">←</button>` 
        : ''}
      <span class="profile-panel-title">${title}</span>
      <button class="profile-panel-close" id="profile-close">×</button>
    </div>
    
    <div class="profile-panel-content">
      ${!state.isActive ? `
        <div class="profile-info">
          <p class="profile-not-logged">Not logged in</p>
        </div>
      ` : activeView === 'send' ? `
        ${generateSendViewHTML(state)}
        <div id="send-status" class="profile-tx-status"></div>
      ` : activeView === 'mnemonic' ? `
        ${generateMnemonicViewHTML(state)}
      ` : `
        <div class="profile-info">
          <div class="profile-avatar-large" id="btn-customize-avatar" title="Customize Avatar">
            ${renderAvatarHTML(avatarImg, 'profile-avatar-large-img')}
            <div class="profile-avatar-edit-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </div>
          </div>
          <div class="profile-address-row">
            <div class="profile-address" id="profile-address" data-full-address="${state.address || ''}" title="Click to copy full address">
              ${state.abbrAddr}
            </div>
            <div class="profile-security-icons">
              ${!state.isWebAuthnProtected ? `
                <button class="profile-key-btn" id="btn-register-webauthn" title="Protect with Passkey">
                  🔓
                </button>
              ` : `
                <span class="profile-protected-badge" title="Passkey Protected">🔐</span>
              `}
              ${state.mnemonic ? `
                <button class="profile-key-btn" id="btn-show-mnemonic" title="View Recovery Phrase" data-mnemonic="${state.mnemonic}">
                  🔑
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <div class="profile-wallet">
          <div class="profile-wallet-label">
            Wallet Balance
            <button class="profile-refresh-btn" id="btn-refresh-balance" title="Refresh Balance">🔄</button>
          </div>
          <div class="profile-wallet-value" id="profile-ovg-balance">
            ${ovgBalance} <span class="profile-wallet-symbol">OVG</span>
          </div>
          <div class="profile-wallet-native" id="profile-native-balance">
            ${nativeBalance} POL
          </div>
          <button class="profile-send-toggle-btn" id="btn-view-send">
            💸 Send Tokens
          </button>
        </div>
        
        <div class="profile-actions">
          <button class="profile-btn profile-btn-danger" id="btn-logout">
            🚪 Logout
          </button>
        </div>
      `}
    </div>
  `
  }

  /**
   * Inject styles into the document
   */
  const injectStyles = () => {
    if (document.getElementById('profile-ui-styles')) return

    const styles = document.createElement('style')
    styles.id = 'profile-ui-styles'
    styles.textContent = `
      .profile-badge {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        cursor: pointer;
      }
      
      .profile-badge-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(30, 30, 40, 0.85);
        border: 2px solid rgba(100, 100, 140, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #888;
        transition: all 0.2s ease;
        position: relative;
        backdrop-filter: blur(8px);
        overflow: hidden;
      }

      .profile-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: rgba(30,30,40,0.9);
      }
      
      .profile-avatar:hover {
        border-color: #4a9eff;
        color: #4a9eff;
        transform: scale(1.05);
      }
      
      .profile-avatar svg {
        width: 22px;
        height: 22px;
      }
      
      .profile-status-dot {
        position: absolute;
        bottom: 2px;
        right: 2px;
        width: 10px;
        height: 10px;
        background: #10b981;
        border-radius: 50%;
        border: 2px solid rgba(30, 30, 40, 0.85);
      }
      
      .profile-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 280px;
        background: rgba(25, 25, 35, 0.95);
        border: 1px solid rgba(100, 100, 140, 0.3);
        border-radius: 12px;
        z-index: 1001;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(12px);
        opacity: 0;
        transform: translateY(-10px) scale(0.95);
        pointer-events: none;
        transition: all 0.2s ease;
      }
      
      .profile-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      
      .profile-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(100, 100, 140, 0.2);
      }
      
      .profile-panel-title {
        font-size: 14px;
        font-weight: 600;
        color: #e0e0e0;
      }
      
      .profile-panel-close {
        background: none;
        border: none;
        color: #666;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        transition: color 0.2s;
      }
      
      .profile-panel-close:hover {
        color: #fff;
      }

      .profile-panel-back {
        background: none;
        border: none;
        color: #666;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
        transition: color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .profile-panel-back:hover {
        color: #fff;
      }
      
      .profile-panel-content {
        padding: 16px;
      }
      
      .profile-info {
        text-align: center;
        margin-bottom: 16px;
      }


      .profile-avatar-large {
        width: 84px;
        height: 84px;
        border-radius: 50%;
        background: rgba(60, 60, 80, 0.6);
        border: 2px solid rgba(100, 100, 140, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #888;
        margin: 0 auto 12px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        position: relative;
        cursor: pointer;
        transition: border-color 0.2s ease;
      }

      .profile-avatar-large:hover {
        border-color: rgba(100, 180, 255, 0.6);
      }

      .profile-avatar-large-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .profile-avatar-large svg {
        width: 36px;
        height: 36px;
      }

      .profile-avatar-edit-icon {
        position: absolute;
        bottom: 10px;
        right: 12px;
        width: 18px;
        height: 18px;
        background: rgba(80, 140, 255, 0.20);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
        transition: background 0.2s ease, transform 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }

      .profile-avatar-edit-icon svg {
        width: 10px;
        height: 10px;
      }

      .profile-avatar-large:hover .profile-avatar-edit-icon {
        background: rgba(100, 160, 255, 1);
        transform: scale(1.1);
      }
      
      .profile-address-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }

      .profile-security-icons {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .profile-address {
        font-family: 'SF Mono', 'Consolas', monospace;
        font-size: 13px;
        color: #79c0ff;
        cursor: pointer;
        padding: 6px 12px;
        background: rgba(74, 158, 255, 0.1);
        border-radius: 6px;
        display: inline-block;
        transition: background 0.2s;
      }
      
      .profile-address:hover {
        background: rgba(74, 158, 255, 0.2);
      }

      .profile-key-btn {
        background: transparent;
        border: none;
        padding: 0;
        font-size: 14px;
        cursor: pointer;
        transition: transform 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .profile-key-btn:hover {
        transform: scale(1.2);
      }

      .profile-protected-badge {
        font-size: 14px;
        opacity: 0.8;
      }
      
      .profile-status {
        font-size: 11px;
        color: #888;
        margin-top: 8px;
      }
      
      .profile-not-logged {
        color: #666;
        font-size: 13px;
        margin: 20px 0;
      }
      
      .profile-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .profile-btn {
        width: 100%;
        padding: 10px 14px;
        background: rgba(60, 60, 80, 0.6);
        border: 1px solid rgba(100, 100, 140, 0.3);
        border-radius: 8px;
        color: #ccc;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      }
      
      .profile-btn:hover {
        background: rgba(80, 80, 100, 0.8);
        border-color: rgba(150, 150, 180, 0.4);
        color: #fff;
      }
      
      .profile-btn-danger {
        color: #f87171;
      }
      
      .profile-btn-danger:hover {
        background: rgba(248, 113, 113, 0.15);
        border-color: rgba(248, 113, 113, 0.4);
      }
      
      .profile-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(100, 100, 140, 0.2);
      }
      
      .profile-warning {
        font-size: 11px;
        color: #fbbf24;
        margin-bottom: 8px;
        text-align: center;
      }
      
      .profile-mnemonic {
        width: 100%;
        background: rgba(40, 40, 50, 0.9);
        border: 1px solid rgba(100, 100, 140, 0.3);
        border-radius: 6px;
        padding: 10px;
        color: #79c0ff;
        font-family: 'SF Mono', 'Consolas', monospace;
        font-size: 11px;
        resize: none;
        height: 60px;
        box-sizing: border-box;
      }

      .profile-wallet {
        background: rgba(74, 158, 255, 0.1);
        border: 1px solid rgba(74, 158, 255, 0.2);
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 16px;
        text-align: center;
      }

      .profile-wallet-label {
        font-size: 11px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }

      .profile-wallet-value {
        color: #fff;
        font-family: 'SF Mono', 'Consolas', monospace;
      }

      .profile-wallet-symbol {
        color: #4a9eff;
        font-weight: 600;
      }

      .profile-wallet-native {
        font-size: 11px;
        color: #888;
        margin-top: 2px;
        font-family: 'SF Mono', 'Consolas', monospace;
      }

      .profile-send-toggle-btn {
        margin-top: 10px;
        background: rgba(74, 158, 255, 0.2);
        border: 1px solid rgba(74, 158, 255, 0.4);
        color: #fff;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
      }

      .profile-send-toggle-btn:hover {
        background: rgba(74, 158, 255, 0.3);
        border-color: #4a9eff;
      }

      .profile-refresh-btn {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        margin-left: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        opacity: 0.6;
        transition: opacity 0.2s;
        vertical-align: middle;
      }

      .profile-refresh-btn:hover {
        opacity: 1;
      }

      .profile-refresh-btn.spinning {
        animation: profile-spin 1s linear infinite;
      }

      @keyframes profile-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .profile-section-title {
        font-size: 12px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .profile-input-group {
        margin-bottom: 12px;
        text-align: left;
      }

      .profile-input-group label {
        display: block;
        font-size: 11px;
        color: #888;
        margin-bottom: 4px;
        margin-left: 2px;
      }

      .profile-input {
        width: 100%;
        background: rgba(40, 40, 50, 0.8);
        border: 1px solid rgba(100, 100, 140, 0.3);
        border-radius: 6px;
        padding: 8px 10px;
        color: #e0e0e0;
        font-size: 13px;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.2s;
      }

      .profile-input:focus {
        border-color: #4a9eff;
      }

      .profile-select {
        cursor: pointer;
        appearance: none;
        background-color: rgba(40, 40, 50, 0.8);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23a0a0a0' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: calc(100% - 10px) center;
        padding-right: 30px;
      }

      .profile-select option {
        background: #1e1e2d;
        color: white;
      }

      .profile-tx-status {
        margin-top: 10px;
        font-size: 11px;
        text-align: center;
        min-height: 16px;
      }

      .profile-input-hint {
        font-size: 11px;
        color: #666;
        margin-top: 4px;
        margin-left: 2px;
      }

      .profile-summary {
        margin: 15px 0;
        padding: 12px;
        background: rgba(74, 158, 255, 0.05);
        border: 1px dashed rgba(74, 158, 255, 0.2);
        border-radius: 8px;
        text-align: center;
        font-size: 13px;
        color: #aaa;
      }

      .profile-summary strong {
        color: #4a9eff;
        font-size: 14px;
      }

      .profile-btn-text:hover {
        text-decoration: underline;
        color: #4a9eff !important;
      }
    `
    document.head.appendChild(styles)
  }

  /**
   * Toggle panel visibility
   */
  const toggle = () => {
    isOpen = !isOpen
    if (panel) {
      // Re-render panel content and bind events when opening
      if (isOpen) {
        // Reset any stuck flags
        isWebAuthnRegistering = false
        
        const state = AuthManager.getState()
        console.log('[ProfileUI] Toggle open, state:', state)
        panel.innerHTML = generatePanelHTML(state)
        bindPanelEvents(state)
        refreshBalance()
      }
      panel.classList.toggle('open', isOpen)
    }
  }

  /**
   * Close the panel
   */
  const close = () => {
    isOpen = false
    if (panel) {
      panel.classList.remove('open')
    }
  }

  /**
   * Update the UI with current auth state
   */
  const update = () => {
    const state = AuthManager.getState()
    
    if (badge) {
      badge.innerHTML = generateBadgeHTML(state)
    }
    
    // Only update panel content if it's open and not during WebAuthn registration
    if (panel && isOpen && !isWebAuthnRegistering) {
      panel.innerHTML = generatePanelHTML(state)
      bindPanelEvents(state)
      refreshBalance()
    }
  }

  /**
   * Refresh OVG balance from blockchain
   */
  const refreshBalance = async () => {
    try {
      const BlockchainManager = await getBlockchainManager();
      if (!BlockchainManager) return; // blockchain unavailable
      const [ovg, native] = await Promise.all([
        Promise.race([
          BlockchainManager.getOVGBalance(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('OVG Timeout')), 10000))
        ]),
        Promise.race([
          BlockchainManager.getNativeBalance(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Native Timeout')), 10000))
        ])
      ])
      
      ovgBalance = ovg
      nativeBalance = native
      
      const balanceEl = document.getElementById('profile-ovg-balance')
      if (balanceEl) {
        balanceEl.innerHTML = `${ovgBalance} <span class="profile-wallet-symbol">OVG</span>`
      }

      const nativeEl = document.getElementById('profile-native-balance')
      if (nativeEl) {
        nativeEl.textContent = `${parseFloat(nativeBalance).toFixed(4)} POL`
      }

      const hintEl = document.getElementById('send-balance-hint')
      if (hintEl) {
        hintEl.textContent = `Balance: ${tempSendToken === 'POL' ? nativeBalance : ovgBalance} ${tempSendToken}`
      }
    } catch (e) {
      console.error('[ProfileUI] Balance refresh ERROR:', e.message)
      ovgBalance = '0.0'
      nativeBalance = '0.0'
      
      const balanceEl = document.getElementById('profile-ovg-balance')
      if (balanceEl) balanceEl.innerHTML = `0.0 <span class="profile-wallet-symbol">OVG</span>`
      
      const nativeEl = document.getElementById('profile-native-balance')
      if (nativeEl) nativeEl.textContent = `0.0000 POL`
    }
  }

  /**
   * Bind panel event listeners
   * @param {object} state
   */
  const bindPanelEvents = (state) => {
    // Close button
    const closeBtn = document.getElementById('profile-close')
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      close()
    })

    // Address click copy
    const addressEl = document.getElementById('profile-address')
    const fullAddress = addressEl?.dataset.fullAddress || state.address
    
    const copyAddress = async () => {
      console.log('[ProfileUI] Copying address:', fullAddress)
      if (fullAddress) {
        try {
          await performCopy(fullAddress)
          const originalText = addressEl?.textContent
          if (addressEl) addressEl.textContent = '✓ Copied!'
          setTimeout(() => {
            if (addressEl) addressEl.textContent = originalText
          }, 1500)
        } catch (e) {
          console.error('[ProfileUI] Failed to copy address:', e)
        }
      }
    }
    
    addressEl?.addEventListener('click', (e) => {
      e.stopPropagation()
      copyAddress()
    })

    // Refresh balance button
    const refreshBtn = document.getElementById('btn-refresh-balance')
    refreshBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (refreshBtn.classList.contains('spinning')) return
      
      refreshBtn.classList.add('spinning')
      await refreshBalance()
      setTimeout(() => refreshBtn.classList.remove('spinning'), 500)
    })

    // Show/hide mnemonic section
    const showMnemonicBtn = document.getElementById('btn-show-mnemonic')
    showMnemonicBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      activeView = 'mnemonic'
      update()
    })

    // Copy mnemonic
    const copyMnemonicBtn = document.getElementById('btn-profile-copy-mnemonic')
    if (copyMnemonicBtn) {
      console.log('[ProfileUI] Binding Copy Phrase button listener')
      copyMnemonicBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        console.log('[ProfileUI] Copy button clicked')
        
        const mnemonicTextarea = document.getElementById('profile-mnemonic')
        // Try multiple sources for the mnemonic: textarea, state, or the button that triggered the view
        const mnemonic = mnemonicTextarea?.value || state.mnemonic || document.getElementById('btn-show-mnemonic')?.dataset.mnemonic
        
        console.log('[ProfileUI] Mnemonic copy source check:', {
          hasTextarea: !!mnemonicTextarea,
          textareaValueLen: mnemonicTextarea?.value?.length || 0,
          hasStateMnemonic: !!state.mnemonic,
          hasBtnDataset: !!document.getElementById('btn-show-mnemonic')?.dataset.mnemonic
        })

        if (!mnemonic || mnemonic === 'null') {
          console.error('[ProfileUI] Mnemonic not found for copying')
          alert('Error: Recovery phrase not found.')
          return
        }

        try {
          await performCopy(mnemonic)
          const originalText = copyMnemonicBtn.innerHTML
          copyMnemonicBtn.innerHTML = '✓ Copied!'
          console.log('[ProfileUI] Mnemonic copied successfully')
          setTimeout(() => {
            if (copyMnemonicBtn) copyMnemonicBtn.innerHTML = originalText
          }, 2000)
        } catch (err) {
          console.error('[ProfileUI] Copy execution failed:', err)
          copyMnemonicBtn.innerHTML = '❌ Error'
          setTimeout(() => {
            if (copyMnemonicBtn) copyMnemonicBtn.innerHTML = '📋 Copy Phrase'
          }, 2000)
        }
      })
    } else if (activeView === 'mnemonic') {
      console.warn('[ProfileUI] activeView is mnemonic but btn-profile-copy-mnemonic NOT FOUND in DOM')
    }

    // View Switching: Trigger Send Flow
    const viewSendBtn = document.getElementById('btn-view-send')
    viewSendBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      activeView = 'send'
      sendFlowStep = 1
      update()
    })

    // View Switching: Back to Profile / Back Step
    const viewBackBtn = document.getElementById('btn-view-back')
    viewBackBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      
      // If in Send Flow Step 2, go back to Step 1
      if (activeView === 'send' && sendFlowStep > 1) {
        console.log('[ProfileUI] Send flow: back to Step 1')
        sendFlowStep = 1
        update()
        return
      }

      // Otherwise go back to main profile
      console.log('[ProfileUI] Returning to main profile view')
      activeView = 'profile'
      // Clear temp data if returning
      tempSendAmount = ''
      tempSendRecipient = ''
      update()
    })

    // Wizard Navigation: Step 1 -> 2
    const sendNextBtn = document.getElementById('btn-send-next')
    const sendTokenSelect = document.getElementById('send-token')
    const sendAmountInput = document.getElementById('send-amount')
    
    sendTokenSelect?.addEventListener('change', () => {
      tempSendToken = sendTokenSelect.value
      update()
    })

    sendNextBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      const amount = sendAmountInput?.value?.trim()
      
      if (!amount || parseFloat(amount) <= 0) {
        const status = document.getElementById('send-status')
        if (status) {
          status.textContent = '❌ Invalid amount'
          status.style.color = '#ef4444'
        }
        return
      }

      tempSendToken = sendTokenSelect?.value || 'OVG'
      tempSendAmount = amount
      sendFlowStep = 2
      update()
    })

    // Confirm token send
    const confirmSendBtn = document.getElementById('btn-confirm-send')
    const sendRecipientInput = document.getElementById('send-recipient')
    const sendStatusEl = document.getElementById('send-status')

    confirmSendBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      const token = tempSendToken
      const amount = tempSendAmount
      const to = sendRecipientInput?.value?.trim() || tempSendRecipient

      if (!to) {
        if (sendStatusEl) {
          sendStatusEl.textContent = '❌ Recipient address required'
          sendStatusEl.style.color = '#ef4444'
        }
        return
      }

      // Check for valid 0x address format
      if (!to.startsWith('0x') || to.length !== 42) {
        if (sendStatusEl) {
          sendStatusEl.textContent = '❌ Please enter a valid 0x address'
          sendStatusEl.style.color = '#ef4444'
        }
        return
      }

      // Check for gas (POL)
      const nativeBal = parseFloat(nativeBalance)
      if (nativeBal <= 0) {
        if (sendStatusEl) {
          sendStatusEl.textContent = '❌ Not enough POL for gas'
          sendStatusEl.style.color = '#ef4444'
        }
        return
      }

      // If sending POL, check if amount is less than balance
      if (token === 'POL' && parseFloat(amount) >= nativeBal) {
        if (sendStatusEl) {
          sendStatusEl.textContent = '❌ Insufficient POL balance'
          sendStatusEl.style.color = '#ef4444'
        }
        return
      }

      try {
        if (confirmSendBtn) confirmSendBtn.disabled = true
        if (confirmSendBtn) confirmSendBtn.textContent = '⏱️ Processing...'
        if (sendStatusEl) {
          sendStatusEl.textContent = '⌛ Waiting for confirmation...'
          sendStatusEl.style.color = '#fbbf24'
        }

        console.log(`[ProfileUI] Executing transfer: ${amount} ${token} to ${to}`)
        const BlockchainManager = await getBlockchainManager();
        if (!BlockchainManager) return; // blockchain unavailable

        if (token === 'POL') {
          await BlockchainManager.sendPol(to, amount)
        } else {
          await BlockchainManager.sendOVG(to, amount)
        }

        if (sendStatusEl) {
          sendStatusEl.textContent = '✅ Transfer Successful!'
          sendStatusEl.style.color = '#10b981'
        }
        
        // Refresh balance after success
        setTimeout(() => refreshBalance(), 1000)

        // Reset flow after success delay
        setTimeout(() => {
          tempSendAmount = ''
          tempSendRecipient = ''
          activeView = 'profile'
          update()
        }, 3000)

      } catch (e) {
        console.error('[ProfileUI] Transfer error:', e)
        if (sendStatusEl) {
          sendStatusEl.textContent = `❌ Error: ${e.message || 'Transaction failed'}`
          sendStatusEl.style.color = '#ef4444'
        }
        if (confirmSendBtn) {
          confirmSendBtn.disabled = false
          confirmSendBtn.textContent = 'Confirm Transfer'
        }
      }
    })

    /** Avatar editor — mounts the voxel avatar editor directly inside a modal. */
    const _openAvatarEditor = async () => {
      const PID = 'voxel-avatar-modal'
      if (document.getElementById(PID)) return

      if (!document.getElementById('vae-css')) {
        const s = document.createElement('style')
        s.id = 'vae-css'
        s.textContent = `
          #${PID}{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(5,8,14,0.72);backdrop-filter:blur(6px);opacity:0;transition:opacity 0.2s ease}
          #${PID}.open{opacity:1}
          #${PID} .vae-box{position:relative;width:min(1120px,95vw);height:min(740px,92vh);border-radius:14px;overflow:hidden;border:1px solid rgba(120,130,170,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.55);background:#0b0f17}
          #${PID} .vae-x{position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;border-radius:8px;background:rgba(20,24,34,0.85);color:#e8eefc;font-size:20px;line-height:1;cursor:pointer;z-index:5}
          #${PID} .vae-x:hover{background:rgba(239,68,68,0.85)}
        `
        document.head.appendChild(s)
      }

      const modal = document.createElement('div')
      modal.id = PID
      modal.innerHTML = `<div class="vae-box"><button class="vae-x" title="Cerrar">×</button></div>`
      document.body.appendChild(modal)

      let handle = null
      const closeModal = () => { handle?.destroy?.(); handle = null; modal.remove() }
      modal.querySelector('.vae-x').addEventListener('click', closeModal)
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

      const { mountVoxelEditor } = await import('./voxel-avatar-editor.js')
      handle = mountVoxelEditor(modal.querySelector('.vae-box'), {
        initialParams: AVATAR_CONFIG.voxelParams || {},
        onApply: (params) => {
          AVATAR_CONFIG.voxel = true
          AVATAR_CONFIG.voxelParams = { ...params }
          saveAvatarLook(params) // persist the custom look so it survives reloads and keeps broadcasting
          window._avatarCharacterSystem?.reload?.()
        },
        onClose: closeModal,
      })

      requestAnimationFrame(() => modal.classList.add('open'))
    }

    // Customize Avatar button — placed after _openAvatarEditor definition
    const customizeAvatarBtn = document.getElementById('btn-customize-avatar')
    console.log('[ProfileUI] Avatar edit button found:', !!customizeAvatarBtn)
    customizeAvatarBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      console.log('[ProfileUI] Opening avatar editor...')
      close()
      try {
        _openAvatarEditor()
        console.log('[ProfileUI] Avatar editor opened')
      } catch (err) {
        console.error('[ProfileUI] Avatar editor error:', err)
      }
    })

    // Logout
    const logoutBtn = document.getElementById('btn-logout')
    logoutBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      console.log('[ProfileUI] Logging out...')
      await AuthManager.logout()
      close()
      location.reload()
    })

    // WebAuthn Registration (post-registration protection)
    const webauthnBtn = document.getElementById('btn-register-webauthn')
    webauthnBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      
      // Check if we're on HTTPS (required for WebAuthn)
      const isSecureContext = window.isSecureContext || 
        window.location.protocol === 'https:' || 
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      
      // Check if WebAuthn is actually available and on a valid domain
      const isValidDomain = window.location.protocol === 'https:'
      
      if (!isValidDomain) {
        console.warn('[ProfileUI] WebAuthn requires HTTPS')
        alert('⚠️ WebAuthn requires HTTPS. Please open the world from an https:// address.')
        return
      }
      
      console.log('[ProfileUI] Registering WebAuthn...')
      
      // Block UI updates during registration
      isWebAuthnRegistering = true
      
      try {
        const result = await AuthManager.protectWithWebAuthn()
        isWebAuthnRegistering = false
        
        if (result) {
          console.log('[ProfileUI] WebAuthn registered successfully')
        } else {
          console.warn('[ProfileUI] WebAuthn registration cancelled or failed')
        }
        // Always refresh UI after WebAuthn attempt (success or failure)
        update()
      } catch (err) {
        console.error('[ProfileUI] WebAuthn registration error:', err)
        isWebAuthnRegistering = false
        // Refresh UI after error to restore correct state
        update()
      }
    })
  }

  /**
   * Initialize the Profile UI
   * Creates badge and panel elements
   */
  const init = async () => {
    console.log('[ProfileUI] init() started')
    injectStyles()
    
    // Initialize blockchain manager lazily (don't block init)
    console.log('[ProfileUI] Blockchain will be lazy-loaded on first use')
    // Trigger background init for faster first use
    getBlockchainManager().then(mgr => {
      if (!mgr) return; // blockchain unavailable
      mgr.init().then(() => {
        console.log('[ProfileUI] BlockchainManager init finished')
        refreshBalance()
      }).catch(e => {
        console.error('[ProfileUI] Blockchain init background error:', e)
      })
    }).catch(e => {
      console.error('[ProfileUI] Blockchain lazy load error:', e)
    })

    // Create badge
    badge = document.createElement('div')
    badge.className = 'profile-badge'
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      toggle()
    })
    document.body.appendChild(badge)

    // Create panel
    panel = document.createElement('div')
    panel.className = 'profile-panel'
    panel.addEventListener('click', (e) => e.stopPropagation())
    document.body.appendChild(panel)

    // Close on outside click
    document.addEventListener('click', () => {
      if (isOpen) close()
    })

    // Subscribe to auth state changes
    AuthManager.onStateChange(() => update())

    // Subscribe to avatar changes to refresh images
    RPMManager.onAvatarChanged(() => update())

    // Auto-refresh balances every 30 seconds if panel is open
    balanceRefreshInterval = setInterval(() => {
      if (isOpen) {
        console.log('[ProfileUI] Auto-refreshing balances...')
        refreshBalance()
      }
    }, 30000)

    // Initial render
    update()

    console.log('[ProfileUI] Initialized')
  }

  /**
   * Destroy the UI and cleanup
   */
  const destroy = () => {
    if (balanceRefreshInterval) {
      clearInterval(balanceRefreshInterval)
      balanceRefreshInterval = null
    }
    badge?.remove()
    panel?.remove()
    badge = null
    panel = null
  }

  return {
    init,
    toggle,
    close,
    update,
    destroy
  }
}

export default createProfileUI
