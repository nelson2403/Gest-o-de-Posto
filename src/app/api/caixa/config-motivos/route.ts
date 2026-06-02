import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarMotivosLanctoFrentista } from '@/lib/autosystem'
import { createClient } from '@/lib/supabase/server'

// GET /api/caixa/config-motivos
// Retorna todos os motivos usados nos lanctos dos postos + configuração de grupos
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const admin = createAdminClient()

    // Empresas externas dos postos
    const { data: postos } = await admin
      .from('postos')
      .select('codigo_empresa_externo')
      .not('codigo_empresa_externo', 'is', null)

    const empresaGrids = (postos ?? [])
      .map(p => Number(p.codigo_empresa_externo))
      .filter(Boolean)

    // Motivos do AUTOSYSTEM (últimos 90 dias)
    const dataIni = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const motivos = empresaGrids.length
      ? await buscarMotivosLanctoFrentista(empresaGrids, dataIni)
      : []

    // Configuração salva no Supabase
    const { data: configs } = await admin
      .from('frentista_motivo_grupo')
      .select('motivo_grid, grupo, motivo_nome')

    const configMap: Record<number, string | null> = {}
    for (const c of configs ?? []) configMap[c.motivo_grid] = c.grupo

    // Merge: motivos do AS + grupos configurados
    const resultado = motivos.map(m => ({
      grid:  m.grid,
      nome:  m.nome,
      grupo: configMap[m.grid] ?? null,
    }))

    // Adiciona motivos que estão configurados mas não apareceram no AS recente
    for (const c of configs ?? []) {
      if (!resultado.find(r => r.grid === c.motivo_grid)) {
        resultado.push({
          grid:  c.motivo_grid,
          nome:  c.motivo_nome ?? String(c.motivo_grid),
          grupo: c.grupo,
        })
      }
    }

    resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    return NextResponse.json({ motivos: resultado })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/caixa/config-motivos
// Body: { motivo_grid: number, motivo_nome: string, grupo: string | null }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { motivo_grid, motivo_nome, grupo } = await req.json() as {
      motivo_grid: number
      motivo_nome?: string
      grupo: string | null
    }

    if (!motivo_grid) return NextResponse.json({ error: 'motivo_grid obrigatório' }, { status: 400 })

    const admin = createAdminClient()

    if (grupo === null) {
      // Remove o mapeamento
      await admin.from('frentista_motivo_grupo').delete().eq('motivo_grid', motivo_grid)
    } else {
      // Upsert
      await admin.from('frentista_motivo_grupo').upsert({
        motivo_grid,
        grupo,
        motivo_nome: motivo_nome ?? null,
        atualizado_em: new Date().toISOString(),
        atualizado_por: user.id,
      }, { onConflict: 'motivo_grid' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
