@echo off
chcp 65001 >nul
title NeoScol - autoriser le reseau local (Wi-Fi)
rem Ouvre le port 3000 de NeoScol dans le pare-feu Windows, pour les reseaux PRIVES
rem uniquement (Wi-Fi de la maison / de l'ecole), afin que les telephones, tablettes
rem et autres ordinateurs du meme Wi-Fi puissent ouvrir NeoScol.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Autorisation administrateur demandee...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall delete rule name="NeoScol (reseau local)" >nul 2>&1
netsh advfirewall firewall add rule name="NeoScol (reseau local)" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
if %errorlevel% neq 0 (
  echo.
  echo Echec : la regle du pare-feu n'a pas pu etre ajoutee.
  pause
  exit /b 1
)
echo.
echo OK : NeoScol est accessible depuis les appareils du meme Wi-Fi (reseau prive).
echo Verifiez que votre Wi-Fi est bien un "reseau prive" dans les parametres Windows.
echo L'adresse a ouvrir est affichee dans la fenetre de DEMARRER.cmd (ex. http://192.168.1.20:3000).
echo.
pause
