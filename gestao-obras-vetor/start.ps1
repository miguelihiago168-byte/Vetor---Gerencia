Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   🏗️  GESTÃO DE OBRAS - VETOR" -ForegroundColor White
Write-Host "   Iniciando sistema..." -ForegroundColor Gray
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Verificar se as dependências estão instaladas
$backendNodeModules = Test-Path "backend\node_modules"
$frontendNodeModules = Test-Path "frontend\node_modules"
$database = Test-Path "backend\database\gestao_obras.db"

if (-not $backendNodeModules) {
    Write-Host "📦 Instalando dependências do backend..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

if (-not $frontendNodeModules) {
    Write-Host "📦 Instalando dependências do frontend..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

if (-not $database) {
    Write-Host "🗄️  Inicializando banco de dados..." -ForegroundColor Yellow
    Set-Location backend
    npm run init-db
    Set-Location ..
}

Write-Host ""
Write-Host "✅ Iniciando servidores..." -ForegroundColor Green
Write-Host ""

# Iniciar backend em um novo terminal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; Write-Host '🔧 Backend rodando em http://localhost:3001' -ForegroundColor Green; npm run dev"

# Aguardar 3 segundos
Start-Sleep -Seconds 3

# Iniciar frontend em um novo terminal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; Write-Host '🌐 Frontend rodando em http://localhost:3000' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   ✅ Sistema iniciado com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "   🌐 Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "   🔧 Backend:   http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "   🔐 Login padrão:" -ForegroundColor Yellow
Write-Host "      Login: 000001" -ForegroundColor White
Write-Host "      Senha: 123456" -ForegroundColor White
Write-Host ""
Write-Host "   📝 Para parar os servidores, feche as janelas ou pressione Ctrl+C" -ForegroundColor Gray
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Aguardar 2 segundos e abrir o navegador
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"
