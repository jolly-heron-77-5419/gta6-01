// main.js — Solmar Bay: game loop, player + driving controls, stealing cars,
// wanted level and police pursuit, combat, pickups, save/load and screens.
// Original open-world crime game. Runs offline from static files.

import * as THREE from 'three';
import { WORLD, PLAYER, CAR_DEFS, MISSIONS, PICKUPS, clamp, dist2, rand, randi } from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { HUD } from './hud.js';
import { MissionManager } from './missions.js';
import { Car, Pedestrian, Traffic, makePlayerMesh } from './entities.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
const world = new World(scene);
const input = new Input(renderer.domElement);
const sound = new SoundBank();
const hud = new HUD();
const missions = new MissionManager(scene);
const traffic = new Traffic(scene, world);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- state ----------
const S = {
  mode: 'title',           // title | play | pause | busted | wasted | win
  money: 40,
  health: PLAYER.maxHealth,
  wanted: 0,
  wantedTimer: 0,
  crimeCooldown: 0,
  inCar: null,             // Car the player drives
  heading: 0,              // player facing
  camYaw: 0, camPitch: 0.32,
  vy: 0, grounded: true,
  bustedTimer: 0,
  playTime: 0,
  carsStolen: 0,
  pedsHit: 0,
};

// ---------- player ----------
const player = makePlayerMesh();
player.position.set(0, 0, -40);
scene.add(player);
let walkPhase = 0;

// ---------- parked / stealable cars ----------
const parkedCars = [];
function spawnParkedCars() {
  const spots = [
    [-104, -88, 0], [-88, -104, 1], [104, 88, 0], [88, 104, 1], [0, -156, 0],
    [156, 0, 1], [-156, 0, 0], [52, 52, 1], [-52, -52, 0], [140, -60, 1],
    [-140, 60, 0], [60, 140, 1], [-60, -140, 0], [20, 20, 1],
  ];
  const taxiDef = CAR_DEFS[4];
  spots.forEach(([x, z, dir], i) => {
    const def = i === 0 ? taxiDef : CAR_DEFS[i % CAR_DEFS.length];
    const car = new Car(scene, def, x, z, dir ? Math.PI / 2 : 0);
    car.driver = null; car.parked = true;
    parkedCars.push(car);
  });
}
spawnParkedCars();
const allCars = () => [...parkedCars, ...traffic.cars, ...policeCars];

// ---------- pedestrians ----------
const peds = [];
for (let i = 0; i < 16; i++) peds.push(new Pedestrian(scene, world));

// ---------- pickups ----------
const pickupMeshes = [];
function spawnPickups() {
  for (const p of PICKUPS) {
    const mesh = p.kind === 'cash'
      ? new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.3, 10, 20),
          new THREE.MeshBasicMaterial({ color: 0xffd23e }))
      : new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.4),
          new THREE.MeshBasicMaterial({ color: 0x37d67a }));
    mesh.position.set(p.pos[0], 1.2, p.pos[1]);
    mesh.userData = { ...p, taken: false };
    scene.add(mesh);
    pickupMeshes.push(mesh);
  }
}
spawnPickups();

// ---------- police ----------
const policeCars = [];
const policeDef = { name: 'SBP Interceptor', color: 0x1b2a4a, top: 0.26, accel: 30, maxSpeed: 40 };
let policeSpawnTimer = 0;

function spawnPolice() {
  const a = rand(0, Math.PI * 2);
  const x = clamp(player.position.x + Math.sin(a) * 90, -200, 200);
  const z = clamp(player.position.z + Math.cos(a) * 90, -200, 200);
  const car = new Car(scene, policeDef, x, z, Math.atan2(player.position.x - x, player.position.z - z), true);
  car.driver = 'police'; car.parked = false;
  policeCars.push(car);
}
function removePolice(car) {
  scene.remove(car.mesh);
  policeCars.splice(policeCars.indexOf(car), 1);
}

// ---------- wanted ----------
function setWanted(n) {
  S.wanted = clamp(n, 0, 5);
  S.wantedTimer = 0;
  sound.siren(S.wanted > 0);
}
function addWanted(n) {
  if (S.crimeCooldown > 0) return;
  S.crimeCooldown = 1.5;
  setWanted(S.wanted + n);
  if (S.wanted > 0) hud.toast(`WANTED LEVEL ${S.wanted} — the Solmar Bay Police are coming!`);
}

