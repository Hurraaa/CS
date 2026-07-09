// Build: bundle src/main.js (+ three) into ONE classic IIFE script with a content
// hash, then inject its name + the version into a fresh dist/index.html.
//
// Why IIFE + classic <script src> (not ES module / importmap / inline):
//   iOS Safari has repeatedly failed to run large trailing inline module scripts,
//   and importmap needs iOS 16.4+. A classic hashed script is the portable path.
//   (See docs/CLAUDE_THREEJS_MOBIL_OYUN_REHBERI.md §3.)

import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',                 // classic script, no import/export at runtime
  target: ['es2018', 'safari12'], // wide mobile reach
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  entryNames: 'game-[hash]',      // content hash → no stale CDN cache
  outdir: 'dist',
  metafile: true,
});

// Find the emitted hashed filename
const outFile = Object.keys(result.metafile.outputs).find(f => f.endsWith('.js'));
const gameJs = outFile.replace(/^dist\//, './');
console.log('bundled:', gameJs);

// Inject placeholders into index.html and write dist/index.html
let html = readFileSync('index.html', 'utf8');
html = html.replaceAll('__GAME_JS__', gameJs).replaceAll('__BUILD__', 'v' + version);
writeFileSync('dist/index.html', html);

// Copy static assets that the deployed site references (previews for README are not needed in dist)
for (const asset of ['favicon.ico']) {
  if (existsSync(asset)) cpSync(asset, 'dist/' + asset);
}

console.log('build ok → dist/ (version v' + version + ')');
