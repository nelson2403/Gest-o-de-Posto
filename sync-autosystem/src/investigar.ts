/**
 * Script de investigação — mostra colunas reais das tabelas no AUTOSYSTEM
 * Execute com: npx ts-node src/investigar.ts
 */
import 'dotenv/config'
import { withClient } from './autosystem'

const TABELAS = [
  'motivo_movto',
  'empresa_tef',
  'produto',
  'caixa',
  'cartao_concilia_extrato',
  'tef_transacao',
  'movto',
]

async function main() {
  for (const tabela of TABELAS) {
    await withClient(async c => {
      const r = await c.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tabela])

      console.log(`\n═══ ${tabela} (${r.rows.length} colunas) ═══`)
      for (const row of r.rows) {
        const extra = row.character_maximum_length ? `(${row.character_maximum_length})` : ''
        console.log(`  ${row.column_name.padEnd(30)} ${row.data_type}${extra}`)
      }
    })
  }
  process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
