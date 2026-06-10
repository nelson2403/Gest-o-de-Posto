import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarDadosCaixaFrentista } from '@/lib/autosystem'

// GET /api/caixa/fechamento-conferencia?id=<fechamento_id>
// Recalcula AO VIVO os totais do AUTOSYSTEM (entradas × formas) para um
// fechamento já salvo, para que a coluna "Sistema"/veredito do financeiro
// fique idêntica ao que o frentista viu — independente do snapshot gravado.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single()

    const roles = ['master', 'adm_financeiro', 'gerente', 'operador_caixa']
    if (!usuario || !roles.includes(usuario.role ?? '')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const admin = createAdminClient()

    const { data: fech } = await admin
      .from('frentista_fechamentos')
      .select('posto_id, data_fechamento, frentista_id')
      .eq('id', id)
      .single()

    if (!fech) return NextResponse.json({ error: 'Fechamento não encontrado' }, { status: 404 })

    const [{ data: frentista }, { data: posto }] = await Promise.all([
      admin.from('frentistas').select('codigo_operador_as, codigo').eq('id', fech.frentista_id).single(),
      admin.from('postos').select('codigo_empresa_externo').eq('id', fech.posto_id).single(),
    ])

    const codigoOperador = frentista?.codigo_operador_as ?? frentista?.codigo ?? null
    const empresaGrid = posto?.codigo_empresa_externo ? Number(posto.codigo_empresa_externo) : null

    if (!codigoOperador || !empresaGrid) {
      return NextResponse.json({ disponivel: false })
    }

    const [{ data: motivoRows }, { data: tefRows }] = await Promise.all([
      admin.from('frentista_motivo_grupo').select('motivo_grid, grupo'),
      admin.from('frentista_tef_grupo').select('operadora_chave, grupo'),
    ])
    const motivoGrupos: Record<number, string> = {}
    for (const r of motivoRows ?? []) if (r.grupo) motivoGrupos[Number(r.motivo_grid)] = r.grupo
    const tefGrupos: Record<string, string> = {}
    for (const r of tefRows ?? []) if (r.grupo) tefGrupos[r.operadora_chave] = r.grupo

    const dados = await buscarDadosCaixaFrentista(
      empresaGrid,
      fech.data_fechamento,
      String(codigoOperador),
      motivoGrupos,
      tefGrupos,
    )

    return NextResponse.json({
      disponivel:     true,
      total_entradas: parseFloat((dados.total_entradas || 0).toFixed(2)),
      total_formas:   parseFloat((dados.total_formas || 0).toFixed(2)),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, disponivel: false }, { status: 200 })
  }
}
