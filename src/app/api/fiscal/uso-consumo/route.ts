import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface UsosConsumoItem {
  id:                 string
  titulo:             string
  empresa_nome:       string
  posto_nome:         string
  data_nf:            string
  nf_valor:           number
  manifestacao_as:    number
  diferenca:          number
  fornecedor:         string | null
  gerente_respondeu:  string
  respondida_em:      string
  nf_url:             string | null
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Apenas master e adm_financeiro podem acessar
  const { data: userData } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!userData || !['master', 'adm_financeiro'].includes(userData.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()

    // Busca tarefas fiscais marcadas como uso e consumo
    const { data: tarefas, error } = await admin
      .from('fiscal_tarefas')
      .select(`
        id,
        titulo,
        valor_as,
        nf_valor_informado,
        nf_anexada_em,
        gerente_respondeu_em,
        gerente_respondeu_por,
        nf_url,
        fornecedor,
        post:postos(id, nome, empresa_id),
        empresa:empresas(id, nome)
      `)
      .eq('is_uso_consumo', true)
      .not('nf_valor_informado', 'is', null)
      .order('nf_anexada_em', { ascending: false })

    if (error) throw error

    // Buscar nomes dos gerentes
    const gerenteIds = (tarefas ?? []).map(t => t.gerente_respondeu_por).filter(Boolean)
    let gerentesMap: Record<string, string> = {}
    if (gerenteIds.length > 0) {
      const { data: gerentes } = await admin
        .from('usuarios')
        .select('id, nome')
        .in('id', gerenteIds)
      for (const g of gerentes ?? []) {
        gerentesMap[g.id] = g.nome
      }
    }

    const dados: UsosConsumoItem[] = (tarefas ?? []).map(t => ({
      id: t.id as string,
      titulo: t.titulo as string,
      empresa_nome: (t.empresa as any)?.nome ?? 'Desconhecida',
      posto_nome: (t.post as any)?.nome ?? 'Desconhecido',
      data_nf: t.nf_anexada_em ? new Date(t.nf_anexada_em).toISOString().slice(0, 10) : '',
      nf_valor: Number(t.nf_valor_informado ?? 0),
      manifestacao_as: Number(t.valor_as ?? 0),
      diferenca: Math.abs(Number(t.nf_valor_informado ?? 0) - Number(t.valor_as ?? 0)),
      fornecedor: t.fornecedor ?? null,
      gerente_respondeu: gerentesMap[t.gerente_respondeu_por as string] ?? 'Desconhecido',
      respondida_em: t.gerente_respondeu_em ? new Date(t.gerente_respondeu_em).toISOString().slice(0, 10) : '',
      nf_url: t.nf_url ?? null,
    }))

    const totalGasto = dados.reduce((sum, d) => sum + d.nf_valor, 0)

    return NextResponse.json({
      dados,
      total: dados.length,
      total_gasto: totalGasto,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
