import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMovtosAutosystem, calcularMovimento } from '@/lib/autosystem'

function gerarDatas(ini: string, fim: string): string[] {
  const datas: string[] = []
  const cur = new Date(ini + 'T12:00:00')
  const end = new Date(fim + 'T12:00:00')
  while (cur <= end && datas.length < 60) {
    datas.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return datas
}

// POST /api/extrato-verificar/por-usuario
// Verifica divergências apenas dos postos que o usuário tem acesso
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // 1. Busca postos que o usuário tem acesso
  const { data: usuarioData } = await supabase
    .from('usuarios')
    .select('id, role, posto_fechamento_id')
    .eq('id', user.id)
    .single()

  let postoIds: string[] = []

  if (usuarioData?.role === 'master') {
    // Master vê todos os postos
    const { data: todosPostos } = await admin.from('postos').select('id')
    postoIds = (todosPostos ?? []).map(p => p.id)
  } else if (usuarioData?.role === 'gerente' && usuarioData?.posto_fechamento_id) {
    // Gerente vê apenas seu posto
    postoIds = [usuarioData.posto_fechamento_id]
  } else {
    // Outros papéis consultam usuario_postos_fechamento
    const { data: usuarioPostos } = await admin
      .from('usuario_postos_fechamento')
      .select('posto_id')
      .eq('usuario_id', user.id)
    postoIds = (usuarioPostos ?? []).map(up => up.posto_id)
  }

  if (!postoIds.length) {
    return NextResponse.json({ verificadas: 0, divergentes: [], resolvidos: 0 })
  }

  // 2. Busca extratos apenas dos postos do usuário
  const { data: tarefas, error } = await admin
    .from('tarefas')
    .select(`
      id, extrato_data, extrato_periodo_ini, extrato_movimento, extrato_saldo_externo,
      extrato_status, titulo,
      posto_id,
      recorrente:tarefas_recorrentes(posto_id),
      posto:postos(id, nome, codigo_empresa_externo),
      recorrente_posto:tarefas_recorrentes(posto:postos(id, nome, codigo_empresa_externo))
    `)
    .eq('categoria', 'conciliacao_bancaria')
    .in('posto_id', postoIds)
    .not('extrato_arquivo_path', 'is', null)
    .not('extrato_data', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tarefas?.length) return NextResponse.json({ verificadas: 0, divergentes: [], resolvidos: 0 })

  // 3. Carrega contas bancárias
  const { data: contasBancarias } = await admin
    .from('contas_bancarias')
    .select('posto_id, codigo_conta_externo')
    .not('codigo_conta_externo', 'is', null)

  const contaMap: Record<string, string> = {}
  for (const c of contasBancarias ?? []) {
    if (c.posto_id && !contaMap[c.posto_id]) contaMap[c.posto_id] = c.codigo_conta_externo!
  }

  // 4. Verifica divergências
  const divergentes: Array<{
    id: string; titulo: string; postoNome: string; data: string
    movExtrato: number; movAnterior: number; movAtual: number; diferenca: number
  }> = []

  let verificadas = 0
  let resolvidos  = 0

  for (const t of tarefas) {
    const posto = (t.posto as any) ?? (t.recorrente_posto as any)?.posto ?? null
    if (!posto?.codigo_empresa_externo) continue

    const postoId = t.posto_id ?? (t.recorrente as any)?.posto_id ?? posto?.id ?? null
    const empresaId = parseInt(posto.codigo_empresa_externo)
    if (isNaN(empresaId)) continue

    const contaCodigo: string | null = postoId ? (contaMap[postoId] ?? null) : null
    const dataFim = t.extrato_data as string
    const dataIni = (t.extrato_periodo_ini as string | null) ?? dataFim
    const datas   = gerarDatas(dataIni, dataFim)

    let movAtual: number
    try {
      const movtos = await buscarMovtosAutosystem(empresaId, datas)
      if (contaCodigo) {
        const entradas = movtos.filter(m => m.conta_debitar  === contaCodigo).reduce((s, m) => s + m.valor, 0)
        const saidas   = movtos.filter(m => m.conta_creditar === contaCodigo).reduce((s, m) => s + m.valor, 0)
        movAtual = parseFloat((entradas - saidas).toFixed(2))
      } else {
        movAtual = calcularMovimento(movtos, null)
      }
    } catch {
      continue
    }

    verificadas++
    const movExtrato  = (t.extrato_movimento as number)
    const movAnterior = (t.extrato_saldo_externo as number | null) ?? movAtual
    const diferenca   = parseFloat((movExtrato - movAtual).toFixed(2))
    const isOkAgora   = Math.abs(diferenca) < 0.02

    if (!isOkAgora) {
      divergentes.push({
        id: t.id,
        titulo: t.titulo ?? '',
        postoNome: posto.nome ?? '',
        data: dataFim,
        movExtrato,
        movAnterior,
        movAtual,
        diferenca,
      })
      await admin.from('tarefas').update({
        extrato_saldo_externo: movAtual,
        extrato_diferenca: diferenca,
        extrato_status: 'divergente',
      }).eq('id', t.id)
    } else {
      if ((t.extrato_status as string) === 'divergente') {
        resolvidos++
        await admin.from('tarefas').update({
          extrato_saldo_externo: movAtual,
          extrato_diferenca: 0,
          extrato_status: 'ok',
        }).eq('id', t.id)
      } else if (Math.abs(movAtual - movAnterior) > 0.02) {
        await admin.from('tarefas').update({
          extrato_saldo_externo: movAtual,
          extrato_diferenca: 0,
        }).eq('id', t.id)
      }
    }
  }

  return NextResponse.json({ verificadas, divergentes, resolvidos })
}
