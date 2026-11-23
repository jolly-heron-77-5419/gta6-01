// Everyone who moves in Solmar Bay: the player on foot, the cars (traffic,
// parked, police), the pedestrians and the warehouse guards. Meshes are
// built from boxes and cylinders here; the brains live in the update
// functions below, and the main loop drives them.

import * as THREE from 'three';
import { CITY, DRIVE, HEALTH, PALETTE, TRAFFIC } from './config.js';
import { resolveCircle } from './world.js';

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// --- Meshes ---------------------------------------------------------------

export function makePlayerMesh(shirtColor) {
  const group = new THREE.Group();
  const legL = box(0.32, 0.8, 0.32, 0x2c3e50, -0.2, 0.4, 0);
  const legR = box(0.32, 0.8, 0.32, 0x2c3e50, 0.2, 0.4, 0);
  const torso = box(0.85, 0.85, 0.45, shirtColor, 0, 1.2, 0);
  const armL = box(0.22, 0.7, 0.22, shirtColor, -0.55, 1.2, 0);
  const armR = box(0.22, 0.7, 0.22, shirtColor, 0.55, 1.2, 0);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8b98d }),
  );
  head.position.set(0, 1.9, 0);
  const cap = box(0.62, 0.16, 0.62, 0xc0392b, 0, 2.12, 0);
  group.add(legL, legR, torso, armL, armR, head, cap);
  return { group, legL, legR, armL, armR };
}

export function makeCarMesh(color, police) {
  const group = new THREE.Group();
  const body = box(2.0, 0.62, 4.4, police ? 0xf2f2f2 : color, 0, 0.55, 0);
  const cabin = box(1.7, 0.55, 2.1, 0x1e2a36, 0, 1.1, -0.25);
  const stripe = police ? box(2.02, 0.2, 4.42, 0x14181f, 0, 0.62, 0) : null;
  group.add(body, cabin);
  if (stripe) group.add(stripe);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const headL = box(0.3, 0.14, 0.08, 0xfff6c8, -0.6, 0.62, 2.22);
  const headR = box(0.3, 0.14, 0.08, 0xfff6c8, 0.6, 0.62, 2.22);
  headL.material = lightMat;
  headR.material = lightMat;
  group.add(headL, headR);
  let lightBar = null;
  let lightRed = null;
  let lightBlue = null;
  if (police) {
    lightBar = box(1.2, 0.18, 0.5, 0x222222, 0, 1.45, -0.25);
    lightRed = box(0.5, 0.2, 0.52, 0xff2222, -0.3, 1.45, -0.25);
    lightBlue = box(0.5, 0.2, 0.52, 0x2266ff, 0.3, 1.45, -0.25);
    lightRed.material = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    lightBlue.material = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    group.add(lightBar, lightRed, lightBlue);
  }
  return { group, wheels, lightRed, lightBlue };
}

// --- The player on foot ---------------------------------------------------

export function createPlayer(scene, x, z) {
  const parts = makePlayerMesh(0x2e6fb0);
  scene.add(parts.group);
  const player = {
    parts,
    pos: new THREE.Vector3(x, 0, z),
    heading: Math.PI,
    speed: 0,
    walkPhase: 0,
    health: HEALTH.player,
    moving: false,
    update(dt, moveX, moveZ, running, colliders) {
      const len = Math.hypot(moveX, moveZ);
      this.moving = len > 0.01;
      const targetSpeed = this.moving ? (running ? 11 : 7) : 0;
      this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 8);
      if (this.moving) {
        const nx = moveX / len;
        const nz = moveZ / len;
        const targetHeading = Math.atan2(nx, nz);
        let diff = targetHeading - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, dt * 12);
        this.pos.x += nx * this.speed * dt;
        this.pos.z += nz * this.speed * dt;
        this.walkPhase += dt * this.speed * 1.6;
        resolveCircle(colliders, this.pos, 0.9);
        this.pos.x = Math.max(CITY.sandWest + 1, Math.min(CITY.half + 4, this.pos.x));
        this.pos.z = Math.max(-CITY.half - 4, Math.min(CITY.half + 4, this.pos.z));
      }
      const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
      parts.armL.rotation.x = -swing * 0.7;
      parts.armR.rotation.x = swing * 0.7;
      parts.group.position.copy(this.pos);
      parts.group.rotation.y = this.heading;
    },
  };
  return player;
}

// --- Cars ------------------------------------------------------------------

