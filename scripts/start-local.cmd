@echo off
setlocal
cd /d "%~dp0.."

if not exist "work" mkdir "work"
set "XDG_CONFIG_HOME=%CD%\work\.config"
set "WRANGLER_LOG_PATH=%CD%\work\wrangler-local.log"

if not exist "node_modules\vinext\dist\cli.js" (
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

"%ProgramFiles%\nodejs\node.exe" "node_modules\vinext\dist\cli.js" dev
