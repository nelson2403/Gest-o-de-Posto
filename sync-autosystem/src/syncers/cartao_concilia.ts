/**
 * cartao_concilia_extrato — sync diário (snapshot por data)
 *
 * Tabela sem PK integer — PK composta: (empresa, data, produto)
 * O campo extrato é um blob de texto com o resumo da conciliação.
 * Como não há campo de data de modificação confiável, fazemos sync
 * dos últimos 7 dias no incremental (para pegar atualizações de
 * conciliação retroativas) e histórico mês a mês na carga inicial.
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
function diasAtras(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

async function syncCartaoPorData(empresas: number[], dataIni: string, dataFim: string): Promise<number> {
  return withClient(async c => {
    const r = await c.query(`
      SELECT
        ce.empresa::bigint,
        ce.data::text,
        ce.produto::bigint,
        ce.extrato::text,
        ce.autorizadora::int
      FROM cartao_concilia_extrato ce
      WHERE ce.empresa = ANY($1::bigint[])
        AND ce.data >= $2::date
        AND ce.data <= $3::date
      ORDER BY ce.data, ce.empresa, ce.produto
    `, [empresas, dataIni, dataFim])

    const rows = r.rows.map(row => ({
      empresa:      Number(row.empresa),
      data:         row.data,
      produto:      row.produto ? Number(row.produto) : null,
      extrato:      row.extrato      ?? null,
      autorizadora: row.autorizadora ?? null,
    }))

    return upsertLotes('as_cartao_concilia_extrato', rows, 'empresa,data,produto')
  })
}

// Sync incremental: últimos 7 dias (conciliações podem ser retroativas)
export async function syncCartaoRecente(empresas: number[]) {
  const tabela = 'as_cartao_concilia_extrato'
  await marcarInicio(tabela)
  try {
    const n = await syncCartaoPorData(empresas, diasAtras(7), hoje())
    await marcarOk(tabela, n)
    if (n > 0) logger.ok(`${tabela} (últimos 7d): ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

// Alias para compatibilidade com index.ts
export const syncCartaoHoje   = syncCartaoRecente
export const syncCartaoOntem  = async (_empresas: number[]) => { /* coberto pelo syncCartaoRecente */ }

export async function syncCartaoHistorico(empresas: number[], dataInicio: string) {
  const tabela = 'as_cartao_concilia_extrato'
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
      const n = await syncCartaoPorData(empresas, dIni, dFim)
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
