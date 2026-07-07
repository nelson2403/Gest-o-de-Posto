'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Link2Off, Wand2, Check, Building2, Cpu, Link2, CircleDot, Sparkles, X, Upload, CalendarClock, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Conta = { id: string; banco: string; conta: string | null }
type LinhaBanco = { id: string; data: string; descricao: string; valor: number }
type LinhaSistema = { id: string; data: string; descricao: string; documento: string | null; valor: number; direcao: 'entrada' | 'saida' }
type Concil = { grupo_id: string; lado: 'banco' | 'sistema'; linha_hash: string; baixado_em: string | null }
type Cartao = { liquida: string; bandeira: string; venda: string; valor: number; qtd: number }
type Dados = {
  conta: { id: string; banco: string; numero: string | null; posto: string; posto_id: string | null }
  periodo: { ini: string; fim: string }
  banco: LinhaBanco[]
  sistema: LinhaSistema[]
  conciliacoes: Concil[]
  cartoes?: Cartao[]
  arquivos: { total: number; lidos: number; erro: number }
}

const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (d: string) => d ? d.split('-').reverse().join('/') : ''
const cents = (n: number) => Math.round(Math.abs(n) * 100)

const CORES = [
  'bg-purple-50 border-l-purple-400', 'bg-cyan-50 border-l-cyan-400', 'bg-pink-50 border-l-pink-400',
  'bg-lime-50 border-l-lime-400', 'bg-teal-50 border-l-teal-400', 'bg-fuchsia-50 border-l-fuchsia-400',
  'bg-sky-50 border-l-sky-400', 'bg-amber-50 border-l-amber-400',
]

// Acha subconjuntos de `items` cujo valor soma exatamente `targetCents`.
function subsetsSum<T extends { valor: number }>(items: T[], targetCents: number, maxSize: number, maxSols: number): T[][] {
  const arr = items.map(it => ({ it, c: cents(it.valor) })).filter(x => x.c > 0 && x.c <= targetCents).sort((a, b) => b.c - a.c)
  const sols: T[][] = []
  const cur: { it: T; c: number }[] = []
  function bt(start: number, rem: number) {
    if (sols.length >= maxSols) return
    if (rem === 0) { sols.push(cur.map(x => x.it)); return }
    if (cur.length >= maxSize) return
    for (let i = start; i < arr.length; i++) {
      if (arr[i].c > rem) continue
      cur.push(arr[i]); bt(i + 1, rem - arr[i].c); cur.pop()
      if (sols.length >= maxSols) return
    }
  }
  bt(0, targetCents)
  return sols
}

// Pela descrição do banco ("CR COMPRAS MASTERCARD", "CR COMPRAS MAESTRO"...),
// devolve um filtro pra bandeira do recebível — ajuda a achar a venda certa.
function bandeiraFiltro(desc: string): ((c: Cartao) => boolean) | null {
  const d = (desc || '').toUpperCase()
  if (/MAESTRO/.test(d)) return c => /MASTER/i.test(c.bandeira) && /D[EÉ]BITO/i.test(c.bandeira)
  if (/MASTERCARD|MASTER/.test(d)) return c => /MASTER/i.test(c.bandeira)
  if (/ELECTRON/.test(d)) return c => /VISA/i.test(c.bandeira) && /D[EÉ]BITO/i.test(c.bandeira)
  if (/VISA/.test(d)) return c => /VISA/i.test(c.bandeira)
  if (/\bELO\b/.test(d)) return c => /ELO/i.test(c.bandeira)
  if (/HIPER/.test(d)) return c => /HIPER/i.test(c.bandeira)
  return null
}

type GrupoAuto = { banco: LinhaBanco[]; sistema: LinhaSistema[] }

