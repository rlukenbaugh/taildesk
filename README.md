# Taildesk

An independent Windows desktop companion for an existing Tailscale installation. It recreates common client controls in a larger device dashboard with original branding. It is not affiliated with Tailscale and is not a replacement VPN engine or a pixel-identical replica.

## Windows use

Install and sign in to the official Tailscale Windows app first. Run the Taildesk installer or portable executable. Taildesk reads the service automatically from `C:\Program Files\Tailscale\tailscale.exe` (or the Windows Program Files directory).

- Devices: live status, address copying, search, online/offline filters, and peer pings.
- Connection: disconnect and reconnect with saved settings.
- Exit node: select an advertised online node or return to normal routing.
- Settings: DNS, subnet routes, blocking incoming connections, unattended mode, and LAN access with an exit node.
- Every network change requires a native confirmation. Closing the window keeps Taildesk in the tray. Quit from the sidebar or tray menu.

Sign-in, account switching, Taildrop, and advanced administration remain in the official app. Closing or uninstalling Taildesk does not disconnect or uninstall Tailscale. Tailscale must already be installed; it is not bundled. Current integration was checked with Windows Tailscale 1.104.1. Older clients without `tailscale get --json` can display devices but settings are disabled with an explanation.

## Development

Node.js 22 or newer on Windows:

```powershell
npm ci
npm run build
npm run lint
npm test
npm run test:ui
npm run test:live
npm start
npm run dist:win
```

`test:ui` uses fictional data and tests native confirmation cancellation and acceptance. `test:live` only reads the installed service. `node scripts/smoke.mjs --live --packaged` checks the packaged executable. `node scripts/smoke.mjs --service-error` checks unavailable-service handling. Test screenshots and full REA evidence remain local and are excluded from Git.

## Architecture and boundaries

Electron renderer is sandboxed and isolated, with no Node access or network requests. A narrow preload exposes validated IPC methods. The main process checks the sender and uses `execFile` with an absolute trusted CLI path, separate arguments, no shell, bounded output, and timeouts. Device names are rendered as text. No tokens, private keys, or account passwords are read. No device inventory is saved by the app. There is no generic shell or arbitrary URL launcher exposed to the renderer.

The `lint` task runs Node syntax checks; there is no additional style linter. All runtime imports are built-in Node/Electron modules. Build and test packages are development dependencies.

See `docs/reconstruction.md` for REA evidence and explicit coverage limits. Windows builds are unsigned unless a signing certificate is supplied to the release workflow using `CSC_LINK` and `CSC_KEY_PASSWORD`.
