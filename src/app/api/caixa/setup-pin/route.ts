import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'
import { hashSenha, criarSessao } from '@/lib/caixa-auth'

export async function POST(req: NextRequest) {
  try {
    const { login: loginRaw, pin } = await req.json() as { login?: string; pin?: string }
    const login = loginRaw?.trim()

    if (!login) return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 })
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN deve ter 4 a 8 dígitos' }, { status: 400 })
    }

    // 1. Confirma código no AUTOSYSTEM
    let nome = login
    let empresaGrid: number | null = null
    try {
      const rows = await queryAS<any>(`
        SELECT nome::text, empresa::bigint
        FROM funcionario WHERE codigo::text = $1 LIMIT 1
      `, [login])
      if (!rows.length) return NextResponse.json({ error: 'Código não encontrado' }, { status: 401 })
      nome = String(rows[0].nome ?? login)
      empresaGrid = rows[0].empresa ? Number(rows[0].empresa) : null
    } catch (e: any) {
      return NextResponse.json({ error: 'Erro ao verificar código: ' + e.message }, { status: 500 })
    }

    // 2. Descobre posto pelo grid da empresa
    const admin = createAdminClient()
    let posto_id: string | null = null
    let posto_nome = ''
    if (empresaGrid) {
      const { data } = await admin
        .from('postos').select('id, nome')
        .eq('codigo_empresa_externo', String(empresaGrid)).single()
      if (data) { posto_id = data.id; posto_nome = data.nome }
    }
    if (!posto_id) {
      const { data } = await admin.from('postos').select('id, nome').limit(1).single()
      if (data) { posto_id = data.id; posto_nome = data.nome }
    }
    if (!posto_id) return NextResponse.json({ error: 'Posto não configurado no sistema' }, { status: 500 })

    // 3. Upsert frentista com PIN hasheado
    const senha_hash = hashSenha(pin)
    const now = new Date().toISOString()

    const { data: existentes } = await admin
      .from('frentistas')
      .select('id')
      .eq('posto_id', posto_id)
      .or(`codigo_operador_as.eq.${login},codigo.eq.${login}`)
      .limit(1)
    const existente = (existentes as any[])?.[0] ?? null

    let frentistaId: string
    if (existente) {
      await admin.from('frentistas')
        .update({ nome, senha_hash, atualizado_em: now })
        .eq('id', existente.id)
      frentistaId = existente.id
    } else {
      const { data: novo, error } = await admin.from('frentistas').insert({
        posto_id,
        nome,
        codigo:             login,
        senha_hash,
        codigo_operador_as: login,
        ativo:              true,
      }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      frentistaId = (novo as any).id
    }

    const token = await criarSessao(frentistaId)
    return NextResponse.json({
      token,
      frentista: {
        id:                 frentistaId,
        nome,
        codigo:             login,
        posto_id,
        posto_nome,
        empresa_grid:       empresaGrid ? String(empresaGrid) : null,
        codigo_operador_as: login,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
