# Taildesk v0.1.0

An independent Windows companion for your existing Tailscale service.

## Highlights

- See your devices, connection status, and online peers in one dashboard.
- Search devices, copy addresses, and check peer reachability.
- Reconnect or disconnect with confirmation.
- Choose an exit node and manage common Tailscale settings.
- Keep Taildesk in the Windows system tray.

## Downloads

- **Taildesk-Setup-0.1.0-x64.exe** — installer with optional desktop and Start menu shortcuts.
- **Taildesk-Portable-0.1.0-x64.exe** — run without installation.

Requires Windows x64 and an existing, signed-in Tailscale installation. Tested against Tailscale 1.104.1. Tailscale is not bundled. Sign-in, account switching, and file transfers stay in the official app. These release packages are unsigned.

## Verification

Release process includes JavaScript syntax checks, service boundary tests, fixture UI smoke tests, a production Windows build, and read-only live-service smoke testing on the development PC. Live network-changing actions are verified with fixtures, not by disrupting the user's connection.
