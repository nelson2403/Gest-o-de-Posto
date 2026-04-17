import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — lista todas as contas 1.3.* do AUTOSYSTEM + vinculação atual
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Postos com código externo para filtrar apenas empresas ativas
  const { data: postos } = await admin
    .from('postos')
    .select('codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)

  const empresaIds = (postos ?? []).map(p => p.codigo_empresa_externo).filter(Boolean).map(Number)
  if (!empresaIds.length) return NextResponse.json({ contas: [] })

  // Vinculações já salvas no Supabase
  const { data: grupos } = await admin.from('cr_contas_grupo').select('*')
  const grupoMap: Record<string, { grupo: string; conta_nome: string | null }> = {}
  for (const g of grupos ?? []) grupoMap[g.conta_debitar] = { grupo: g.grupo, conta_nome: g.conta_nome }

  // Busca contas 1.3.* distintas que têm movimentos nas empresas ativas (via mirror)
  const { data: movtoContas, error } = await admin
    .from('as_movto')
    .select('conta_debitar')
    .like('conta_debitar', '1.3.%')
    .in('empresa', empresaIds)
    .gte('vencto', '2026-01-01')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Distinct conta_debitar + lookup nome
  const { data: contasData } = await admin.from('as_conta').select('codigo, nome').like('codigo', '1.3.%')
  const contaLookup: Record<string, string> = {}
  for (const c of contasData ?? []) contaLookup[c.codigo] = c.nome ?? ''

  const contasDistinct = [...new Set((movtoContas ?? []).map(m => m.conta_debitar).filter(Boolean))]
    .sort()
    .map(cod => ({
      conta_debitar: cod,
      conta_nome:    contaLookup[cod ?? ''] ?? cod,
      grupo:         grupoMap[cod ?? '']?.grupo ?? null,
    }))

  // Motivos fixos de caixa (chave motivo:GRID)
  const MOTIVOS_KEYS = ['motivo:6706', 'motivo:29771151', 'motivo:55142291']
  const motivos = MOTIVOS_KEYS.map(key => ({
    conta_debitar: key,
    conta_nome:    grupoMap[key]?.conta_nome ?? key,
    grupo:         grupoMap[key]?.grupo ?? null,
  }))

  return NextResponse.json({ contas: contasDistinct, motivos })
}

// POST — salva/atualiza vinculação conta → grupo
// Body: { conta_debitar: string, conta_nome: string, grupo: string | null }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { conta_debitar, conta_nome, grupo } = body as {
    conta_debitar: string; conta_nome: string; grupo: string | null
  }

  if (!conta_debitar) return NextResponse.json({ error: 'conta_debitar obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  if (!grupo) {
    // Remove vinculação
    await admin.from('cr_contas_grupo').delete().eq('conta_debitar', conta_debitar)
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin.from('cr_contas_grupo').upsert({
    conta_debitar,
    conta_nome,
    grupo,
    atualizado_em:  new Date().toISOString(),
    atualizado_por: user.id,
  }, { onConflict: 'conta_debitar' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
