@echo off
setlocal
cd /d "%~dp0.."

if not exist "work" mkdir "work"

if not exist "node_modules\next\dist\bin\next" (
  echo Dependencies are missing. Run npm install first.
  exit /b 1
)

echo.
echo =====================================================
echo   Enterprise Process ^& Knowledge Map
echo   La pagina estara en http://localhost:3000
echo   Mantenga esta ventana abierta mientras la utiliza.
echo =====================================================
echo.

call npm.cmd run dev -- --hostname 0.0.0.0
