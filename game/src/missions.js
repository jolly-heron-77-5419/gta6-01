// SOLMAR BAY — the three-job story arc for Lena Cruz.
// One job: hold the mission state machine (objectives, markers, rewards,
// guards) and tell the rest of the game what the player should do next.
// It never moves the player itself; the main loop feeds it positions
// and it answers with events.

import * as THREE from 'three';
import { CFG } from './config.js';

const PIER_PICKUP = { x: 60, z: -153 };
const MARINA_CAR = { x: 142, z: -60, heading: Math.PI / 2 };
const GARAGE_DROP = { x: 120, z: 120 };
const WAREHOUSE = { x: -120, z: 120 };
const LENA_CORNER = { x: 20, z: 20 };

export const MISSION_SPOTS = { PIER_PICKUP, MARINA_CAR, GARAGE_DROP, WAREHOUSE, LENA_CORNER };

// The gold beacon column that marks the current objective in the world.
function makeBeacon(scene) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.3, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc93c, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  column.position.y = 13;
  group.add(column);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.14, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc93c })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffc93c })
  );
  arrow.position.y = 5.2;
  arrow.rotation.x = Math.PI;
  group.add(arrow);
  group.visible = false;
  scene.add(group);
  return { group, ring, arrow };
}

function makeGuard(scene, x, z) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.74, 0.38),
    new THREE.MeshLambertMaterial({ color: 0x3a3f46 })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xc98a5a })
  );
  head.position.y = 1.62;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.12, 0.56),
    new THREE.MeshLambertMaterial({ color: 0x1c1e24 })
  );
  cap.position.y = 1.82;
  group.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.24), legMat);
  legL.position.set(-0.16, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);
  // Floating health bar above the guard's head.
  const barBg = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.16, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x331111 })
  );
  barBg.position.y = 2.25;
  const barFg = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.1, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  );
  barFg.position.y = 2.25;
  group.add(barBg, barFg);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    mesh: group,
    legL,
    legR,
    barFg,
    pos: group.position,
    heading: 0,
    health: 100,
    maxHealth: 100,
    down: false,
    punchCooldown: 0,
    walkPhase: 0,
  };
}

