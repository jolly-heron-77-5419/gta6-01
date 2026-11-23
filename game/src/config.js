// SOLMAR BAY — shared tuning values and tiny math helpers.
// One job: hold every number the rest of the game reads, so balance
// changes happen here and nowhere else.

export const CFG = {
  title: 'SOLMAR BAY',
  city: {
    halfSize: 170,          // playable ground runs -halfSize .. +halfSize on both axes
    streetGap: 40,          // distance between neighbouring street centre lines
    streetHalfWidth: 5,     // half the width of a road surface
    laneOffset: 2.6,        // how far right of a centre line traffic drives
    blockSize: 30,          // a city block is blockSize by blockSize
    beachStartX: 158,       // sand begins here; the sea is further east
    seaStartX: 188,
    groundY: 0,
  },
  player: {
    walkSpeed: 6,
    runSpeed: 10,
    radius: 0.6,
    maxHealth: 100,
    punchRange: 2.2,
    punchDamage: 34,
    punchCooldown: 0.45,
  },
  car: {
    accel: 22,
    brake: 34,
    reverseAccel: 12,
    maxSpeed: 38,
    maxReverse: 10,
    steerRate: 1.9,
    grip: 6.5,
    radius: 1.6,
    maxDamage: 100,
  },
  traffic: {
    count: 14,
    cruiseMin: 8,
    cruiseMax: 13,
  },
  pedestrians: {
    count: 22,
    walkMin: 1.1,
    walkMax: 2.2,
  },
  police: {
    maxCars: 4,
    chaseSpeed: 30,
    ramDamage: 12,
    spawnDistance: 55,
    loseSightSeconds: 9,
  },
  wanted: {
    maxStars: 5,
    stealCarStars: 1,
    hitPedestrianStars: 1,
    ramPoliceStars: 1,
    decaySeconds: 14,
  },
  missions: {
    pickupReward: 150,
    stealReward: 400,
    warehouseReward: 800,
  },
  saveKey: 'solmar-bay-save-v3',
};

// A small deterministic generator so the city looks the same every load
// while still feeling hand-placed. Seeded with a plain mulberry32.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed turn from angle `from` toward angle `to`.
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Pick one entry from an array with the given rng.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// Second pass on config: colour palette and mission text live here too,
// so the world builder and the story file never hard-code a look.

CFG.palette = {
  skyTop: 0x7ec8ee,
  skyHorizon: 0xffe3b3,
  sun: 0xfff2c8,
  sea: 0x2e7fa8,
  sand: 0xe8d29a,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a3,
  grass: 0x7fae62,
  buildingGlass: 0x9fd4e8,
};

CFG.story = {
  fixer: 'Lena Cruz',
  intro:
    'New in Solmar Bay. Lena Cruz has work for you — three jobs, good pay, no questions.',
  jobs: [
    {
      id: 'pickup',
      name: 'Job 1 — First Pickup',
      brief:
        'Lena: "Package waiting at the pier, north end. Walk or drive, just bring it back to my corner."',
      hint: 'Follow the gold marker to the pier and pick up the package.',
    },
    {
      id: 'steal',
      name: 'Job 2 — Borrowed Wheels',
      brief:
        'Lena: "I need that orange Comet GT parked by the marina. Take it — and lose whoever follows."',
      hint: 'Steal the orange Comet GT and deliver it to the garage marker.',
    },
    {
      id: 'warehouse',
      name: 'Job 3 — Warehouse Run',
      brief:
        'Lena: "Last one. Two guards at the old cannery. Handle them, grab the crate, come home rich."',
      hint: 'Deal with both guards, grab the crate, return to Lena.',
    },
  ],
  done: 'All three jobs done. Solmar Bay is yours now — keep the engine running.',
};
