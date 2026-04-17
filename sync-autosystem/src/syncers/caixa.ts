/**
 * caixa — sync a cada 3 minutos (hoje) + noturno (ontem)
 *
 * PK: grid
 * Colunas: grid, empresa, data, turno, codigo, abertura, fechamento, conferencia, pessoa_confere
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

async function syncCaixaPorData(empresas: number[], dataIni: string, dataFim: string): Promise<number> {
  return withClient(async c => {
    const r = await c.query(`
      SELECT
        cx.grid::bigint,
        cx.empresa::bigint,
        cx.data::text,
        cx.turno::int,
        cx.codigo::int,
        cx.abertura::text,
        cx.fechamento::text,
        cx.conferencia::text,
        cx.pessoa_confere::bigint
      FROM caixa cx
      WHERE cx.empresa = ANY($1::bigint[])
        AND cx.data >= $2::date
        AND cx.data <= $3::date
      ORDER BY cx.data, cx.empresa, cx.grid
    `, [empresas, dataIni, dataFim])

    const rows = r.rows.map(row => ({
      grid:          Number(row.grid),
      empresa:       Number(row.empresa),
      data:          row.data,
      turno:         row.turno        ?? null,
      codigo:        row.codigo       ?? null,
      abertura:      row.abertura     ?? null,
      fechamento:    row.fechamento   ?? null,
      conferencia:   row.conferencia  ?? null,
      pessoa_confere: row.pessoa_confere ? Number(row.pessoa_confere) : null,
    }))

    return upsertLotes('as_caixa', rows, 'grid')
  })
}

export async function syncCaixaHoje(empresas: number[]) {
  const tabela = 'as_caixa'
  await marcarInicio(tabela)
  try {
    const data = hoje()
    const n = await syncCaixaPorData(empresas, data, data)
    await marcarOk(tabela, n)
    if (n > 0) logger.ok(`${tabela} (hoje ${data}): ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

export async function syncCaixaOntem(empresas: number[]) {
  try {
    const data = ontem()
    const n = await syncCaixaPorData(empresas, data, data)
    if (n > 0) logger.ok(`as_caixa (ontem ${data}): ${n} registros`)
  } catch (e: any) {
    logger.error(`as_caixa ontem: ${e.message}`)
  }
}

export async function syncCaixaHistorico(empresas: number[], dataInicio: string) {
  const tabela = 'as_caixa'
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
      const n = await syncCaixaPorData(empresas, dIni, dFim)
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
