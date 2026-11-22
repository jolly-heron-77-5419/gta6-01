// entities.js — the player character, pedestrians, drivable cars, traffic AI
// and police pursuit. All meshes are built from primitives; no external art.
// Traffic cars loop the road grid and turn at the city edge onto the next road.

import * as THREE from 'three';
import { CAR_DEFS, POLICE_COLOR, PLAYER, WORLD, clamp, dist2, nearestRoadLine, rand, randi, wrapAngle } from './config.js';

function makePersonMesh(shirt, pants, skin = 0xd9a06b) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), mat(pants));
  legs.position.y = 0.4; g.add(legs);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), mat(shirt));
  body.position.y = 1.15; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat(skin));
  head.position.y = 1.78; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12), mat(0x222831));
  cap.position.y = 1.98; g.add(cap);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.body = body; g.userData.legs = legs;
  return g;
}

export function makePlayerMesh() {
  // Danny Reyes: teal jacket, dark jeans, cap.
  return makePersonMesh(0x1f8a70, 0x2a3242, 0xc98d5f);
}

export function makeCarMesh(def, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? POLICE_COLOR : def.color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: police ? 0xe8e8e8 : 0x1a2733 }));
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
  g.userData.wheels = [];
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z);
    g.add(w); g.userData.wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.1), lightMat);
    l.position.set(x, 0.62, 2.21); g.add(l);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.45, -0.2); g.add(bar);
    g.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62; g.add(stripe);
  }
  return g;
}

export class Car {
  constructor(scene, def, x, z, heading, police = false) {
    this.def = def; this.police = police;
    this.mesh = makeCarMesh(def, police);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.parked = !police;
    this.health = 100;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.wheelSpin = 0;
  }
  get pos() { return this.mesh.position; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  update(dt, throttle, steer) {
    const def = this.def;
    const target = throttle * def.maxSpeed;
    const accel = throttle !== 0 ? def.accel : 18;
    this.speed += clamp(target - this.speed, -accel * dt, accel * dt);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.heading += steer * clamp(this.speed / def.maxSpeed, -1, 1) * 1.9 * dt * (this.speed >= 0 ? 1 : -1);
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += this.speed * dt * 2.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x = this.wheelSpin;
    if (this.mesh.userData.lightBar) {
      this.mesh.userData.lightBar.material.color.setHex(
        (Math.floor(performance.now() / 300) % 2 === 0) ? 0xff2222 : 0x2266ff);
    }
  }
}

export class Pedestrian {
  constructor(scene, world) {
    const palette = [0xd94f4f, 0x4f7fd9, 0x7fd94f, 0xd9c94f, 0xb06fd9, 0x4fd9c9];
    this.mesh = makePersonMesh(palette[randi(0, palette.length - 1)], 0x333a44);
    this.mesh.position.set(rand(-180, 180), 0, rand(-180, 180));
    scene.add(this.mesh);
    this.world = world;
    this.speed = rand(1.2, 2.2);
    this.cruiseSpeed = this.speed; // walking pace to return to after fleeing
    this.heading = rand(0, Math.PI * 2);
    this.fleeing = 0;
    this.health = 50;
    this.walkPhase = rand(0, 6);
    this.retarget = 0;
  }
  update(dt, danger) {
    this.retarget -= dt;
    if (danger) this.fleeing = 2.5;
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      this.heading = Math.atan2(this.mesh.position.x - danger.x, this.mesh.position.z - danger.z);
      this.speed = 5;
    } else {
      this.speed = this.cruiseSpeed;
      if (this.retarget <= 0) {
        this.retarget = rand(3, 8);
        this.heading = rand(0, Math.PI * 2);
      }
    }
    const nx = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    const res = this.world.collideCircle(nx, nz, 0.5);
    this.mesh.position.x = res.x; this.mesh.position.z = res.z;
    if (res.hit) this.heading += Math.PI / 2;
    if (!this.world.inBounds(this.mesh.position.x, this.mesh.position.z, 6)) {
      this.heading += Math.PI;
    }
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * this.speed * 3;
    this.mesh.userData.legs.rotation.x = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.body.position.y = 1.15 + Math.abs(Math.sin(this.walkPhase)) * 0.06;
  }
}

// Traffic: cars looping around city blocks on the road grid.
export class Traffic {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.cars = [];
    const lines = world.roadLines;
    for (let i = 0; i < 10; i++) {
      const def = CAR_DEFS[randi(0, CAR_DEFS.length - 1)];
      // pick a road line and a start point on it
      const horizontal = Math.random() < 0.5;
      const line = lines[randi(1, lines.length - 2)];
      const along = rand(-170, 170);
      const car = new Car(scene, def, horizontal ? along : line, horizontal ? line : along,
        horizontal ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI));
      car.driver = 'traffic'; car.parked = false;
      // dir is the travel direction along the current road: for a horizontal
      // road it is the X sign (heading PI/2 -> +X), for a vertical road the
      // Z sign (heading 0 -> +Z). It is derived from the starting heading,
      // not rolled again, so the car never starts out driving backwards.
      const dir = horizontal
        ? (car.heading === Math.PI / 2 ? 1 : -1)
        : (car.heading === 0 ? 1 : -1);
      car.loop = { horizontal, line, dir };
      this.cars.push(car);
    }
  }
  update(dt, playerPos) {
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue;
      // follow its road line, turn at the city edge onto the next line
      const p = car.pos;
      let throttle = 0.55, steer = 0;
      const edge = 185;
      if (car.loop.horizontal) {
        const targetZ = car.loop.line;
        steer = clamp((targetZ - p.z) * 0.1, -1, 1) * (car.loop.dir > 0 ? 1 : -1);
        // keep heading roughly east/west
        const want = car.loop.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const dh = wrapAngle(want - car.heading);
        car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
        if (p.x > edge || p.x < -edge) {
          car.loop.horizontal = false;
          // Turn onto the nearest real road line (not p.z +/- 52, which can
          // land between roads once the car has drifted off its line) and
          // head back into town: south edge -> north, north edge -> south.
          car.loop.line = nearestRoadLine(p.z);
          car.loop.dir = p.z > 0 ? -1 : 1;
          car.heading = p.z > 0 ? Math.PI : 0;
        }
      } else {
        // Vertical road: heading follows the stored travel direction, so a
        // car never flips around just because it crossed the z = 0 line.
        const want = car.loop.dir > 0 ? 0 : Math.PI;
        const dh = wrapAngle(want - car.heading);
        car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
        if (p.z > edge || p.z < -edge) {
          car.loop.horizontal = true;
          car.loop.dir = Math.random() < 0.5 ? 1 : -1;
          car.loop.line = nearestRoadLine(p.x);
          car.heading = car.loop.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      // slow down if the player is right ahead
      if (playerPos && dist2(p.x, p.z, playerPos.x, playerPos.z) < 100) throttle = 0.3;
      car.update(dt, throttle, steer * 0.3);
      const res = this.world.collideCircle(p.x, p.z, 1.6);
      p.x = res.x; p.z = res.z;
      if (res.hit) car.speed *= 0.4;
    }
  }
}
