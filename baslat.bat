@echo off
chcp 65001 >nul
title Reels Editor
cd /d "%~dp0"

rem /sessiz: kisayoldan gizli acilirken hata durumunda bekleme
set "SESSIZ="
if /I "%~1"=="/sessiz" set "SESSIZ=1"

where node >nul 2>nul || (call :hata "Node.js bulunamadi. https://nodejs.org adresinden Node.js kurun." & exit /b 1)

if not exist "node_modules\electron\dist\electron.exe" (
    echo [1/2] Paketler kuruluyor...
    call npm install || (call :hata "Paket kurulumu basarisiz." & exit /b 1)
)

rem Arayuz her acilista kaynak koddan derlenir; son degisiklikler hep gorunur
echo [2/2] Arayuz derleniyor...
call npx vite build --logLevel error || (call :hata "Arayuz derlenemedi." & exit /b 1)

start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:hata
echo %~1
if not defined SESSIZ pause
exit /b 1
