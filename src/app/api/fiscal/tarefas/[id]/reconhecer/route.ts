import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      dados_combustivel,
      is_uso_consumo = false,
    } = body

    if (!nf_url || !nf_valor_informado) {
      return NextResponse.json({ error: 'Foto/arquivo da NF e valor são obrigatórios' }, { status: 400 })
    }

    // Busca tarefa + posto para verificar propriedade
    const { data: tarefa, error: errTarefa } = await supabase
      .from('fiscal_tarefas')
      .select('valor_as, status, nf_url, posto_id')
      .eq('id', id)
      .single()

    if (errTarefa || !tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
    }

    // Verifica se o usuário tem permissão sobre este posto
    // Master e adm_fiscal têm acesso irrestrito; gerentes só podem acessar seu próprio posto
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('role, empresa_id')
      .eq('id', user.id)
      .single()

    const rolePermitida = ['master', 'adm_fiscal', 'adm_financeiro'].includes(usuarioData?.role ?? '')
    if (!rolePermitida) {
      // Gerente: verifica se o posto da tarefa pertence à sua empresa
      const { data: postoCheck } = await supabase
        .from('postos')
        .select('id')
        .eq('id', tarefa.posto_id)
        .eq('empresa_id', usuarioData?.empresa_id ?? '')
        .single()
      if (!postoCheck) {
        return NextResponse.json({ error: 'Sem permissão para esta tarefa' }, { status: 403 })
      }
    }
    if (tarefa.status === 'desconhecida') {
      return NextResponse.json({ error: 'Tarefa já encerrada como desconhecida' }, { status: 400 })
    }
    // Tarefa concluída COM NF já anexada: bloqueia para não sobrescrever
    if (tarefa.status === 'concluida' && tarefa.nf_url) {
      return NextResponse.json({ error: 'Tarefa já encerrada e documentos já anexados' }, { status: 400 })
    }
    // Tarefa concluída SEM NF: permite anexar os documentos mas mantém status concluida
    const manterConcluida = tarefa.status === 'concluida'

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
      // Se a tarefa já foi concluída pelo sync do AUTOSYSTEM, mantém o status — só salva os documentos
      ...(manterConcluida ? {} : { status: 'aguardando_fiscal' }),
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

      itens_romaneio:    itens_romaneio?.length ? itens_romaneio : null,
      dados_combustivel: dados_combustivel ?? null,
      is_uso_consumo,
      atualizada_em:     agora,
    }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('fiscal_tarefas')
      .update({ ...camposBase, boletos: boletosValidos })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[reconhecer] erro ao salvar tarefa', id, error.message)
      throw error
    }
    return NextResponse.json({ tarefa: data })
  } catch (e: any) {
    console.error('[reconhecer] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
