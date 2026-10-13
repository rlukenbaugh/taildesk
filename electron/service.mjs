import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isIP } from 'node:net';
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
    if (status.state !== 'Stopped') throw new Error('Use the official Tailscale app to sign in or reauthenticate first.');
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
  constructor({ run = exec, path, exists = existsSync } = {}) {
    // Never resolve an executable from the working directory or an untrusted PATH.
    this.path = path || join(process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
    this.run = run;
    this.exists = exists;
  }
  async command(args, timeout = 15000) {
    if (!this.exists(this.path)) throw new Error('Tailscale is not installed in Program Files. Install the official Windows client first.');
    try {
      const { stdout } = await this.run(this.path, args, { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', shell: false });
      return stdout.trim();
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') throw new Error('Tailscale did not respond in time. Check the official app and try again.');
      throw new Error(String(error.stderr || error.stdout || error.message).trim().slice(0, 1600));
    }
  }
  async status() { return normalize(JSON.parse(await this.command(['status', '--json']))); }
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
