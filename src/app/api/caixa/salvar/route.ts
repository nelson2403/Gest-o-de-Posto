import { NextRequest, NextResponse } from 'next/server'
import { validarSessao, extrairToken } from '@/lib/caixa-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarDadosCaixaFrentista } from '@/lib/autosystem'

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

    const admin = createAdminClient()
    const hoje = hojeBrasil()

    // Regra: se o frentista DECLAROU dinheiro, a Sangria (dinheiro) OU o Depósito
    // (deposito_cofre) precisa ter sido lançado NO SISTEMA (AUTOSYSTEM) antes de
    // finalizar. Caixa sem dinheiro não tem o que depositar — não bloqueia.
    const camposSangriaDeposito = body.itens.filter(
      i => i.tipo === 'dinheiro' || i.tipo === 'deposito_cofre',
    )
    const dinheiroDeclarado = camposSangriaDeposito.reduce((s, i) => s + (Number(i.valor_frentista) || 0), 0)
    if (dinheiroDeclarado > 0) {
      // Começa com o valor que o cliente enviou (pode estar VELHO se ela lançou o
      // cofre/sangria depois de abrir o fechamento).
      let lancadoNoAS = camposSangriaDeposito.some(i => (i.valor_as ?? 0) > 0)

      // Revalida AO VIVO no AUTOSYSTEM — assim o lançamento feito agora é detectado
      // sem precisar recarregar a tela.
      if (!lancadoNoAS && sessao.codigo_operador_as) {
        try {
          const { data: posto } = await admin
            .from('postos').select('codigo_empresa_externo').eq('id', sessao.posto_id).single()
          if (posto?.codigo_empresa_externo) {
            const [{ data: motivoRows }, { data: tefRows }] = await Promise.all([
              admin.from('frentista_motivo_grupo').select('motivo_grid, grupo'),
              admin.from('frentista_tef_grupo').select('operadora_chave, grupo'),
            ])
            const motivoGrupos: Record<number, string> = {}
            for (const r of motivoRows ?? []) if (r.grupo) motivoGrupos[Number(r.motivo_grid)] = r.grupo
            const tefGrupos: Record<string, string> = {}
            for (const r of tefRows ?? []) if (r.grupo) tefGrupos[r.operadora_chave] = r.grupo
            const fresco = await buscarDadosCaixaFrentista(
              Number(posto.codigo_empresa_externo), body.data, sessao.codigo_operador_as,
              motivoGrupos, tefGrupos, false,
            )
            if ((fresco.dinheiro ?? 0) > 0 || (fresco.deposito_cofre ?? 0) > 0) lancadoNoAS = true
          }
        } catch { /* AUTOSYSTEM indisponível — mantém o valor do cliente */ }
      }

      if (!lancadoNoAS) {
        return NextResponse.json(
          { error: 'Lance a Sangria ou o Depósito (Dep. Cofre) no sistema antes de finalizar o fechamento.' },
          { status: 400 },
        )
      }
    }

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
