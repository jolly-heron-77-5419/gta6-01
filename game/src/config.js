// SOLMAR BAY — shared tuning and story data for the whole game.
// One file, one job: every number the other modules agree on lives here,
// so a tweak to the city, the cars or a mission is a one-line change.

export const SAVE_KEY = 'solmar-bay-save-v1';

// The city is a regular grid. Streets run north-south and east-west at the
// centres listed below; blocks between them hold the buildings. The beach
// and the sea sit on the west edge, past the last street.
export const CITY = {
  pitch: 58,
  streetWidth: 14,
  blockSize: 44,
  streets: [-174, -116, -58, 0, 58, 116, 174],
  half: 181,
  sandWest: -214,
  seaWest: -400,
  sandEast: -181,
};

// Where the story happens: street-corner spots the missions point at.
export const SPOTS = {
  lena: { x: 8, z: 8 },
  spawn: { x: 14, z: 14 },
  pickup: { x: -116, z: 58 },
  stealCar: { x: 58, z: -58 },
  dropoff: { x: 116, z: 116 },
  warehouse: { x: -150, z: -116 },
  escape: { x: 174, z: 58 },
};

// On-foot movement.
export const WALK = {
  speed: 7,
  runSpeed: 11,
  turnSpeed: 9,
  radius: 0.9,
};

// Driving: arcade handling, forgiving on purpose.
export const DRIVE = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38,
  maxReverse: 12,
  steer: 1.9,
  grip: 6,
  radius: 2.2,
};

// Traffic and pedestrians.
export const TRAFFIC = {
  count: 14,
  speed: 10,
  minGap: 9,
};
export const PEDS = {
  count: 22,
  speed: 1.6,
};

// Wanted level: stars, how crimes add, how the heat cools off.
export const WANTED = {
  stealCar: 1,
  hitPedestrian: 1,
  ramPolice: 1,
  hitAndRun: 1,
  coolDistance: 70,
  coolSeconds: 9,
  maxStars: 5,
};

// Health and damage.
export const HEALTH = {
  player: 100,
  guard: 100,
  punchDamage: 34,
  guardPunch: 8,
  carHealth: 100,
  ramDamage: 12,
  policeRam: 10,
};

// Mission text and rewards. Lena Cruz is the fixer who gives the jobs;
// every line below is original dialogue written for this game.
export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Job 1 — First Pickup',
    briefing:
      'Lena: "New in town? Good. A package is waiting at the corner of Coral and 5th. Bring it back to me, no detours."',
    objective: 'Pick up the package at the yellow marker',
    objectiveDone: 'Bring the package back to Lena',
    reward: 300,
    spot: 'pickup',
    returnSpot: 'lena',
  },
  {
    id: 'steal',
    title: 'Job 2 — Borrowed Wheels',
    briefing:
      'Lena: "Next one needs wheels. There is a gold coupe parked on Marina Row. Take it — and mind the cops, it is hot already."',
    objective: 'Steal the gold coupe at the marker',
    objectiveDone: 'Deliver the coupe to the drop-off',
    reward: 600,
    spot: 'stealCar',
    returnSpot: 'dropoff',
  },
  {
    id: 'warehouse',
    title: 'Job 3 — Warehouse Job',
    briefing:
      'Lena: "Last one, big one. A crate in the old cannery warehouse, two guards on it. Handle them, grab the crate, and get clear."',
    objective: 'Deal with the warehouse guards (F to punch)',
    objectiveDone: 'Grab the crate, then reach the escape marker',
    reward: 1200,
    spot: 'warehouse',
    returnSpot: 'escape',
  },
];

// Keys, with a couple of alternates so the game feels natural to play.
export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  punch: ['KeyF'],
  handbrake: ['Space'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Enter', 'Space'],
  mute: ['KeyM'],
};

// Palette: warm coastal afternoon. Buildings are sun-bleached stucco,
// the sea is turquoise, the palms are deep green.
export const PALETTE = {
  sky: 0x8ec9e8,
  sun: 0xffe3b3,
  asphalt: 0x3a3f46,
  sidewalk: 0x9a938a,
  sand: 0xe8d5a8,
  sea: 0x2e8fa8,
  seaDeep: 0x1d6f8f,
  grass: 0x7fae62,
  building: [0xe8dcc8, 0xd9c1a3, 0xc9b8a6, 0xe6c9a8, 0xb9c8d4, 0xd4a58e, 0xf0e0c0],
  car: [0xc0392b, 0x2e6fb0, 0xd9a441, 0x7d8a99, 0x4a9e6d, 0x8e44ad, 0xe8e8e8, 0x222831],
  palmTrunk: 0x8a6b4a,
  palmLeaf: 0x3f8f4f,
  lamp: 0x2f3542,
};
