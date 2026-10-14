import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { engineSpec as spec } from './engine-spec.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build the engine on Windows x64.');
const source = resolve('.engine-source'), out = resolve('engine-bin');
const go = process.env.TAILDESK_GO || (existsSync('C:/tools/go/bin/go.exe') ? 'C:/tools/go/bin/go.exe' : 'go');
function copyFileSync(from, to) { if (existsSync(to)) chmodSync(to, 0o666); writeFileSync(to, readFileSync(from)); }
function run(exe, args, options = {}) { return execFileSync(exe, args, { cwd: source, stdio: 'inherit', windowsHide: true, ...options }); }
if (!existsSync(source)) execFileSync('git', ['clone', '--depth', '1', '--branch', `v${spec.version}`, 'https://github.com/tailscale/tailscale.git', source], { stdio: 'inherit' });
if (run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim() !== spec.commit) throw new Error('Unexpected engine source revision.');
// Always derive patched files from the pinned upstream commit, never from prior build output.
function patch(file, replacements) {
  let text = run('git', ['show', `${spec.commit}:${file}`], { encoding: 'utf8', stdio: 'pipe', maxBuffer: 4 * 1024 * 1024 });
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`Upstream patch anchor absent: ${file}: ${from}`);
    text = text.replaceAll(from, to);
  }
  writeFileSync(join(source, file), text);
}
patch('paths/paths.go', [
  [String.raw`Tailscale\tailscaled`, String.raw`Taildesk\tailscaled`],
  ['"Tailscale", "server-state.conf"', '"Taildesk", "server-state.conf"'],
  [String.raw`\pipe\tailscale-`, String.raw`\pipe\taildesk-`]
]);
patch('paths/paths_windows.go', [['!= "tailscale"', '!= "taildesk"']]);
patch('cmd/tailscaled/tailscaled_windows.go', [['const serviceName = "Tailscale"', 'const serviceName = "Taildesk"']]);
patch('cmd/tailscaled/tailscaled.go', [
  ['case "windows":\n\t\treturn "Tailscale"', 'case "windows":\n\t\treturn "Taildesk"'],
  ['filepath.Base(dir), "tailscale"', 'filepath.Base(dir), "taildesk"'],
  ['if err := applyWindowsMode(); err != nil {', 'if err := taildeskCheckConflict(args.windowsMode == "dev"); err != nil { log.Fatal(err) };\n\t\tif err := applyWindowsMode(); err != nil {']
]);
patch('net/tstun/tun_windows.go', [['tun.WintunTunnelType = "Tailscale"', 'tun.WintunTunnelType = "Taildesk"'], ['{37217669-42da-4657-a55b-0d995d328250}', spec.adapterGuid]]);
patch('tsconst/tsconst.go', [['"Tailscale Tunnel"', '"Taildesk Tunnel"']]);
patch('wgengine/router/osrouter/router_windows.go', [['Tailscale-Process', 'Taildesk-Process'], ['Tailscale-In', 'Taildesk-In']]);
patch('net/dns/manager_windows.go', [['# TailscaleHostsSectionStart', '# TaildeskHostsSectionStart'], ['# TailscaleHostsSectionEnd', '# TaildeskHostsSectionEnd']]);
patch('net/dns/nrpt_windows.go', [['{5abe529b-675b-4486-8459-25a634dacc23}', '{a3ec5d42-ff41-4a9b-9184-141a64d05d49}']]);
patch('util/winutil/winutil_windows.go', [[String.raw`SOFTWARE\Tailscale IPN`, String.raw`SOFTWARE\Taildesk IPN`], [String.raw`SOFTWARE\Policies\Tailscale`, String.raw`SOFTWARE\Policies\Taildesk`]]);
patch('util/syspolicy/source/policy_store_windows.go', [[String.raw`Policies\Tailscale`, String.raw`Policies\Taildesk`], ['`Tailscale IPN`', '`Taildesk IPN`']]);
for (const file of ['logpolicy/logpolicy.go', 'envknob/envknob.go', 'ipn/auditlog/store.go', 'cmd/tailscaled/syspolicy.go']) patch(file, [['"Tailscale"', '"Taildesk"']]);
// Local telemetry and state stay independent. Keep upstream cryptography, protocol and access controls.
writeFileSync(join(source, 'cmd/tailscaled/taildesk_guard_windows.go'), `package main
import (
 "errors"
 "fmt"
 "golang.org/x/sys/windows"
 "golang.org/x/sys/windows/svc"
 "golang.org/x/sys/windows/svc/mgr"
)
func taildeskCheckConflict(dev bool) error {
 if dev { return nil }
 m, err := mgr.Connect(); if err != nil { return fmt.Errorf("check existing VPN service: %w", err) }; defer m.Disconnect()
 s, err := m.OpenService("Tailscale")
 if errors.Is(err, windows.ERROR_SERVICE_DOES_NOT_EXIST) { return nil }
 if err != nil { return fmt.Errorf("check existing Tailscale service: %w", err) }; defer s.Close()
 status, err := s.Query(); if err != nil { return err }
 if status.State != svc.Stopped { return fmt.Errorf("stop the existing Tailscale service before starting Taildesk; its installation and account are preserved") }
 return nil
}
`);
mkdirSync(out, { recursive: true });
// The GUI watcher must not survive a UI crash and keep a user's session active.
writeFileSync(join(source, 'cmd/tailscale/taildesk_parent_windows.go'), `package main
import ("io"; "os")
func init() {
 if os.Getenv("TAILDESK_PARENT_WATCH") == "1" {
  go func() { _, _ = io.Copy(io.Discard, os.Stdin); os.Exit(0) }()
 }
}
`);
const flags = `-s -w -X tailscale.com/version.longStamp=${spec.version}-taildesk -X tailscale.com/version.shortStamp=${spec.version}`;
const env = { ...process.env, CGO_ENABLED: '0', GOOS: 'windows', GOARCH: 'amd64' };
// An upstream self-updater would install the official MSI. Exclude it from this custom distribution.
for (const [pkg, name] of [['tailscale', 'taildesk-cli.exe'], ['tailscaled', 'taildesk-engine.exe']]) {
  run(go, ['build', '-trimpath', '-tags=ts_omit_clientupdate', '-ldflags', flags, '-o', join(out, name), `./cmd/${pkg}`], { env });
}
const zip = join(out, 'wintun.zip');
const response = await fetch(spec.wintunURL); if (!response.ok) throw new Error(`Wintun download: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== spec.wintunSHA256) throw new Error('Wintun checksum mismatch');
writeFileSync(zip, bytes);
run('tar.exe', ['-xf', zip, '-C', out]);
copyFileSync(join(out, 'wintun/bin/amd64/wintun.dll'), join(out, 'wintun.dll'));
mkdirSync(join(out, 'licenses'), { recursive: true });
copyFileSync(join(source, 'LICENSE'), join(out, 'licenses/Tailscale-LICENSE.txt'));
copyFileSync(join(out, 'wintun/LICENSE.txt'), join(out, 'licenses/Wintun-LICENSE.txt'));
for (const file of ['windows.md', 'tailscale.md']) copyFileSync(join(source, 'licenses', file), join(out, 'licenses', file));
// Preserve license/copyright files from every Go module in the actual build graph.
const deps = run(go, ['list', '-deps', '-json', '-tags=ts_omit_clientupdate', './cmd/tailscale', './cmd/tailscaled'], { env, stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const modules = new Map();
for (const item of JSON.parse('[' + deps.trim().replace(/}\s*\n{/g, '},{') + ']')) if (item.Module && !item.Module.Main) modules.set(item.Module.Path, item.Module.Replace || item.Module);
for (const [name, mod] of modules) {
  if (!mod.Dir) throw new Error(`No dependency directory: ${name}`);
  const dest = join(out, 'licenses', name.replaceAll('/', '__')); mkdirSync(dest, { recursive: true });
  let found = false;
  // Some submodules carry their license one level above the module root.
  for (const file of readdirSync(mod.Dir, { withFileTypes: true })) if (file.isFile() && /^(LICENSE|COPYING|COPYRIGHT|NOTICE|AUTHORS)(\.|$|-)/i.test(file.name)) { copyFileSync(join(mod.Dir, file.name), join(dest, file.name)); found = true; }
  if (!found) console.warn(`Review dependency license: ${name}`);
}
const files = Object.fromEntries(['taildesk-cli.exe', 'taildesk-engine.exe', 'wintun.dll'].map(name => [name, createHash('sha256').update(readFileSync(join(out, name))).digest('hex')]));
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ ...spec, go: run(go, ['version'], { stdio: 'pipe', encoding: 'utf8' }).trim(), files }, null, 2));
console.log('Standalone Taildesk engine built and checksummed.');