export function createCar(scene, x, z, heading, color, options = {}) {
  const mesh = makeCarMesh(color, !!options.police);
  scene.add(mesh.group);
  const car = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    health: HEALTH.carHealth,
    police: !!options.police,
    parked: !!options.parked,
    traffic: !!options.traffic,
    color,
    // Arcade car step: throttle -1..1, steer -1..1, shared by the player
    // car and the police chase cars.
    drive(dt, throttle, steer, handbrake, colliders) {
      const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      if (throttle > 0) this.speed += DRIVE.accel * throttle * dt;
      else if (throttle < 0) {
        this.speed += this.speed > 0.5 ? -DRIVE.brake * dt : DRIVE.reverseAccel * throttle * dt;
      } else {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
      }
      if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
      const topSpeed = DRIVE.maxSpeed * (this.boost || 1);
      this.speed = Math.max(-DRIVE.maxReverse, Math.min(topSpeed, this.speed));
      const steerFactor = this.speed >= 0 ? 1 : -1;
      this.heading += steer * DRIVE.steer * (Math.abs(this.speed) / topSpeed) * steerFactor * dt * 1.6;
      const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.pos.addScaledVector(fwd, this.speed * dt);
      if (colliders) {
        resolveCircle(colliders, this.pos, DRIVE.radius);
        this.pos.x = Math.max(CITY.sandWest + 1, Math.min(CITY.half + 4, this.pos.x));
        this.pos.z = Math.max(-CITY.half - 4, Math.min(CITY.half + 4, this.pos.z));
      }
      mesh.group.position.copy(this.pos);
      mesh.group.rotation.y = this.heading;
      for (const wheel of mesh.wheels) wheel.rotation.x += (this.speed * dt) / 0.36;
      if (this.police && mesh.lightRed && mesh.lightBlue) {
        const flash = Math.floor(performance.now() / 260) % 2 === 0;
        mesh.lightRed.material.color.setHex(flash ? 0xff2222 : 0x551111);
        mesh.lightBlue.material.color.setHex(flash ? 0x113366 : 0x2266ff);
      }
    },
    setPose(x, z, heading) {
      this.pos.set(x, 0, z);
      this.heading = heading;
      mesh.group.position.copy(this.pos);
      mesh.group.rotation.y = heading;
    },
  };
  car.setPose(x, z, heading);
  return car;
}

// --- Traffic: cars that drive the street grid ------------------------------

export function createTrafficCar(scene, rng, color) {
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const street = rng.pick(CITY.streets);
  const dir = rng.chance(0.5) ? 1 : -1;
  const along = rng.range(-CITY.half, CITY.half);
  const car = createCar(
    scene,
    axis === 'x' ? along : street - dir * 3.5,
    axis === 'x' ? street + dir * 3.5 : along,
    axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    color,
    { traffic: true },
  );
  car.axis = axis;
  car.street = street;
  car.dir = dir;
  car.speed = TRAFFIC.speed * rng.range(0.8, 1.1);
  car.wait = 0;

  car.update = function update(dt, colliders, others, playerCar) {
    // The car ahead (traffic or the player) sets our speed.
    let blocked = false;
    const ahead = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const check = (other, radius) => {
      if (other === this) return;
      const dx = other.pos.x - this.pos.x;
      const dz = other.pos.z - this.pos.z;
      const forward = dx * ahead.x + dz * ahead.z;
      const side = Math.abs(dx * ahead.z - dz * ahead.x);
      if (forward > 0 && forward < TRAFFIC.minGap && side < radius) blocked = true;
    };
    for (const other of others) check(other, 3);
    if (playerCar) check(playerCar, 3.4);
    const targetSpeed = blocked ? 0 : TRAFFIC.speed;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 2);
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);
    // At an intersection, sometimes turn onto the crossing street.
    const onStreet = this.axis === 'x' ? this.pos.x : this.pos.z;
    const cross = CITY.streets.find((s) => Math.abs(onStreet - s) < 1.2);
    if (cross !== undefined && this.speed > 1 && rng.chance(dt * 0.25)) {
      const newAxis = this.axis === 'x' ? 'z' : 'x';
      const newDir = rng.chance(0.5) ? 1 : -1;
      this.axis = newAxis;
      this.street = cross;
      this.dir = newDir;
      this.heading = newAxis === 'x'
        ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (newDir > 0 ? 0 : Math.PI);
    }
    // Past the city edge: wrap around to the far side.
    if (this.axis === 'x' && Math.abs(this.pos.x) > CITY.half + 4) this.pos.x = -Math.sign(this.pos.x) * (CITY.half + 4);
    if (this.axis === 'z' && Math.abs(this.pos.z) > CITY.half + 4) this.pos.z = -Math.sign(this.pos.z) * (CITY.half + 4);
    this.mesh.group.position.copy(this.pos);
    this.mesh.group.rotation.y = this.heading;
    for (const wheel of this.mesh.wheels) wheel.rotation.x += (this.speed * dt) / 0.36;
  };
  return car;
}

