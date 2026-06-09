@echo off
cd /d "%~dp0"
set LOGFILE=%USERPROFILE%\.job-scout\job-scout.log
echo [%date% %time%] Starting job scan >> "%LOGFILE%"
node prepare-jobs.js 2>>"%LOGFILE%" | node generate-digest.js 2>>"%LOGFILE%" | node deliver.js 2>>"%LOGFILE%"
echo [%date% %time%] Done (exit %ERRORLEVEL%) >> "%LOGFILE%"
