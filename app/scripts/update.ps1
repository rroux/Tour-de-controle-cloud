# Mise a jour de l'application au lancement de start.bat, depuis le depot GitHub indique dans app\update.cfg.
# Les donnees ne sont jamais touchees : app\data (sources, codes, projets scannes, cle de chiffrement),
# app\logs, app\runtime (Node.js portable), app\node_modules, app\dist et les fichiers .cfg deja presents.
#
# Deux modes :
#  - dossier installe par "git clone" : git pull --ff-only ;
#  - dossier installe depuis un ZIP : comparaison du dernier commit (API GitHub) avec app\.version,
#    puis telechargement de l'archive du commit et remplacement des fichiers de l'application.
#
# Codes de sortie, lus par start.bat :
#   0  application a jour
#   10 nouvelle version installee (start.bat se relance)
#   2  verification desactivee ou impossible dans ce dossier
#   1  verification ou installation impossible (reseau, depot...) : la version actuelle est lancee
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$App = Split-Path $PSScriptRoot -Parent
$Root = Split-Path $App -Parent
$VersionFile = Join-Path $App ".version"

# Dossiers de app\ jamais modifies, et dossiers de code dont les fichiers retires du depot sont supprimes.
$KeepDirs = @("data", "logs", "runtime", "node_modules", "dist")
$CodeDirs = @("client", "server", "scripts", "vendor", "demo")

function Read-Config {
  $cfg = @{ UPDATE_ENABLED = "1"; UPDATE_REPO = "rroux/Tour-de-controle-cloud"; UPDATE_BRANCH = "main" }
  $file = Join-Path $App "update.cfg"
  if (Test-Path $file) {
    foreach ($line in Get-Content $file) {
      if ($line -match '^\s*(UPDATE_[A-Z]+)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
    }
  }
  return $cfg
}

function New-Client {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $c = New-Object Net.WebClient
  # Proxy de l'entreprise configure dans Windows, avec la session de l'utilisateur.
  $c.Proxy = [Net.WebRequest]::GetSystemWebProxy()
  $c.Proxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
  $c.Headers.Add("User-Agent", "tour-de-controle-cep")
  return $c
}

function Update-WithGit {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Output "Dossier installe avec git, mais git est introuvable : mise a jour ignoree."
    exit 2
  }
  & git -C $Root fetch --quiet 2>&1 | Write-Output
  if ($LASTEXITCODE -ne 0) { Write-Output "git fetch a echoue."; exit 1 }
  $behind = (& git -C $Root rev-list --count "HEAD..@{u}" 2>$null)
  if ($LASTEXITCODE -ne 0) { Write-Output "Branche locale sans branche distante suivie : mise a jour ignoree."; exit 2 }
  if ([int]$behind -eq 0) { Write-Output "A jour (git)."; exit 0 }
  if (& git -C $Root status --porcelain --untracked-files=no) {
    Write-Output "$behind nouveau(x) commit(s), mais des fichiers de l'application ont ete modifies sur ce PC : mise a jour ignoree."
    exit 1
  }
  & git -C $Root pull --ff-only --quiet 2>&1 | Write-Output
  if ($LASTEXITCODE -ne 0) { Write-Output "git pull a echoue."; exit 1 }
  Write-Output "Mise a jour git : $behind commit(s) recupere(s)."
  exit 10
}

function Find-ProjectRoot($dir) {
  # Racine de l'archive : le dossier qui contient start.bat et app\package.json (dossier de premier ou second niveau).
  $candidates = @(Get-ChildItem $dir -Directory) + @(Get-ChildItem $dir -Directory | ForEach-Object { Get-ChildItem $_.FullName -Directory })
  foreach ($d in $candidates) {
    if ((Test-Path (Join-Path $d.FullName "start.bat")) -and (Test-Path (Join-Path $d.FullName "app\package.json"))) { return $d.FullName }
  }
  return $null
}

