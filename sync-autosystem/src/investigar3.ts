import 'dotenv/config'
import { withClient } from './autosystem'

async function main() {
  await withClient(async c => {
    // caixa sample
    const cx = await c.query(`SELECT * FROM caixa WHERE empresa = 1 LIMIT 2`)
    console.log('caixa rows:', JSON.stringify(cx.rows))

    // cartao_concilia_extrato
    const cce = await c.query(`SELECT * FROM cartao_concilia_extrato WHERE empresa = 1 LIMIT 2`)
    console.log('cce rows:', JSON.stringify(cce.rows))

    // tef_transacao sample
    const tef = await c.query(`SELECT grid, modulo, caixa, valor, ts_local FROM tef_transacao LIMIT 2`)
    console.log('tef rows:', JSON.stringify(tef.rows))

    // Does tef join with caixa to get empresa?
    const tef2 = await c.query(`
      SELECT t.grid, cx.empresa, t.valor, t.ts_local
      FROM tef_transacao t
      JOIN caixa cx ON cx.grid = t.caixa
      LIMIT 2
    `)
    console.log('tef with empresa:', JSON.stringify(tef2.rows))

    // empresa_tef PK?
    const et = await c.query(`SELECT * FROM empresa_tef LIMIT 3`)
    console.log('empresa_tef rows:', JSON.stringify(et.rows))

    // produto error: what nome value causes the convert to fail?
    try {
      const p = await c.query(`SELECT grid, convert(nome::bytea, 'WIN1252', 'UTF8')::text AS nome FROM produto LIMIT 5`)
      console.log('produto convert OK:', JSON.stringify(p.rows))
    } catch(e: any) {
      console.log('produto convert FAIL:', e.message)
      // try without convert
      const p2 = await c.query(`SELECT grid, nome FROM produto LIMIT 5`)
      console.log('produto direct:', JSON.stringify(p2.rows))
    }
  })
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
