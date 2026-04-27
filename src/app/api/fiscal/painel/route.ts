import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const hoje = new Date().toISOString().slice(0, 10)
    const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    const [
      { data: pendentesGerente },
      { data: aguardandoFiscal },
      { data: boletosVencendo },
      { data: boletosVencidos },
      { data: semBoleto },
      { data: totalGeral },
    ] = await Promise.all([
      supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, data_emissao, postos(nome)', { count: 'exact' })
        .in('status', ['pendente_gerente', 'nf_rejeitada'])
        .order('criada_em', { ascending: true })
        .limit(50),

      supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, data_emissao, boleto_vencimento, postos(nome)', { count: 'exact' })
        .eq('status', 'aguardando_fiscal')
        .order('boleto_vencimento', { ascending: true })
        .limit(50),

      supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, boleto_vencimento, postos(nome)')
        .eq('status', 'aguardando_fiscal')
        .gte('boleto_vencimento', hoje)
        .lte('boleto_vencimento', em7dias)
        .order('boleto_vencimento', { ascending: true }),

      supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, boleto_vencimento, postos(nome)')
        .eq('status', 'aguardando_fiscal')
        .lt('boleto_vencimento', hoje)
        .order('boleto_vencimento', { ascending: true }),

      supabase.from('fiscal_tarefas').select('id, fornecedor_nome, valor_as, postos(nome)')
        .eq('status', 'aguardando_fiscal')
        .is('boleto_url', null),

      supabase.from('fiscal_tarefas').select('status', { count: 'exact', head: true }),
    ])

    return NextResponse.json({
      pendentes_gerente:  pendentesGerente ?? [],
      aguardando_fiscal:  aguardandoFiscal ?? [],
      boletos_vencendo:   boletosVencendo ?? [],
      boletos_vencidos:   boletosVencidos ?? [],
      sem_boleto:         semBoleto ?? [],
      totais: {
        pendentes_gerente: pendentesGerente?.length ?? 0,
        aguardando_fiscal: aguardandoFiscal?.length ?? 0,
        boletos_vencendo:  boletosVencendo?.length ?? 0,
        boletos_vencidos:  boletosVencidos?.length ?? 0,
        sem_boleto:        semBoleto?.length ?? 0,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
