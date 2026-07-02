import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularComissoes } from '@/lib/comissionamento'
import type { MembroRole } from '@/lib/comissionamento/types'

export const dynamic = 'force-dynamic'

// GET /api/comissionamento/aprovacao
//   ?esquema_id=<uuid>
//   &data_ini=YYYY-MM-DD
//   &data_fim=YYYY-MM-DD
//
// Consolida a comissão do esquema para TODOS os postos vinculados a ele
// no período informado. Retorna estrutura pronta para o relatório executivo:
// KPIs da rede + por posto (nome, subtotal, membros).
//
// Otimização: calcularComissoes é chamado em paralelo para cada posto —
// cada chamada é I/O bound (Supabase + AUTOSYSTEM), então Promise.all é
// legítimo. Postos que falharem individualmente NÃO derrubam o relatório
// inteiro; o erro fica no output para o dono ver o que ficou pendente.

interface MembroLinha {
  vendedor_id:  string
  nome:         string
  role:         MembroRole | null
  cadastrado:   boolean
  vendas_count: number
  faturamento:  number
  lucro:        number
  comissao:     number
}
interface PostoBloco {
  posto_id:       string
  posto_nome:     string
  faturamento:    number
  lucro:          number
  comissao_total: number
  qtd_membros_comissionados: number
  membros:        MembroLinha[]
  erro?:          string
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const esquemaId = sp.get('esquema_id') ?? ''
  const dataIni   = sp.get('data_ini')   ?? ''
  const dataFim   = sp.get('data_fim')   ?? ''
  if (!esquemaId || !dataIni || !dataFim) {
    return NextResponse.json({ error: 'esquema_id, data_ini e data_fim são obrigatórios' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Carrega esquema + postos vinculados
  const [esquemaResp, vinculosResp] = await Promise.all([
    admin.from('comissio_esquemas').select('id, nome, status').eq('id', esquemaId).single(),
    admin.from('comissio_esquema_postos').select('posto_id').eq('esquema_id', esquemaId),
  ])
  if (esquemaResp.error || !esquemaResp.data) {
    return NextResponse.json({ error: 'Esquema não encontrado' }, { status: 404 })
  }
  const postoIds = (vinculosResp.data ?? []).map(v => v.posto_id as string)
  if (postoIds.length === 0) {
    return NextResponse.json({
      esquema:  { id: esquemaResp.data.id, nome: esquemaResp.data.nome },
      periodo:  { ini: dataIni, fim: dataFim },
      totais:   { postos: 0, membros_comissionados: 0, faturamento: 0, lucro: 0, comissao: 0 },
      postos:   [],
    })
  }

  const { data: postosData, error: erP } = await admin
    .from('postos')
    .select('id, nome')
    .in('id', postoIds)
  if (erP) return NextResponse.json({ error: erP.message }, { status: 500 })
  const nomePorPosto = new Map<string, string>()
  for (const p of postosData ?? []) nomePorPosto.set(p.id as string, p.nome as string)

  // Calcula em paralelo. Cada calcularComissoes é ~1 request pro AUTOSYSTEM,
  // então parlaelizar aqui recupera tempo real substancial para redes grandes.
  // Falha individual não derruba o consolidado — vira {erro} no bloco.
  const blocos: PostoBloco[] = await Promise.all(postoIds.map(async (pid): Promise<PostoBloco> => {
    try {
      const r = await calcularComissoes({ postoId: pid, esquemaId, dataIni, dataFim })
      // Só considera membros com comissão > 0 OU vendas > 0 — evita poluir com
      // membros cadastrados mas sem atividade no período.
      const membros: MembroLinha[] = r.resumoPorVendedor
        .filter(v => v.comissao_total > 0 || v.vendas_count > 0)
        .map(v => ({
          vendedor_id:  v.vendedor_id,
          nome:         v.vendedor_nome,
          role:         v.membro_role,
          cadastrado:   !!v.membro_id,
          vendas_count: v.vendas_count,
          faturamento:  v.faturamento,
          lucro:        v.lucro_bruto,
          comissao:     v.comissao_total,
        }))
        .sort((a, b) => b.comissao - a.comissao)
      return {
        posto_id:       pid,
        posto_nome:     nomePorPosto.get(pid) ?? '(sem nome)',
        faturamento:    r.totais.faturamento,
        lucro:          r.totais.lucroBruto,
        comissao_total: r.totais.comissaoTotal,
        qtd_membros_comissionados: membros.filter(m => m.comissao > 0).length,
        membros,
      }
    } catch (e) {
      return {
        posto_id:       pid,
        posto_nome:     nomePorPosto.get(pid) ?? '(sem nome)',
        faturamento: 0, lucro: 0, comissao_total: 0,
        qtd_membros_comissionados: 0,
        membros: [],
        erro:    e instanceof Error ? e.message : String(e),
      }
    }
  }))

  // Ordena postos por comissão desc (maior contribuidor primeiro)
  blocos.sort((a, b) => b.comissao_total - a.comissao_total)

  const totFat = blocos.reduce((s, b) => s + b.faturamento, 0)
  const totLuc = blocos.reduce((s, b) => s + b.lucro, 0)
  const totCom = blocos.reduce((s, b) => s + b.comissao_total, 0)
  const totMem = blocos.reduce((s, b) => s + b.qtd_membros_comissionados, 0)

  return NextResponse.json({
    esquema: { id: esquemaResp.data.id, nome: esquemaResp.data.nome },
    periodo: { ini: dataIni, fim: dataFim },
    totais:  {
      postos: blocos.length,
      membros_comissionados: totMem,
      faturamento: totFat,
      lucro: totLuc,
      comissao: totCom,
    },
    postos: blocos,
  })
}
