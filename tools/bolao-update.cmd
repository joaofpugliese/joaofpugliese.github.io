@echo off
REM ===========================================================================
REM Bolao Copa do Mundo - daily updater wrapper (run by Windows Task Scheduler).
REM Runs the Node updater in --catchup mode (backfills any missed days) and
REM appends a timestamped log to %LOCALAPPDATA%\bolao-update.log.
REM Run manually anytime by double-clicking this file.
REM ===========================================================================
cd /d "%~dp0.."
set "LOG=%LOCALAPPDATA%\bolao-update.log"
echo.>> "%LOG%"
echo ===== %DATE% %TIME% =====>> "%LOG%"
"C:\Program Files\nodejs\node.exe" "tools\bolao-update.mjs" --catchup >> "%LOG%" 2>&1
echo (exit code %ERRORLEVEL%)>> "%LOG%"
