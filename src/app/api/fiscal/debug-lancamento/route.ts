import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { queryAS } from '@/lib/autosystem'

// GET /api/fiscal/debug-lancamento
// Diagnostica por que tarefas aguardando_fiscal não estão sendo fechadas.
// Mostra: valores de nfe_resumo_grid nas tarefas, estrutura de lmc_entrada,
// e tenta encontrar a relação correta entre nfe_resumo e lmc_entrada.
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // 1. Tarefas aguardando_fiscal com seus grids
    const { data: tarefas } = await supabase
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, fornecedor_nome, posto_id, criado_em, status')
      .eq('status', 'aguardando_fiscal')
      .limit(10)

    const grids = (tarefas ?? [])
      .map((t: any) => t.nfe_resumo_grid)
      .filter(Boolean) as number[]

    // 2. Busca os registros de nfe_resumo para esses grids (todas as colunas)
    let nfeResumoRows: any[] = []
    let colunasLmcEntrada: any[] = []
    let amostrasLmcEntrada: any[] = []
    let nfeNumeros: any[] = []
    let lmcPorNumero: any[] = []
    let lmcPorChave: any[] = []

    try {
      if (grids.length) {
        nfeResumoRows = await queryAS(
          `SELECT * FROM nfe_resumo WHERE grid = ANY($1::bigint[]) LIMIT 10`,
          [grids],
        )
      }

      // 3. Estrutura de lmc_entrada
      colunasLmcEntrada = await queryAS(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'lmc_entrada'
         ORDER BY ordinal_position`,
        [],
      )

      // 4. Amostra de lmc_entrada (últimos registros)
      amostrasLmcEntrada = await queryAS(
        `SELECT * FROM lmc_entrada ORDER BY lancto DESC LIMIT 5`,
        [],
      )

      // 5. Se nfe_resumo tem uma coluna de número de NF ou chave, tenta cruzar com lmc_entrada
      if (nfeResumoRows.length) {
        // Tenta pegar numero_nf (ou similar) de nfe_resumo para buscar em lmc_entrada
        const primeiraRow = nfeResumoRows[0]
        const chavesDisponiveis = Object.keys(primeiraRow)

        // Busca colunas de lmc_entrada que possam ser o número da nota ou chave
        const colunasDocumento = colunasLmcEntrada
          .filter((c: any) =>
            c.column_name.includes('nf') ||
            c.column_name.includes('nota') ||
            c.column_name.includes('doc') ||
            c.column_name.includes('chav') ||
            c.column_name.includes('nfe') ||
            c.column_name.includes('numero')
          )
          .map((c: any) => c.column_name)

        nfeNumeros = [{ _colunas_nfe_resumo: chavesDisponiveis, _colunas_lmc_entrada_doc: colunasDocumento }]

        // Tenta cruzar por 'numero' (numero da NF)
        try {
          const numeros = nfeResumoRows
            .map((r: any) => r.numero?.toString() || r.numero_nf?.toString())
            .filter(Boolean)

          if (numeros.length) {
            lmcPorNumero = await queryAS(
              `SELECT lancto, documento, data_emissao, fornecedor, empresa
               FROM lmc_entrada
               WHERE documento = ANY($1::text[])
               LIMIT 10`,
              [numeros],
            )
          }
        } catch {}

        // Tenta cruzar por 'chave' (chave de acesso 44 chars)
        try {
          const chaves = nfeResumoRows
            .map((r: any) => r.chave?.toString() || r.chave_acesso?.toString())
            .filter(Boolean)

          if (chaves.length) {
            lmcPorChave = await queryAS(
              `SELECT lancto, documento, data_emissao, fornecedor, empresa
               FROM lmc_entrada
               WHERE documento = ANY($1::text[])
               LIMIT 10`,
              [chaves],
            )
          }
        } catch {}

        // Tenta cruzar pelo grid direto (como string) — o que o código atual faz
        try {
          const gridStrings = grids.map(String)
          const lmcPorGrid = await queryAS(
            `SELECT lancto, documento, data_emissao, fornecedor, empresa
             FROM lmc_entrada
             WHERE documento = ANY($1::text[])
             LIMIT 10`,
            [gridStrings],
          )
          nfeNumeros.push({ _lmc_por_grid_atual: lmcPorGrid, _grids_buscados: gridStrings })
        } catch (e: any) {
          nfeNumeros.push({ _lmc_por_grid_erro: e.message })
        }
      }

      // 6. Tenta JOIN direto nfe_resumo → lmc_entrada por diferentes colunas
      if (grids.length) {
        try {
          const joinTest = await queryAS(
            `SELECT nr.grid::bigint, nr.numero::text AS nfe_numero,
                    le.lancto, le.documento AS lmc_documento
             FROM nfe_resumo nr
             LEFT JOIN lmc_entrada le ON le.documento = nr.numero::text
             WHERE nr.grid = ANY($1::bigint[])
             LIMIT 10`,
            [grids],
          )
          nfeNumeros.push({ _join_por_numero: joinTest })
        } catch (e: any) {
          nfeNumeros.push({ _join_por_numero_erro: e.message })
        }

        // Tenta JOIN via nfe_resumo.nfe → lmc_entrada.nfe (se existir)
        try {
          const joinTestNfe = await queryAS(
            `SELECT nr.grid::bigint, nr.nfe::bigint,
                    le.lancto, le.documento AS lmc_documento
             FROM nfe_resumo nr
             LEFT JOIN lmc_entrada le ON le.nfe = nr.nfe
             WHERE nr.grid = ANY($1::bigint[])
             LIMIT 10`,
            [grids],
          )
          nfeNumeros.push({ _join_por_nfe: joinTestNfe })
        } catch (e: any) {
          nfeNumeros.push({ _join_por_nfe_erro: e.message })
        }
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message, tarefas })
    }

    return NextResponse.json({
      tarefas_aguardando: tarefas ?? [],
      grids_buscados: grids,
      nfe_resumo_rows: nfeResumoRows,
      colunas_lmc_entrada: colunasLmcEntrada,
      amostra_lmc_entrada: amostrasLmcEntrada,
      lmc_por_numero: lmcPorNumero,
      lmc_por_chave: lmcPorChave,
      debug_extra: nfeNumeros,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
