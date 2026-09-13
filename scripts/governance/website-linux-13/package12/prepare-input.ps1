param([switch]$Execute)
$ErrorActionPreference='Stop'
if (-not $Execute) { throw 'NOT_EXECUTED: requer autorização de exportação/transferência para Linux' }
$repo='C:/Users/geral/Documents/Codex/2026-08-18/referenced-chatgpt-conversation-this-is-an/work/sitebranct-website-contracts-09'
$head='563f3c13665347b2a8578110e519ebaf13f356e8'
if ((git -C $repo rev-parse HEAD) -ne $head -or $LASTEXITCODE -ne 0) { throw 'Head divergente' }
if ((git -C $repo status --porcelain) -or $LASTEXITCODE -ne 0) { throw 'Worktree divergente' }
$destination=Join-Path $PSScriptRoot 'linux-input'
if (Test-Path -LiteralPath $destination) { throw 'Destino existe; não sobrescrever' }
New-Item -ItemType Directory -Path (Join-Path $destination 'package') | Out-Null
git -C $repo bundle create (Join-Path $destination 'source.bundle') HEAD
if ($LASTEXITCODE -ne 0) { throw 'Exportação falhou' }
$names=@('future-linux.sh','linux-run.mjs','linux-responsive.mjs','causal-browser.mjs')
foreach ($name in $names) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $destination "package/$name") -ErrorAction Stop
}
$lines=@()
foreach ($relative in @('source.bundle') + @($names | ForEach-Object { "package/$_" })) {
  $hash=(Get-FileHash -LiteralPath (Join-Path $destination $relative) -Algorithm SHA256).Hash.ToLowerInvariant()
  $lines += "$hash  $relative"
}
[IO.File]::WriteAllText((Join-Path $destination 'SHA256SUMS'),($lines -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
Write-Output 'Pacote exportado, não executado. Transferir somente linux-input para a raiz Linux exclusiva.'
