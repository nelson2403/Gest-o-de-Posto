import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

interface BoletoItem {
  url:        string
  nome:       string
  vencimento: string | null
  valor:      number | null
}

// PATCH — gerente reconhece a NF: anexa documentos e envia para o fiscal
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const {
      nf_url,
      nf_valor_informado,
      boletos = [] as BoletoItem[],
      itens_romaneio,
    } = body

    if (!nf_url || !nf_valor_informado) {
      return NextResponse.json({ error: 'Foto/arquivo da NF e valor são obrigatórios' }, { status: 400 })
    }

    const { data: tarefa, error: errTarefa } = await supabase
      .from('fiscal_tarefas')
      .select('valor_as, status')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }
    if (tarefa.status === 'concluida' || tarefa.status === 'desconhecida') {
      return NextResponse.json({ error: 'Tarefa já encerrada' }, { status: 400 })
    }

    // Valida valor da NF vs AS com tolerância de R$ 0,10
    const diferenca = Math.abs(Number(nf_valor_informado) - Number(tarefa.valor_as))
    if (diferenca > 0.10) {
      return NextResponse.json({
        error: `Valor da NF (R$ ${Number(nf_valor_informado).toFixed(2)}) difere do manifesto AS (R$ ${Number(tarefa.valor_as).toFixed(2)}) em R$ ${diferenca.toFixed(2)}. Verifique e tente novamente.`,
        diferenca,
      }, { status: 422 })
    }

    const agora = new Date().toISOString()

    // Boleto "primário" para compatibilidade com colunas legadas
    const boletosValidos = (boletos as BoletoItem[]).filter(b => b.url)
    const primeiroBoleto  = boletosValidos[0] ?? null

    // Vencimento mais próximo para ordenação/filtro no painel
    const vencimentos = boletosValidos
      .map(b => b.vencimento)
      .filter(Boolean)
      .sort() as string[]
    const earliestVenc = vencimentos[0] ?? null

    const camposBase = {
      acao_gerente:         'reconhecida',
      status:               'aguardando_fiscal',
      gerente_respondeu_em: agora,

      nf_url,
      nf_valor_informado,
      nf_aprovada:     true,
      nf_aprovada_em:  agora,
      nf_anexada_em:   agora,
      nf_anexada_por:  user.id,

      // Campos legados — usados pelo painel para filtros de vencimento
      boleto_url:        primeiroBoleto?.url   ?? null,
      boleto_vencimento: earliestVenc,
      boleto_valor:      primeiroBoleto?.valor ?? null,
      boleto_anexado_em: boletosValidos.length ? agora : null,

      itens_romaneio: itens_romaneio?.length ? itens_romaneio : null,
      atualizada_em:  agora,
    }

    // Tenta salvar com a coluna boletos (nova); se ainda não existir cai no fallback
    let updateResult = await supabase
      .from('fiscal_tarefas')
      .update({ ...camposBase, boletos: boletosValidos })
      .eq('id', id)
      .select()
      .single()

    if (updateResult.error?.message?.includes('boletos')) {
      // Coluna ainda não existe — aguarda migration; salva sem ela
      updateResult = await supabase
        .from('fiscal_tarefas')
        .update(camposBase)
        .eq('id', id)
        .select()
        .single()
    }

    const { data, error } = updateResult
    if (error) throw error
    return NextResponse.json({ tarefa: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
