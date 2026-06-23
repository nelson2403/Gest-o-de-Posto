import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirUsuario } from "@/lib/auth-guard"

// GET — verifica se as notas órfãs foram deletadas
export async function GET(req: NextRequest) {
  try {
    const auth = await exigirUsuario()
    if (!auth.ok) return auth.resp
    const admin = createAdminClient()

    // Procura pelas 2 notas que deveriam ter sido deletadas
    const { data: notas } = await admin
      .from('fiscal_tarefas')
      .select('id, fornecedor_nome, valor_as, data_emissao, nfe_resumo_grid, status')
      .in('id', [
        '33d7e3ab-7199-4f2f-ae46-54f6ee703a23',
        '9ddfa2fe-34cd-4cdc-8588-288e20f89e4c'
      ])

    // Se ainda existem, significa que o DELETE não funcionou ou foram recriadas
    if (notas && notas.length > 0) {
      return NextResponse.json({
        status: 'ERRO',
        problema: 'As notas ainda existem no banco de dados',
        detalhes: 'O DELETE falhou ou elas foram recriadas pelo cron job',
        notas_encontradas: notas.length,
        notas
      })
    }

    // Se não existem, verifica total no POSTO REAL SUL
    const { data: realSul } = await admin
      .from('postos')
      .select('id')
      .ilike('nome', '%REAL%SUL%')
      .single()

    const { data: notasRealSul } = await admin
      .from('fiscal_tarefas')
      .select('id, fornecedor_nome, valor_as')
      .eq('posto_id', realSul?.id ?? '')
      .in('status', ['pendente_gerente', 'aguardando_fiscal', 'nf_rejeitada'])

    return NextResponse.json({
      status: 'OK',
      mensagem: 'As notas foram deletadas com sucesso',
      total_notas_real_sul: notasRealSul?.length ?? 0,
      esperado_no_as: 6,
      sincronizado: (notasRealSul?.length ?? 0) === 6
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
