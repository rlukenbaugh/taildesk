import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, clipboard } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { TailscaleService, mutation } from './service.mjs';
import { fixture, fixturePreferences } from './fixture.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageURL = pathToFileURL(join(root, 'src/index.html')).href;
const testMode = !app.isPackaged && process.argv.includes('--fixture');
const testError = testMode && process.argv.includes('--service-error');
const service = new TailscaleService();
let win, tray, quitting = false, changing = false;
const readStatus = async () => { if (testError) throw new Error('Tailscale service is unavailable. Open the official app and try again.'); return testMode ? structuredClone(fixture) : service.status(); };

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
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(async () => {
  app.setAppUserModelId('com.rlukenbaugh.taildesk');
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1120, height: 800, minWidth: 900, minHeight: 650, title: 'Taildesk', backgroundColor: '#f6f7f9', icon: join(root, 'build/icon.png'), show: false,
    webPreferences: { preload: join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.on('close', event => { if (!quitting && tray) { event.preventDefault(); win.hide(); } });
  win.once('ready-to-show', show);
  try {
    tray = new Tray(nativeImage.createFromPath(join(root, 'build/icon.png')).resize({ width: 32, height: 32 }));
    tray.setToolTip('Taildesk — Tailscale companion');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Taildesk', click: show }, { type: 'separator' }, { label: 'Quit Taildesk', click: () => app.quit() }]));
    tray.on('double-click', show);
  } catch { /* Keep normal close behavior if Windows cannot create a tray icon. */ }
  register('status', readStatus);
  register('preferences', () => testMode ? structuredClone(fixturePreferences) : service.preferences());
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
  register('open-official', () => new Promise((resolve, reject) => {
    const child = spawn(join(dirname(service.path), 'tailscale-ipn.exe'), [], { detached: true, stdio: 'ignore', shell: false });
    child.once('error', () => reject(new Error('Could not open the official Tailscale app. Open it from the Start menu.')));
    child.once('spawn', () => { child.unref(); resolve(); });
  }));
  register('quit', () => app.quit());
  await win.loadURL(pageURL);
  }).catch(error => { console.error(error); app.exit(1); });
}
