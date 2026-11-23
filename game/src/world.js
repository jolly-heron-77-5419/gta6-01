// SOLMAR BAY — the city itself.
// One job: build every static mesh of the coastal city (streets, blocks,
// buildings, palms, lamps, beach, sea, sky) and answer collision and
// placement questions for the rest of the game. Nothing here moves the
// player or runs the story; it only describes the place.

import * as THREE from 'three';
import { CFG, makeRng, pick } from './config.js';

// Street centre lines, in world units, on both axes.
export const STREET_LINES = [-120, -80, -40, 0, 40, 80, 120];

// Mission clearings: blocks kept free of buildings so the story has room.
const PLAZA = { minX: 2, maxX: 38, minZ: 2, maxZ: 38 };       // Lena's corner
const MARINA_LOT = { minX: 128, maxX: 156, minZ: -78, maxZ: -42 }; // parked cars
const PIER = { minX: 42, maxX: 78, minZ: -168, maxZ: -138 }; // boardwalk pickup

function inRect(x, z, r) {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

// A canvas texture of lit windows, tinted per building by material colour.
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  // A pale wall base: the material colour multiplies this texture, so
  // the base must stay light or every building turns out dark.
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 64, 128);
  const rng = makeRng(77);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      g.fillStyle = rng() < 0.55 ? '#ffd98a' : '#5a7d94';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    map: opts.map || null,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 1,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  return m;
}

function palmTree(x, z, rng) {
  const g = new THREE.Group();
  const h = 4.5 + rng() * 2;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, h, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b46 })
  );
  trunk.position.y = h / 2;
  trunk.rotation.z = (rng() - 0.5) * 0.16;
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.9, h + 0.3, Math.sin(a) * 0.9);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    leaf.castShadow = true;
    g.add(leaf);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4f2a })
  );
  nut.position.y = h + 0.1;
  g.add(nut);
  g.position.set(x, 0, z);
  return g;
}

function streetLamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c313a })
  );
  pole.position.y = 2.6;
  pole.castShadow = true;
  g.add(pole);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({
      color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.9,
    })
  );
  head.position.y = 5.3;
  g.add(head);
  g.position.set(x, 0, z);
  return g;
}

