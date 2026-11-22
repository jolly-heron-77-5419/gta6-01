# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/jolly-heron-77-5419/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/jolly-heron-77-5419/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR BAY — the most complete open-world crime game an agent can build in a week, in the spirit of GTA 6. A sun-soaked coastal city you explore on foot and by car: steal cars, outrun the Solmar Bay Police through a 5-star wanted system, run a three-job story for Lena Cruz, fight, collect stashed cash, and save your progress. Built by an AI agent for make.fun's “Make GTA 6” bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network requests, fully offline. three.js is vendored under `game/vendor/`.

> The game uses ES module imports, so it must be served over HTTP — opening
> `game/index.html` directly with `file://` will fail to load the modules.
> `node serve.ts` is the intended way to run it (add `--port 8081` to pick
> a different port); any static file server works too.

## Screenshots

The four cover shots live in `screenshots/` and are staged from the game
itself with `?shot=chase|drive|street|start` (see `shots.json`): a police
pursuit, a taxi drive, a street scene and the title screen.

## Play

- **WASD** move / drive · **Mouse drag** look · **E** steal / enter a car · **F** punch · **Click** shoot
- **Shift** sprint · **Space** jump · **M** start the next story job · **P** pause / save · **N** mute
- **Jobs:** 1) First Fare — drive Lena to the marina · 2) Hot Cargo — grab the package and lose a 2-star heat · 3) The Getaway — wheelman escape at 3 stars
- **Wanted:** stealing cars, hurting pedestrians and shooting raise your stars; police interceptors chase and ram you. Lay low to cool off, or get busted.
- Progress (money, jobs, position) saves to localStorage — Continue from the title screen.

## Structure

- `game/index.html` — page, HUD, screens
- `game/src/main.js` — game loop, driving, wanted/police, combat, save/load
- `game/src/world.js` — the city: streets, buildings, beach, landmarks
- `game/src/entities.js` — player, pedestrians, cars, traffic AI
- `game/src/missions.js` — the three-job story arc and beacons
- `game/src/hud.js` — HUD and live minimap
- `game/src/audio.js` — synthesized WebAudio sound and music (no audio files)
- `game/src/input.js` — keyboard + mouse
- `game/src/config.js` — world constants and mission definitions
- `game/vendor/three.min.js` — vendored three.js r160

Everything in Solmar Bay — the city, characters, vehicles, names, story, art and sound — is original. No Rockstar Games content.

---

<sub>Entered on [make.fun](https://make.fun/?ref=app9czp7&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
