import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = __dirname; // module-preview/
const srcEntry = path.join(root, 'src', 'app.ts');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

// Parser/spec/diagnostics are SYNCED COPIES of the canonical module-parser/
// package. Fail the build loudly if they've drifted (edit the canonical files
// and run `node module-parser/sync.mjs` instead of editing copies).
function checkParserSync() {
  const syncScript = path.join(root, '..', 'module-parser', 'sync.mjs');
  execFileSync(process.execPath, [syncScript, '--check'], { stdio: 'inherit' });
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) await copyDir(src, dst);
    else await fs.copyFile(src, dst);
  }
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await copyDir(publicDir, distDir);

// Verify the synced parser copies match the canonical module-parser/ source.
checkParserSync();

// Copy a demo module for quick testing.
try {
  const demoSrc = path.resolve(root, '..', '..', 'vscode-module-lang', 'samples', 'example.module');
  await fs.copyFile(demoSrc, path.join(distDir, 'demo.module'));
} catch {
  // ignore
}

await esbuild.build({
  entryPoints: [srcEntry],
  bundle: true,
  outfile: path.join(distDir, 'bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
});

console.log(`Built preview to: ${distDir}`);


