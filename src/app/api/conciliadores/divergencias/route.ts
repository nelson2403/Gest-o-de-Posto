import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface DivergenciaItem {
  id:                        string
  titulo:                    string
  data:                      string
  posto_nome:                string
  empresa_id:                string
  status:                    string
  categoria:                 string
  divergencia_valor:         number | null
  extrato_movimento:         number | null
  extrato_saldo_externo:     number | null
  usuario_atribuido:         string | null
  conciliador_responsavel:   string | null
  prioridade:                string
  dias_pendente:             number
  extrato_status:            string
}

// GET — retorna divergências bancárias para conciliador
// Filtra: tarefas de conciliacao_bancaria com status divergente ou ok mas ainda pendente
export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Verifica role do usuário
  const { data: userData } = await supabase
    .from('usuarios')
    .select('role, id')
    .eq('id', user.id)
    .single()

  // Apenas conciliadores e admins podem acessar
  if (!userData || !['operador_conciliador', 'adm_financeiro', 'master'].includes(userData.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Conciliadores veem só seu(s) posto(s); master/adm veem tudo
  const isMaster = ['master', 'adm_financeiro'].includes(userData.role)
  let postoIds: string[] = []

  if (!isMaster) {
    // Conciliador: busca postos da tabela usuario_postos_fechamento
    const { data: postos } = await supabase
      .from('usuario_postos_fechamento')
      .select('posto_id')
      .eq('usuario_id', user.id)

    postoIds = (postos ?? []).map(p => p.posto_id)

    if (postoIds.length === 0) {
      return NextResponse.json({ error: 'Nenhum posto atribuído a este conciliador' }, { status: 400 })
    }
  }

  try {
    const admin = createAdminClient()

    // Busca mapa de posto_id -> conciliador (nome) para exibir responsáveis
    const { data: atribuicoes } = await admin
      .from('usuario_postos_fechamento')
      .select('posto_id, usuario:usuarios(id, nome)')

    const postoParaConciliador: Record<string, string> = {}
    for (const attr of atribuicoes ?? []) {
      const usuario = (attr as any).usuario
      if (usuario?.nome) {
        postoParaConciliador[attr.posto_id] = usuario.nome
      }
    }

    // Busca tarefas de conciliação com divergências
    // Filtra: categoria, com arquivo, com data, com diferença calculada
    let query = admin
      .from('tarefas')
      .select(`
        id,
        titulo,
        data_inicio,
        usuario_id,
        status,
        categoria,
        extrato_diferenca,
        extrato_movimento,
        extrato_saldo_externo,
        extrato_status,
        extrato_data,
        criado_em,
        posto_id,
        posto:postos(id, nome, empresa_id),
        usuario_atribuido:usuarios(id, nome)
      `)
      .eq('categoria', 'conciliacao_bancaria')
      // Não mostra tarefas já resolvidas (concluídas/canceladas) — só divergências ativas.
      .not('status', 'in', '("concluido","concluida","cancelado")')
      .not('extrato_arquivo_path', 'is', null)
      .not('extrato_data', 'is', null)
      .not('extrato_diferenca', 'is', null)
      // diferença significativa em QUALQUER sentido (banco > AS ou banco < AS).
      // Antes usava só .gt(0.02), escondendo as divergências negativas.
      .or('extrato_diferenca.gt.0.02,extrato_diferenca.lt.-0.02')
      .order('extrato_diferenca', { ascending: false })

    // Filtrar por posto: conciliadores veem só seu(s) posto(s), admin_financeiro/master veem tudo
    if (!isMaster && postoIds.length > 0) {
      query = query.in('posto_id', postoIds)
    }

    const { data: tarefas, error } = await query

    if (error) throw error

    console.log('[DIVERGENCIAS] Query retornou:', tarefas?.length ?? 0, 'divergências')

    const agora = new Date()
    const divergencias: DivergenciaItem[] = (tarefas ?? [])
      .map(t => {
        const dataInicio = new Date(t.data_inicio ?? t.criado_em)
        const diasPendente = Math.floor((agora.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24))
        const prioridade =
          t.extrato_status === 'divergente'
            ? diasPendente > 3
              ? 'urgente'
              : 'alta'
            : 'media'

        const postoId = t.posto_id as string
        return {
          id: t.id as string,
          titulo: t.titulo as string,
          data: (t.data_inicio as string) ?? new Date().toISOString().slice(0, 10),
          posto_nome: (t.posto as any)?.nome ?? 'Desconhecido',
          empresa_id: (t.posto as any)?.empresa_id ?? '',
          status: t.status as string,
          categoria: t.categoria as string,
          divergencia_valor: t.extrato_diferenca as number | null,
          extrato_movimento: t.extrato_movimento as number | null,
          extrato_saldo_externo: t.extrato_saldo_externo as number | null,
          usuario_atribuido: (t.usuario_atribuido as any)?.nome ?? null,
          conciliador_responsavel: postoParaConciliador[postoId] ?? null,
          prioridade,
          dias_pendente: diasPendente,
          extrato_status: t.extrato_status as string,
        }
      })
    return NextResponse.json({ divergencias, total: divergencias.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
