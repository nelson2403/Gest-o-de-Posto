import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// POST /api/comissionamento/regras/[id]/duplicar
//
// Duplica uma regra. A cópia:
//   • herda todos os campos (condições, escopos, filtros, meta_referencia_id,
//     modo/tipo/valor do ENTÃO, etc.)
//   • ganha nome "{nome} (cópia)"
//   • entra como 'rascunho' — o usuário revisa e ativa manualmente para
//     evitar duplicação silenciosa da mesma regra pagando 2× por engano
//   • recebe prioridade = MAX(prioridade do esquema) + 1 pra ficar
//     visível no final da lista sem colidir com regras existentes
//
// Fica no MESMO esquema da regra original.

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: origemId } = await ctx.params
  const admin = createAdminClient()

  // 1. Carrega regra origem
  const { data: origem, error: erOrigem } = await admin
    .from('comissio_regras')
    .select('*')
    .eq('id', origemId)
    .single()
  if (erOrigem || !origem) {
    return NextResponse.json({ error: 'Regra origem não encontrada' }, { status: 404 })
  }

  // 2. Descobre a próxima prioridade no esquema
  const { data: maxRow } = await admin
    .from('comissio_regras')
    .select('prioridade')
    .eq('esquema_id', origem.esquema_id)
    .order('prioridade', { ascending: false })
    .limit(1)
    .maybeSingle()
  const proximaPrioridade = Number(maxRow?.prioridade ?? origem.prioridade ?? 0) + 1

  // 3. Cria cópia
  const { data: nova, error: erInsert } = await admin
    .from('comissio_regras')
    .insert({
      esquema_id:           origem.esquema_id,
      nome:                 `${origem.nome} (cópia)`,
      descricao:            origem.descricao,
      status:               'rascunho',
      prioridade:           proximaPrioridade,
      condicoes:            origem.condicoes,
      resultado_tipo:       origem.resultado_tipo,
      resultado_modo:       origem.resultado_modo,
      resultado_valor:      origem.resultado_valor,
      resultado_base_valor: origem.resultado_base_valor,
      escopo_tipo:          origem.escopo_tipo,
      escopo_valor:         origem.escopo_valor,
      meta_referencia_id:   origem.meta_referencia_id,
      meta_referencia_nome: origem.meta_referencia_nome,
      checklist_template_referencia_id: origem.checklist_template_referencia_id,
      realizado_filtros:    origem.realizado_filtros,
      realizado_campo:      origem.realizado_campo,
      base_filtros:         origem.base_filtros,
      base_campo:           origem.base_campo,
      realizado_escopo:     origem.realizado_escopo,
      base_escopo:          origem.base_escopo,
      criado_por:           user.id,
    })
    .select()
    .single()

  if (erInsert || !nova) {
    return NextResponse.json({ error: erInsert?.message ?? 'Falha ao duplicar' }, { status: 500 })
  }

  return NextResponse.json({ regra: nova })
}
