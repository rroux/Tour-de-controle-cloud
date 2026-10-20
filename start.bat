@echo off
rem Lance la Tour de controle CEP sur ce PC (http://localhost:3000). L'application est dans le dossier app\.
rem Chaque etape affiche OK ou ECHEC ; le detail est ecrit dans app\logs\start.log.
rem Les dependances et l'interface sont reinstallees / recompilees automatiquement quand le code a change.
rem Avant le lancement, une nouvelle version est recherchee sur GitHub (app\update.cfg) et installee
rem sans toucher aux donnees deja scannees (app\data).
rem En cas d'echec, un diagnostic du poste est lance automatiquement (app\logs\diagnostic.txt).
rem   start.bat diagnostic   diagnostic seul, sans lancer l'application
rem   start.bat rebuild      force la reinstallation des dependances et la recompilation
chcp 65001 >nul
title Tour de controle CEP
set "APP=%~dp0app\"
set "LOGDIR=%~dp0app\logs"
set "LOG=%~dp0app\logs\start.log"
set "STEP=%~dp0app\logs\etape.tmp"
if "%PORT%"=="" set "PORT=3000"
set "FORCE_REBUILD="
if /i "%~1"=="rebuild" set "FORCE_REBUILD=1"
if /i "%~1"=="diagnostic" goto :mode_diagnostic

echo.
echo Tour de controle CEP - demarrage
echo ================================
echo.

rem ---------------------------------------------------------------- [1/6]
<nul set /p "=[1/6] Dossier de l'application ...... "
if "%APP:~0,2%"=="\\" goto :err_unc
if not exist "%APP%package.json" goto :err_app
cd /d "%APP%"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul
rem Relance apres une mise a jour : le journal du premier passage est conserve.
if defined CEP_UPDATED goto :journal_suite
if exist "%LOG%" copy /y "%LOG%" "%LOGDIR%\start.precedent.log" >nul 2>nul
(echo ===== Demarrage du %date% a %time% =====) > "%LOG%" 2>nul
if errorlevel 1 goto :err_ecriture
goto :journal_ok
:journal_suite
(echo ===== Relance apres mise a jour, %time% =====) >> "%LOG%" 2>nul
if errorlevel 1 goto :err_ecriture
:journal_ok
>>"%LOG%" echo Dossier : %APP%
>>"%LOG%" echo Utilisateur : %USERDOMAIN%\%USERNAME%
>>"%LOG%" ver
>>"%LOG%" echo Port : %PORT%
echo OK
echo %APP% | find /i "OneDrive" >nul && echo         Attention : dossier synchronise par OneDrive, l'installation sera plus lente.

rem ---------------------------------------------------------------- [2/6]
call :etape 2 "Mise a jour ..................."
if defined CEP_UPDATED goto :maj_installee
<nul set /p "=verification... "
rem Le script peut remplacer start.bat : l'appel et la relance doivent tenir dans un meme bloc,
rem lu en entier par cmd avant d'etre execute.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%scripts\update.ps1" > "%STEP%" 2>&1
  if errorlevel 10 if not errorlevel 11 (
    echo nouvelle version installee
    type "%STEP%" >> "%LOG%"
    set "CEP_UPDATED=1"
    echo         Redemarrage de start.bat avec la nouvelle version...
    echo.
    "%~f0" %*
  )
)
call :maj_resultat
goto :etape2

:maj_installee
set "VER="
if exist "%APP%.version" set /p VER=<"%APP%.version"
if defined VER (echo OK, version %VER:~0,7% installee) else (echo OK, nouvelle version installee)
>>"%LOG%" echo Nouvelle version installee %VER%
set "CEP_UPDATED="

rem ---------------------------------------------------------------- [3/6]
:etape2
set "NODE_VER="
set "NODE_EXE="
rem Si Node.js est absent, use-node.bat ouvre le Portail d'entreprise ou telecharge la version portable.
call :etape 3 "Node.js ......................."
call "%APP%scripts\use-node.bat" > "%STEP%" 2>&1
if not errorlevel 1 node -v >> "%STEP%" 2>&1
call :resultat
if errorlevel 1 goto :aide_node
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
for /f "delims=" %%w in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%w"
echo         Version %NODE_VER% : %NODE_EXE%
>>"%LOG%" echo Node.js %NODE_VER% : %NODE_EXE%

