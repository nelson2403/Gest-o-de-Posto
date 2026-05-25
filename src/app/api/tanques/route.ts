import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const postoNomeParam = searchParams.get('posto_nome')
  const data = searchParams.get('data') ?? new Date().toISOString().slice(0, 10)

  const { data: usuarioRow } = await admin.from('usuarios').select('role, posto_fechamento_id').eq('id', user.id).single()
  const userRole = usuarioRow?.role ?? ''

  let q = admin.from('tanques_postos').select('*').eq('ativo', true).order('posto_nome').order('ordem')

  if (postoNomeParam) {
    q = q.ilike('posto_nome', postoNomeParam)
  } else if (['master', 'adm_transpombal'].includes(userRole)) {
    // vê todos
  } else {
    if (usuarioRow?.posto_fechamento_id) {
      const usr = usuarioRow
      const { data: porId } = await admin
        .from('tanques_postos').select('*').eq('ativo', true).eq('posto_id', usr.posto_fechamento_id).order('ordem')

      if (porId && porId.length > 0) {
        const ids = porId.map(t => t.id)
        const { data: medicoes } = await admin
          .from('medicoes_tanques')
          .select('tanque_id, medida_litros, criado_em, usuario_id')
          .in('tanque_id', ids)
          .eq('data', data)

        const medicaoMap = new Map((medicoes ?? []).map(m => [m.tanque_id, m]))

        // Busca nomes dos usuários que salvaram
        const userIds = [...new Set((medicoes ?? []).map(m => m.usuario_id).filter(Boolean))]
        const nomeMap: Record<string, string> = {}
        if (userIds.length) {
          const { data: users } = await admin.from('usuarios').select('id, nome').in('id', userIds)
          for (const u of users ?? []) nomeMap[u.id] = u.nome
        }

        const result = porId.map(t => {
          const med = medicaoMap.get(t.id)
          return {
            ...t,
            medida_litros: med?.medida_litros ?? null,
            criado_em:     med?.criado_em     ?? null,
            salvo_por:     med?.usuario_id ? (nomeMap[med.usuario_id] ?? null) : null,
          }
        })
        const porPosto: Record<string, typeof result> = {}
        for (const t of result) {
          if (!porPosto[t.posto_nome]) porPosto[t.posto_nome] = []
          porPosto[t.posto_nome].push(t)
        }
        return NextResponse.json({ tanques: result, porPosto, data })
      }

      const { data: posto } = await admin.from('postos').select('nome').eq('id', usr.posto_fechamento_id).single()
      if (posto?.nome) {
        const nome = posto.nome.trim()
        const nomeLimpo = nome.replace(/^posto\s+/i, '').trim()
        q = q.or(`posto_nome.ilike.${nome},posto_nome.ilike.${nomeLimpo},posto_nome.ilike.%${nomeLimpo}%`)
      }
    }
  }

  const { data: tanques, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (tanques ?? []).map(t => t.id)
  const { data: medicoes } = ids.length
    ? await admin
        .from('medicoes_tanques')
        .select('tanque_id, medida_litros, criado_em, usuario_id')
        .in('tanque_id', ids)
        .eq('data', data)
    : { data: [] }

  const medicaoMap = new Map((medicoes ?? []).map(m => [m.tanque_id, m]))

  // Busca nomes dos usuários
  const userIds = [...new Set((medicoes ?? []).map(m => m.usuario_id).filter(Boolean))]
  const nomeMap: Record<string, string> = {}
  if (userIds.length) {
    const { data: users } = await admin.from('usuarios').select('id, nome').in('id', userIds)
    for (const u of users ?? []) nomeMap[u.id] = u.nome
  }

  const result = (tanques ?? []).map(t => {
    const med = medicaoMap.get(t.id)
    return {
      ...t,
      medida_litros: med?.medida_litros ?? null,
      criado_em:     med?.criado_em     ?? null,
      salvo_por:     med?.usuario_id ? (nomeMap[med.usuario_id] ?? null) : null,
    }
  })

  const porPosto: Record<string, typeof result> = {}
  for (const t of result) {
    if (!porPosto[t.posto_nome]) porPosto[t.posto_nome] = []
    porPosto[t.posto_nome].push(t)
  }

  return NextResponse.json({ tanques: result, porPosto, data })
}
