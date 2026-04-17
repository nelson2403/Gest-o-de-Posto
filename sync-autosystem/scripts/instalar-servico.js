/**
 * Instala o sync-autosystem como serviço do Windows.
 * Execute com:  npm run instalar-servico   (como Administrador)
 */
const path    = require('path')
const Service = require('node-windows').Service

const svc = new Service({
  name:        'SyncAutosystem',
  description: 'Sincronização AUTOSYSTEM → Supabase (a cada 3 minutos)',
  script:      path.join(__dirname, '..', 'dist', 'index.js'),
  nodeOptions: [],
  workingDirectory: path.join(__dirname, '..'),
  allowServiceLogon: true,
})

svc.on('install', () => {
  console.log('✓ Serviço instalado. Iniciando...')
  svc.start()
})

svc.on('start', () => {
  console.log('✓ Serviço iniciado.')
  console.log('  Você pode gerenciá-lo em: Serviços do Windows (services.msc)')
  console.log('  Nome: SyncAutosystem')
})

svc.on('error', err => {
  console.error('✗ Erro:', err)
})

svc.on('alreadyinstalled', () => {
  console.warn('! Serviço já instalado. Desinstale primeiro com: npm run desinstalar-servico')
})

// Garante que o build existe antes de instalar
const fs   = require('fs')
const dist = path.join(__dirname, '..', 'dist', 'index.js')
if (!fs.existsSync(dist)) {
  console.error('✗ Build não encontrado em dist/index.js')
  console.error('  Execute primeiro:  npm run build')
  process.exit(1)
}

svc.install()