rem ---------------------------------------------------------------- [4/6]
call :etape 4 "Dependances npm ..............."
if defined FORCE_REBUILD goto :npm_install
node scripts\build-state.mjs check deps >> "%LOG%" 2>&1
if errorlevel 1 goto :npm_install
echo a jour
>>"%LOG%" echo A jour
goto :etape4
:npm_install
<nul set /p "=installation, 1 a 2 minutes... "
call npm install --no-audit --no-fund > "%STEP%" 2>&1
if not errorlevel 1 node scripts\build-state.mjs save deps >> "%STEP%" 2>&1
call :resultat
if errorlevel 1 goto :aide_npm

rem ---------------------------------------------------------------- [5/6]
:etape4
call :etape 5 "Interface web ................."
if defined FORCE_REBUILD goto :npm_build
if not exist "%APP%dist\index.html" goto :npm_build
node scripts\build-state.mjs check build >> "%LOG%" 2>&1
if errorlevel 1 goto :npm_build
echo a jour
>>"%LOG%" echo A jour
goto :etape5
:npm_build
<nul set /p "=compilation... "
call npm run build > "%STEP%" 2>&1
if not errorlevel 1 node scripts\build-state.mjs save build >> "%STEP%" 2>&1
call :resultat
if errorlevel 1 goto :aide_build

rem ---------------------------------------------------------------- [6/6]
:etape5
call :etape 6 "Serveur ......................."
echo demarrage, le navigateur s'ouvrira tout seul.
echo.
>>"%LOG%" echo Lancement de node server\index.js, sortie dans app\logs\server.log
set "OPEN_BROWSER=1"
node server\index.js
set "RC=%errorlevel%"
>>"%LOG%" echo Serveur arrete, code %RC%
if "%RC%"=="0" goto :fin_ok
echo.
echo [6/6] Serveur ...................... ECHEC, code %RC%
echo   Le message d'erreur est affiche juste au-dessus.
echo   Journal du serveur : %LOGDIR%\server.log
goto :fin_erreur

rem ================================================================ aides
:aide_node
echo   Causes possibles :
echo    - pas d'acces a Internet ou proxy bloquant le telechargement de nodejs.org ;
echo    - scripts PowerShell interdits par une strategie de l'entreprise ;
echo    - programme node.exe bloque par AppLocker : demandez a la DSI d'installer Node.js LTS.
echo   Solution de secours : installez Node.js LTS depuis https://nodejs.org puis relancez start.bat.
goto :fin_erreur

:aide_npm
echo   Causes possibles :
echo    - proxy d'entreprise : declarez-le a npm puis relancez start.bat :
echo        npm config set proxy http://ADRESSE_DU_PROXY:PORT
echo        npm config set https-proxy http://ADRESSE_DU_PROXY:PORT
echo    - registre npm bloque : demandez l'adresse du registre interne a la DSI.
echo    - antivirus bloquant l'ecriture dans node_modules.
goto :fin_erreur

:aide_build
echo   La compilation de l'interface a echoue. Relancez avec : start.bat rebuild
goto :fin_erreur

rem ================================================================ fins
:fin_ok
>>"%LOG%" echo Fin normale
echo Cette fenetre se fermera dans 10 secondes.
timeout /t 10 >nul
exit /b 0

:err_unc
echo ECHEC
echo.
echo   L'application est lancee depuis un partage reseau : %APP%
echo   Windows ne permet pas de lancer un .bat depuis un chemin \\serveur\...
echo   Copiez le dossier sur votre PC, par exemple dans Documents, puis relancez start.bat.
goto :fin_sans_journal

:err_app
echo ECHEC
echo.
echo   Dossier app introuvable a cote de start.bat : %APP%
echo   start.bat doit rester a la racine du projet, a cote du dossier app.
goto :fin_sans_journal

:err_ecriture
echo ECHEC
echo.
echo   Impossible d'ecrire dans %APP%
echo   Copiez le dossier de l'application dans un dossier personnel, par exemple Documents, puis relancez start.bat.
goto :fin_sans_journal

:fin_erreur
>>"%LOG%" echo ===== Echec du demarrage =====
echo.
echo   Recherche de la cause : diagnostic du poste en cours...
call :diagnostic
echo.
echo   Journal du demarrage : %LOG%
echo   Rapport de diagnostic : %LOGDIR%\diagnostic.txt
echo   Envoyez ces deux fichiers si le probleme persiste.
echo.
pause
exit /b 1

:mode_diagnostic
if "%APP:~0,2%"=="\\" goto :err_unc
if not exist "%APP%package.json" goto :err_app
cd /d "%APP%"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul
call :diagnostic
echo   Rapport complet : %LOGDIR%\diagnostic.txt
echo.
pause
exit /b 0

