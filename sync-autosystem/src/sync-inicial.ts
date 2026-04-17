/**
 * sync-inicial — executa UMA VEZ para carregar o histórico completo
 *
 * Rode com:  npm run sync-inicial
 *
 * O que faz (em ordem):
 *  1. Tabelas estáticas (empresa, conta, motivo, grupos, cartao_produto, empresa_tef)
 *  2. Semi-estáticas (pessoa, produto, estoque_produto — snapshot atual)
 *  3. Histórico incremental mês a mês: movto, caixa, cartao_concilia, tef_transacao
 *     a partir de DATA_INICIO_HISTORICO (padrão: 2026-01-01)
 */
import 'dotenv/config'
import { buscarEmpresasAtivas } from './autosystem'
import { logger } from './logger'
import { config } from './config'

import { syncTodosEstaticos }                          from './syncers/estaticos'
import { syncPessoa, syncProduto }                     from './syncers/pessoa_produto'
import { syncEstoqueProduto }                          from './syncers/estoque_produto'
import { syncMovtoHistorico }                          from './syncers/movto'
import { syncCaixaHistorico }                          from './syncers/caixa'
import { syncCartaoHistorico }                         from './syncers/cartao_concilia'
import { syncTefHistorico }                            from './syncers/tef_transacao'

async function main() {
  logger.info('════════════════════════════════════════')
  logger.info('  SYNC INICIAL — carga histórica')
  logger.info(`  Data início: ${config.dataInicioHistorico}`)
  logger.info('════════════════════════════════════════')

  const empresas = await buscarEmpresasAtivas(config.empresasGrids)
  logger.info(`Empresas: [${empresas.join(', ')}]`)

  // 1. Estáticos
  logger.info('── Passo 1: tabelas estáticas ──')
  await syncTodosEstaticos()

  // 2. Semi-estáticos
  logger.info('── Passo 2: pessoa e produto ──')
  await syncPessoa(empresas)
  await syncProduto(empresas)
  await syncEstoqueProduto(empresas)

  // 3. Histórico incremental
  const dataInicio = config.dataInicioHistorico

  logger.info('── Passo 3a: movto histórico ──')
  await syncMovtoHistorico(empresas, dataInicio)

  logger.info('── Passo 3b: caixa histórico ──')
  await syncCaixaHistorico(empresas, dataInicio)

  logger.info('── Passo 3c: cartao_concilia histórico ──')
  await syncCartaoHistorico(empresas, dataInicio)

  logger.info('── Passo 3d: tef_transacao histórico ──')
  await syncTefHistorico(empresas, dataInicio)

  logger.info('════════════════════════════════════════')
  logger.info('  SYNC INICIAL CONCLUÍDO')
  logger.info('  Agora inicie o serviço com: npm start')
  logger.info('════════════════════════════════════════')
}

main().catch(e => {
  logger.error(`Falha no sync inicial: ${e.message}`)
  process.exit(1)
})
