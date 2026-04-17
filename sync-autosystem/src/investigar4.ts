import 'dotenv/config'
import { withClient } from './autosystem'

async function main() {
  await withClient(async c => {
    // Find rows with backslash in motivo_movto
    const r = await c.query(`SELECT grid, nome FROM motivo_movto WHERE nome LIKE $1 LIMIT 5`, ['%\\%'])
    console.log('motivo backslash rows:', JSON.stringify(r.rows))

    // Test fix: replace \ with \\ before cast
    try {
      const r2 = await c.query(`
        SELECT grid, convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM motivo_movto LIMIT 200
      `)
      console.log('motivo fix OK, total rows:', r2.rowCount)
    } catch(e: any) { console.log('motivo fix FAIL:', e.message) }

    // Same for produto
    try {
      const r3 = await c.query(`
        SELECT grid, convert(replace(nome, $$\\$$, $$\\\\$$)::bytea, 'LATIN1', 'UTF8')::text AS nome
        FROM produto LIMIT 200
      `)
      console.log('produto fix OK, total rows:', r3.rowCount)
    } catch(e: any) { console.log('produto fix FAIL:', e.message) }

    // empresa_tef — how many rows?
    const r4 = await c.query(`SELECT COUNT(*) FROM empresa_tef`)
    console.log('empresa_tef count:', r4.rows[0].count)
    const r5 = await c.query(`SELECT * FROM empresa_tef LIMIT 3`)
    console.log('empresa_tef sample:', JSON.stringify(r5.rows))
  })
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
