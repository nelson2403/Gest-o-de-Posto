import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarLancamentoNfe, verificarManifestacaoExterna, buscarNfeManifestos } from '@/lib/autosystem'

// POST — quatro passos:
//  0. Auto-importa novos manifestos do AUTOSYSTEM → cria tarefas pendente_gerente
//  1. Tarefas aguardando_fiscal: conclui quando NF já confirmada no SEFAZ (210200) OU lançada em lmc_entrada
//  2. Tarefas pendente_gerente/nf_rejeitada: conclui/desconhece quando manifestada externamente no SEFAZ
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const agora = new Date().toISOString()
    const hoje  = agora.slice(0, 10)

    // ── Passo 0: auto-importar novos manifestos do AUTOSYSTEM ─────────────────
    let importadas = 0
    let reabertas  = 0
    try {
      const { data: postos } = await admin
        .from('postos')
        .select('id, nome, codigo_empresa_externo')
        .not('codigo_empresa_externo', 'is', null)

      if (postos?.length) {
        const empresaGrids = postos.map((p: any) => Number(p.codigo_empresa_externo))
        const manifestos   = await buscarNfeManifestos(empresaGrids)

        if (manifestos.length) {
          // Consulta apenas os grids que o AS retornou — sem limite de 1000 linhas
          const manifestoGrids = manifestos.map((m: any) => Number(m.grid))

          const [{ data: ativasParaGrids }, { data: nullParaGrids }, { data: encerradas }] = await Promise.all([
            admin.from('fiscal_tarefas')
              .select('nfe_resumo_grid')
              .in('nfe_resumo_grid', manifestoGrids)
              .not('status', 'in', '(concluida,desconhecida)')
              .not('status', 'is', null),
            admin.from('fiscal_tarefas')
              .select('nfe_resumo_grid')
              .in('nfe_resumo_grid', manifestoGrids)
              .is('status', null),
            // Só reabre desconhecida — concluida é estado final, não reabre mesmo que NF
            // ainda apareça na lista (sem 210200). Reabertura de concluida causava loop infinito.
            admin.from('fiscal_tarefas')
              .select('id, nfe_resumo_grid, posto_id')
              .in('nfe_resumo_grid', manifestoGrids)
              .in('status', ['desconhecida']),
          ])

          const gridsAtivos = new Set([
            ...(ativasParaGrids ?? []).map((t: any) => String(t.nfe_resumo_grid)),
            ...(nullParaGrids   ?? []).map((t: any) => String(t.nfe_resumo_grid)),
          ])
          const encerradasMap = new Map((encerradas ?? []).map((t: any) => [String(t.nfe_resumo_grid), { id: t.id as string, posto_id: t.posto_id as string | null }]))
          const postoMap       = Object.fromEntries(postos.map((p: any) => [Number(p.codigo_empresa_externo), p]))

          // Manifestos sem tarefa ativa
          const pendentes = manifestos.filter((m: any) => !gridsAtivos.has(String(m.grid)))

          // Subset que já tem tarefa encerrada — reabre em vez de duplicar
          const paraReabrir  = pendentes.filter((m: any) => encerradasMap.has(String(m.grid)))
          const paraInserir  = pendentes.filter((m: any) => !encerradasMap.has(String(m.grid)))

          if (paraReabrir.length) {
            await Promise.all(paraReabrir.map((m: any) => {
              const entrada = encerradasMap.get(String(m.grid))!
              const postoId = postoMap[m.empresa]?.id ?? null
              const upd: Record<string, unknown> = { status: 'pendente_gerente', atualizada_em: agora }
              if (postoId && !entrada.posto_id) upd.posto_id = postoId
              return admin.from('fiscal_tarefas').update(upd).eq('id', entrada.id)
            }))
            reabertas = paraReabrir.length
          }

          if (paraInserir.length) {
            const { data: criadas, error: errInsert } = await admin
              .from('fiscal_tarefas')
              .insert(paraInserir.map((m: any) => ({
                nfe_resumo_grid: m.grid,
                empresa_grid:    m.empresa,
                fornecedor_nome: m.emitente_nome,
                fornecedor_cpf:  m.emitente_cpf,
                valor_as:        m.valor,
                data_emissao:    m.data_emissao,
                posto_id:        postoMap[m.empresa]?.id ?? null,
                status:          'pendente_gerente',
              })))
              .select('id')
            if (errInsert) console.error('[fiscal-sync] erro INSERT fiscal_tarefas:', errInsert.message)
            importadas = criadas?.length ?? 0
          }
        }
      }
    } catch (e: any) {
      console.error('[fiscal-sync] erro ao importar manifestos do AUTOSYSTEM:', e.message)
    }

    // ── Passo 1: aguardando_fiscal → concluída ────────────────────────────────
    // Fecha quando: (a) NF confirmada no SEFAZ com evento 210200, OU
    //               (b) NF lançada em lmc_entrada (por grid)
    const { data: tarefasAguardando } = await admin
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, nf_valor_informado, boleto_url, boleto_vencimento, boleto_valor, fornecedor_nome, posto_id, valor_as')
      .eq('status', 'aguardando_fiscal')

    let concluidasStep1 = 0

    if (tarefasAguardando?.length) {
      const gridsAguardando = tarefasAguardando
        .map(t => t.nfe_resumo_grid)
        .filter(Boolean) as number[]

      // (a) Verifica confirmação no SEFAZ:
      //   210200 = Confirmação da Operação → fecha aguardando_fiscal automaticamente
      //   210210 (Ciência) NÃO fecha aguardando_fiscal — fiscal precisa revisar antes de concluir
      const manifestadasAguardando = gridsAguardando.length
        ? await verificarManifestacaoExterna(gridsAguardando)
        : []
      const gridsConfirmados = new Set(
        manifestadasAguardando
          .filter(m => m.nfe_evento === 210200)
          .map(m => m.grid)
      )

      // (b) Verifica lançamento em lmc_entrada (join correto via nfe_resumo)
      const gridsLancados = new Set<string>()
      if (gridsAguardando.length) {
        try {
          const lancamentos = await verificarLancamentoNfe(gridsAguardando)
          lancamentos.forEach(l => gridsLancados.add(l.grid))
        } catch {}
      }

      const concluir = tarefasAguardando.filter(t => {
        const gridStr = String(t.nfe_resumo_grid ?? '')
        return gridsConfirmados.has(gridStr) || gridsLancados.has(gridStr)
      })

      if (concluir.length) {
        // Tarefas COM boleto → boleto_pendente (fiscal precisa enviar ao CP manualmente)
        const comBoleto = concluir.filter(t => t.boleto_url)
        // Tarefas SEM boleto → concluída direta
        const semBoleto = concluir.filter(t => !t.boleto_url)

        if (semBoleto.length) {
          await admin
            .from('fiscal_tarefas')
            .update({ status: 'concluida', lancado_em: agora, concluida_em: agora, concluida_por: user.id, atualizada_em: agora })
            .in('id', semBoleto.map(t => t.id))
        }

        if (comBoleto.length) {
          await admin
            .from('fiscal_tarefas')
            .update({ status: 'concluida', boleto_status: 'pendente', lancado_em: agora, concluida_em: agora, atualizada_em: agora })
            .in('id', comBoleto.map(t => t.id))
        }

        concluidasStep1 = concluir.length
      }
    }

    // ── Passo 2: pendente_gerente/nf_rejeitada → fecha se confirmada no SEFAZ ────
    // ── Passo 2b: pendente_gerente já reconhecida → avança para aguardando_fiscal ─
    const { data: tarefasPendentes } = await admin
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, status, acao_gerente, nf_url')
      .in('status', ['pendente_gerente', 'nf_rejeitada'])
      .not('nfe_resumo_grid', 'is', null)

    let concluidasStep2   = 0
    let desconhecidasAuto = 0

    if (tarefasPendentes?.length) {
      const grids = tarefasPendentes
        .map(t => t.nfe_resumo_grid)
        .filter(Boolean) as number[]

      const manifestadas   = await verificarManifestacaoExterna(grids)
      const eventosPorGrid = new Map(manifestadas.map(m => [m.grid, m.nfe_evento]))

      const confirmar:     string[] = []
      const desconhecer:   string[] = []
      const avancarFiscal: string[] = []

      for (const t of tarefasPendentes) {
        const evento = eventosPorGrid.get(String(t.nfe_resumo_grid))
        if (evento === 210200 && t.status === 'pendente_gerente') { confirmar.push(t.id); continue }
        if (evento === 210220 || evento === 210240) { desconhecer.push(t.id); continue }
        // Gerente já reconheceu mas tarefa voltou para pendente_gerente (re-abertura) → avança para fiscal
        if (t.status === 'pendente_gerente' && t.acao_gerente === 'reconhecida') avancarFiscal.push(t.id)
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

      if (avancarFiscal.length) {
        await admin
          .from('fiscal_tarefas')
          .update({ status: 'aguardando_fiscal', atualizada_em: agora })
          .in('id', avancarFiscal)
      }
    }

    return NextResponse.json({
      importadas,
      reabertas,
      avancadas_fiscal:   0,
      concluidas:         concluidasStep1 + concluidasStep2,
      concluidas_step1:   concluidasStep1,
      concluidas_step2:   concluidasStep2,
      desconhecidas_auto: desconhecidasAuto,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
