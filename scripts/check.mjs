import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
let count = 0;
for (const dir of ['electron', 'src', 'scripts', 'tests']) {
  for (const file of await readdir(dir)) {
    if (/\.(mjs|cjs|js)$/.test(file)) { execFileSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' }); count++; }
  }
}
console.log(`Syntax checks passed for ${count} JavaScript files.`);
