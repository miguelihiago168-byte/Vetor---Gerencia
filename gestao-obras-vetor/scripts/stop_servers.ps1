# Stop any node processes and any cmd processes started by the start script (best-effort)
# Usage: .\scripts\stop_servers.ps1

$ErrorActionPreference = 'Stop'

Write-Output 'Stopping node processes...'
$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) { $nodes | ForEach-Object { Try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; Write-Output "Stopped node PID: $($_.Id)" } Catch { Write-Output "Failed to stop node PID: $($_.Id)" } } } else { Write-Output 'No node processes running' }

# Optionally stop cmd processes that run npm (best-effort, will stop all cmd instances running npm)
$cmds = Get-Process cmd -ErrorAction SilentlyContinue
if ($cmds) {
  foreach ($c in $cmds) {
    try {
      # try to read the command line only if accessible
      $c | Stop-Process -Force -ErrorAction SilentlyContinue
      Write-Output "Stopped cmd PID: $($c.Id)"
    } catch {}
  }
}

Write-Output 'Stop script finished.'
