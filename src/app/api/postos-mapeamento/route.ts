import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH /api/postos-mapeamento
export async function PATCH(req: NextRequest) {
  try {
    const { posto_id, codigo_empresa_externo } = await req.json()

    if (!posto_id) {
      return NextResponse.json({ error: 'posto_id obrigatório' }, { status: 400 })
    }

    const { error } = await supabase
      .from('postos')
      .update({ codigo_empresa_externo: codigo_empresa_externo || null })
      .eq('id', posto_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/postos-mapeamento
export async function GET() {
  const { data, error } = await supabase
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .order('nome')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
