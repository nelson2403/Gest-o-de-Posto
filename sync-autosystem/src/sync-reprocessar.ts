/**
 * sync-reprocessar — re-sincroniza os últimos N dias de movto
 *
 * Corrige divergências causadas por lançamentos retroativos no AUTOSYSTEM
 * que entraram depois da janela de "ontem" do sync noturno.
 *
 * Uso:
 *   npm run sync-reprocessar          → últimos 30 dias (padrão)
 *   DIAS=7 npm run sync-reprocessar   → últimos 7 dias
 */
import 'dotenv/config'
import { buscarEmpresasAtivas } from './autosystem'
import { logger } from './logger'
import { config } from './config'
import { syncMovtoHistorico } from './syncers/movto'

async function main() {
  const dias = parseInt(process.env.DIAS ?? '30')

  const dataFim = new Date()
  dataFim.setDate(dataFim.getDate() - 1) // ontem
  const dataFimStr = dataFim.toISOString().slice(0, 10)

  const dataIni = new Date()
  dataIni.setDate(dataIni.getDate() - dias)
  const dataIniStr = dataIni.toISOString().slice(0, 10)

  logger.info('════════════════════════════════════════')
  logger.info(`  SYNC REPROCESSAR — últimos ${dias} dias`)
  logger.info(`  Período: ${dataIniStr} → ${dataFimStr}`)
  logger.info('════════════════════════════════════════')

  const empresas = await buscarEmpresasAtivas(config.empresasGrids)
  logger.info(`Empresas: [${empresas.join(', ')}]`)

  await syncMovtoHistorico(empresas, dataIniStr)

  logger.info('════════════════════════════════════════')
  logger.info('  REPROCESSAMENTO CONCLUÍDO')
  logger.info('════════════════════════════════════════')
}

main().catch(e => {
  logger.error(`Falha: ${e.message}`)
  process.exit(1)
})
