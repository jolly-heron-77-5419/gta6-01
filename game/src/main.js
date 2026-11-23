// SOLMAR BAY — the main loop and the glue.
// One job: boot the renderer, own the game state (menu, playing, paused,
// failed), step the player, the wanted level and the police, and drive
// the camera, the particles and the HUD. The city, the entities, the
// story and the sound each live in their own file.

import * as THREE from 'three';
import { CFG, clamp, lerp, makeRng, pick } from './config.js';
import { buildCity, isOnRoad, nearestRoadPoint, resolveCollisions } from './world.js';
import { createSound } from './audio.js';
import { createInput, bindTouchButtons } from './input.js';
import {
  createPlayer,
  createPedestrian,
  updatePedestrian,
  createTrafficCar,
  updateTrafficCar,
  createParkedCar,
  createPoliceCar,
  updatePoliceCar,
  drivePlayerCar,
} from './entities.js';
import { createMissions, MISSION_SPOTS } from './missions.js';
import { createHud } from './hud.js';

const canvas = document.getElementById('game');
const fatalBox = document.getElementById('fatal');
window.addEventListener('error', (event) => {
  fatalBox.textContent = `Error: ${event.message}`;
  fatalBox.style.display = 'block';
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(30, 26, 60);

const city = buildCity(scene);
const sound = createSound();
const input = createInput();
const hud = createHud(document);
bindTouchButtons(input, document);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- saved progress -------------------------------------------------------
function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return { cash: 0, stage: 0, bestWanted: 0 };
    const data = JSON.parse(raw);
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      stage: typeof data.stage === 'number' ? data.stage : 0,
      bestWanted: typeof data.bestWanted === 'number' ? data.bestWanted : 0,
    };
  } catch {
    return { cash: 0, stage: 0, bestWanted: 0 };
  }
}

function writeSave() {
  try {
    localStorage.setItem(CFG.saveKey, JSON.stringify({
      cash: state.cash,
      stage: missions.stage,
      bestWanted: state.bestWanted,
    }));
  } catch { /* private mode: progress just lives for the session */ }
}

// ---- game state -----------------------------------------------------------
const saved = loadSave();
const state = {
  mode: 'menu', // menu | playing | paused | failed
  cash: saved.cash,
  wanted: 0,
  bestWanted: saved.bestWanted,
  hiddenTimer: 0,
  bustedTimer: 0,
  punchCooldown: 0,
  shakeTime: 0,
  shakeMag: 0,
  elapsed: 0,
  camYaw: 0,
  failReason: '',
  failTitle: '',
};

const rng = makeRng(20261123);
const player = createPlayer(scene, MISSION_SPOTS.LENA_CORNER.x, MISSION_SPOTS.LENA_CORNER.z);
const traffic = [];
for (let i = 0; i < CFG.traffic.count; i++) traffic.push(createTrafficCar(scene, rng));
const pedestrians = [];
for (let i = 0; i < CFG.pedestrians.count; i++) pedestrians.push(createPedestrian(scene, rng));
const downedPeds = new Map(); // ped -> seconds until they get back up

// Parked cars the player can steal, scattered along the streets.
const parked = [];
const parkedSpots = [
  { x: 6.5, z: -40, h: Math.PI / 2 }, { x: -6.5, z: 40, h: -Math.PI / 2 },
  { x: 40, z: 6.5, h: 0 }, { x: -40, z: -6.5, h: Math.PI },
  { x: 86.5, z: 80, h: Math.PI / 2 }, { x: -86.5, z: -80, h: -Math.PI / 2 },
  { x: 133, z: -52, h: Math.PI / 2 }, { x: 133, z: -68, h: Math.PI / 2 },
];
for (const spot of parkedSpots) {
  parked.push(createParkedCar(scene, spot.x, spot.z, spot.h, pick(rng, [0xc0392b, 0x2e6fb0, 0xe8e8e8, 0x2c2c34, 0x4a9e6a]), false));
}
// The mission car: an orange Comet GT at the marina lot.
const targetCar = createParkedCar(
  scene, MISSION_SPOTS.MARINA_CAR.x, MISSION_SPOTS.MARINA_CAR.z,
  MISSION_SPOTS.MARINA_CAR.heading, 0xe86a10, true
);
parked.push(targetCar);

const police = [];
let currentCar = null; // the car the player is driving, or null on foot

