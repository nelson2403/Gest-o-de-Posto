/**
 * investigar-grids — cruza os grids do AUTOSYSTEM vs Supabase mirror
 * para achar por que 13 registros de saída (conta_creditar=1.2.133) estão faltando.
 *
 * Rode com: npx ts-node src/investigar-grids.ts
 */
import 'dotenv/config'
import { withClient } from './autosystem'
import { getSupabase } from './supabase'

const EMPRESA = 15613912
const CONTA   = '1.2.133'
const DATA    = '2026-04-06'

async function main() {
  // 1. Busca os 15 grids com conta_creditar = '1.2.133' no AUTOSYSTEM
  const gridsAS = await withClient(async c => {
    const r = await c.query(`
      SELECT grid, data::text AS data, conta_debitar, conta_creditar, valor
      FROM movto
      WHERE empresa = $1 AND data = $2 AND conta_creditar = $3
      ORDER BY grid
    `, [EMPRESA, DATA, CONTA])
    return r.rows
  })

  console.log(`\n[AUTOSYSTEM] ${gridsAS.length} registros com conta_creditar='${CONTA}' em ${DATA}:`)
  for (const r of gridsAS) {
    console.log(`  grid=${r.grid}  data=${r.data}  debitar=${r.conta_debitar}  creditar=${r.conta_creditar}  valor=${r.valor}`)
  }

  const ids = gridsAS.map((r: any) => Number(r.grid))

  // 2. Busca esses mesmos grids no Supabase (independente de data)
  const sb = getSupabase()
  const { data: sbRows, error } = await sb
    .from('as_movto')
    .select('grid, data, conta_debitar, conta_creditar, valor, empresa')
    .in('grid', ids)

  if (error) {
    console.error('\n[SUPABASE] Erro:', error.message)
    process.exit(1)
  }

  const sbMap = new Map((sbRows ?? []).map((r: any) => [r.grid, r]))

  console.log(`\n[SUPABASE] Encontrados ${sbRows?.length ?? 0} de ${ids.length} grids no mirror:`)
  for (const as of gridsAS) {
    const sb = sbMap.get(Number(as.grid))
    if (!sb) {
      console.log(`  ⚠️  grid=${as.grid} — NÃO EXISTE no mirror`)
    } else {
      const dataOk    = sb.data === as.data ? '✅' : `❌ data=${sb.data} (AS tem ${as.data})`
      const credOk    = sb.conta_creditar === as.conta_creditar ? '✅' : `❌ creditar=${sb.conta_creditar} (AS tem ${as.conta_creditar})`
      const empresaOk = sb.empresa === EMPRESA ? '✅' : `❌ empresa=${sb.empresa}`
      console.log(`  grid=${as.grid}  data:${dataOk}  creditar:${credOk}  empresa:${empresaOk}`)
    }
  }

  // 3. Também verifica os 2 grids que o mirror JÁ tem corretos
  const { data: mirror2 } = await sb
    .from('as_movto')
    .select('grid, data, conta_creditar, valor')
    .eq('empresa', EMPRESA)
    .eq('data', DATA)
    .eq('conta_creditar', CONTA)

  console.log(`\n[SUPABASE] Registros que JÁ estão corretos no mirror (conta_creditar='${CONTA}', data='${DATA}'):`)
  for (const r of mirror2 ?? []) {
    console.log(`  grid=${r.grid}  valor=${r.valor}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
