// The HUD: health, wanted stars, cash, the current objective, speed, and
// a live minimap drawn on a small canvas. All DOM, laid over the 3D view,
// so it stays crisp at any window size and reads well in a screenshot.

import { CITY } from './config.js';

export function createHud() {
  const hud = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const cashText = document.getElementById('cash');
  const starsEl = document.getElementById('stars');
  const objectiveEl = document.getElementById('objective');
  const objectiveTitle = document.getElementById('objective-title');
  const speedEl = document.getElementById('speed');
  const toastEl = document.getElementById('toast');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  let toastTimer = 0;

  function show() {
    hud.style.display = 'block';
  }
  function hide() {
    hud.style.display = 'none';
  }

  // A briefing line in the middle of the screen, fading after a while.
  function toast(message, seconds = 6) {
    toastEl.textContent = message;
    toastEl.style.opacity = '1';
    toastTimer = seconds;
  }

  function setObjective(title, text) {
    objectiveTitle.textContent = title;
    objectiveEl.textContent = text;
  }

  function setStars(count) {
    let text = '';
    for (let i = 0; i < 5; i += 1) text += i < count ? '★' : '☆';
    starsEl.textContent = text;
    starsEl.style.color = count > 0 ? '#ffd23e' : '#888888';
  }

  function setHealth(value) {
    const pct = Math.max(0, Math.min(100, value));
    healthFill.style.width = `${pct}%`;
    healthFill.style.background = pct > 50 ? '#4caf50' : pct > 25 ? '#ff9800' : '#f44336';
    healthText.textContent = `${Math.round(pct)}`;
  }

  function setCash(value) {
    cashText.textContent = `$${value.toLocaleString('en-US')}`;
  }

  function setSpeed(kmh, driving) {
    speedEl.style.display = driving ? 'block' : 'none';
    if (driving) speedEl.textContent = `${Math.round(kmh)} km/h`;
  }

  function tickToast(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.style.opacity = '0';
    }
  }

  // The minimap: the street grid, the sea, the player arrow, traffic,
  // police and the mission marker, all in a 180-pixel square.
  function drawMinimap(state) {
    const size = minimap.width;
    const scale = size / (CITY.half * 2 + 90);
    const toMap = (x, z) => [
      (x + CITY.half + 45) * scale,
      (z + CITY.half + 45) * scale,
    ];
    mapCtx.fillStyle = 'rgba(12, 20, 28, 0.88)';
    mapCtx.fillRect(0, 0, size, size);
    // The sea on the west edge.
    const [seaX] = toMap(CITY.sandWest, 0);
    mapCtx.fillStyle = '#2e8fa8';
    mapCtx.fillRect(0, 0, seaX, size);
    mapCtx.fillStyle = '#e8d5a8';
    mapCtx.fillRect(seaX, 0, toMap(CITY.sandEast, 0)[0] - seaX, size);
    // Streets.
    mapCtx.strokeStyle = '#5a636e';
    mapCtx.lineWidth = 3;
    for (const c of CITY.streets) {
      const [x1, y1] = toMap(c, -CITY.half);
      const [x2, y2] = toMap(c, CITY.half);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x2, y2);
      mapCtx.stroke();
      const [hx1, hy1] = toMap(-CITY.half, c);
      const [hx2, hy2] = toMap(CITY.half, c);
      mapCtx.beginPath();
      mapCtx.moveTo(hx1, hy1);
      mapCtx.lineTo(hx2, hy2);
      mapCtx.stroke();
    }
    // Mission marker: a pulsing yellow diamond.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 4 + Math.sin(state.time * 5) * 1.5;
      mapCtx.fillStyle = '#ffd23e';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - pulse - 2);
      mapCtx.lineTo(mx + pulse, my);
      mapCtx.lineTo(mx, my + pulse + 2);
      mapCtx.lineTo(mx - pulse, my);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // Traffic as pale dots, police as red dots.
    for (const car of state.traffic) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      mapCtx.fillStyle = '#d8d2c0';
      mapCtx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    for (const car of state.police) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      mapCtx.fillStyle = '#ff4444';
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // The player: a white arrow pointing where they face.
    const [px, py] = toMap(state.playerX, state.playerZ);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.PI - state.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 5);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  return {
    show,
    hide,
    toast,
    setObjective,
    setStars,
    setHealth,
    setCash,
    setSpeed,
    tickToast,
    drawMinimap,
  };
}
