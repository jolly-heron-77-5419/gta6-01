// SOLMAR BAY — boot, the one loop, and everything that ties the modules
// together: the screens (title, play, pause, busted, wrecked), the wanted
// system and the police chase, stealing and driving, the mission checks,
// collisions, particles and screen shake, and saving to the browser.

import * as THREE from 'three';
import { CITY, DRIVE, HEALTH, MISSIONS, SAVE_KEY, SPOTS, WANTED, PALETTE } from './config.js';
import { createRandom } from './random.js';
import { buildCity, resolveCircle } from './world.js';
import { createPlayer, createCar, createTrafficCar, createPedestrian } from './entities.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_PUNCH, ACTION_MUTE } from './input.js';
import { createSound } from './audio.js';
import { createHud } from './hud.js';
import { createMissions } from './missions.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const worldSeed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

// --- Renderer and scene -----------------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Save ---------------------------------------------------------------------

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash,
      missionsCompleted,
      bestWanted,
      missionIndex: missions.state().index,
    }));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

// --- World and actors -----------------------------------------------------------

const rng = createRandom(worldSeed);
const city = buildCity(scene, rng);
const colliders = city.colliders;
const hud = createHud();
const sound = createSound();
const input = createInput(canvas);
const missions = createMissions(city.makeBeacon, scene);

let screen = 'title';
let cash = 0;
let missionsCompleted = 0;
let bestWanted = 0;
let wanted = 0;
let coolTimer = 0;
let bustedTimer = 0;
let shakeTime = 0;
let shakeMag = 0;
let cameraYaw = 0;
let orbitAngle = Math.PI;
let time = 0;
let punchCooldown = 0;
let guardsSpawned = false;
let crateTaken = false;

let player = null;
let playerCar = null;
let traffic = [];
let parked = [];
let police = [];
let peds = [];
let guards = [];
let particles = [];
let goldCar = null;

function clearDynamic() {
  const remove = (obj) => {
    if (obj && obj.mesh) scene.remove(obj.mesh.group);
    if (obj && obj.parts) scene.remove(obj.parts.group);
  };
  for (const car of [...traffic, ...parked, ...police]) remove(car);
  for (const ped of [...peds, ...guards]) remove(ped);
  if (player) scene.remove(player.parts.group);
  for (const p of particles) scene.remove(p.mesh);
  traffic = [];
  parked = [];
  police = [];
  peds = [];
  guards = [];
  particles = [];
  playerCar = null;
  guardsSpawned = false;
  crateTaken = false;
}

function spawnWorld(seed) {
  clearDynamic();
  const spawnRng = createRandom(seed);
  player = createPlayer(scene, SPOTS.spawn.x, SPOTS.spawn.z);
  player.heading = Math.PI * 0.75;
  // Parked cars along the streets, including the gold coupe for job 2.
  const parkedSpots = [
    { x: 58, z: -58, h: Math.PI / 2, color: 0xd9a441, gold: true },
    { x: -58, z: 116, h: 0, color: 0xc0392b },
    { x: 116, z: -58, h: Math.PI, color: 0x2e6fb0 },
    { x: -116, z: -58, h: -Math.PI / 2, color: 0x7d8a99 },
    { x: 0, z: 116, h: Math.PI / 2, color: 0x4a9e6d },
    { x: 58, z: 58, h: 0, color: 0x8e44ad },
    { x: -58, z: 0, h: Math.PI, color: 0xe8e8e8 },
    { x: 174, z: 0, h: -Math.PI / 2, color: 0x222831 },
  ];
  for (const spot of parkedSpots) {
    const car = createCar(scene, spot.x, spot.z, spot.h, spot.color, { parked: true });
    car.isGold = !!spot.gold;
    car.stolen = false;
    parked.push(car);
    if (spot.gold) goldCar = car;
  }
  for (let i = 0; i < 14; i += 1) {
    traffic.push(createTrafficCar(scene, spawnRng, spawnRng.pick(PALETTE.car)));
  }
  for (let i = 0; i < 22; i += 1) {
    peds.push(createPedestrian(scene, spawnRng, false));
  }
}

// --- Wanted and police ----------------------------------------------------------

function wantedCount() {
  return wanted;
}

function addWanted(amount, reason) {
  if (amount <= 0) return;
  wanted = Math.min(WANTED.maxStars, wanted + amount);
  if (wanted > bestWanted) bestWanted = wanted;
  coolTimer = 0;
  const target = Math.min(4, wanted);
  while (police.length < target) spawnPoliceCar();
  if (reason) hud.toast(reason, 3);
}

