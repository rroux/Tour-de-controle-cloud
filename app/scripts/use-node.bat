@echo off
rem Rend Node.js disponible pour le script appelant (a lancer avec CALL). Ordre de preference :
rem   1. Node.js installe sur le PC, version 20 ou plus : PATH, puis Program Files ;
rem   2. Node.js portable de l'application (runtime\node) ;
rem   3. installation par le Portail d'entreprise si node-portail.cfg indique l'application ;
rem   4. telechargement de Node.js portable dans runtime\node.
rem La sortie de ce script est redirigee vers le journal par start.bat : les messages
rem destines a l'utilisateur sont donc envoyes directement sur la console (>con).
set "APP_ROOT=%~dp0.."
set "APP_NODE=%~dp0..\runtime\node"

rem ---- 1. Node.js du PC
where node >nul 2>nul
if errorlevel 1 goto :check_program_files
call :version_ok node
if not errorlevel 1 exit /b 0
echo La version de Node.js trouvee dans le PATH est trop ancienne, 20 minimum.
:check_program_files
call :program_files
if not errorlevel 1 exit /b 0

rem ---- 2. Node.js portable deja telecharge
if exist "%APP_NODE%\node.exe" goto :portable

rem ---- 3. Portail d'entreprise
set "PORTAL_APP_ID="
set "PORTAL_WAIT_MINUTES=15"
if not exist "%APP_ROOT%\node-portail.cfg" goto :download
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%APP_ROOT%\node-portail.cfg") do (
  if /i "%%a"=="PORTAL_APP_ID" set "PORTAL_APP_ID=%%b"
  if /i "%%a"=="PORTAL_WAIT_MINUTES" set "PORTAL_WAIT_MINUTES=%%b"
)
if not defined PORTAL_APP_ID goto :download
set /a WAIT_LEFT=PORTAL_WAIT_MINUTES*6
if %WAIT_LEFT% LEQ 0 set /a WAIT_LEFT=90

echo Ouverture du Portail d'entreprise, application %PORTAL_APP_ID%
>con echo.
>con echo   Node.js n'est pas installe sur ce PC.
>con echo   Le Portail d'entreprise s'ouvre sur la page Node.js : cliquez sur Installer.
>con echo   Le demarrage reprendra tout seul des que Node.js sera installe.
>con echo   Si le portail ne s'ouvre pas : https://portal.manage.microsoft.com/apps/%PORTAL_APP_ID%
>con echo   Appuyez sur A pour abandonner et telecharger plutot la version portable.
>con echo.
start "" "companyportal:ApplicationId=%PORTAL_APP_ID%"
>con <nul set /p "=  En attente de l'installation "

:portal_wait
call :program_files
if not errorlevel 1 goto :portal_ok
if %WAIT_LEFT% LEQ 0 goto :portal_timeout
set /a WAIT_LEFT-=1
>con <nul set /p "=."
rem 10 secondes d'attente ; A interrompt (choice renvoie 1), sinon C par defaut (2).
choice /c AC /t 10 /d C /n >nul
if errorlevel 2 goto :portal_wait
>con echo.
>con echo   Installation par le portail abandonnee.
echo Portail abandonne par l'utilisateur
goto :download

:portal_ok
>con echo.
>con echo   Node.js installe par le Portail d'entreprise.
echo Node.js installe par le Portail d'entreprise
exit /b 0

:portal_timeout
>con echo.
>con echo   Node.js n'est toujours pas installe apres %PORTAL_WAIT_MINUTES% minutes.
echo Delai d'attente du portail depasse
goto :download

rem ---- 4. Telechargement de Node.js portable
:download
>con echo.
>con echo   Telechargement de Node.js portable dans le dossier de l'application, 1 a 3 minutes...
echo Telechargement de Node.js portable, sans droits administrateur.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-node.ps1"
if errorlevel 1 exit /b 1

:portable
set "PATH=%APP_NODE%;%PATH%"
exit /b 0

rem ================================================================ sous-routines
:version_ok
rem %1 = node ou chemin complet de node.exe ; code 0 si version 20 ou plus.
"%~1" -e "process.exit(+process.versions.node.split('.')[0] < 20 ? 1 : 0)" >nul 2>nul
exit /b %errorlevel%

:program_files
rem Node.js installe par le portail ou un installeur classique, absent du PATH de cette fenetre.
if exist "%ProgramFiles%\nodejs\node.exe" (
  call :version_ok "%ProgramFiles%\nodejs\node.exe"
  if not errorlevel 1 goto :pf_found
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
  call :version_ok "%LOCALAPPDATA%\Programs\nodejs\node.exe"
  if not errorlevel 1 goto :la_found
)
exit /b 1
:pf_found
set "PATH=%ProgramFiles%\nodejs;%PATH%"
exit /b 0
:la_found
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
exit /b 0
