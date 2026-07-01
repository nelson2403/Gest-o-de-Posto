import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MetaCampo, MetaFiltro, MetaModo, MetaFiltroRegra } from '../route'
import { validarFiltros } from '../route'

const CAMPOS_VALIDOS:  readonly MetaCampo[]  = ['faturamento','quantidade','margem','mix','markup','checklist']
const FILTROS_VALIDOS: readonly MetaFiltro[] = ['produto','grupo_produto','subgrupo_produto','produto_tipo']
const MODOS_VALIDOS:   readonly MetaModo[]   = ['incluir','excluir']

// ─── GET — uma meta + splits ────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [metaResp, splitsResp] = await Promise.all([
    admin.from('comissio_metas').select('*').eq('id', id).single(),
    admin
      .from('comissio_metas_splits')
      .select('id, meta_id, membro_id, valor_meta, comissio_membros:membro_id (nome, role)')
      .eq('meta_id', id),
  ])

  if (metaResp.error || !metaResp.data) {
    return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 })
  }

  const splits = (splitsResp.data ?? []).map((s: any) => ({
    id:         s.id,
    meta_id:    s.meta_id,
    membro_id:  s.membro_id,
    membro_nome: s.comissio_membros?.nome ?? '',
    membro_role: s.comissio_membros?.role ?? null,
    valor_meta: Number(s.valor_meta),
  }))

  return NextResponse.json({ meta: metaResp.data, splits })
}

// ─── PATCH — atualiza meta ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<{
    grupo_id:        string | null
    nome:            string
    campo:           MetaCampo
    filtros:         unknown
    filtro_tipo:     MetaFiltro | null
    filtro_valores:  string[] | null
    filtro_modo:     MetaModo
    mix_numerador_categoria_id:   string | null
    mix_denominador_categoria_id: string | null
    mix_numerador:   string[] | null
    mix_denominador: string[] | null
    checklist_template_id: string | null
    valor_meta:      number
    period_start:    string
    period_end:      string
  }>

  const updates: Record<string, unknown> = {}
  if (body.grupo_id !== undefined) updates.grupo_id = body.grupo_id
  if (body.nome !== undefined) {
    if (!body.nome.trim()) return NextResponse.json({ error: 'nome não pode ser vazio' }, { status: 400 })
    updates.nome = body.nome.trim()
  }
  if (body.campo !== undefined) {
    if (!CAMPOS_VALIDOS.includes(body.campo)) {
      return NextResponse.json({ error: `campo inválido — use ${CAMPOS_VALIDOS.join(', ')}` }, { status: 400 })
    }
    updates.campo = body.campo
  }
  // Filtros (novo formato — lista de regras)
  let filtrosValidados: MetaFiltroRegra[] | undefined
  if (body.filtros !== undefined) {
    const v = validarFiltros(body.filtros)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    filtrosValidados = v.value
    updates.filtros = filtrosValidados
    // Mantém legados sincronizados c/ o primeiro filtro (compatibilidade)
    if (filtrosValidados.length === 1) {
      updates.filtro_tipo    = filtrosValidados[0].tipo
      updates.filtro_valores = filtrosValidados[0].valores
      updates.filtro_modo    = filtrosValidados[0].modo
    } else {
      updates.filtro_tipo    = null
      updates.filtro_valores = null
      updates.filtro_modo    = 'incluir'
    }
  }
  // Aceita ainda os campos legados quando `filtros` não vier no body (não
  // sobrescreve `filtros` neste caso para não perder configuração avançada).
  if (filtrosValidados === undefined) {
    if (body.filtro_tipo !== undefined) {
      if (body.filtro_tipo && !FILTROS_VALIDOS.includes(body.filtro_tipo)) {
        return NextResponse.json({ error: `filtro_tipo inválido` }, { status: 400 })
      }
      updates.filtro_tipo = body.filtro_tipo
    }
    if (body.filtro_valores !== undefined) updates.filtro_valores = body.filtro_valores
    if (body.filtro_modo !== undefined) {
      if (!MODOS_VALIDOS.includes(body.filtro_modo)) {
        return NextResponse.json({ error: `filtro_modo inválido` }, { status: 400 })
      }
      updates.filtro_modo = body.filtro_modo
    }
  }
  if (body.mix_numerador_categoria_id   !== undefined) updates.mix_numerador_categoria_id   = body.mix_numerador_categoria_id   || null
  if (body.mix_denominador_categoria_id !== undefined) updates.mix_denominador_categoria_id = body.mix_denominador_categoria_id || null
  if (body.mix_numerador !== undefined) {
    updates.mix_numerador = Array.isArray(body.mix_numerador) ? body.mix_numerador.map(v => String(v)) : null
  }
  if (body.mix_denominador !== undefined) {
    updates.mix_denominador = Array.isArray(body.mix_denominador) ? body.mix_denominador.map(v => String(v)) : null
  }
  // Se o campo da meta deixa de ser 'mix', zera os mix_*
  if (body.campo !== undefined && body.campo !== 'mix') {
    updates.mix_numerador_categoria_id   = null
    updates.mix_denominador_categoria_id = null
    updates.mix_numerador   = null
    updates.mix_denominador = null
  }
  if (body.checklist_template_id !== undefined) updates.checklist_template_id = body.checklist_template_id || null
  // Se o campo deixa de ser 'checklist', zera o template_id
  if (body.campo !== undefined && body.campo !== 'checklist') {
    updates.checklist_template_id = null
  }
  if (body.valor_meta !== undefined)   updates.valor_meta   = Number(body.valor_meta)
  if (body.period_start !== undefined) updates.period_start = body.period_start
  if (body.period_end !== undefined)   updates.period_end   = body.period_end

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comissio_metas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Meta não encontrada' }, { status: 404 })
  return NextResponse.json({ meta: data })
}

// ─── DELETE — remove meta (cascade nos splits) ──────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin.from('comissio_metas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
