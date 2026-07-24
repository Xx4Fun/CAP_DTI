@echo off
title PRICE-Watch Backend Server (Laravel API)
echo ========================================================
echo   Starting PRICE-Watch Laravel API Server on Port 8000
echo ========================================================

:: Add PHP 8.3 to PATH for this session
set PATH=C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;%PATH%

:: Navigate to backend folder
cd /d "%~dp0backend"

:: Start Laravel Artisan Serve
php artisan serve --port=8000
pause