:fin_sans_journal
echo.
pause
exit /b 1

rem ================================================================ sous-routines
:etape
rem %1 = numero, %2 = libelle. Affiche le libelle sans retour a la ligne.
<nul set /p "=[%~1/6] %~2 "
>>"%LOG%" echo.
>>"%LOG%" echo --- [%~1/6] %~2 (%time:~0,8%)
exit /b 0

:resultat
rem A appeler juste apres la commande : affiche OK ou ECHEC et copie la sortie dans le journal.
set "RC=%errorlevel%"
if exist "%STEP%" type "%STEP%" >> "%LOG%"
if not "%RC%"=="0" goto :resultat_echec
echo OK
>>"%LOG%" echo Resultat : OK
if exist "%STEP%" del "%STEP%" >nul 2>nul
exit /b 0
:resultat_echec
echo ECHEC
>>"%LOG%" echo Resultat : ECHEC, code %RC%
echo.
echo   ---- Detail de l'erreur ----------------------------------------
if exist "%STEP%" type "%STEP%"
echo   ----------------------------------------------------------------
echo.
if exist "%STEP%" del "%STEP%" >nul 2>nul
exit /b 1

:maj_resultat
rem Resultat de update.ps1 : 0 a jour, 2 ignoree, autre = verification impossible.
rem Jamais bloquant : la version actuelle est lancee.
set "RC=%errorlevel%"
if exist "%STEP%" type "%STEP%" >> "%LOG%"
if "%RC%"=="0" (echo a jour) else if "%RC%"=="2" (echo ignoree) else (echo non verifiee, lancement de la version actuelle)
if not "%RC%"=="0" if exist "%STEP%" for /f "usebackq delims=" %%l in ("%STEP%") do echo         %%l
if exist "%STEP%" del "%STEP%" >nul 2>nul
exit /b 0

rem ================================================================ diagnostic
:diagnostic
rem Diagnostic du poste : verifie ce dont l'application a besoin, sans rien modifier.
rem Lance automatiquement apres un echec, ou a la demande avec : start.bat diagnostic
rem Rapport complet dans logs\diagnostic.txt.
set /a NB_ECHEC=0
set /a NB_ATTN=0
set "R=%LOGDIR%\diagnostic.txt"
(echo ===== Diagnostic du %date% a %time% =====) > "%R%" 2>nul
echo.
echo   Diagnostic du poste
echo   ===================
rem ---- Poste
for /f "tokens=*" %%v in ('ver') do set "WINVER=%%v"
call :ligne INFO "Windows : %WINVER%"
call :ligne INFO "Utilisateur : %USERDOMAIN%\%USERNAME%"
net session >nul 2>&1
if errorlevel 1 (call :ligne INFO "Droits administrateur : non. Ils ne sont pas necessaires.") else (call :ligne INFO "Droits administrateur : oui")
call :ligne OK "Dossier de l'application inscriptible : %APP%"
echo %APP% | find /i "OneDrive" >nul && call :ligne ATTN "Dossier synchronise par OneDrive : installation plus lente, preferez un dossier hors OneDrive."

rem ---- Node.js
if exist "%APP%runtime\node\node.exe" (
  "%APP%runtime\node\node.exe" -v > "%APP%logs\diag.tmp" 2>&1
  if errorlevel 1 (
    call :ligne ECHEC "Node.js portable present mais bloque : probablement AppLocker. Demandez a la DSI d'installer Node.js LTS."
    type "%APP%logs\diag.tmp" >> "%R%"
  ) else (
    for /f "delims=" %%v in ('type "%APP%logs\diag.tmp"') do call :ligne OK "Node.js portable de l'application : %%v"
  )
) else (
  call :ligne INFO "Node.js portable : pas encore telecharge"
)
set "SYSNODE="
for /f "delims=" %%w in ('where node 2^>nul') do if not defined SYSNODE set "SYSNODE=%%w"
if not defined SYSNODE if exist "%ProgramFiles%\nodejs\node.exe" set "SYSNODE=%ProgramFiles%\nodejs\node.exe"
if not defined SYSNODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "SYSNODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined SYSNODE goto :diag_nosysnode
set "SYSVER="
rem Guillemets doubles : cmd /c retire la paire exterieure, le chemin avec espaces reste entre guillemets.
for /f "delims=" %%v in ('""%SYSNODE%" -v 2>nul"') do set "SYSVER=%%v"
if defined SYSVER (call :ligne OK "Node.js installe sur le PC : %SYSVER%") else (call :ligne ECHEC "Node.js installe sur le PC mais bloque au lancement : contactez la DSI.")
>>"%R%" echo Node.js du PC : %SYSNODE%
goto :diag_portail
:diag_nosysnode
call :ligne INFO "Node.js installe sur le PC : aucun"

