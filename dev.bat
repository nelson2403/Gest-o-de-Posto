@echo off
title Gestao de Postos - DEV
color 0E
cls

echo ============================================
echo   GESTAO DE POSTOS - Modo Desenvolvimento
echo ============================================
echo.

cd /d "%~dp0"

echo [INFO] Iniciando em modo desenvolvimento...
echo  Acesse em: http://localhost:3000
echo  Hot reload ativado - alteracoes aplicadas automaticamente
echo.
echo  Pressione Ctrl+C para parar
echo ============================================
echo.

call npm run dev

pause