// Impact sparks: a small reusable pool of bright boxes.
const particles = [];
const particleMats = [0xffb020, 0xcccccc, 0xff5533].map(
  (c) => new THREE.MeshBasicMaterial({ color: c })
);
for (let i = 0; i < 48; i++) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), particleMats[i % 3]);
  mesh.visible = false;
  scene.add(mesh);
  particles.push({ mesh, vel: new THREE.Vector3(), life: 0 });
}

function spawnBurst(x, y, z, count, speed) {
  let made = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.life = 0.5 + Math.random() * 0.4;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed);
    if (++made >= count) break;
  }
}

function addShake(mag, seconds) {
  state.shakeMag = Math.max(state.shakeMag, mag);
  state.shakeTime = Math.max(state.shakeTime, seconds);
}

// ---- missions, overlays and menus ----------------------------------------
const missions = createMissions(scene, {
  addCash(amount) {
    state.cash += amount;
    hud.setCash(state.cash);
    writeSave();
  },
  banner(title, text) {
    hud.showBanner(title, text, 6);
  },
  setObjective(text, label) {
    hud.setObjective(text, label);
  },
  playSound(name) {
    if (name === 'success') sound.success();
    else if (name === 'pickup') sound.pickup();
    else if (name === 'thud') sound.thud();
  },
  onGuardHitPlayer(damage) {
    damagePlayer(damage);
  },
  onStoryDone() {
    state.bestWanted = Math.max(state.bestWanted, state.wanted);
    writeSave();
    hud.showBanner('Solmar Bay is yours', 'Lena paid in full. Free roam — keep the engine running.', 8);
  },
});
if (saved.stage > 0 && saved.stage < 6) missions.skipToStage(saved.stage);

const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const failScreen = document.getElementById('fail-screen');
const hudRoot = document.getElementById('hud');
const failTitleEl = document.getElementById('fail-title');
const failTextEl = document.getElementById('fail-text');
const saveNoteEl = document.getElementById('save-note');

function refreshSaveNote() {
  const jobsDone = Math.min(3, Math.floor(missions.stage / 2));
  saveNoteEl.textContent = saved.cash > 0 || jobsDone > 0
    ? `Welcome back — $${state.cash} in pocket, ${jobsDone} of 3 jobs done, best wanted ${'★'.repeat(state.bestWanted)}${'☆'.repeat(5 - state.bestWanted)}.`
    : 'New in town. Lena Cruz has work for you.';
}
refreshSaveNote();

function showOnly(screen) {
  for (const el of [startScreen, pauseScreen, failScreen]) el.classList.remove('show');
  if (screen) screen.classList.add('show');
  hudRoot.classList.toggle('hidden', screen !== null && screen !== pauseScreen);
}

function startGame() {
  sound.ensure();
  sound.click();
  state.mode = 'playing';
  showOnly(null);
  hud.setCash(state.cash);
  hud.setHealth(player.health, CFG.player.maxHealth);
  hud.setStars(state.wanted);
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  showOnly(pauseScreen);
  sound.engine(0, false);
  sound.siren(false);
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  showOnly(null);
  sound.click();
}

function failGame(title, text) {
  if (state.mode !== 'playing') return;
  state.mode = 'failed';
  state.failTitle = title;
  state.failReason = text;
  failTitleEl.textContent = title;
  failTextEl.textContent = text;
  showOnly(failScreen);
  sound.fail();
  sound.engine(0, false);
  sound.siren(false);
  state.bestWanted = Math.max(state.bestWanted, state.wanted);
  writeSave();
}

function respawn() {
  player.health = CFG.player.maxHealth;
  state.wanted = 0;
  state.hiddenTimer = 0;
  state.bustedTimer = 0;
  if (currentCar) {
    currentCar.damage = 0;
    currentCar = null;
  }
  for (const cop of police) scene.remove(cop.mesh);
  police.length = 0;
  player.pos.set(MISSION_SPOTS.LENA_CORNER.x, 0, MISSION_SPOTS.LENA_CORNER.z);
  player.heading = Math.PI;
  hud.setHealth(player.health, CFG.player.maxHealth);
  hud.setStars(0);
  state.mode = 'playing';
  showOnly(null);
  sound.click();
}