// Auto-conciliação por SOMA: só cria grupos quando o casamento é ÚNICO (sem
// ambiguidade) — 1 linha de um lado = soma de N do mesmo dia, e vice-versa.
function computeAuto(banco: LinhaBanco[], sistema: LinhaSistema[], conc: Concil[]): GrupoAuto[] {
  const usadosB = new Set(conc.filter(c => c.lado === 'banco').map(c => c.linha_hash))
  const usadosS = new Set(conc.filter(c => c.lado === 'sistema').map(c => c.linha_hash))
  const grupos: GrupoAuto[] = []

  const porData = <T extends { data: string }>(arr: T[], usados: Set<string>, id: (t: T) => string) => {
    const m = new Map<string, T[]>()
    for (const x of arr) if (!usados.has(id(x))) (m.get(x.data) ?? m.set(x.data, []).get(x.data)!).push(x)
    return m
  }

  // 1 banco = soma de N do sistema (mesmo dia, mesmo sinal)
  const sPorData = porData(sistema, usadosS, s => s.id)
  for (const b of banco.filter(b => !usadosB.has(b.id)).sort((a, z) => cents(z.valor) - cents(a.valor))) {
    const cands = (sPorData.get(b.data) ?? []).filter(s => !usadosS.has(s.id) && Math.sign(s.valor) === Math.sign(b.valor))
    if (!cands.length || cands.length > 40) continue
    const sols = subsetsSum(cands, cents(b.valor), 6, 2)
    if (sols.length === 1) { grupos.push({ banco: [b], sistema: sols[0] }); usadosB.add(b.id); for (const s of sols[0]) usadosS.add(s.id) }
  }
  // 1 sistema = soma de N do banco (o resto)
  const bPorData = porData(banco, usadosB, b => b.id)
  for (const s of sistema.filter(s => !usadosS.has(s.id)).sort((a, z) => cents(z.valor) - cents(a.valor))) {
    const cands = (bPorData.get(s.data) ?? []).filter(b => !usadosB.has(b.id) && Math.sign(b.valor) === Math.sign(s.valor))
    if (!cands.length || cands.length > 40) continue
    const sols = subsetsSum(cands, cents(s.valor), 6, 2)
    if (sols.length === 1) { grupos.push({ banco: sols[0], sistema: [s] }); usadosS.add(s.id); for (const b of sols[0]) usadosB.add(b.id) }
  }
  return grupos
}

type SugIA = { banco: string[]; sistema: string[]; motivo: string; confianca: 'alta' | 'media' | 'baixa' }
type Divergencia = { titulo: string; banco: number; sistema: number; diferenca: number; motivo: string; gravidade: 'alta' | 'media' | 'baixa' }
type DetItem = { id: string; valor: number; documento: string | null; pessoa: string | null; hora: string | null }

