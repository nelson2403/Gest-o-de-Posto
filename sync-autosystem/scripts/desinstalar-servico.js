/**
 * Remove o serviço do Windows.
 * Execute com:  npm run desinstalar-servico   (como Administrador)
 */
const path    = require('path')
const Service = require('node-windows').Service

const svc = new Service({
  name:   'SyncAutosystem',
  script: path.join(__dirname, '..', 'dist', 'index.js'),
})

svc.on('uninstall', () => {
  console.log('✓ Serviço removido com sucesso.')
})

svc.on('error', err => {
  console.error('✗ Erro:', err)
})

svc.on('invalidinstallation', () => {
  console.warn('! Serviço não está instalado.')
})

svc.uninstall()
