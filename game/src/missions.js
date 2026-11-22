// missions.js — the three-job story arc: waypoints, timers, rewards and
// the win state. A glowing beacon marks the current objective in the world.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;          // next mission to start
    this.active = null;      // {def, step}
    this.completed = 0;
    this.storyDone = false;
    this.needCarToastAt = 0; // throttle for the "you need a car" reminder
    this.pulse = 0;          // beacon breathing animation clock
    // Beacon: a light pillar + ring at the objective.
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true);
    this.beacon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.visible = false;
    scene.add(this.beacon);
    const ringGeo = new THREE.TorusGeometry(4, 0.35, 8, 32);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    // Floating objective arrow above the player, pointing at the target.
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.9 }));
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  current() { return this.active; }
  nextDef() { return MISSIONS[this.index] || null; }

  start() {
    const def = this.nextDef();
    if (!def) return null;
    this.active = { def, step: 0 };
    this.showMarker();
    return def;
  }

  stepDef() { return this.active ? this.active.def.steps[this.active.step] : null; }

  showMarker() {
    const step = this.stepDef();
    if (!step) { this.hideMarker(); return; }
    this.beacon.position.set(step.pos[0], 30, step.pos[1]);
    this.ring.position.set(step.pos[0], 0.4, step.pos[1]);
    this.beacon.visible = true; this.ring.visible = true; this.arrow.visible = true;
  }

  hideMarker() {
    this.beacon.visible = false; this.ring.visible = false; this.arrow.visible = false;
  }

  // Called every frame. Returns an event string or null.
  // ctx: {playerPos, inCar, wanted, setWanted, addMoney, toast, sound}
  update(dt, ctx) {
    if (!this.active) return null;
    const step = this.stepDef();
    const dx = ctx.playerPos.x - step.pos[0], dz = ctx.playerPos.z - step.pos[1];
    const d = Math.hypot(dx, dz);
    // Beacon breathing: the pillar gently pulses so the objective stays
    // visible from across the city without strobing.
    this.pulse += dt;
    const breathe = 0.5 + 0.5 * Math.sin(this.pulse * 2.4);
    this.beacon.material.opacity = 0.2 + 0.12 * breathe;
    const ringScale = 1 + 0.12 * breathe;
    this.ring.scale.set(ringScale, ringScale, 1);
    // Arrow hovers over the player and points at the objective.
    this.arrow.position.set(ctx.playerPos.x, 3.4, ctx.playerPos.z);
    this.arrow.lookAt(step.pos[0], 3.4, step.pos[1]);
    this.arrow.rotateX(Math.PI / 2);
    // Escape steps: must ALSO have no wanted level.
    if (step.type === 'escape' && d < step.radius && ctx.wanted === 0) {
      return this.completeStep(ctx);
    }
    if (step.type === 'goto' && d < step.radius) {
      if (step.needsCar && !ctx.inCar) {
        // Throttled: without this the reminder re-fires every single frame
        // while the player stands in the radius on foot, pinning the toast.
        this.needCarToastAt -= dt;
        if (this.needCarToastAt <= 0) {
          ctx.toast('You need a car for this — press E near one!');
          this.needCarToastAt = 3;
        }
        return null;
      }
      if (step.wantedOnPickup) ctx.setWanted(step.wantedOnPickup);
      return this.completeStep(ctx);
    }
    return null;
  }

  completeStep(ctx) {
    const def = this.active.def;
    this.active.step++;
    if (this.active.step >= def.steps.length) {
      ctx.addMoney(def.reward);
      ctx.sound.missionDone();
      ctx.toast(`JOB DONE — +$${def.reward}`);
      this.active = null;
      this.index++;
      this.completed++;
      this.hideMarker();
      if (this.index >= MISSIONS.length) {
        this.storyDone = true;
        return 'storyDone';
      }
      return 'missionDone';
    }
    this.showMarker();
    ctx.sound.pickup();
    return 'stepDone';
  }

  objectiveText() {
    if (!this.active) {
      const next = this.nextDef();
      return next ? { title: 'FREE ROAM', text: `Next job: ${next.title} — press M to start.` }
                   : { title: 'FREE ROAM', text: 'Story complete! Explore, steal cars, dodge the cops.' };
    }
    const step = this.stepDef();
    return { title: this.active.def.title, text: step.label };
  }
}
