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
  const body = await req.json().catch(() => ({})) as Partial<{
    nome: string
    period_start: string   // YYYY-MM-DD — sobrescreve o período do grupo E das metas
    period_end:   string
    // IDs das metas do grupo origem a incluir na duplicação. Vazio/omitido
    // = todas. Permite ao usuário DESMARCAR metas que não quer trazer.
    metas_incluir_ids: string[]
    // IDs das metas que devem preservar valor_meta ao invés de zerar. Útil
    // pra metas que não mudam mês a mês (mix, margem, etc.).
    metas_preservar_valor_ids: string[]
  }>

  // Se o cliente enviou um período, propagamos para o grupo E para todas
  // as metas duplicadas. Caso contrário, herda do origem (compat com o
  // comportamento anterior). Ambos ou nenhum — não faz sentido enviar só
  // um dos dois.
  if ((body.period_start && !body.period_end) || (!body.period_start && body.period_end)) {
    return NextResponse.json({ error: 'period_start e period_end devem vir juntos' }, { status: 400 })
  }
  if (body.period_start && body.period_end && body.period_end < body.period_start) {
    return NextResponse.json({ error: 'period_end deve ser >= period_start' }, { status: 400 })
  }

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
  const periodStart = body.period_start ?? grupoOrigem.period_start
  const periodEnd   = body.period_end   ?? grupoOrigem.period_end
  const { data: novoGrupo, error: erNovoGrupo } = await admin
    .from('comissio_metas_grupos')
    .insert({
      posto_id:     grupoOrigem.posto_id,
      parent_id:    grupoOrigem.parent_id,
      nome:         novoNome,
      period_start: periodStart,
      period_end:   periodEnd,
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

  // 4. Cria cópias das metas — filtra por metas_incluir_ids e preserva
  //    valor apenas nas escolhidas em metas_preservar_valor_ids.
  const incluirSet = Array.isArray(body.metas_incluir_ids) && body.metas_incluir_ids.length > 0
    ? new Set(body.metas_incluir_ids)
    : null   // null = todas
  const preservarSet = new Set(Array.isArray(body.metas_preservar_valor_ids) ? body.metas_preservar_valor_ids : [])
  const metasAIncluir = (metasOrigem ?? []).filter(m => !incluirSet || incluirSet.has(m.id as string))

  let metasCriadas = 0
  if (metasAIncluir.length > 0) {
    const novasMetas = metasAIncluir.map(m => ({
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
      // Preserva valor_meta APENAS quando o cliente marcou essa meta
      // como "manter valor" — caso contrário, zera pra usuário preencher.
      valor_meta:   preservarSet.has(m.id as string) ? Number(m.valor_meta) : 0,
      // Se o cliente passou período novo, replica em todas as metas — assim
      // um grupo "Mês 06/2026" duplicado de "Mês 05/2026" já entra com as
      // metas apontando pra Junho, sem precisar editar meta por meta.
      period_start: periodStart,
      period_end:   periodEnd,
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
