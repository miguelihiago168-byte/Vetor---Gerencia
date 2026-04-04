# Reinicia backend e frontend após deploy
# Uso: .\scripts\restart_after_deploy.ps1

$ErrorActionPreference = 'Stop'

try {
  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
} catch {
  Write-Error "Falha ao resolver a raiz do projeto: $($_.Exception.Message)"
  exit 1
}

Write-Output 'Parando processos atuais...'
& (Join-Path $projectRoot 'scripts\stop_servers.ps1')

Start-Sleep -Seconds 2

Write-Output 'Subindo serviços atualizados...'
& (Join-Path $projectRoot 'scripts\start_servers.ps1')

Write-Output 'Reinício pós-deploy concluído.'
