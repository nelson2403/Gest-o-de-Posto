import 'dotenv/config'

export const config = {
  autosystem: {
    host:     process.env.AS_HOST     ?? '192.168.2.200',
    port:     Number(process.env.AS_PORT ?? 5432),
    database: process.env.AS_DATABASE ?? 'matriz',
    user:     process.env.AS_USER     ?? 'app_readonly',
    password: process.env.AS_PASSWORD ?? '',
  },
  supabase: {
    url:            process.env.SUPABASE_URL             ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  // Grids das 27 empresas — se vazio, busca todas que estão mapeadas no Supabase
  empresasGrids: (process.env.EMPRESAS_GRIDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).map(Number),

  dataInicioHistorico: process.env.DATA_INICIO_HISTORICO ?? '2026-01-01',

  // Sync a cada 3 minutos
  intervaloCronMinutos: '*/3 * * * *',
  // Sync estático 1x por dia às 03:00
  intervaloCronDiario:  '0 3 * * *',
  // Sync semi-estático a cada hora
  intervaloCronHorario: '0 * * * *',
}