// The state machine. `hooks` is how missions talk to the rest of the
// game: cash, banners, objective text and sounds all flow through it.
export function createMissions(scene, hooks) {
  const beacon = makeBeacon(scene);
  const guards = [makeGuard(scene, WAREHOUSE.x - 4, WAREHOUSE.z - 3)];
  guards.push(makeGuard(scene, WAREHOUSE.x + 4, WAREHOUSE.z + 2));
  for (const g of guards) g.mesh.visible = false;

  let stage = 0; // 0 pickup, 1 steal, 2 deliver, 3 guards, 4 crate, 5 return, 6 done
  let crateTaken = false;
  let crateMesh = null;

  function job() {
    return CFG.story.jobs[Math.min(Math.floor(stage / 2), 2)];
  }

  function setObjective(text) {
    hooks.setObjective(text, job().name);
  }

  function placeBeacon(x, z) {
    beacon.group.position.set(x, 0, z);
    beacon.group.visible = true;
  }

  function beginStage() {
    if (stage === 0) {
      placeBeacon(PIER_PICKUP.x, PIER_PICKUP.z);
      hooks.banner(CFG.story.jobs[0].name, CFG.story.jobs[0].brief);
      setObjective(CFG.story.jobs[0].hint);
    } else if (stage === 1) {
      placeBeacon(MARINA_CAR.x, MARINA_CAR.z);
      hooks.banner(CFG.story.jobs[1].name, CFG.story.jobs[1].brief);
      setObjective(CFG.story.jobs[1].hint);
    } else if (stage === 2) {
      placeBeacon(GARAGE_DROP.x, GARAGE_DROP.z);
      setObjective('Deliver the Comet GT to the garage marker. Lose the cops first if you have to.');
    } else if (stage === 3) {
      for (const g of guards) g.mesh.visible = true;
      placeBeacon(WAREHOUSE.x, WAREHOUSE.z);
      hooks.banner(CFG.story.jobs[2].name, CFG.story.jobs[2].brief);
      setObjective(CFG.story.jobs[2].hint);
    } else if (stage === 4) {
      placeBeacon(WAREHOUSE.x, WAREHOUSE.z);
      setObjective('Grab the crate from the warehouse yard.');
    } else if (stage === 5) {
      placeBeacon(LENA_CORNER.x, LENA_CORNER.z);
      setObjective('Bring the crate back to Lena at the plaza.');
    } else {
      beacon.group.visible = false;
      setObjective(CFG.story.done);
      hooks.banner('All jobs done', CFG.story.done);
      hooks.onStoryDone();
    }
  }

  function reward(amount, text) {
    hooks.addCash(amount);
    hooks.banner('Job paid', `+$${amount} — ${text}`);
    hooks.playSound('success');
  }

  function spawnCrate() {
    crateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x8a5a20, emissive: 0x332200, emissiveIntensity: 0.5 })
    );
    crateMesh.position.set(WAREHOUSE.x, 0.55, WAREHOUSE.z);
    crateMesh.castShadow = true;
    scene.add(crateMesh);
  }

  beginStage();

  return {
    get stage() { return stage; },
    get done() { return stage >= 6; },
    get guards() { return guards; },
    get jobName() { return job().name; },
    beacon,

    // Resume a saved game at a later stage (cash and progress persist).
    skipToStage(n) {
      if (n <= 0 || n >= 6) return;
      stage = n;
      if (n >= 3) for (const g of guards) g.mesh.visible = true;
      beginStage();
    },

    // Called every frame with the player's position and car state.
    update(dt, playerPos, playerCar, targetCar, cameraPos, elapsed) {
      beacon.ring.rotation.z += dt * 0.8;
      beacon.arrow.position.y = 5.2 + Math.sin(elapsed * 2.4) * 0.5;
      if (crateMesh) crateMesh.rotation.y += dt * 0.9;

      const near = (spot, r) => Math.hypot(playerPos.x - spot.x, playerPos.z - spot.z) < r;

      if (stage === 0 && near(PIER_PICKUP, 3.2)) {
        reward(CFG.missions.pickupReward, 'package delivered to Lena');
        stage = 1;
        beginStage();
      } else if (stage === 2 && playerCar === targetCar && near(GARAGE_DROP, 4.5)) {
        reward(CFG.missions.stealReward, 'Comet GT delivered, no questions asked');
        stage = 3;
        beginStage();
      } else if (stage === 4 && near(WAREHOUSE, 3.2)) {
        crateTaken = true;
        if (crateMesh) { scene.remove(crateMesh); crateMesh = null; }
        hooks.playSound('pickup');
        stage = 5;
        beginStage();
      } else if (stage === 5 && near(LENA_CORNER, 3.5)) {
        reward(CFG.missions.warehouseReward, 'crate delivered — Lena is impressed');
        stage = 6;
        beginStage();
      }

      // Guards: wake when the player gets close, chase and swing.
      if (stage >= 3 && stage <= 4) {
        for (const g of guards) {
          if (g.down) continue;
          const dx = playerPos.x - g.pos.x;
          const dz = playerPos.z - g.pos.z;
          const dist = Math.hypot(dx, dz);
          g.barFg.scale.x = Math.max(0.01, g.health / g.maxHealth);
          g.barFg.position.x = -(1.24 * (1 - g.health / g.maxHealth)) / 2;
          if (dist < 26) {
            g.heading = Math.atan2(dx, dz);
            g.mesh.rotation.y = g.heading;
            if (dist > 1.6) {
              const step = 3.4 * dt;
              g.pos.x += Math.sin(g.heading) * step;
              g.pos.z += Math.cos(g.heading) * step;
              g.walkPhase += dt * 8;
              g.legL.rotation.x = Math.sin(g.walkPhase) * 0.5;
              g.legR.rotation.x = -Math.sin(g.walkPhase) * 0.5;
            } else if (g.punchCooldown <= 0) {
              g.punchCooldown = 1.1;
              hooks.onGuardHitPlayer(14);
            }
          }
          g.punchCooldown -= dt;
          // The guard turns to face the player, so the bar on his chest
          // faces the camera whenever he is engaged.
        }
      }
    },

    // The player stole the mission car: advance from stage 1 to 2.
    onStoleTargetCar() {
      if (stage === 1) {
        hooks.playSound('pickup');
        stage = 2;
        beginStage();
      }
    },

    // A punch landed near the player: returns the guard hit, if any.
    onPunch(playerPos) {
      if (stage < 3 || stage > 4) return null;
      for (const g of guards) {
        if (g.down) continue;
        const d = Math.hypot(g.pos.x - playerPos.x, g.pos.z - playerPos.z);
        if (d < CFG.player.punchRange + 0.4) {
          g.health -= CFG.player.punchDamage;
          if (g.health <= 0) {
            g.health = 0;
            g.down = true;
            g.mesh.rotation.x = -Math.PI / 2;
            g.mesh.position.y = 0.4;
            hooks.playSound('thud');
          }
          if (guards.every((gg) => gg.down) && stage === 3) {
            spawnCrate();
            stage = 4;
            beginStage();
          }
          return g;
        }
      }
      return null;
    },
  };
}
