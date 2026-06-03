import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosAutosystem, calcularMovimento } from '@/lib/autosystem'

// POST — sincroniza e recalcula divergências do usuário
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: userData } = await supabase
      .from('usuarios')
      .select('role, id')
      .eq('id', user.id)
      .single()

    if (!userData || !['operador_conciliador', 'adm_financeiro', 'master'].includes(userData.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const admin = createAdminClient()
    const isMaster = ['master', 'adm_financeiro'].includes(userData.role)

    // 1. Buscar postos do usuário
    let postoIds: string[] = []
    if (!isMaster) {
      const { data: postos } = await supabase
        .from('usuario_postos_fechamento')
        .select('posto_id')
        .eq('usuario_id', user.id)
      postoIds = (postos ?? []).map(p => p.posto_id)
      if (postoIds.length === 0) {
        return NextResponse.json({ error: 'Nenhum posto atribuído' }, { status: 400 })
      }
    }

    // 2. Buscar tarefas de conciliação dos postos do usuário
    let query = admin
      .from('tarefas')
      .select(`
        id, titulo,
        extrato_data, extrato_movimento, extrato_status,
        extrato_diferenca,
        posto_id, banco, conta_bancaria_id,
        posto:postos(id, nome, codigo_empresa_externo),
        recorrente:tarefas_recorrentes(usuario_id, posto:postos(id, nome, codigo_empresa_externo)),
        conta_bancaria:contas_bancarias(codigo_conta_externo)
      `)
      .eq('categoria', 'conciliacao_bancaria')
      .in('extrato_status', ['ok', 'divergente'])
      .not('extrato_arquivo_path', 'is', null)
      .not('extrato_data', 'is', null)

    if (!isMaster && postoIds.length > 0) {
      query = query.in('posto_id', postoIds)
    }

    const { data: tarefas } = await query

    if (!tarefas?.length) {
      return NextResponse.json({
        sincronizadas: 0,
        divergentes: 0,
        resolvidas: 0,
      })
    }

    // 3. Buscar contas bancárias
    const { data: contasBancarias } = await admin
      .from('contas_bancarias')
      .select('id, posto_id, banco, codigo_conta_externo')
      .not('codigo_conta_externo', 'is', null)

    const postoContaCount: Record<string, number> = {}
    const contaMapPosto: Record<string, string> = {}
    for (const c of contasBancarias ?? []) {
      if (!c.posto_id) continue
      postoContaCount[c.posto_id] = (postoContaCount[c.posto_id] ?? 0) + 1
    }
    for (const c of contasBancarias ?? []) {
      if (c.posto_id && postoContaCount[c.posto_id] === 1)
        contaMapPosto[c.posto_id] = c.codigo_conta_externo!
    }

    let sincronizadas = 0
    let divergentes = 0
    let resolvidas = 0
    const atualizadas: string[] = []
    const erros: string[] = []
    const naoAtualizadas: string[] = []

    // 4. Recalcular divergências
    for (const t of tarefas) {
      const posto = (t.posto as any) ?? (t.recorrente as any)?.posto ?? null
      if (!posto?.codigo_empresa_externo) continue

      const empresaId = parseInt(posto.codigo_empresa_externo)
      if (isNaN(empresaId)) continue

      const postoId = t.posto_id ?? null
      const contaCodigo: string | null =
        (t.conta_bancaria as any)?.codigo_conta_externo
        ?? (postoId ? (contaMapPosto[postoId] ?? null) : null)

      const dataFim = t.extrato_data as string

      // Buscar movimento ATUAL do AUTOSYSTEM
      let movAtual: number
      try {
        const movtos = await buscarMovtosAutosystem(empresaId, [dataFim])
        if (contaCodigo) {
          const entradas = movtos.filter(m => m.conta_debitar === contaCodigo).reduce((s, m) => s + m.valor, 0)
          const saidas = movtos.filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + m.valor, 0)
          movAtual = parseFloat((entradas - saidas).toFixed(2))
        } else {
          movAtual = calcularMovimento(movtos, null)
        }
      } catch {
        continue
      }

      sincronizadas++

      const movExtrato = (t.extrato_movimento as number) ?? 0
      const diferenca = parseFloat((movExtrato - movAtual).toFixed(2))
      const isDivergente = Math.abs(diferenca) > 0.02

      // Atualizar tarefa no banco
      const novoStatus = isDivergente ? 'divergente' : 'ok'
      const statusAnterior = t.extrato_status as string
      const statusMudou = novoStatus !== statusAnterior

      console.log(`[sync-calc] ${t.id}: movimento=${movExtrato}, autosystem=${movAtual}, diferenca=${diferenca}, isDivergente=${isDivergente}, statusAnterior=${statusAnterior}, novoStatus=${novoStatus}, mudou=${statusMudou}`)

      if (statusMudou || Math.abs(diferenca - (t.extrato_diferenca ?? 0)) > 0.01) {
        console.log(`[sync-update] ${t.id}: ${t.extrato_status} → ${novoStatus}, diferenca: ${diferenca}`)

        try {
          const { data: updated, error: updateError } = await admin
            .from('tarefas')
            .update({
              extrato_status: novoStatus,
              extrato_diferenca: diferenca,
              atualizada_em: new Date().toISOString(),
            })
            .eq('id', t.id)
            .select()

          if (updateError) {
            const msg = `${t.id}: ${updateError.message} (code: ${updateError.code})`
            console.error(`[sync-error] ${msg}`)
            erros.push(msg)
          } else if (!updated || updated.length === 0) {
            const msg = `${t.id}: UPDATE retornou 0 linhas (status anterior: ${t.extrato_status})`
            console.warn(`[sync-no-rows] ${msg}`)
            naoAtualizadas.push(msg)
          } else {
            atualizadas.push(`${t.id}: ${t.extrato_status} → ${novoStatus} (diff: ${diferenca})`)
            console.log(`[sync-ok] ${t.id}: salva com sucesso, rows: ${updated.length}`)
          }
        } catch (updateErr: any) {
          const msg = `${t.id}: ${updateErr.message}`
          console.error(`[sync-exception] ${msg}`)
          erros.push(msg)
        }

        if (statusMudou && !isDivergente) {
          resolvidas++
        } else if (isDivergente) {
          divergentes++
        }
      } else if (isDivergente) {
        divergentes++
        console.log(`[sync-divergente-nao-atualizada] ${t.id}: diferença não mudou o suficiente (${Math.abs(diferenca - (t.extrato_diferenca ?? 0))})`)
      }
    }

    console.log(`[sincronizar] Resultado final: ${atualizadas.length} atualizadas, ${sincronizadas} sincronizadas, ${resolvidas} resolvidas`)

    if (atualizadas.length === 0 && tarefas.length > 0) {
      console.warn(`[sincronizar] ⚠️  AVISO: Nenhuma tarefa foi atualizada apesar de ter achado ${tarefas.length} tarefas!`)
    }

    return NextResponse.json({
      sincronizadas,
      divergentes,
      resolvidas,
      atualizadas: atualizadas.length,
      debug: {
        totalTarefas: tarefas.length,
        atualizadasCount: atualizadas.length,
        errosCount: erros.length,
        naoAtualizadasCount: naoAtualizadas.length,
        exemplosAtualizadas: atualizadas.slice(0, 5),
        exemplosErros: erros.slice(0, 5),
        exemplosNaoAtualizadas: naoAtualizadas.slice(0, 5),
      },
    })
  } catch (e: any) {
    console.error('[sincronizar] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
