import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarLancamentoNfe, verificarManifestacaoExterna } from '@/lib/autosystem'

// POST — dois passos:
//  1. Tarefas aguardando_fiscal: conclui quando NF lançada em lmc_entrada no AS
//  2. Tarefas pendente_gerente: conclui/desconhece quando NF já manifestada externamente no SEFAZ
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const agora = new Date().toISOString()
    const hoje  = agora.slice(0, 10)

    // ── Passo 1: aguardando_fiscal → concluída quando lançada no estoque ─────
    const { data: tarefasAguardando } = await supabase
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, nf_valor_informado, boleto_url, boleto_vencimento, boleto_valor, fornecedor_nome, posto_id, valor_as')
      .eq('status', 'aguardando_fiscal')

    let concluidasStep1 = 0
    let boletosEnviados = 0

    if (tarefasAguardando?.length) {
      const documentos = tarefasAguardando
        .map(t => t.nfe_resumo_grid?.toString())
        .filter(Boolean) as string[]

      const lancamentos  = await verificarLancamentoNfe(documentos)
      const docsLancados = new Set(lancamentos.map(l => l.documento))

      const concluir = tarefasAguardando.filter(t =>
        docsLancados.has(t.nfe_resumo_grid?.toString() ?? '')
      )

      if (concluir.length) {
        await supabase
          .from('fiscal_tarefas')
          .update({ status: 'concluida', lancado_em: agora, concluida_em: agora, concluida_por: user.id, atualizada_em: agora })
          .in('id', concluir.map(t => t.id))

        const boletoRegistros = concluir
          .filter(t => t.boleto_url && t.posto_id)
          .map(t => ({
            posto_id:        t.posto_id,
            data_lancamento: hoje,
            descricao:       `Boleto NF Fiscal — ${t.fornecedor_nome}`,
            valor:           Number(t.boleto_valor ?? t.nf_valor_informado ?? t.valor_as),
            fornecedor_nome: t.fornecedor_nome,
            documento:       t.nfe_resumo_grid?.toString() ?? null,
            obs:             t.boleto_url ? `Boleto: ${t.boleto_url}` : null,
            criado_por:      user.id,
          }))

        if (boletoRegistros.length) {
          await admin.from('cp_lancamentos').insert(boletoRegistros)
          boletosEnviados = boletoRegistros.length
        }

        concluidasStep1 = concluir.length
      }
    }

    // ── Passo 2: pendente_gerente → fecha automaticamente se manifestada no SEFAZ ──
    const { data: tarefasPendentes } = await supabase
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid')
      .in('status', ['pendente_gerente', 'nf_rejeitada'])
      .not('nfe_resumo_grid', 'is', null)

    let concluidasStep2  = 0
    let desconhecidasAuto = 0

    if (tarefasPendentes?.length) {
      const grids = tarefasPendentes
        .map(t => t.nfe_resumo_grid)
        .filter(Boolean) as number[]

      const manifestadas = await verificarManifestacaoExterna(grids)
      const eventosPorGrid = new Map(manifestadas.map(m => [m.grid, m.nfe_evento]))

      const confirmar:    string[] = []
      const desconhecer:  string[] = []

      for (const t of tarefasPendentes) {
        const evento = eventosPorGrid.get(String(t.nfe_resumo_grid))
        if (!evento) continue
        if (evento === 210200) confirmar.push(t.id)
        else desconhecer.push(t.id)   // 210220 ou 210240
      }

      if (confirmar.length) {
        await admin
          .from('fiscal_tarefas')
          .update({ status: 'concluida', concluida_em: agora, atualizada_em: agora })
          .in('id', confirmar)
        concluidasStep2 = confirmar.length
      }

      if (desconhecer.length) {
        await admin
          .from('fiscal_tarefas')
          .update({ status: 'desconhecida', concluida_em: agora, atualizada_em: agora, acao_gerente: 'desconhecida' })
          .in('id', desconhecer)
        desconhecidasAuto = desconhecer.length
      }
    }

    return NextResponse.json({
      concluidas:        concluidasStep1 + concluidasStep2,
      boletos_enviados:  boletosEnviados,
      concluidas_step1:  concluidasStep1,
      concluidas_step2:  concluidasStep2,
      desconhecidas_auto: desconhecidasAuto,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
