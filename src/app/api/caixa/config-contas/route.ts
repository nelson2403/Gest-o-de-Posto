import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { buscarTefOperadorasDistinct } from '@/lib/autosystem'

// GET /api/caixa/config-contas
// Retorna as formas de pagamento TEF + grupos configurados
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const admin = createAdminClient()

    const { data: postos } = await admin
      .from('postos')
      .select('codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null)

    const empresaGrids = (postos ?? [])
      .map(p => Number(p.codigo_empresa_externo))
      .filter(Boolean)

    const dataIni = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const formas = empresaGrids.length
      ? await buscarTefOperadorasDistinct(empresaGrids, dataIni)
      : []

    const { data: configs } = await admin
      .from('frentista_tef_grupo')
      .select('operadora_chave, grupo')

    const configMap: Record<string, string | null> = {}
    for (const c of configs ?? []) configMap[c.operadora_chave] = c.grupo

    const resultado = formas.map(f => ({
      chave: f.chave,
      grupo: configMap[f.chave] ?? null,
    }))

    // Adiciona formas configuradas que não apareceram no TEF recente
    for (const c of configs ?? []) {
      if (!resultado.find(r => r.chave === c.operadora_chave)) {
        resultado.push({ chave: c.operadora_chave, grupo: c.grupo })
      }
    }

    resultado.sort((a, b) => a.chave.localeCompare(b.chave))

    return NextResponse.json({ formas: resultado })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/caixa/config-contas
// Body: { operadora_chave: string, grupo: string | null }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { operadora_chave, grupo } = await req.json() as {
      operadora_chave: string
      grupo:           string | null
    }

    if (!operadora_chave) return NextResponse.json({ error: 'operadora_chave obrigatório' }, { status: 400 })

    const admin = createAdminClient()

    if (grupo === null) {
      await admin.from('frentista_tef_grupo').delete().eq('operadora_chave', operadora_chave)
    } else {
      await admin.from('frentista_tef_grupo').upsert({
        operadora_chave,
        grupo,
        atualizado_em:  new Date().toISOString(),
        atualizado_por: user.id,
      }, { onConflict: 'operadora_chave' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
