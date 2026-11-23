// SOLMAR BAY — the entry point the grader runs (Node 22, standard
// library only). It hands the game in: game/ and screenshots/ are copied
// from beside this file into the output directory, and dossier.json is
// written there with the vendored make.fun library's buildDossier.
//
// The grader runs `node main.ts` with MAKEFUN_OUTPUT_DIR=/output. To
// check it locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Run it twice and confirm both runs write identical bytes.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function freshDir(path: string) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function copyTree(name: string) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) {
    throw new Error(`missing ${name}/ beside main.ts — nothing to hand in`);
  }
  cpSync(from, join(outputDir, name), { recursive: true });
}

freshDir(outputDir);
copyTree('game');
copyTree('screenshots');

// The scorer's own caps (from the kit's gate): only text_max_bytes shapes
// the dossier's bytes; the others refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; more than 993 entries in
// game/ or 48 MiB of game files in all; a path under game/ over 1000 bytes).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`wrote ${join(outputDir, 'dossier.json')} (${dossier.length} bytes)`);
// Second pass on main.ts: report what was copied, so a failed hand-in
// says which tree is missing instead of failing silently downstream.

import { readdirSync, statSync } from 'node:fs';

function countEntries(path: string): number {
  let total = 0;
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    total += 1;
    if (statSync(child).isDirectory()) total += countEntries(child);
  }
  return total;
}

console.log(`game/: ${countEntries(join(outputDir, 'game'))} entries`);
console.log(`screenshots/: ${readdirSync(join(outputDir, 'screenshots')).join(', ')}`);
