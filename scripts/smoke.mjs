import { _electron as electron } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const live = process.argv.includes('--live');
const packed = process.argv.includes('--packaged');
const failure = process.argv.includes('--service-error');
await mkdir('test-results', { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const instance = await electron.launch({ ...(packed ? { executablePath: resolve('release/win-unpacked/Taildesk.exe') } : {}), args: packed ? [] : ['.', ...(live ? [] : ['--fixture']), ...(failure ? ['--service-error'] : [])], env });
console.log('Electron launched.');
try {
  const page = await instance.firstWindow();
  page.setDefaultTimeout(20000);
  console.log('Application window opened.');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
  if (failure) {
    assert.equal(await page.locator('#connection-state').innerText(), 'Service unavailable');
    assert.equal(await page.locator('#connect').isDisabled(), true);
    assert.equal(await page.locator('#error').isVisible(), true);
  } else {
    await page.waitForFunction(() => document.querySelector('#connection-state').textContent !== 'Checking connection…');
    assert.notEqual(await page.locator('#connection-state').innerText(), 'Service unavailable');
    const count = await page.locator('.device-row').count(); assert.ok(count >= 1);
    await page.locator('#search').fill('no-such-device-12345'); assert.equal(await page.locator('.device-row').count(), 0);
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.locator('#search').fill(''); assert.equal(await page.locator('.device-row').count(), count);
    await page.locator('[data-page="settings"]').click(); assert.equal(await page.getByRole('switch').count(), 5);
    await page.locator('[data-page="routing"]').click(); assert.ok(await page.locator('#exit-node option').count() >= 1);
    await page.locator('[data-page="devices"]').click();
    if (!live && !packed) {
      // Intercept native confirmations in fixture tests. No live service writes.
      await instance.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
      await page.locator('#connect').click(); await page.waitForFunction(() => !document.querySelector('#connect').disabled);
      assert.match(await page.locator('#connection-state').innerText(), /Connected/);
      await instance.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
      await page.locator('#connect').click(); await page.waitForFunction(() => document.querySelector('#connect').textContent === 'Connect');
      await page.locator('#connect').click(); await page.waitForFunction(() => document.querySelector('#connect').textContent === 'Disconnect');
      await page.locator('[data-page="settings"]').click();
      const block = page.getByRole('switch', { name: 'Block incoming connections' }); await block.click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Block incoming connections"]').getAttribute('aria-checked') === 'true');
      await page.locator('[data-page="routing"]').click(); await page.locator('#exit-node').selectOption('100.80.10.2');
      await page.locator('#refresh').click(); await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
      assert.equal(await page.locator('#exit-node').inputValue(), '100.80.10.2', 'Refresh must preserve an unsubmitted selection');
      await page.locator('#apply-exit').click();
      await page.waitForFunction(() => !document.querySelector('#apply-exit').disabled); assert.equal(await page.locator('#exit-node').inputValue(), '100.80.10.2');
      await page.locator('[data-page="devices"]').click(); await page.getByRole('button', { name: 'Ping home-server', exact: true }).click(); await page.waitForFunction(() => document.querySelector('#ping-result').textContent.includes('pong')); await page.locator('#close-ping').click();
    }
  }
  // Screenshots containing real device names stay local and ignored by Git.
  await page.screenshot({ path: `test-results/${failure ? 'service-error' : packed ? 'packaged-live' : live ? 'live' : 'fixture'}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS: ${failure ? 'missing service' : packed ? 'packaged live service (read-only)' : live ? 'live service (read-only)' : 'fixture controls, confirmations, settings, routing and ping'} smoke test.`);
} finally { await instance.close(); }
