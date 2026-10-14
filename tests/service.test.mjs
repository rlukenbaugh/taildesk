import test from 'node:test';
import assert from 'node:assert/strict';
import { TailscaleService, normalize, mutation, validateLoginURL } from '../electron/service.mjs';
import { ENGINE_PIPE, EngineManager } from '../electron/engine.mjs';
import { fixture } from '../electron/fixture.mjs';

test('status strips private fields and sorts online peers first', () => {
  const s = normalize({ BackendState: 'Running', AuthURL: 'secret', Self: { HostName: 'pc', TailscaleIPs: ['100.64.0.1'] }, Peer: { a: { HostName: 'offline', Online: false }, b: { HostName: 'online', Online: true, TailscaleIPs: ['100.64.0.2', 'bad'] } } });
  assert.equal(s.peers[0].name, 'online'); assert.deepEqual(s.peers[0].ips, ['100.64.0.2']); assert.equal('AuthURL' in s, false);
});
test('missing or malformed status does not appear connected', () => { assert.throws(() => normalize({}), /Unexpected/); assert.throws(() => normalize(null)); });
test('only known boolean preferences are writable', () => {
  assert.throws(() => mutation('accept-dns', 'false', fixture));
  assert.throws(() => mutation('auth-key', 'secret', fixture));
  assert.throws(() => mutation('__proto__', true, fixture));
  assert.deepEqual(mutation('shields-up', true, fixture).args, ['set', '--shields-up=true']);
});
test('exit nodes must be currently online and advertised', () => {
  assert.deepEqual(mutation('exit-node', '100.80.10.2', fixture).args, ['set', '--exit-node=100.80.10.2']);
  assert.deepEqual(mutation('exit-node', '', fixture).args, ['set', '--exit-node=']);
  for (const value of ['100.80.10.3', '--reset', null]) assert.throws(() => mutation('exit-node', value, fixture));
  const offline = structuredClone(fixture); offline.peers[0].online = false; assert.throws(() => mutation('exit-node', '100.80.10.2', offline));
});
test('reconnect preserves saved preferences; unsigned-in accounts cannot connect silently', () => {
  assert.deepEqual(mutation('connect', null, { state: 'Stopped' }).args, ['up']);
  assert.throws(() => mutation('connect', null, { state: 'NeedsLogin' }), /Sign in/);
  assert.deepEqual(mutation('disconnect', null, fixture).args, ['down']);
});
test('CLI uses absolute path, argument arrays, timeouts, and no shell', async () => {
  let captured;
  const service = new TailscaleService({ path: 'C:\\Program Files\\Taildesk\\resources\\engine\\taildesk-cli.exe', exists: () => true, run: async (...args) => { captured = args; return { stdout: '{"BackendState":"Stopped"}' }; } });
  assert.equal((await service.status()).state, 'Stopped');
  assert.deepEqual(captured[1], [`--socket=${ENGINE_PIPE}`, 'status', '--json']); assert.equal(captured[2].shell, false); assert.equal(captured[2].windowsHide, true); assert.ok(captured[2].timeout > 0);
});

test('sign-in only opens a Tailscale authentication URL, never arbitrary engine text', () => {
  assert.equal(validateLoginURL('https://login.tailscale.com/a/abc123'), 'https://login.tailscale.com/a/abc123');
  for (const value of ['file:///C:/Windows/System32/cmd.exe', 'https://login.tailscale.com.evil.test/a/abc', 'https://user@login.tailscale.com/a/abc', 'https://login.tailscale.com:444/a/abc', 'https://login.tailscale.com/a/abc?redirect=https://evil.test', 'http://login.tailscale.com/a/abc', 'https://login.tailscale.com/admin', 'javascript:alert(1)']) assert.throws(() => validateLoginURL(value));
});
test('sign-in accepts the URL emitted before a CLI authentication wait times out', async () => {
  let args;
  const service = new TailscaleService({ run: async (_file, a) => { args = a; throw { stdout: '{"AuthURL":"https://login.tailscale.com/a/abc123"}', code: 1 }; } });
  assert.equal(await service.login(), 'https://login.tailscale.com/a/abc123');
  assert.equal(args[0], `--socket=${ENGINE_PIPE}`); assert.equal(args.includes('--force-reauth'), false);
});
test('service elevation is unavailable from portable or development locations', async () => {
  let invoked = false;
  const manager = new EngineManager({ directory: 'C:\\Users\\Public\\Taildesk', packaged: true, run: async () => { invoked = true; } });
  await assert.rejects(manager.action('Start'), /setup program/);
  await assert.rejects(manager.action('DeleteEverything'), /Unsupported/);
  assert.equal(invoked, false);
});
test('missing service and process timeout produce useful errors', async () => {
  const missing = new TailscaleService({ exists: () => false }); await assert.rejects(missing.status(), /not installed/);
  const timeout = new TailscaleService({ exists: () => true, run: async () => { throw { killed: true }; } }); await assert.rejects(timeout.status(), /did not respond/);
});
test('ping rejects arbitrary hosts and argument injection', async () => {
  const service = new TailscaleService(); service.status = async () => fixture;
  for (const ip of ['example.com', '--help', '8.8.8.8']) await assert.rejects(service.ping(ip), /Choose a device/);
});
