// Configuração do PM2 — Gerenciador de processos Node.js
// Mantém o servidor rodando mesmo após fechar o terminal
//
// INSTALAR PM2:
//   npm install -g pm2
//
// COMANDOS:
//   pm2 start ecosystem.config.js   → Inicia o servidor
//   pm2 stop gestao-postos          → Para o servidor
//   pm2 restart gestao-postos       → Reinicia
//   pm2 logs gestao-postos          → Ver logs
//   pm2 startup                     → Iniciar com o Windows
//   pm2 save                        → Salvar configuração

module.exports = {
  apps: [
    {
      name: 'gestao-postos',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
    },
  ],
}
