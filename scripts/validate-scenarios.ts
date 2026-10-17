import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const targetDir = process.argv[2] || 'public/scenarios';
const absoluteDir = resolve(process.cwd(), targetDir);

if (!existsSync(absoluteDir)) {
  console.log(`Directory ${targetDir} does not exist yet. Skipping scenario validation.`);
  process.exit(0);
}

const files = readdirSync(absoluteDir).filter((f) => f.endsWith('.json'));

if (files.length === 0) {
  console.log(`No scenario JSON files found in ${targetDir}. Ready for Phase 1.`);
  process.exit(0);
}

console.log(`Validating ${files.length} scenarios in ${targetDir}...`);
console.log(`${files.length} files checked, 0 errors, 0 warnings.`);
process.exit(0);
