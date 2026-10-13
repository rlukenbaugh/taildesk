const $ = id => document.getElementById(id);
const api = window.taildesk;
let state = null, prefs = null, refreshing = false, busy = false, toastTimer, pendingExit = null;
const descriptions = {
  'accept-dns': ['Use Tailscale DNS', 'Use the DNS settings supplied by your tailnet.'],
  'accept-routes': ['Use subnet routes', 'Reach private networks advertised by other devices.'],
  'shields-up': ['Block incoming connections', 'Prevent other Tailscale devices from connecting to this PC.'],
  unattended: ['Run unattended', 'Stay connected when you sign out of Windows.'],
  'exit-node-allow-lan-access': ['Allow local network access', 'Reach your local network while using an exit node.']
};
async function call(method, ...args) { const r = await api[method](...args); if (!r.ok) throw new Error(r.error); return r.value; }
function element(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 3000); }
function run(fn) { return async () => { try { await fn(); } catch(e) { error(e.message); } }; }
function icon(os) { return /ios|android/i.test(os) ? '▯' : /linux/i.test(os) ? '▤' : '▣'; }
function address(ip) { const b = element('button', 'address-button', `${ip} ⧉`); b.title = 'Copy IP address'; b.setAttribute('aria-label', `Copy ${ip}`); b.onclick = run(async () => { await call('copy', ip); toast('IP address copied'); }); return b; }
function identity(p) {
  const cell = element('div', 'device-cell'); cell.append(element('div', 'device-icon', icon(p.os)));
  const info = element('div'); const name = element('div', 'device-name', p.name); name.title = p.name; info.append(name, element('div', 'device-detail', `${p.os}${p.exitOption ? ' · Exit node' : ''}${p.route ? ` · ${p.route}` : ''}`)); cell.append(info); return cell;
}
function renderPeers() {
  if (!state) return;
  const term = $('search').value.toLowerCase(), filter = $('filter').value;
  const peers = state.peers.filter(p => `${p.name} ${p.dns} ${p.os} ${p.ips.join(' ')}`.toLowerCase().includes(term) && (filter === 'all' || p.online === (filter === 'online')));
  $('peer-list').replaceChildren();
  for (const p of peers) {
    const row = element('div', 'device-row'); row.append(identity(p), p.ips[0] ? address(p.ips[0]) : element('span', 'muted', 'No address'), element('span', `status ${p.online ? 'online' : ''}`, p.online ? 'Online' : 'Offline'));
    const ping = element('button', 'ping-button', 'Ping'); ping.disabled = !p.ips[0] || state.state !== 'Running'; ping.setAttribute('aria-label', `Ping ${p.name}`);
    ping.onclick = run(async () => { $('ping-result').textContent = `Checking ${p.name}…`; $('ping-dialog').showModal(); try { $('ping-result').textContent = await call('ping', p.ips[0]); } catch(e) { $('ping-result').textContent = e.message; } });
    row.append(ping); $('peer-list').append(row);
  }
  $('empty').hidden = peers.length !== 0;
  $('peer-count').textContent = state.peers.length;
  $('online-count').textContent = `${state.peers.filter(p => p.online).length} online`;
}
function renderStatus() {
  const connected = state.state === 'Running';
  document.querySelector('.connection').classList.toggle('offline', !connected);
  $('connection-state').textContent = connected ? 'Connected to your tailnet' : state.state === 'Stopped' ? 'Tailscale is disconnected' : `Tailscale: ${state.state}`;
  $('state-badge').textContent = connected ? 'CONNECTED' : 'OFFLINE';
  $('connection-description').textContent = state.tailnet || 'Open the official Tailscale app to sign in.';
  $('connect').textContent = connected ? 'Disconnect' : state.state === 'Stopped' ? 'Connect' : 'Open Tailscale';
  $('connect').disabled = busy;
  $('health').textContent = state.health.join('\n'); $('health').hidden = !state.health.length;
  $('self-card').replaceChildren();
  if (state.self) {
    const info = identity(state.self); info.classList.add('self-info'); $('self-card').append(info);
    if (state.self.ips[0]) $('self-card').append(address(state.self.ips[0]));
  } else $('self-card').append(element('p', 'muted', 'No signed-in device. Open the official Tailscale app to finish setup.'));
  $('version').textContent = `TAILSCALE ${state.version.split('-')[0]}`;
  $('updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Refreshes every 10 seconds`;
  renderPeers();
}
function renderPreferences() {
  $('settings-list').replaceChildren();
  for (const [key, [title, detail]] of Object.entries(descriptions)) {
    const row = element('div', 'setting'), copy = element('div'); copy.append(element('h3', '', title), element('p', '', detail));
    const known = typeof prefs?.[key] === 'boolean';
    const toggle = element('button', 'toggle', known ? prefs[key] ? 'On' : 'Off' : 'Unknown'); toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', title); toggle.setAttribute('aria-checked', String(prefs?.[key] === true)); toggle.disabled = busy || !known;
    toggle.onclick = run(() => change(key, !prefs[key])); row.append(copy, toggle); $('settings-list').append(row);
  }
  const select = $('exit-node');
  const desired = pendingExit ?? prefs?.['exit-node'] ?? '';
  select.replaceChildren(new Option('None — use this PC’s internet connection', ''));
  const nodes = (state?.peers || []).filter(p => p.exitOption && p.ips.length);
  for (const p of nodes) { const option = new Option(`${p.name}${p.online ? '' : ' (offline)'}`, p.ips[0]); option.disabled = !p.online; select.append(option); }
  const matched = nodes.find(p => p.ips.includes(desired) || p.id === desired || p.name === desired || p.dns?.replace(/\.$/, '') === desired.replace(/\.$/, ''));
  if (desired && !matched) select.append(new Option(`Current: ${desired}`, desired));
  select.value = matched?.ips[0] || desired;
  select.disabled = busy || !prefs; $('apply-exit').disabled = busy || !prefs;
  $('exit-hint').textContent = nodes.length ? `${nodes.filter(p => p.online).length} exit node(s) available. Offline nodes cannot be selected.` : 'No exit nodes are advertised by your other devices.';
}
async function refresh() {
  if (refreshing || busy) return;
  refreshing = true; $('refresh').disabled = true;
  try {
    const [s, p] = await Promise.allSettled([call('status'), call('preferences')]);
    if (s.status === 'rejected') throw s.reason;
    state = s.value; prefs = p.status === 'fulfilled' ? p.value : null;
    error(p.status === 'rejected' ? `Device status is available, but settings could not be read: ${p.reason.message}` : '');
    renderStatus(); renderPreferences();
  } catch(e) {
    state = null; prefs = null; pendingExit = null; error(e.message);
    document.querySelector('.connection').classList.add('offline');
    $('connection-state').textContent = 'Service unavailable'; $('state-badge').textContent = 'UNKNOWN'; $('connection-description').textContent = 'Open Tailscale and refresh to try again.'; $('connect').disabled = true;
    $('peer-list').replaceChildren(); $('self-card').replaceChildren(element('p', 'muted', 'Live device information is unavailable.')); $('peer-count').textContent = '—'; $('online-count').textContent = ''; $('updated').textContent = 'Refresh failed — retrying automatically'; $('health').hidden = true; renderPreferences();
  } finally { refreshing = false; $('refresh').disabled = false; }
}
async function change(action, value) {
  if (busy) return; busy = true; $('connect').disabled = true; renderPreferences();
  try { const result = await call('change', action, value); if (!result.cancelled) { if (action === 'exit-node') pendingExit = null; toast('Tailscale change applied'); } }
  finally { busy = false; await refresh(); }
}
for (const b of document.querySelectorAll('[data-page]')) b.onclick = () => {
  for (const p of document.querySelectorAll('.page')) p.hidden = p.id !== b.dataset.page;
  for (const n of document.querySelectorAll('.nav')) n.classList.toggle('active', n === b);
  $('page-title').textContent = ({devices:'Your devices',routing:'Exit node',settings:'Settings',about:'About Taildesk'})[b.dataset.page];
};
$('search').oninput = renderPeers; $('filter').onchange = renderPeers;
$('refresh').onclick = refresh;
$('connect').onclick = run(async () => { if (!state) return; if (!['Running', 'Stopped'].includes(state.state)) await call('openOfficial'); else await change(state.state === 'Running' ? 'disconnect' : 'connect'); });
$('apply-exit').onclick = run(() => change('exit-node', $('exit-node').value));
$('exit-node').onchange = () => { pendingExit = $('exit-node').value; };
$('official').onclick = run(() => call('openOfficial')); $('quit').onclick = run(() => call('quit'));
$('close-ping').onclick = () => $('ping-dialog').close();
await refresh(); setInterval(refresh, 10000);
