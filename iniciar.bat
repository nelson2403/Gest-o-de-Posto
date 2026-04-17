@echo off
title Gestao de Postos - Servidor
color 0A
cls

echo ============================================
echo   GESTAO DE POSTOS - Sistema de Controle
echo ============================================
echo.

:: Verifica se Node.js esta instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org
    pause
    exit /b 1
)

:: Vai para o diretorio do projeto
cd /d "%~dp0"

:: Verifica se o build existe
if not exist ".next\" (
    echo [INFO] Primeiro acesso - fazendo build do projeto...
    echo Isso pode demorar alguns minutos...
    echo.
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERRO] Falha no build. Verifique o .env.local
        pause
        exit /b 1
    )
)

:: Pega o IP local automaticamente
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "192.168"') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP: =%

echo [OK] Iniciando servidor...
echo.
echo  +-----------------------------------------+
echo  ^|  Local:   http://localhost:3000          ^|
echo  ^|  Rede:    http://%LOCAL_IP%:3000    ^|
echo  +-----------------------------------------+
echo.
echo  Qualquer maquina na rede pode acessar pelo IP acima
echo  Pressione Ctrl+C para parar o servidor
echo ============================================
echo.

:: Inicia escutando em todas as interfaces (0.0.0.0)
set PORT=3000
set HOSTNAME=0.0.0.0
call npm start

pause
