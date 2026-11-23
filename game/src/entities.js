// SOLMAR BAY — everything that moves: the player on foot, traffic cars,
// pedestrians and police cars.
// One job: build the meshes and step the simple steering, walking and
// chasing behaviours. The story and the wanted level live elsewhere;
// this file only makes bodies move and collide.

import * as THREE from 'three';
import { CFG, angleDelta, clamp, makeRng, pick } from './config.js';
import { STREET_LINES, isOnRoad, nearestRoadPoint, resolveCollisions } from './world.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb0, 0xe8e8e8, 0x2c2c34, 0xd8a020, 0x4a9e6a, 0x8a5fb0, 0xd07030];
const JACKET_COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22];

// A low-poly car: body, cabin, four wheels, head and tail lights.
export function makeCarMesh(color, sporty) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const bodyLen = sporty ? 4.4 : 4.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, bodyLen), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, sporty ? 1.9 : 2.1), glassMat);
  cabin.position.set(0, 1.1, sporty ? -0.2 : -0.1);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  for (const lx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat);
    head.position.set(lx, 0.62, bodyLen / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xaa2020, emissive: 0x881111, emissiveIntensity: 0.6 })
    );
    tail.position.set(lx, 0.62, -bodyLen / 2 - 0.02);
    group.add(tail);
  }
  return { group, wheels, bodyLen };
}

// The player on foot: a simple figure with a jacket, head and legs that
// swing while walking.
export function createPlayer(scene, x, z) {
  const group = new THREE.Group();
  const jacket = pick(makeRng(5), JACKET_COLORS);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.72, 0.36),
    new THREE.MeshLambertMaterial({ color: jacket })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xd9a077 })
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: 0x2c2118 })
  );
  hair.position.y = 1.66;
  group.add(hair);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2e3a4a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.24), legMat);
  legL.position.set(-0.16, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    mesh: group,
    legL,
    legR,
    pos: group.position,
    heading: 0,
    speed: 0,
    health: CFG.player.maxHealth,
    walkPhase: 0,
  };
}

// A pedestrian strolling a sidewalk, stepping aside when the player
// barges through.
export function createPedestrian(scene, rng) {
  const group = new THREE.Group();
  const jacket = pick(rng, JACKET_COLORS);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.68, 0.34),
    new THREE.MeshLambertMaterial({ color: jacket })
  );
  torso.position.y = 1.0;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshLambertMaterial({ color: pick(rng, [0xd9a077, 0x8a5a3a, 0xe8c39a]) })
  );
  head.position.y = 1.55;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), legMat);
  legL.position.set(-0.15, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legL, legR);

  // Start on a sidewalk beside a random street, walking along it.
  const line = pick(rng, STREET_LINES);
  const along = -140 + rng() * 280;
  const side = rng() < 0.5 ? -1 : 1;
  const horizontal = rng() < 0.5;
  const startX = horizontal ? along : line + side * (CFG.city.streetHalfWidth + 1.4);
  const startZ = horizontal ? line + side * (CFG.city.streetHalfWidth + 1.4) : along;
  group.position.set(startX, 0, startZ);
  scene.add(group);
  return {
    mesh: group,
    legL,
    legR,
    pos: group.position,
    heading: horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
    speed: CFG.pedestrians.walkMin + rng() * (CFG.pedestrians.walkMax - CFG.pedestrians.walkMin),
    walkPhase: rng() * 6,
    horizontal,
    line,
    side,
    scared: 0,
  };
}

export function updatePedestrian(ped, dt, playerPos, playerSpeed) {
  // Flee sideways for a moment when the player rushes at them.
  const dx = ped.pos.x - playerPos.x;
  const dz = ped.pos.z - playerPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3.5 && playerSpeed > 3) ped.scared = 1.2;
  if (ped.scared > 0) {
    ped.scared -= dt;
    ped.pos.x += (dx / (dist || 1)) * dt * 3.2;
    ped.pos.z += (dz / (dist || 1)) * dt * 3.2;
  } else {
    // Walk forward along the street; heading already points down it.
    const step = ped.speed * dt;
    ped.pos.x += Math.sin(ped.heading) * step;
    ped.pos.z += Math.cos(ped.heading) * step;
    // Turn around at the ends of the street.
    const along = ped.horizontal ? ped.pos.x : ped.pos.z;
    if (along > 150 || along < -150) ped.heading += Math.PI;
  }
  ped.walkPhase += dt * ped.speed * 4;
  const swing = Math.sin(ped.walkPhase) * 0.5;
  ped.legL.rotation.x = swing;
  ped.legR.rotation.x = -swing;
  ped.mesh.rotation.y = ped.heading;
}

