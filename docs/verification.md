# Verification — v0.1.0

Completed locally on Windows x64, 2026-10-13.

- Node syntax check: all 9 JavaScript files passed.
- Unit suite: 8 tests passed (normalization, secret-field exclusion, malformed status, preference validation, exit-node validation, saved-settings reconnect, process isolation/timeouts, peer-only ping).
- Fixture UI: passed. Search, empty state, page navigation, confirmation cancellation and acceptance, disconnect/reconnect, settings, pending exit selection across refresh, exit-node apply, and ping result.
- Missing-service UI: passed; displayed an error and disabled connection changes.
- Live-service UI: passed without changing network configuration.
- Production Windows x64 NSIS installer and portable package: built successfully using Electron 44.7.1 and electron-builder 26.15.3.
- Packaged executable smoke test: passed against installed Tailscale 1.104.1. Product resource reports Taildesk 0.1.0.0.
- Fixture and packaged live screenshots visually reviewed. Real-device screenshots are ignored local test output.
- Final service check: Running; 11 peers.
- Production dependency audit: zero reported vulnerabilities. Full development audit retains 8 moderate findings in the packaging tool's transitive `sprintf-js` chain; no high or critical findings after updating Electron and sharp. These packaging dependencies are not included in the distributed app.

Live disconnect, reconnect, routing and security-setting changes were not executed. Their confirmation flow and argument construction were tested with fixtures. The installer was generated; the unpacked production executable was smoke tested. No claim is made that the installation wizard or a complete uninstall cycle was exercised.

Packages are unsigned. GitHub CLI authentication returned HTTP 401 for the configured account, so remote repository creation, push, and GitHub Release publication could not be completed. Source and version tag are retained in the local standalone Git repository.
