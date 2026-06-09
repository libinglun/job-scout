@echo off
cd /d "C:\Users\z004zw0c\.claude\skills\job-scout\scripts"
set LOGFILE=%USERPROFILE%\.job-scout\job-scout.log
echo [%date% %time%] Starting job scan >> "%LOGFILE%"
"C:\nvm4w\nodejs\node.exe" prepare-jobs.js 2>>"%LOGFILE%" | "C:\nvm4w\nodejs\node.exe" generate-digest.js 2>>"%LOGFILE%" | "C:\nvm4w\nodejs\node.exe" deliver.js 2>>"%LOGFILE%"
echo [%date% %time%] Done (exit %ERRORLEVEL%) >> "%LOGFILE%"