function spawnPoliceCar() {
  const angle = Math.random() * Math.PI * 2;
  const dist = 40;
  const x = Math.max(-CITY.half, Math.min(CITY.half, player.pos.x + Math.cos(angle) * dist));
  const z = Math.max(-CITY.half, Math.min(CITY.half, player.pos.z + Math.sin(angle) * dist));
  const car = createCar(scene, x, z, 0, 0xf2f2f2, { police: true });
  car.ramCooldown = 0;
  car.boost = 1.18;
  police.push(car);
}

function updateWanted(dt) {
  if (wanted === 0) return;
  let nearest = Infinity;
  const target = playerCar ? playerCar.pos : player.pos;
  for (const car of police) {
    nearest = Math.min(nearest, Math.hypot(car.pos.x - target.x, car.pos.z - target.z));
  }
  if (nearest > WANTED.coolDistance) {
    coolTimer += dt;
    if (coolTimer > WANTED.coolSeconds) {
      coolTimer = 0;
      wanted -= 1;
      if (police.length > 0) {
        const gone = police.pop();
        scene.remove(gone.mesh.group);
      }
      if (wanted === 0) hud.toast('You lost the cops. Heat is off.', 3);
    }
  } else {
    coolTimer = 0;
  }
}

function updatePolice(dt) {
  const target = playerCar ? playerCar.pos : player.pos;
  const targetMoving = playerCar ? playerCar.speed : player.speed;
  for (const car of police) {
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2));
    const throttle = dist > 4 ? 1 : 0.4;
    car.drive(dt, throttle, steer, false, colliders);
    // Ramming the player: a jolt, damage, shake and noise.
    if (dist < 3.6 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      addShake(0.45, 0.5);
      sound.crash();
      spawnBurst(target.x, target.z, 0xffcc44);
      if (playerCar) {
        playerCar.health -= HEALTH.policeRam;
        playerCar.speed *= 0.4;
        if (playerCar.health <= 0) return endScreen('wrecked');
      } else {
        player.health -= HEALTH.policeRam;
        if (player.health <= 0) return endScreen('busted');
      }
    }
    void targetMoving;
  }
  // On foot, a police car sitting on the player busts them.
  if (!playerCar && police.length > 0) {
    let close = false;
    for (const car of police) {
      if (Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z) < 3) close = true;
    }
    bustedTimer = close ? bustedTimer + dt : 0;
    if (bustedTimer > 2.5) endScreen('busted');
  } else {
    bustedTimer = 0;
  }
}

// --- Particles and shake ---------------------------------------------------------