document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('resume-button').addEventListener('click', resumeGame);
document.getElementById('restart-button').addEventListener('click', () => {
  respawn();
  hud.showBanner('Fresh start', 'Back at Lena’s corner. The city is still yours to take.', 5);
});
document.getElementById('retry-button').addEventListener('click', respawn);
document.getElementById('menu-button').addEventListener('click', () => {
  respawn();
  state.mode = 'menu';
  showOnly(startScreen);
  refreshSaveNote();
});
document.getElementById('mute-button').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const muted = button.dataset.muted !== 'true';
  button.dataset.muted = String(muted);
  button.textContent = muted ? 'Sound: off' : 'Sound: on';
  sound.setMuted(muted);
});

// ---- wanted level, police and damage --------------------------------------
function addWanted(stars) {
  if (state.mode !== 'playing') return;
  state.wanted = clamp(state.wanted + stars, 0, CFG.wanted.maxStars);
  state.hiddenTimer = 0;
  hud.setStars(state.wanted);
}

function spawnPolice() {
  const spot = nearestRoadPoint(
    player.pos.x + (Math.random() - 0.5) * 120,
    player.pos.z + (Math.random() - 0.5) * 120
  );
  const dx = spot.x - player.pos.x;
  const dz = spot.z - player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const x = player.pos.x + (dx / d) * CFG.police.spawnDistance;
  const z = player.pos.z + (dz / d) * CFG.police.spawnDistance;
  const cop = createPoliceCar(scene, x, z);
  police.push(cop);
}

function damagePlayer(amount) {
  if (state.mode !== 'playing') return;
  player.health = Math.max(0, player.health - amount);
  hud.setHealth(player.health, CFG.player.maxHealth);
  hud.flashDamage();
  sound.thud();
  addShake(0.35, 0.3);
  if (player.health <= 0) failGame('Busted', 'Lena’s new hire got folded. The crew picks you up — try again.');
}

function knockPedestrian(ped, byCar) {
  if (downedPeds.has(ped)) return;
  downedPeds.set(ped, 3);
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.35;
  spawnBurst(ped.pos.x, 1, ped.pos.z, 6, 5);
  sound.thud();
  addWanted(CFG.wanted.hitPedestrianStars);
  if (byCar) addShake(0.3, 0.25);
}

function nearestStealableCar(maxDist) {
  const from = player.pos;
  let best = null;
  let bestD = maxDist;
  const consider = (car) => {
    const d = Math.hypot(car.pos.x - from.x, car.pos.z - from.z);
    if (d < bestD) { bestD = d; best = car; }
  };
  for (const car of parked) consider(car);
  for (const car of traffic) if (car.speed < 3) consider(car);
  return best;
}

function enterCar(car) {
  currentCar = car;
  car.parked = false;
  const index = parked.indexOf(car);
  if (index !== -1) parked.splice(index, 1);
  const trafficIndex = traffic.indexOf(car);
  if (trafficIndex !== -1) traffic.splice(trafficIndex, 1);
  player.mesh.visible = false;
  sound.door();
  if (car === targetCar) {
    addWanted(CFG.wanted.stealCarStars);
    missions.onStoleTargetCar();
    hud.showBanner('Borrowed Wheels', 'That’s Lena’s Comet GT. Get it to the garage — and lose the tail.', 5);
  } else {
    addWanted(CFG.wanted.stealCarStars);
    hud.showBanner('Car taken', 'It’s yours now. The owner disagrees — drive.', 4);
  }
}

function exitCar() {
  if (!currentCar) return;
  const car = currentCar;
  currentCar = null;
  player.mesh.visible = true;
  const side = car.pos.x + Math.cos(car.heading) * 2.4;
  const sideZ = car.pos.z - Math.sin(car.heading) * 2.4;
  player.pos.set(side, 0, sideZ);
  player.heading = car.heading;
  sound.door();
}

