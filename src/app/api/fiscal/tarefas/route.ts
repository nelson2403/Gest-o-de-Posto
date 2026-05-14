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

    const { data, error } = await supabase
      .from('fiscal_tarefas')
      .insert(registros)
      .select()

    if (error) throw error
    return NextResponse.json({ criadas: data?.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
