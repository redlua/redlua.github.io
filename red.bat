@echo off
setlocal EnableExtensions
REM ============================================================
REM  RedGet installer - Windows
REM
REM    install.bat              interactive RED INSTALLATION menu
REM    install.bat install      install non-interactively
REM    install.bat uninstall    remove red
REM    install.bat about        about red
REM
REM  Installs a `red` launcher on your PATH so you can run, from any
REM  folder (like git):   red --help   red --about   red serve
REM                        red list     red export <forge>
REM
REM  If run from outside a clone it downloads the repo to
REM  %USERPROFILE%\.redget using curl + tar (built into Windows 10+).
REM  The website itself needs no Node and no install.
REM ============================================================

set "OWNER=redlua"
set "REPO=redlua.github.io"
set "BRANCH=main"
set "SITE=https://redlua.github.io"
set "TARBALL=https://codeload.github.com/%OWNER%/%REPO%/tar.gz/refs/heads/%BRANCH%"
set "INSTALL_HOME=%USERPROFILE%\.redget"
set "BIN=%INSTALL_HOME%\bin"
set "LAUNCHER=%BIN%\red.cmd"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "LOCAL_REPO="
if exist "%ROOT%\tools\cli.mjs" set "LOCAL_REPO=%ROOT%"

set "ARG=%~1"
if "%ARG%"==""            goto menu
if /i "%ARG%"=="install"   goto install
if /i "%ARG%"=="uninstall" goto uninstall
if /i "%ARG%"=="about"     goto about
if /i "%ARG%"=="help"      goto help
if /i "%ARG%"=="--help"    goto help
if /i "%ARG%"=="/h"        goto help
if /i "%ARG%"=="-h"        goto help
echo   unknown option: %ARG%
goto help

REM ------------------------------------------------------------
:menu
set "INTERACTIVE=1"
cls
echo.
echo   RED INSTALLATION
echo   ----------------
echo   1) install red        put the red command on your PATH
echo   2) uninstall red      remove it
echo   3) about red          what it is, version, every command
echo   4) quit
echo.
set "CH="
set /p "CH=  choose [1-4]: "
if "%CH%"=="1" goto install
if "%CH%"=="2" goto uninstall
if "%CH%"=="3" goto about
if "%CH%"=="4" goto end
if /i "%CH%"=="q" goto end
goto menu

REM ------------------------------------------------------------
:install
echo.
echo   ----------------------------------------
echo   INSTALL red
echo   ----------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   X Node.js v18+ is required for the red command.
  echo     Get it from https://nodejs.org, then re-run.
  echo     ^(The website itself needs no Node.^)
  goto after_fail
)
call :resolve_repo
if not defined REPO_DIR ( echo   X could not obtain RedGet. & goto after_fail )
set "CLI=%REPO_DIR%\tools\cli.mjs"
if not exist "%CLI%" ( echo   X %CLI% is missing & goto after_fail )
if not exist "%BIN%" mkdir "%BIN%"
> "%LAUNCHER%" echo @echo off
>>"%LAUNCHER%" echo rem RedGet launcher - installed by install.bat
>>"%LAUNCHER%" echo node "%CLI%" %%*
echo   OK installed: %LAUNCHER%
echo       -^> node %CLI%
call :add_path
echo.
echo   Open a NEW terminal, then try:
echo       red --help
echo       red --about
echo       red serve          then open http://localhost:4173
echo       red export ^<forge^>
goto after

REM ------------------------------------------------------------
:uninstall
echo.
echo   ----------------------------------------
echo   UNINSTALL red
echo   ----------------------------------------
if exist "%LAUNCHER%" ( del "%LAUNCHER%" & echo   removed %LAUNCHER% ) else ( echo   no launcher found )
powershell -NoProfile -ExecutionPolicy Bypass -Command "$b='%BIN%'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; $n=(($p -split ';') | Where-Object { $_ -ne $b -and $_ -ne '' }) -join ';'; [Environment]::SetEnvironmentVariable('Path',$n,'User')"
if not exist "%INSTALL_HOME%" goto un_done
set "RM="
set /p "RM=  remove %INSTALL_HOME% too? [y/N]: "
if /i "%RM%"=="y" rmdir /s /q "%INSTALL_HOME%"
if /i "%RM%"=="y" echo   removed %INSTALL_HOME%
:un_done
echo   red uninstalled.
goto after

REM ------------------------------------------------------------
:about
echo.
echo   ----------------------------------------
echo   ABOUT red
echo   ----------------------------------------
call :resolve_repo
if defined REPO_DIR (
  where node >nul 2>nul
  if not errorlevel 1 ( node "%REPO_DIR%\tools\cli.mjs" --info & goto after )
)
echo   RedGet - a complete code forge that runs entirely in your browser.
echo.
echo   live site   %SITE%   ^(static - no build - no commands^)
echo   source      https://github.com/%OWNER%/%REPO%
echo.
echo   commands    red help - red about - red info - red version - red serve
echo               red list - red export ^<forge^> - red check - red doctor
goto after

REM ------------------------------------------------------------
:help
echo.
echo   RedGet installer ^(Windows^)
echo.
echo   USAGE
echo     install.bat                 interactive menu
echo     install.bat install         install non-interactively
echo     install.bat uninstall       remove red
echo     install.bat about           about red
echo.
echo   On Linux / macOS:  curl -fsSL %SITE%/install.sh ^| bash
echo.
goto end

REM ------------------------------------------------------------
:resolve_repo
set "REPO_DIR="
if defined LOCAL_REPO set "REPO_DIR=%LOCAL_REPO%"
if not defined REPO_DIR if exist "%INSTALL_HOME%\tools\cli.mjs" set "REPO_DIR=%INSTALL_HOME%"
if not defined REPO_DIR call :download
exit /b 0

:download
echo   downloading RedGet to %INSTALL_HOME% ...
where curl >nul 2>nul
if errorlevel 1 ( echo   X curl is required ^(Windows 10+ has it built in^). & exit /b 1 )
where tar >nul 2>nul
if errorlevel 1 ( echo   X tar is required ^(Windows 10+ has it built in^). & exit /b 1 )
if not exist "%INSTALL_HOME%" mkdir "%INSTALL_HOME%"
curl -fsSL "%TARBALL%" -o "%TEMP%\redget.tgz"
if errorlevel 1 ( echo   X download failed. & exit /b 1 )
tar -xzf "%TEMP%\redget.tgz" -C "%INSTALL_HOME%" --strip-components=1
if errorlevel 1 ( echo   X extract failed. & del "%TEMP%\redget.tgz" & exit /b 1 )
del "%TEMP%\redget.tgz"
set "REPO_DIR=%INSTALL_HOME%"
exit /b 0

:add_path
powershell -NoProfile -ExecutionPolicy Bypass -Command "$b='%BIN%'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; if(($p -split ';') -notcontains $b){ [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';')+';'+$b).TrimStart(';'), 'User'); Write-Output '  added %BIN% to your user PATH' } else { Write-Output '  already on your user PATH' }"
exit /b 0

REM ------------------------------------------------------------
:after
if defined INTERACTIVE goto menu
goto end
:after_fail
if defined INTERACTIVE goto menu
exit /b 1

:end
if defined INTERACTIVE pause
exit /b 0
