import test from 'node:test';
import assert from 'node:assert/strict';
import { TailscaleService, normalize, mutation } from '../electron/service.mjs';
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
  assert.throws(() => mutation('connect', null, { state: 'NeedsLogin' }), /sign in/);
  assert.deepEqual(mutation('disconnect', null, fixture).args, ['down']);
});
test('CLI uses absolute path, argument arrays, timeouts, and no shell', async () => {
  let captured;
  const service = new TailscaleService({ path: 'C:\\Program Files\\Tailscale\\tailscale.exe', exists: () => true, run: async (...args) => { captured = args; return { stdout: '{"BackendState":"Stopped"}' }; } });
  assert.equal((await service.status()).state, 'Stopped');
  assert.deepEqual(captured[1], ['status', '--json']); assert.equal(captured[2].shell, false); assert.equal(captured[2].windowsHide, true); assert.ok(captured[2].timeout > 0);
});
test('missing service and process timeout produce useful errors', async () => {
  const missing = new TailscaleService({ exists: () => false }); await assert.rejects(missing.status(), /not installed/);
  const timeout = new TailscaleService({ exists: () => true, run: async () => { throw { killed: true }; } }); await assert.rejects(timeout.status(), /did not respond/);
});
test('ping rejects arbitrary hosts and argument injection', async () => {
  const service = new TailscaleService(); service.status = async () => fixture;
  for (const ip of ['example.com', '--help', '8.8.8.8']) await assert.rejects(service.ping(ip), /Choose a device/);
});
