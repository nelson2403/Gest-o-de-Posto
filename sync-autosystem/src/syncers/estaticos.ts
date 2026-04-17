/**
 * Tabelas estáticas — sync 1x por dia às 03:00
 * Pequenas e raramente mudam: empresa, conta, motivo_movto,
 * grupo_produto, subgrupo_produto, cartao_concilia_produto, empresa_tef
 */
import { withClient } from '../autosystem'
import { upsertLotes } from '../supabase'
import { marcarInicio, marcarOk, marcarErro } from '../controle'
import { logger } from '../logger'

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v).trim() || null
}

// ── empresa ───────────────────────────────────────────────────────────────────
export async function syncEmpresa() {
  const tabela = 'as_empresa'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT
          grid::bigint,
          codigo::text,
          convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM empresa
        ORDER BY grid
      `)
      return r.rows.map(row => ({
        grid:   Number(row.grid),
        codigo: txt(row.codigo),
        nome:   txt(row.nome),
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

// ── conta ─────────────────────────────────────────────────────────────────────
export async function syncConta() {
  const tabela = 'as_conta'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT codigo::text, convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM conta ORDER BY codigo
      `)
      return r.rows.map(row => ({ codigo: txt(row.codigo), nome: txt(row.nome) }))
    })
    const n = await upsertLotes(tabela, rows, 'codigo')
    await marcarOk(tabela, n)
    logger.ok(`${tabela}: ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

// ── motivo_movto ──────────────────────────────────────────────────────────────
export async function syncMotivoMovto() {
  const tabela = 'as_motivo_movto'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT grid::bigint, convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM motivo_movto ORDER BY grid
      `)
      return r.rows.map(row => ({ grid: Number(row.grid), nome: txt(row.nome) }))
    })
    const n = await upsertLotes(tabela, rows, 'grid')
    await marcarOk(tabela, n)
    logger.ok(`${tabela}: ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

// ── grupo_produto ─────────────────────────────────────────────────────────────
export async function syncGrupoProduto() {
  const tabela = 'as_grupo_produto'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT grid::bigint, codigo::int, convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM grupo_produto ORDER BY grid
      `)
      return r.rows.map(row => ({
        grid:   Number(row.grid),
        codigo: row.codigo,
        nome:   txt(row.nome),
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

// ── subgrupo_produto ──────────────────────────────────────────────────────────
export async function syncSubgrupoProduto() {
  const tabela = 'as_subgrupo_produto'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT grid::bigint, codigo::int, convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome,
               grupo::bigint
        FROM subgrupo_produto ORDER BY grid
      `)
      return r.rows.map(row => ({
        grid:   Number(row.grid),
        codigo: row.codigo,
        nome:   txt(row.nome),
        grupo:  row.grupo ? Number(row.grupo) : null,
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

// ── cartao_concilia_produto ───────────────────────────────────────────────────
export async function syncCartaoConciliaProduto() {
  const tabela = 'as_cartao_concilia_produto'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT grid::bigint,
               convert(replace(descricao, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS descricao,
               taxa_perc::float
        FROM cartao_concilia_produto ORDER BY grid
      `)
      return r.rows.map(row => ({
        grid:      Number(row.grid),
        descricao: txt(row.descricao),
        taxa_perc: row.taxa_perc,
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

// ── empresa_tef ───────────────────────────────────────────────────────────────
// Tabela sem grid — PK composta (empresa, codigo)
export async function syncEmpresaTef() {
  const tabela = 'as_empresa_tef'
  await marcarInicio(tabela)
  try {
    const rows = await withClient(async c => {
      const r = await c.query(`
        SELECT empresa::bigint,
               codigo::text,
               convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome,
               hospedado::boolean
        FROM empresa_tef ORDER BY empresa, codigo
      `)
      return r.rows.map(row => ({
        empresa:   Number(row.empresa),
        codigo:    txt(row.codigo),
        nome:      txt(row.nome),
        hospedado: row.hospedado,
      }))
    })
    const n = await upsertLotes(tabela, rows, 'empresa,codigo')
    await marcarOk(tabela, n)
    logger.ok(`${tabela}: ${n} registros`)
  } catch (e: any) {
    await marcarErro(tabela, e.message)
    logger.error(`${tabela}: ${e.message}`)
  }
}

export async function syncTodosEstaticos() {
  logger.info('── Sync estáticos iniciado ──')
  await syncEmpresa()
  await syncConta()
  await syncMotivoMovto()
  await syncGrupoProduto()
  await syncSubgrupoProduto()
  await syncCartaoConciliaProduto()
  await syncEmpresaTef()
  logger.info('── Sync estáticos concluído ──')
}