// ---------- screens ----------
const $ = (id) => document.getElementById(id);
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function startGame(fromSave) {
  sound.ensure(); sound.startMusic();
  const save = fromSave ? loadSave() : null;
  if (save) {
    S.money = save.money; S.health = save.health;
    missions.index = save.missionIndex; missions.completed = save.missionsDone;
    player.position.set(save.x, 0, save.z);
    hud.toast('Save loaded — welcome back to Solmar Bay.');
  } else {
    S.money = 40; S.health = PLAYER.maxHealth;
    missions.index = 0; missions.completed = 0;
    player.position.set(0, 0, -40);
  }
  setWanted(0);
  hide('startScreen'); hide('pauseScreen'); hide('endScreen'); hide('winScreen');
  hud.show();
  S.mode = 'play';
  if (SHOT === 'chase') setupShotChase();
  if (SHOT === 'drive') setupShotDrive();
  if (SHOT === 'street') setupShotStreet();
  if (SHOT === 'mission') { missions.start(); hud.toast(missions.nextDef()?.intro || ''); }
}

function endGame(kind) {
  S.mode = kind;
  sound.stopEngine(); sound.siren(false);
  if (kind === 'busted') {
    sound.busted();
    $('endTitle').textContent = 'BUSTED';
    $('endText').textContent = `The Solmar Bay Police caught Danny. Bail cost $${Math.min(S.money, 200)} — the crew is not impressed.`;
    S.money = Math.max(0, S.money - 200);
  } else {
    $('endTitle').textContent = 'WASTED';
    $('endText').textContent = 'Danny woke up at St. Marina Hospital, $150 lighter and twice as stubborn.';
    S.money = Math.max(0, S.money - 150);
  }
  saveGame();
  show('endScreen');
}

// ---------- save / load ----------
function saveGame() {
  try {
    localStorage.setItem(WORLD.saveKey, JSON.stringify({
      money: S.money, health: S.health,
      missionIndex: missions.index, missionsDone: missions.completed,
      x: player.position.x, z: player.position.z,
      playTime: S.playTime, carsStolen: S.carsStolen,
    }));
  } catch (e) {}
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(WORLD.saveKey) || 'null'); } catch (e) { return null; }
}
function hasSave() { return !!loadSave(); }

$('btnStart').onclick = () => startGame(false);
$('btnContinue').onclick = () => startGame(true);
$('btnResume').onclick = () => { hide('pauseScreen'); S.mode = 'play'; };
$('btnSaveQuit').onclick = () => { saveGame(); hide('pauseScreen'); hud.hide(); show('startScreen'); S.mode = 'title'; refreshTitle(); };
$('btnRetry').onclick = () => { hide('endScreen'); S.health = PLAYER.maxHealth; setWanted(0); player.position.set(0, 0, -40); S.mode = 'play'; };
$('btnEndTitle').onclick = () => { hide('endScreen'); hud.hide(); show('startScreen'); S.mode = 'title'; refreshTitle(); };
$('btnFreeRoam').onclick = () => { hide('winScreen'); S.mode = 'play'; };
function refreshTitle() { $('btnContinue').classList.toggle('hidden', !hasSave()); }
refreshTitle();

// ---------- one-shot keys ----------
input.onKey = (code) => {
  if (S.mode === 'title' && (code === 'Enter' || code === 'Space')) { startGame(hasSave()); return; }
  if (S.mode !== 'play') return;
  if (code === 'KeyP' || code === 'Escape') {
    S.mode = 'pause';
    $('pauseStats').textContent = `Money $${S.money} · Jobs done ${missions.completed}/3 · Cars stolen ${S.carsStolen} · Time ${Math.floor(S.playTime / 60)} min`;
    show('pauseScreen');
    saveGame();
  }
  if (code === 'KeyN') { sound.setMuted(!sound.muted); hud.toast(sound.muted ? 'Sound muted (N to unmute)' : 'Sound on'); }
  if (code === 'KeyM') {
    if (!missions.current()) {
      const def = missions.start();
      if (def) { hud.toast(def.title); setTimeout(() => hud.toast(def.intro, 5000), 200); }
      else hud.toast('All jobs done — free roam!');
    } else hud.toast('Job already active — follow the gold beacon!');
  }
  if (code === 'KeyE') toggleCar();
  if (code === 'KeyF') punch();
};

