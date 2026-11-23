// The four staged scenes behind ?shot=start|street|drive|chase. Each one
// plays the real game forward from a fresh world for a few seconds —
// traffic driving, pedestrians walking, police chasing — so the frame is
// what a short game really looks like, and the same seed always gives the
// same frame. The screenshots are real renders of the game's own code.

const STEP = 1 / 60;

function simulate(game, seconds, drive) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.stepWorld(STEP, drive);
  }
}

// Put the player in a car and hold the throttle for a few seconds.
function driveScene(game, seconds) {
  const car = game.playerCar;
  game.enterCar(car);
  simulate(game, seconds, { throttle: 1, steer: 0 });
}

export function stageShot(name, game) {
  game.reset();
  if (name === 'street') {
    game.startPlay();
    game.placePlayerOnFoot(2, 66.5, Math.PI / 2);
    game.nudgePed(0, 10, 68.5);
    game.nudgePed(1, -5, 64.5);
    game.setMission(0, 0);
    game.showBriefing(0);
    simulate(game, 5, null);
    return { screen: 'play' };
  }
  if (name === 'drive') {
    game.startPlay();
    game.setMission(1, 1);
    game.placePlayerOnFoot(54, -54, Math.PI / 2);
    const car = game.goldCar();
    game.enterCar(car);
    game.setPlayerCarHeading(Math.PI / 2);
    driveScene(game, 2.5);
    return { screen: 'play' };
  }
  if (name === 'chase') {
    game.startPlay();
    game.setMission(2, 1);
    game.placePlayerOnFoot(-54, 4, Math.PI / 2);
    const car = game.nearestCar(-54, 4);
    game.enterCar(car);
    game.setPlayerCarHeading(Math.PI / 2);
    game.setWanted(3);
    game.spawnPolice(3);
    // One police car rides up beside the player, so the chase reads in
    // the frame instead of only on the minimap.
    const st = game.playerState();
    const cops = game.policeCars();
    if (cops.length > 0) {
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      const rx = -Math.cos(st.heading);
      const rz = Math.sin(st.heading);
      cops[0].setPose(st.x + fx * 16 + rx * 9, st.z + fz * 16 + rz * 9, st.heading);
    }
    simulate(game, 3.5, { throttle: 0.7, steer: 0 });
    return { screen: 'play' };
  }
  // Default: the start screen over a living city.
  game.orbitCamera();
  simulate(game, 5, null);
  return { screen: 'title' };
}
