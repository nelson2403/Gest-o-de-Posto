import 'dotenv/config'
import { withClient } from './autosystem'

async function main() {
  await withClient(async c => {
    // Encoding do servidor
    const enc = await c.query('SHOW server_encoding')
    const cli = await c.query('SHOW client_encoding')
    console.log('server_encoding:', enc.rows[0].server_encoding)
    console.log('client_encoding:', cli.rows[0].client_encoding)

    // Testar padrões de conversão em motivo_movto
    console.log('\n--- motivo_movto ---')
    try {
      const r = await c.query("SELECT grid, nome FROM motivo_movto LIMIT 5")
      console.log('nome direto OK:', JSON.stringify(r.rows))
    } catch(e: any) { console.log('nome direto FAIL:', e.message) }

    try {
      const r = await c.query("SELECT grid, convert(nome::bytea, 'WIN1252', 'UTF8')::text AS nome FROM motivo_movto LIMIT 5")
      console.log('convert WIN1252 OK:', JSON.stringify(r.rows))
    } catch(e: any) { console.log('convert WIN1252 FAIL:', e.message) }

    // Movto: verificar se mlid é realmente unique
    console.log('\n--- movto: duplicates ---')
    const dup = await c.query(`
      SELECT mlid, COUNT(*) as cnt FROM movto
      WHERE empresa = ANY(ARRAY[1,9868868]::bigint[])
        AND data >= '2026-03-01' AND data <= '2026-03-31'
      GROUP BY mlid HAVING COUNT(*) > 1
      LIMIT 5
    `)
    console.log('mlid duplicados:', dup.rowCount, 'encontrados', JSON.stringify(dup.rows.slice(0,3)))

    // Teste com grid em vez de mlid
    const grid_test = await c.query(`
      SELECT grid, mlid, empresa, data FROM movto
      WHERE empresa = ANY(ARRAY[1,9868868]::bigint[])
        AND data >= '2026-03-01' AND data <= '2026-03-05'
      LIMIT 5
    `)
    console.log('grid vs mlid sample:', JSON.stringify(grid_test.rows))

    // caixa: verificar estrutura real
    console.log('\n--- caixa sample ---')
    const cx = await c.query(`SELECT * FROM caixa WHERE empresa = 1 LIMIT 3`)
    console.log('caixa rows:', JSON.stringify(cx.rows))

    // cartao_concilia_extrato estrutura
    console.log('\n--- cartao_concilia_extrato sample ---')
    const cce = await c.query(`SELECT * FROM cartao_concilia_extrato WHERE empresa = 1 LIMIT 3`)
    console.log('cce rows:', JSON.stringify(cce.rows))

    // tef_transacao: como filtrar por empresa?
    console.log('\n--- tef_transacao sample ---')
    const tef = await c.query(`SELECT grid, modulo, caixa, valor, ts_local FROM tef_transacao LIMIT 3`)
    console.log('tef rows:', JSON.stringify(tef.rows))
  })
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
