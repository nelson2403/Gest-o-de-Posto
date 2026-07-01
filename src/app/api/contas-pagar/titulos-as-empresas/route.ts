import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarTitulosPagarMulti, buscarPessoas, buscarMotivos } from '@/lib/autosystem'

export interface TituloASLinha {
  mlid:        string | null
  data:        string | null
  vencto:      string
  documento:   string | null
  valor:       number
  obs:         string | null
  child:       number
  pessoa_nome: string | null
  motivo_nome: string | null
  situacao:    'a_vencer' | 'em_atraso' | 'pago'
  boleto_url:  string | null   // boleto fiscal casado a este título (se houver)
  boleto_nome: string | null
}

export interface BoletoFiscal {
  id:              string
  titulo:          string
  fornecedor:      string | null
  valor:           number | null
  data_vencimento: string | null
  arquivo_url:     string | null
  arquivo_nome:    string | null
  status:          string
}

export interface TituloASEmpresa {
  posto_id:        string
  posto_nome:      string
  empresa_externo: string
  total:           number
  qt_total:        number
  a_vencer:        number
  em_atraso:       number
  pago:            number
  qt_a_vencer:     number
  qt_em_atraso:    number
  qt_pago:         number
  titulos:         TituloASLinha[]
  boletos_fiscais: BoletoFiscal[]
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venctoIni = searchParams.get('vencto_ini')
  const venctoFim = searchParams.get('vencto_fim')
  const situacao  = searchParams.get('situacao') ?? 'aberto'

  const hoje = new Date().toISOString().slice(0, 10)
  const ini  = venctoIni ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const fim  = venctoFim ?? hoje

  const admin = createAdminClient()
  const { data: postos } = await admin
    .from('postos')
    .select('id, nome, codigo_empresa_externo')
    .not('codigo_empresa_externo', 'is', null)
    .order('nome')

  if (!postos?.length) return NextResponse.json({ empresas: [] })

  // Map empresa_externo (number) → posto info
  const postoByEmp = new Map<number, { id: string; nome: string; externo: string }>()
  const empresaIds: number[] = []
  for (const p of postos) {
    const externo = String(p.codigo_empresa_externo)
    const empNum  = parseInt(externo)
    if (Number.isNaN(empNum)) continue
    postoByEmp.set(empNum, { id: p.id, nome: p.nome, externo })
    empresaIds.push(empNum)
  }

  if (!empresaIds.length) return NextResponse.json({ empresas: [] })

  // Busca boletos fiscais pendentes com data_vencimento ≤ fim
  // Tenta selecionar posto_id (migration 090); se a coluna não existir, faz fallback
  let rawBoletos: any[] = []
  {
    // Casamos por fornecedor+valor (não por vencimento), então NÃO filtramos por
    // data — só pegamos os boletos fiscais com arquivo e valor, ainda não pagos.
    const { data, error } = await admin
      .from('solicitacoes_pagamento')
      .select('id, titulo, fornecedor, valor, data_vencimento, arquivo_url, arquivo_nome, status, posto_id, descricao')
      .eq('setor', 'fiscal')
      .not('status', 'in', '(pago,rejeitado)')
      .not('arquivo_url', 'is', null)
      .not('valor', 'is', null)

    if (!error) {
      rawBoletos = data ?? []
    } else {
      // Coluna posto_id ainda não existe (migration 090 não rodada) — busca sem ela
      const { data: d2 } = await admin
        .from('solicitacoes_pagamento')
        .select('id, titulo, fornecedor, valor, data_vencimento, arquivo_url, arquivo_nome, status, descricao')
        .eq('setor', 'fiscal')
        .not('status', 'in', '(pago,rejeitado)')
        .not('arquivo_url', 'is', null)
        .not('valor', 'is', null)
      rawBoletos = (d2 ?? []).map((b: any) => ({ ...b, posto_id: null }))
    }
  }

  // Para boletos sem posto_id, resolve via "Tarefa: <uuid>" na descrição → fiscal_tarefas
  const semPosto = rawBoletos.filter((b: any) => !b.posto_id && b.descricao)
  if (semPosto.length) {
    const pairs = semPosto
      .map((b: any) => {
        const m = (b.descricao as string).match(/Tarefa:\s*([0-9a-f-]{36})/i)
        return m ? { id: b.id, tarefaId: m[1] } : null
      })
      .filter(Boolean) as { id: string; tarefaId: string }[]

    if (pairs.length) {
      const { data: tarefas } = await admin
        .from('fiscal_tarefas')
        .select('id, posto_id')
        .in('id', pairs.map(p => p.tarefaId))

      const tarefaMap = new Map<string, string>(
        (tarefas ?? []).filter((t: any) => t.posto_id).map((t: any) => [t.id, t.posto_id]),
      )
      for (const p of pairs) {
        const postoId = tarefaMap.get(p.tarefaId)
        if (postoId) {
          const boleto = rawBoletos.find((b: any) => b.id === p.id)
          if (boleto) boleto.posto_id = postoId
        }
      }
    }
  }

