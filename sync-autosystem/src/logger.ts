import * as fs from 'fs'
import * as path from 'path'

const LOG_DIR  = path.join(__dirname, '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'sync.log')
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB — rotaciona o log

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function escrever(nivel: string, msg: string) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

  // Rotação simples
  if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_SIZE) {
    fs.renameSync(LOG_FILE, LOG_FILE.replace('.log', '.old.log'))
  }

  const linha = `[${ts()}] [${nivel}] ${msg}\n`
  fs.appendFileSync(LOG_FILE, linha, 'utf8')
  process.stdout.write(linha)
}

export const logger = {
  info:  (msg: string) => escrever('INFO ', msg),
  ok:    (msg: string) => escrever('OK   ', msg),
  warn:  (msg: string) => escrever('WARN ', msg),
  error: (msg: string) => escrever('ERROR', msg),
}
