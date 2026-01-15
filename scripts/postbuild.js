import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyIfExists(src, dest) {
  try {
    await fs.copyFile(src, dest);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function copyPngAssets() {
  const entries = await fs.readdir(publicDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      await fs.copyFile(
        path.join(publicDir, entry.name),
        path.join(distDir, entry.name)
      );
    }
  }
}

async function copyManifestFiles() {
  // Copy public/farcaster.json (non-dot path)
  await copyIfExists(
    path.join(publicDir, 'farcaster.json'),
    path.join(distDir, 'farcaster.json')
  );

  // Copy .well-known/farcaster.json
  const wellKnownSrc = path.join(publicDir, '.well-known');
  const wellKnownDest = path.join(distDir, '.well-known');
  await ensureDir(wellKnownDest);
  await copyIfExists(
    path.join(wellKnownSrc, 'farcaster.json'),
    path.join(wellKnownDest, 'farcaster.json')
  );

  // Copy share.html for embed previews
  await copyIfExists(
    path.join(publicDir, 'share.html'),
    path.join(distDir, 'share.html')
  );
}

async function run() {
  await ensureDir(distDir);
  await copyPngAssets();
  await copyManifestFiles();
}

run().catch(error => {
  console.error('Postbuild failed:', error);
  process.exit(1);
});
