import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarPlanoContas } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// GET /api/contabil/contas-autosystem
//
// Retorna o plano de contas completo do AUTOSYSTEM (tabela `conta`) com
// uma flag indicando se a conta já tem mapeamento ATIVO em
// contabil_mapeamento_contas, e o conta_contabil correspondente se houver.
//
// Usado pela aba "Mapeamento De/Para" para mostrar a lista da esquerda.

export interface ContaAutosystemListItem {
  codigo:           string
  nome:             string
  natureza:         'Débito' | 'Crédito'
  mapeada:          boolean
  conta_contabil:   string | null
  mapeamento_id:    string | null
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const plano = await buscarPlanoContas()

    // Carrega mapeamentos ATIVOS
    const admin = createAdminClient()
    const { data: maps, error: erMap } = await admin
      .from('contabil_mapeamento_contas')
      .select('id, conta_autosystem, conta_contabil, ativo')
      .eq('ativo', true)
    if (erMap) return NextResponse.json({ error: erMap.message }, { status: 500 })

    const porCodigo = new Map<string, { id: string; conta_contabil: string }>()
    for (const m of maps ?? []) {
      porCodigo.set(m.conta_autosystem, { id: m.id, conta_contabil: m.conta_contabil })
    }

    const contas: ContaAutosystemListItem[] = plano.map(p => {
      const m = porCodigo.get(p.hierarquia)
      return {
        codigo:         p.hierarquia,
        nome:           p.nome,
        natureza:       p.natureza,
        mapeada:        !!m,
        conta_contabil: m?.conta_contabil ?? null,
        mapeamento_id:  m?.id ?? null,
      }
    })

    return NextResponse.json({ contas, total: contas.length, mapeadas: porCodigo.size })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