// --- Pedestrians and guards --------------------------------------------------

export function createPedestrian(scene, rng, guard) {
  const shirt = guard ? 0x3a3a3a : rng.pick([0xd96a6a, 0x6a9ed9, 0x7fc97f, 0xe8c96a, 0xffffff, 0x9a7fd9]);
  const parts = makePlayerMesh(shirt);
  scene.add(parts.group);
  // Guards carry a small health bar over their heads.
  let healthBar = null;
  if (guard) {
    healthBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide }),
    );
    healthBar.position.set(0, 2.5, 0);
    parts.group.add(healthBar);
  }
  const street = rng.pick(CITY.streets);
  const along = rng.range(-CITY.half, CITY.half);
  const horizontal = rng.chance(0.5);
  const side = rng.chance(0.5) ? 1 : -1;
  const ped = {
    parts,
    pos: new THREE.Vector3(
      horizontal ? along : street + side * (CITY.streetWidth / 2 + 1.6),
      0,
      horizontal ? street + side * (CITY.streetWidth / 2 + 1.6) : along,
    ),
    heading: rng.range(0, Math.PI * 2),
    horizontal,
    street,
    side,
    dir: rng.chance(0.5) ? 1 : -1,
    speed: 1.6 * rng.range(0.7, 1.3),
    walkPhase: rng.range(0, 6),
    guard: !!guard,
    health: HEALTH.guard,
    down: false,
    punchCooldown: 0,
    fleeX: 0,
    fleeZ: 0,
    update(dt, playerPos, colliders) {
      if (this.down) return;
      this.punchCooldown = Math.max(0, this.punchCooldown - dt);
      let vx = 0;
      let vz = 0;
      // Step aside when the player rushes at us on the sidewalk.
      const dx = this.pos.x - playerPos.x;
      const dz = this.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (!this.guard && dist < 4 && dist > 0.01) {
        vx = (dx / dist) * 3;
        vz = (dz / dist) * 3;
      } else if (this.guard && dist < 7) {
        // A guard closes in and swings when close enough.
        vx = (dx / dist) * -2.2;
        vz = (dz / dist) * -2.2;
        if (dist < 1.8 && this.punchCooldown <= 0) {
          this.punchCooldown = 1.1;
          this.swung = true;
        }
      } else {
        if (this.horizontal) vx = this.dir * this.speed;
        else vz = this.dir * this.speed;
        // At a crossing, sometimes turn the corner.
        const along = this.horizontal ? this.pos.x : this.pos.z;
        const cross = CITY.streets.find((s) => Math.abs(along - s) < 1);
        if (cross !== undefined && rng.chance(dt * 0.2)) {
          this.horizontal = !this.horizontal;
          this.street = cross;
          this.dir = rng.chance(0.5) ? 1 : -1;
          this.side = rng.chance(0.5) ? 1 : -1;
        }
      }
      this.pos.x += vx * dt;
      this.pos.z += vz * dt;
      if (Math.abs(this.pos.x) > CITY.half + 4) this.dir *= -1;
      if (Math.abs(this.pos.z) > CITY.half + 4) this.dir *= -1;
      if (vx !== 0 || vz !== 0) {
        const target = Math.atan2(vx, vz);
        let diff = target - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, dt * 10);
        this.walkPhase += dt * 7;
      }
      resolveCircle(colliders, this.pos, 0.8);
      if (healthBar) {
        const frac = Math.max(0, this.health / HEALTH.guard);
        healthBar.scale.x = frac;
        healthBar.material.color.setHex(frac > 0.5 ? 0x44cc44 : 0xff4444);
      }
      const swing = Math.sin(this.walkPhase) * 0.5;
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
      parts.armL.rotation.x = -swing * 0.6;
      parts.armR.rotation.x = swing * 0.6;
      parts.group.position.copy(this.pos);
      parts.group.rotation.y = this.heading;
    },
    knockDown() {
      this.down = true;
      this.parts.group.rotation.x = -Math.PI / 2;
      this.parts.group.position.y = 0.35;
    },
  };
  ped.parts.group.position.copy(ped.pos);
  return ped;
}
