/**
 * Script de verificação periódica de extratos — roda via PM2
 * Chama /api/cron/verificar-extratos a cada 30 minutos e loga o resultado.
 */

const http = require('http')
const fs   = require('fs')
const path = require('path')

// Lê o CRON_SECRET do ambiente ou do .env.local (mesma lógica do sync-fiscal),
// para não depender de o secret ser passado na linha de comando do PM2.
function lerSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  try {
    const envPath = path.join(__dirname, '..', '.env.local')
    for (const linha of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*CRON_SECRET\s*=\s*(.*)\s*$/)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* .env.local ausente */ }
  return 'cron-interno-gestao'
}

const CRON_SECRET = lerSecret()
const HOST        = process.env.APP_HOST ?? 'localhost'
const PORT        = parseInt(process.env.PORT ?? '3000')
const INTERVALO_MS = 30 * 60 * 1000 // 30 minutos

function chamarCron() {
  const ts = new Date().toISOString()
  const body = ''
  const options = {
    hostname: HOST,
    port:     PORT,
    path:     '/api/cron/verificar-extratos',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-cron-secret':  CRON_SECRET,
    },
  }

  const req = http.request(options, res => {
    let data = ''
    res.on('data', chunk => { data += chunk })
    res.on('end', () => {
      try {
        const json = JSON.parse(data)
        console.log(`[cron] ${ts} — status ${res.statusCode} — verificadas: ${json.verificadas ?? '?'}, divergentes: ${json.divergentes ?? '?'}`)
      } catch {
        console.log(`[cron] ${ts} — status ${res.statusCode} — resposta inválida`)
      }
    })
  })

  req.on('error', err => {
    console.error(`[cron] ${ts} — erro na requisição: ${err.message}`)
  })

  req.write(body)
  req.end()
}

console.log(`[cron] Iniciando — verificação a cada ${INTERVALO_MS / 60000} minutos`)
chamarCron()
setInterval(chamarCron, INTERVALO_MS)
