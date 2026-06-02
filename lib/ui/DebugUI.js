/**
 * DebugUI.js
 * Handles dynamic injection of the technical Debug UI (Stats & Technical Settings).
 */

const DEBUG_UI_HTML = `
    <!-- Debug Panel (Bottom Left, above/replaces stats area of Main UI) -->
    <div id="debug-panel" style="display: none;">
      <!-- Stats (Original stats from ControlPanel) -->
      <div class="control-section">
        <div class="section-title">Technical Stats</div>
        <div class="stats-row">
          <span class="stat-item"><span class="stats-label">Zone</span><span class="stats-value" id="zone-indicator" style="min-width: 40px;">-</span></span>
        </div>
        <div class="stats-row">
          <span class="stat-item"><span class="stats-label">MSL</span><span class="stats-value" id="msl-height">0 km</span></span>
          <span class="stat-item"><span class="stats-label">AGL</span><span class="stats-value" id="camera-height">0 m</span></span>
        </div>
        <div class="stats-row">
          <span class="stat-item"><span class="stats-label">Quads</span><span class="stats-value" id="tile-count" style="min-width: 40px;">0</span></span>
          <span class="stat-item"><span class="stats-label">LOD</span><span class="stats-value" id="lod-levels">0</span></span>
        </div>
      </div>
      
      <!-- Terrain Debug (Original toggles from ControlPanel) -->
      <div class="control-section">
        <div class="section-title">Terrain Visuals</div>
        <div class="checkbox-row" style="gap: 12px;">
          <label class="checkbox-label"><input type="checkbox" id="cb-show-quads" class="styled-checkbox"> Quads</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-show-subquads" class="styled-checkbox"> Sub-quads</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-draw-skirts" class="styled-checkbox" checked> Skirts</label>
        </div>
        <div class="checkbox-row" style="gap: 10px; flex-wrap: wrap;">
          <label class="checkbox-label"><input type="checkbox" id="cb-terrain-color" class="styled-checkbox" checked> Color</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-terrain-noise" class="styled-checkbox" checked> Noise</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-terrain-bump" class="styled-checkbox" checked> Bump</label>
        </div>
        <div class="checkbox-row" style="gap: 10px; flex-wrap: wrap;">
          <label class="checkbox-label"><input type="checkbox" id="cb-atmosphere" class="styled-checkbox" checked> Atmosphere</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-snow" class="styled-checkbox"> Snow</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-npcs" class="styled-checkbox" checked> NPCs</label>
        </div>
        <div class="checkbox-row" style="gap: 10px; flex-wrap: wrap;">
          <label class="checkbox-label"><input type="checkbox" id="cb-bypass-scatter" class="styled-checkbox"> Bypass Scatter (rocks, plants, crystals)</label>
        </div>
        <div class="checkbox-row" style="gap: 10px; flex-wrap: wrap;">
          <label class="checkbox-label"><input type="checkbox" id="cb-bypass-textures" class="styled-checkbox"> Bypass Textures</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-bypass-lighting" class="styled-checkbox"> Bypass Lighting</label>
          <label class="checkbox-label"><input type="checkbox" id="cb-bypass-shadows" class="styled-checkbox"> Bypass Shadows</label>
        </div>

        <div class="display-modes">
          <button class="mode-btn active" id="btn-mode-ortho" data-mode="0">Ortho</button>
          <button class="mode-btn" id="btn-mode-normal" data-mode="1">Normal</button>
          <button class="mode-btn" id="btn-mode-elev" data-mode="2">Elev</button>
          <button class="mode-btn" id="btn-mode-grid">Grid</button>
        </div>
        <!-- Position Info -->
        <div class="position-info" id="position-info" style="margin-top: 10px; border-top: 1px solid rgba(80,80,80,0.3); padding-top: 8px;">Pos: (0, 0, 0)</div>
      </div>
    </div>
`;

/**
 * Injects the Debug Panel into the document body.
 */
export const injectDebugPanel = () => {
  if (document.getElementById('debug-panel')) return;
  
  const temp = document.createElement('div');
  temp.innerHTML = DEBUG_UI_HTML;
  document.body.appendChild(temp.firstElementChild);
};

/**
 * Toggles the visibility of the Debug Panel.
 */
export const toggleDebugPanel = () => {
    const dp = document.getElementById('debug-panel');
    if (!dp) return false;
    
    const isVisible = dp.style.display !== 'none';
    dp.style.display = isVisible ? 'none' : 'block';
    return !isVisible;
};
