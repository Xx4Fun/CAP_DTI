@echo off
title PRICE-Watch Admin & Vendor Web Portal (Port 5173)
echo ========================================================
echo   Starting PRICE-Watch Admin Web Portal on http://localhost:5173
echo ========================================================

cd /d "%~dp0web"
npm run dev
pause
