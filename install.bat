@echo off
setlocal EnableExtensions
REM ============================================================
REM  RedGet installer - Windows
REM
REM    install.bat              install the `red` command
REM    install.bat /uninstall   remove it
REM
REM  Afterwards you can run `red` from ANY folder, like git:
REM    red --help   red --info   red version   red serve
REM    red list     red export <forge>         red check
REM
REM  Nothing is downloaded: the launcher points at this folder's
REM  tools\cli.mjs, so keep the folder where it is. The website
REM  itself needs no Node and no install - this is only for the CLI.
REM ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "CLI=%ROOT%\tools\cli.mjs"
set "BIN=%USERPROFILE%\.redget\bin"
set "LAUNCHER=%BIN%\red.cmd"

if /i "%~1"=="/uninstall"   goto uninstall
if /i "%~1"=="--uninstall"  goto uninstall
if /i "%~1"=="/h"           goto help
if /i "%~1"=="--help"       goto help
if /i "%~1"=="-h"           goto help

if not exist "%CLI%" (
  echo install: tools\cli.mjs not found next to install.bat.
  echo Run install.bat from inside the RedGet folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo install: Node.js v18+ is required for the red command.
  echo Get it from https://nodejs.org and re-run. ^(The website needs no Node.^)
  pause
  exit /b 1
)

if not exist "%BIN%" mkdir "%BIN%"

> "%LAUNCHER%" echo @echo off
>>"%LAUNCHER%" echo rem RedGet launcher - installed by install.bat
>>"%LAUNCHER%" echo node "%CLI%" %%*

echo.
echo   OK  installed: %LAUNCHER%
echo       -^> node %CLI%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$b='%BIN%'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; if(($p -split ';') -notcontains $b){ [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';')+';'+$b).TrimStart(';'), 'User'); Write-Output '  added %BIN% to your user PATH' } else { Write-Output '  already on your user PATH' }"

echo.
echo   Open a NEW terminal, then try:
echo       red --help
echo       red --info
echo       red serve          then open http://localhost:4173
echo       red export ^<forge^>
echo.
pause
exit /b 0

:uninstall
if exist "%LAUNCHER%" (
  del "%LAUNCHER%"
  echo   removed %LAUNCHER%
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$b='%BIN%'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; $n=(($p -split ';') | Where-Object { $_ -ne $b -and $_ -ne '' }) -join ';'; [Environment]::SetEnvironmentVariable('Path',$n,'User'); Write-Output '  removed %BIN% from your user PATH'"
echo   red uninstalled.
pause
exit /b 0

:help
echo usage: install.bat [/uninstall]
exit /b 0
