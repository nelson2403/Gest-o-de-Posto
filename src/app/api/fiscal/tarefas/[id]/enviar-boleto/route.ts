import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH — fiscal envia o(s) boleto(s) ao contas a pagar e conclui a tarefa
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!usuario || !['master', 'adm_fiscal'].includes(usuario.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const admin = createAdminClient()
    const agora = new Date().toISOString()
    const hoje  = agora.slice(0, 10)

    const { data: tarefa, error: errTarefa } = await admin
      .from('fiscal_tarefas')
      .select('id, status, boleto_status, posto_id, fornecedor_nome, nfe_resumo_grid, nf_valor_informado, valor_as, boleto_url, boleto_vencimento, boleto_valor, boletos')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    if (tarefa.boleto_status !== 'pendente') return NextResponse.json({ error: 'Tarefa não possui boleto pendente para envio' }, { status: 400 })

    // Monta registros de cp_lancamentos — um por boleto
    const boletos: { url?: string; vencimento?: string; valor?: string | number }[] =
      tarefa.boletos?.length
        ? tarefa.boletos
        : tarefa.boleto_url
          ? [{ url: tarefa.boleto_url, vencimento: tarefa.boleto_vencimento, valor: tarefa.boleto_valor }]
          : []

    const cpRegistros = boletos
      .filter(b => b.url)
      .map((b, idx) => ({
        posto_id:        tarefa.posto_id,
        data_lancamento: hoje,
        descricao:       boletos.length > 1
          ? `Boleto ${idx + 1}/${boletos.length} — NF Fiscal — ${tarefa.fornecedor_nome}`
          : `Boleto NF Fiscal — ${tarefa.fornecedor_nome}`,
        valor:           Number(b.valor ?? tarefa.nf_valor_informado ?? tarefa.valor_as ?? 0),
        fornecedor_nome: tarefa.fornecedor_nome,
        documento:       tarefa.nfe_resumo_grid?.toString() ?? null,
        obs:             `Boleto: ${b.url}`,
        criado_por:      user.id,
      }))

    if (cpRegistros.length) {
      const { error: errCp } = await admin.from('cp_lancamentos').insert(cpRegistros)
      if (errCp) throw errCp
    }

    const { data, error } = await admin
      .from('fiscal_tarefas')
      .update({
        boleto_status:      'enviado_cp',
        concluida_por:      user.id,
        boleto_enviado_em:  agora,
        boleto_enviado_por: user.id,
        atualizada_em:      agora,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ tarefa: data, boletos_enviados: cpRegistros.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
