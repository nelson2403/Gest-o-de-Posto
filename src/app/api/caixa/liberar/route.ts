import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Data de "hoje" no fuso do Brasil (YYYY-MM-DD)
function hojeBrasil(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// POST /api/caixa/liberar  { codigo: string }
// Libera um frentista (pelo código) para refazer o fechamento de HOJE:
// apaga a sessão ativa e o fechamento de hoje desse frentista. Só master/adm.
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

    // Localiza o(s) frentista(s) por código (codigo ou codigo_operador_as)
    const { data: frentistas } = await admin
      .from('frentistas')
      .select('id, nome, codigo, codigo_operador_as, posto_id, postos(nome)')
      .or(`codigo.eq.${cod},codigo_operador_as.eq.${cod}`)

    if (!frentistas?.length) {
      return NextResponse.json({
        error: `Nenhum frentista cadastrado com o código ${cod}. (Ele só aparece após o primeiro acesso com PIN.)`,
      }, { status: 404 })
    }

    const hoje = hojeBrasil()
    const liberados: { nome: string; posto: string; fechamento_removido: boolean; sessoes_removidas: number }[] = []

    for (const f of frentistas) {
      // Remove sessões ativas (libera o re-login)
      const { data: sess } = await admin
        .from('frentista_sessoes')
        .delete()
        .eq('frentista_id', f.id)
        .select('id')

      // Remove o fechamento de hoje (permite refazer)
      const { data: fech } = await admin
        .from('frentista_fechamentos')
        .delete()
        .eq('frentista_id', f.id)
        .eq('data_fechamento', hoje)
        .select('id')

      liberados.push({
        nome: f.nome ?? `Cód. ${cod}`,
        posto: (f.postos as any)?.nome ?? '',
        fechamento_removido: (fech?.length ?? 0) > 0,
        sessoes_removidas: sess?.length ?? 0,
      })
    }

    return NextResponse.json({ ok: true, liberados })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
