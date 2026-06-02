/**
 * GamepadManager
 *
 * Polls connected gamepads each frame and mirrors their state into the
 * InputManager so the rest of the engine (NavigationManager, CharacterSystem,
 * UI toggles…) keeps working with no awareness of the controller.
 *
 * Supports the W3C "standard" gamepad mapping, which covers:
 *  - Xbox 360 / Xbox One / Series X|S
 *  - PlayStation 4 / 5 (DualShock 4, DualSense)
 *  - Generic XInput-compatible gamepads
 *
 * Mapping (W3C standard gamepad layout):
 *
 *   Left stick      → axes.moveX/moveY + virtual W/A/S/D
 *   Right stick     → axes.lookX/lookY
 *   LT (analog)     → axes.leftTrigger
 *   RT (analog)     → axes.rightTrigger + virtual Shift (sprint)
 *   A  (button 0)   → Space (jump)
 *   B  (button 1)   → reserved (cancel/back)
 *   X  (button 2)   → E / F (interact)
 *   Y  (button 3)   → H (toggle UI / marketplace)
 *   LB (button 4)   → Q (descend)
 *   RB (button 5)   → C (alt descent)
 *   Select (8)      → V (environment toggle)
 *   Start  (9)      → G (debug UI toggle)
 *   D-pad Up (12)   → M (toggle parcel map)
 *   D-pad (13-15)   → reserved (UI navigation)
 */

const DEADZONE = 0.15;
const TRIGGER_AS_SPRINT_THRESHOLD = 0.5;
const KEYS_TO_RESET = ['w', 's', 'a', 'd', 'q', 'c', 'shift', 'space', 'interact', 'e', 'f', 'h', 't', 'v', 'g', 'm'];
const AXES_TO_RESET = ['moveX', 'moveY', 'lookX', 'lookY', 'leftTrigger', 'rightTrigger'];

/** @param {number} v */
const applyDeadzone = (v) => Math.abs(v) < DEADZONE ? 0 : v;

/**
 * @param {object} inputManager — the createInputManager() instance.
 *   Must expose setKey, setAxis, triggerJustPressed.
 * @returns {{update: () => void, getStatus: () => object, destroy: () => void}}
 */
export const createGamepadManager = (inputManager) => {
  let connectedIndex = -1;
  let connectedId = null;
  const prevButtons = new Array(20).fill(false);

  const _resetVirtualState = () => {
    AXES_TO_RESET.forEach(a => inputManager.setAxis(a, 0));
    KEYS_TO_RESET.forEach(k => inputManager.setKey(k, false));
  };

  const _onConnect = (e) => {
    if (connectedIndex === -1) {
      connectedIndex = e.gamepad.index;
      connectedId = e.gamepad.id;
      console.log(`[Gamepad] Connected (slot ${connectedIndex}): ${connectedId}`);
    }
  };

  const _onDisconnect = (e) => {
    if (e.gamepad.index === connectedIndex) {
      console.log(`[Gamepad] Disconnected: ${connectedId}`);
      connectedIndex = -1;
      connectedId = null;
      prevButtons.fill(false);
      _resetVirtualState();
    }
  };

  window.addEventListener('gamepadconnected', _onConnect);
  window.addEventListener('gamepaddisconnected', _onDisconnect);

  /**
   * Polls the active gamepad and writes its state into the InputManager.
   * Call once per frame, BEFORE inputManager.update().
   */
  const update = () => {
    if (connectedIndex === -1) return;

    const pads = navigator.getGamepads();
    const pad = pads[connectedIndex];
    if (!pad || !pad.connected) return;

    // === Sticks → analog axes + virtual WASD for legacy consumers ===
    const lx = applyDeadzone(pad.axes[0] ?? 0);
    const ly = applyDeadzone(pad.axes[1] ?? 0);
    const rx = applyDeadzone(pad.axes[2] ?? 0);
    const ry = applyDeadzone(pad.axes[3] ?? 0);

    inputManager.setAxis('moveX', lx);
    inputManager.setAxis('moveY', ly);
    inputManager.setAxis('lookX', rx);
    inputManager.setAxis('lookY', ry);

    // Stick → WASD (gamepad-up is negative-Y in W3C convention)
    inputManager.setKey('a', lx < -DEADZONE);
    inputManager.setKey('d', lx > DEADZONE);
    inputManager.setKey('w', ly < -DEADZONE);
    inputManager.setKey('s', ly > DEADZONE);

    // === Triggers (analog) ===
    const lt = pad.buttons[6]?.value ?? 0;
    const rt = pad.buttons[7]?.value ?? 0;
    inputManager.setAxis('leftTrigger', lt);
    inputManager.setAxis('rightTrigger', rt);

    // RT also acts as sprint/boost in legacy boolean form
    inputManager.setKey('shift', rt > TRIGGER_AS_SPRINT_THRESHOLD);

    // === Buttons → virtual keys + edge detection ===
    const _edge = (idx) => {
      const now = pad.buttons[idx]?.pressed ?? false;
      const wasPressed = !prevButtons[idx] && now;
      prevButtons[idx] = now;
      return { now, wasPressed };
    };

    // A → Space (jump)
    const a = _edge(0);
    inputManager.setKey('space', a.now);
    if (a.wasPressed) inputManager.triggerJustPressed('space');

    // X → interact (E/F)
    const x = _edge(2);
    inputManager.setKey('interact', x.now);
    inputManager.setKey('e', x.now);
    inputManager.setKey('f', x.now);
    if (x.wasPressed) inputManager.triggerJustPressed('interact');

    // Y → H (toggle UI / marketplace)
    const y = _edge(3);
    inputManager.setKey('h', y.now);
    if (y.wasPressed) inputManager.triggerJustPressed('h');

    // LB → Q (descend)
    inputManager.setKey('q', _edge(4).now);
    // RB → C (alt descent)
    inputManager.setKey('c', _edge(5).now);

    // Select → V (environment)
    const sel = _edge(8);
    inputManager.setKey('v', sel.now);
    if (sel.wasPressed) inputManager.triggerJustPressed('v');

    // Start → G (debug)
    const start = _edge(9);
    inputManager.setKey('g', start.now);
    if (start.wasPressed) inputManager.triggerJustPressed('g');

    // D-pad Up → M (toggle parcel map)
    const dpadUp = _edge(12);
    inputManager.setKey('m', dpadUp.now);
    if (dpadUp.wasPressed) inputManager.triggerJustPressed('m');

    // B (cancel) and D-pad (13-15) intentionally left for future UI nav.
  };

  /** @returns {{connected: boolean, index: number, id: string|null}} */
  const getStatus = () => ({
    connected: connectedIndex !== -1,
    index: connectedIndex,
    id: connectedId
  });

  const destroy = () => {
    window.removeEventListener('gamepadconnected', _onConnect);
    window.removeEventListener('gamepaddisconnected', _onDisconnect);
    _resetVirtualState();
  };

  return { update, getStatus, destroy };
};
