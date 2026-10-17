import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = resolve(process.cwd(), 'dist');

if (!existsSync(distDir)) {
  console.error('Error: dist directory does not exist. Run "vite build" first.');
  process.exit(1);
}

function getAllFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = getAllFiles(distDir);
const eligibleFiles = allFiles.filter((file) => {
  const relative = file.replace(distDir, '');
  if (relative.includes('scenarios') || relative.includes('icons') || relative.endsWith('.map')) {
    return false;
  }
  return file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.html');
});

let totalGzipBytes = 0;
for (const file of eligibleFiles) {
  const content = readFileSync(file);
  const gzipped = gzipSync(content);
  totalGzipBytes += gzipped.length;
}

const totalGzipKb = (totalGzipBytes / 1024).toFixed(2);
const MAX_BUDGET_KB = 350;

console.log(`Initial bundle gzip size: ${totalGzipKb} KB (Budget: < ${MAX_BUDGET_KB} KB)`);

if (totalGzipBytes > MAX_BUDGET_KB * 1024) {
  console.error(`FAILED: Initial bundle exceeds ${MAX_BUDGET_KB} KB!`);
  process.exit(1);
}

console.log('Bundle size gate: PASSED');
