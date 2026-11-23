// SOLMAR BAY — the heads-up display and the minimap.
// One job: keep the DOM readouts (health, stars, cash, objective,
// speed) and the top-down minimap canvas in step with the game state.
// It never decides game logic; it only shows it.

import { CFG } from './config.js';
import { STREET_LINES } from './world.js';

const MAP_HALF = 200; // world units the minimap covers on each side

function starString(stars) {
  let out = '';
  for (let i = 0; i < CFG.wanted.maxStars; i++) out += i < stars ? '★' : '☆';
  return out;
}

export function createHud(doc) {
  const healthFill = doc.getElementById('health-fill');
  const healthText = doc.getElementById('health-text');
  const starsEl = doc.getElementById('stars');
  const cashEl = doc.getElementById('cash');
  const objectiveEl = doc.getElementById('objective');
  const objectiveLabel = doc.getElementById('objective-label');
  const speedEl = doc.getElementById('speed');
  const speedValue = doc.getElementById('speed-value');
  const bannerEl = doc.getElementById('banner');
  const bannerTitle = doc.getElementById('banner-title');
  const bannerText = doc.getElementById('banner-text');
  const damageEl = doc.getElementById('damage-flash');
  const mapCanvas = doc.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  let bannerTimer = null;
  let flashTimer = null;

  function toMap(x, z) {
    const s = mapCanvas.width / (MAP_HALF * 2);
    return { x: (x + MAP_HALF) * s, y: (z + MAP_HALF) * s };
  }

  return {
    setHealth(health, max) {
      const pct = Math.max(0, Math.round((health / max) * 100));
      healthFill.style.width = `${pct}%`;
      healthFill.style.background = pct > 50 ? '#37c978' : pct > 25 ? '#f0a832' : '#e5484d';
      healthText.textContent = `${pct}`;
    },
    setStars(stars) {
      starsEl.textContent = starString(stars);
      starsEl.classList.toggle('hot', stars >= 3);
    },
    setCash(cash) {
      cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
    },
    setObjective(text, label) {
      objectiveEl.textContent = text;
      if (label) objectiveLabel.textContent = label;
    },
    setSpeed(kmh, driving) {
      speedEl.style.display = driving ? 'block' : 'none';
      if (driving) speedValue.textContent = `${Math.round(kmh)}`;
    },
    showBanner(title, text, seconds = 5) {
      bannerTitle.textContent = title;
      bannerText.textContent = text;
      bannerEl.classList.add('show');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), seconds * 1000);
    },
    hideBanner() {
      bannerEl.classList.remove('show');
    },
    flashDamage() {
      damageEl.classList.add('show');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => damageEl.classList.remove('show'), 180);
    },

    // Top-down map: sea and sand on the east edge, the street grid,
    // then the player arrow, traffic, police and the mission marker.
    drawMinimap(state, elapsed) {
      const w = mapCanvas.width;
      const ctx = mapCtx;
      ctx.clearRect(0, 0, w, w);
      ctx.fillStyle = '#20262e';
      ctx.fillRect(0, 0, w, w);
      // Sand and sea.
      const sand = toMap(CFG.city.beachStartX, 0);
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(sand.x, 0, toMap(CFG.city.seaStartX, 0).x - sand.x, w);
      ctx.fillStyle = '#2e7fa8';
      ctx.fillRect(toMap(CFG.city.seaStartX, 0).x, 0, w, w);
      // Roads.
      ctx.strokeStyle = '#4a5058';
      ctx.lineWidth = 5;
      for (const line of STREET_LINES) {
        const a = toMap(line, -MAP_HALF);
        const b = toMap(line, MAP_HALF);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.y, a.x); ctx.lineTo(b.y, b.x); ctx.stroke();
      }
      const dot = (x, z, color, r) => {
        const p = toMap(x, z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      };
      for (const car of state.cars) dot(car.x, car.z, '#ffd23c', 2.5);
      for (const ped of state.pedestrians || []) dot(ped.x, ped.z, '#9fb4c8', 1.6);
      for (const cop of state.police) {
        dot(cop.x, cop.z, Math.floor(elapsed * 4) % 2 === 0 ? '#ff4444' : '#4488ff', 3.5);
      }
      if (state.marker) {
        const p = toMap(state.marker.x, state.marker.z);
        const pulse = 5 + Math.sin(elapsed * 4) * 2;
        ctx.strokeStyle = '#ffc93c';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffc93c';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Player arrow, pointing along the heading.
      const pp = toMap(state.player.x, state.player.z);
      ctx.save();
      ctx.translate(pp.x, pp.y);
      // Map x is world x and map y is world z, so a heading whose forward
      // is (sin h, cos h) needs a canvas rotation of PI - h.
      ctx.rotate(Math.PI - state.player.heading);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
