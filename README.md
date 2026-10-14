# Taildesk

A standalone Windows x64 VPN client for your existing Tailscale network. Version 0.2 bundles its own source-built engine, CLI, Windows service and original signed upstream Wintun DLL. The official desktop app is not required. Your existing Tailscale account and hosted coordination service are still used.

Verified on Windows: standalone service/adapter, browser sign-in, 12 peers, reachability to all 3 online peers, MagicDNS, internet access, saved login after restart and the packaged UI. Exit-node/subnet changes are covered by UI/command tests but were not changed on the live network. Full Tailscale feature parity is not claimed.

## Install and test

1. Keep the original installation for rollback. Stop its **Tailscale** Windows service; closing its tray app is insufficient.
2. Run `Taildesk-Setup-0.2.0-x64.exe` and approve elevation. It installs in `C:\Program Files\Taildesk`, registers a manual-start **Taildesk VPN** service, and does not start networking or modify the original service.
3. Open Taildesk, select **Start service**, then **Sign in**. Use your existing account and approve the new device if required.
4. Test peers, DNS, internet and your usual applications. Taildesk has its own device identity, keys and IP; per-device access rules may need updating.
5. After testing, enable **automatic startup** in Taildesk Settings. This changes the stopped original service to manual startup, preserving it for rollback. Remove the original app later if desired. Enable **Run unattended** to remain connected after quitting the UI or signing out.

Rollback: use **Stop service** in Taildesk, then restart the original Tailscale service in Windows Services. Do not run both system VPN engines concurrently. Original credentials are not imported or deleted.

Closing the window keeps the UI in the tray. Disconnect stops the VPN connection; Stop service stops the engine. Uninstall removes Taildesk's files and service, preserves private state in `C:\ProgramData\Taildesk`, and does not remove the shared Wintun driver.

The installer is unsigned unless signing credentials are configured. Launching with `--start-hidden` opens in the tray for Windows sign-in startup. Portable distribution is no longer provided: a privileged VPN service must execute from administrator-protected storage.

## Features

Browser sign-in; devices, search/filter, address copying and pings; connect/disconnect; exit nodes; DNS, subnet routes, incoming connection, LAN-access and unattended preferences; service controls. Account switching, Taildrop UI, custom control servers and advanced administration are not included. Taildesk is not affiliated with or endorsed by Tailscale.

## Build and verify

Node.js 22+ and Go 1.27.2 on Windows x64. `TAILDESK_GO` may select an absolute Go executable.

```powershell
npm ci
npm run build:engine
npm run build
npm run lint
npm test
npm run test:engine
npm run test:ui
node scripts/smoke.mjs --service-error
npm run dist:win
node scripts/smoke.mjs --packaged
```

The engine pins Tailscale 1.104.1 commit `9a522a9786c97eb7910c01ccb7bd66557b04c910`. Explicit source patches isolate service/pipe/state/adapter/registry/firewall/DNS identities, preserving upstream protocol, cryptography and access checks. The upstream MSI self-updater is compiled out. Go checks module integrity; Wintun 0.14.1 is verified against upstream's SHA-256. Binary hashes and dependency license/copyright files ship with the installer. Source downloads and build outputs are ignored by Git.

`test:engine` runs a private userspace-only engine without authentication, adapter or routing changes and checks CLI IPC, preferences and the persistent user-session watcher. UI fixtures contain fictional devices. Packaged smoke expects no installed Taildesk service; run before installation. `test:live` reads an installed, signed-in Taildesk service. Screenshots of real devices stay local and ignored.

The renderer is sandboxed, with no Node/network access. Narrow IPC validates operations and peers. Only the bundled CLI is called, with explicit arguments and Taildesk's protected pipe; no fallback to the official install or PATH. Sign-in permits only HTTPS authentication URLs on login.tailscale.com. Privileged service actions require the fixed Program Files location and an allowlisted action.

See `docs/standalone-engine.md` for current evidence. `docs/reconstruction.md` records historical v0.1 REA findings.
