# Sincroniza os manifestos fiscais do AUTOSYSTEM periodicamente (import + conclusão).
# Chamado por uma Tarefa Agendada do Windows. Lê o CRON_SECRET do .env.local.
$ErrorActionPreference = 'Stop'
$root    = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env.local'
$secret  = ((Get-Content $envFile | Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=', '' -replace '^"|"$', '')
if (-not $secret) { exit 1 }
try {
  Invoke-WebRequest -Uri 'http://localhost:3000/api/cron/fiscal-sync' `
    -Method POST -Headers @{ 'x-cron-secret' = $secret } -UseBasicParsing -TimeoutSec 120 | Out-Null
} catch {
  # silencioso — próxima execução tenta de novo
}
