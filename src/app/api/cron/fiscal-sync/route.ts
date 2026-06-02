import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  verificarLancamentoNfe,
  verificarManifestacaoExterna,
  buscarNfeManifestos,
} from '@/lib/autosystem'

const CRON_SECRET = process.env.CRON_SECRET

// POST — roda o sync fiscal completo sem exigir sessão de usuário.
// Chamado automaticamente pelo autosystem.ts ou por um cron externo.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const agora = new Date().toISOString()

    // ── Passo 0: importar novos manifestos ────────────────────────────────────
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
        console.log(`[cron-fiscal-sync] AS retornou ${manifestos.length} manifesto(s) pendente(s) para ${postos.length} posto(s)`)

        if (manifestos.length) {
          // Tarefas ativas (não concluídas/desconhecidas) — não duplicar
          // Consulta apenas os grids que o AS retornou — evita limite de 1000 linhas
          // e trata NULL corretamente (NULL NOT IN = desconhecido em SQL)
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
          const postoMap      = Object.fromEntries(postos.map((p: any) => [Number(p.codigo_empresa_externo), p]))

          const pendentes    = manifestos.filter((m: any) => !gridsAtivos.has(String(m.grid)))
          const paraReabrir  = pendentes.filter((m: any) =>  encerradasMap.has(String(m.grid)))
          const paraInserir  = pendentes.filter((m: any) => !encerradasMap.has(String(m.grid)))

          if (paraReabrir.length) {
            // Reabre cada tarefa e corrige posto_id se estava null (posto não mapeado na importação original)
            await Promise.all(paraReabrir.map((m: any) => {
              const entrada  = encerradasMap.get(String(m.grid))!
              const postoId  = postoMap[m.empresa]?.id ?? null
              const upd: Record<string, unknown> = { status: 'pendente_gerente', atualizada_em: agora }
              if (postoId && !entrada.posto_id) upd.posto_id = postoId
              return admin.from('fiscal_tarefas').update(upd).eq('id', entrada.id)
            }))
            reabertas = paraReabrir.length
          }

          if (paraInserir.length) {
            const semPosto = paraInserir.filter((m: any) => !postoMap[m.empresa])
            if (semPosto.length) {
              console.warn(`[cron-fiscal-sync] ${semPosto.length} manifesto(s) sem posto mapeado (empresa grids: ${semPosto.map((m: any) => m.empresa).join(', ')})`)
            }
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
            if (errInsert) console.error('[cron-fiscal-sync] erro INSERT fiscal_tarefas:', errInsert.message, errInsert.details)
            importadas = criadas?.length ?? 0
          }
        }
      }
    } catch (e: any) {
      console.error('[cron-fiscal-sync] erro ao importar manifestos do AUTOSYSTEM:', e.message)
    }

    // ── Passo 1: aguardando_fiscal → concluída / boleto_pendente ─────────────
    const { data: tarefasAguardando, count: totalAguardando } = await admin
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, boleto_url, boletos', { count: 'exact' })
      .eq('status', 'aguardando_fiscal')

    let concluidasStep1 = 0
    let semBoletoCount = 0
    let comBoletoCount = 0
    let updateConcluidaCount = 0
    let updateBoletoCount = 0
    const debugGridsLancados: string[] = []

    if (tarefasAguardando?.length) {
      const gridsAguardando = tarefasAguardando
        .map(t => t.nfe_resumo_grid)
        .filter(Boolean) as number[]

      // (a) Apenas 210200 fecha aguardando_fiscal — Ciência (210210) não basta,
      //     o fiscal precisa revisar antes de concluir
      const manifestadas = gridsAguardando.length
        ? await verificarManifestacaoExterna(gridsAguardando)
        : []
      const gridsConfirmados = new Set(
        manifestadas.filter(m => m.nfe_evento === 210200).map(m => m.grid)
      )

      // (b) Lançado em lmc_entrada (join correto via nfe_resumo)
      const gridsLancados = new Set<string>()
      if (gridsAguardando.length) {
        try {
          const lancamentos = await verificarLancamentoNfe(gridsAguardando)
          lancamentos.forEach(l => { gridsLancados.add(l.grid); debugGridsLancados.push(l.grid) })
        } catch {}
      }

      const concluir = tarefasAguardando.filter(t => {
        const g = String(t.nfe_resumo_grid ?? '')
        return gridsConfirmados.has(g) || gridsLancados.has(g)
      })

      if (concluir.length) {
        const temBoleto = (t: any) =>
          (t.boletos?.length > 0 && t.boletos.some((b: any) => b.url)) || !!t.boleto_url

        const comBoleto = concluir.filter(temBoleto)
        const semBoleto = concluir.filter(t => !temBoleto(t))
        semBoletoCount = semBoleto.length
        comBoletoCount = comBoleto.length

        if (semBoleto.length) {
          const { error: e1, count: c1 } = await admin
            .from('fiscal_tarefas')
            .update({ status: 'concluida', lancado_em: agora, concluida_em: agora, atualizada_em: agora }, { count: 'exact' })
            .in('id', semBoleto.map(t => t.id))
          if (e1) console.error('[cron-fiscal-sync] update concluida erro:', e1.message)
          updateConcluidaCount = c1 ?? 0
        }
        if (comBoleto.length) {
          const { error: e2, count: c2 } = await admin
            .from('fiscal_tarefas')
            .update({ status: 'concluida', boleto_status: 'pendente', lancado_em: agora, concluida_em: agora, atualizada_em: agora }, { count: 'exact' })
            .in('id', comBoleto.map(t => t.id))
          if (e2) console.error('[cron-fiscal-sync] update boleto_pendente erro:', e2.message)
          updateBoletoCount = c2 ?? 0
        }

        concluidasStep1 = concluir.length
      }
    }

    // ── Passo 2: pendente_gerente/nf_rejeitada → fecha se confirmada no SEFAZ ──
    // ── Passo 2b: pendente_gerente já reconhecida → avança para aguardando_fiscal ─
    const { data: tarefasPendentes } = await admin
      .from('fiscal_tarefas')
      .select('id, nfe_resumo_grid, status, acao_gerente, nf_url')
      .in('status', ['pendente_gerente', 'nf_rejeitada'])
      .not('nfe_resumo_grid', 'is', null)

    let concluidasStep2   = 0
    let desconhecidasAuto = 0
    let avancadasFiscal   = 0

    if (tarefasPendentes?.length) {
      const grids = tarefasPendentes.map(t => t.nfe_resumo_grid).filter(Boolean) as number[]
      const manifestadas   = await verificarManifestacaoExterna(grids)
      const eventosPorGrid = new Map(manifestadas.map(m => [m.grid, m.nfe_evento]))

      const confirmar:     string[] = []
      const desconhecer:   string[] = []
      const avancarFiscal: string[] = []

      for (const t of tarefasPendentes) {
        const evento = eventosPorGrid.get(String(t.nfe_resumo_grid))
        if (evento === 210200 && t.status === 'pendente_gerente') { confirmar.push(t.id); continue }
        if (evento === 210220 || evento === 210240) { desconhecer.push(t.id); continue }
        // Gerente já reconheceu mas tarefa voltou para pendente_gerente → avança para fiscal revisar
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
        avancadasFiscal = avancarFiscal.length
      }
    }

    console.log(`[cron-fiscal-sync] ${agora} — importadas=${importadas} reabertas=${reabertas} concluidas=${concluidasStep1 + concluidasStep2} desconhecidas=${desconhecidasAuto} avancadas_fiscal=${avancadasFiscal}`)

    return NextResponse.json({
      importadas,
      concluidas:           concluidasStep1 + concluidasStep2,
      concluidas_step1:     concluidasStep1,
      concluidas_step2:     concluidasStep2,
      desconhecidas_auto:   desconhecidasAuto,
      debug: {
        total_aguardando:   totalAguardando,
        grids_lancados:     debugGridsLancados.length,
        sem_boleto:         semBoletoCount,
        com_boleto:         comBoletoCount,
        rows_updated_concluida: updateConcluidaCount,
        rows_updated_boleto:    updateBoletoCount,
      },
    })
  } catch (e: any) {
    console.error('[cron-fiscal-sync] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
