/**
 * movto — sync a cada 3 minutos
 *
 * Estratégia incremental:
 *  - Sync regular: data = CURRENT_DATE (só hoje)
 *  - Sync noturno (03:05): data = CURRENT_DATE - 1 (ontem, para pegar lançamentos tardios)
 *  - Carga inicial: cobre data_inicio até ontem (rodado 1x pelo sync-inicial.ts)
 *
 * PK: grid (mlid não é único — pode ter duplicatas e NULLs)
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

async function syncMovtoPorData(empresas: number[], dataIni: string, dataFim: string): Promise<number> {
  return withClient(async c => {
    const r = await c.query(`
      SELECT
        m.grid::bigint,
        m.mlid::bigint,
        m.empresa::bigint,
        m.data::text,
        m.vencto::text,
        m.documento::text,
        m.tipo_doc::text,
        m.valor::float,
        m.conta_debitar::text,
        m.conta_creditar::text,
        m.child::bigint,
        m.motivo::bigint,
        m.pessoa::bigint,
        m.obs::text
      FROM movto m
      WHERE m.empresa = ANY($1::bigint[])
        AND m.data >= $2::date
        AND m.data <= $3::date
      ORDER BY m.data, m.grid
    `, [empresas, dataIni, dataFim])

    const rows = r.rows.map(row => ({
      grid:          Number(row.grid),
      mlid:          row.mlid !== null ? Number(row.mlid) : null,
      empresa:       Number(row.empresa),
      data:          row.data,
      vencto:        row.vencto,
      documento:     row.documento,
      tipo_doc:      row.tipo_doc,
      valor:         row.valor,
      conta_debitar:  row.conta_debitar,
      conta_creditar: row.conta_creditar,
      child:          row.child !== null ? Number(row.child) : null,
      motivo:        row.motivo !== null ? Number(row.motivo) : null,
      pessoa:        row.pessoa !== null ? Number(row.pessoa) : null,
      obs:           row.obs,
    }))

    return upsertLotes('as_movto', rows, 'grid')
  })
}

// Sync regular: somente hoje
export async function syncMovtoHoje(empresas: number[]) {
  const tabela = 'as_movto'
  await marcarInicio(tabela)
  try {
    const data = hoje()
    const n = await syncMovtoPorData(empresas, data, data)
    await marcarOk(tabela, n)
    if (n > 0) logger.ok(`${tabela} (hoje ${data}): ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

// Sync noturno: últimos 7 dias (para pegar lançamentos retroativos)
export async function syncMovtoOntem(empresas: number[]) {
  try {
    const d = new Date(); d.setDate(d.getDate() - 7)
    const dataIni = d.toISOString().slice(0, 10)
    const dataFim = ontem()
    const n = await syncMovtoPorData(empresas, dataIni, dataFim)
    if (n > 0) logger.ok(`as_movto (últimos 7 dias ${dataIni}→${dataFim}): ${n} registros`)
  } catch (e: any) {
    logger.error(`as_movto últimos 7 dias: ${e.message}`)
  }
}

// Carga histórica: data_inicio até ontem (chamado pelo sync-inicial.ts)
export async function syncMovtoHistorico(empresas: number[], dataInicio: string) {
  const tabela = 'as_movto'
  logger.info(`${tabela} histórico: ${dataInicio} → ${ontem()}`)
  await marcarInicio(tabela)

  // Processa mês a mês para não travar
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
      const n = await syncMovtoPorData(empresas, dIni, dFim)
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
