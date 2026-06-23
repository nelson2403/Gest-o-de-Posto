import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// POST /api/contabil/plano-contas/importar
//   body: {
//     limpar?: boolean          // se true, apaga o plano atual antes de inserir
//     linhas: { codigo: string; descricao?: string }[]
//   }
//
// Faz upsert por codigo (lower). Em conflito, atualiza a descricao.
// Linhas com codigo vazio são ignoradas. Codigos duplicados dentro do
// próprio payload — o último ganha.

interface LinhaIn { codigo: string; descricao?: string }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const limpar = Boolean(body.limpar)
  const linhasIn: LinhaIn[] = Array.isArray(body.linhas) ? body.linhas : []

  // Sanitiza, deduplica por codigo (lower) — último ganha
  const porCodigo = new Map<string, { codigo: string; descricao: string }>()
  for (const l of linhasIn) {
    const codigo = String(l?.codigo ?? '').trim()
    if (!codigo) continue
    const descricao = String(l?.descricao ?? '').trim()
    porCodigo.set(codigo.toLowerCase(), { codigo, descricao })
  }
  const dedupd = Array.from(porCodigo.values())

  if (!dedupd.length) {
    return NextResponse.json({ error: 'Nenhuma linha válida para importar' }, { status: 400 })
  }

  if (limpar) {
    const { error: erDel } = await supabase
      .from('contabil_plano_contas')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (erDel) return NextResponse.json({ error: `Falha ao limpar: ${erDel.message}` }, { status: 500 })
  }

  // Upsert em chunks de 500 (limit conservador do PostgREST)
  const CHUNK = 500
  let inseridas = 0
  for (let i = 0; i < dedupd.length; i += CHUNK) {
    const slice = dedupd.slice(i, i + CHUNK).map(d => ({
      codigo:     d.codigo,
      descricao:  d.descricao,
      criado_por: user.id,
    }))
    const { error, count } = await supabase
      .from('contabil_plano_contas')
      .upsert(slice, { onConflict: 'codigo', count: 'exact' })
    if (error) return NextResponse.json({ error: `Lote ${i}: ${error.message}` }, { status: 500 })
    inseridas += count ?? slice.length
  }

  return NextResponse.json({
    ok: true,
    total_recebidas: linhasIn.length,
    total_validas:   dedupd.length,
    total_gravadas:  inseridas,
  })
}