// Build the whole city into `scene`. Returns the handles the game loop
// and the other systems need: colliders, road queries, animated bits.
export function buildCity(scene) {
  const rng = makeRng(20261123);
  const colliders = [];
  const animated = { clouds: [], sea: null };

  scene.background = new THREE.Color(CFG.palette.skyHorizon);
  scene.fog = new THREE.Fog(0xf2d7a8, 180, 520);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0c0, 1.9);
  sun.position.set(90, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 420;
  scene.add(sun);

  // Warm afternoon sun disc and drifting clouds.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(14, 24),
    new THREE.MeshBasicMaterial({ color: CFG.palette.sun, fog: false })
  );
  sunDisc.position.set(260, 190, -260);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(4 + rng() * 5, 10, 8), mat);
      s.position.set(p * 6 - puffs * 3, rng() * 1.5, rng() * 3);
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(-260 + rng() * 520, 70 + rng() * 45, -280 + rng() * 420);
    scene.add(cloud);
    animated.clouds.push(cloud);
  }

  // Ground: grass base, then roads, sidewalks, sand and sea on top.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: CFG.palette.grass })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: CFG.palette.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: CFG.palette.sidewalk });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  for (const line of STREET_LINES) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(340, CFG.city.streetHalfWidth * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? 0 : Math.PI / 2;
      road.position.set(horizontal ? 0 : line, 0.02, horizontal ? line : 0);
      road.receiveShadow = true;
      scene.add(road);
      // Sidewalks flank both sides of every road.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(340, 2.4), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = horizontal ? 0 : Math.PI / 2;
        walk.position.set(
          horizontal ? 0 : line + side * (CFG.city.streetHalfWidth + 1.4),
          0.04,
          horizontal ? line + side * (CFG.city.streetHalfWidth + 1.4) : 0
        );
        walk.receiveShadow = true;
        scene.add(walk);
      }
      // Dashed centre line.
      for (let d = -160; d <= 160; d += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.28), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = horizontal ? 0 : Math.PI / 2;
        dash.position.set(horizontal ? d : line, 0.05, horizontal ? line : d);
        scene.add(dash);
      }
    }
  }

  // Beach sand and the sea, east of the city.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 340),
    new THREE.MeshLambertMaterial({ color: CFG.palette.sand })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CFG.city.beachStartX + 15, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 560),
    new THREE.MeshLambertMaterial({ color: CFG.palette.sea, transparent: true, opacity: 0.94 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CFG.city.seaStartX + 130, 0.02, 0);
  scene.add(sea);
  animated.sea = sea;

  // Boardwalk pier at the north edge, where job one waits.
  const pier = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 26),
    new THREE.MeshLambertMaterial({ color: 0xb08a5e })
  );
  pier.rotation.x = -Math.PI / 2;
  pier.position.set(60, 0.06, -153);
  pier.receiveShadow = true;
  scene.add(pier);

  // Buildings: one or two per block, varied heights and warm colours,
  // skipping the plaza, the marina lot and the pier.
  const windowTex = makeWindowTexture();
  const wallColors = [0xe8b48a, 0xd9a0a0, 0xa8c8d8, 0xf0d9a0, 0xc8b8d8, 0x9fc8a8, 0xe0e0d8];
  const blockEdges = [-140, ...STREET_LINES, 140];
  for (let bi = 0; bi < blockEdges.length - 1; bi++) {
    for (let bj = 0; bj < blockEdges.length - 1; bj++) {
      const x0 = blockEdges[bi] + 7, x1 = blockEdges[bi + 1] - 7;
      const z0 = blockEdges[bj] + 7, z1 = blockEdges[bj + 1] - 7;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (x0 >= CFG.city.beachStartX - 6) continue;
      if (inRect(cx, cz, PLAZA) || inRect(cx, cz, MARINA_LOT) || inRect(cx, cz, PIER)) continue;
      const lots = rng() < 0.45 ? 1 : 2;
      for (let l = 0; l < lots; l++) {
        const w = 12 + rng() * 12, d = 12 + rng() * 12;
        const h = 7 + rng() * rng() * 30;
        const bx = lots === 1 ? cx : x0 + w / 2 + (x1 - x0 - w) * (l / (lots - 1 || 1)) * 0.9;
        const bz = lots === 1 ? cz : cz + (rng() - 0.5) * 6;
        const color = pick(rng, wallColors);
        const b = box(w, h, d, color, bx, h / 2, bz, { map: windowTex });
        scene.add(b);
        // Flat roof cap in a darker tone.
        const cap = box(w + 0.6, 0.5, d + 0.6, 0x555049, bx, h + 0.25, bz, { shadow: false });
        scene.add(cap);
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      }
    }
  }

  // Palms along the beach and the plaza, lamps at intersections.
  for (let z = -150; z <= 150; z += 18) {
    scene.add(palmTree(CFG.city.beachStartX - 4 + rng() * 3, z + rng() * 6, rng));
  }
  for (let i = 0; i < 8; i++) {
    scene.add(palmTree(6 + rng() * 28, 6 + rng() * 28, rng));
  }
  for (const lx of STREET_LINES) {
    for (const lz of STREET_LINES) {
      if ((lx + lz) % 80 === 0) scene.add(streetLamp(lx + 7, lz + 7));
    }
  }

  // A few benches and a fountain in Lena's plaza.
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.4, 1, 16),
    new THREE.MeshLambertMaterial({ color: 0x7fb8d8 })
  );
  fountain.position.set(20, 0.5, 20);
  fountain.castShadow = true;
  scene.add(fountain);

  return {
    colliders,
    update(dt, elapsed) {
      for (const c of animated.clouds) {
        c.position.x += dt * 1.6;
        if (c.position.x > 300) c.position.x = -300;
      }
      if (animated.sea) animated.sea.position.y = 0.02 + Math.sin(elapsed * 0.7) * 0.12;
    },
  };
}

// True when (x, z) lies on a road surface.
export function isOnRoad(x, z) {
  for (const line of STREET_LINES) {
    if (Math.abs(x - line) <= CFG.city.streetHalfWidth) return true;
    if (Math.abs(z - line) <= CFG.city.streetHalfWidth) return true;
  }
  return false;
}

// Nearest point on any street centre line (used to drop traffic on roads).
export function nearestRoadPoint(x, z) {
  let best = null, bestD = Infinity;
  for (const line of STREET_LINES) {
    const cand = [
      { x: line, z },
      { x, z: line },
    ];
    for (const c of cand) {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

// Push a circle (x, z, radius) out of every building it overlaps.
// Returns true when a push happened.
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        pos.x = c.maxX + radius;
      }
    }
  }
  const half = CFG.city.halfSize;
  pos.x = Math.max(-half, Math.min(half + 24, pos.x));
  pos.z = Math.max(-half, Math.min(half, pos.z));
  return hit;
}
