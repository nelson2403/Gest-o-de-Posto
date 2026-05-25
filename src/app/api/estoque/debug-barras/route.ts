import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/estoque/debug-barras?codigo=7897394001272&empresaId=1
// Diagnóstico completo de código de barras no AUTOSYSTEM
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const codigo    = searchParams.get('codigo') ?? ''
  const empresaId = Number(searchParams.get('empresaId') ?? '0')

  // 1. Todas as colunas da tabela produto
  const colunasProduto = await queryAS(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'produto'
     ORDER BY ordinal_position`,
    [],
  )

  // 2. Qualquer coluna em qualquer tabela com padrão barras/ean/gtin
  const colunasBarrasTodas = await queryAS(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (column_name ILIKE '%barr%'
         OR column_name ILIKE '%ean%'
         OR column_name ILIKE '%gtin%'
         OR column_name ILIKE '%cod_bar%'
         OR column_name ILIKE '%barcode%')
     ORDER BY table_name, column_name`,
    [],
  )

  // 3. Tabelas com "barras" ou "ean" no nome
  const tabelasBarras = await queryAS(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND (table_name ILIKE '%barr%'
         OR table_name ILIKE '%ean%'
         OR table_name ILIKE '%gtin%')
     ORDER BY table_name`,
    [],
  )

  // 4. Amostra da tabela produto (primeiros 2 registros) com todos os campos
  const amostraProduto = await queryAS(
    `SELECT * FROM produto LIMIT 2`,
    [],
  ).catch(() => [])

  // 5. Se informou código, tenta buscar em todos os lugares encontrados
  const resultadosBusca: any[] = []
  if (codigo) {
    // Busca nas colunas encontradas da tabela produto
    for (const c of colunasProduto) {
      const col = (c as any).column_name as string
      try {
        const rows = await queryAS(
          `SELECT grid::bigint AS produto_id, nome::bytea AS nome_b
           FROM produto WHERE ${col}::text = $1 LIMIT 1`,
          [codigo],
        )
        if (rows.length) {
          resultadosBusca.push({ local: `produto.${col}`, produto_id: (rows[0] as any).produto_id })
        }
      } catch {}
    }

    // Busca nas colunas barras de outras tabelas
    for (const c of colunasBarrasTodas) {
      const tabela = (c as any).table_name as string
      const col    = (c as any).column_name as string
      if (tabela === 'produto') continue
      try {
        const rows = await queryAS(
          `SELECT * FROM ${tabela} WHERE ${col}::text = $1 LIMIT 1`,
          [codigo],
        )
        if (rows.length) {
          resultadosBusca.push({ local: `${tabela}.${col}`, dados: rows[0] })
        }
      } catch {}
    }
  }

  // 6. Amostras das tabelas de barras encontradas
  const amostrasBarras: any = {}
  for (const t of tabelasBarras.slice(0, 3)) {
    const tabela = (t as any).table_name
    try {
      const rows = await queryAS(`SELECT * FROM ${tabela} LIMIT 3`, [])
      amostrasBarras[tabela] = rows
    } catch {}
  }

  // 7. Se empresaId informado, testa o endpoint de busca completo
  let testeEndpoint: any = null
  if (codigo && empresaId) {
    const res = await fetch(
      `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/estoque/produto-por-barras?codigo=${encodeURIComponent(codigo)}&empresaId=${empresaId}`,
    ).catch(() => null)
    if (res) testeEndpoint = await res.json().catch(() => null)
  }

  return NextResponse.json({
    resumo: {
      colunas_produto_total: colunasProduto.length,
      colunas_com_barras_encontradas: colunasBarrasTodas.length,
      tabelas_barras_encontradas: tabelasBarras.length,
      resultados_busca_codigo: resultadosBusca.length,
    },
    colunas_produto: colunasProduto,
    colunas_barras_encontradas: colunasBarrasTodas,
    tabelas_barras: tabelasBarras,
    amostras_tabelas_barras: amostrasBarras,
    amostra_produto: amostraProduto,
    resultados_busca: resultadosBusca,
    teste_endpoint_completo: testeEndpoint,
  })
}