  // Agrupa boletos por posto_id
  const boletosByPosto = new Map<string, BoletoFiscal[]>()
  for (const b of rawBoletos) {
    if (!b.posto_id) continue
    if (!boletosByPosto.has(b.posto_id)) boletosByPosto.set(b.posto_id, [])
    boletosByPosto.get(b.posto_id)!.push(b as BoletoFiscal)
  }

  const movtos = await buscarTitulosPagarMulti(empresaIds, ini, fim, situacao)

  const pessoaIds = [...new Set(movtos.map((m: any) => m.pessoa).filter(Boolean))] as number[]
  const motivoIds = [...new Set(movtos.map((m: any) => m.motivo).filter(Boolean))] as number[]

  const [pessoas, motivosData] = await Promise.all([
    buscarPessoas(pessoaIds),
    buscarMotivos(motivoIds),
  ])

  const pessoaLookup: Record<number, string> = {}
  for (const p of pessoas) pessoaLookup[p.grid] = p.nome
  const motivoLookup: Record<number, string> = {}
  for (const m of motivosData) motivoLookup[m.grid] = m.nome

  // Agrupa por empresa
  const empresasMap = new Map<number, TituloASLinha[]>()
  for (const m of movtos as any[]) {
    const empNum = Number(m.empresa)
    const child  = Number(m.child ?? 0)
    const vencto = m.vencto as string
    const sit: TituloASLinha['situacao'] =
      child > 0 ? 'pago' : (vencto && vencto < hoje ? 'em_atraso' : 'a_vencer')
    const linha: TituloASLinha = {
      mlid:        m.mlid != null ? String(m.mlid) : null,
      data:        (m.data as string | null) ?? null,
      vencto,
      documento:   m.documento ?? null,
      valor:       Number(m.valor ?? 0),
      obs:         m.obs ?? null,
      child,
      pessoa_nome: m.pessoa ? (pessoaLookup[m.pessoa] ?? null) : null,
      motivo_nome: m.motivo ? (motivoLookup[m.motivo] ?? null) : null,
      situacao:    sit,
      boleto_url:  null,
      boleto_nome: null,
    }
    if (!empresasMap.has(empNum)) empresasMap.set(empNum, [])
    empresasMap.get(empNum)!.push(linha)
  }

  // ── Casa os boletos fiscais aos títulos por FORNECEDOR + VALOR (global) ────
  // Os boletos chegam SEM posto_id confiável e muitos sem vencimento; então não
  // dá pra agrupar por posto. Casamos pelo conteúdo: mesmo valor (±0,01) e
  // fornecedor parecido. O posto sai do título que casou.
  const norm = (s: string | null) => (s ?? '').toUpperCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
  const fornBate = (a: string | null, b: string | null) => {
    const na = norm(a), nb = norm(b)
    if (na.length < 4 || nb.length < 4) return false
    return na === nb || na.includes(nb.slice(0, 15)) || nb.includes(na.slice(0, 15))
  }
  const boletosPool = (rawBoletos as any[]).filter(b => b.arquivo_url && b.valor != null)
  const boletoUsado = new Set<string>()
  const boletosMatchByPosto = new Map<string, BoletoFiscal[]>()

  const empresas: TituloASEmpresa[] = []
  for (const [empNum, posto] of postoByEmp.entries()) {
    const titulos = empresasMap.get(empNum) ?? []
    if (!titulos.length) continue

    for (const t of titulos) {
      const b = boletosPool.find(b =>
        !boletoUsado.has(b.id) &&
        Math.abs(Number(b.valor) - t.valor) < 0.01 &&
        fornBate(b.fornecedor, t.pessoa_nome),
      )
      if (b) {
        t.boleto_url = b.arquivo_url
        t.boleto_nome = b.arquivo_nome ?? b.titulo
        boletoUsado.add(b.id)
        if (!boletosMatchByPosto.has(posto.id)) boletosMatchByPosto.set(posto.id, [])
        boletosMatchByPosto.get(posto.id)!.push(b as BoletoFiscal)
      }
    }

    const sum = (filt: (t: TituloASLinha) => boolean) =>
      parseFloat(titulos.filter(filt).reduce((s, t) => s + t.valor, 0).toFixed(2))
    const cnt = (filt: (t: TituloASLinha) => boolean) =>
      titulos.filter(filt).length
    empresas.push({
      posto_id:        posto.id,
      posto_nome:      posto.nome,
      empresa_externo: posto.externo,
      total:           sum(() => true),
      qt_total:        titulos.length,
      a_vencer:        sum(t => t.situacao === 'a_vencer'),
      em_atraso:       sum(t => t.situacao === 'em_atraso'),
      pago:            sum(t => t.situacao === 'pago'),
      qt_a_vencer:     cnt(t => t.situacao === 'a_vencer'),
      qt_em_atraso:    cnt(t => t.situacao === 'em_atraso'),
      qt_pago:         cnt(t => t.situacao === 'pago'),
      titulos,
      boletos_fiscais: boletosMatchByPosto.get(posto.id) ?? [],
    })
  }

  empresas.sort((a, b) => b.total - a.total)
  return NextResponse.json({ empresas })
}
