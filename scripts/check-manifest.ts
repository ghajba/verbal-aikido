import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), process.argv[2] || 'dist');
const manifestPath = resolve(distDir, 'manifest.webmanifest');

if (!existsSync(manifestPath)) {
  console.error(`Error: manifest file not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

if (!manifest.name || !manifest.short_name || !manifest.start_url || !manifest.icons) {
  console.error('Error: Manifest missing essential fields (name, short_name, start_url, icons)');
  process.exit(1);
}

for (const icon of manifest.icons) {
  const iconPath = resolve(distDir, icon.src);
  if (!existsSync(iconPath)) {
    console.error(`Error: Referenced icon does not exist in dist: ${icon.src}`);
    process.exit(1);
  }
}

console.log('Manifest and icon check: PASSED');
