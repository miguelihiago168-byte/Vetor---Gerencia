@echo off
echo.
echo ================================================================
echo    Gestao de Obras - Vetor
echo    Iniciando sistema...
echo ================================================================
echo.

REM Verificar instalacao
if not exist "backend\node_modules\" (
    echo Instalando dependencias do backend...
    cd backend
    call npm install
    cd ..
)

if not exist "frontend\node_modules\" (
    echo Instalando dependencias do frontend...
    cd frontend
    call npm install
    cd ..
)

if not exist "backend\database\gestao_obras.db" (
    echo Inicializando banco de dados...
    cd backend
    call npm run init-db
    cd ..
)

echo.
echo Iniciando servidores...
echo.

REM Iniciar backend
start "Backend - Gestao de Obras" cmd /k "cd backend && npm run dev"

REM Aguardar 3 segundos
timeout /t 3 /nobreak >nul

REM Iniciar frontend
start "Frontend - Gestao de Obras" cmd /k "cd frontend && npm run dev"

echo.
echo ================================================================
echo    Sistema iniciado com sucesso!
echo.
echo    Frontend:  http://localhost:3000
echo    Backend:   http://localhost:3001
echo.
echo    Login padrao:
echo       Login: 000001
echo       Senha: 123456
echo ================================================================
echo.

REM Aguardar e abrir navegador
timeout /t 2 /nobreak >nul
start http://localhost:3000
