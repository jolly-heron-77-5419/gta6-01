// SOLMAR BAY — entrypoint for the make.fun gta6-01 bounty.
//
// What this program does, in one sentence: it takes the finished game that
// lives next to this file and hands it to the grader in the shape the grader
// expects — a copy of the game plus its screenshots, and a dossier.json that
// describes them.
//
// The game itself is plain static files: game/index.html and the modules,
// styles and assets under game/. A desktop browser opens it offline, no
// server and no network needed. This file does not run the game; it only
// packages it.
//
// Usage (outside the grader's container):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader the output directory is /output, which is also the
// default here when MAKEFUN_OUTPUT_DIR is not set.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file sits in — game/ and screenshots/ live beside it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Where the packaged entry goes: the environment tells us, or /output.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps below come from the bounty's gate.json. Only text_max_bytes
// changes the dossier's bytes; the rest make this program refuse an entry
// the scorer would refuse anyway, so the failure happens here, loudly,
// instead of silently at grading time:
//   - at most 4 screenshots, each at most 256 KiB;
//   - at most 993 entries in game/ (the grader caps /output at 1000, and
//     game/ counts next to screenshots/ and dossier.json);
//   - at most 48 MiB of game files in total;
//   - no path under game/ longer than 1000 bytes.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// 1. Stage the game: copy the whole game/ tree into the output directory.
//    Fail fast with a plain message if the game folder is missing, rather
//    than letting cpSync throw a bare ENOENT.
if (!existsSync(join(repoRoot, 'game'))) {
  throw new Error('game/: no such directory next to main.ts — nothing to hand in');
}
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// 2. Stage the screenshots the same way. The folder may be absent in a
//    bare checkout, so create the destination first and copy only when the
//    source exists.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// 3. Write the dossier: the summary the judge reads, built from exactly
//    what was just staged, so it can never drift from the packaged game.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, dossierCaps));