export function ConfirmacaoConciliacao({ postos, comIA = false }: { postos: PostoRow[]; comIA?: boolean }) {
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [contas, setContas] = useState<Conta[]>([])
  const [contaId, setContaId] = useState('')
  const [dataIni, setDataIni] = useState(HOJE)
  const [dataFim, setDataFim] = useState(HOJE)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [dados, setDados] = useState<Dados | null>(null)
  const [conc, setConc] = useState<Concil[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [selBanco, setSelBanco] = useState<Set<string>>(new Set())
  const [selSistema, setSelSistema] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [iaLoading, setIaLoading] = useState(false)
  const [iaSug, setIaSug] = useState<SugIA[]>([])
  const [iaObs, setIaObs] = useState<string | null>(null)
  const [expDet, setExpDet] = useState<Set<string>>(new Set())
  const [detCache, setDetCache] = useState<Record<string, DetItem[]>>({})
  const [detLoading, setDetLoading] = useState<string | null>(null)
  const [divLoading, setDivLoading] = useState(false)
  const [divergencias, setDivergencias] = useState<Divergencia[]>([])
  const [divObs, setDivObs] = useState<string | null>(null)

  useEffect(() => {
    if (!postoId) { setContas([]); setContaId(''); return }
    fetch(`/api/caixa/conciliacao/contas?posto_id=${postoId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { const c = (j.contas ?? []) as Conta[]; setContas(c); setContaId(c[0]?.id ?? '') })
      .catch(() => { setContas([]); setContaId('') })
  }, [postoId])

  async function batchSalvar(grupos: GrupoAuto[], postoIdArg: string | null): Promise<Concil[]> {
    const r = await fetch('/api/caixa/conciliacao/match/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta_id: contaId, posto_id: postoIdArg, grupos }),
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Erro ao conciliar') }
    const { criados } = await r.json() as { criados: { grupo_id: string; banco: string[]; sistema: string[] }[] }
    return criados.flatMap(g => [
      ...g.banco.map(h => ({ grupo_id: g.grupo_id, lado: 'banco' as const, linha_hash: h, baixado_em: null })),
      ...g.sistema.map(h => ({ grupo_id: g.grupo_id, lado: 'sistema' as const, linha_hash: h, baixado_em: null })),
    ])
  }

  async function buscar() {
    if (!contaId) { setErro('Selecione a conta bancária.'); return }
    setLoading(true); setErro(null); setAviso(null); setSelBanco(new Set()); setSelSistema(new Set())
    try {
      let d: any = null
      if (arquivo) {
        const fd = new FormData(); fd.set('conta_id', contaId); fd.set('file', arquivo)
        const r = await fetch('/api/caixa/conciliacao/upload', { method: 'POST', body: fd })
        const txt = await r.text(); try { d = txt ? JSON.parse(txt) : null } catch {}
        if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
        if (d?.periodo) { setDataIni(d.periodo.ini); setDataFim(d.periodo.fim) }
      } else {
        const p = new URLSearchParams({ conta_id: contaId, data_ini: dataIni, data_fim: dataFim })
        const r = await fetch(`/api/caixa/conciliacao?${p}`, { cache: 'no-store' })
        const txt = await r.text(); try { d = txt ? JSON.parse(txt) : null } catch {}
        if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      }
      if (!d) throw new Error('Resposta vazia do servidor.')
      setDados(d); setConc(d.conciliacoes ?? [])
      // Auto-conciliação por soma (revisável) — roda com os dados recém-carregados.
      const grupos = computeAuto(d.banco, d.sistema, d.conciliacoes ?? [])
      if (grupos.length) {
        try {
          const novos = await batchSalvar(grupos, d.conta.posto_id)
          setConc(prev => [...prev, ...novos])
          setAviso(`${grupos.length} conciliação(ões) automática(s) por soma. Confira e desfaça se algo estiver errado.`)
        } catch (e: any) { setErro('Auto-conciliação: ' + e.message) }
      }
    } catch (e: any) { setErro(e.message); setDados(null) }
    finally { setLoading(false) }
  }

  const grupoDe = useMemo(() => { const m = new Map<string, string>(); for (const c of conc) m.set(`${c.lado}:${c.linha_hash}`, c.grupo_id); return m }, [conc])
  const corDoGrupo = useMemo(() => { const m = new Map<string, string>(); let i = 0; for (const c of conc) if (!m.has(c.grupo_id)) m.set(c.grupo_id, CORES[i++ % CORES.length]); return m }, [conc])
  const bancoGrupo = (id: string) => grupoDe.get(`banco:${id}`)
  const sistGrupo  = (id: string) => grupoDe.get(`sistema:${id}`)

  // Agenda de cartões: recebíveis agrupados pelo DIA que o dinheiro cai (liquidação)
  const cartoesPorLiquida = useMemo(() => {
    const m = new Map<string, Cartao[]>()
    for (const c of dados?.cartoes ?? []) (m.get(c.liquida) ?? m.set(c.liquida, []).get(c.liquida)!).push(c)
    return m
  }, [dados])
  const cartoesPorDia = useMemo(() => [...cartoesPorLiquida.entries()].sort((a, b) => a[0].localeCompare(b[0])), [cartoesPorLiquida])

  // Dado uma linha do banco (recebível de cartão), sugere a(s) DATA(S) da venda:
  // acha os recebíveis que caem no mesmo dia e somam o valor (filtrando a bandeira).
  function dicaVenda(b: LinhaBanco): string | null {
    if (b.valor <= 0) return null
    const doDia = cartoesPorLiquida.get(b.data) ?? []
    if (!doDia.length) return null
    const filtro = bandeiraFiltro(b.descricao)
    const base = filtro && doDia.some(filtro) ? doDia.filter(filtro) : doDia
    const sols = subsetsSum(base, cents(b.valor), 8, 2)
    if (sols.length === 1) {
      const uniq = [...new Set(sols[0].map(c => `${dataBR(c.venda)} ${c.bandeira}`))]
      return 'venda: ' + uniq.join(' + ')
    }
    const datas = [...new Set(base.map(c => c.venda))].sort().slice(0, 4)
    return datas.length ? 'possíveis vendas: ' + datas.map(dataBR).join(', ') : null
  }

  const sugeridos = useMemo(() => {
    if (!dados) return new Map<string, string>()
    const bPend = dados.banco.filter(b => !grupoDe.get(`banco:${b.id}`))
    const sPend = dados.sistema.filter(s => !grupoDe.get(`sistema:${s.id}`))
    const bPor = new Map<number, LinhaBanco[]>(); for (const b of bPend) { const k = cents(b.valor); (bPor.get(k) ?? bPor.set(k, []).get(k)!).push(b) }
    const sPor = new Map<number, LinhaSistema[]>(); for (const s of sPend) { const k = cents(s.valor); (sPor.get(k) ?? sPor.set(k, []).get(k)!).push(s) }
    const sug = new Map<string, string>()
    for (const [k, bs] of bPor) { const ss = sPor.get(k); if (bs.length === 1 && ss && ss.length === 1) sug.set(bs[0].id, ss[0].id) }
    return sug
  }, [dados, grupoDe])
  const sugBySist = useMemo(() => new Set([...sugeridos.values()]), [sugeridos])

  function toggle(lado: 'banco' | 'sistema', id: string) {
    const set = lado === 'banco' ? selBanco : selSistema
    const setter = lado === 'banco' ? setSelBanco : setSelSistema
    const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); setter(next)
  }

  async function conciliarSelecionados() {
    if (!dados) return
    const bLines = dados.banco.filter(b => selBanco.has(b.id) && !bancoGrupo(b.id))
    const sLines = dados.sistema.filter(s => selSistema.has(s.id) && !sistGrupo(s.id))
    if (!bLines.length || !sLines.length) { setErro('Selecione linhas dos dois lados.'); return }
    setSalvando(true); setErro(null)
    try {
      const novos = await batchSalvar([{ banco: bLines, sistema: sLines }], dados.conta.posto_id)
      setConc(prev => [...prev, ...novos]); setSelBanco(new Set()); setSelSistema(new Set())
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function conciliarSugeridos() {
    if (!dados || !sugeridos.size) return
    setSalvando(true); setErro(null)
    try {
      const gs: GrupoAuto[] = []
      for (const [bId, sId] of sugeridos) {
        const b = dados.banco.find(x => x.id === bId); const s = dados.sistema.find(x => x.id === sId)
        if (b && s) gs.push({ banco: [b], sistema: [s] })
      }
      const novos = await batchSalvar(gs, dados.conta.posto_id)
      setConc(prev => [...prev, ...novos])
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function autoConciliar() {
    if (!dados) return
    const gs = computeAuto(dados.banco, dados.sistema, conc)
    if (!gs.length) { setAviso('Nada novo para auto-conciliar por soma.'); return }
    setSalvando(true); setErro(null)
    try {
      const novos = await batchSalvar(gs, dados.conta.posto_id)
      setConc(prev => [...prev, ...novos]); setAviso(`${gs.length} conciliação(ões) automática(s) por soma.`)
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function desfazerGrupo(grupoId: string) {
    setSalvando(true)
    try {
      await fetch('/api/caixa/conciliacao/match', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_id: contaId, grupo_id: grupoId }),
      })
      setConc(prev => prev.filter(c => c.grupo_id !== grupoId))
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function analisarIA() {
    if (!dados) return
    const bPend = dados.banco.filter(b => !bancoGrupo(b.id)).map(b => ({ id: b.id, data: b.data, descricao: b.descricao, valor: b.valor }))
    const sPend = dados.sistema.filter(s => !sistGrupo(s.id)).map(s => ({ id: s.id, data: s.data, descricao: s.descricao, valor: s.valor }))
    if (!bPend.length || !sPend.length) { setIaObs('Não há pendentes dos dois lados para a IA analisar.'); setIaSug([]); return }
    setIaLoading(true); setErro(null); setIaObs(null)
    try {
      const r = await fetch('/api/caixa/conciliacao/ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banco: bPend, sistema: sPend }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro na IA')
      setIaSug(j.sugestoes ?? [])
      setIaObs((j.sugestoes?.length ? `${j.sugestoes.length} sugestão(ões) da IA — confira e confirme.` : 'A IA não encontrou correspondências plausíveis.')
        + (j.truncado ? ' (analisou as primeiras 80 de cada lado; reduza o período p/ cobrir tudo)' : '')
        + (j.observacao ? `  ·  ${j.observacao}` : ''))
    } catch (e: any) { setErro(e.message) } finally { setIaLoading(false) }
  }

  async function conciliarIA(sug: SugIA, idx: number) {
    if (!dados) return
    const bLines = dados.banco.filter(b => sug.banco.includes(b.id) && !bancoGrupo(b.id))
    const sLines = dados.sistema.filter(s => sug.sistema.includes(s.id) && !sistGrupo(s.id))
    if (!bLines.length || !sLines.length) { descartarIA(idx); return }
    setSalvando(true)
    try {
      const novos = await batchSalvar([{ banco: bLines, sistema: sLines }], dados.conta.posto_id)
      setConc(prev => [...prev, ...novos]); descartarIA(idx)
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }
  function descartarIA(idx: number) { setIaSug(prev => prev.filter((_, i) => i !== idx)) }

  const keyCartao = (c: Cartao) => `${c.liquida}|${c.venda}|${c.bandeira}`
  async function toggleDetalhe(c: Cartao) {
    const k = keyCartao(c)
    const abrir = !expDet.has(k)
    setExpDet(prev => { const n = new Set(prev); abrir ? n.add(k) : n.delete(k); return n })
    if (abrir && !detCache[k]) {
      setDetLoading(k)
      try {
        const p = new URLSearchParams({ conta_id: contaId, liquida: c.liquida, venda: c.venda, bandeira: c.bandeira })
        const r = await fetch(`/api/caixa/conciliacao/cartoes-detalhe?${p}`, { cache: 'no-store' })
        const j = await r.json()
        if (r.ok) setDetCache(prev => ({ ...prev, [k]: j.itens ?? [] }))
      } catch { /* ignora */ } finally { setDetLoading(null) }
    }
  }

  async function analisarDivergencias() {
    if (!dados) return
    const bankCards = dados.banco.filter(b => b.valor > 0 && bandeiraFiltro(b.descricao)).map(b => ({ data: b.data, descricao: b.descricao, valor: b.valor }))
    setDivLoading(true); setErro(null); setDivObs(null); setDivergencias([])
    try {
      const r = await fetch('/api/caixa/conciliacao/ia-divergencia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartoes: dados.cartoes ?? [], banco: bankCards }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro na IA')
      setDivergencias(j.divergencias ?? [])
      setDivObs((j.divergencias?.length ? `${j.divergencias.length} divergência(s) possível(is) — confira.` : 'Nenhuma divergência aparente entre banco e recebíveis.') + (j.observacao ? `  ·  ${j.observacao}` : ''))
    } catch (e: any) { setErro(e.message) } finally { setDivLoading(false) }
  }

  const selInfo = useMemo(() => {
    if (!dados) return null
    const sb = dados.banco.filter(b => selBanco.has(b.id)).reduce((s, b) => s + b.valor, 0)
    const ss = dados.sistema.filter(s => selSistema.has(s.id)).reduce((a, s) => a + s.valor, 0)
    return { sb, ss, nb: selBanco.size, ns: selSistema.size, confere: Math.abs(Math.abs(sb) - Math.abs(ss)) < 0.01 }
  }, [dados, selBanco, selSistema])

  const totais = useMemo(() => {
    if (!dados) return null
    const gr = new Set(conc.map(c => c.grupo_id)).size
    return {
      somaB: dados.banco.reduce((s, b) => s + b.valor, 0), somaS: dados.sistema.reduce((s, x) => s + x.valor, 0),
      grupos: gr, pendB: dados.banco.filter(b => !grupoDe.get(`banco:${b.id}`)).length,
      pendS: dados.sistema.filter(s => !grupoDe.get(`sistema:${s.id}`)).length,
    }
  }, [dados, conc, grupoDe])

  return (
    <div className="p-4 md:p-6 space-y-5 pb-24">
      <p className="text-[13px] text-gray-500">
        Extrato do <b>banco</b> × <b>AUTOSYSTEM</b>. O sistema já <b>auto-concilia por soma</b> (1 linha = soma de várias)
        quando o valor fecha sem ambiguidade; você revisa. Na agenda de <b>Cartões a baixar</b>, clique num dia para ver
        venda por venda e as divergências apontadas pela IA.
      </p>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-end gap-3 flex-wrap">
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
          <select value={postoId} onChange={e => setPostoId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
            {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Conta bancária</label>
          <select value={contaId} onChange={e => setContaId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
            {contas.length === 0 && <option value="">Nenhuma conta</option>}
            {contas.map(c => <option key={c.id} value={c.id}>{c.banco}{c.conta ? ` — ${c.conta}` : ''}</option>)}
          </select></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Extrato OFX</label>
          <div className="flex items-center gap-2">
            <label className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
              <Upload className="w-4 h-4" /> {arquivo ? 'Trocar OFX' : 'Anexar OFX'}
              <input type="file" accept=".ofx" className="hidden" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            {arquivo && (
              <span className="text-[12px] text-gray-500 flex items-center gap-1 max-w-[150px]">
                <span className="truncate">{arquivo.name}</span>
                <button onClick={() => setArquivo(null)} title="Remover" className="text-gray-400 hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </span>
            )}
          </div>
        </div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">De</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} disabled={!!arquivo} className="border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400" /></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} disabled={!!arquivo} className="border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400" /></div>
        <button onClick={buscar} disabled={loading} className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </div>
      {arquivo && <p className="-mt-2 text-[11px] text-gray-400">Com OFX anexado, o período é definido automaticamente pelas datas do extrato.</p>}

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}
      {aviso && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2"><Wand2 className="w-4 h-4" />{aviso}</div>}

      {dados && totais && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label="Total banco" valor={money(totais.somaB)} cls="text-blue-700" />
            <Card label="Total sistema" valor={money(totais.somaS)} cls="text-indigo-700" />
            <Card label="Conciliações" valor={String(totais.grupos)} cls="text-emerald-600" />
            <Card label="Pendentes (banco/sist.)" valor={`${totais.pendB} / ${totais.pendS}`} cls="text-amber-600" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={autoConciliar} disabled={salvando} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              <Wand2 className="w-4 h-4" /> Auto-conciliar por soma
            </button>
            {comIA && (
              <button onClick={analisarIA} disabled={iaLoading || salvando} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5">
                {iaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analisar pendentes com IA
              </button>
            )}
            {sugeridos.size > 0 && (
              <button onClick={conciliarSugeridos} disabled={salvando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                <Link2 className="w-4 h-4" /> Conciliar sugeridos 1:1 ({sugeridos.size})
              </button>
            )}
            {dados.arquivos.erro > 0 && <span className="text-[12px] text-amber-600">⚠ {dados.arquivos.erro} arquivo(s) de extrato não lidos</span>}
            {salvando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          {/* Sugestões da IA (só no modo conciliador) */}
          {comIA && iaObs && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-sm text-violet-700 flex items-center gap-2"><Sparkles className="w-4 h-4 flex-shrink-0" />{iaObs}</div>
          )}
          {comIA && iaSug.length > 0 && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-violet-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <span className="text-[14px] font-bold text-violet-800">Sugestões da IA</span>
                <span className="text-[11px] text-violet-500">confirme cada uma — nada é conciliado sozinho</span>
              </div>
              <ul className="divide-y divide-violet-100">
                {iaSug.map((sug, idx) => {
                  const bL = dados.banco.filter(b => sug.banco.includes(b.id))
                  const sL = dados.sistema.filter(s => sug.sistema.includes(s.id))
                  const cor = sug.confianca === 'alta' ? 'bg-emerald-100 text-emerald-700' : sug.confianca === 'media' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  return (
                    <li key={idx} className="px-5 py-3 flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-[240px] space-y-1">
                        <div className="text-[12px]"><span className="text-blue-600 font-semibold">Banco:</span> {bL.map(b => <span key={b.id} className="ml-1 text-gray-600">{dataBR(b.data)} <b>{money(b.valor)}</b> · {b.descricao}</span>)}</div>
                        <div className="text-[12px]"><span className="text-indigo-600 font-semibold">Sistema:</span> {sL.map(s => <span key={s.id} className="ml-1 text-gray-600">{dataBR(s.data)} <b>{money(s.valor)}</b> · {s.descricao}</span>)}</div>
                        <div className="text-[12px] text-violet-700 flex items-center gap-1.5 flex-wrap"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${cor}`}>{sug.confianca}</span>{sug.motivo}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => conciliarIA(sug, idx)} disabled={salvando} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[12px] font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Conciliar</button>
                        <button onClick={() => descartarIA(idx)} className="px-2.5 py-1.5 text-gray-400 hover:text-red-500 text-[12px] flex items-center gap-1"><X className="w-3.5 h-3.5" /> Descartar</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Agenda de cartões: de qual dia é o cartão que cai no banco (só com IA) */}
          {comIA && cartoesPorDia.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2 flex-wrap">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                <span className="text-[14px] font-bold text-amber-800">Cartões a baixar — por dia que o dinheiro cai</span>
                <span className="text-[11px] text-amber-500">clique num cartão para ver venda por venda</span>
                <button onClick={analisarDivergencias} disabled={divLoading}
                  className="ml-auto px-3 py-1.5 bg-violet-600 text-white rounded-lg text-[12px] font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5">
                  {divLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Divergências (IA)
                </button>
              </div>

              {divObs && (
                <div className="px-5 py-2 bg-violet-50 border-b border-violet-100 text-[12px] text-violet-700 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 flex-shrink-0" />{divObs}</div>
              )}
              {divergencias.length > 0 && (
                <ul className="divide-y divide-violet-100 bg-violet-50/50 border-b border-violet-100">
                  {divergencias.map((d, i) => {
                    const cor = d.gravidade === 'alta' ? 'bg-red-100 text-red-700' : d.gravidade === 'media' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    return (
                      <li key={i} className="px-5 py-2 text-[12px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <AlertTriangle className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                          <span className="font-semibold text-gray-800">{d.titulo}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${cor}`}>{d.gravidade}</span>
                          {!!d.diferenca && <span className="text-gray-500">banco {money(d.banco)} × sistema {money(d.sistema)} = <b className="text-red-600">{money(d.diferenca)}</b></span>}
                        </div>
                        <p className="text-gray-600 ml-5">{d.motivo}</p>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="divide-y divide-amber-100 max-h-[460px] overflow-y-auto">
                {cartoesPorDia.map(([dia, lista]) => {
                  const tot = lista.reduce((s, c) => s + c.valor, 0)
                  return (
                    <div key={dia} className="px-5 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-bold text-gray-800">Cai em {dataBR(dia)}</span>
                        <span className="text-[12px] text-amber-700 font-semibold">total {money(tot)}</span>
                      </div>
                      <ul className="ml-1 space-y-0.5">
                        {lista.map((c, i) => {
                          const k = keyCartao(c); const aberto = expDet.has(k); const itens = detCache[k]
                          return (
                            <li key={i}>
                              <button onClick={() => toggleDetalhe(c)} className="w-full text-left text-[12px] text-gray-600 flex items-center gap-2 flex-wrap hover:bg-amber-100/50 rounded px-1 py-0.5">
                                {aberto ? <ChevronDown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                <span className="font-semibold text-gray-700">{c.bandeira}</span>
                                <span className="text-gray-400">· venda {dataBR(c.venda)}</span>
                                <span className="font-semibold text-gray-800">{money(c.valor)}</span>
                                <span className="text-[11px] text-gray-400">({c.qtd} venda{c.qtd > 1 ? 's' : ''})</span>
                              </button>
                              {aberto && (
                                <div className="ml-6 my-1 border-l-2 border-amber-200 pl-3">
                                  {detLoading === k ? (
                                    <p className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> carregando…</p>
                                  ) : itens && itens.length ? (
                                    <ul className="space-y-0.5">
                                      {itens.map(it => (
                                        <li key={it.id} className="text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
                                          <CircleDot className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                                          <span className="font-semibold text-gray-800">{money(it.valor)}</span>
                                          {it.documento && <span className="text-gray-400">NSU {it.documento}</span>}
                                          {it.hora && <span className="text-gray-400">{it.hora}</span>}
                                          {it.pessoa && <span className="text-gray-400 truncate">{it.pessoa}</span>}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-[11px] text-gray-400">sem detalhamento venda a venda</p>
                                  )}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* D-Para */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Coluna titulo="Extrato do banco" icone={<Building2 className="w-4 h-4 text-blue-500" />} vazio="Nenhuma linha do banco no período (extrato anexado?)">
              {dados.banco.map(b => { const g = bancoGrupo(b.id)
                return <Linha key={b.id} data={b.data} descricao={b.descricao} valor={b.valor}
                  conciliado={!!g} cor={g ? corDoGrupo.get(g) : undefined} sugerido={sugeridos.has(b.id)} selecionado={selBanco.has(b.id)}
                  dica={comIA && !g ? dicaVenda(b) : undefined}
                  onToggle={() => toggle('banco', b.id)} onDesfazer={g ? () => desfazerGrupo(g) : undefined} /> })}
            </Coluna>
            <Coluna titulo="Extrato do AUTOSYSTEM" icone={<Cpu className="w-4 h-4 text-indigo-500" />} vazio="Nenhum lançamento na conta no período">
              {dados.sistema.map(s => { const g = sistGrupo(s.id)
                return <Linha key={s.id} data={s.data} descricao={s.descricao} valor={s.valor}
                  conciliado={!!g} cor={g ? corDoGrupo.get(g) : undefined} sugerido={sugBySist.has(s.id)} selecionado={selSistema.has(s.id)}
                  onToggle={() => toggle('sistema', s.id)} onDesfazer={g ? () => desfazerGrupo(g) : undefined} /> })}
            </Coluna>
          </div>
        </>
      )}

      {!dados && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Selecione posto, conta e período e clique em Buscar.
        </div>
      )}

      {selInfo && (selInfo.nb > 0 || selInfo.ns > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg px-4 md:px-8 py-3 flex items-center gap-4 flex-wrap z-20">
          <span className="text-[13px] text-gray-600">Banco: <b>{selInfo.nb}</b> ({money(selInfo.sb)}) &nbsp;·&nbsp; Sistema: <b>{selInfo.ns}</b> ({money(selInfo.ss)})</span>
          {selInfo.nb > 0 && selInfo.ns > 0 && (
            <span className={`text-[12px] font-semibold px-2 py-0.5 rounded ${selInfo.confere ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {selInfo.confere ? 'valores conferem ✓' : `difere ${money(Math.abs(Math.abs(selInfo.sb) - Math.abs(selInfo.ss)))}`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { setSelBanco(new Set()); setSelSistema(new Set()) }} className="px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-700">Limpar</button>
            <button onClick={conciliarSelecionados} disabled={salvando || selInfo.nb === 0 || selInfo.ns === 0}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5">
              <Link2 className="w-4 h-4" /> Conciliar selecionados
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ label, valor, cls }: { label: string; valor: string; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`text-[16px] font-bold mt-0.5 ${cls}`}>{valor}</p>
    </div>
  )
}

function Coluna({ titulo, icone, vazio, children }: { titulo: string; icone: React.ReactNode; vazio: string; children: React.ReactNode }) {
  const arr = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        {icone}<span className="text-[13px] font-bold text-gray-700">{titulo}</span>
        <span className="ml-auto text-[11px] text-gray-400">{arr.length} linha(s)</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-[640px] overflow-y-auto">
        {arr.length ? children : <p className="px-4 py-8 text-center text-[12px] text-gray-400">{vazio}</p>}
      </div>
    </div>
  )
}

function Linha({ data, descricao, valor, conciliado, cor, sugerido, selecionado, dica, onToggle, onDesfazer }: {
  data: string; descricao: string; valor: number
  conciliado: boolean; cor?: string; sugerido: boolean; selecionado: boolean
  dica?: string | null
  onToggle: () => void; onDesfazer?: () => void
}) {
  const pos = valor >= 0
  const bg = conciliado ? `${cor} border-l-4` : selecionado ? 'bg-blue-100 border-l-4 border-l-blue-400' : sugerido ? 'bg-amber-50/60 border-l-4 border-l-transparent' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
  return (
    <div className={`px-3 py-2 flex items-center gap-2.5 text-[13px] ${bg}`}>
      {conciliado ? (
        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      ) : (
        <input type="checkbox" checked={selecionado} onChange={onToggle} className="w-4 h-4 rounded accent-emerald-600 flex-shrink-0 cursor-pointer mt-0.5 self-start" />
      )}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={conciliado ? undefined : onToggle}>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-[11px] w-[52px] flex-shrink-0">{dataBR(data)}</span>
          <span className="truncate text-gray-700">{descricao}</span>
        </div>
        {dica && <div className="ml-[60px] text-[11px] text-amber-700 flex items-center gap-1"><CalendarClock className="w-3 h-3 flex-shrink-0" />{dica}</div>}
      </div>
      <span className={`font-semibold flex-shrink-0 self-start mt-0.5 ${pos ? 'text-emerald-700' : 'text-red-600'}`}>{money(valor)}</span>
      {conciliado && onDesfazer && (
        <button onClick={onDesfazer} title="Desfazer conciliação" className="text-gray-300 hover:text-red-500 flex-shrink-0 self-start mt-0.5"><Link2Off className="w-3.5 h-3.5" /></button>
      )}
    </div>
  )
}
