import { NextRequest, NextResponse } from 'next/server'
import { validarSessao, extrairToken } from '@/lib/caixa-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarDadosCaixaFrentista } from '@/lib/autosystem'

// GET /api/caixa/dados?data=YYYY-MM-DD
// Retorna: campos configurados para o posto + valores do AUTOSYSTEM para o frentista
export async function GET(req: NextRequest) {
  try {
    const sessao = await validarSessao(extrairToken(req))
    if (!sessao) return NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const data = searchParams.get('data') ?? new Date().toISOString().slice(0, 10)

    const admin = createAdminClient()

    // Já existe fechamento deste frentista para esta data? (regra: 1 por dia)
    const { data: jaFez } = await admin
      .from('frentista_fechamentos')
      .select('id')
      .eq('frentista_id', sessao.frentista_id)
      .eq('data_fechamento', data)
      .maybeSingle()

    if (jaFez) {
      return NextResponse.json({
        ja_fechado: true,
        frentista: { nome: sessao.nome, codigo: sessao.codigo },
        data,
      })
    }

    // Campos configurados para o posto
    const { data: configRow } = await admin
      .from('frentista_campos')
      .select('campos')
      .eq('posto_id', sessao.posto_id)
      .single()

    const campos: Array<{ tipo: string; label: string; ordem: number; ativo: boolean }> =
      configRow?.campos ?? CAMPOS_PADRAO

    const camposAtivos = campos
      .filter(c => c.ativo)
      .sort((a, b) => a.ordem - b.ordem)

    // Dados do AUTOSYSTEM (formas de pagamento via movto do frentista)
    let dadosAS = {
      cartoes: 0, cartoes_frotas: 0, pix_tef: 0, pix_cnpj: 0,
      dinheiro: 0, deposito_cofre: 0, a_prazo: 0, cheque: 0, notas_promissorias: 0,
      total_entradas: 0, total_formas: 0,
      lancto_por_conta:   {} as Record<string, number>,
      lancto_por_motivo:  {} as Record<number, number>,
      movto_por_forma:    {} as Record<string, number>,
      caixas_encontrados: 0, estrategia: '',
    }

    if (sessao.codigo_operador_as) {
      const { data: posto } = await admin
        .from('postos')
        .select('codigo_empresa_externo')
        .eq('id', sessao.posto_id)
        .single()

      // Caixa agrupado (resiliente caso a migration 121 ainda não tenha rodado)
      let caixaAgrupado = false
      try {
        const { data: pa } = await admin
          .from('postos').select('caixa_agrupado').eq('id', sessao.posto_id).single()
        caixaAgrupado = (pa as any)?.caixa_agrupado === true
      } catch { /* coluna ainda não existe */ }

      if (posto?.codigo_empresa_externo) {
        try {
          // Carrega mapeamentos motivo → grupo e TEF operadora → grupo
          const [{ data: motivoRows }, { data: tefRows }] = await Promise.all([
            admin.from('frentista_motivo_grupo').select('motivo_grid, grupo'),
            admin.from('frentista_tef_grupo').select('operadora_chave, grupo'),
          ])
          const motivoGrupos: Record<number, string> = {}
          for (const r of motivoRows ?? []) {
            if (r.grupo) motivoGrupos[Number(r.motivo_grid)] = r.grupo
          }
          const tefGrupos: Record<string, string> = {}
          for (const r of tefRows ?? []) {
            if (r.grupo) tefGrupos[r.operadora_chave] = r.grupo
          }

          dadosAS = await buscarDadosCaixaFrentista(
            Number(posto.codigo_empresa_externo),
            data,
            sessao.codigo_operador_as,
            motivoGrupos,
            tefGrupos,
            caixaAgrupado,
          )
          console.log('[caixa-dados] AS estrategia:', dadosAS.estrategia, '| caixas:', dadosAS.caixas_encontrados)
        } catch (e: any) {
          console.log('[caixa-dados] AS erro:', e.message)
        }
      }
    }

    // Monta os valores AS por tipo de campo (apenas preenche quando > 0)
    const notasTotal = dadosAS.notas_promissorias
    const valoresAS: Record<string, number | null> = {
      cartoes:            dadosAS.cartoes        > 0 ? dadosAS.cartoes        : null,
      cartoes_frotas:     dadosAS.cartoes_frotas > 0 ? dadosAS.cartoes_frotas : null,
      pix:                dadosAS.pix_tef        > 0 ? dadosAS.pix_tef        : null,
      pix_cnpj:           dadosAS.pix_cnpj       > 0 ? dadosAS.pix_cnpj       : null,
      dinheiro:           dadosAS.dinheiro       > 0 ? dadosAS.dinheiro       : null,
      deposito_cofre:     dadosAS.deposito_cofre > 0 ? dadosAS.deposito_cofre : null,
      notas_promissorias: notasTotal             > 0 ? notasTotal             : null,
      cheque:             dadosAS.cheque         > 0 ? dadosAS.cheque         : null,
    }

    return NextResponse.json({
      ja_fechado: false,
      campos: camposAtivos,
      valores_as: valoresAS,
      frentista: { nome: sessao.nome, codigo: sessao.codigo },
      data,
      caixas_encontrados: dadosAS.caixas_encontrados,
      as_estrategia:      dadosAS.estrategia,
      // Conferência interna do AUTOSYSTEM: entradas × formas (saída)
      conferencia_as: {
        total_entradas: parseFloat((dadosAS.total_entradas || 0).toFixed(2)),
        total_formas:   parseFloat((dadosAS.total_formas || 0).toFixed(2)),
        diferenca:      parseFloat(((dadosAS.total_formas || 0) - (dadosAS.total_entradas || 0)).toFixed(2)),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

const CAMPOS_PADRAO = [
  { tipo: 'dinheiro',           label: 'Sangria',             ordem: 1, ativo: true  },
  { tipo: 'deposito_cofre',     label: 'Dep. Cofre',          ordem: 2, ativo: true  },
  { tipo: 'pix',                label: 'PIX',                 ordem: 3, ativo: true  },
  { tipo: 'pix_cnpj',           label: 'PIX CNPJ',            ordem: 4, ativo: true  },
  { tipo: 'cartoes',            label: 'Cart. Stone',         ordem: 5, ativo: true  },
  { tipo: 'cartoes_frotas',     label: 'Cart. Frotas',        ordem: 6, ativo: true  },
  { tipo: 'notas_promissorias', label: 'A Prazo',             ordem: 7, ativo: true  },
  { tipo: 'cheque',             label: 'Cheque',              ordem: 8, ativo: true  },
]
