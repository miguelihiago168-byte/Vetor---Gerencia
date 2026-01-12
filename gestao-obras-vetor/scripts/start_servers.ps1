# Start both backend and frontend in detached mode and write logs to files
# Usage: Right-click -> "Run with PowerShell" or execute in PowerShell: .\scripts\start_servers.ps1

$ErrorActionPreference = 'Stop'

Write-Output 'Stopping existing node processes (if any)...'
$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) {
  $nodes | ForEach-Object { Try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } Catch {} }
}

# Resolve project paths based on script location
Try {
  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $backendPath = (Resolve-Path (Join-Path $projectRoot 'backend')).Path
  $frontendPath = (Resolve-Path (Join-Path $projectRoot 'frontend')).Path
} Catch {
  Write-Error "Falha ao resolver caminhos do projeto: $($_.Exception.Message)"
  Exit 1
}

# Ensure logs directory exists
$logDir = Join-Path $projectRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$backendOutLog = Join-Path $logDir 'backend-out.log'
$backendErrLog = Join-Path $logDir 'backend-err.log'
$frontendOutLog = Join-Path $logDir 'frontend-out.log'
$frontendErrLog = Join-Path $logDir 'frontend-err.log'

# Start backend (detached) and redirect output to log
Write-Output "Starting backend (node server.js) in '$backendPath'..."
Try {
  $backendProc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $backendPath -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog -WindowStyle Hidden -PassThru
  Write-Output "Backend started PID: $($backendProc.Id) - out: $backendOutLog err: $backendErrLog"
} Catch {
  Write-Error "Falha ao iniciar backend: $($_.Exception.Message)"
}

# Start frontend (detached via cmd to run npm) and redirect output to log
Write-Output "Starting frontend (npm run dev) in '$frontendPath'..."
Try {
  $frontendProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev' -WorkingDirectory $frontendPath -RedirectStandardOutput $frontendOutLog -RedirectStandardError $frontendErrLog -WindowStyle Hidden -PassThru
  Write-Output "Frontend started PID: $($frontendProc.Id) - out: $frontendOutLog err: $frontendErrLog"
} Catch {
  Write-Error "Falha ao iniciar frontend: $($_.Exception.Message)"
}

Write-Output "You can check backend health at http://localhost:3001/api/health"
Write-Output "Open the frontend (Vite) URL printed in the frontend console, commonly http://localhost:5173 or http://localhost:3000"
Write-Output "Backend out log: $backendOutLog"
Write-Output "Backend err log: $backendErrLog"
Write-Output "Frontend out log: $frontendOutLog"
Write-Output "Frontend err log: $frontendErrLog"
