# Restaura os processos do PM2 (app + sync) apos reiniciar o Windows.
# Chamado por uma Tarefa Agendada no logon. Aguarda o serviço subir e ressuscita.
Set-Location "C:\Users\Usuario\Desktop\Sistema - Gestão de controle"
Start-Sleep -Seconds 20   # da tempo da rede/VPN subir antes de iniciar o app
npx pm2 resurrect
