# HALOFLUX AI LINK watchdog
# Checks whether 127.0.0.1:8737 is listening; if not, starts the local data service.
# Called by scheduled task "HALOFLUX AI LINK Watchdog" through keepalive.vbs (windowless).
# The service is started with CreateNoWindow = $true, so NO console window is ever shown,
# and it is not a child of any AI / editor / wallpaper process.

$ErrorActionPreference = 'SilentlyContinue'

$dir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $dir 'ai-link-server.js'
$log    = Join-Path $dir 'keepalive.log'

if (-not (Test-Path $server)) { exit 0 }

$listening = Get-NetTCPConnection -LocalPort 8737 -State Listen -ErrorAction SilentlyContinue
if ($listening) { exit 0 }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  foreach ($candidate in @(
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
  )) {
    if ($candidate -and (Test-Path $candidate)) { $node = $candidate; break }
  }
}
if (-not $node) { exit 0 }

$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
Add-Content -Path $log -Value "[$stamp] service not listening -> starting" -Encoding UTF8

# 关键：UseShellExecute=false + CreateNoWindow=true => 完全不会有控制台窗口
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName               = $node
$psi.Arguments              = '"' + $server + '"'
$psi.WorkingDirectory       = $dir
$psi.UseShellExecute        = $false
$psi.CreateNoWindow         = $true
$psi.WindowStyle            = [System.Diagnostics.ProcessWindowStyle]::Hidden

try {
  [System.Diagnostics.Process]::Start($psi) | Out-Null
} catch {
  Add-Content -Path $log -Value "[$stamp] start failed: $($_.Exception.Message)" -Encoding UTF8
}

