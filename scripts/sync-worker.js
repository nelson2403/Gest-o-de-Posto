/*
 * Worker de sincronização dos manifestos fiscais do AUTOSYSTEM.
 * Roda sob o PM2 (mesmo gerenciador do app), reinicia sozinho se cair.
 *   pm2 start scripts/sync-worker.js --name sync-fiscal
 *
 * A cada INTERVALO chama o endpoint de cron (import + conclusão). Falhas são
 * logadas e NÃO derrubam o processo — a próxima execução tenta de novo.
 */
const fs   = require('fs')
const path = require('path')

const INTERVALO_MIN = Number(process.env.SYNC_INTERVAL_MIN || 30)
const BASE_URL      = process.env.SYNC_BASE_URL || 'http://localhost:3000'
const ENDPOINT      = `${BASE_URL}/api/cron/fiscal-sync`

function lerSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  try {
    const envPath = path.join(__dirname, '..', '.env.local')
    for (const linha of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*CRON_SECRET\s*=\s*(.*)\s*$/)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* .env.local ausente */ }
  return null
}

const SECRET = lerSecret()
const ts = () => new Date().toISOString()

async function sincronizar() {
  if (!SECRET) { console.error(`[sync-fiscal] ${ts()} CRON_SECRET ausente`); return }
  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'x-cron-secret': SECRET },
      signal:  AbortSignal.timeout(120000),
    })
    const txt = await res.text()
    console.log(`[sync-fiscal] ${ts()} -> HTTP ${res.status} ${txt.slice(0, 300)}`)
  } catch (e) {
    console.error(`[sync-fiscal] ${ts()} erro: ${e.message}`)
  }
}

// Evita que uma exceção não tratada derrube o worker (PM2 reiniciaria, mas
// preferimos continuar rodando).
process.on('unhandledRejection', (e) => console.error(`[sync-fiscal] ${ts()} unhandledRejection:`, e))

console.log(`[sync-fiscal] iniciado — sincroniza a cada ${INTERVALO_MIN} min em ${ENDPOINT}`)
sincronizar()
setInterval(sincronizar, INTERVALO_MIN * 60 * 1000)
