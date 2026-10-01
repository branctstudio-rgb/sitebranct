param([Parameter(Mandatory=$true)][string]$Projects)
$ErrorActionPreference = 'Stop'
$projectsRoot = [IO.Path]::GetFullPath($Projects)
$entry = Join-Path $PSScriptRoot 'server.mjs'
# Validate before mkdir or log redirection, independent of the caller's working directory.
& node --input-type=module -e 'import {pathToFileURL} from "node:url";const {validateStudioRoot}=await import(pathToFileURL(process.argv[2]).href);validateStudioRoot(process.argv[3],{allowMissing:true});' studio-preflight $entry $projectsRoot
if ($LASTEXITCODE -ne 0) { throw 'Raiz recusada.' }
if (-not (Test-Path -LiteralPath $projectsRoot)) {
  $parent = Split-Path -Parent $projectsRoot
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'A pasta-pai tem de existir.' }
  New-Item -ItemType Directory -Path $projectsRoot -ErrorAction Stop | Out-Null
}
$launch = Join-Path $projectsRoot ('launch-' + [Guid]::NewGuid().ToString())
$childId = & node --input-type=module -e 'import fs from "node:fs";import {spawn} from "node:child_process";const out=fs.openSync(process.argv[4]+".stdout.log","wx"),err=fs.openSync(process.argv[4]+".stderr.log","wx");const child=spawn(process.execPath,[process.argv[2],"start",process.argv[3]],{detached:true,windowsHide:true,stdio:["ignore",out,err]});child.on("error",e=>{console.error(e.message);process.exitCode=1;});child.on("spawn",()=>{console.log(child.pid);child.unref();});fs.closeSync(out);fs.closeSync(err);' studio-launch $entry $projectsRoot $launch
if ($LASTEXITCODE -ne 0 -or -not $childId) { throw 'Falha no arranque isolado.' }
for ($i=0; $i -lt 100; $i++) {
  if (-not (Get-Process -Id ([int]$childId) -ErrorAction SilentlyContinue)) { Get-Content -LiteralPath "$launch.stderr.log"; throw 'Bancada não iniciou.' }
  $text = Get-Content -LiteralPath "$launch.stdout.log" -Raw
  if ($text) {
    try { $info = $text | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
    if ($info.url -and $info.record) { $info | ConvertTo-Json; exit 0 }
  }
  Start-Sleep -Milliseconds 100
}
throw "Sem recibo de arranque. Verificar apenas o processo $childId e os logs $launch."
