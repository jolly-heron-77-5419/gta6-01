// The three-job story arc. Lena Cruz hands out the jobs in order; each
// job has two steps (go, then bring back), a beacon on the map, a briefing
// line, and a cash reward. The module only tracks the story — the main
// loop owns the world and asks it what the current marker and objective
// are, and tells it when the player reaches something.

import { MISSIONS, SPOTS } from './config.js';

export function createMissions(beaconFactory, scene) {
  let beacon = null;
  let beaconColor = 0xffd23e;
  let index = 0; // Which job: 0, 1, 2, or 3 when the arc is done.
  let step = 0; // 0 = go to the spot, 1 = bring it back.
  let done = false;

  function placeBeaconAt(x, z) {
    if (beacon) {
      scene.remove(beacon);
      beacon = null;
    }
    beacon = beaconFactory(beaconColor);
    beacon.position.set(x, 0, z);
    scene.add(beacon);
  }

  function currentSpot() {
    if (index >= MISSIONS.length) return null;
    const job = MISSIONS[index];
    const key = step === 0 ? job.spot : job.returnSpot;
    return SPOTS[key];
  }

  function refreshBeacon() {
    const spot = currentSpot();
    if (spot) placeBeaconAt(spot.x, spot.z);
    else if (beacon) {
      scene.remove(beacon);
      beacon = null;
    }
  }

  function start() {
    index = 0;
    step = 0;
    done = false;
    refreshBeacon();
    return MISSIONS[0];
  }

  // Jump the story to a job and step: used when loading a save and when a
  // screenshot stages a later mission.
  function setState(newIndex, newStep) {
    index = Math.max(0, Math.min(MISSIONS.length, newIndex));
    step = newStep === 1 ? 1 : 0;
    done = index >= MISSIONS.length;
    refreshBeacon();
  }

  function state() {
    return { index, step, done, mission: index < MISSIONS.length ? MISSIONS[index] : null };
  }

  function marker() {
    return currentSpot();
  }

  function objectiveText() {
    if (index >= MISSIONS.length) return 'All jobs done — Solmar Bay is yours. Free roam.';
    const job = MISSIONS[index];
    return step === 0 ? job.objective : job.objectiveDone;
  }

  function titleText() {
    if (index >= MISSIONS.length) return 'Free Roam';
    return MISSIONS[index].title;
  }

  // The player reached the current marker. Returns what happened:
  // 'advanced' (step 0 -> 1), 'completed' (job paid out), or 'done'
  // (the whole arc finished). The main loop applies rewards and side
  // effects from the returned job.
  function reached() {
    if (index >= MISSIONS.length) return { type: 'none' };
    const job = MISSIONS[index];
    if (step === 0) {
      step = 1;
      refreshBeacon();
      return { type: 'advanced', job };
    }
    const finished = job;
    index += 1;
    step = 0;
    if (index >= MISSIONS.length) {
      done = true;
      refreshBeacon();
      return { type: 'done', job: finished };
    }
    refreshBeacon();
    return { type: 'completed', job: finished, next: MISSIONS[index] };
  }

  return {
    start,
    setState,
    state,
    marker,
    objectiveText,
    titleText,
    reached,
    // The beacon pulses: called every frame with the clock.
    update(time) {
      if (beacon) {
        const s = 1 + Math.sin(time * 4) * 0.15;
        beacon.scale.set(s, 1, s);
        beacon.userData.pillar.material.opacity = 0.28 + Math.sin(time * 4) * 0.1;
      }
    },
  };
}
