// input.js — keyboard + mouse state. Pointer lock on click, drag fallback.
// One-shot keys are delivered through onKey so the game loop stays frame-clean.

export class Input {
  constructor(canvas) {
    this.keys = {};
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.clicked = false;       // left mouse click this frame (shoot)
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.onKey = null;          // callback(code) for one-shot keys
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.onKey) this.onKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.clicked = true;
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      if (document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch (err) {}
      }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.dragging = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.yawDelta -= e.movementX * 0.0032;
        this.pitchDelta -= e.movementY * 0.0028;
      } else if (this.dragging) {
        this.yawDelta -= (e.clientX - this.lastX) * 0.006;
        this.pitchDelta -= (e.clientY - this.lastY) * 0.005;
        this.lastX = e.clientX; this.lastY = e.clientY;
      }
    });
    window.addEventListener('blur', () => { this.keys = {}; this.dragging = false; });
  }
  down(code) { return !!this.keys[code]; }
  axis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
  consumeLook() {
    const d = { yaw: this.yawDelta, pitch: this.pitchDelta };
    this.yawDelta = 0; this.pitchDelta = 0;
    return d;
  }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
}