// ---------- car enter / exit / steal ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const c of allCars()) {
    if (c.driver === 'police') continue;
    const d = Math.hypot(c.pos.x - player.position.x, c.pos.z - player.position.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}
function toggleCar() {
  if (S.inCar) {
    const car = S.inCar;
    car.speed = 0; car.driver = null; car.parked = true;
    S.inCar = null;
    player.position.set(car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.5, 0, car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.5);
    player.visible = true;
    sound.stopEngine();
    hud.toast('Out of the car.');
    return;
  }
  const car = nearestCar(4);
  if (!car) { hud.toast('No car nearby — walk to one and press E.'); return; }
  const stolen = car.driver === 'traffic' || car.parked;
  S.inCar = car;
  car.driver = 'player'; car.parked = false;
  player.visible = false;
  sound.startEngine();
  if (stolen) {
    S.carsStolen++;
    hud.toast(`You stole the ${car.def.name}!`);
    addWanted(1);
  } else hud.toast(`Driving the ${car.def.name}.`);
}

// ---------- combat ----------
function punch() {
  if (S.inCar) return;
  sound.punch();
  player.userData.body.rotation.x = -0.5;
  setTimeout(() => { player.userData.body.rotation.x = 0; }, 150);
  for (const p of peds) {
    const d = Math.hypot(p.mesh.position.x - player.position.x, p.mesh.position.z - player.position.z);
    if (d < 2.2) {
      p.health -= 25;
      p.fleeing = 4;
      p.mesh.position.x += Math.sin(p.mesh.rotation.y) * 1.2;
      p.mesh.position.z += Math.cos(p.mesh.rotation.y) * 1.2;
      addWanted(1);
      if (p.health <= 0) { p.mesh.visible = false; p.health = 50; setTimeout(() => { p.mesh.visible = true; p.mesh.position.set(rand(-180, 180), 0, rand(-180, 180)); }, 8000); }
      hud.toast('You punched a pedestrian! The cops noticed.');
    }
  }
}

// tracer line for gunshots
const tracerGeo = new THREE.BufferGeometry();
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe066 }));
tracer.visible = false;
scene.add(tracer);

function shoot() {
  if (S.inCar || S.mode !== 'play') return;
  sound.shoot();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = camera.position.clone();
  const to = from.clone().add(dir.multiplyScalar(60));
  tracerGeo.setFromPoints([from, to]);
  tracer.visible = true;
  setTimeout(() => { tracer.visible = false; }, 90);
  // hit test: nearest ped or car near the ray
  let hitAny = false;
  const ray = new THREE.Ray(from, dir.clone().normalize());
  for (const p of peds) {
    if (!p.mesh.visible) continue;
    const pt = new THREE.Vector3(p.mesh.position.x, 1.2, p.mesh.position.z);
    if (ray.distanceToPoint(pt) < 1.6 && ray.direction.dot(pt.clone().sub(from).normalize()) > 0.9) {
      p.health -= 34; p.fleeing = 5; hitAny = true;
      if (p.health <= 0) { p.mesh.visible = false; p.health = 50; setTimeout(() => { p.mesh.visible = true; p.mesh.position.set(rand(-180, 180), 0, rand(-180, 180)); }, 8000); }
    }
  }
  for (const c of allCars()) {
    const pt = new THREE.Vector3(c.pos.x, 1, c.pos.z);
    if (ray.distanceToPoint(pt) < 2.2 && from.distanceTo(pt) < 60) { c.health -= 20; hitAny = true; }
  }
  if (hitAny) addWanted(1);
  else if (Math.random() < 0.5) addWanted(1); // firing in public draws attention
}

