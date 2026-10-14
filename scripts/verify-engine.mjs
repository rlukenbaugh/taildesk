import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { engineSpec } from './engine-spec.mjs';
const manifest = JSON.parse(await readFile('engine-bin/manifest.json', 'utf8'));
assert.equal(manifest.commit, engineSpec.commit);
for (const name of ['taildesk-cli.exe', 'taildesk-engine.exe', 'wintun.dll']) {
  const hash = createHash('sha256').update(await readFile(join('engine-bin', name))).digest('hex');
  assert.equal(hash, manifest.files[name], `Bundled ${name} changed; rebuild the engine.`);
}
for (const name of ['Tailscale-LICENSE.txt', 'Wintun-LICENSE.txt']) assert.ok((await readFile(join('engine-bin/licenses', name))).length > 100);
console.log('Engine version, three binary checksums and license files verified.');
