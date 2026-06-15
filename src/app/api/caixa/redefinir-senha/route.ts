import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/caixa/redefinir-senha  { codigo: string }
// Redefine o PIN de um frentista (pelo código): zera a senha para 'autosystem',
// forçando um novo primeiro acesso onde ele define um PIN novo. Só master/adm.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios').select('role').eq('id', user.id).single()
    if (!usuario || !['master', 'adm_financeiro'].includes(usuario.role ?? '')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { codigo } = await req.json() as { codigo?: string }
    const cod = codigo?.trim()
    if (!cod) return NextResponse.json({ error: 'Informe o código do frentista' }, { status: 400 })

    const admin = createAdminClient()

    const { data: frentistas } = await admin
      .from('frentistas')
      .select('id, nome, posto_id, postos(nome)')
      .or(`codigo.eq.${cod},codigo_operador_as.eq.${cod}`)

    if (!frentistas?.length) {
      return NextResponse.json({
        error: `Nenhum frentista cadastrado com o código ${cod}. (Ele só aparece após o primeiro acesso com PIN.)`,
      }, { status: 404 })
    }

    const agora = new Date().toISOString()
    const redefinidos: { nome: string; posto: string }[] = []

    for (const f of frentistas) {
      await admin
        .from('frentistas')
        .update({ senha_hash: 'autosystem', atualizado_em: agora })
        .eq('id', f.id)
      // Também encerra sessões em aberto para liberar o re-login
      await admin.from('frentista_sessoes').delete().eq('frentista_id', f.id)
      redefinidos.push({ nome: f.nome ?? `Cód. ${cod}`, posto: (f.postos as any)?.nome ?? '' })
    }

    return NextResponse.json({ ok: true, redefinidos })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
