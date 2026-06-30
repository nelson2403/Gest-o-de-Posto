import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// POST /api/comissionamento/metas/grupos/[id]/duplicar
//
// Duplica um grupo de metas. O novo grupo nasce com:
//   • nome: "{nome original} (cópia)" — ou body.nome se fornecido
//   • mesmo posto_id, parent_id, period_start/end e sort_order do original
//
// Para cada meta do grupo original cria uma cópia COM:
//   • mesmos: nome, campo, filtros, período, mix_*
//   • valor_meta = 0 (zera — usuário preenche depois)
// SEM copiar splits (distribuição entre vendedores).

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: grupoOrigemId } = await ctx.params
  const body = await req.json().catch(() => ({})) as Partial<{ nome: string }>

  const admin = createAdminClient()

  // 1. Lê o grupo origem
  const { data: grupoOrigem, error: erGrupo } = await admin
    .from('comissio_metas_grupos')
    .select('*')
    .eq('id', grupoOrigemId)
    .single()
  if (erGrupo || !grupoOrigem) {
    return NextResponse.json({ error: 'Grupo origem não encontrado' }, { status: 404 })
  }

  // 2. Cria o novo grupo
  const novoNome = body.nome?.trim() || `${grupoOrigem.nome} (cópia)`
  const { data: novoGrupo, error: erNovoGrupo } = await admin
    .from('comissio_metas_grupos')
    .insert({
      posto_id:     grupoOrigem.posto_id,
      parent_id:    grupoOrigem.parent_id,
      nome:         novoNome,
      period_start: grupoOrigem.period_start,
      period_end:   grupoOrigem.period_end,
      sort_order:   (grupoOrigem.sort_order ?? 0) + 1,
      criado_por:   user.id,
    })
    .select()
    .single()
  if (erNovoGrupo || !novoGrupo) {
    return NextResponse.json({ error: erNovoGrupo?.message ?? 'Falha ao criar grupo' }, { status: 500 })
  }

  // 3. Lê metas do grupo origem
  const { data: metasOrigem, error: erMetas } = await admin
    .from('comissio_metas')
    .select('*')
    .eq('grupo_id', grupoOrigemId)
  if (erMetas) {
    return NextResponse.json({ error: erMetas.message }, { status: 500 })
  }

  // 4. Cria cópias das metas zerando valor_meta e sem splits
  let metasCriadas = 0
  if (metasOrigem && metasOrigem.length > 0) {
    const novasMetas = metasOrigem.map(m => ({
      posto_id:     m.posto_id,
      grupo_id:     novoGrupo.id,
      nome:         m.nome,
      campo:        m.campo,
      filtros:      m.filtros,
      filtro_tipo:    m.filtro_tipo,
      filtro_valores: m.filtro_valores,
      filtro_modo:    m.filtro_modo,
      mix_numerador_categoria_id:   m.mix_numerador_categoria_id,
      mix_denominador_categoria_id: m.mix_denominador_categoria_id,
      mix_numerador:                m.mix_numerador,
      mix_denominador:              m.mix_denominador,
      // Zera valor_meta — o usuário define o novo target depois
      valor_meta:   0,
      period_start: m.period_start,
      period_end:   m.period_end,
      criado_por:   user.id,
    }))
    const { error: erInsert, count } = await admin
      .from('comissio_metas')
      .insert(novasMetas, { count: 'exact' })
    if (erInsert) {
      // Se falhar a inserção das metas, remove o grupo recém-criado para
      // não deixar lixo. Se a remoção falhar também, ainda informamos o erro
      // original ao usuário — o grupo vazio é manualmente removível.
      await admin.from('comissio_metas_grupos').delete().eq('id', novoGrupo.id)
      return NextResponse.json({ error: erInsert.message }, { status: 500 })
    }
    metasCriadas = count ?? novasMetas.length
  }

  return NextResponse.json({ grupo: novoGrupo, metas_criadas: metasCriadas })
}
