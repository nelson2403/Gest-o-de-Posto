import { NextRequest, NextResponse } from 'next/server'
import { validarSessao, extrairToken } from '@/lib/caixa-auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface ItemFechamento {
  tipo:             string
  label:            string
  valor_as:         number | null
  valor_frentista:  number
  diferenca:        number | null
}

// Data de "hoje" no fuso do Brasil (YYYY-MM-DD)
function hojeBrasil(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export async function POST(req: NextRequest) {
  try {
    const sessao = await validarSessao(extrairToken(req))
    if (!sessao) return NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 })

    const body = await req.json() as {
      data:           string
      turno?:         string
      itens:          ItemFechamento[]
      assinatura_img: string
      observacao?:    string
    }

    if (!body.itens?.length || !body.assinatura_img) {
      return NextResponse.json({ error: 'Itens e assinatura obrigatórios' }, { status: 400 })
    }

    // Regra: a Sangria (dinheiro) OU o Depósito (deposito_cofre) precisa ter sido lançado
    // NO SISTEMA (AUTOSYSTEM) antes de finalizar — ou seja, o valor do lado "Sist."
    // (valor_as) tem que ser > 0. Força o frentista a lançar a sangria/depósito no sistema.
    const camposSangriaDeposito = body.itens.filter(
      i => i.tipo === 'dinheiro' || i.tipo === 'deposito_cofre',
    )
    // Só exige o lançamento se o frentista DECLAROU dinheiro (há o que depositar).
    // Caixa sem dinheiro não tem o que sangrar/depositar — não bloqueia.
    const dinheiroDeclarado = camposSangriaDeposito.reduce((s, i) => s + (Number(i.valor_frentista) || 0), 0)
    if (dinheiroDeclarado > 0 &&
        !camposSangriaDeposito.some(i => (i.valor_as ?? 0) > 0)) {
      return NextResponse.json(
        { error: 'Lance a Sangria ou o Depósito (Dep. Cofre) no sistema antes de finalizar o fechamento.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const hoje = hojeBrasil()

    // Regra 1: frentista só pode fechar o dia atual
    if (body.data && body.data !== hoje) {
      return NextResponse.json(
        { error: 'Só é permitido enviar o fechamento do dia atual.' },
        { status: 400 },
      )
    }

    // Regra 2: apenas um fechamento por frentista por dia
    const { data: existente } = await admin
      .from('frentista_fechamentos')
      .select('id')
      .eq('frentista_id', sessao.frentista_id)
      .eq('data_fechamento', hoje)
      .maybeSingle()

    if (existente) {
      return NextResponse.json(
        { error: 'Você já enviou o fechamento de hoje. Não é possível enviar novamente.' },
        { status: 409 },
      )
    }

    const total_as        = body.itens.reduce((s, i) => s + (i.valor_as ?? 0), 0)
    const total_frentista = body.itens.reduce((s, i) => s + i.valor_frentista, 0)
    const total_diferenca = total_frentista - total_as

    const { data: fechamento, error } = await admin
      .from('frentista_fechamentos')
      .insert({
        posto_id:         sessao.posto_id,
        frentista_id:     sessao.frentista_id,
        frentista_nome:   sessao.nome,
        data_fechamento:  hoje,
        turno:            body.turno ?? null,
        itens:            body.itens,
        total_as:         parseFloat(total_as.toFixed(2)),
        total_frentista:  parseFloat(total_frentista.toFixed(2)),
        total_diferenca:  parseFloat(total_diferenca.toFixed(2)),
        assinatura_img:   body.assinatura_img,
        assinado_em:      new Date().toISOString(),
        status:           'assinado',
        observacao:       body.observacao ?? null,
      })
      .select()
      .single()

    // Violação de unicidade (índice frentista_id+data) = já fez hoje (corrida)
    if (error && (error as any).code === '23505') {
      return NextResponse.json(
        { error: 'Você já enviou o fechamento de hoje. Não é possível enviar novamente.' },
        { status: 409 },
      )
    }
    if (error) throw error

    // Invalida a sessão após envio (uma sessão por fechamento)
    await admin
      .from('frentista_sessoes')
      .delete()
      .eq('frentista_id', sessao.frentista_id)

    return NextResponse.json({ fechamento })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
