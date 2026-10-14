param([Parameter(Mandatory=$true)][ValidateSet('Register','Start','Stop','EnableStartup','Unregister')][string]$Action)
$ErrorActionPreference = 'Stop'
$expected = Join-Path $env:ProgramW6432 'Taildesk\resources\engine'
if ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ine [IO.Path]::GetFullPath($expected).TrimEnd('\')) { throw 'The Taildesk service must be installed under Program Files\Taildesk.' }
$binary = Join-Path $expected 'taildesk-engine.exe'
$service = Get-Service -Name Taildesk -ErrorAction SilentlyContinue
if ($service) {
  $entry = Get-CimInstance Win32_Service -Filter "Name='Taildesk'"
  if ($entry.PathName -cne ('"' + $binary + '"')) { throw 'A different service already uses the Taildesk name. No changes were made.' }
}
function Stop-Taildesk {
  $current = Get-Service -Name Taildesk -ErrorAction SilentlyContinue
  if ($current -and $current.Status -ne 'Stopped') { Stop-Service -Name Taildesk; $current.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }
}
switch ($Action) {
  'Register' {
    if (!(Test-Path -LiteralPath $binary)) { throw 'Bundled engine is missing.' }
    if (!$service) {
      New-Service -Name Taildesk -DisplayName 'Taildesk VPN' -BinaryPathName ('"' + $binary + '"') -StartupType Manual -Description 'Standalone Taildesk networking engine, based on Tailscale open-source code.' | Out-Null
    }
    # Never start networking or change the original service during installation.
  }
  'Start' {
    $official = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
    if ($official -and $official.Status -ne 'Stopped') { throw 'Stop the existing Tailscale service before starting Taildesk.' }
    if (!$service) { throw 'Run the Taildesk installer first.' }
    Start-Service -Name Taildesk
    $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  }
  'Stop' { Stop-Taildesk }
  'EnableStartup' {
    $official = Get-Service -Name Tailscale -ErrorAction SilentlyContinue
    if ($official -and $official.Status -ne 'Stopped') { throw 'Stop the original Tailscale service before enabling Taildesk startup.' }
    if ($official) { Set-Service -Name Tailscale -StartupType Manual }
    Set-Service -Name Taildesk -StartupType Automatic
  }
  'Unregister' {
    Stop-Taildesk
    if ($service) { & "$env:SystemRoot\System32\sc.exe" delete Taildesk | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Could not remove Taildesk service.' } }
    # Preserve private state and the adapter; never uninstall the shared Wintun driver.
  }
}
