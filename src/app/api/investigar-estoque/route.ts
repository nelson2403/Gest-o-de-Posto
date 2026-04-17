import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db-externo'

// GET /api/investigar-estoque
// Diagnóstico focado nas tabelas de estoque reais do AUTOSYSTEM
export async function GET() {
  let client
  try {
    client = await getPool().connect()

    const query = async (sql: string, params: any[] = []) => {
      try { return (await client.query(sql, params)).rows } catch (e: any) { return { error: e.message } }
    }

    // ── estoque ──────────────────────────────────────────────────────────────
    const estoque_cols    = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque' ORDER BY ordinal_position`)
    const estoque_sample  = await query(`SELECT * FROM estoque LIMIT 5`)
    const estoque_count   = await query(`SELECT COUNT(*)::int AS total FROM estoque`)

    // ── estoque_produto ───────────────────────────────────────────────────────
    const ep_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque_produto' ORDER BY ordinal_position`)
    const ep_sample = await query(`SELECT * FROM estoque_produto LIMIT 5`)

    // ── estoque_deposito ──────────────────────────────────────────────────────
    const ed_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque_deposito' ORDER BY ordinal_position`)
    const ed_sample = await query(`SELECT * FROM estoque_deposito LIMIT 5`)

    // ── lmc_estoque ───────────────────────────────────────────────────────────
    const lmc_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='lmc_estoque' ORDER BY ordinal_position`)
    const lmc_sample = await query(`SELECT * FROM lmc_estoque LIMIT 5`)

    // ── medtanque_ultima_medicao ──────────────────────────────────────────────
    const mtum_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='medtanque_ultima_medicao' ORDER BY ordinal_position`)
    const mtum_sample = await query(`SELECT * FROM medtanque_ultima_medicao LIMIT 10`)

    // ── medtanque_medicao ─────────────────────────────────────────────────────
    const mtm_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='medtanque_medicao' ORDER BY ordinal_position`)
    const mtm_sample = await query(`SELECT * FROM medtanque_medicao ORDER BY grid DESC LIMIT 5`)

    // ── medtanque_pid ─────────────────────────────────────────────────────────
    const pid_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='medtanque_pid' ORDER BY ordinal_position`)
    const pid_sample = await query(`SELECT * FROM medtanque_pid LIMIT 5`)

    // ── medtanque_descarga ────────────────────────────────────────────────────
    const desc_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='medtanque_descarga' ORDER BY ordinal_position`)
    const desc_sample = await query(`SELECT * FROM medtanque_descarga ORDER BY grid DESC LIMIT 5`)

    // ── tipo_combustivel ──────────────────────────────────────────────────────
    const tc_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tipo_combustivel' ORDER BY ordinal_position`)
    const tc_sample = await query(`SELECT * FROM tipo_combustivel LIMIT 20`)

    // ── grupo_produto ─────────────────────────────────────────────────────────
    const gp_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='grupo_produto' ORDER BY ordinal_position`)
    const gp_sample = await query(`SELECT * FROM grupo_produto LIMIT 20`)

    // ── subgrupo_produto ──────────────────────────────────────────────────────
    const sgp_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='subgrupo_produto' ORDER BY ordinal_position`)
    const sgp_sample = await query(`SELECT * FROM subgrupo_produto LIMIT 20`)

    // ── produto (amostra) ─────────────────────────────────────────────────────
    const prod_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='produto' ORDER BY ordinal_position`)
    const prod_sample = await query(`SELECT * FROM produto LIMIT 10`)

    // ── produto_empresa (saldo por empresa) ────────────────────────────────────
    const pe_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='produto_empresa' ORDER BY ordinal_position`)
    const pe_sample = await query(`SELECT * FROM produto_empresa LIMIT 10`)

    // ── estoque_valor ─────────────────────────────────────────────────────────
    const ev_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque_valor' ORDER BY ordinal_position`)
    const ev_sample = await query(`SELECT * FROM estoque_valor LIMIT 10`)

    // ── estoque_lancto ────────────────────────────────────────────────────────
    const el_cols   = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque_lancto' ORDER BY ordinal_position`)
    const el_sample = await query(`SELECT * FROM estoque_lancto ORDER BY grid DESC LIMIT 5`)

    return NextResponse.json({
      estoque:               { colunas: estoque_cols,  amostra: estoque_sample,  total: estoque_count },
      estoque_produto:       { colunas: ep_cols,        amostra: ep_sample },
      estoque_deposito:      { colunas: ed_cols,        amostra: ed_sample },
      lmc_estoque:           { colunas: lmc_cols,       amostra: lmc_sample },
      medtanque_ultima_medicao: { colunas: mtum_cols,   amostra: mtum_sample },
      medtanque_medicao:     { colunas: mtm_cols,       amostra: mtm_sample },
      medtanque_pid:         { colunas: pid_cols,       amostra: pid_sample },
      medtanque_descarga:    { colunas: desc_cols,      amostra: desc_sample },
      tipo_combustivel:      { colunas: tc_cols,        amostra: tc_sample },
      grupo_produto:         { colunas: gp_cols,        amostra: gp_sample },
      subgrupo_produto:      { colunas: sgp_cols,       amostra: sgp_sample },
      produto:               { colunas: prod_cols,      amostra: prod_sample },
      produto_empresa:       { colunas: pe_cols,        amostra: pe_sample },
      estoque_valor:         { colunas: ev_cols,        amostra: ev_sample },
      estoque_lancto:        { colunas: el_cols,        amostra: el_sample },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    client?.release()
  }
}
