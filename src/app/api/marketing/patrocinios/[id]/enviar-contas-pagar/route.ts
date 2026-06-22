import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/marketing/patrocinios/[id]/enviar-contas-pagar
// Cria uma solicitação de pagamento (setor marketing) com o documento do
// patrocínio e marca o patrocínio como "enviado".
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: usr } = await admin
    .from('usuarios')
    .select('id, nome, role')
    .eq('id', user.id)
    .single()

  if (!usr || !['master', 'adm_marketing'].includes(usr.role)) {
    return NextResponse.json({ error: 'Sem permissão para enviar ao Contas a Pagar' }, { status: 403 })
  }

  // Carrega o patrocínio + posto + documentos
  const { data: pat } = await admin
    .from('marketing_patrocinios')
    .select('id, posto_id, valor, data_evento, patrocinado, descricao, status, documento_url, solicitacao_pagamento_id, postos(nome, empresa_id), marketing_comprovantes(arquivo_url, arquivo_nome)')
    .eq('id', id)
    .single()

  if (!pat) return NextResponse.json({ error: 'Patrocínio não encontrado' }, { status: 404 })
  if (pat.status === 'enviado' || pat.solicitacao_pagamento_id) {
    return NextResponse.json({ error: 'Este patrocínio já foi enviado ao Contas a Pagar' }, { status: 409 })
  }
  if (pat.status !== 'aprovado') {
    return NextResponse.json({ error: 'Só é possível enviar patrocínios aprovados' }, { status: 422 })
  }

  const comprovantes = (pat.marketing_comprovantes as any[]) ?? []
  const docUrl  = pat.documento_url ?? comprovantes[0]?.arquivo_url ?? null
  const docNome = comprovantes[0]?.arquivo_nome ?? null
  if (!docUrl) {
    return NextResponse.json({ error: 'Anexe o documento assinado antes de enviar ao Contas a Pagar' }, { status: 422 })
  }

  const posto = pat.postos as any

  // Cria a solicitação de pagamento
  const { data: sol, error: solErr } = await admin
    .from('solicitacoes_pagamento')
    .insert({
      empresa_id:      posto?.empresa_id ?? null,
      setor:           'marketing',
      titulo:          `Patrocínio — ${pat.patrocinado}`,
      descricao:       pat.descricao ?? null,
      fornecedor:      pat.patrocinado,
      valor:           pat.valor,
      data_vencimento: pat.data_evento,
      arquivo_url:     docUrl,
      arquivo_nome:    docNome,
      posto_id:        pat.posto_id,
      criado_por_id:   usr.id,
      criado_por_nome: usr.nome,
      status:          'pendente',
    })
    .select()
    .single()

  if (solErr) return NextResponse.json({ error: solErr.message }, { status: 500 })

  // Marca o patrocínio como enviado
  const { data: patUpd, error: patErr } = await admin
    .from('marketing_patrocinios')
    .update({
      status: 'enviado',
      enviado_contas_pagar_em: new Date().toISOString(),
      solicitacao_pagamento_id: sol.id,
    })
    .eq('id', id)
    .select()
    .single()

  if (patErr) {
    // desfaz a solicitação criada para não deixar lixo
    await admin.from('solicitacoes_pagamento').delete().eq('id', sol.id)
    return NextResponse.json({ error: patErr.message }, { status: 500 })
  }

  await admin.from('marketing_logs').insert({
    tipo: 'patrocinio', ref_id: id, acao: 'enviado',
    usuario_id: user.id, detalhes: { solicitacao_pagamento_id: sol.id, valor: pat.valor },
  })

  return NextResponse.json({ patrocinio: patUpd, solicitacao: sol })
}
