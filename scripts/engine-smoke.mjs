import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { TailscaleService } from '../electron/service.mjs';
import { engineSpec } from './engine-spec.mjs';
const exec = promisify(execFile);
await mkdir('test-results', { recursive: true });
const directory = resolve('engine-bin');
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
for (const [name, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(await readFile(join(directory, name))).digest('hex'), hash);
const root = await mkdtemp(join(tmpdir(), 'taildesk-engine-check-'));
const stateDir = join(root, 'Taildesk'); await mkdir(stateDir);
const pipe = String.raw`\\.\pipe\taildesk-smoke-${process.pid}`;
const engine = join(directory, 'taildesk-engine.exe');
assert.match(execFileSync(engine, ['--version'], { encoding: 'utf8', windowsHide: true }), /1\.104\.1/);
const cli = join(directory, 'taildesk-cli.exe');
const env = { ...process.env, TS_NO_LOGS_NO_SUPPORT: 'true', TS_LOGS_DIR: stateDir };
// No adapter, routes, login, account changes, or access to the existing service.
const child = spawn(engine, ['--windows-mode=dev', '--tun=userspace-networking', `--socket=${pipe}`, `--statedir=${stateDir}`, '--port=0', '--no-logs-no-support'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
const exited = once(child, 'exit');
const service = new TailscaleService({ path: cli, socket: pipe });
try {
  let status, last;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(`Engine exited before ready: ${log.slice(-3000)}`);
    try { status = await service.status(); break; } catch (e) { last = e; await new Promise(r => setTimeout(r, 250)); }
  }
  if (!status) throw last;
  assert.equal(status.state, 'NeedsLogin'); assert.equal(status.peers.length, 0);
  service.startWatch();
  await new Promise(r => setTimeout(r, 350));
  assert.ok(service.watcher && service.watcher.exitCode === null, 'Windows user-session watcher remains connected');
  const watched = service.watcher;
  service.stopWatch();
  await Promise.race([once(watched, 'exit'), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Watcher survived parent pipe closure')), 3000); timer.unref(); })]);
  assert.equal(watched.exitCode, 0, 'Watcher exits when the parent input pipe closes');
  const prefs = await service.preferences(); assert.equal(typeof prefs['accept-dns'], 'boolean');
  await assert.rejects(service.ping('8.8.8.8'), /Choose a device/);
  const info = await exec(cli, [`--socket=${pipe}`, 'version', '--json'], { encoding: 'utf8', windowsHide: true });
  assert.match(info.stdout, /1\.104\.1/);
  const help = await exec(engine, ['--help'], { encoding: 'utf8', windowsHide: true }).catch(e => e);
  assert.ok((help.stdout + help.stderr).includes(JSON.stringify(engineSpec.pipe)));
  await writeFile('test-results/engine-smoke.json', JSON.stringify({ verified: true, upstream: engineSpec.version, state: status.state, privatePipe: true, cliAndDaemonBundled: true, adapterCreated: false, signedIn: false }, null, 2));
  console.log('PASS: bundled engine starts in isolation, private CLI IPC works, initial state/preferences correct. No live VPN/account changes.');
} finally {
  service.stopWatch();
  child.kill(); await exited;
  await writeFile(join(root, 'engine.log'), log);
  console.log(`Isolated diagnostics retained at ${root}`);
}
