@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Toutes les donnees de demonstration vont etre remises a zero.
pause
node demarrer.mjs --reinitialiser
echo.
pause
