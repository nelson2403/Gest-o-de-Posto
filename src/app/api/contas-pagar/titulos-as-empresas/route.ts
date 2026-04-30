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
    }
    if (!empresasMap.has(empNum)) empresasMap.set(empNum, [])
    empresasMap.get(empNum)!.push(linha)
  }

  const empresas: TituloASEmpresa[] = []
  for (const [empNum, posto] of postoByEmp.entries()) {
    const titulos = empresasMap.get(empNum) ?? []
    if (!titulos.length) continue
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
    })
  }

  empresas.sort((a, b) => b.total - a.total)
  return NextResponse.json({ empresas })
}
