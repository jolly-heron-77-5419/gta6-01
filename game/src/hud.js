// hud.js — HUD: health, money, wanted stars, clock, mission text, toasts,
// speedometer and the live minimap (roads, player, cars, police, objective).
// The minimap is a 2D canvas redrawn every frame from live game state.

import { WORLD, roadLineAt } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      money: document.getElementById('money'),
      wanted: document.getElementById('wanted'),
      clock: document.getElementById('clock'),
      healthfill: document.getElementById('healthfill'),
      healthlabel: document.getElementById('healthlabel'),
      objTitle: document.getElementById('objTitle'),
      objText: document.getElementById('objText'),
      toast: document.getElementById('toast'),
      speedo: document.getElementById('speedo'),
      carname: document.getElementById('carname'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('hint'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = null;
    this.clockMin = 10 * 60 + 24;
    this.day = 1;
  }
  show() { this.el.hud.classList.remove('hidden'); }
  hide() {
    this.el.hud.classList.add('hidden');
    clearTimeout(this.toastTimer); // don't leave a stale toast for next time
    this.el.toast.textContent = '';
  }

  toast(msg, ms = 2600) {
    this.el.toast.textContent = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.textContent = ''; }, ms);
  }

  update(dt, s) {
    // s: {money, health, wanted, inCar, carName, speedMph, mission, playerPos, heading, cars, police, peds, objective}
    this.el.money.textContent = '$ ' + s.money.toLocaleString('en-US');
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="star${i < s.wanted ? ' on' : ''}">★</span>`;
    this.el.wanted.innerHTML = stars;
    this.el.healthfill.style.width = Math.max(0, s.health) + '%';
    this.el.healthfill.style.background = s.health > 50
      ? 'linear-gradient(90deg,#37d67a,#a5f3c0)'
      : s.health > 25 ? 'linear-gradient(90deg,#f2a007,#ffd23e)' : 'linear-gradient(90deg,#d93a3a,#ff7a7a)';
    this.el.healthlabel.textContent = `DANNY REYES · HEALTH ${Math.max(0, Math.round(s.health))}`;
    this.clockMin += dt * 2.2; // game clock runs faster than real time
    if (this.clockMin >= 24 * 60) { this.clockMin -= 24 * 60; this.day++; }
    const hh = String(Math.floor(this.clockMin / 60)).padStart(2, '0');
    const mm = String(Math.floor(this.clockMin % 60)).padStart(2, '0');
    this.el.clock.textContent = `DAY ${this.day} · ${hh}:${mm}`;
    this.el.objTitle.textContent = s.mission.title;
    this.el.objText.textContent = s.mission.text;
    if (s.inCar) {
      this.el.speedo.classList.remove('hidden');
      this.el.speedo.querySelector('b').textContent = Math.round(Math.abs(s.speedMph));
      this.el.carname.textContent = s.carName;
    } else {
      this.el.speedo.classList.add('hidden');
    }
    this.el.crosshair.classList.toggle('hidden', s.inCar);
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const g = this.mapCtx;
    if (!g) return; // canvas 2D context unavailable — HUD still works
    const W = this.map.width, H = this.map.height;
    const half = WORLD.halfSize;
    const px = (x) => ((x + half) / (half * 2)) * W;
    const pz = (z) => ((z + half) / (half * 2)) * H;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0e2438'; g.fillRect(0, 0, W, H);
    // beach + ocean strip at the bottom (south)
    g.fillStyle = '#e8d8a8'; g.fillRect(0, H - 14, W, 8);
    g.fillStyle = '#1e7fb8'; g.fillRect(0, H - 6, W, 6);
    // roads — centrelines come from the same constants as the 3D city,
    // so the minimap can never drift out of sync with the world grid
    g.strokeStyle = '#5a636e'; g.lineWidth = 4;
    const lines = [];
    for (let i = 0; i <= WORLD.blockCount; i++) lines.push(roadLineAt(i));
    for (const c of lines) {
      g.beginPath(); g.moveTo(px(c), 0); g.lineTo(px(c), H); g.stroke();
      g.beginPath(); g.moveTo(0, pz(c)); g.lineTo(W, pz(c)); g.stroke();
    }
    // blocks
    const n = WORLD.blockCount, pitch = WORLD.blockSize;
    const origin = -((n - 1) * pitch) / 2;
    const inner = WORLD.blockInner / (half * 2);
    g.fillStyle = '#2c3a48';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillRect(px(origin + i * pitch - WORLD.blockInner / 2), pz(origin + j * pitch - WORLD.blockInner / 2), inner * W, inner * H);
    }
    // objective marker
    if (s.objectivePos) {
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(px(s.objectivePos[0]), pz(s.objectivePos[1]), 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    // traffic cars
    g.fillStyle = '#9fb4c8';
    for (const c of s.cars) { g.fillRect(px(c.pos.x) - 2, pz(c.pos.z) - 2, 4, 4); }
    // police
    g.fillStyle = '#ff4444';
    for (const c of s.police) { g.fillRect(px(c.pos.x) - 3, pz(c.pos.z) - 3, 6, 6); }
    // player arrow — drawn pointing up (-z, north) at rest. A heading h
    // means forward (sin h, cos h) in world (x, z); on the map x runs right
    // and z runs down, so the arrow must rotate by PI - h.
    const x = px(s.playerPos.x), y = pz(s.playerPos.z);
    g.save();
    g.translate(x, y); g.rotate(Math.PI - s.heading);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    // north label
    g.fillStyle = '#fff'; g.font = 'bold 11px Arial'; g.fillText('N', 6, 13);
  }
}
