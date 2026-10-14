import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { ENGINE_PIPE } from './engine.mjs';
const exec = promisify(execFile);

export const settings = {
  'accept-dns': ['Use Tailscale DNS', 'Use the DNS settings supplied by your tailnet.'],
  'accept-routes': ['Use subnet routes', 'Reach private networks advertised by other devices.'],
  'shields-up': ['Block incoming connections', 'Prevent other Tailscale devices from connecting to this PC.'],
  'unattended': ['Run unattended', 'Keep Tailscale connected when you sign out of Windows.'],
  'exit-node-allow-lan-access': ['Allow local network access', 'Keep access to your local network while using an exit node.']
};

function peer(p, self = false) {
  return {
    id: String(p.ID || p.PublicKey || p.HostName || ''),
    name: p.HostName || p.DNSName?.split('.')[0] || 'Unnamed device',
    dns: p.DNSName || '', os: p.OS || 'Unknown',
    ips: Array.isArray(p.TailscaleIPs) ? p.TailscaleIPs.filter(x => isIP(x)) : [],
    online: p.Online === true, self, exitNode: p.ExitNode === true,
    exitOption: p.ExitNodeOption === true, lastSeen: p.LastSeen || '',
    route: p.CurAddr ? 'Direct' : p.Active && p.Relay ? 'Relay' : '',
    rx: p.RxBytes || 0, tx: p.TxBytes || 0
  };
}

export function normalize(raw) {
  if (!raw || typeof raw.BackendState !== 'string') throw new Error('Unexpected Tailscale status response. Update Tailscale and try again.');
  return {
    state: raw.BackendState, version: raw.Version || '',
    tailnet: raw.CurrentTailnet?.Name || raw.MagicDNSSuffix || '',
    self: raw.Self ? peer(raw.Self, true) : null,
    peers: Object.values(raw.Peer || {}).map(p => peer(p)).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
    health: Array.isArray(raw.Health) ? raw.Health : []
  };
}

export function mutation(action, value, status) {
  if (action === 'connect') {
    if (status.state !== 'Stopped') throw new Error('Use Sign in to connect Taildesk to your Tailscale account first.');
    return { args: ['up'], title: 'Connect this PC?', detail: 'Reconnect to Tailscale using your saved settings.' };
  }
  if (action === 'disconnect') return { args: ['down'], title: 'Disconnect this PC?', detail: 'Active Tailscale connections, including remote access to this PC, will stop.' };
  if (action === 'exit-node') {
    if (typeof value !== 'string' || (value !== '' && !status.peers.some(p => p.exitOption && p.online && p.ips.includes(value)))) throw new Error('Select an online exit node from your current device list.');
    return { args: ['set', `--exit-node=${value}`], title: value ? 'Use this exit node?' : 'Stop using the exit node?', detail: value ? `Route this PC's internet traffic through ${value}. This changes your internet routing.` : 'Return internet traffic to your normal connection.' };
  }
  if (Object.hasOwn(settings, action) && typeof value === 'boolean') return {
    args: ['set', `--${action}=${value}`], title: `${value ? 'Enable' : 'Disable'} ${settings[action][0].toLowerCase()}?`, detail: settings[action][1]
  };
  throw new Error('Unsupported setting or invalid value.');
}

export class TailscaleService {
  constructor({ run = exec, path, socket = ENGINE_PIPE, exists = existsSync } = {}) {
    // Never resolve an executable from the working directory or an untrusted PATH.
    this.path = path || join(process.resourcesPath || process.cwd(), 'engine', 'taildesk-cli.exe');
    this.socket = socket;
    this.run = run;
    this.exists = exists;
  }
  async command(args, timeout = 15000) {
    if (!this.exists(this.path)) throw new Error('The bundled Taildesk engine is not installed. Run the Taildesk setup program.');
    try {
      const { stdout } = await this.run(this.path, [`--socket=${this.socket}`, ...args], { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', shell: false });
      return stdout.trim();
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') throw new Error('Taildesk did not respond in time. Check its service and try again.');
      throw new Error(String(error.stderr || error.stdout || error.message).trim().slice(0, 1600));
    }
  }
  async status() { return normalize(JSON.parse(await this.command(['status', '--json']))); }
  startWatch() {
    if (this.watching) return;
    this.watching = true;
    const connect = () => {
      if (!this.watching) return;
      // Windows uses a live local-API connection to associate the signed-in OS user.
      // Discard notifications here; status polling exposes only the allowlisted fields.
      const child = spawn(this.path, [`--socket=${this.socket}`, 'debug', 'watch-ipn', '--peer-changes=false', '--peer-patches=false'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], shell: false, env: { ...process.env, TAILDESK_PARENT_WATCH: '1' } });
      this.watcher = child;
      child.once('error', () => {});
      child.once('close', () => {
        if (this.watcher === child) this.watcher = null;
        if (this.watching) { this.watchTimer = setTimeout(connect, 5000); this.watchTimer.unref(); }
      });
    };
    connect();
  }
  stopWatch() { this.watching = false; clearTimeout(this.watchTimer); this.watcher?.stdin.end(); }
  async login() {
    let output;
    try {
      ({ stdout: output } = await this.run(this.path, [`--socket=${this.socket}`, 'up', '--json', '--timeout=12s'], { windowsHide: true, timeout: 16000, maxBuffer: 1024 * 1024, encoding: 'utf8', shell: false }));
    } catch (e) { output = e.stdout || ''; }
    // The CLI can time out while waiting for browser sign-in and still supply a valid URL.
    const match = output.match(/"AuthURL"\s*:\s*("(?:[^"\\]|\\.)*")/);
    if (match) return validateLoginURL(JSON.parse(match[1]));
    const current = await this.status();
    if (['Running', 'NeedsMachineAuth'].includes(current.state)) return null;
    throw new Error('Could not start sign-in. Check the Taildesk service and internet connection, then try again.');
  }
  async preferences() {
    const raw = JSON.parse(await this.command(['get', '--json', 'all']));
    const safe = {};
    for (const key of Object.keys(settings)) if (typeof raw[key] === 'boolean') safe[key] = raw[key];
    safe['exit-node'] = typeof raw['exit-node'] === 'string' ? raw['exit-node'] : '';
    return safe;
  }
  async ping(ip) {
    const state = await this.status();
    if (!isIP(ip) || !state.peers.some(p => p.ips.includes(ip))) throw new Error('Choose a device from your tailnet.');
    return this.command(['ping', '--c=3', '--timeout=3s', '--until-direct=false', ip], 15000);
  }
}

export function validateLoginURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'login.tailscale.com' || url.port || url.username || url.password || !/^\/a\/[a-zA-Z0-9]+\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('The engine returned an unexpected sign-in address.');
  return url.href;
}
