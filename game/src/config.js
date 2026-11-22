// config.js — world constants, city layout and mission definitions for Solmar Bay.
// Every name, place and character here is original fiction.
// Road centrelines sit at multiples of the 52 m block pitch, offset by half a pitch.

export const WORLD = {
  halfSize: 230,          // playable square, metres
  roadWidth: 14,
  blockSize: 52,          // block pitch (block + road)
  blockInner: 36,         // buildable square inside a block
  blockCount: 7,          // 7 x 7 blocks
  saveKey: 'solmar-bay-save-v1',
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 8.5,
  radius: 0.7,
  maxHealth: 100,
};

export const CAR_DEFS = [
  { name: 'Palm Runner', color: 0xe2483d, top: 0.24, accel: 26, maxSpeed: 34 },
  { name: 'Bay Cruiser', color: 0x2e7fd9, top: 0.30, accel: 22, maxSpeed: 30 },
  { name: 'Sunset Coupe', color: 0xf2a007, top: 0.22, accel: 30, maxSpeed: 38 },
  { name: 'Harbor Van', color: 0x8a93a0, top: 0.34, accel: 18, maxSpeed: 25 },
  { name: 'Coral Taxi', color: 0xffd23e, top: 0.26, accel: 24, maxSpeed: 32 },
  { name: 'Midnight GT', color: 0x1d2430, top: 0.20, accel: 34, maxSpeed: 44 },
];

export const POLICE_COLOR = 0x1b2a4a;

// Missions: a three-job story arc. Positions are world XZ coordinates.
export const MISSIONS = [
  {
    id: 'fare',
    title: 'JOB 1 — FIRST FARE',
    intro: 'Lena needs a cab ride across town. Steal a car if you have to — grab the Coral Taxi by the motel, pick Lena up, then drop her at the marina.',
    steps: [
      { type: 'goto', label: 'Pick up Lena at the Neon Palm motel', pos: [-104, -104], radius: 6 },
      { type: 'goto', label: 'Drive Lena to the Marina — no scratches, no cops', pos: [104, 104], radius: 7, needsCar: true },
    ],
    reward: 250,
  },
  {
    id: 'cargo',
    title: 'JOB 2 — HOT CARGO',
    intro: 'A package is waiting at the docks. The Bay Police got a tip — expect company. Grab it and lose the heat at the hideout.',
    steps: [
      { type: 'goto', label: 'Collect the package at the south docks', pos: [0, 190], radius: 6 },
      { type: 'escape', label: 'Lose the cops, then reach the hideout', pos: [-150, 150], radius: 8, wantedOnPickup: 2 },
    ],
    reward: 500,
  },
  {
    id: 'getaway',
    title: 'JOB 3 — THE GETAWAY',
    intro: "Marlo Vane's crew hit the casino vault. You're the wheelman. Get the crew to the airport road while the whole city is after you.",
    steps: [
      { type: 'goto', label: 'Pick up the crew at the casino', pos: [104, -104], radius: 7, wantedOnPickup: 3 },
      { type: 'goto', label: 'Outrun the police — reach the airport road', pos: [190, 0], radius: 9, needsCar: true },
    ],
    reward: 1000,
  },
];

export const PICKUPS = [
  { kind: 'cash', pos: [60, -60], amount: 75 },
  { kind: 'cash', pos: [-60, 60], amount: 75 },
  { kind: 'cash', pos: [140, 40], amount: 100 },
  { kind: 'cash', pos: [-140, -40], amount: 100 },
  { kind: 'cash', pos: [20, 140], amount: 50 },
  { kind: 'health', pos: [-20, -140], amount: 50 },
  { kind: 'health', pos: [120, -120], amount: 50 },
  { kind: 'health', pos: [-120, 120], amount: 50 },
];

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

/** Wrap an angle in radians to (-PI, PI]. Used wherever a heading is steered
 *  toward a target heading (traffic AI, police pursuit) so the turn always
 *  takes the short way around instead of spinning a full circle. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** World X/Z coordinate of the i-th road centreline (i = 0..blockCount).
 *  Roads sit half a block pitch outside the first/last block centres, so
 *  line 0 is at origin - pitch/2 and line blockCount at the far edge. */
export function roadLineAt(i) {
  const origin = -((WORLD.blockCount - 1) * WORLD.blockSize) / 2;
  return origin - WORLD.blockSize / 2 + i * WORLD.blockSize;
}

/** Snap a coordinate to the nearest road centreline. Traffic cars use this
 *  when they turn onto a new road so they never end up driving between
 *  roads (off the grid) after a turn. */
export function nearestRoadLine(v) {
  let best = roadLineAt(0), bestD = Infinity;
  for (let i = 0; i <= WORLD.blockCount; i++) {
    const c = roadLineAt(i), d = Math.abs(v - c);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}
