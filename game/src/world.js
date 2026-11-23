// The city of Solmar Bay: streets, blocks, buildings, palms, lamps, the
// beach and the sea, the sky and the sun. Everything is procedural —
// boxes, cylinders and canvas textures made at load time, no image files.
// buildCity returns the colliders the player and cars bump into, the
// beacon factory the missions use, and an update for the moving sea.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function makeWindowTexture(rng, base, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3542';
      ctx.fillRect(12 + col * 28, 14 + row * 30, 18, 20);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSignTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = fg;
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const animated = { sea: null, clouds: [] };

  // Warm afternoon light: a low sun from the west, a soft sky fill.
  const sun = new THREE.DirectionalLight(0xffe3b3, 3.0);
  sun.position.set(-120, 140, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ee, 0x8a7a5f, 1.4));
  scene.fog = new THREE.Fog(0xa8c8de, 260, 620);

  // Ground: one big slab, then roads and sidewalks laid on top of it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-40, 0, 0);
  scene.add(ground);

  const roadMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xd8d2c0 });
  for (const c of CITY.streets) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY.half * 2 + CITY.streetWidth, CITY.streetWidth),
        roadMaterial,
      );
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? 0 : Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.02, horizontal ? c : 0);
      scene.add(road);
      // Centre dashes down each street.
      for (let d = -CITY.half + 8; d < CITY.half; d += 16) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), dashMaterial);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = horizontal ? 0 : Math.PI / 2;
        dash.position.set(horizontal ? d : c, 0.04, horizontal ? c : d);
        scene.add(dash);
      }
    }
  }

  // Buildings: each block gets one to four stucco towers with lit windows.
  // A few blocks stay open as palm parks. The cannery warehouse gets its
  // own wide shed with a painted sign, at the mission spot.
  const textures = PALETTE.building.map((c) =>
    makeWindowTexture(rng, `#${c.toString(16).padStart(6, '0')}`, 0.35),
  );
  const blockCenters = [];
  for (let i = 0; i < CITY.streets.length - 1; i += 1) {
    blockCenters.push((CITY.streets[i] + CITY.streets[i + 1]) / 2);
  }
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      // Sidewalk slab for the block.
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(CITY.blockSize, 0.3, CITY.blockSize),
        new THREE.MeshLambertMaterial({ color: 0xb5aa9c }),
      );
      slab.position.set(bx, 0.15, bz);
      scene.add(slab);
      const isWarehouseBlock = Math.abs(bx - -145) < 1 && Math.abs(bz - -145) < 1;
      if (isWarehouseBlock) {
        const shed = new THREE.Mesh(
          new THREE.BoxGeometry(36, 10, 26),
          new THREE.MeshLambertMaterial({ color: 0x9a8a76 }),
        );
        shed.position.set(bx, 5.3, bz);
        scene.add(shed);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(38, 1, 28),
          new THREE.MeshLambertMaterial({ color: 0x6b5f4f }),
        );
        roof.position.set(bx, 10.8, bz);
        scene.add(roof);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(24, 4.5),
          new THREE.MeshBasicMaterial({ map: makeSignTexture('SOLMAR CANNERY', '#31404f', '#ffd98a') }),
        );
        sign.position.set(bx, 8, bz + 13.2);
        scene.add(sign);
        colliders.push({ minX: bx - 19, maxX: bx + 19, minZ: bz - 14, maxZ: bz + 14 });
        continue;
      }
      if (rng.chance(0.18)) continue; // Open lot: a little palm park.
      const lots = rng.chance(0.5) ? 1 : 4;
      const spots = lots === 1
        ? [{ x: bx, z: bz, w: 34, d: 34 }]
        : [
          { x: bx - 11, z: bz - 11, w: 18, d: 18 },
          { x: bx + 11, z: bz - 11, w: 18, d: 18 },
          { x: bx - 11, z: bz + 11, w: 18, d: 18 },
          { x: bx + 11, z: bz + 11, w: 18, d: 18 },
        ];
      for (const spot of spots) {
        const height = rng.range(9, 30);
        const texture = rng.pick(textures);
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(spot.w, height, spot.d),
          new THREE.MeshLambertMaterial({ map: texture }),
        );
        building.position.set(spot.x, 0.3 + height / 2, spot.z);
        scene.add(building);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(spot.w + 1, 0.8, spot.d + 1),
          new THREE.MeshLambertMaterial({ color: 0x5a5148 }),
        );
        roof.position.set(spot.x, 0.3 + height + 0.4, spot.z);
        scene.add(roof);
        colliders.push({
          minX: spot.x - spot.w / 2 - 0.4,
          maxX: spot.x + spot.w / 2 + 0.4,
          minZ: spot.z - spot.d / 2 - 0.4,
          maxZ: spot.z + spot.d / 2 + 0.4,
        });
      }
    }
  }

  // Palm trees line the beach road and dot the parks; lamps line every
  // street corner so the grid reads at a glance.
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf, side: THREE.DoubleSide });
  function makePalm(x, z, scale) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = rng.range(-0.08, 0.08);
    palm.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), leafMat);
      const angle = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 1.2, 7.1, Math.sin(angle) * 1.2);
      leaf.rotation.set(Math.sin(angle) * 0.9, 0, -Math.cos(angle) * 0.9);
      leaf.rotation.y = -angle;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    palm.scale.setScalar(scale);
    scene.add(palm);
  }
  for (let z = -170; z <= 170; z += 34) makePalm(-186, z + rng.range(-6, 6), rng.range(0.9, 1.2));
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (rng.chance(0.3)) makePalm(bx + rng.range(-16, 16), bz + rng.range(-16, 16), rng.range(0.8, 1.1));
    }
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: PALETTE.lamp });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const sx of CITY.streets) {
    for (const sz of CITY.streets) {
      if ((sx + sz) % 116 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
      pole.position.set(sx + 8, 3, sz + 8);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), lampHeadMat);
      head.position.set(sx + 8, 6.1, sz + 8);
      scene.add(head);
    }
  }

  // The beach: a sand strip west of the city, then the sea, then the sky.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.sandEast - CITY.sandWest, CITY.half * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((CITY.sandEast + CITY.sandWest) / 2, 0.01, 0);
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.sandWest - CITY.seaWest, 900),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set((CITY.sandWest + CITY.seaWest) / 2, 0.05, 0);
  scene.add(sea);
  animated.sea = sea;
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, CITY.half * 2 + 60),
    new THREE.MeshBasicMaterial({ color: 0xf4f8f8, transparent: true, opacity: 0.7 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(CITY.sandWest + 1, 0.08, 0);
  scene.add(foam);

  // Sun disc and slow clouds in a warm sky.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf, fog: false }),
  );
  sunDisc.position.set(-320, 150, -80);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 11), 8, 6), cloudMat);
      puff.position.set(j * 9 - 9, rng.range(0, 2), rng.range(-3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-260, 260), rng.range(70, 110), rng.range(-260, 260));
    scene.add(cloud);
    animated.clouds.push(cloud);
  }

  // A mission beacon: a glowing pillar and a ring on the ground, pulsing.
  function makeBeacon(color) {
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 13;
    group.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.1, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);
    group.userData.pillar = pillar;
    group.userData.ring = ring;
    return group;
  }

  return {
    colliders,
    makeBeacon,
    update(dt, time) {
      if (animated.sea) animated.sea.position.y = 0.05 + Math.sin(time * 0.6) * 0.06;
      for (const cloud of animated.clouds) {
        cloud.position.x += dt * 1.2;
        if (cloud.position.x > 300) cloud.position.x = -300;
      }
    },
  };
}

// A point is blocked if it is inside a building, in the sea, or outside
// the playable edge of the map.
export function pointBlocked(colliders, x, z, radius) {
  if (x < CITY.sandWest + 3 || x > CITY.half + 6 || z < -CITY.half - 6 || z > CITY.half + 6) return true;
  for (const c of colliders) {
    if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) return true;
  }
  return false;
}

// Push a circle out of a building collider, so cars and people slide
// along walls instead of sinking into them.
export function resolveCircle(colliders, pos, radius) {
  for (const c of colliders) {
    const nearX = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nearZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        pos.x = nearX + (dx / dist) * radius;
        pos.z = nearZ + (dz / dist) * radius;
      } else {
        pos.x = c.maxX + radius;
      }
    }
  }
}
