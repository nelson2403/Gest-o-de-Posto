import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// POST /api/comissionamento/metas/grupos/[id]/duplicar-rede
//
// Duplica um grupo de metas em VÁRIOS postos de uma vez — os postos
// vinculados a um esquema informado. Uso típico: criar as metas do mês
// novo em todas as empresas da rede em 1 clique.
//
// Body:
//   nome        (obrigatório) — nome do novo grupo em TODOS os postos
//   esquema_id  (obrigatório) — restringe os postos alvo aos vinculados
//                a esse esquema. Cliente valida antes que o posto do
//                grupo origem está mesmo no esquema (evita replicar
//                pra empresas que não compartilham o esquema).
//   posto_ids   (opcional)   — subset de postos-alvo. Sem esse campo,
//                usa TODOS os postos do esquema. Sempre inclui os postos
//                válidos e ignora os que não estão no esquema.
//
// Para cada posto alvo:
//   • cria um novo grupo
//   • copia as metas do grupo origem preservando estrutura (nome, campo,
//     filtros, período, mix_*) mas ZERANDO valor_meta e SEM splits
//     (mesma política do /duplicar simples)
//
// Retorna um resumo por posto: {posto_id, posto_nome, grupo_novo_id,
// metas_criadas, erro?} — postos que falham individualmente NÃO derrubam
// o processo; ficam com {erro} para o usuário revisar.

