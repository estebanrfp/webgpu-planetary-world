/**
 * createInputManager
 * Handles keyboard input state for the application.
 * @returns {Object} InputManager instance
 */
export const createInputManager = () => {
  const keys = {
    w: false, s: false, a: false, d: false, 
    q: false, e: false, c: false,
    shift: false,
    space: false,
    f: false, // Additional interaction key
    interact: false,
    h: false, // Toggle UI
    t: false, // Toggle Terrain
    v: false, // Toggle Environment
    g: false, // Toggle Debug UI
    m: false, // Toggle parcel map
    n: false, // Toggle NPC panel
    r: false, // Force rain on/off (test override)
    x: false  // Sit emote toggle
  };

  // Tracks if a key was JUST pressed this frame
  const justPressed = {
    interact: false,
    space: false,
    h: false,
    t: false,
    v: false,
    g: false,
    m: false,
    n: false,
    r: false,
    x: false
  };

  // Analog inputs from gamepad or future virtual joysticks.
  // Consumers can read these for smooth movement; legacy code keeps
  // using the boolean `keys` (gamepad mirrors stick → WASD).
  const axes = {
    moveX: 0,         // -1..1, left stick X
    moveY: 0,         // -1..1, left stick Y (negative = forward)
    lookX: 0,         // -1..1, right stick X
    lookY: 0,         // -1..1, right stick Y
    leftTrigger: 0,   // 0..1, LT analog
    rightTrigger: 0   // 0..1, RT analog
  };

  // Virtual key state written by controllers (gamepad),
  // kept SEPARATE from `keys` so a connected-but-idle controller cannot
  // overwrite the keyboard every frame. getKeys() returns the OR-merge.
  const padKeys = {
    w: false, s: false, a: false, d: false,
    q: false, e: false, c: false,
    shift: false,
    space: false,
    f: false,
    interact: false,
    h: false, t: false, v: false, g: false, m: false, n: false, r: false
  };

  const _onKeyDown = (event) => {
    // Ignore input if user is typing in a text field or using modifier keys (shortcuts)
    const isTyping = event.target.tagName === 'INPUT' || 
                     event.target.tagName === 'TEXTAREA' || 
                     event.target.isContentEditable;
    
    // Allow modifier keys for browser shortcuts (e.g., Cmd+V, Ctrl+R)
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

    if (isTyping) return;
    
    const key = event.key.toLowerCase();
    
    // Movement and interaction keys (allow even if modifier is pressed?)
    // Usually we want these ONLY if no modifier, except maybe Shift
    if (hasModifier) return;

    // Ship movement
    if (key === 'w') { keys.w = true; }
    else if (key === 's') { keys.s = true; }
    else if (key === 'a') { keys.a = true; }
    else if (key === 'd') { keys.d = true; }
    else if (key === 'q') { keys.q = true; }
    else if (key === 'c') { keys.c = true; } // New descent key
    else if (key === 'e' || key === 'f') { 
      if (!keys.interact) justPressed.interact = true;
      keys.e = true; 
      keys.f = true;
      keys.interact = true; 
    }
    else if (event.key === 'Shift') { keys.shift = true; }
    else if (event.key === ' ') { 
      if (!keys.space) justPressed.space = true;
      keys.space = true; 
    }
    else if (key === 'h') {
        if (!keys.h) justPressed.h = true;
        keys.h = true;
    }
    else if (key === 't') {
        if (!keys.t) justPressed.t = true;
        keys.t = true;
    }
    else if (key === 'v') {
        if (!keys.v) justPressed.v = true;
        keys.v = true;
    }
    else if (key === 'g') {
        if (!keys.g) justPressed.g = true;
        keys.g = true;
    }
    else if (key === 'm') {
        if (!keys.m) justPressed.m = true;
        keys.m = true;
    }
    else if (key === 'n') {
        if (!keys.n) justPressed.n = true;
        keys.n = true;
    }
    else if (key === 'r') {
        if (!keys.r) justPressed.r = true;
        keys.r = true;
    }
    else if (key === 'ñ') {
        if (!keys['ñ']) justPressed['ñ'] = true;
        keys['ñ'] = true;
    }
    else if (key === 'x') {
        if (!keys.x) justPressed.x = true;
        keys.x = true;
    }
    else if (key === '1') {            // emote: greeting wave
        if (!keys['1']) justPressed['1'] = true;
        keys['1'] = true;
    }
    else if (key === '2') {            // emote: dance
        if (!keys['2']) justPressed['2'] = true;
        keys['2'] = true;
    }

    // Prevent default scrolling for movement keys if we handled them
    if (['w','s','a','d','q','e','c','f',' ','h','t','v','g','m','n','r','ñ','x'].includes(key) || event.key === 'Shift') {
      event.preventDefault();
    }
  };

  const _onKeyUp = (event) => {
    const isTyping = event.target.tagName === 'INPUT' || 
                     event.target.tagName === 'TEXTAREA' || 
                     event.target.isContentEditable;
    
    const key = event.key.toLowerCase();
    
    // Always clear keys even if typing or has modifier, to prevent stuck keys
    // when user clicks away or releases shortcut keys.
    if (key === 'w') { keys.w = false; }
    else if (key === 's') { keys.s = false; }
    else if (key === 'a') { keys.a = false; }
    else if (key === 'd') { keys.d = false; }
    else if (key === 'q') { keys.q = false; }
    else if (key === 'c') { keys.c = false; }
    else if (key === 'e' || key === 'f') { 
      keys.e = false; 
      keys.f = false;
      keys.interact = false; 
      justPressed.interact = false;
    }
    else if (event.key === 'Shift') { keys.shift = false; }
    else if (event.key === ' ') { 
      keys.space = false; 
      justPressed.space = false;
    }
    else if (key === 'h') {
        keys.h = false;
        justPressed.h = false;
    }
    else if (key === 't') {
        keys.t = false;
        justPressed.t = false;
    }
    else if (key === 'v') {
        keys.v = false;
        justPressed.v = false;
    }
    else if (key === 'g') {
        keys.g = false;
        justPressed.g = false;
    }
    else if (key === 'm') {
        keys.m = false;
        justPressed.m = false;
    }
    else if (key === 'n') {
        keys.n = false;
        justPressed.n = false;
    }
    else if (key === 'r') {
        keys.r = false;
        justPressed.r = false;
    }
    else if (key === 'ñ') {
        keys['ñ'] = false;
        justPressed['ñ'] = false;
    }
    else if (key === 'x') {
        keys.x = false;
        justPressed.x = false;
    }
    else if (key === '1') {
        keys['1'] = false;
        justPressed['1'] = false;
    }
    else if (key === '2') {
        keys['2'] = false;
        justPressed['2'] = false;
    }
  };

  // Initialize event listeners
  window.addEventListener('keydown', _onKeyDown);
  window.addEventListener('keyup', _onKeyUp);

  /**
   * Clears "just pressed" flags. Should be called at the end of the frame.
   */
  const update = () => {
    justPressed.interact = false;
    justPressed.space = false;
    justPressed.h = false;
    justPressed.t = false;
    justPressed.v = false;
    justPressed.g = false;
    justPressed.m = false;
    justPressed.n = false;
    justPressed.r = false;
    justPressed.x = false;
    justPressed['1'] = false;
    justPressed['2'] = false;
  };

  /**
   * Returns the current state of all tracked keys.
   * Keyboard state (`keys`) and controller state (`padKeys`) are OR-merged,
   * so the two input sources are additive and never overwrite each other.
   */
  const getKeys = () => {
    const merged = {};
    for (const name in keys) merged[name] = keys[name] || padKeys[name];
    return {
      ...merged,
      interactTriggered: justPressed.interact,
      jump: justPressed.space,
      hTriggered: justPressed.h,
      tTriggered: justPressed.t,
      vTriggered: justPressed.v,
      gTriggered: justPressed.g,
      mTriggered: justPressed.m,
      nTriggered: justPressed.n,
      rTriggered: justPressed.r,
      xTriggered: justPressed.x,
      greetTriggered: justPressed['1'],   // emote: wave
      danceTriggered: justPressed['2']     // emote: dance
    };
  };

  /**
   * Returns keys that were JUST pressed this frame
   */
  const getJustPressed = () => justPressed;

  /**
   * Returns analog axes state. Consumers can prefer axes over boolean keys
   * for smooth, pressure-sensitive movement (gamepad sticks/triggers).
   * @returns {{moveX:number, moveY:number, lookX:number, lookY:number, leftTrigger:number, rightTrigger:number}}
   */
  const getAxes = () => ({ ...axes });

  /**
   * Virtual key setter used by alternate input sources (gamepad).
   * Writes to `padKeys`, never to the keyboard's `keys`, so an idle controller
   * cannot clear keys the keyboard is holding. Unknown keys are ignored.
   * @param {string} name
   * @param {boolean} value
   */
  const setKey = (name, value) => {
    if (name in padKeys) padKeys[name] = !!value;
  };

  /**
   * Triggers a "just pressed" edge for one-shot actions (jump, interact, toggles).
   * Cleared automatically at end of frame by update().
   * @param {string} name
   */
  const triggerJustPressed = (name) => {
    if (name in justPressed) justPressed[name] = true;
  };

  /**
   * Virtual axis setter used by alternate input sources.
   * @param {string} name
   * @param {number} value
   */
  const setAxis = (name, value) => {
    if (name in axes) axes[name] = value;
  };

  /**
   * Removes event listeners
   */
  const destroy = () => {
    window.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('keyup', _onKeyUp);
  };

  return {
    update,
    getKeys,
    getAxes,
    getJustPressed,
    setKey,
    setAxis,
    triggerJustPressed,
    destroy
  };
};
