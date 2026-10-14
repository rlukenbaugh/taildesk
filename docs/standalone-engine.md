# Standalone engine evidence — 2026-10-14

This implementation uses public, pinned Tailscale source rather than decompiled proprietary GUI code. REA/Ghidra are available; complete source supplies the relevant engine behavior directly. Earlier REA findings remain historical, not verification of this engine.

Inspected sources: `cmd/tailscaled` (service/defaults), `paths` (state ACLs/protected pipes), `net/tstun/tun_windows.go` (adapter GUID), `wgengine/router/osrouter/router_windows.go` (firewall), `net/dns` (hosts/NRPT), `ipn/ipnserver/server.go` and `ipn/ipnlocal/local.go` (Windows user association), `cmd/tailscale/cli/up.go` (sign-in).

Separate identities: Taildesk service, protected pipe, adapter name/GUID, ProgramData/LocalAppData paths, registry/policy keys, firewall rule names, hosts markers and legacy NRPT GUID. Upstream authorization checks and restrictive state ACLs are retained. Dynamic WFP IDs are generated uniquely by upstream. The engine refuses system-mode startup while the original service is not stopped. Explicit developer mode is used by the isolated test with userspace networking and a private socket.

The UI retains a bundled `debug watch-ipn` process for Windows-user association, discards notifications, reconnects after service restarts and stops it on exit. Only selected status/preference fields reach the renderer. Unattended mode is an explicit user choice.

Installer: fixed Program Files location; manual-start LocalSystem service; no automatic networking, sign-in, credential migration or original-service changes. Automatic startup requires the original service to be stopped and changes its start type to manual to prevent a boot conflict. Installer/app unsigned unless signing secrets are provided; Wintun remains the signed upstream DLL.

## Completed checks

- Source build using Go 1.27.2; CLI/daemon version checks.
- Wintun archive checksum and three bundled binary hashes.
- Real private userspace daemon startup, NeedsLogin state, preferences, private CLI IPC and persistent watcher.
- Unit tests for narrow commands/peer validation, URL restrictions, timeout sign-in output and elevation refusal from portable folders.
- Fixture UI confirmations, reconnect, preferences, exit-node selection, ping and unavailable-service handling.

## Live acceptance checklist

1. Install/start with the old service stopped; verify service binary path, adapter and state ACLs.
2. User signs in with the same account and approves the new node. Do not record authentication URLs or credentials.
3. Verify peer connectivity, normal internet, MagicDNS and the user's applications. Test exit-node/subnet changes only with authorization.
4. Restart service/UI and verify saved login; test unattended behavior if enabled.
5. Keep rollback available. Do not uninstall the old app until the user chooses to do so.

Live acceptance passed: installed own service/adapter and private state ACLs, browser sign-in, 12 peers, all 3 online peer pings, MagicDNS, HTTP internet access, service/installer restart without reauthentication, and packaged UI smoke. The old service stayed stopped. Startup/unattended settings are configured and checked; a full PC reboot was not performed. Exit-node/subnet routing changes and original-app uninstallation were not exercised.
