/**
 * investigar-extrato — compara movto do AUTOSYSTEM vs mirror Supabase
 * para uma empresa/data específica.
 *
 * Rode com: npx ts-node src/investigar-extrato.ts
 */
import 'dotenv/config'
import { withClient } from './autosystem'

const EMPRESA = 15613912     // AUTO POSTO REAL SUL LTDA
const CONTA   = '1.2.133'   // SICOOB 132.291-5
const DATA    = '2026-04-06'

async function main() {
  await withClient(async c => {
    // 1. Total de registros no AUTOSYSTEM para essa empresa/data
    const total = await c.query(`
      SELECT COUNT(*) AS total FROM movto
      WHERE empresa = $1 AND data = $2
    `, [EMPRESA, DATA])
    console.log(`\n[1] Total registros movto (empresa=${EMPRESA}, data=${DATA}): ${total.rows[0].total}`)

    // 2. Entradas e saídas pela conta específica
    const calc = await c.query(`
      SELECT
        SUM(CASE WHEN conta_debitar  = $3 THEN valor ELSE 0 END) AS entradas_debito,
        SUM(CASE WHEN conta_creditar = $3 THEN valor ELSE 0 END) AS saidas_credito,
        COUNT(CASE WHEN conta_debitar  = $3 THEN 1 END)          AS qtd_debito,
        COUNT(CASE WHEN conta_creditar = $3 THEN 1 END)          AS qtd_credito
      FROM movto
      WHERE empresa = $1 AND data = $2
    `, [EMPRESA, DATA, CONTA])
    const r = calc.rows[0]
    console.log(`\n[2] Conta ${CONTA}:`)
    console.log(`    Entradas (conta_debitar ): ${r.entradas_debito} (${r.qtd_debito} registros)`)
    console.log(`    Saídas   (conta_creditar): ${r.saidas_credito} (${r.qtd_credito} registros)`)
    console.log(`    Movimento: ${(parseFloat(r.entradas_debito) - parseFloat(r.saidas_credito)).toFixed(2)}`)

    // 3. Detalhe dos registros onde conta_creditar = CONTA
    const creditos = await c.query(`
      SELECT grid, mlid, valor, conta_debitar, conta_creditar, motivo, obs
      FROM movto
      WHERE empresa = $1 AND data = $2 AND conta_creditar = $3
      ORDER BY valor DESC
    `, [EMPRESA, DATA, CONTA])
    console.log(`\n[3] Registros com conta_creditar = '${CONTA}' (${creditos.rowCount}):`)
    for (const row of creditos.rows) {
      console.log(`    grid=${row.grid} valor=${row.valor} debitar=${row.conta_debitar} motivo=${row.motivo} obs=${row.obs}`)
    }

    // 4. Lista todas as tabelas disponíveis (para ver se há tabela alternativa de extrato)
    const tabelas = await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    console.log(`\n[4] Todas as tabelas no AUTOSYSTEM (${tabelas.rowCount}):`)
    for (const t of tabelas.rows) console.log(`    ${t.table_name}`)

    // 5. Verifica se existe tabela de extrato bancário
    for (const nome of ['extrato', 'extrato_bancario', 'lanc_bancario', 'movto_bancario', 'banco_extrato', 'movto_banco']) {
      try {
        const ex = await c.query(`SELECT COUNT(*) FROM ${nome} WHERE empresa = $1 AND data::date = $2::date LIMIT 1`, [EMPRESA, DATA])
        console.log(`\n[5] Tabela '${nome}' EXISTE — ${ex.rows[0].count} registros para esse empresa/data`)
      } catch {
        // tabela não existe, silêncio
      }
    }
  })
  process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
