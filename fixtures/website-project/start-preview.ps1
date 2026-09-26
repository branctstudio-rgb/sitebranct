param(
  [Parameter(Mandatory=$true)][string]$Recipe,
  [Parameter(Mandatory=$true)][string]$Destination,
  [Parameter(Mandatory=$true)][string]$Record
)
$ErrorActionPreference = 'Stop'
$previewEntry = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'preview.mjs'))
$recipePath = [IO.Path]::GetFullPath($Recipe)
$destinationPath = [IO.Path]::GetFullPath($Destination)
$recordPath = [IO.Path]::GetFullPath($Record)
foreach ($previewFile in @($recordPath, "$recordPath.stdout.log", "$recordPath.stderr.log")) {
  if (Test-Path -LiteralPath $previewFile) { throw "Registro já existe: $previewFile. Use um nome novo." }
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$previewArgs = @($previewEntry,$recipePath,$destinationPath,$recordPath) | ForEach-Object { '"' + $_ + '"' }
$previewProcess = Start-Process -FilePath $nodePath -ArgumentList $previewArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$recordPath.stdout.log" -RedirectStandardError "$recordPath.stderr.log"
for ($previewAttempt=0; $previewAttempt -lt 50; $previewAttempt++) {
  if (Test-Path -LiteralPath $recordPath) { Get-Content -LiteralPath $recordPath; exit 0 }
  if ($previewProcess.HasExited) { Get-Content -LiteralPath "$recordPath.stderr.log"; throw 'Preview não iniciou.' }
  Start-Sleep -Milliseconds 100
}
throw "Preview ainda sem registro. Processo criado por este comando: $($previewProcess.Id). Não encerre outras previews."