function Update-FromZip($cfg) {
  $repo = $cfg.UPDATE_REPO
  $client = New-Client
  try {
    $client.Headers.Add("Accept", "application/vnd.github.sha")
    $sha = $client.DownloadString("https://api.github.com/repos/$repo/commits/$($cfg.UPDATE_BRANCH)").Trim()
  }
  catch {
    $msg = $_.Exception.Message
    if ($msg -match "409") { $msg = "le depot est vide" }
    elseif ($msg -match "404") { $msg = "depot ou branche introuvable (ou depot prive)" }
    Write-Output "Impossible de verifier la version publiee sur github.com/$repo : $msg"
    exit 1
  }
  if ($sha -notmatch '^[0-9a-f]{40}$') { Write-Output "Reponse inattendue de GitHub."; exit 1 }

  $current = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "" }
  if ($current -eq $sha) { Write-Output "A jour (version $($sha.Substring(0, 7)))."; exit 0 }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("cep-maj-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
  $zip = "$tmp.zip"
  try {
    Write-Output "Nouvelle version $($sha.Substring(0, 7)) (installee : $(if ($current) { $current.Substring(0, 7) } else { 'inconnue' }))."
    $client = New-Client
    $client.DownloadFile("https://codeload.github.com/$repo/zip/$sha", $zip)
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $tar = Join-Path $env:SystemRoot "System32\tar.exe"
    if (Test-Path $tar) { & $tar -xf $zip -C $tmp; if ($LASTEXITCODE -ne 0) { throw "echec de l'extraction" } }
    else { Expand-Archive -Path $zip -DestinationPath $tmp }

    $src = Find-ProjectRoot $tmp
    if (-not $src) { throw "l'archive ne contient pas start.bat et app\package.json" }

    # Tout est telecharge et verifie : remplacement des fichiers.
    $newFiles = @{}
    $copied = 0
    foreach ($f in Get-ChildItem $src -Recurse -File -Force) {
      $rel = $f.FullName.Substring($src.Length + 1).Replace("/", "\")
      $parts = $rel -split '[\\/]'
      if ($parts.Count -gt 1 -and $parts[0] -ne "app") { continue }               # autres dossiers du depot
      if ($parts[0] -eq "app" -and $parts.Count -gt 2 -and $KeepDirs -contains $parts[1]) { continue }
      if ($rel -eq "app\.version") { continue }
      $newFiles[$rel.ToLower()] = $true
      $dest = Join-Path $Root ($rel -replace '\\', [IO.Path]::DirectorySeparatorChar)
      if ($rel -like "*.cfg" -and (Test-Path $dest)) { continue }                  # reglages locaux conserves
      New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
      Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
      $copied++
    }
    # Fichiers de code retires de la nouvelle version.
    $removed = 0
    foreach ($d in $CodeDirs) {
      $dir = Join-Path $App $d
      if (-not (Test-Path $dir)) { continue }
      foreach ($f in Get-ChildItem $dir -Recurse -File -Force) {
        $rel = $f.FullName.Substring($Root.Length + 1).Replace("/", "\")
        if (-not $newFiles.ContainsKey($rel.ToLower())) { Remove-Item -LiteralPath $f.FullName -Force; $removed++ }
      }
    }
    Set-Content -Path $VersionFile -Value $sha -Encoding ASCII
    Write-Output "Version $($sha.Substring(0, 7)) installee : $copied fichier(s) copie(s), $removed supprime(s). Donnees scannees conservees."
    exit 10
  }
  catch {
    Write-Output "Mise a jour impossible : $($_.Exception.Message)"
    exit 1
  }
  finally {
    if (Test-Path $zip) { Remove-Item -Force $zip -ErrorAction SilentlyContinue }
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
  }
}

$cfg = Read-Config
if ($cfg.UPDATE_ENABLED -ne "1") { Write-Output "Mise a jour automatique desactivee (app\update.cfg)."; exit 2 }

if (Test-Path (Join-Path $Root ".git")) { Update-WithGit }

# Dossier place dans un autre depot git (copie de developpement) : ne pas le modifier.
$parent = Split-Path $Root -Parent
while ($parent) {
  if (Test-Path (Join-Path $parent ".git")) {
    Write-Output "Dossier inclus dans le depot git $parent : mise a jour a faire avec git pull."
    exit 2
  }
  $parent = Split-Path $parent -Parent
}

Update-FromZip $cfg