// ---------- shot presets (for screenshots) ----------
function putPlayerInCar(defIdx, x, z, heading, speed) {
  const car = new Car(scene, CAR_DEFS[defIdx], x, z, heading);
  car.driver = 'player'; car.parked = false; car.speed = speed;
  parkedCars.push(car);
  S.inCar = car; player.visible = false;
  S.camYaw = heading; S.camPitch = 0.22; S.camSnap = true;
}
function setupShotChase() {
  putPlayerInCar(2, 26, 40, Math.PI, 18); // Sunset Coupe northbound on the road
  S.camDistBoost = 7; // pull the camera back so the pursuit is in frame
  setWanted(3);
  // Police interceptors converging head-on, in frame ahead of the player:
  // the pursuit reads at a glance in the cover screenshot.
  for (const [x, z] of [[26, 6], [20, -16]]) {
    const pc = new Car(scene, policeDef, x, z, 0, true);
    pc.driver = 'police'; pc.parked = false; pc.speed = 15;
    policeCars.push(pc);
  }
  missions.start();
}
function setupShotDrive() {
  putPlayerInCar(4, -40, 26, Math.PI / 2, 22); // Coral Taxi eastbound on the road
  setWanted(0);
}
function setupShotStreet() {
  player.position.set(30, 0, 30);
  S.camYaw = Math.PI * 0.75;
  S.camPitch = 0.12;
  S.camSnap = true;
  missions.start();
}
if (SHOT === 'start') { /* title screen is the shot */ }
if (SHOT) {
  // Auto-start for screenshot modes (except start screen).
  if (SHOT !== 'start') setTimeout(() => startGame(false), 300);
}

// ---------- per-frame updates ----------
const clock = new THREE.Clock();
let saveTimer = 0;

function updatePlayer(dt) {
  const look = input.consumeLook();
  S.camYaw += look.yaw;
  S.camPitch = clamp(S.camPitch + look.pitch, -0.15, 0.9);
  const ax = input.axis();
  const running = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  // movement relative to camera yaw
  const sin = Math.sin(S.camYaw), cos = Math.cos(S.camYaw);
  let mx = 0, mz = 0;
  if (ax.z || ax.x) {
    mx = sin * ax.z - cos * ax.x;
    mz = cos * ax.z + sin * ax.x;
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    S.heading = Math.atan2(mx, mz);
  }
  const moving = !!(ax.z || ax.x);
  let nx = player.position.x + mx * speed * dt;
  let nz = player.position.z + mz * speed * dt;
  const res = world.collideCircle(nx, nz, PLAYER.radius);
  player.position.x = clamp(res.x, -225, 225);
  player.position.z = clamp(res.z, -225, 225);
  // jump + gravity
  if (input.down('Space') && S.grounded) { S.vy = PLAYER.jumpSpeed; S.grounded = false; }
  S.vy -= 22 * dt;
  player.position.y += S.vy * dt;
  if (player.position.y <= 0) { player.position.y = 0; S.vy = 0; S.grounded = true; }
  // animate
  if (moving) {
    walkPhase += dt * speed * 1.6;
    player.userData.legs.rotation.x = Math.sin(walkPhase) * 0.6;
    player.userData.body.position.y = 1.15 + Math.abs(Math.sin(walkPhase)) * 0.07;
  } else {
    player.userData.legs.rotation.x *= 0.8;
  }
  player.rotation.y = S.heading;
  // car collisions with player (traffic knocks the player)
  for (const c of allCars()) {
    if (c.driver === 'player') continue;
    if (Math.abs(c.speed) < 1) continue;
    const d2 = dist2(c.pos.x, c.pos.z, player.position.x, player.position.z);
    if (d2 < 4.5) {
      S.health -= 30 * dt;
      hud.toast('You got hit by a car!');
      player.position.x += (player.position.x - c.pos.x) * 0.2;
      player.position.z += (player.position.z - c.pos.z) * 0.2;
      if (S.health <= 0) { S.health = 0; endGame('wasted'); }
    }
  }
}