:diag_portail
rem ---- Portail d'entreprise (node-portail.cfg)
set "PORTAL_APP_ID="
if exist "%APP%node-portail.cfg" for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%APP%node-portail.cfg") do if /i "%%a"=="PORTAL_APP_ID" set "PORTAL_APP_ID=%%b"
if not defined PORTAL_APP_ID (
  call :ligne INFO "Portail d'entreprise : non configure dans node-portail.cfg"
  goto :diag_ps
)
set "CPAPP="
for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "if (Get-AppxPackage -Name Microsoft.CompanyPortal -ErrorAction SilentlyContinue) { 'OUI' } else { 'NON' }" 2^>nul`) do set "CPAPP=%%r"
if "%CPAPP%"=="OUI" call :ligne OK "Application Portail d'entreprise presente ; Node.js : %PORTAL_APP_ID%"
if "%CPAPP%"=="NON" call :ligne ATTN "Application Portail d'entreprise introuvable : start.bat proposera le lien web du portail, ou la version portable."
if not defined CPAPP call :ligne INFO "Portail d'entreprise configure ; presence de l'application non verifiable sans PowerShell."

:diag_ps

rem ---- PowerShell : peut-il executer le script d'installation de Node.js ?
(echo Write-Output 'PS_OK') > "%APP%logs\diag-test.ps1"
set "PSRES="
for /f "delims=" %%r in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%logs\diag-test.ps1" 2^>nul') do set "PSRES=%%r"
del "%APP%logs\diag-test.ps1" >nul 2>nul
if "%PSRES%"=="PS_OK" (
  call :ligne OK "Scripts PowerShell autorises : le telechargement automatique de Node.js est possible."
) else (
  if exist "%APP%runtime\node\node.exe" (
    call :ligne INFO "Scripts PowerShell bloques, sans consequence : Node.js portable est deja present."
  ) else if defined SYSNODE (
    call :ligne INFO "Scripts PowerShell bloques, sans consequence : Node.js est installe sur le PC."
  ) else if defined PORTAL_APP_ID (
    call :ligne ATTN "Scripts PowerShell bloques : seule l'installation par le Portail d'entreprise fonctionnera."
  ) else (
    call :ligne ECHEC "Scripts PowerShell bloques : le telechargement automatique de Node.js est impossible. Installez Node.js LTS par le Portail d'entreprise."
  )
)
>>"%R%" echo.
>>"%R%" echo --- Strategies d'execution PowerShell
powershell -NoProfile -Command "Get-ExecutionPolicy -List | Format-Table -AutoSize | Out-String -Width 120" >> "%R%" 2>&1

rem ---- Proxy et acces Internet
>>"%R%" echo --- Proxy WinHTTP
netsh winhttp show proxy >> "%R%" 2>&1
>>"%R%" echo --- Proxy Internet de l'utilisateur
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable >> "%R%" 2>&1
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyServer >> "%R%" 2>&1
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v AutoConfigURL >> "%R%" 2>&1

rem Le message d'erreur est ecrit dans le rapport par PowerShell lui-meme : seul OK ou ECHEC revient ici.
set "NET_NODE="
set "DIAG_R=%R%"
for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $c=New-Object Net.WebClient; $c.Proxy=[Net.WebRequest]::GetSystemWebProxy(); $c.Proxy.Credentials=[Net.CredentialCache]::DefaultNetworkCredentials; [void]$c.DownloadString('https://nodejs.org/dist/v22.20.0/SHASUMS256.txt'); 'OK' } catch { Add-Content -Path $env:DIAG_R -Encoding UTF8 -Value ('nodejs.org : ' + $_.Exception.Message); 'ECHEC' }" 2^>nul`) do set "NET_NODE=%%r"
if "%NET_NODE%"=="OK" (
  call :ligne OK "Acces a nodejs.org, via le proxy de Windows"
) else if "%NET_NODE%"=="ECHEC" (
  call :ligne ATTN "Acces a nodejs.org impossible : necessaire seulement pour telecharger Node.js. Detail dans le rapport."
) else (
  call :ligne ATTN "Test d'acces a nodejs.org impossible : PowerShell indisponible sur ce poste."
)

