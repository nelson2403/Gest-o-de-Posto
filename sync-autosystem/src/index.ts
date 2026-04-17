/**
 * Orchestrador principal do sync-autosystem
 *
 * Schedules:
 *  - A cada 3 min  → movto, caixa, cartao_concilia, tef (hoje)
 *  - Toda hora     → pessoa, produto, estoque_produto
 *  - 03:00 diário  → tabelas estáticas (empresa, conta, motivo, grupos...)
 *  - 03:05 diário  → movto, caixa, cartao, tef (ontem — pega lançamentos tardios)
 */
import cron from 'node-cron'
import { config } from './config'
import { buscarEmpresasAtivas } from './autosystem'
import { logger } from './logger'

import { syncMovtoHoje, syncMovtoOntem }             from './syncers/movto'
import { syncCaixaHoje, syncCaixaOntem }             from './syncers/caixa'
import { syncCartaoHoje, syncCartaoOntem }           from './syncers/cartao_concilia'
import { syncTefHoje, syncTefOntem }                 from './syncers/tef_transacao'
import { syncPessoa, syncProduto }                   from './syncers/pessoa_produto'
import { syncEstoqueProduto }                        from './syncers/estoque_produto'
import { syncTodosEstaticos }                        from './syncers/estaticos'

let rodando = false

async function syncIncremental(empresas: number[]) {
  if (rodando) {
    logger.warn('Sync anterior ainda em andamento — pulando ciclo')
    return
  }
  rodando = true
  try {
    await Promise.all([
      syncMovtoHoje(empresas),
      syncCaixaHoje(empresas),
      syncCartaoHoje(empresas),
      syncTefHoje(empresas),
    ])
  } finally {
    rodando = false
  }
}

async function syncOntem(empresas: number[]) {
  await Promise.all([
    syncMovtoOntem(empresas),
    syncCaixaOntem(empresas),
    syncCartaoOntem(empresas),
    syncTefOntem(empresas),
  ])
}

async function syncSemiEstaticos(empresas: number[]) {
  await syncPessoa(empresas)
  await syncProduto(empresas)
  await syncEstoqueProduto(empresas)
}

async function main() {
  logger.info('════════════════════════════════════════')
  logger.info('  sync-autosystem iniciando...')
  logger.info('════════════════════════════════════════')

  const empresas = await buscarEmpresasAtivas(config.empresasGrids)
  logger.info(`Empresas ativas: [${empresas.join(', ')}]`)

  // Sync inicial ao ligar o serviço
  logger.info('Executando sync inicial...')
  await syncIncremental(empresas)
  await syncSemiEstaticos(empresas)

  // A cada 3 minutos — incremental (hoje)
  cron.schedule(config.intervaloCronMinutos, async () => {
    const emps = await buscarEmpresasAtivas(config.empresasGrids)
    await syncIncremental(emps)
  })

  // A cada hora — semi-estáticos
  cron.schedule(config.intervaloCronHorario, async () => {
    const emps = await buscarEmpresasAtivas(config.empresasGrids)
    await syncSemiEstaticos(emps)
  })

  // 03:00 — estáticos
  cron.schedule(config.intervaloCronDiario, async () => {
    logger.info('Cron diário 03:00 — estáticos')
    await syncTodosEstaticos()
  })

  // 03:05 — ontem (lançamentos tardios)
  cron.schedule('5 3 * * *', async () => {
    logger.info('Cron diário 03:05 — ontem')
    const emps = await buscarEmpresasAtivas(config.empresasGrids)
    await syncOntem(emps)
  })

  logger.info('Agendamentos ativos. Serviço em execução.')
}

main().catch(e => {
  logger.error(`Falha fatal: ${e.message}`)
  process.exit(1)
})