function updateDriving(dt) {
  const car = S.inCar;
  const ax = input.axis();
  const look = input.consumeLook();
  S.camYaw += look.yaw;
  S.camPitch = clamp(S.camPitch + look.pitch, -0.1, 0.7);
  const throttle = ax.z;
  const steer = -ax.x;
  car.update(dt, throttle, steer);
  const res = world.collideCircle(car.pos.x, car.pos.z, 1.8);
  if (res.hit && Math.abs(car.speed) > 8) {
    sound.crash();
    S.health -= 4;
    car.speed *= 0.45;
    if (S.health <= 0) { S.health = 0; endGame('wasted'); }
  }
  car.pos.x = res.x; car.pos.z = res.z;
  // run over pedestrians
  for (const p of peds) {
    if (!p.mesh.visible) continue;
    if (dist2(car.pos.x, car.pos.z, p.mesh.position.x, p.mesh.position.z) < 5 && Math.abs(car.speed) > 4) {
      p.health = 0; p.mesh.visible = false;
      setTimeout(() => { p.mesh.visible = true; p.health = 50; p.mesh.position.set(rand(-180, 180), 0, rand(-180, 180)); }, 8000);
      S.pedsHit++;
      addWanted(1);
      hud.toast('You ran someone over! Wanted level up.');
    }
  }
  sound.engine(Math.abs(car.speed) / car.def.maxSpeed, true);
  // camera follows car heading when not looking around recently
  S.camYaw += (car.heading - S.camYaw) * 0.0; // free camera; player steers with mouse
}

function updatePolice(dt) {
  policeSpawnTimer -= dt;
  const want = Math.min(S.wanted, 4);
  if (policeCars.length < want && policeSpawnTimer <= 0) {
    spawnPolice();
    policeSpawnTimer = 2.5;
  }
  if (S.wanted === 0) {
    for (const pc of [...policeCars]) {
      // give up and drive off
      pc.update(dt, 0.4, 0);
      if (Math.hypot(pc.pos.x - player.position.x, pc.pos.z - player.position.z) > 160) removePolice(pc);
    }
    return;
  }
  const target = S.inCar ? S.inCar.pos : player.position;
  for (const pc of [...policeCars]) {
    const dx = target.x - pc.pos.x, dz = target.z - pc.pos.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - pc.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 1.4, -1, 1);
    const throttle = d > 6 ? 1 : 0.4;
    pc.update(dt, throttle, steer);
    const res = world.collideCircle(pc.pos.x, pc.pos.z, 1.8);
    pc.pos.x = res.x; pc.pos.z = res.z;
    if (res.hit) pc.speed *= 0.5;
    // ram damage
    if (d < 3.2) {
      if (S.inCar) {
        S.health -= 30 * dt;
        S.inCar.speed *= 0.94;
        if (Math.random() < 0.02) sound.crash();
      } else {
        S.bustedTimer += dt;
        if (S.bustedTimer > 2) { S.bustedTimer = 0; endGame('busted'); return; }
      }
      if (S.health <= 0) { S.health = 0; endGame('wasted'); return; }
    } else if (!S.inCar) S.bustedTimer = Math.max(0, S.bustedTimer - dt);
  }
  sound.siren(S.wanted > 0);
}

function updateWantedDecay(dt) {
  if (S.wanted === 0) return;
  S.crimeCooldown = Math.max(0, S.crimeCooldown - dt);
  S.wantedTimer += dt;
  const nearestCop = policeCars.reduce((m, c) => Math.min(m, Math.hypot(c.pos.x - player.position.x, c.pos.z - player.position.z)), 999);
  if (S.wantedTimer > 25 && nearestCop > 70) {
    S.wantedTimer = 0;
    setWanted(S.wanted - 1);
    hud.toast(S.wanted === 0 ? 'You lost the cops. Clean — for now.' : `Wanted level dropped to ${S.wanted}.`);
  }
}

function updatePickups(dt, t) {
  for (const m of pickupMeshes) {
    if (m.userData.taken) continue;
    m.rotation.y += dt * 2;
    m.position.y = 1.2 + Math.sin(t * 3 + m.position.x) * 0.2;
    const p = S.inCar ? S.inCar.pos : player.position;
    if (dist2(m.position.x, m.position.z, p.x, p.z) < 6) {
      m.userData.taken = true; m.visible = false;
      if (m.userData.kind === 'cash') { S.money += m.userData.amount; hud.toast(`Found $${m.userData.amount} stashed cash!`); }
      else { S.health = Math.min(PLAYER.maxHealth, S.health + m.userData.amount); hud.toast(`Health +${m.userData.amount}`); }
      sound.pickup();
    }
  }
}

