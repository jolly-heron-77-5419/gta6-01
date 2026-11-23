// SOLMAR BAY — keyboard and mouse input.
// One job: turn raw key and pointer events into a small, stable state
// the game loop reads every frame. Edge-triggered actions (press E, press
// F) are consumed once per press so holding a key never double-fires.

export function createInput() {
  const down = new Set();
  const pressed = new Set();
  let cameraYaw = 0;      // mouse-drag orbit offset, radians
  let cameraPitch = 0.32; // mouse-drag height offset, clamped below
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function keyName(event) {
    const k = event.key;
    if (k === ' ') return 'Space';
    return k.length === 1 ? k.toLowerCase() : k;
  }

  function onKeyDown(event) {
    const k = keyName(event);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(k);
    down.add(k);
  }

  function onKeyUp(event) {
    down.delete(keyName(event));
  }

  function onPointerDown(event) {
    if (event.target && event.target.closest && event.target.closest('button')) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onPointerMove(event) {
    if (!dragging) return;
    cameraYaw -= (event.clientX - lastX) * 0.005;
    cameraPitch += (event.clientY - lastY) * 0.003;
    cameraPitch = Math.max(0.08, Math.min(1.1, cameraPitch));
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onPointerUp() {
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  return {
    // Held-state helpers the loop calls each frame.
    isDown(name) {
      return down.has(name);
    },
    // Virtual keys, for on-screen buttons wired by bindTouchButtons.
    holdKey(name) {
      down.add(name);
    },
    releaseKey(name) {
      down.delete(name);
    },
    tapKey(name) {
      pressed.add(name);
      down.add(name);
      setTimeout(() => down.delete(name), 120);
    },
    // True once, on the frame after the key went down.
    wasPressed(name) {
      return pressed.has(name);
    },
    // -1..1 steering and throttle axes, from WASD or arrows.
    steerAxis() {
      let s = 0;
      if (down.has('a') || down.has('ArrowLeft')) s -= 1;
      if (down.has('d') || down.has('ArrowRight')) s += 1;
      return s;
    },
    moveAxis() {
      let m = 0;
      if (down.has('w') || down.has('ArrowUp')) m += 1;
      if (down.has('s') || down.has('ArrowDown')) m -= 1;
      return m;
    },
    running() {
      return down.has('Shift');
    },
    cameraYaw() {
      return cameraYaw;
    },
    cameraPitch() {
      return cameraPitch;
    },
    // Called at the end of every frame: clears the one-shot presses.
    endFrame() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}

// Second pass on input: touch-friendly on-screen buttons are wired here
// too, so a mouse-only player can drive with the same actions. Each
// button simply holds or taps the matching virtual key.

export function bindTouchButtons(input, root) {
  // `input` exposes the same key sets the keyboard path fills; buttons
  // press and release them through the documented helpers below.
  const holds = root.querySelectorAll('[data-hold]');
  holds.forEach((button) => {
    const key = button.getAttribute('data-hold');
    button.addEventListener('pointerdown', (e) => { e.preventDefault(); input.holdKey(key); });
    button.addEventListener('pointerup', () => input.releaseKey(key));
    button.addEventListener('pointerleave', () => input.releaseKey(key));
  });
  const taps = root.querySelectorAll('[data-tap]');
  taps.forEach((button) => {
    const key = button.getAttribute('data-tap');
    button.addEventListener('click', () => input.tapKey(key));
  });
}
