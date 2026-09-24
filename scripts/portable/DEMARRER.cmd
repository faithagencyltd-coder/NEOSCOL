@echo off
chcp 65001 >nul
cd /d "%~dp0"
title NeoScol - demonstration locale
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js est introuvable : installez-le depuis https://nodejs.org (version LTS^) puis relancez DEMARRER.
  echo.
  pause
  exit /b 1
)
node demarrer.mjs %*
echo.
pause
