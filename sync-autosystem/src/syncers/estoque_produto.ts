/**
 * estoque_produto — sync a cada 1h
 *
 * Snapshot completo do estoque atual (sem histórico incremental).
 * PK composta: (empresa, deposito, produto)
 */
import { withClient } from '../autosystem'
import { upsertLotes } from '../supabase'
import { marcarInicio, marcarOk, marcarErro } from '../controle'
import { logger } from '../logger'

export async function syncEstoqueProduto(empresas: number[]) {
  const tabela = 'as_estoque_produto'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT
          ep.empresa::bigint,
          ep.deposito::bigint,
          ep.produto::bigint,
          ep.estoque::float,
          ep.custo_medio::float,
          ep.data::text
        FROM estoque_produto ep
        WHERE ep.empresa = ANY($1::bigint[])
        ORDER BY ep.empresa, ep.produto
      `, [empresas])

      return r.rows.map(row => ({
        empresa:     Number(row.empresa),
        deposito:    Number(row.deposito),
        produto:     Number(row.produto),
        estoque:     row.estoque    ?? null,
        custo_medio: row.custo_medio ?? null,
        data:        row.data        ?? null,
      }))
    })

    const n = await upsertLotes(tabela, rows, 'empresa,deposito,produto')
    await marcarOk(tabela, n)
    logger.ok(`${tabela}: ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}