function spawnBurst(x, z, color) {
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.set(x, 1, z);
    scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * 6 + 2,
      vz: (Math.random() - 0.5) * 9,
      life: 0.6,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.vy -= 18 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y = Math.max(0.1, p.mesh.position.y + p.vy * dt);
    p.mesh.position.z += p.vz * dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

function addShake(seconds, mag) {
  shakeTime = Math.max(shakeTime, seconds);
  shakeMag = Math.max(shakeMag, mag);
}

// --- Entering, stealing and punching ------------------------------------------------

function nearestCarTo(x, z, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of [...parked, ...traffic]) {
    const d = Math.hypot(car.pos.x - x, car.pos.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  if (!car) return;
  playerCar = car;
  player.parts.group.visible = false;
  if (car.traffic) {
    // A stolen traffic car leaves the flow: it no longer drives itself.
    traffic = traffic.filter((other) => other !== car);
    car.traffic = false;
  }
  if (!car.stolen && (car.parked || car.traffic)) {
    car.stolen = true;
    addWanted(WANTED.stealCar, 'Car stolen — the cops are on you!');
    sound.siren(true, 0);
    if (car.isGold && missions.state().index === 1 && missions.state().step === 0) {
      advanceMission('You took the coupe. Lose the heat and deliver it.');
    }
  }
  sound.click();
}

function exitCar() {
  if (!playerCar) return;
  const car = playerCar;
  playerCar = null;
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  player.pos.set(car.pos.x + side.x * 2.6, 0, car.pos.z + side.z * 2.6);
  player.heading = car.heading;
  player.parts.group.visible = true;
  sound.click();
}

function tryPunch() {
  if (punchCooldown > 0) return;
  punchCooldown = 0.35;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  let best = null;
  let bestDist = 2.4;
  for (const ped of [...peds, ...guards]) {
    if (ped.down) continue;
    const dx = ped.pos.x - player.pos.x;
    const dz = ped.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bestDist && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.3) {
      bestDist = d;
      best = ped;
    }
  }
  if (!best) return;
  sound.punch();
  addShake(0.15, 0.2);
  spawnBurst(best.pos.x, best.pos.z + 1, 0xffffff);
  if (best.guard) {
    best.health -= HEALTH.punchDamage;
    if (best.health <= 0) {
      best.knockDown();
      sound.success();
      checkGuardsDown();
    }
  } else {
    best.knockDown();
    addWanted(WANTED.hitPedestrian, 'You hit a pedestrian!');
  }
}

function checkGuardsDown() {
  if (guards.length === 0 || guards.some((g) => !g.down)) return;
  addWanted(2, 'Crate grabbed — get out of there!');
  advanceMission('Crate in hand. Reach the escape marker!');
  crateTaken = true;
}

// --- Missions -----------------------------------------------------------------------

function advanceMission(note) {
  const result = missions.reached();
  if (result.type === 'advanced') {
    hud.setObjective(missions.titleText(), missions.objectiveText());
    hud.toast(note || missions.objectiveText(), 5);
    sound.pickup();
  } else if (result.type === 'completed' || result.type === 'done') {
    cash += result.job.reward;
    missionsCompleted += 1;
    writeSave();
    sound.success();
    if (result.type === 'done') {
      hud.setObjective(missions.titleText(), missions.objectiveText());
      hud.toast(`All jobs done! Lena paid $${result.job.reward}. Solmar Bay is yours — free roam.`, 8);
    } else {
      hud.setObjective(missions.titleText(), missions.objectiveText());
      hud.toast(`${result.job.title} complete — $${result.job.reward}. ${result.next.briefing}`, 7);
    }
  }
}

function checkMissionMarker() {
  const marker = missions.marker();
  if (!marker) return;
  const pos = playerCar ? playerCar.pos : player.pos;
  const d = Math.hypot(pos.x - marker.x, pos.z - marker.z);
  const state = missions.state();
  // Job 2 step 0 completes the moment the player is driving the gold coupe,
  // wherever they took it from.
  if (state.index === 1 && state.step === 0 && playerCar && playerCar.isGold) {
    advanceMission('You took the coupe. Lose the heat and deliver it.');
    return;
  }
  // Job 3 step 0 is about the guards, not the marker itself.
  if (state.index === 2 && state.step === 0) {
    if (d < 9 && !guardsSpawned) {
      guardsSpawned = true;
      spawnGuards();
      hud.toast('Two guards on the crate. Handle them (F to punch).', 5);
    }
    return;
  }
  // Job 2 step 1 needs the gold coupe at the drop-off.
  if (state.index === 1 && state.step === 1 && !playerCar) return;
  if (d < 5) {
    if (state.index === 0 && state.step === 0) advanceMission('Package secured. Bring it back to Lena.');
    else if (state.index === 0 && state.step === 1) advanceMission();
    else if (state.index === 1 && state.step === 1) advanceMission();
    else if (state.index === 2 && state.step === 1) advanceMission();
  }
}

function spawnGuards() {
  const spots = [
    { x: SPOTS.warehouse.x + 4, z: SPOTS.warehouse.z + 6 },
    { x: SPOTS.warehouse.x - 4, z: SPOTS.warehouse.z + 6 },
  ];
  for (const spot of spots) {
    const guard = createPedestrian(scene, createRandom(worldSeed + 99), true);
    guard.pos.set(spot.x, 0, spot.z);
    guard.parts.group.position.copy(guard.pos);
    guards.push(guard);
  }
}

// --- Camera ---------------------------------------------------------------------------

function updateCamera(dt) {
  cameraYaw += input.takeDrag() * 0.004;
  if (screen === 'title') {
    orbitAngle += dt * 0.05;
    camera.position.set(
      Math.cos(orbitAngle) * 150,
      62,
      Math.sin(orbitAngle) * 150,
    );
    camera.lookAt(-20, 0, 0);
    return;
  }
  const target = playerCar ? playerCar.pos : player.pos;
  const heading = playerCar ? playerCar.heading : player.heading;
  const speed = playerCar ? Math.abs(playerCar.speed) : player.speed;
  const dist = (playerCar ? 12 : 12) + speed * 0.06;
  const height = (playerCar ? 4.5 : 5.5) + speed * 0.02;
  const yaw = heading + Math.PI + cameraYaw;
  const desired = new THREE.Vector3(
    target.x + Math.sin(yaw) * dist,
    height,
    target.z + Math.cos(yaw) * dist,
  );
  camera.position.lerp(desired, Math.min(1, dt * 5));
  if (shakeTime > 0) {
    shakeTime -= dt;
    camera.position.x += (Math.random() - 0.5) * shakeMag;
    camera.position.y += (Math.random() - 0.5) * shakeMag;
    camera.position.z += (Math.random() - 0.5) * shakeMag;
    if (shakeTime <= 0) shakeMag = 0;
  }
  camera.lookAt(target.x + Math.sin(heading) * 3, 1.5, target.z + Math.cos(heading) * 3);
}

// --- Screens ------------------------------------------------------------------------------

const titleEl = document.getElementById('title-screen');
const pauseEl = document.getElementById('pause-screen');
const endEl = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endText = document.getElementById('end-text');
const startBtn = document.getElementById('start-btn');
const continueBtn = document.getElementById('continue-btn');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const retryBtn = document.getElementById('retry-btn');
const saveLine = document.getElementById('save-line');

function showOnly(el) {
  for (const overlay of [titleEl, pauseEl, endEl]) overlay.style.display = 'none';
  if (el) el.style.display = 'flex';
}

function refreshTitle() {
  const save = readSave();
  if (save) {
    continueBtn.style.display = 'inline-block';
    saveLine.textContent = `Saved: $${save.cash} · ${save.missionsCompleted}/3 jobs done · best wanted ${'★'.repeat(save.bestWanted) || '—'}`;
  } else {
    continueBtn.style.display = 'none';
    saveLine.textContent = 'No saved progress yet — your first run starts fresh.';
  }
}

function startGame(fresh) {
  if (fresh) {
    cash = 0;
    missionsCompleted = 0;
    bestWanted = 0;
    wanted = 0;
    spawnWorld(worldSeed);
  }
  const first = missions.start();
  if (!fresh) {
    const save = readSave();
    if (save && save.missionIndex > 0 && save.missionIndex < MISSIONS.length) {
      missions.setState(save.missionIndex, 0);
      const job = MISSIONS[save.missionIndex];
      hud.setObjective(job.title, job.objective);
      hud.toast(job.briefing, 8);
      hud.show();
      showOnly(null);
      screen = 'play';
      sound.unlock();
      sound.click();
      return;
    }
  }
  hud.setObjective(first.title, first.objective);
  hud.toast(first.briefing, 8);
  hud.show();
  showOnly(null);
  screen = 'play';
  sound.unlock();
  sound.click();
}

function endScreen(kind) {
  if (screen !== 'play') return;
  screen = kind;
  writeSave();
  sound.fail();
  hud.hide();
  endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WRECKED';
  endText.textContent = kind === 'busted'
    ? 'The Solmar Bay PD caught up with you. A $50 fine, and Lena is not impressed.'
    : 'Your ride is scrap. A $50 tow fee, and Lena is not impressed.';
  cash = Math.max(0, cash - 50);
  showOnly(endEl);
}

function retry() {
  wanted = 0;
  coolTimer = 0;
  bustedTimer = 0;
  for (const car of police) scene.remove(car.mesh.group);
  police = [];
  player.health = HEALTH.player;
  if (playerCar) playerCar.health = HEALTH.carHealth;
  player.pos.set(SPOTS.spawn.x, 0, SPOTS.spawn.z);
  player.heading = Math.PI * 0.75;
  if (playerCar) {
    playerCar.setPose(SPOTS.spawn.x + 4, SPOTS.spawn.z, Math.PI / 2);
  }
  hud.setHealth(player.health);
  hud.setStars(0);
  hud.setCash(cash);
  hud.show();
  showOnly(null);
  screen = 'play';
  sound.click();
}

// --- One fixed simulation step ----------------------------------------------------

function stepWorld(dt, driveOverride) {
  time += dt;
  city.update(dt, time);
  missions.update(time);
  updateParticles(dt);

  const active = screen === 'play';
  if (!active) {
    // The title backdrop stays alive: traffic and pedestrians move.
    for (const car of traffic) car.update(dt, colliders, traffic, null);
    for (const ped of [...peds, ...guards]) ped.update(dt, player.pos, colliders);
    updateCamera(dt);
    return;
  }

  punchCooldown = Math.max(0, punchCooldown - dt);
  const actions = driveOverride ? 0 : input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = sound.toggleMute();
    hud.toast(muted ? 'Sound off (M to turn back on).' : 'Sound on.', 2);
  }
  if (actions & ACTION_PAUSE) {
    screen = 'paused';
    hud.hide();
    showOnly(pauseEl);
    return;
  }
  if (actions & ACTION_ENTER) {
    if (playerCar) exitCar();
    else {
      const car = nearestCarTo(player.pos.x, player.pos.z, 4.5);
      if (car) enterCar(car);
    }
  }
  if (actions & ACTION_PUNCH && !playerCar) tryPunch();

  // Movement: drive the car, or walk.
  if (playerCar) {
    const throttle = driveOverride ? driveOverride.throttle : input.throttle();
    const steer = driveOverride ? driveOverride.steer : input.steering();
    const brake = driveOverride ? false : input.handbrake();
    playerCar.drive(dt, throttle, steer, brake, colliders);
    player.pos.copy(playerCar.pos);
    player.heading = playerCar.heading;
    // Running over a pedestrian is a crime; bumping traffic is a crash.
    for (const ped of peds) {
      if (ped.down) continue;
      if (Math.hypot(ped.pos.x - playerCar.pos.x, ped.pos.z - playerCar.pos.z) < 2.3 && Math.abs(playerCar.speed) > 4) {
        ped.knockDown();
        addWanted(WANTED.hitPedestrian, 'Hit and run!');
        sound.crash();
        addShake(0.4, 0.5);
        spawnBurst(ped.pos.x, ped.pos.z, 0xff5544);
      }
    }
    for (const car of traffic) {
      const d = Math.hypot(car.pos.x - playerCar.pos.x, car.pos.z - playerCar.pos.z);
      if (d < 4.2 && d > 0.01) {
        const push = (4.2 - d) / 2;
        const nx = (car.pos.x - playerCar.pos.x) / d;
        const nz = (car.pos.z - playerCar.pos.z) / d;
        car.pos.x += nx * push;
        car.pos.z += nz * push;
        if (Math.abs(playerCar.speed) > 8) {
          playerCar.speed *= 0.5;
          car.speed = 2;
          sound.crash();
          addShake(0.35, 0.45);
          spawnBurst(playerCar.pos.x, playerCar.pos.z, 0xffcc44);
        }
      }
    }
  } else {
    // On-foot movement is camera-relative: up is away from the camera.
    const steer = input.steering();
    const throttle = input.throttle();
    const camAngle = Math.atan2(camera.position.x - player.pos.x, camera.position.z - player.pos.z);
    const forward = new THREE.Vector3(-Math.sin(camAngle), 0, -Math.cos(camAngle));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const moveX = forward.x * throttle + right.x * steer;
    const moveZ = forward.z * throttle + right.z * steer;
    player.update(dt, moveX, moveZ, input.running(), colliders);
    // A traffic car can run the player down.
    for (const car of traffic) {
      if (Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z) < 2.1 && Math.abs(car.speed) > 3) {
        player.health -= 10;
        car.speed = 0;
        player.pos.x += (player.pos.x - car.pos.x) * 0.6;
        player.pos.z += (player.pos.z - car.pos.z) * 0.6;
        addShake(0.4, 0.5);
        sound.crash();
        if (player.health <= 0) return endScreen('busted');
      }
    }
  }

  for (const car of traffic) car.update(dt, colliders, traffic, playerCar);
  for (const ped of peds) ped.update(dt, player.pos, colliders);
  for (const guard of guards) {
    guard.update(dt, player.pos, colliders);
    if (guard.swung) {
      guard.swung = false;
      if (!playerCar && Math.hypot(guard.pos.x - player.pos.x, guard.pos.z - player.pos.z) < 2.2) {
        player.health -= HEALTH.guardPunch;
        addShake(0.2, 0.25);
        sound.punch();
        if (player.health <= 0) return endScreen('busted');
      }
    }
  }
  updatePolice(dt);
  if (screen !== 'play') return;
  updateWanted(dt);
  checkMissionMarker();
  updateCamera(dt);

  // HUD and sound, every step.
  hud.setHealth(player.health);
  hud.setStars(wanted);
  hud.setCash(cash);
  hud.setSpeed(playerCar ? Math.abs(playerCar.speed) * 3.6 : 0, !!playerCar);
  hud.tickToast(dt);
  hud.drawMinimap({
    playerX: player.pos.x,
    playerZ: player.pos.z,
    heading: player.heading,
    traffic,
    police,
    marker: missions.marker(),
    time,
  });
  sound.engine(playerCar ? Math.abs(playerCar.speed) / DRIVE.maxSpeed : 0, !!playerCar);
  sound.siren(wanted > 0 && police.length > 0, dt);
}

