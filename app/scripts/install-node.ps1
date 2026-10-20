# Télécharge Node.js en version portable dans runtime\node (aucun droit administrateur requis).
# Appelé automatiquement par scripts\use-node.bat quand Node.js est absent ou trop ancien.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # sans barre de progression, Invoke/WebClient est beaucoup plus rapide

$Version = "22.20.0"
# Empreintes officielles : https://nodejs.org/dist/v22.20.0/SHASUMS256.txt
$Hashes = @{
  x64   = "bb819d6eb8f5bfda294bbc83a7e4ec6539da67c4233d54b0d655b9248b15e29d"
  arm64 = "b12919e609b4fa1176ba8a155b49f761419a0c7cc97b42e6be09874a3f760ab6"
}
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") { "arm64" } else { "x64" }
$Name = "node-v$Version-win-$Arch"
$Url = "https://nodejs.org/dist/v$Version/$Name.zip"

$Runtime = Join-Path (Split-Path $PSScriptRoot -Parent) "runtime"
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
$Zip = Join-Path $Runtime "$Name.zip"
$Tmp = Join-Path $Runtime "extract"
$Target = Join-Path $Runtime "node"

try {
  Write-Host "Téléchargement de Node.js $Version ($Arch), environ 35 Mo..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $Client = New-Object Net.WebClient
  # Proxy de l'entreprise configuré dans Windows, avec la session de l'utilisateur.
  $Client.Proxy = [Net.WebRequest]::GetSystemWebProxy()
  $Client.Proxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
  $Client.DownloadFile($Url, $Zip)

  $Hash = (Get-FileHash -Algorithm SHA256 -Path $Zip).Hash.ToLower()
  if ($Hash -ne $Hashes[$Arch]) { throw "empreinte SHA-256 inattendue ($Hash), fichier rejeté" }

  Write-Host "Extraction..."
  if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  # tar.exe (Windows 10 1803 et plus) est bien plus rapide qu'Expand-Archive.
  $Tar = Join-Path $env:SystemRoot "System32\tar.exe"
  if (Test-Path $Tar) { & $Tar -xf $Zip -C $Tmp; if ($LASTEXITCODE -ne 0) { throw "échec de l'extraction" } }
  else { Expand-Archive -Path $Zip -DestinationPath $Tmp }

  if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
  Move-Item -Path (Join-Path $Tmp $Name) -Destination $Target
  Write-Host "Node.js $Version installé dans $Target"
  exit 0
}
catch {
  Write-Host ""
  Write-Host "Installation de Node.js impossible : $($_.Exception.Message)"
  Write-Host "Vous pouvez l'installer à la main depuis https://nodejs.org (version LTS) puis relancer start.bat."
  exit 1
}
finally {
  if (Test-Path $Zip) { Remove-Item -Force $Zip }
  if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
}
