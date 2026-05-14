import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Detecta role no servidor para garantir filtro correto
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role, posto_fechamento_id')
      .eq('id', user.id)
      .single()

    // Gerente: filtro obrigatório pelo próprio posto
    // Outros: filtro opcional via query param
    const { searchParams } = new URL(req.url)
    const posto_id = usuario?.role === 'gerente'
      ? (usuario.posto_fechamento_id ?? null)
      : searchParams.get('posto_id')

    const hoje = new Date().toISOString().slice(0, 10)
    const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    function applyPosto(q: any) {
      return posto_id ? q.eq('posto_id', posto_id) : q
    }

    const BOLETO_COLS = 'id, fornecedor_nome, valor_as, boleto_vencimento, boleto_valor, boleto_url, boletos, postos(nome)'

    const [
      { data: pendentesGerente },
      { data: aguardandoFiscal },
      { data: boletosVencendo },
      { data: boletosVencidos },
      { data: semBoleto },
      { data: todosBoletosAnexados },
    ] = await Promise.all([
      applyPosto(supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, data_emissao, postos(nome)'))
        .in('status', ['pendente_gerente', 'nf_rejeitada'])
        .order('criada_em', { ascending: true }),

      applyPosto(supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, data_emissao, boleto_vencimento, postos(nome)'))
        .eq('status', 'aguardando_fiscal')
        .order('boleto_vencimento', { ascending: true }),

      applyPosto(supabase.from('fiscal_tarefas').select(BOLETO_COLS))
        .eq('status', 'aguardando_fiscal')
        .gte('boleto_vencimento', hoje)
        .lte('boleto_vencimento', em7dias)
        .order('boleto_vencimento', { ascending: true }),

      applyPosto(supabase.from('fiscal_tarefas').select(BOLETO_COLS))
        .eq('status', 'aguardando_fiscal')
        .lt('boleto_vencimento', hoje)
        .order('boleto_vencimento', { ascending: true }),

      applyPosto(supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, postos(nome)'))
        .eq('status', 'aguardando_fiscal')
        .is('boleto_url', null),

      // Todos os boletos anexados — inclui vencimentos futuros
      applyPosto(supabase.from('fiscal_tarefas').select(BOLETO_COLS))
        .eq('status', 'aguardando_fiscal')
        .not('boleto_url', 'is', null)
        .order('boleto_vencimento', { ascending: true, nullsFirst: false }),
    ])

    return NextResponse.json({
      pendentes_gerente:      pendentesGerente ?? [],
      aguardando_fiscal:      aguardandoFiscal ?? [],
      boletos_vencendo:       boletosVencendo  ?? [],
      boletos_vencidos:       boletosVencidos  ?? [],
      sem_boleto:             semBoleto        ?? [],
      todos_boletos_anexados: todosBoletosAnexados ?? [],
      totais: {
        pendentes_gerente: pendentesGerente?.length ?? 0,
        aguardando_fiscal: aguardandoFiscal?.length ?? 0,
        boletos_vencendo:  boletosVencendo?.length  ?? 0,
        boletos_vencidos:  boletosVencidos?.length  ?? 0,
        sem_boleto:        semBoleto?.length        ?? 0,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
