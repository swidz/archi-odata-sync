param([string]$ScriptsDirectory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Archi/scripts'))
$ErrorActionPreference = 'Stop'
$taskPackage = Split-Path -Parent $PSScriptRoot
$taskDestination = Join-Path ([IO.Path]::GetFullPath($ScriptsDirectory)) 'archi-odata-sync'
if (Test-Path -LiteralPath $taskDestination) {
    throw 'An installation already exists. Back it up or move it before installing this version.'
}
New-Item -ItemType Directory -Path $taskDestination -Force | Out-Null
foreach ($taskFolder in @('lib', 'scripts', 'config', 'docs')) {
    Copy-Item -LiteralPath (Join-Path $taskPackage $taskFolder) -Destination $taskDestination -Recurse
}
Copy-Item -LiteralPath (Join-Path $taskPackage 'README.md') -Destination $taskDestination
Write-Output "Installed to $taskDestination. Refresh the jArchi Scripts tree."
