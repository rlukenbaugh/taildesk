# Taildesk v0.2.0 — standalone Windows VPN

Taildesk includes its own networking engine and Windows service. The official Tailscale desktop app is no longer required; your existing Tailscale account and hosted network are still used.

## Changes

- Bundle source-built Tailscale 1.104.1 engine/CLI, signed Wintun 0.14.1 DLL and dependency notices.
- Add browser sign-in, independent service controls and optional Windows service startup.
- Isolate state, pipe, adapter, registry, firewall and DNS ownership from the original app.
- Keep the Windows user-session connection alive; exit its helper automatically if the UI closes or crashes.
- Support starting the interface in the tray with --start-hidden.
- Disable upstream MSI self-updating; require an all-users installation rather than a portable service.

## Install and migration

**Taildesk-Setup-0.2.0-x64.exe**: Windows x64 installer; administrator approval required; installer is unsigned.

Keep the original installation for rollback. Stop its background service, install Taildesk, start its service and sign in with the same account. Taildesk becomes a separate device. Enabling automatic startup changes the stopped original service to manual startup. Enable Run unattended to keep the VPN connected without the interface. Remove the original app only when satisfied with testing.

## Verification and limits

Source build, binary checksums, unit/fixture UI tests, real isolated engine tests and packaged live UI tests pass. Verified the installed standalone service, adapter, restrictive state permissions, authentication, 12 peers, pings to all 3 online peers, MagicDNS, internet access and saved login after service/installer restart while the original service remained stopped.

Exit-node/subnet changes were tested with fixtures, not changed on the live network. Startup settings and tray behavior are verified; a full Windows reboot was not performed. Account switching and Taildrop controls are not included. This is an independent client, not a full feature-for-feature reproduction of Tailscale.
