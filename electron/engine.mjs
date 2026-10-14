import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const exec = promisify(execFile);
export const ENGINE_PIPE = String.raw`\\.\pipe\ProtectedPrefix\Administrators\Taildesk\tailscaled`;

export class EngineManager {
  constructor({ directory, packaged = false, run = exec } = {}) { this.directory = directory; this.packaged = packaged; this.run = run; }
  async info() {
    const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const { stdout } = await this.run(ps, ['-NoProfile', '-NonInteractive', '-Command', "$a=Get-Service -Name Taildesk -ErrorAction SilentlyContinue; $b=Get-Service -Name Tailscale -ErrorAction SilentlyContinue; @{installed=($null -ne $a);running=($a.Status -eq 'Running');officialRunning=($null -ne $b -and $b.Status -ne 'Stopped');automatic=($a.StartType -eq 'Automatic')} | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10000, encoding: 'utf8', shell: false });
    return { ...JSON.parse(stdout), bundled: existsSync(join(this.directory, 'taildesk-engine.exe')) };
  }
  async action(action) {
    if (!['Start', 'Stop', 'EnableStartup'].includes(action)) throw new Error('Unsupported engine action.');
    // A service running as SYSTEM must never execute binaries from a user-writable portable folder.
    const expected = join(process.env.ProgramW6432 || 'C:\\Program Files', 'Taildesk', 'resources', 'engine');
    if (!this.packaged || resolve(this.directory).toLowerCase() !== resolve(expected).toLowerCase()) throw new Error('Install Taildesk with its Windows setup program before starting its VPN service.');
    const script = join(this.directory, 'manage-service.ps1');
    if (!existsSync(script)) throw new Error('Service setup is missing. Reinstall Taildesk.');
    const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const literal = s => "'" + s.replaceAll("'", "''") + "'";
    const args = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" -Action ${action}`;
    const command = `$p=Start-Process -FilePath ${literal(ps)} -ArgumentList ${literal(args)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
    try { await this.run(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, timeout: 120000, encoding: 'utf8', shell: false }); }
    catch { throw new Error('The service action was cancelled or failed. Stop the existing Tailscale service before starting Taildesk. Windows administrator approval is required.'); }
    return this.info();
  }
}
