param([Parameter(Mandatory=$true)][string]$Record)
$ErrorActionPreference = 'Stop'
$recordPath = [IO.Path]::GetFullPath($Record)
$previewInfo = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$expectedEntry = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'preview.mjs'))
if ($previewInfo.mission -ne 'WEBSITE38' -or $previewInfo.host -ne '127.0.0.1' -or [IO.Path]::GetFullPath($previewInfo.script) -ne $expectedEntry -or [IO.Path]::GetFullPath($previewInfo.record) -ne $recordPath) { throw 'Registro não pertence a esta preview.' }
$previewProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$previewInfo.pid)"
if (-not $previewProcess) { Write-Output 'O processo registrado já terminou.'; exit 0 }
$previewCommand = $previewProcess.CommandLine.Replace('/','\')
if ($previewProcess.Name -ne 'node.exe' -or -not $previewCommand.Contains($expectedEntry.Replace('/','\')) -or -not $previewCommand.Contains($recordPath.Replace('/','\'))) { throw 'PID reutilizado ou comando diferente; nenhum processo encerrado.' }
$processStarted = $previewProcess.CreationDate.ToUniversalTime()
$registeredAt = ([DateTimeOffset]$previewInfo.startedAt).UtcDateTime
if ($processStarted -gt $registeredAt -or ($registeredAt - $processStarted).TotalSeconds -gt 30) { throw 'Data do processo não corresponde ao registro; nenhum processo encerrado.' }
Stop-Process -Id ([int]$previewInfo.pid) -ErrorAction Stop
$receipt = [pscustomobject]@{pid=$previewInfo.pid;stoppedAt=[DateTime]::UtcNow.ToString('o');method='verified-own-pid-command-start-time';record=$recordPath}
$stopPath = "$recordPath.stopped.json"
$stream = [IO.File]::Open($stopPath,[IO.FileMode]::CreateNew)
try { $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json)+[Environment]::NewLine); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
$receipt | ConvertTo-Json
