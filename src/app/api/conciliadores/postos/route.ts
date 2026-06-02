import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// POST /api/conciliadores/postos
// Salva os postos/bancos de um conciliador usando admin client (bypassa RLS)
export async function POST(req: NextRequest) {
  // Verifica sessão e permissão
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: me } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  if (!me || !['master', 'adm_financeiro'].includes(me.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const { conciliadorId, empresaId, postosEmpresa, postosAtivos, bancosAtivos, contasPorPosto } = body

  if (!conciliadorId || !empresaId) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Desativa legado (sem posto_id)
  const { error: err1 } = await admin
    .from('tarefas_recorrentes')
    .update({ ativo: false })
    .eq('usuario_id', conciliadorId)
    .is('posto_id', null)
  if (err1) console.error('[conciliadores/postos] desativa legado:', err1.message)

  // 2. Lê existentes
  const { data: existentes, error: err2 } = await admin
    .from('tarefas_recorrentes')
    .select('id, posto_id, conta_bancaria_id, ativo')
    .eq('usuario_id', conciliadorId)
    .not('posto_id', 'is', null)

  if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })

  const existentesMap = new Map<string, { id: string; ativo: boolean }>(
    (existentes ?? []).map((r: any) => [
      `${r.posto_id}:${r.conta_bancaria_id ?? 'null'}`,
      { id: r.id, ativo: r.ativo },
    ])
  )

  const erros: string[] = []
  const ops: PromiseLike<unknown>[] = []

  for (const posto of (postosEmpresa as { id: string; nome: string }[])) {
    const postoMarcado = (postosAtivos as string[]).includes(posto.id)
    const contas: { id: string; banco: string }[] = contasPorPosto[posto.id] ?? []

    if (contas.length === 0) {
      // Legado: uma tarefa por posto sem banco
      const key    = `${posto.id}:null`
      const existe = existentesMap.get(key)
      if (postoMarcado && !existe) {
        ops.push(
          admin.from('tarefas_recorrentes').insert({
            empresa_id: empresaId, usuario_id: conciliadorId,
            posto_id: posto.id,
            titulo:   `Conciliação Sicoob — ${posto.nome}`,
            descricao: `Conciliar o extrato Sicoob do posto ${posto.nome}.`,
            categoria: 'conciliacao_bancaria', prioridade: 'alta',
            carencia_dias: 4, tolerancia_dias: 1, ativo: true,
          }).then(({ error }: any) => {
            if (error) erros.push(`INSERT ${posto.nome}: ${error.message}`)
          })
        )
      } else if (postoMarcado && existe && !existe.ativo) {
        ops.push(
          admin.from('tarefas_recorrentes').update({ ativo: true }).eq('id', existe.id)
            .then(({ error }: any) => { if (error) erros.push(`UPDATE ativo ${posto.nome}: ${error.message}`) })
        )
      } else if (!postoMarcado && existe?.ativo) {
        ops.push(
          admin.from('tarefas_recorrentes').update({ ativo: false }).eq('id', existe.id)
            .then(({ error }: any) => { if (error) erros.push(`UPDATE inativo ${posto.nome}: ${error.message}`) })
        )
      }
    } else {
      // Multi-banco: uma tarefa por banco
      for (const conta of contas) {
        const bancoKey    = `${posto.id}:${conta.id}`
        const bancoMarcado = postoMarcado && (bancosAtivos as string[]).includes(bancoKey)
        const existe       = existentesMap.get(`${posto.id}:${conta.id}`)

        if (bancoMarcado && !existe) {
          ops.push(
            admin.from('tarefas_recorrentes').insert({
              empresa_id: empresaId, usuario_id: conciliadorId,
              posto_id: posto.id, conta_bancaria_id: conta.id, banco: conta.banco,
              titulo:   `Conciliação ${conta.banco} — ${posto.nome}`,
              descricao: `Conciliar o extrato ${conta.banco} do posto ${posto.nome}.`,
              categoria: 'conciliacao_bancaria', prioridade: 'alta',
              carencia_dias: 4, tolerancia_dias: 1, ativo: true,
            }).then(({ error }: any) => {
              if (error) erros.push(`INSERT ${conta.banco} ${posto.nome}: ${error.message}`)
            })
          )
        } else if (bancoMarcado && existe && !existe.ativo) {
          ops.push(
            admin.from('tarefas_recorrentes').update({ ativo: true }).eq('id', existe.id)
              .then(({ error }: any) => { if (error) erros.push(`UPDATE ativo ${conta.banco} ${posto.nome}: ${error.message}`) })
          )
        } else if (!bancoMarcado && existe?.ativo) {
          ops.push(
            admin.from('tarefas_recorrentes').update({ ativo: false }).eq('id', existe.id)
              .then(({ error }: any) => { if (error) erros.push(`UPDATE inativo ${conta.banco} ${posto.nome}: ${error.message}`) })
          )
        }
      }
    }
  }

  await Promise.all(ops)

  if (erros.length > 0) {
    console.error('[conciliadores/postos] erros:', erros)
    return NextResponse.json({ error: erros.join('; ') }, { status: 500 })
  }

  // Fix de tarefas após troca de posto (não critico — ignora erro)
  try { await admin.rpc('fix_tarefas_apos_troca_posto') } catch { /* não crítico */ }

  return NextResponse.json({ ok: true })
}
