import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Busca role e posto do usuário logado no servidor
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role, posto_fechamento_id')
      .eq('id', user.id)
      .single()

    // Se não conseguiu determinar o papel do usuário, bloqueia acesso
    if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('fiscal_tarefas')
      .select('*, postos(nome)')
      .order('criada_em', { ascending: false })

    if (status === 'abertas') {
      query = query.not('status', 'in', '(concluida,desconhecida)')
    } else if (status === 'nf_anexada') {
      // NFs já enviadas pelo gerente mas ainda não concluídas do lado fiscal
      query = query.in('status', ['aguardando_fiscal', 'boleto_pendente']).not('nf_url', 'is', null)
    } else if (status === 'concluidas_com_nf') {
      // Tarefas concluídas que possuem NF anexada pelo gerente
      query = query.eq('status', 'concluida').not('nf_url', 'is', null)
    } else if (status) {
      query = query.eq('status', status)
    } else {
      query = query.not('status', 'in', '(concluida,desconhecida)')
    }

    // Gerente vê apenas tarefas do próprio posto — filtro obrigatório no servidor
    if (usuario.role === 'gerente') {
      if (!usuario.posto_fechamento_id) return NextResponse.json([])
      query = query.eq('posto_id', usuario.posto_fechamento_id)
    } else {
      // Outros roles podem filtrar por posto opcional
      const posto_id = searchParams.get('posto_id')
      if (posto_id) query = query.eq('posto_id', posto_id)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { manifestos } = body as { manifestos: any[] }

    if (!manifestos?.length) return NextResponse.json({ criadas: 0 })

    const registros = manifestos.map((m: any) => ({
      nfe_resumo_grid:  m.grid,
      empresa_grid:     m.empresa,
      fornecedor_nome:  m.emitente_nome,
      fornecedor_cpf:   m.emitente_cpf,
      valor_as:         m.valor,
      data_emissao:     m.data_emissao,
      posto_id:         m.posto?.id ?? null,
      status:           'pendente_gerente',
    }))

    // Filtra grids já existentes para evitar duplicatas
    const grids = registros.map(r => r.nfe_resumo_grid).filter(Boolean)
    let gridsExistentes = new Set<string>()
    if (grids.length) {
      const { data: existentes } = await supabase
        .from('fiscal_tarefas')
        .select('nfe_resumo_grid')
        .in('nfe_resumo_grid', grids)
      gridsExistentes = new Set((existentes ?? []).map((t: any) => String(t.nfe_resumo_grid)))
    }
    const novos = registros.filter(r => !r.nfe_resumo_grid || !gridsExistentes.has(String(r.nfe_resumo_grid)))

    if (!novos.length) return NextResponse.json({ criadas: 0, ignoradas: registros.length })

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .insert(novos)
      .select()

    if (error) throw error
    return NextResponse.json({ criadas: data?.length ?? 0, ignoradas: registros.length - (data?.length ?? 0) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