interface Ctx { params: Promise<{ id: string }> }
interface Body {
  nome?:         string
  esquema_id?:   string
  posto_ids?:    string[]
  period_start?: string   // YYYY-MM-DD — sobrescreve o período do grupo E das metas
  period_end?:   string
  // Metas a incluir na duplicação (subset). Vazio/omitido = todas.
  metas_incluir_ids?: string[]
  // Metas cujo valor_meta original deve ser preservado (senão, zera).
  metas_preservar_valor_ids?: string[]
}
interface PostoResumo {
  posto_id:      string
  posto_nome:    string
  grupo_novo_id: string | null
  metas_criadas: number
  erro?:         string
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: origemId } = await ctx.params
  const body = await req.json().catch(() => ({})) as Body
  const nomeGrupoNovo = body.nome?.trim()
  const esquemaId = body.esquema_id?.trim()

  if (!nomeGrupoNovo) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  if (!esquemaId)     return NextResponse.json({ error: 'esquema_id é obrigatório' }, { status: 400 })
  if ((body.period_start && !body.period_end) || (!body.period_start && body.period_end)) {
    return NextResponse.json({ error: 'period_start e period_end devem vir juntos' }, { status: 400 })
  }
  if (body.period_start && body.period_end && body.period_end < body.period_start) {
    return NextResponse.json({ error: 'period_end deve ser >= period_start' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Lê grupo origem
  const { data: origem, error: erG } = await admin
    .from('comissio_metas_grupos')
    .select('*')
    .eq('id', origemId)
    .single()
  if (erG || !origem) return NextResponse.json({ error: 'Grupo origem não encontrado' }, { status: 404 })

  // 2. Postos alvo — vinculados ao esquema
  const { data: vinculos, error: erV } = await admin
    .from('comissio_esquema_postos')
    .select('posto_id')
    .eq('esquema_id', esquemaId)
  if (erV) return NextResponse.json({ error: erV.message }, { status: 500 })
  let postoIdsAlvo = Array.from(new Set((vinculos ?? []).map(v => v.posto_id as string)))

  // Se posto_ids foi passado, intersecta pra manter só os válidos
  if (Array.isArray(body.posto_ids) && body.posto_ids.length > 0) {
    const set = new Set(body.posto_ids)
    postoIdsAlvo = postoIdsAlvo.filter(id => set.has(id))
  }
  if (postoIdsAlvo.length === 0) {
    return NextResponse.json({ error: 'Nenhum posto válido para replicar (esquema sem postos vinculados)' }, { status: 400 })
  }

  // 3. Metas do grupo origem — 1 read só, replicado para cada posto alvo
  const { data: metasOrigem, error: erM } = await admin
    .from('comissio_metas')
    .select('*')
    .eq('grupo_id', origemId)
  if (erM) return NextResponse.json({ error: erM.message }, { status: 500 })

  // 4. Nomes dos postos alvo (pra retornar no resumo)
  const { data: postosData } = await admin
    .from('postos')
    .select('id, nome')
    .in('id', postoIdsAlvo)
  const nomePorPosto = new Map<string, string>()
  for (const p of postosData ?? []) nomePorPosto.set(p.id as string, p.nome as string)

  // Se o cliente enviou período novo, propagamos para o grupo E para as
  // metas — o duplicado costuma ser pra "próximo mês", faz sentido que as
  // metas também apontem pro período novo (não pro período antigo).
  const periodStart = body.period_start ?? origem.period_start
  const periodEnd   = body.period_end   ?? origem.period_end

  // Filtros de metas a incluir / preservar valor. IDs são das metas do
  // GRUPO ORIGEM. Como estamos replicando pra vários postos, aplicamos o
  // mesmo filtro para cada posto — a "meta X do origem" gera "meta X" em
  // cada empresa alvo com a mesma decisão (incluir / preservar).
  const incluirSet = Array.isArray(body.metas_incluir_ids) && body.metas_incluir_ids.length > 0
    ? new Set(body.metas_incluir_ids)
    : null
  const preservarSet = new Set(Array.isArray(body.metas_preservar_valor_ids) ? body.metas_preservar_valor_ids : [])
  const metasAIncluir = (metasOrigem ?? []).filter(m => !incluirSet || incluirSet.has(m.id as string))

  // 5. Para cada posto alvo: cria grupo + copia metas. Falha individual
  //    vira {erro} no resumo, não derruba o batch. Rollback do próprio
  //    grupo quando a inserção de metas falha (mesma política do /duplicar).
  const resumo: PostoResumo[] = []
  for (const pid of postoIdsAlvo) {
    const nomePosto = nomePorPosto.get(pid) ?? '(sem nome)'
    try {
      const { data: novoGrupo, error: erC } = await admin
        .from('comissio_metas_grupos')
        .insert({
          posto_id:     pid,
          parent_id:    null,
          nome:         nomeGrupoNovo,
          period_start: periodStart,
          period_end:   periodEnd,
          sort_order:   (origem.sort_order ?? 0) + 1,
          criado_por:   user.id,
        })
        .select()
        .single()
      if (erC || !novoGrupo) throw new Error(erC?.message ?? 'falha ao criar grupo')

      let metasCriadas = 0
      if (metasAIncluir.length > 0) {
        const novasMetas = metasAIncluir.map(m => ({
          posto_id:     pid,                              // ← empresa alvo
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
          checklist_template_id:        m.checklist_template_id,
          // Preserva valor original apenas quando marcado pelo usuário;
          // caso contrário, zera. Decisão vale pra TODOS os postos da rede.
          valor_meta:   preservarSet.has(m.id as string) ? Number(m.valor_meta) : 0,
          period_start: periodStart,                      // ← herda do input do modal
          period_end:   periodEnd,
          criado_por:   user.id,
        }))
        const { error: erI, count } = await admin
          .from('comissio_metas')
          .insert(novasMetas, { count: 'exact' })
        if (erI) {
          await admin.from('comissio_metas_grupos').delete().eq('id', novoGrupo.id)
          throw new Error(erI.message)
        }
        metasCriadas = count ?? novasMetas.length
      }

      resumo.push({ posto_id: pid, posto_nome: nomePosto, grupo_novo_id: novoGrupo.id, metas_criadas: metasCriadas })
    } catch (e) {
      resumo.push({
        posto_id: pid, posto_nome: nomePosto,
        grupo_novo_id: null, metas_criadas: 0,
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const grupos_criados = resumo.filter(r => r.grupo_novo_id).length
  const metas_criadas_total = resumo.reduce((s, r) => s + r.metas_criadas, 0)
  const erros = resumo.filter(r => r.erro).length

  return NextResponse.json({
    grupos_criados,
    metas_criadas_total,
    erros,
    postos: resumo,
  })
}
