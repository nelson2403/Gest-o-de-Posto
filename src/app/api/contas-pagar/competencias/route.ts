import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/contas-pagar/competencias?competencia=2026-04&posto_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const competencia = searchParams.get('competencia')
  const posto_id = searchParams.get('posto_id')

  const admin = createAdminClient()
  let q = admin
    .from('cp_competencias')
    .select(`
      *,
      postos(nome),
      cp_contas_fixas(descricao, categoria, fornecedor_id, cp_fornecedores(nome)),
      pago_por_usuario:usuarios!cp_competencias_pago_por_fkey(nome)
    `)
    .order('data_vencimento')

  if (competencia) q = q.eq('competencia', competencia)
  if (posto_id)    q = q.eq('posto_id', posto_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcula em_atraso no servidor
  const hoje = new Date().toISOString().slice(0, 10)
  const result = (data ?? []).map((c: any) => ({
    ...c,
    em_atraso: c.status === 'previsto' && c.data_vencimento < hoje,
  }))

  return NextResponse.json({ competencias: result })
}

// POST /api/contas-pagar/competencias — Gera competências para um mês
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { competencia, posto_id } = await req.json()
  if (!competencia) return NextResponse.json({ error: 'Competência obrigatória (YYYY-MM)' }, { status: 400 })

  const [ano, mes] = competencia.split('-').map(Number)

  const admin = createAdminClient()
  let q = admin
    .from('cp_contas_fixas')
    .select('*')
    .eq('ativo', true)

  if (posto_id) q = q.eq('posto_id', posto_id)
  const { data: fixas, error: err } = await q
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const inserir: any[] = []
  for (const f of fixas ?? []) {
    // Calcular data de vencimento — se o dia não existir no mês, usar último dia
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dia = Math.min(f.dia_vencimento, ultimoDia)
    const data_vencimento = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`

    inserir.push({
      conta_fixa_id:   f.id,
      posto_id:        f.posto_id,
      competencia,
      data_vencimento,
      valor_previsto:  f.valor_estimado,
      status:          'previsto',
    })
  }

  if (inserir.length === 0) return NextResponse.json({ geradas: 0 })

  // ON CONFLICT DO NOTHING para não duplicar
  const { data: result, error: errIns } = await admin
    .from('cp_competencias')
    .upsert(inserir, { onConflict: 'conta_fixa_id,competencia', ignoreDuplicates: true })
    .select()

  if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 })
  return NextResponse.json({ geradas: result?.length ?? 0, competencia })
}
