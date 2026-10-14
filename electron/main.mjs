import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, clipboard, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { TailscaleService, mutation } from './service.mjs';
import { fixture, fixturePreferences } from './fixture.mjs';
import { EngineManager } from './engine.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageURL = pathToFileURL(join(root, 'src/index.html')).href;
const testMode = !app.isPackaged && process.argv.includes('--fixture');
const testError = testMode && process.argv.includes('--service-error');
if (testMode) { const data = join(app.getPath('temp'), `taildesk-fixture-${process.pid}`); mkdirSync(data, { recursive: true }); app.setPath('userData', data); }
const engineDir = app.isPackaged ? join(process.resourcesPath, 'engine') : join(root, 'engine-bin');
const service = new TailscaleService({ path: join(engineDir, 'taildesk-cli.exe') });
const manager = new EngineManager({ directory: engineDir, packaged: app.isPackaged });
let win, tray, quitting = false, changing = false;
const readStatus = async () => { if (testError) throw new Error('Taildesk service is not running. Start it with the service button.'); return testMode ? structuredClone(fixture) : service.status(); };

function register(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    try {
      if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== pageURL) throw new Error('Untrusted application frame.');
      return { ok: true, value: await fn(...args) };
    } catch (e) { return { ok: false, error: e.message }; }
  });
}

function show() { win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.on('before-quit', () => { quitting = true; service.stopWatch(); });
  app.whenReady().then(async () => {
  if (!testMode) service.startWatch();
  app.setAppUserModelId('com.rlukenbaugh.taildesk');
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1120, height: 800, minWidth: 900, minHeight: 650, title: 'Taildesk', backgroundColor: '#f6f7f9', icon: join(root, 'build/icon.png'), show: false,
    webPreferences: { preload: join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.on('close', event => { if (!quitting && tray) { event.preventDefault(); win.hide(); } });
  win.once('ready-to-show', () => { if (!process.argv.includes('--start-hidden') || !tray) show(); });
  try {
    tray = new Tray(nativeImage.createFromPath(join(root, 'build/icon.png')).resize({ width: 32, height: 32 }));
    tray.setToolTip('Taildesk — independent VPN client');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Taildesk', click: show }, { type: 'separator' }, { label: 'Quit Taildesk', click: () => app.quit() }]));
    tray.on('double-click', show);
  } catch { /* Keep normal close behavior if Windows cannot create a tray icon. */ }
  register('status', readStatus);
  register('preferences', () => testMode ? structuredClone(fixturePreferences) : service.preferences());
  register('engine-info', () => testMode ? { installed: true, running: !testError, bundled: true, officialRunning: testError, automatic: false } : manager.info());
  register('engine-action', async action => {
    if (changing) throw new Error('Another change is still in progress.');
    const plans = {
      Start: ['Start Taildesk VPN service?', 'Taildesk uses its own engine. The existing Tailscale service must be stopped first. Windows will ask for administrator approval.'],
      Stop: ['Stop Taildesk VPN service?', 'This disconnects Taildesk and any remote sessions using it. Your existing Tailscale installation is preserved.'],
      EnableStartup: ['Start Taildesk with Windows?', 'Enable automatic startup of the Taildesk VPN service. If the original Tailscale service is installed and stopped, change it to manual startup to prevent competing VPN services.']
    };
    if (!Object.hasOwn(plans, action)) throw new Error('Unsupported engine action.');
    changing = true;
    try {
      const [message, detail] = plans[action];
      const answer = await dialog.showMessageBox(win, { type: 'question', message, detail, buttons: ['Cancel', 'Continue'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response !== 1) return { cancelled: true };
      if (!testMode) await manager.action(action);
      return { cancelled: false };
    } finally { changing = false; }
  });
  register('sign-in', async () => {
    if (changing) throw new Error('Another change is still in progress.');
    changing = true;
    try {
      const answer = await dialog.showMessageBox(win, { type: 'question', message: 'Sign Taildesk into your Tailscale network?', detail: 'Your browser will open Tailscale’s sign-in page. Taildesk joins as a separate device and connects after approval. Use your existing account.', buttons: ['Cancel', 'Sign in'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response !== 1) return { cancelled: true };
      if (!testMode) { const url = await service.login(); if (url) await shell.openExternal(url); }
      return { cancelled: false };
    } finally { changing = false; }
  });
  register('change', async (action, value) => {
    if (changing) throw new Error('Another change is still in progress.');
    changing = true;
    try {
      const state = await readStatus();
      const plan = mutation(action, value, state);
      const answer = await dialog.showMessageBox(win, { type: 'question', title: 'Confirm Tailscale change', message: plan.title, detail: plan.detail, buttons: ['Cancel', 'Apply change'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response !== 1) return { cancelled: true };
      if (testMode) {
        if (action === 'connect' || action === 'disconnect') fixture.state = action === 'connect' ? 'Running' : 'Stopped';
        else fixturePreferences[action] = value;
      } else await service.command(plan.args, 30000);
      return { cancelled: false };
    } finally { changing = false; }
  });
  register('ping', ip => testMode ? 'pong from home-server (100.80.10.2) via direct in 4ms' : service.ping(ip));
  register('copy', async value => {
    const state = await readStatus();
    const allowed = [state.self, ...state.peers].filter(Boolean).flatMap(p => [...p.ips, p.dns].filter(Boolean));
    if (typeof value !== 'string' || !allowed.includes(value)) throw new Error('Choose a current device address.');
    clipboard.writeText(value);
  });
  register('quit', () => app.quit());
  await win.loadURL(pageURL);
  }).catch(error => { console.error(error); app.exit(1); });
}