// ---- per-frame updates ----------------------------------------------------
function updateOnFoot(dt) {
  const camForwardX = Math.sin(state.camYaw);
  const camForwardZ = Math.cos(state.camYaw);
  // Screen right is cross(forward, up) in a right-handed system.
  const camRightX = -Math.cos(state.camYaw);
  const camRightZ = Math.sin(state.camYaw);
  const move = input.moveAxis();
  const strafe = input.steerAxis();
  let mx = camForwardX * move + camRightX * strafe;
  let mz = camForwardZ * move + camRightZ * strafe;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len; mz /= len;
    const speed = input.running() ? CFG.player.runSpeed : CFG.player.walkSpeed;
    const targetHeading = Math.atan2(mx, mz);
    let dh = targetHeading - player.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    player.heading += clamp(dh, -8 * dt, 8 * dt);
    player.pos.x += mx * speed * dt;
    player.pos.z += mz * speed * dt;
    player.speed = speed;
    player.walkPhase += dt * speed * 1.6;
    player.legL.rotation.x = Math.sin(player.walkPhase) * 0.6;
    player.legR.rotation.x = -Math.sin(player.walkPhase) * 0.6;
  } else {
    player.speed = 0;
    player.legL.rotation.x *= 0.8;
    player.legR.rotation.x *= 0.8;
  }
  resolveCollisions(player.pos, CFG.player.radius, city.colliders);
  player.mesh.rotation.y = player.heading;

  // Punch: fists against guards first, then anyone rude enough to stand
  // too close.
  state.punchCooldown -= dt;
  if (input.wasPressed('f') && state.punchCooldown <= 0) {
    state.punchCooldown = CFG.player.punchCooldown;
    sound.punch();
    const guard = missions.onPunch(player.pos);
    if (!guard) {
      let best = null;
      let bestD = CFG.player.punchRange;
      for (const ped of pedestrians) {
        if (downedPeds.has(ped)) continue;
        const d = Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z);
        if (d < bestD) { bestD = d; best = ped; }
      }
      if (best) knockPedestrian(best, false);
    }
  }

  // Getting in and out of cars.
  if (input.wasPressed('e')) {
    const car = nearestStealableCar(4);
    if (car) enterCar(car);
  }
}

// Driving, collisions between cars and people, the wanted level and the
// police chase all step here.
function updateDriving(dt) {
  const car = currentCar;
  drivePlayerCar(car, input, dt, city.colliders, (speed) => {
    spawnBurst(car.pos.x, 0.8, car.pos.z, 8, 6);
    sound.thud();
    addShake(0.4, 0.3);
  });
  sound.engine(Math.abs(car.speed) / CFG.car.maxSpeed, true);
  if (input.wasPressed('e')) exitCar();

  // Ramming traffic: shove both cars, spark, damage, wanted heat.
  for (const other of [...traffic, ...parked]) {
    const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
    if (d < 3.4 && Math.abs(car.speed) > 2) {
      const push = 3.4 - d;
      const nx = (other.pos.x - car.pos.x) / (d || 1);
      const nz = (other.pos.z - car.pos.z) / (d || 1);
      other.pos.x += nx * push;
      other.pos.z += nz * push;
      other.damage = Math.min(100, (other.damage || 0) + Math.abs(car.speed) * 0.8);
      car.damage = Math.min(CFG.car.maxDamage, car.damage + Math.abs(car.speed) * 0.5);
      car.speed *= 0.55;
      spawnBurst(other.pos.x, 0.9, other.pos.z, 10, 7);
      sound.thud();
      addShake(0.5, 0.3);
      addWanted(0); // a scrape alone is not a crime; hitting people is
    }
  }
  // Running someone over is always a crime.
  for (const ped of pedestrians) {
    if (downedPeds.has(ped)) continue;
    const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
    if (d < 2.4 && Math.abs(car.speed) > 1) {
      knockPedestrian(ped, true);
      car.speed *= 0.85;
    }
  }
  if (car.damage >= CFG.car.maxDamage) {
    failGame('Wrecked', 'The car gave up in a cloud of smoke. Lena sends a tow — and a bill.');
  }
}

