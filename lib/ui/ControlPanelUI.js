/**
 * ControlPanelUI.js
 * Handles dynamic injection of the core Control Panel (HUD).
 */

const CONTROL_PANEL_HTML = `
    <!-- Control Panel (Bottom Left) - Legend Only -->
    <div id="control-panel" style="display: none;">
      <!-- Controls (compact) -->
      <div class="control-section">
        <div class="section-title">Controls</div>
        <div class="control-row">
          <span class="key-box">W</span>
          <span class="key-box">A</span>
          <span class="key-box">S</span>
          <span class="key-box">D</span>
          <span class="key-label">Move</span>
        </div>
        <div class="control-row">
          <span class="key-box">Q</span>
          <span class="key-box">E</span>
          <span class="key-label">↕</span>
          <span class="key-box">🖱️</span><span class="key-label">Orb</span>
          <span class="key-box">⚙️</span><span class="key-label">Zm</span>
          <span class="key-box">⇧</span><span class="key-label">Bst</span>
        </div>
        <div class="control-row" style="margin-top: 5px;">
          <span class="key-box">1</span><span class="key-label">👋</span>
          <span class="key-box">2</span><span class="key-label">💃</span>
          <span class="key-box">X</span><span class="key-label">Sit</span>
        </div>
        <div class="control-row" style="margin-top: 5px;">
          <span class="key-box">H</span><span class="key-label">Hide Help</span>
          <span class="key-box">G</span><span class="key-label" style="color: #6f6;">Debug</span>
        </div>
      </div>
    </div>
`;

/**
 * Injects the Control Panel into the document body.
 */
export const injectControlPanel = () => {
  if (document.getElementById('control-panel')) return; // Already injected
  
  const temp = document.createElement('div');
  temp.innerHTML = CONTROL_PANEL_HTML;
  document.body.appendChild(temp.firstElementChild);
};

/**
 * Toggles the visibility of the Control Panel.
 * @returns {boolean} New visibility state
 */
export const toggleControlPanel = () => {
    const cp = document.getElementById('control-panel');
    if (!cp) return false;
    
    const isVisible = cp.style.display !== 'none';
    cp.style.display = isVisible ? 'none' : 'block';
    
    // Also hide popped up config panels if we are hiding the main control panel
    if (isVisible) {
        document.getElementById('terrain-config-panel')?.classList.remove('visible');
    }
    
    return !isVisible;
};
