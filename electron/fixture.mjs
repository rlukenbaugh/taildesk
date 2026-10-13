// Fictional data used only by explicitly requested development tests.
export const fixture = {
  state: 'Running', version: '1.104.1', tailnet: 'home.example.ts.net', health: [],
  self: { id: 'self', name: 'windows-desktop', dns: 'windows-desktop.home.example.ts.net.', os: 'windows', ips: ['100.80.10.1'], self: true, online: true },
  peers: [
    { id: 'nas', name: 'home-server', os: 'linux', ips: ['100.80.10.2'], online: true, exitOption: true, route: 'Direct', dns: 'home-server.home.example.ts.net.' },
    { id: 'phone', name: 'my-phone', os: 'iOS', ips: ['100.80.10.3'], online: true, route: 'Relay' },
    { id: 'laptop', name: 'travel-laptop', os: 'windows', ips: ['100.80.10.4'], online: false }
  ]
};
export const fixturePreferences = { 'accept-dns': true, 'accept-routes': true, 'shields-up': false, unattended: true, 'exit-node-allow-lan-access': false, 'exit-node': '' };