function updateCamera(dt) {
  const target = S.inCar ? S.inCar.pos : player.position;
  const dist = (S.inCar ? 12 : 9) + (S.camDistBoost || 0);
  const h = (S.inCar ? 4.6 : 4.2) + (S.camDistBoost || 0) * 0.3;
  // Slight lateral offset so street furniture on the road centreline
  // (lamp posts) never sits dead-centre between camera and player.
  const lat = 2.2;
  const cx = target.x - Math.sin(S.camYaw) * Math.cos(S.camPitch) * dist - Math.cos(S.camYaw) * lat;
  const cz = target.z - Math.cos(S.camYaw) * Math.cos(S.camPitch) * dist + Math.sin(S.camYaw) * lat;
  const cy = target.y + h + Math.sin(S.camPitch) * dist * 0.6;
  if (S.camSnap) {
    // Screenshot / spawn: place the camera exactly, no slow lerp.
    camera.position.set(cx, Math.max(cy, 1.6), cz);
    S.camSnap = false;
  } else {
    camera.position.lerp(new THREE.Vector3(cx, Math.max(cy, 1.6), cz), 1 - Math.pow(0.001, dt));
  }
  camera.lookAt(target.x, target.y + (S.inCar ? 1.6 : 1.8), target.z);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (S.mode === 'play') {
    S.playTime += dt;
    saveTimer += dt;
    if (saveTimer > 30) { saveTimer = 0; saveGame(); }
    if (input.consumeClick()) shoot();
    if (S.inCar) updateDriving(dt);
    else updatePlayer(dt);
    // traffic + peds always move (city feels alive)
    traffic.update(dt, S.inCar ? S.inCar.pos : player.position);
    for (const p of peds) {
      const danger = S.inCar && Math.abs(S.inCar.speed) > 6 ? S.inCar.pos : null;
      p.update(dt, danger);
    }
    updatePolice(dt);
    updateWantedDecay(dt);
    updatePickups(dt, t);
    // mission
    const ev = missions.update(dt, {
      playerPos: S.inCar ? S.inCar.pos : player.position,
      inCar: !!S.inCar,
      wanted: S.wanted,
      setWanted,
      addMoney: (n) => { S.money += n; },
      toast: (m) => hud.toast(m),
      sound,
    });
    if (ev === 'storyDone') {
      S.money += 0;
      $('winText').textContent = `All three jobs done. Marlo Vane is paid off, Lena's crew is yours, and Solmar Bay is wide open. You earned $${S.money.toLocaleString('en-US')} — keep playing in free roam.`;
      show('winScreen');
      S.mode = 'win';
    } else if (ev === 'missionDone') {
      hud.toast('Job complete! Press M for the next job.', 4000);
    }
    // slow health regen when calm
    if (S.wanted === 0 && S.health < PLAYER.maxHealth) S.health = Math.min(PLAYER.maxHealth, S.health + dt * 1.5);
    // HUD
    const step = missions.stepDef();
    hud.update(dt, {
      money: S.money, health: S.health, wanted: S.wanted,
      inCar: !!S.inCar, carName: S.inCar ? S.inCar.def.name : '',
      speedMph: S.inCar ? S.inCar.speed * 2.237 : 0,
      mission: missions.objectiveText(),
      playerPos: S.inCar ? S.inCar.pos : player.position,
      heading: S.inCar ? S.inCar.heading : S.heading,
      cars: [...parkedCars, ...traffic.cars],
      police: policeCars,
      objectivePos: step ? step.pos : null,
    });
    updateCamera(dt);
  } else if (S.mode === 'title') {
    // slow cinematic orbit over the city behind the title screen
    const a = t * 0.03;
    camera.position.set(Math.sin(a) * 180, 70, Math.cos(a) * 180);
    camera.lookAt(0, 0, 0);
    traffic.update(dt, null);
    for (const p of peds) p.update(dt, null);
  }
  renderer.render(scene, camera);
}
animate();
