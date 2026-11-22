// world.js — builds the original city of Solmar Bay: grid streets, buildings
// with lit windows, palms, streetlights, a beach and ocean, sun and sky.
// Also owns the collision boxes and the road network used by traffic AI.

import * as THREE from 'three';
import { WORLD, rand, randi } from './config.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {x, z, hx, hz}
    this.roadLines = [];   // road centre lines for traffic loops
    // Shared palm materials: dozens of palms share two materials instead
    // of allocating a fresh pair per tree.
    this.palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
    this.palmTopMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44 });
    this.build();
  }

  buildingTexture(base, lit) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (let y = 12; y < 244; y += 22) {
      for (let x = 10; x < 118; x += 20) {
        g.fillStyle = Math.random() < 0.55 ? lit : 'rgba(20,28,44,0.9)';
        g.fillRect(x, y, 12, 14);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  build() {
    const s = this.scene;
    // Sky, fog, sun
    s.background = new THREE.Color(0x87c5e8);
    s.fog = new THREE.Fog(0x9fd0ea, 220, 620);
    const sun = new THREE.DirectionalLight(0xfff1cf, 2.4);
    sun.position.set(120, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 600;
    s.add(sun);
    s.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

    // Ground: grass/sand base
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x7fae62 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    ground.receiveShadow = true;
    s.add(ground);

    // City slab (asphalt-coloured base under the grid)
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.halfSize * 2 + 40, WORLD.halfSize * 2 + 40),
      new THREE.MeshLambertMaterial({ color: 0x3c3f45 }));
    slab.rotation.x = -Math.PI / 2; slab.position.y = 0;
    slab.receiveShadow = true;
    s.add(slab);

    const palette = ['#e8c9a0', '#d9a06b', '#b8c4cc', '#e8b4b8', '#a8c8d8', '#d8d8c0', '#c9a8d8', '#f0e0c0'];
    const texCache = {};
    const texFor = (base) => {
      if (!texCache[base]) texCache[base] = this.buildingTexture(base, '#ffd98a');
      return texCache[base];
    };

    // Blocks and buildings
    const n = WORLD.blockCount, pitch = WORLD.blockSize;
    const origin = -((n - 1) * pitch) / 2; // first block centre
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx = origin + i * pitch, cz = origin + j * pitch;
        // sidewalk pad
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(WORLD.blockInner + 6, 0.3, WORLD.blockInner + 6),
          new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
        pad.position.set(cx, 0.15, cz); pad.receiveShadow = true;
        s.add(pad);
        // 1-4 buildings per block
        const count = randi(1, 3);
        for (let b = 0; b < count; b++) {
          const w = rand(10, 16), d = rand(10, 16);
          const h = rand(9, 42);
          const bx = cx + rand(-9, 9), bz = cz + rand(-9, 9);
          const base = palette[randi(0, palette.length - 1)];
          const mat = new THREE.MeshLambertMaterial({ map: texFor(base) });
          const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          bld.position.set(bx, h / 2 + 0.3, bz);
          bld.castShadow = true; bld.receiveShadow = true;
          s.add(bld);
          // roof trim
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
            new THREE.MeshLambertMaterial({ color: 0x5a4a3a }));
          roof.position.set(bx, h + 0.55, bz);
          s.add(roof);
          this.colliders.push({ x: bx, z: bz, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
          if (h > 30) { // rooftop beacon on towers
            const bc = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0xff4444 }));
            bc.position.set(bx, h + 1.4, bz); s.add(bc);
          }
        }
        // palm trees on block corners
        if (Math.random() < 0.7) this.palm(cx + 16, cz + 16);
        if (Math.random() < 0.5) this.palm(cx - 16, cz - 16);
      }
    }

    // Road centre lines (for minimap + traffic loops)
    for (let i = 0; i <= n; i++) {
      const c = origin - pitch / 2 + i * pitch;
      this.roadLines.push(c);
    }

    // Streetlights along roads
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= n; j += 2) {
        const x = origin + i * pitch, z = origin - pitch / 2 + j * pitch;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
        pole.position.set(x + 8, 3, z); s.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lampMat);
        lamp.position.set(x + 8, 6.1, z); s.add(lamp);
      }
    }

    // Beach + ocean on the south edge (z = +halfSize). The boardwalk sign
    // carries the city's own name, built from a canvas texture — no borrowed art.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 60),
      new THREE.MeshLambertMaterial({ color: 0xe8d8a8 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, WORLD.halfSize + 30);
    s.add(sand);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 300),
      new THREE.MeshLambertMaterial({ color: 0x1e7fb8 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.4, WORLD.halfSize + 210);
    s.add(ocean);
    // boardwalk sign: "SOLMAR BAY" in 3D letters made of boxes (original name)
    this.sign('SOLMAR BAY', -60, WORLD.halfSize + 8, 0xffd23e);

    // Landmark: casino tower (tall, gold) at NE, motel (low, pink) at SW
    this.landmark(104, -104, 55, 0xd9a441, 'CASINO');
    this.landmark(-104, -104, 10, 0xe88aa0, 'NEON PALM');
  }

  palm(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), this.palmTrunkMat);
    trunk.position.set(x, 2.5, z); trunk.castShadow = true;
    this.scene.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), this.palmTopMat);
    top.position.set(x, 5.4, z); top.scale.y = 0.55; top.castShadow = true;
    this.scene.add(top);
    // The trunk is solid: the player and cars should walk/drive around it,
    // not through it.
    this.colliders.push({ x, z, hx: 0.5, hz: 0.5 });
  }

  landmark(x, z, h, color, label) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(20, h, 20),
      new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, h / 2, z); m.castShadow = true;
    this.scene.add(m);
    this.colliders.push({ x, z, hx: 10.4, hz: 10.4 });
    this.sign(label, x, z, 0xffffff, 3);
  }

  sign(text, x, z, color, scale = 5) {
    // Simple letter-board: a dark board with the name as a canvas texture.
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#101826'; g.fillRect(0, 0, 512, 96);
    // The caller picks the letter colour (gold for the boardwalk sign,
    // white for landmark signs) — previously this always drew gold.
    g.fillStyle = '#' + color.toString(16).padStart(6, '0');
    g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(18 * (scale / 5), 3.4 * (scale / 5)),
      new THREE.MeshBasicMaterial({ map: t }));
    board.position.set(x, 4, z);
    board.rotation.y = 0;
    this.scene.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x333a44 }));
    post.position.set(x, 2, z);
    this.scene.add(post);
  }

  // Push a circle (player / car) out of building colliders. Returns true if hit.
  collideCircle(x, z, r) {
    let hit = false;
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) < c.hx + r && Math.abs(dz) < c.hz + r) {
        hit = true;
        // resolve along the smaller penetration axis
        const px = c.hx + r - Math.abs(dx), pz = c.hz + r - Math.abs(dz);
        if (px < pz) x = c.x + Math.sign(dx || 1) * (c.hx + r);
        else z = c.z + Math.sign(dz || 1) * (c.hz + r);
      }
    }
    return { x, z, hit };
  }

  inBounds(x, z, margin = 4) {
    const h = WORLD.halfSize - margin;
    return Math.abs(x) < h && Math.abs(z) < h;
  }
}