set "NET_GH="
for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $c=New-Object Net.WebClient; $c.Proxy=[Net.WebRequest]::GetSystemWebProxy(); $c.Proxy.Credentials=[Net.CredentialCache]::DefaultNetworkCredentials; $c.Headers.Add('User-Agent','tour-de-controle-cep'); [void]$c.DownloadString('https://api.github.com/rate_limit'); 'OK' } catch { Add-Content -Path $env:DIAG_R -Encoding UTF8 -Value ('api.github.com : ' + $_.Exception.Message); 'ECHEC' }" 2^>nul`) do set "NET_GH=%%r"
if "%NET_GH%"=="OK" (
  call :ligne OK "Acces a GitHub pour les mises a jour automatiques"
) else if "%NET_GH%"=="ECHEC" (
  call :ligne ATTN "Acces a GitHub impossible : les mises a jour automatiques ne pourront pas etre installees. Detail dans le rapport."
)

where npm >nul 2>nul
if errorlevel 1 if exist "%APP%runtime\node\npm.cmd" set "PATH=%APP%runtime\node;%PATH%"
where npm >nul 2>nul
if errorlevel 1 (
  call :ligne INFO "npm : indisponible tant que Node.js n'est pas installe"
  goto :diag_port
)
>>"%R%" echo --- Configuration npm
for /f "delims=" %%v in ('npm config get registry 2^>nul') do >>"%R%" echo registry = %%v
rem Adresse du proxy non recopiee : elle peut contenir un mot de passe.
for %%k in (proxy https-proxy) do (
  for /f "delims=" %%v in ('npm config get %%k 2^>nul') do if "%%v"=="null" (>>"%R%" echo %%k = non defini) else (>>"%R%" echo %%k = defini)
)
call npm ping > "%APP%logs\diag.tmp" 2>&1
if errorlevel 1 (
  call :ligne ECHEC "Registre npm injoignable : npm install echouera. Declarez le proxy a npm, voir le README."
  type "%APP%logs\diag.tmp" >> "%R%"
) else (
  call :ligne OK "Registre npm joignable : npm install fonctionnera"
)

:diag_port
rem ---- Port
set "PORTSTATE="
for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue) { 'PRIS' } else { 'LIBRE' }" 2^>nul`) do set "PORTSTATE=%%r"
if "%PORTSTATE%"=="LIBRE" call :ligne OK "Port %PORT% libre"
if "%PORTSTATE%"=="PRIS" call :ligne ATTN "Port %PORT% deja utilise : l'application tourne peut-etre deja, sinon set PORT=3010."
if not defined PORTSTATE call :ligne INFO "Port %PORT% : verification impossible sans PowerShell"

rem ---- Installation de l'application
if exist "%APP%node_modules\express\package.json" (call :ligne OK "Dependances npm installees") else (call :ligne INFO "Dependances npm : pas encore installees")
if exist "%APP%dist\index.html" (call :ligne OK "Interface web compilee") else (call :ligne INFO "Interface web : pas encore compilee")

del "%APP%logs\diag.tmp" >nul 2>nul
echo.
>>"%R%" echo.
if %NB_ECHEC% GTR 0 (
  echo   Resultat du diagnostic : %NB_ECHEC% blocage^(s^) et %NB_ATTN% point^(s^) d'attention.
  >>"%R%" echo Resultat : %NB_ECHEC% blocage^(s^), %NB_ATTN% point^(s^) d'attention
) else if %NB_ATTN% GTR 0 (
  echo   Resultat du diagnostic : aucun blocage, %NB_ATTN% point^(s^) d'attention.
  >>"%R%" echo Resultat : aucun blocage, %NB_ATTN% point^(s^) d'attention
) else (
  echo   Resultat du diagnostic : aucun probleme detecte sur le poste.
  >>"%R%" echo Resultat : aucun probleme detecte
)
exit /b 0

:ligne
rem %1 = OK, INFO, ATTN ou ECHEC ; %2 = message
set "TAG=[ %~1 ]"
if "%~1"=="INFO" set "TAG=[INFO]"
if "%~1"=="ATTN" (set "TAG=[ATTENTION]" & set /a NB_ATTN+=1)
if "%~1"=="ECHEC" (set "TAG=[ECHEC]" & set /a NB_ECHEC+=1)
echo   %TAG% %~2
>>"%R%" echo %TAG% %~2
exit /b 0