function updateWantedAndPolice(dt) {
  // Keep the number of pursuit cars in step with the wanted level.
  const wantCops = state.wanted === 0 ? 0 : Math.min(CFG.police.maxCars, state.wanted);
  while (police.length < wantCops) spawnPolice();
  while (police.length > wantCops) {
    const cop = police.pop();
    scene.remove(cop.mesh);
  }

  const targetPos = currentCar ? currentCar.pos : player.pos;
  const targetSpeed = currentCar ? Math.abs(currentCar.speed) : player.speed;
  let nearestCop = Infinity;
  for (const cop of police) {
    const dist = updatePoliceCar(cop, dt, targetPos, targetSpeed, state.elapsed);
    nearestCop = Math.min(nearestCop, dist);
    // A ram lands: damage, sparks, shake. The rate is per second, so a
    // single shunt stings instead of instantly totalling the car.
    if (dist < 3.2) {
      if (currentCar) {
        currentCar.damage = Math.min(CFG.car.maxDamage, currentCar.damage + CFG.police.ramDamage * dt);
        currentCar.speed *= 0.985;
      } else {
        damagePlayer(CFG.police.ramDamage * dt);
      }
      spawnBurst(cop.pos.x, 1, cop.pos.z, 4, 5);
      addShake(0.45, 0.25);
      sound.thud();
    }
  }
  sound.siren(police.length > 0 && nearestCop < 70);

  // Out of sight long enough and the heat cools off, one star at a time.
  if (state.wanted > 0) {
    if (nearestCop > 45) {
      state.hiddenTimer += dt;
      if (state.hiddenTimer > CFG.police.loseSightSeconds) {
        state.wanted -= 1;
        state.hiddenTimer = 0;
        hud.setStars(state.wanted);
        hud.showBanner('Heat cooling off', state.wanted > 0 ? `Down to ${state.wanted} star${state.wanted > 1 ? 's' : ''} — stay out of sight.` : 'Clean. The cops lost you.', 4);
      }
    } else {
      state.hiddenTimer = 0;
    }
  }

  // Busted: a cop catches the player on foot and holds them.
  if (!currentCar && police.length > 0 && state.wanted >= 1 && nearestCop < 2.4) {
    state.bustedTimer += dt;
    if (state.bustedTimer > 1.2) {
      failGame('Busted', 'The Solmar Bay PD caught up with you on foot. Lena posts bail — try again.');
    }
  } else {
    state.bustedTimer = 0;
  }
}

function updateCamera(dt) {
  const focus = currentCar ? currentCar.pos : player.pos;
  const heading = currentCar ? currentCar.heading : player.heading;
  const wantYaw = heading + input.cameraYaw();
  let dy = wantYaw - state.camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  state.camYaw += dy * Math.min(1, dt * 4);
  const dist = currentCar ? 11 : 8.5;
  const height = 4.6 + Math.sin(input.cameraPitch()) * 3.2;
  const fx = Math.sin(state.camYaw);
  const fz = Math.cos(state.camYaw);
  const tx = focus.x - fx * dist;
  const tz = focus.z - fz * dist;
  camera.position.x = lerp(camera.position.x, tx, Math.min(1, dt * 6));
  camera.position.y = lerp(camera.position.y, height, Math.min(1, dt * 6));
  camera.position.z = lerp(camera.position.z, tz, Math.min(1, dt * 6));
  if (state.shakeTime > 0) {
    state.shakeTime -= dt;
    camera.position.x += (Math.random() - 0.5) * state.shakeMag;
    camera.position.y += (Math.random() - 0.5) * state.shakeMag * 0.6;
    camera.position.z += (Math.random() - 0.5) * state.shakeMag;
    if (state.shakeTime <= 0) state.shakeMag = 0;
  }
  camera.lookAt(focus.x + fx * 5, 1.6, focus.z + fz * 5);
}

// ---- the frame ------------------------------------------------------------
// A plain performance.now clock (three's Clock is deprecated in r187).
let lastNow = performance.now();

function frameDelta() {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  return dt;
}

