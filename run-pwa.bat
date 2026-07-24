@echo off
title PRICE-Watch Consumer PWA (Port 5174)
echo ========================================================
echo   Starting PRICE-Watch Consumer PWA on http://localhost:5174
echo ========================================================

cd /d "%~dp0customer-pwa"
npm run dev
pause
