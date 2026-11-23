
// Keyboard and mouse input: one object that reads the keys every frame and
// hands out edge-triggered actions (pressed once, not held) for menus and
// one-off moves like entering a car or throwing a punch.

import { KEYS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

const ACTION_KEYS = [
  [ACTION_CONFIRM, KEYS.confirm],
  [ACTION_PAUSE, KEYS.pause],
  [ACTION_ENTER, KEYS.enterCar],
  [ACTION_PUNCH, KEYS.punch],
  [ACTION_MUTE, KEYS.mute],
];

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let dragX = 0;
  let dragging = false;
  let lastX = 0;

  function onDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onUp(event) {
    held.delete(event.code);
  }
  function onBlur() {
    held.clear();
  }
  function onPointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    pressed.add('PointerDown');
  }
  function onPointerMove(event) {
    if (!dragging) return;
    dragX += event.clientX - lastX;
    lastX = event.clientX;
  }
  function onPointerUp() {
    dragging = false;
  }

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  function isHeld(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    // Steering: -1 left, +1 right. Throttle: -1 brake/reverse, +1 forward.
    steering() {
      let value = 0;
      if (isHeld(KEYS.left)) value -= 1;
      if (isHeld(KEYS.right)) value += 1;
      return value;
    },
    throttle() {
      let value = 0;
      if (isHeld(KEYS.forward)) value += 1;
      if (isHeld(KEYS.back)) value -= 1;
      return value;
    },
    running() {
      return isHeld(KEYS.run);
    },
    handbrake() {
      return isHeld(KEYS.handbrake);
    },
    // Mouse drag since the last read, in pixels; the camera turns by it.
    takeDrag() {
      const value = dragX;
      dragX = 0;
      return value;
    },
    // Edge-triggered actions since the last read; reading clears them.
    takeActions() {
      let actions = 0;
      for (const [flag, codes] of ACTION_KEYS) {
        for (const code of codes) {
          if (pressed.has(code)) {
            actions |= flag;
            break;
          }
        }
      }
      pressed.clear();
      return actions;
    },
    // A click or tap anywhere counts as confirm (used by the title screen).
    clickConfirm() {
      return pressed.has('PointerDown');
    },
  };
}
