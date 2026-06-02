import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CAMPOS_PADRAO = [
  { tipo: 'dinheiro',           label: 'Dinheiro',            ordem: 1, ativo: true  },
  { tipo: 'pix',                label: 'PIX',                 ordem: 2, ativo: true  },
  { tipo: 'pix_cnpj',           label: 'PIX CNPJ',            ordem: 3, ativo: true  },
  { tipo: 'cartoes',            label: 'Cartões',             ordem: 4, ativo: true  },
  { tipo: 'cartoes_frotas',     label: 'Cartões Frotas',      ordem: 5, ativo: true  },
  { tipo: 'notas_promissorias', label: 'Notas Promissórias',  ordem: 6, ativo: false },
  { tipo: 'cheque',             label: 'Cheque',              ordem: 7, ativo: false },
]

async function checkAuth() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()
  const roles = ['master', 'adm_financeiro', 'gerente']
  if (!roles.includes(usuario?.role ?? '')) return null
  return { user, role: usuario!.role }
}

// GET /api/caixa/config?posto_id=...
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAuth()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const posto_id = new URL(req.url).searchParams.get('posto_id')
    if (!posto_id) return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })

    const admin = createAdminClient()
    const { data } = await admin
      .from('frentista_campos')
      .select('campos')
      .eq('posto_id', posto_id)
      .single()

    return NextResponse.json({ campos: data?.campos ?? CAMPOS_PADRAO })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/caixa/config
export async function PUT(req: NextRequest) {
  try {
    const auth = await checkAuth()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { posto_id, campos } = await req.json()
    if (!posto_id || !Array.isArray(campos)) {
      return NextResponse.json({ error: 'posto_id e campos obrigatórios' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('frentista_campos')
      .upsert({ posto_id, campos, atualizado_em: new Date().toISOString() }, { onConflict: 'posto_id' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