// A traffic car driving a loop around one city block, slowing for the
// car ahead and for the player when they cut in.
export function createTrafficCar(scene, rng) {
  const color = pick(rng, CAR_COLORS);
  const { group, wheels } = makeCarMesh(color, false);
  // Pick a block and loop its perimeter, one lane out from the kerb.
  const bi = Math.floor(rng() * (STREET_LINES.length - 1));
  const bj = Math.floor(rng() * (STREET_LINES.length - 1));
  const x0 = STREET_LINES[bi] + CFG.city.laneOffset;
  const x1 = STREET_LINES[bi + 1] - CFG.city.laneOffset;
  const z0 = STREET_LINES[bj] + CFG.city.laneOffset;
  const z1 = STREET_LINES[bj + 1] - CFG.city.laneOffset;
  const waypoints = [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
  const start = waypoints[Math.floor(rng() * 4)];
  group.position.set(start.x, 0, start.z);
  scene.add(group);
  return {
    mesh: group,
    wheels,
    pos: group.position,
    heading: 0,
    speed: 0,
    cruise: CFG.traffic.cruiseMin + rng() * (CFG.traffic.cruiseMax - CFG.traffic.cruiseMin),
    waypoints,
    wpIndex: 0,
    color,
    parked: false,
    damage: 0,
  };
}

export function updateTrafficCar(car, dt, others, playerCar) {
  const target = car.waypoints[car.wpIndex];
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    car.wpIndex = (car.wpIndex + 1) % car.waypoints.length;
  }
  const wantHeading = Math.atan2(dx, dz);
  car.heading += clamp(angleDelta(car.heading, wantHeading), -1.6 * dt, 1.6 * dt);
  // Slow down for whatever is directly ahead.
  let wantSpeed = car.cruise;
  const aheadX = car.pos.x + Math.sin(car.heading) * 8;
  const aheadZ = car.pos.z + Math.cos(car.heading) * 8;
  for (const other of others) {
    if (other === car) continue;
    if (Math.hypot(other.pos.x - aheadX, other.pos.z - aheadZ) < 5) { wantSpeed = 0; break; }
  }
  if (playerCar && Math.hypot(playerCar.pos.x - aheadX, playerCar.pos.z - aheadZ) < 5) wantSpeed = 0;
  car.speed += clamp(wantSpeed - car.speed, -14 * dt, 8 * dt);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.rotation.y = car.heading;
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
}

// A parked car the player can steal, or a mission target car.
export function createParkedCar(scene, x, z, heading, color, sporty) {
  const { group, wheels } = makeCarMesh(color, !!sporty);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    mesh: group,
    wheels,
    pos: group.position,
    heading,
    speed: 0,
    color,
    parked: true,
    damage: 0,
  };
}

// A police interceptor: black-and-white with a light bar, chasing the
// player and trying to ram them off the road.
export function createPoliceCar(scene, x, z) {
  const { group, wheels } = makeCarMesh(0x1c1e24, false);
  const barMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), barMat);
  bar.position.set(0, 1.45, -0.1);
  group.add(bar);
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 })
  );
  red.position.set(-0.28, 1.56, -0.1);
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 })
  );
  blue.position.set(0.28, 1.56, -0.1);
  group.add(red, blue);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.3, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  door.position.set(-1.01, 0.62, 0);
  group.add(door);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    mesh: group,
    wheels,
    pos: group.position,
    heading: 0,
    speed: 0,
    red,
    blue,
    damage: 0,
  };
}

export function updatePoliceCar(car, dt, targetPos, targetSpeed, elapsed) {
  const dx = targetPos.x - car.pos.x;
  const dz = targetPos.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  const turn = clamp(angleDelta(car.heading, wantHeading), -2.4 * dt, 2.4 * dt);
  car.heading += turn;
  // Ease off when very close so the ram lands instead of overshooting.
  const wantSpeed = dist < 6 ? CFG.police.chaseSpeed * 0.55 : CFG.police.chaseSpeed;
  car.speed += clamp(wantSpeed - car.speed, -18 * dt, 12 * dt);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.rotation.y = car.heading;
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
  // Flash the light bar.
  const phase = Math.floor(elapsed * 6) % 2 === 0;
  car.red.material.emissiveIntensity = phase ? 1.6 : 0.15;
  car.blue.material.emissiveIntensity = phase ? 0.15 : 1.6;
  return dist;
}

// Player driving physics: arcade steering with grip, handbrake slides,
// wall bumps that cost damage and shake the camera.
export function drivePlayerCar(car, input, dt, colliders, onImpact) {
  const throttle = input.moveAxis();
  const steer = input.steerAxis();
  const handbrake = input.isDown('Space');
  const forward = car.speed >= 0 ? 1 : -1;
  if (throttle > 0) car.speed += CFG.car.accel * dt;
  else if (throttle < 0) {
    car.speed += (car.speed > 0.5 ? -CFG.car.brake : -CFG.car.reverseAccel) * dt;
  } else {
    car.speed -= car.speed * 1.4 * dt;
  }
  if (handbrake) car.speed -= car.speed * 3.2 * dt;
  car.speed = clamp(car.speed, -CFG.car.maxReverse, CFG.car.maxSpeed);
  const steerAmount = steer * CFG.car.steerRate * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * forward;
  car.heading += handbrake ? steerAmount * 1.5 : steerAmount;
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const probe = { x: nx, z: nz };
  const hitWall = resolveCollisions(probe, CFG.car.radius, colliders);
  if (hitWall) {
    if (Math.abs(car.speed) > 9) {
      car.damage = Math.min(CFG.car.maxDamage, car.damage + Math.abs(car.speed) * 0.9);
      if (onImpact) onImpact(Math.abs(car.speed));
    }
    car.speed *= -0.25;
  } else {
    car.pos.x = nx;
    car.pos.z = nz;
  }
  car.mesh.rotation.y = car.heading;
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
}
