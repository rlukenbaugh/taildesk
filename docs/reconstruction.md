# Reconstruction evidence and scope

Historical v0.1 record. Version 0.2 uses a bundled source-built engine; see `standalone-engine.md` for current architecture and validation limits.

Inspected on 2026-10-13 using REA MCP and installed CLI help.

## Observed through REA

- Target: `C:\Program Files\Tailscale\tailscale-ipn.exe`.
- `open_binary` identified a PE executable for x86_64.
- SHA-256: `0c3c56a6626c9f71a32fb307dbda0c810c94a89d66fed158258da6f043004f9c`.
- `inspect_pe_resources` evidence: `ev_83a17b6c591e7c4312d419124c4e8fb292a75abc91a0b20eda9af4685c8cdefd`.
- Complete bounded resource inventory: 293 resources, 591 examined entries. Icon relationships were inventoried; icon decoding and actual runtime window rendering were not observed.
- Full evidence exported to ignored local file `rea-evidence.local.json`. Session closed after inspection.

## Observed through ordinary Windows tools

- File version 1.104.1-t7f4efe814-g8da26756c, description Tailscale GUI client.
- Installed CLI help confirmed `status --json`, `get --json`, `set`, `up`, `down`, and `ping`.
- `up` without flags reconnects with existing settings. `set` updates only explicitly named preferences.
- Read-only service queries confirmed a running installation and returned device status and preference fields. Private inventory is not included in this repository.
- Official CLI documentation cross-check: https://tailscale.com/docs/reference/tailscale-cli .

## Design choices

The user selected a working Windows app using the existing Tailscale service. Taildesk therefore uses the installed CLI rather than recreating authentication or cryptography. Its original dashboard, icon, branding, navigation, polling interval, and confirmation dialogs are implementation choices, not claims recovered from decompiled code. No original executable or extracted Tailscale icons are redistributed.

## Limits

Native decompilation was unavailable: Ghidra and IDA were not configured and Hopper is unsupported on this Windows host. This is not a binary-equivalent or visually exact reconstruction, and no REA behavioral-equivalence verification is claimed. Authentication, account switching, file transfer, advanced policy administration, and VPN internals are delegated to the official app. Live mutation tests are deliberately excluded to preserve the user's connection and settings; command construction and confirmation flows are tested with fixtures.
