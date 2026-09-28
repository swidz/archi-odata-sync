param(
    [string]$ArchiHome = 'C:\Program Files\Archi',
    [Parameter(Mandatory=$true)][string]$BundlesFile,
    [string]$Script = 'archi-smoke.ajs'
)
$ErrorActionPreference='Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRuntime = Join-Path $taskRoot 'work/archi-runtime'
$taskConfig = Join-Path $taskRuntime 'config'
$taskBundles = Join-Path $taskConfig 'org.eclipse.equinox.simpleconfigurator'
New-Item -ItemType Directory -Force -Path $taskBundles,(Join-Path $taskRuntime 'workspace'),(Join-Path $taskRuntime 'empty-dropins') | Out-Null
Copy-Item -LiteralPath $BundlesFile -Destination (Join-Path $taskBundles 'bundles.info')
Copy-Item -LiteralPath (Join-Path $ArchiHome 'configuration/config.ini') -Destination (Join-Path $taskConfig 'config.ini')
$taskLauncher = Get-ChildItem -LiteralPath (Join-Path $ArchiHome 'plugins') -Filter 'org.eclipse.equinox.launcher_*.jar' | Select-Object -First 1
$taskStarted = [DateTime]::UtcNow
& (Join-Path $ArchiHome 'jre/bin/java.exe') '-Dfile.encoding=UTF-8' '-Dosgi.requiredJavaVersion=21' "-Dosgi.install.area=$ArchiHome/" "-Dosgi.configuration.area=$taskConfig" "-Dosgi.instance.area=$taskRuntime/workspace" "-Dorg.eclipse.equinox.p2.reconciler.dropins.directory=$taskRuntime/empty-dropins" '-jar' $taskLauncher.FullName '-nosplash' '-consoleLog' '-application' 'com.archimatetool.commandline.app' '--script.runScript' (Join-Path $taskRoot "tests/$Script")
if($LASTEXITCODE -ne 0){throw "Archi process failed with exit code $LASTEXITCODE"}
$taskResult = Join-Path $taskRoot ('work/' + [IO.Path]::GetFileNameWithoutExtension($Script) + '-result.json')
if(!(Test-Path -LiteralPath $taskResult) -or (Get-Item -LiteralPath $taskResult).LastWriteTimeUtc -lt $taskStarted){throw 'Archi did not produce a fresh test result.'}
if((Get-Content -LiteralPath $taskResult -Raw | ConvertFrom-Json).status -ne 'passed'){throw 'Archi test did not pass.'}
