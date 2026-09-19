@echo off
setlocal EnableExtensions
REM ============================================================
REM  red - the RedGet command (Windows)
REM
REM    red.bat help                every command
REM    red.bat version             version, Node release, file inventory
REM    red.bat startup             print startup.txt
REM    red.bat serve [port]        run the site on http://localhost:4173
REM    red.bat list                every forge in an exported database
REM    red.bat export <forge>      copy a forge's files to your computer
REM    red.bat check               run the validation suite
REM    red.bat doctor              diagnose this install
REM
REM  Everything lives next to this script. Nothing is installed,
REM  downloaded, or written outside the folder you ask for.
REM ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
for %%I in ("%ROOT%\..") do set "ROOT=%%~fI"
set "CLI=%ROOT%\tools\cli.mjs"
set "STARTUP=%ROOT%\startup.txt"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=help"

REM --- collect the remaining arguments, quoted ----------------
set "REST="
:collect
shift
if "%~1"=="" goto dispatch
set "REST=%REST% "%~1""
goto collect

:dispatch
if /i "%CMD%"=="help"     goto help
if /i "%CMD%"=="-h"       goto help
if /i "%CMD%"=="-?"       goto help
if /i "%CMD%"=="--help"   goto help
if /i "%CMD%"=="version"  goto version
if /i "%CMD%"=="-v"       goto version
if /i "%CMD%"=="--version" goto version
if /i "%CMD%"=="startup"  goto startup
if /i "%CMD%"=="-s"       goto startup
if /i "%CMD%"=="--startup" goto startup
if /i "%CMD%"=="serve"    goto serve
if /i "%CMD%"=="start"    goto serve
if /i "%CMD%"=="--serve"  goto serve
if /i "%CMD%"=="--start"  goto serve
if /i "%CMD%"=="list"     goto list
if /i "%CMD%"=="ls"       goto list
if /i "%CMD%"=="--list"   goto list
if /i "%CMD%"=="export"   goto export
if /i "%CMD%"=="copy"     goto export
if /i "%CMD%"=="--export" goto export
if /i "%CMD%"=="check"    goto check
if /i "%CMD%"=="test"     goto check
if /i "%CMD%"=="--check"  goto check
if /i "%CMD%"=="doctor"   goto doctor
if /i "%CMD%"=="diagnose" goto doctor
if /i "%CMD%"=="info"     goto info
if /i "%CMD%"=="about"    goto info
if /i "%CMD%"=="-i"       goto info
if /i "%CMD%"=="--info"   goto info
if /i "%CMD%"=="--about"  goto info

echo red: "%CMD%" is not a command. Try red.bat help
exit /b 1

REM ------------------------------------------------------------
:help
call :readversion
echo.
echo   RedGet %RGVER% - a code forge that runs entirely in your browser
echo.
echo   USAGE
echo     red.bat ^<command^> [options]
echo     ./red.sh ^<command^> [options]        on Linux / macOS
echo.
echo   COMMANDS
echo     help, --help               this text
echo     version, --version         version, Node release, file inventory
echo     info, about, --info        about this install
echo     startup, --startup         how to open the site (prints startup.txt)
echo     serve [port], --serve      run RedGet on http://localhost:4173
echo     list, --list               every forge in an exported database
echo     export ^<forge^> [dir]       copy one forge's files to your computer
echo     export --all [dir]         copy every forge, one folder each
echo     check, --check             run the validation suite
echo     doctor, --doctor           diagnose this install
echo.
echo   START THE SITE
echo     red.bat serve              then open http://localhost:4173
echo     red.bat serve 8080         on another port
echo.
echo   COPY A FORGE OUT
echo     1. in RedGet:  Settings -^> Data -^> "Export data as JSON"
echo     2. put redget-data.json next to red.bat
echo     3. red.bat list
echo        red.bat export atlas atlas
echo        red.bat export --all backup
echo.
echo   MORE
echo     red.bat startup            the full guide
echo     notepad "%STARTUP%"
echo.
exit /b 0

REM ------------------------------------------------------------
:version
call :readversion
echo RedGet %RGVER%
where node >nul 2>nul
if errorlevel 1 (
  echo   node      not installed - the site still runs, the checks do not
  echo   root      %ROOT%
  exit /b 0
)
for /f "delims=" %%v in ('node --version') do echo   node      %%v
echo   platform  windows
echo   root      %ROOT%
set /a MODULES=0
set /a VIEWS=0
set /a CSS=0
for /r "%ROOT%\src" %%f in (*.js) do set /a MODULES+=1
for /r "%ROOT%\src\views" %%f in (*.js) do set /a VIEWS+=1
for /r "%ROOT%\assets\css" %%f in (*.css) do set /a CSS+=1
echo   modules   %MODULES% ES modules, %VIEWS% views, %CSS% stylesheets
echo   storage   localStorage key redget.db.v5
exit /b 0

REM ------------------------------------------------------------
:startup
if not exist "%STARTUP%" (
  echo red: startup.txt is missing from %ROOT%
  exit /b 1
)
type "%STARTUP%"
exit /b 0

REM ------------------------------------------------------------
:serve
call :neednode
if errorlevel 1 exit /b 1
node "%CLI%" serve %REST%
exit /b %errorlevel%

:list
call :neednode
if errorlevel 1 exit /b 1
node "%CLI%" list %REST%
exit /b %errorlevel%

:export
call :neednode
if errorlevel 1 exit /b 1
node "%CLI%" export %REST%
exit /b %errorlevel%

:check
call :neednode
if errorlevel 1 exit /b 1
node "%CLI%" check
exit /b %errorlevel%

:doctor
call :neednode
if errorlevel 1 exit /b 1
node "%CLI%" doctor
exit /b %errorlevel%

:info
call :neednode
if errorlevel 1 exit /b 1
node "%CLI%" info
exit /b %errorlevel%

REM ------------------------------------------------------------
:readversion
set "RGVER=unknown"
if not exist "%ROOT%\package.json" exit /b 0
for /f "tokens=2 delims=:," %%v in ('findstr /c:"\"version\"" "%ROOT%\package.json"') do set "RGVER=%%~v"
exit /b 0

:neednode
where node >nul 2>nul
if errorlevel 1 (
  echo red: Node.js is not installed ^(or not on PATH^).
  echo.
  echo   The site itself needs no Node - open index.html through any static
  echo   server, for example:   py -m http.server 4173
  echo   For the red commands:  https://nodejs.org  ^(v18 or newer^)
  echo.
  exit /b 1
)
if not exist "%CLI%" (
  echo red: %CLI% is missing - run this script from the RedGet folder.
  exit /b 1
)
exit /b 0
