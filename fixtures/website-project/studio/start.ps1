param([Parameter(Mandatory=$true)][string]$Projects, [switch]$Open)
$ErrorActionPreference = 'Stop'
$projectsRoot = [IO.Path]::GetFullPath($Projects)
$entry = Join-Path $PSScriptRoot 'server.mjs'
$node = (Get-Command node -ErrorAction Stop).Source
$key = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($projectsRoot.ToLowerInvariant())))
$mutex = [Threading.Mutex]::new($false, ('Local\BranctStudio-' + $key))
$held = $false
try {
try { $held = $mutex.WaitOne(15000) } catch [Threading.AbandonedMutexException] { $held = $true }
if (-not $held) { throw 'Outro arranque está em curso. Aguarde e abra novamente o atalho.' }
# Validate before any directory/log write; resume only a verified loopback session.
$existing = & $node --input-type=module -e 'import {pathToFileURL} from "node:url";const {findRunningStudio}=await import(pathToFileURL(process.argv[2]).href);console.log(JSON.stringify(await findRunningStudio(process.argv[3])));' studio-preflight $entry $projectsRoot
if ($LASTEXITCODE -ne 0) { throw 'Raiz ou sessão recusada. Consulte a mensagem acima; nenhum novo servidor foi iniciado.' }
$info = $existing | ConvertFrom-Json
if (-not $info) {
if (-not (Test-Path -LiteralPath $projectsRoot)) {
  $parent = Split-Path -Parent $projectsRoot
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'A pasta-pai tem de existir.' }
  New-Item -ItemType Directory -Path $projectsRoot -ErrorAction Stop | Out-Null
}
$launch = Join-Path $projectsRoot ('launch-' + [Guid]::NewGuid().ToString())
$childId = & $node --input-type=module -e 'import fs from "node:fs";import {spawn} from "node:child_process";const out=fs.openSync(process.argv[4]+".stdout.log","wx"),err=fs.openSync(process.argv[4]+".stderr.log","wx");const child=spawn(process.execPath,[process.argv[2],"start",process.argv[3]],{detached:true,windowsHide:true,stdio:["ignore",out,err]});child.on("error",e=>{console.error(e.message);process.exitCode=1;});child.on("spawn",()=>{console.log(child.pid);child.unref();});fs.closeSync(out);fs.closeSync(err);' studio-launch $entry $projectsRoot $launch
if ($LASTEXITCODE -ne 0 -or -not $childId) { throw 'Falha no arranque isolado.' }
for ($i=0; $i -lt 100; $i++) {
  if (-not (Get-Process -Id ([int]$childId) -ErrorAction SilentlyContinue)) { Get-Content -LiteralPath "$launch.stderr.log"; throw 'Bancada não iniciou.' }
  $text = Get-Content -LiteralPath "$launch.stdout.log" -Raw
  if ($text) {
    try { $candidate = $text | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
    if ($candidate.url -and $candidate.record) { $info = $candidate; break }
  }
  Start-Sleep -Milliseconds 100
}
if (-not $info) { throw "Sem recibo de arranque. Verificar apenas o processo $childId e os logs $launch." }
}
$info | ConvertTo-Json
if ($Open) {
  try { Start-Process -FilePath $info.url -ErrorAction Stop | Out-Null }
  catch { Write-Warning "Bancada ativa. Abra este endereço no navegador: $($info.url)" }
}
} finally {
  if ($held) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
