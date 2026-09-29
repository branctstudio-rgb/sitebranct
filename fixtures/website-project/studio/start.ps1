param([Parameter(Mandatory=$true)][string]$Projects)
$ErrorActionPreference = 'Stop'
$projectsRoot = [IO.Path]::GetFullPath($Projects)
$entry = Join-Path $PSScriptRoot 'server.mjs'
if (-not (Test-Path -LiteralPath $projectsRoot)) {
  $parent = Split-Path -Parent $projectsRoot
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'A pasta-pai tem de existir.' }
  New-Item -ItemType Directory -Path $projectsRoot -ErrorAction Stop | Out-Null
}
# Node owns all validation and lifecycle. No commands are built from browser input.
& node --input-type=module -e 'import {noLinks} from "./fixtures/website-project/project.mjs";noLinks(process.argv[1]);' $projectsRoot
if ($LASTEXITCODE -ne 0) { throw 'Raiz recusada.' }
$launch = Join-Path $projectsRoot ('launch-' + [Guid]::NewGuid().ToString())
$argsList = @($entry,'start',$projectsRoot) | ForEach-Object { '"' + $_ + '"' }
$child = Start-Process -FilePath (Get-Command node -ErrorAction Stop).Source -ArgumentList $argsList -WindowStyle Hidden -PassThru -RedirectStandardOutput "$launch.stdout.log" -RedirectStandardError "$launch.stderr.log"
for ($i=0; $i -lt 100; $i++) {
  $child.Refresh()
  if ($child.HasExited) { Get-Content -LiteralPath "$launch.stderr.log"; throw 'Bancada não iniciou.' }
  $text = Get-Content -LiteralPath "$launch.stdout.log" -Raw
  if ($text) {
    try { $info = $text | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
    if ($info.url -and $info.record) { $info | ConvertTo-Json; exit 0 }
  }
  Start-Sleep -Milliseconds 100
}
throw "Sem recibo de arranque. Verificar apenas o processo $($child.Id) e os logs $launch."
