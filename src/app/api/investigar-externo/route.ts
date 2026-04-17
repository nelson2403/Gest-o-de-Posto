import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db-externo'

export async function GET() {
  let client
  try {
    client = await getPool().connect()

    // 1. Colunas da tabela equipamento
    const colsEquip = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'equipamento'
      ORDER BY ordinal_position
    `)

    // 2. Amostra de equipamento (10 linhas)
    const amostraEquip = await client.query(`SELECT * FROM equipamento LIMIT 10`)

    // 3. Colunas com "aluguel" em qualquer tabela
    const colsAluguel = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name ILIKE '%aluguel%'
      ORDER BY table_name
    `)

    // 4. Tabelas com "aluguel" no nome
    const tabelasAluguel = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name ILIKE '%aluguel%'
    `)

    // 5. empresa_tef — colunas completas
    const colsEmpTef = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'empresa_tef'
      ORDER BY ordinal_position
    `)

    // 6. contagem de equipamento por empresa (para ver se vincula a empresas que conhecemos)
    let contagem = null
    try {
      contagem = await client.query(`SELECT empresa::text, COUNT(*)::int FROM equipamento GROUP BY empresa ORDER BY empresa LIMIT 30`)
    } catch { /* ignora */ }

    return NextResponse.json({
      equipamento_colunas: colsEquip.rows,
      equipamento_amostra: amostraEquip.rows,
      colunas_com_aluguel_em_qualquer_tabela: colsAluguel.rows,
      tabelas_com_aluguel_no_nome: tabelasAluguel.rows,
      empresa_tef_colunas: colsEmpTef.rows,
      equipamento_por_empresa: contagem?.rows ?? [],
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  } finally {
    client?.release()
  }
}
