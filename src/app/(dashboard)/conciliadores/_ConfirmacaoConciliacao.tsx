'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Link2Off, Wand2, Check, Building2, Cpu, Link2, Download, ClipboardCheck, CircleDot } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Conta = { id: string; banco: string; conta: string | null }
type LinhaBanco = { id: string; data: string; descricao: string; valor: number }
type LinhaSistema = { id: string; data: string; descricao: string; documento: string | null; valor: number; direcao: 'entrada' | 'saida' }
type Concil = { grupo_id: string; lado: 'banco' | 'sistema'; linha_hash: string; baixado_em: string | null }
type Dados = {
  conta: { id: string; banco: string; numero: string | null; posto: string; posto_id: string | null }
  periodo: { ini: string; fim: string }
  banco: LinhaBanco[]
  sistema: LinhaSistema[]
  conciliacoes: Concil[]
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

export function ConfirmacaoConciliacao({ postos }: { postos: PostoRow[] }) {
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [contas, setContas] = useState<Conta[]>([])
  const [contaId, setContaId] = useState('')
  const [dataIni, setDataIni] = useState(HOJE)
  const [dataFim, setDataFim] = useState(HOJE)
  const [dados, setDados] = useState<Dados | null>(null)
  const [conc, setConc] = useState<Concil[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [selBanco, setSelBanco] = useState<Set<string>>(new Set())
  const [selSistema, setSelSistema] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

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
      const p = new URLSearchParams({ conta_id: contaId, data_ini: dataIni, data_fim: dataFim })
      const r = await fetch(`/api/caixa/conciliacao?${p}`, { cache: 'no-store' })
      const txt = await r.text()
      let d: any = null; try { d = txt ? JSON.parse(txt) : null } catch {}
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
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
  const baixadoDoGrupo = useMemo(() => { const m = new Map<string, boolean>(); for (const c of conc) if (c.baixado_em) m.set(c.grupo_id, true); return m }, [conc])
  const bancoGrupo = (id: string) => grupoDe.get(`banco:${id}`)
  const sistGrupo  = (id: string) => grupoDe.get(`sistema:${id}`)

  // Grupos montados (para o painel "Baixar no AUTOSYSTEM")
  const grupos = useMemo(() => {
    if (!dados) return [] as { grupo_id: string; banco: LinhaBanco[]; sistema: LinhaSistema[]; baixado: boolean }[]
    const mB = new Map(dados.banco.map(b => [b.id, b])); const mS = new Map(dados.sistema.map(s => [s.id, s]))
    const g = new Map<string, { grupo_id: string; banco: LinhaBanco[]; sistema: LinhaSistema[]; baixado: boolean }>()
    for (const c of conc) {
      if (!g.has(c.grupo_id)) g.set(c.grupo_id, { grupo_id: c.grupo_id, banco: [], sistema: [], baixado: !!baixadoDoGrupo.get(c.grupo_id) })
      const grp = g.get(c.grupo_id)!
      if (c.lado === 'banco') { const b = mB.get(c.linha_hash); if (b) grp.banco.push(b) }
      else { const s = mS.get(c.linha_hash); if (s) grp.sistema.push(s) }
    }
    return [...g.values()].filter(x => x.sistema.length)
  }, [dados, conc, baixadoDoGrupo])
  const aBaixar = grupos.filter(g => !g.baixado)

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

  async function marcarBaixado(grupoId: string, baixado: boolean) {
    setSalvando(true)
    try {
      await fetch('/api/caixa/conciliacao/baixar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_id: contaId, grupo_id: grupoId, baixado }),
      })
      setConc(prev => prev.map(c => c.grupo_id === grupoId ? { ...c, baixado_em: baixado ? new Date().toISOString() : null } : c))
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function exportarPDF() {
    if (!dados || !aBaixar.length) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const M = 14, MAX_Y = 285; let y = 16
    const check = (h: number) => { if (y + h > MAX_Y) { doc.addPage(); y = 16 } }
    const w = (t: string, o: { s?: number; b?: boolean; c?: [number, number, number]; ind?: number } = {}) => {
      const { s = 9, b = false, c = [40, 40, 40], ind = 0 } = o
      doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(s); doc.setTextColor(...c)
      for (const ln of doc.splitTextToSize(t, 180 - ind) as string[]) { check(s * 0.5); doc.text(ln, M + ind, y); y += s * 0.5 + 1.4 }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(150, 20, 20)
    doc.text('Baixar no AUTOSYSTEM', M, y); y += 7
    w(`${dados.conta.posto} — ${dados.conta.banco}${dados.conta.numero ? ` (${dados.conta.numero})` : ''}   ·   ${dataBR(dados.periodo.ini)} a ${dataBR(dados.periodo.fim)}`, { s: 11, c: [50, 50, 50] })
    w(`Gerado em ${new Date().toLocaleString('pt-BR')}  ·  ${aBaixar.length} conciliação(ões) a baixar`, { s: 8, c: [140, 140, 140] }); y += 2
    for (const g of aBaixar) {
      check(10)
      const tot = g.sistema.reduce((s, x) => s + x.valor, 0)
      const ref = g.banco.map(b => `${dataBR(b.data)} ${money(b.valor)}`).join(' + ')
      w(`Banco: ${ref}  →  baixar ${money(tot)} no sistema:`, { s: 9, b: true, c: [20, 20, 20] })
      for (const s of g.sistema) w(`• ${dataBR(s.data)}  ${money(s.valor)}  ${s.documento ? `[doc ${s.documento}] ` : ''}${s.descricao}`, { s: 8.5, ind: 4, c: [60, 60, 60] })
      y += 2
    }
    doc.save(`baixar-autosystem-${dados.conta.posto.replace(/[^\w]+/g, '_')}-${dados.periodo.ini}.pdf`)
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
      pendS: dados.sistema.filter(s => !grupoDe.get(`sistema:${s.id}`)).length, aBaixar: aBaixar.length,
    }
  }, [dados, conc, grupoDe, aBaixar])

  return (
    <div className="p-4 md:p-6 space-y-5 pb-24">
      <p className="text-[13px] text-gray-500">
        Extrato do <b>banco</b> × <b>AUTOSYSTEM</b>. O sistema já <b>auto-concilia por soma</b> (1 linha = soma de várias)
        quando o valor fecha sem ambiguidade; você revisa. Depois, o painel <b>Baixar no AUTOSYSTEM</b> te avisa o que baixar no ERP.
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
        <div><label className="block text-xs font-medium text-gray-700 mb-1">De</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
        <button onClick={buscar} disabled={loading} className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}
      {aviso && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2"><Wand2 className="w-4 h-4" />{aviso}</div>}

      {dados && totais && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card label="Total banco" valor={money(totais.somaB)} cls="text-blue-700" />
            <Card label="Total sistema" valor={money(totais.somaS)} cls="text-indigo-700" />
            <Card label="Conciliações" valor={String(totais.grupos)} cls="text-emerald-600" />
            <Card label="Pendentes (banco/sist.)" valor={`${totais.pendB} / ${totais.pendS}`} cls="text-amber-600" />
            <Card label="A baixar no AUTOSYSTEM" valor={String(totais.aBaixar)} cls="text-rose-700" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={autoConciliar} disabled={salvando} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              <Wand2 className="w-4 h-4" /> Auto-conciliar por soma
            </button>
            {sugeridos.size > 0 && (
              <button onClick={conciliarSugeridos} disabled={salvando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                <Link2 className="w-4 h-4" /> Conciliar sugeridos 1:1 ({sugeridos.size})
              </button>
            )}
            {dados.arquivos.erro > 0 && <span className="text-[12px] text-amber-600">⚠ {dados.arquivos.erro} arquivo(s) de extrato não lidos</span>}
            {salvando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          {/* Painel: Baixar no AUTOSYSTEM */}
          {grupos.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-rose-100 flex items-center gap-2 flex-wrap">
                <ClipboardCheck className="w-4 h-4 text-rose-600" />
                <span className="text-[14px] font-bold text-rose-800">Baixar no AUTOSYSTEM</span>
                <span className="text-[11px] text-rose-500">{aBaixar.length} pendente(s) · faça a baixa no ERP e marque como feito</span>
                {aBaixar.length > 0 && (
                  <button onClick={exportarPDF} className="ml-auto px-3 py-1.5 border border-rose-300 text-rose-700 rounded-lg text-[12px] font-medium hover:bg-rose-100 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Exportar PDF
                  </button>
                )}
              </div>
              {aBaixar.length === 0 ? (
                <p className="px-5 py-6 text-center text-[13px] text-emerald-700 font-medium">Tudo baixado ✓</p>
              ) : (
                <ul className="divide-y divide-rose-100">
                  {aBaixar.map(g => {
                    const tot = g.sistema.reduce((s, x) => s + x.valor, 0)
                    return (
                      <li key={g.grupo_id} className="px-5 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] text-gray-500">Banco:</span>
                          {g.banco.map(b => <span key={b.id} className="text-[12px] text-gray-600">{dataBR(b.data)} <b>{money(b.valor)}</b></span>)}
                          <span className="text-gray-300">→</span>
                          <span className="text-[13px] font-bold text-rose-800">baixar {money(tot)}</span>
                          <button onClick={() => marcarBaixado(g.grupo_id, true)} disabled={salvando}
                            className="ml-auto px-3 py-1 bg-emerald-600 text-white rounded-lg text-[12px] font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Já baixei
                          </button>
                        </div>
                        <ul className="mt-1.5 ml-3 space-y-0.5">
                          {g.sistema.map(s => (
                            <li key={s.id} className="text-[12px] text-gray-600 flex items-center gap-2">
                              <CircleDot className="w-3 h-3 text-rose-400 flex-shrink-0" />
                              <span className="text-gray-400 w-[52px] flex-shrink-0">{dataBR(s.data)}</span>
                              <span className="font-semibold text-gray-700 flex-shrink-0">{money(s.valor)}</span>
                              {s.documento && <span className="text-[11px] text-gray-400 flex-shrink-0">doc {s.documento}</span>}
                              <span className="truncate">{s.descricao}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    )
                  })}
                </ul>
              )}
              {grupos.some(g => g.baixado) && (
                <div className="px-5 py-2 border-t border-rose-100 text-[12px] text-gray-500">
                  {grupos.filter(g => g.baixado).length} já baixado(s) no AUTOSYSTEM ✓
                </div>
              )}
            </div>
          )}

          {/* D-Para */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Coluna titulo="Extrato do banco" icone={<Building2 className="w-4 h-4 text-blue-500" />} vazio="Nenhuma linha do banco no período (extrato anexado?)">
              {dados.banco.map(b => { const g = bancoGrupo(b.id)
                return <Linha key={b.id} data={b.data} descricao={b.descricao} valor={b.valor}
                  conciliado={!!g} cor={g ? corDoGrupo.get(g) : undefined} baixado={g ? !!baixadoDoGrupo.get(g) : false} sugerido={sugeridos.has(b.id)} selecionado={selBanco.has(b.id)}
                  onToggle={() => toggle('banco', b.id)} onDesfazer={g ? () => desfazerGrupo(g) : undefined} /> })}
            </Coluna>
            <Coluna titulo="Extrato do AUTOSYSTEM" icone={<Cpu className="w-4 h-4 text-indigo-500" />} vazio="Nenhum lançamento na conta no período">
              {dados.sistema.map(s => { const g = sistGrupo(s.id)
                return <Linha key={s.id} data={s.data} descricao={s.descricao} valor={s.valor}
                  conciliado={!!g} cor={g ? corDoGrupo.get(g) : undefined} baixado={g ? !!baixadoDoGrupo.get(g) : false} sugerido={sugBySist.has(s.id)} selecionado={selSistema.has(s.id)}
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

function Linha({ data, descricao, valor, conciliado, cor, baixado, sugerido, selecionado, onToggle, onDesfazer }: {
  data: string; descricao: string; valor: number
  conciliado: boolean; cor?: string; baixado: boolean; sugerido: boolean; selecionado: boolean
  onToggle: () => void; onDesfazer?: () => void
}) {
  const pos = valor >= 0
  const bg = conciliado ? `${cor} border-l-4` : selecionado ? 'bg-blue-100 border-l-4 border-l-blue-400' : sugerido ? 'bg-amber-50/60 border-l-4 border-l-transparent' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
  return (
    <div className={`px-3 py-2 flex items-center gap-2.5 text-[13px] ${bg}`}>
      {conciliado ? (
        baixado ? <ClipboardCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      ) : (
        <input type="checkbox" checked={selecionado} onChange={onToggle} className="w-4 h-4 rounded accent-emerald-600 flex-shrink-0 cursor-pointer" />
      )}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={conciliado ? undefined : onToggle}>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-[11px] w-[52px] flex-shrink-0">{dataBR(data)}</span>
          <span className="truncate text-gray-700">{descricao}</span>
        </div>
      </div>
      <span className={`font-semibold flex-shrink-0 ${pos ? 'text-emerald-700' : 'text-red-600'}`}>{money(valor)}</span>
      {conciliado && onDesfazer && (
        <button onClick={onDesfazer} title="Desfazer conciliação" className="text-gray-300 hover:text-red-500 flex-shrink-0"><Link2Off className="w-3.5 h-3.5" /></button>
      )}
    </div>
  )
}
