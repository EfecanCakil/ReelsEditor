@echo off
chcp 65001 >nul
title Reels Editor - kurulum dosyasi derleme
cd /d "%~dp0"
tasklist /FI "IMAGENAME eq Reels Editor.exe" | find /I "Reels Editor.exe" >nul && (echo Once acik olan Reels Editor uygulamasini kapatin. & pause & exit /b 1)
call npm run dist || (echo Derleme basarisiz. & pause & exit /b 1)
echo.
echo Tamamlandi: release\ReelsEditor-Kurulum-*.exe
pause
