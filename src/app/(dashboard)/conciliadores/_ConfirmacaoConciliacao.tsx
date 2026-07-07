'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Link2Off, Wand2, Check, Building2, Cpu, Link2 } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Conta = { id: string; banco: string; conta: string | null }
type LinhaBanco = { id: string; data: string; descricao: string; valor: number }
type LinhaSistema = { id: string; data: string; descricao: string; valor: number; direcao: 'entrada' | 'saida' }
type Concil = { grupo_id: string; lado: 'banco' | 'sistema'; linha_hash: string }
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

// paleta de cores por grupo conciliado
const CORES = [
  'bg-purple-50 border-l-purple-400', 'bg-cyan-50 border-l-cyan-400', 'bg-pink-50 border-l-pink-400',
  'bg-lime-50 border-l-lime-400', 'bg-teal-50 border-l-teal-400', 'bg-fuchsia-50 border-l-fuchsia-400',
  'bg-sky-50 border-l-sky-400', 'bg-amber-50 border-l-amber-400',
]

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

  async function buscar() {
    if (!contaId) { setErro('Selecione a conta bancária.'); return }
    setLoading(true); setErro(null); setSelBanco(new Set()); setSelSistema(new Set())
    try {
      const p = new URLSearchParams({ conta_id: contaId, data_ini: dataIni, data_fim: dataFim })
      const r = await fetch(`/api/caixa/conciliacao?${p}`, { cache: 'no-store' })
      const txt = await r.text()
      let d: any = null; try { d = txt ? JSON.parse(txt) : null } catch {}
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      setDados(d); setConc(d.conciliacoes ?? [])
    } catch (e: any) { setErro(e.message); setDados(null) }
    finally { setLoading(false) }
  }

  // linha (lado:hash) -> grupo_id
  const grupoDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of conc) m.set(`${c.lado}:${c.linha_hash}`, c.grupo_id)
    return m
  }, [conc])
  // grupo_id -> cor (ordem de aparição)
  const corDoGrupo = useMemo(() => {
    const m = new Map<string, string>(); let i = 0
    for (const c of conc) if (!m.has(c.grupo_id)) m.set(c.grupo_id, CORES[i++ % CORES.length])
    return m
  }, [conc])

  const bancoGrupo = (id: string) => grupoDe.get(`banco:${id}`)
  const sistGrupo  = (id: string) => grupoDe.get(`sistema:${id}`)

  // Sugestões 1:1 por valor absoluto (só pendentes, uma de cada lado)
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

  async function conciliar(bLines: LinhaBanco[], sLines: LinhaSistema[]) {
    if (!dados || !bLines.length || !sLines.length) return null
    const r = await fetch('/api/caixa/conciliacao/match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conta_id: contaId, posto_id: dados.conta.posto_id, banco: bLines, sistema: sLines }),
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Erro ao conciliar') }
    const { grupo_id } = await r.json()
    return grupo_id as string
  }

  async function conciliarSelecionados() {
    if (!dados) return
    const bLines = dados.banco.filter(b => selBanco.has(b.id) && !bancoGrupo(b.id))
    const sLines = dados.sistema.filter(s => selSistema.has(s.id) && !sistGrupo(s.id))
    if (!bLines.length || !sLines.length) { setErro('Selecione linhas dos dois lados.'); return }
    setSalvando(true); setErro(null)
    try {
      const gid = await conciliar(bLines, sLines)
      if (gid) {
        const novos: Concil[] = [
          ...bLines.map(b => ({ grupo_id: gid, lado: 'banco' as const, linha_hash: b.id })),
          ...sLines.map(s => ({ grupo_id: gid, lado: 'sistema' as const, linha_hash: s.id })),
        ]
        setConc(prev => [...prev, ...novos])
        setSelBanco(new Set()); setSelSistema(new Set())
      }
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function conciliarSugeridos() {
    if (!dados || !sugeridos.size) return
    setSalvando(true); setErro(null)
    try {
      const novos: Concil[] = []
      await Promise.all([...sugeridos].map(async ([bId, sId]) => {
        const b = dados.banco.find(x => x.id === bId); const s = dados.sistema.find(x => x.id === sId)
        if (!b || !s) return
        const gid = await conciliar([b], [s])
        if (gid) novos.push({ grupo_id: gid, lado: 'banco', linha_hash: bId }, { grupo_id: gid, lado: 'sistema', linha_hash: sId })
      }))
      setConc(prev => [...prev, ...novos])
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

  const selInfo = useMemo(() => {
    if (!dados) return null
    const sb = dados.banco.filter(b => selBanco.has(b.id)).reduce((s, b) => s + b.valor, 0)
    const ss = dados.sistema.filter(s => selSistema.has(s.id)).reduce((a, s) => a + s.valor, 0)
    return { sb, ss, nb: selBanco.size, ns: selSistema.size, confere: Math.abs(Math.abs(sb) - Math.abs(ss)) < 0.01 }
  }, [dados, selBanco, selSistema])

  const totais = useMemo(() => {
    if (!dados) return null
    const grupos = new Set(conc.map(c => c.grupo_id)).size
    const pendB = dados.banco.filter(b => !grupoDe.get(`banco:${b.id}`)).length
    const pendS = dados.sistema.filter(s => !grupoDe.get(`sistema:${s.id}`)).length
    return { somaB: dados.banco.reduce((s, b) => s + b.valor, 0), somaS: dados.sistema.reduce((s, x) => s + x.valor, 0), grupos, pendB, pendS }
  }, [dados, conc, grupoDe])

  return (
    <div className="p-4 md:p-6 space-y-5 pb-24">
      <p className="text-[13px] text-gray-500">
        Confirmação da conciliação: extrato do <b>banco</b> e do <b>AUTOSYSTEM</b> lado a lado. Marque as linhas
        correspondentes dos <b>dois lados</b> (uma linha pode casar com várias) e clique em <b>Conciliar</b>.
      </p>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
          <select value={postoId} onChange={e => setPostoId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
            {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Conta bancária</label>
          <select value={contaId} onChange={e => setContaId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
            {contas.length === 0 && <option value="">Nenhuma conta</option>}
            {contas.map(c => <option key={c.id} value={c.id}>{c.banco}{c.conta ? ` — ${c.conta}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">De</label>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={buscar} disabled={loading}
          className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

      {dados && totais && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card label="Total banco" valor={money(totais.somaB)} cls="text-blue-700" />
            <Card label="Total sistema" valor={money(totais.somaS)} cls="text-indigo-700" />
            <Card label="Conciliações" valor={String(totais.grupos)} cls="text-emerald-600" />
            <Card label="Pendente banco" valor={String(totais.pendB)} cls="text-amber-600" />
            <Card label="Pendente sistema" valor={String(totais.pendS)} cls="text-amber-600" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {sugeridos.size > 0 && (
              <button onClick={conciliarSugeridos} disabled={salvando}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                <Wand2 className="w-4 h-4" /> Conciliar sugeridos 1:1 ({sugeridos.size})
              </button>
            )}
            {dados.arquivos.erro > 0 && <span className="text-[12px] text-amber-600">⚠ {dados.arquivos.erro} arquivo(s) de extrato não lidos</span>}
            {salvando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Coluna titulo="Extrato do banco" icone={<Building2 className="w-4 h-4 text-blue-500" />} vazio="Nenhuma linha do banco no período (extrato anexado?)">
              {dados.banco.map(b => {
                const g = bancoGrupo(b.id)
                return <Linha key={b.id} data={b.data} descricao={b.descricao} valor={b.valor}
                  conciliado={!!g} cor={g ? corDoGrupo.get(g) : undefined} sugerido={sugeridos.has(b.id)} selecionado={selBanco.has(b.id)}
                  onToggle={() => toggle('banco', b.id)} onDesfazer={g ? () => desfazerGrupo(g) : undefined} />
              })}
            </Coluna>
            <Coluna titulo="Extrato do AUTOSYSTEM" icone={<Cpu className="w-4 h-4 text-indigo-500" />} vazio="Nenhum lançamento na conta no período">
              {dados.sistema.map(s => {
                const g = sistGrupo(s.id)
                return <Linha key={s.id} data={s.data} descricao={s.descricao} valor={s.valor}
                  conciliado={!!g} cor={g ? corDoGrupo.get(g) : undefined} sugerido={sugBySist.has(s.id)} selecionado={selSistema.has(s.id)}
                  onToggle={() => toggle('sistema', s.id)} onDesfazer={g ? () => desfazerGrupo(g) : undefined} />
              })}
            </Coluna>
          </div>
        </>
      )}

      {!dados && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Selecione posto, conta e período e clique em Buscar.
        </div>
      )}

      {/* Barra de ação fixa quando há seleção */}
      {selInfo && (selInfo.nb > 0 || selInfo.ns > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg px-4 md:px-8 py-3 flex items-center gap-4 flex-wrap z-20">
          <span className="text-[13px] text-gray-600">
            Banco: <b>{selInfo.nb}</b> ({money(selInfo.sb)}) &nbsp;·&nbsp; Sistema: <b>{selInfo.ns}</b> ({money(selInfo.ss)})
          </span>
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

function Linha({ data, descricao, valor, conciliado, cor, sugerido, selecionado, onToggle, onDesfazer }: {
  data: string; descricao: string; valor: number
  conciliado: boolean; cor?: string; sugerido: boolean; selecionado: boolean
  onToggle: () => void; onDesfazer?: () => void
}) {
  const pos = valor >= 0
  const bg = conciliado ? `${cor} border-l-4` : selecionado ? 'bg-blue-100 border-l-4 border-l-blue-400' : sugerido ? 'bg-amber-50/60 border-l-4 border-l-transparent' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
  return (
    <div className={`px-3 py-2 flex items-center gap-2.5 text-[13px] ${bg}`}>
      {conciliado ? (
        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
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
