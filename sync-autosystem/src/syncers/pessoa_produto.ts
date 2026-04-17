/**
 * Tabelas semi-estáticas — sync a cada 1h
 * pessoa e produto mudam, mas não com frequência
 */
import { withClient } from '../autosystem'
import { upsertLotes } from '../supabase'
import { marcarInicio, marcarOk, marcarErro } from '../controle'
import { logger } from '../logger'

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v).trim() || null
}

// ── pessoa ────────────────────────────────────────────────────────────────────
// Sincroniza apenas pessoas que aparecem em movto desde 2026-01-01
// (evita trazer todo o cadastro histórico)
export async function syncPessoa(empresas: number[]) {
  const tabela = 'as_pessoa'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT DISTINCT
          p.grid::bigint,
          convert(replace(p.nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM pessoa p
        WHERE p.grid IN (
          SELECT DISTINCT pessoa FROM movto
          WHERE empresa = ANY($1::bigint[])
            AND data >= '2026-01-01'
            AND pessoa IS NOT NULL
        )
        ORDER BY p.grid
      `, [empresas])
      return r.rows.map(row => ({
        grid: Number(row.grid),
        nome: txt(row.nome),
      }))
    })
    const n = await upsertLotes(tabela, rows, 'grid')
    await marcarOk(tabela, n)
    logger.ok(`${tabela}: ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

// ── produto ───────────────────────────────────────────────────────────────────
// Sincroniza apenas produtos que têm estoque nas empresas ativas
export async function syncProduto(empresas: number[]) {
  const tabela = 'as_produto'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT DISTINCT
          p.grid::bigint,
          p.codigo::text,
          convert(replace(p.nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome,
          p.grupo::bigint,
          p.subgrupo::bigint,
          p.unid_med::text,
          p.tipo_combustivel::int,
          p.flag::text
        FROM produto p
        WHERE p.grid IN (
          SELECT DISTINCT produto FROM estoque_produto
          WHERE empresa = ANY($1::bigint[])
        )
        ORDER BY p.grid
      `, [empresas])
      return r.rows.map(row => ({
        grid:             Number(row.grid),
        codigo:           txt(row.codigo),
        nome:             txt(row.nome),
        grupo:            row.grupo   ? Number(row.grupo)   : null,
        subgrupo:         row.subgrupo ? Number(row.subgrupo) : null,
        unid_med:         txt(row.unid_med),
        tipo_combustivel: row.tipo_combustivel ?? null,
        flag:             txt(row.flag),
      }))
    })
    const n = await upsertLotes(tabela, rows, 'grid')
    await marcarOk(tabela, n)
    logger.ok(`${tabela}: ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}
