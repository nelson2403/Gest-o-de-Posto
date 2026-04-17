/**
 * tef_transacao — sync a cada 3 minutos (hoje) + noturno (ontem)
 *
 * Não tem coluna empresa — filtra via JOIN com caixa.
 * PK: grid
 * Colunas úteis: grid, caixa (FK → caixa.grid), valor, nsu, autorizacao,
 *                operadora, operadora_nome, bandeira, status, ts_local
 */
import { withClient } from '../autosystem'
import { upsertLotes } from '../supabase'
import { marcarInicio, marcarOk, marcarErro } from '../controle'
import { logger } from '../logger'

function hoje()  { return new Date().toISOString().slice(0, 10) }
function ontem() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function syncTefPorData(empresas: number[], dataIni: string, dataFim: string): Promise<number> {
  return withClient(async c => {
    const r = await c.query(`
      SELECT
        t.grid::bigint,
        t.caixa::bigint,
        t.valor::float,
        t.nsu::text,
        t.autorizacao::text,
        t.operadora::int,
        t.operadora_nome::text,
        t.bandeira::text,
        t.status::text,
        t.ts_local::text
      FROM tef_transacao t
      JOIN caixa cx ON cx.grid = t.caixa
      WHERE cx.empresa = ANY($1::bigint[])
        AND cx.data >= $2::date
        AND cx.data <= $3::date
      ORDER BY t.ts_local, t.grid
    `, [empresas, dataIni, dataFim])

    const rows = r.rows.map(row => ({
      grid:          Number(row.grid),
      caixa:         row.caixa ? Number(row.caixa) : null,
      valor:         row.valor         ?? null,
      nsu:           row.nsu           ?? null,
      autorizacao:   row.autorizacao   ?? null,
      operadora:     row.operadora     ?? null,
      operadora_nome: row.operadora_nome ?? null,
      bandeira:      row.bandeira      ?? null,
      status:        row.status        ?? null,
      ts_local:      row.ts_local      ?? null,
    }))

    return upsertLotes('as_tef_transacao', rows, 'grid')
  })
}

export async function syncTefHoje(empresas: number[]) {
  const tabela = 'as_tef_transacao'
  await marcarInicio(tabela)
  try {
    const data = hoje()
    const n = await syncTefPorData(empresas, data, data)
    await marcarOk(tabela, n)
    if (n > 0) logger.ok(`${tabela} (hoje ${data}): ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

export async function syncTefOntem(empresas: number[]) {
  try {
    const data = ontem()
    const n = await syncTefPorData(empresas, data, data)
    if (n > 0) logger.ok(`as_tef_transacao (ontem ${data}): ${n} registros`)
  } catch (e: any) {
    logger.error(`as_tef_transacao ontem: ${e.message}`)
  }
}

export async function syncTefHistorico(empresas: number[], dataInicio: string) {
  const tabela = 'as_tef_transacao'
  logger.info(`${tabela} histórico: ${dataInicio} → ${ontem()}`)
  await marcarInicio(tabela)

  const inicio = new Date(dataInicio)
  const fim    = new Date(ontem())
  let total    = 0

  const cur = new Date(inicio)
  while (cur <= fim) {
    const anoMes = cur.toISOString().slice(0, 7)
    const dIni   = cur.toISOString().slice(0, 10)
    const ultimo = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const dFim   = (ultimo > fim ? fim : ultimo).toISOString().slice(0, 10)

    try {
      const n = await syncTefPorData(empresas, dIni, dFim)
      total += n
      logger.info(`  ${tabela} ${anoMes}: ${n} registros`)
    } catch (e: any) {
      logger.error(`  ${tabela} ${anoMes}: ${e.message}`)
    }

    cur.setFullYear(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  await marcarOk(tabela, total)
  logger.ok(`${tabela} histórico completo: ${total} registros`)
}