// --- The frame loop ------------------------------------------------------------------

function runGame() {
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === 'title') {
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM || input.clickConfirm()) {
        const save = readSave();
        if (save) startGame(false);
        else startGame(true);
      }
    } else if (screen === 'paused') {
      const actions = input.takeActions();
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.show();
        showOnly(null);
        sound.click();
      }
    } else if (screen === 'busted' || screen === 'wrecked') {
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) retry();
    }
    while (accumulator >= STEP && (screen === 'title' || screen === 'play')) {
      stepWorld(STEP, null);
      accumulator -= STEP;
    }
    if (screen !== 'title' && screen !== 'play') accumulator = 0;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// --- The game object the screenshot stager drives --------------------------------------

const game = {
  reset() {
    wanted = 0;
    coolTimer = 0;
    bustedTimer = 0;
    cash = 0;
    spawnWorld(worldSeed);
    hud.setHealth(HEALTH.player);
    hud.setStars(0);
    hud.setCash(0);
  },
  startPlay() {
    hud.show();
    showOnly(null);
    screen = 'play';
  },
  placePlayerOnFoot(x, z, heading) {
    if (playerCar) {
      playerCar = null;
      player.parts.group.visible = true;
    }
    player.pos.set(x, 0, z);
    player.heading = heading;
    player.parts.group.position.copy(player.pos);
    player.parts.group.rotation.y = heading;
  },
  setMission(index, step) {
    missions.setState(index, step);
    hud.setObjective(missions.titleText(), missions.objectiveText());
  },
  showBriefing(index) {
    hud.toast(MISSIONS[index].briefing, 8);
    hud.setObjective(MISSIONS[index].title, MISSIONS[index].objective);
  },
  nearestCar(x, z) {
    return nearestCarTo(x, z, 60);
  },
  goldCar() {
    return goldCar;
  },
  enterCar(car) {
    enterCar(car);
  },
  setPlayerCarHeading(heading) {
    if (playerCar) {
      playerCar.heading = heading;
      playerCar.mesh.group.rotation.y = heading;
    }
  },
  setWanted(n) {
    wanted = n;
    if (n > bestWanted) bestWanted = n;
    hud.setStars(n);
  },
  spawnPolice(n) {
    for (let i = 0; i < n; i += 1) spawnPoliceCar();
  },
  policeCars() {
    return police;
  },
  // Move a pedestrian next to the player for a staged scene.
  nudgePed(i, x, z) {
    const ped = peds[i];
    if (!ped) return;
    ped.pos.set(x, 0, z);
    ped.horizontal = true;
    ped.dir = 1;
  },
  playerState() {
    return {
      x: player.pos.x,
      z: player.pos.z,
      heading: playerCar ? playerCar.heading : player.heading,
    };
  },
  stepWorld(dt, drive) {
    stepWorld(dt, drive);
  },
  orbitCamera() {
    screen = 'title';
    showOnly(titleEl);
  },
  get playerCar() {
    return playerCar;
  },
};

// --- Boot ---------------------------------------------------------------------------------

spawnWorld(worldSeed);
{
  const save = readSave();
  if (save) {
    cash = save.cash;
    missionsCompleted = save.missionsCompleted;
    bestWanted = save.bestWanted;
  }
}
refreshTitle();

startBtn.addEventListener('click', () => startGame(true));
continueBtn.addEventListener('click', () => startGame(false));
resumeBtn.addEventListener('click', () => {
  screen = 'play';
  hud.show();
  showOnly(null);
  sound.click();
});
restartBtn.addEventListener('click', () => startGame(true));
retryBtn.addEventListener('click', () => retry());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'paused';
    hud.hide();
    showOnly(pauseEl);
  }
});

if (shotName) {
  // Screenshot mode: stage the scene, paint it twice, flag readiness.
  const staged = stageShot(shotName, game);
  if (staged.screen === 'title') refreshTitle();
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  runGame();
}