function step(dt) {
  state.elapsed += dt;
  city.update(dt, state.elapsed);

  if (state.mode === 'playing') {
    if (currentCar) updateDriving(dt);
    else updateOnFoot(dt);

    // Traffic and pedestrians keep the city alive around the player.
    for (const car of traffic) updateTrafficCar(car, dt, traffic, currentCar);
    const playerPos = currentCar ? currentCar.pos : player.pos;
    const playerSpeed = currentCar ? Math.abs(currentCar.speed) : player.speed;
    for (const ped of pedestrians) {
      if (downedPeds.has(ped)) {
        const left = downedPeds.get(ped) - dt;
        if (left <= 0) {
          downedPeds.delete(ped);
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        } else {
          downedPeds.set(ped, left);
        }
        continue;
      }
      updatePedestrian(ped, dt, playerPos, playerSpeed);
    }

    updateWantedAndPolice(dt);
    missions.update(dt, playerPos, currentCar, targetCar, camera.position, state.elapsed);

    // Slow health regen when the heat is off.
    if (state.wanted === 0 && player.health > 0 && player.health < CFG.player.maxHealth) {
      player.health = Math.min(CFG.player.maxHealth, player.health + dt * 4);
      hud.setHealth(player.health, CFG.player.maxHealth);
    }

    // Pause and mute.
    if (input.wasPressed('Escape') || input.wasPressed('p')) pauseGame();
    if (input.wasPressed('m')) document.getElementById('mute-button').click();

    // HUD.
    hud.setSpeed(
      currentCar ? Math.abs(currentCar.speed) * 3.6 : 0,
      !!currentCar
    );
    hud.drawMinimap({
      player: { x: playerPos.x, z: playerPos.z, heading: currentCar ? currentCar.heading : player.heading },
      cars: [...traffic, ...parked].map((c) => ({ x: c.pos.x, z: c.pos.z })),
      pedestrians: pedestrians.filter((p) => !downedPeds.has(p)).map((p) => ({ x: p.pos.x, z: p.pos.z })),
      police: police.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      marker: missions.done ? null : missions.beacon.group.visible
        ? { x: missions.beacon.group.position.x, z: missions.beacon.group.position.z }
        : null,
    }, state.elapsed);
  } else if (state.mode === 'menu') {
    // Slow establishing orbit over the city while the title is up.
    const a = state.elapsed * 0.05;
    camera.position.set(Math.sin(a) * 120, 55, Math.cos(a) * 120);
    camera.lookAt(20, 0, 0);
    for (const car of traffic) updateTrafficCar(car, dt, traffic, null);
    for (const ped of pedestrians) updatePedestrian(ped, dt, player.pos, 0);
  }

  // Particles always animate.
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.1) { p.mesh.position.y = 0.1; p.vel.y *= -0.4; }
  }

  updateCamera(dt);
  input.endFrame();
}

function loop() {
  requestAnimationFrame(loop);
  const dt = frameDelta();
  try {
    step(dt);
  } catch (error) {
    fatalBox.textContent = `Error: ${error.message}`;
    fatalBox.style.display = 'block';
    throw error;
  }
  renderer.render(scene, camera);
}

// ---- screenshot staging ---------------------------------------------------
// ?scene=start|street|drive|chase stages one of the four screenshots
// deterministically: same city, same placements, every time.
function applyScenePreset() {
  const params = new URLSearchParams(window.location.search);
  const sceneName = params.get('scene') || params.get('shot') || 'start';
  if (sceneName === 'start') return; // title screen over the menu orbit
  startGame();
  if (sceneName === 'street') {
    player.pos.set(14, 0, -46);
    player.heading = Math.PI / 2;
    state.camYaw = player.heading;
  } else if (sceneName === 'drive') {
    const car = parked[0];
    player.pos.set(car.pos.x, 0, car.pos.z);
    enterCar(car);
    currentCar.speed = 16;
    currentCar.heading = Math.PI / 2;
    currentCar.pos.set(0, 0, -40);
    state.camYaw = currentCar.heading;
  } else if (sceneName === 'chase') {
    missions.skipToStage(2);
    player.pos.set(targetCar.pos.x, 0, targetCar.pos.z);
    enterCar(targetCar);
    currentCar.speed = 24;
    currentCar.heading = 0;
    currentCar.pos.set(40, 0, -40);
    state.camYaw = currentCar.heading;
    state.wanted = 3;
    hud.setStars(3);
    for (let i = 0; i < 3; i++) spawnPolice();
    // Stage the pursuit so it reads in one frame: the interceptors cut
    // across ahead of the Comet GT, sirens flashing, instead of sitting
    // behind the camera where the chase would be invisible.
    const copSpots = [
      { x: 52, z: -22 }, { x: 30, z: -18 }, { x: 46, z: -52 },
    ];
    police.forEach((cop, i) => {
      const spot = copSpots[i % copSpots.length];
      cop.pos.set(spot.x, 0, spot.z);
      cop.heading = Math.PI;
      cop.speed = 24;
    });
    hud.showBanner('Job 2 — Borrowed Wheels', 'Deliver the Comet GT to the garage. Lose the tail.', 8);
  }
}

hud.setCash(state.cash);
hud.setHealth(player.health, CFG.player.maxHealth);
hud.setStars(0);
// Read-only probe for play-testing (used by the author's own checks):
// the live state, never a control surface for cheats or secrets.
window.__solmar = {
  state,
  player,
  get currentCar() { return currentCar; },
  get police() { return police; },
  get traffic() { return traffic; },
  missions,
};
applyScenePreset();
loop();
