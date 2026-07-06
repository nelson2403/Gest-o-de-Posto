'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Search, Link2, Link2Off, Wand2, Check, Building2, Cpu } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type Conta = { id: string; banco: string; conta: string | null }
type LinhaBanco = { id: string; data: string; descricao: string; valor: number }
type LinhaSistema = { id: string; data: string; descricao: string; valor: number; direcao: 'entrada' | 'saida' }
type Match = { banco_hash: string; as_grid: string }
type Dados = {
  conta: { id: string; banco: string; numero: string | null; posto: string; posto_id: string | null }
  periodo: { ini: string; fim: string }
  banco: LinhaBanco[]
  sistema: LinhaSistema[]
  matches: Match[]
  arquivos: { total: number; lidos: number; erro: number }
}

const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (d: string) => d ? d.split('-').reverse().join('/') : ''
const cents = (n: number) => Math.round(Math.abs(n) * 100)

export function ConfirmacaoConciliacao({ postos }: { postos: PostoRow[] }) {
  const supabase = createClient()
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [contas, setContas] = useState<Conta[]>([])
  const [contaId, setContaId] = useState('')
  const [dataIni, setDataIni] = useState(HOJE)
  const [dataFim, setDataFim] = useState(HOJE)
  const [dados, setDados] = useState<Dados | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [selBanco, setSelBanco] = useState<string | null>(null)
  const [selSistema, setSelSistema] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!postoId) { setContas([]); return }
    supabase.from('contas_bancarias').select('id, banco, conta').eq('posto_id', postoId).order('banco')
      .then(({ data }) => { const c = (data ?? []) as Conta[]; setContas(c); setContaId(c[0]?.id ?? '') })
  }, [postoId])

  async function buscar() {
    if (!contaId) { setErro('Selecione a conta bancária.'); return }
    setLoading(true); setErro(null); setSelBanco(null); setSelSistema(null)
    try {
      const p = new URLSearchParams({ conta_id: contaId, data_ini: dataIni, data_fim: dataFim })
      const r = await fetch(`/api/caixa/conciliacao?${p}`, { cache: 'no-store' })
      const txt = await r.text()
      let d: any = null; try { d = txt ? JSON.parse(txt) : null } catch {}
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      setDados(d); setMatches(d.matches ?? [])
    } catch (e: any) { setErro(e.message); setDados(null) }
    finally { setLoading(false) }
  }

  const matchByBanco = useMemo(() => new Map(matches.map(m => [m.banco_hash, m.as_grid])), [matches])
  const matchBySist = useMemo(() => new Map(matches.map(m => [m.as_grid, m.banco_hash])), [matches])

  // Sugestões: pareia linha pendente do banco com a do sistema de MESMO valor absoluto,
  // quando há exatamente uma de cada lado com aquele valor.
  const sugeridos = useMemo(() => {
    if (!dados) return new Map<string, string>() // banco_id -> as_grid
    const bPend = dados.banco.filter(b => !matchByBanco.has(b.id))
    const sPend = dados.sistema.filter(s => !matchBySist.has(s.id))
    const bPor = new Map<number, LinhaBanco[]>(); for (const b of bPend) { const k = cents(b.valor); (bPor.get(k) ?? bPor.set(k, []).get(k)!).push(b) }
    const sPor = new Map<number, LinhaSistema[]>(); for (const s of sPend) { const k = cents(s.valor); (sPor.get(k) ?? sPor.set(k, []).get(k)!).push(s) }
    const sug = new Map<string, string>()
    for (const [k, bs] of bPor) { const ss = sPor.get(k); if (bs.length === 1 && ss && ss.length === 1) sug.set(bs[0].id, ss[0].id) }
    return sug
  }, [dados, matchByBanco, matchBySist])
  const sugBySist = useMemo(() => new Map([...sugeridos].map(([b, s]) => [s, b])), [sugeridos])

  async function linkar(bancoId: string, asGrid: string) {
    if (!dados) return
    const b = dados.banco.find(x => x.id === bancoId); const s = dados.sistema.find(x => x.id === asGrid)
    if (!b || !s) return
    setSalvando(true)
    try {
      const r = await fetch('/api/caixa/conciliacao/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_id: contaId, posto_id: dados.conta.posto_id, banco: b, sistema: s }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Erro ao conciliar') }
      setMatches(prev => [...prev.filter(m => m.banco_hash !== bancoId && m.as_grid !== asGrid), { banco_hash: bancoId, as_grid: asGrid }])
      setSelBanco(null); setSelSistema(null)
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function deslink(bancoId: string, asGrid: string) {
    setSalvando(true)
    try {
      await fetch('/api/caixa/conciliacao/match', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_id: contaId, banco_hash: bancoId }),
      })
      setMatches(prev => prev.filter(m => m.banco_hash !== bancoId && m.as_grid !== asGrid))
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  async function conciliarSugeridos() {
    if (!dados || !sugeridos.size) return
    setSalvando(true)
    try {
      const novos: Match[] = []
      await Promise.all([...sugeridos].map(async ([bancoId, asGrid]) => {
        const b = dados.banco.find(x => x.id === bancoId); const s = dados.sistema.find(x => x.id === asGrid)
        if (!b || !s) return
        const r = await fetch('/api/caixa/conciliacao/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conta_id: contaId, posto_id: dados.conta.posto_id, banco: b, sistema: s }),
        })
        if (r.ok) novos.push({ banco_hash: bancoId, as_grid: asGrid })
      }))
      setMatches(prev => [...prev, ...novos])
    } catch (e: any) { setErro(e.message) } finally { setSalvando(false) }
  }

  function clickBanco(id: string) {
    const asGrid = matchByBanco.get(id)
    if (asGrid) return // já conciliado — usa o botão de desfazer
    if (selSistema) { linkar(id, selSistema); return }
    setSelBanco(prev => prev === id ? null : id)
  }
  function clickSistema(id: string) {
    const bId = matchBySist.get(id)
    if (bId) return
    if (selBanco) { linkar(selBanco, id); return }
    setSelSistema(prev => prev === id ? null : id)
  }

  const totais = useMemo(() => {
    if (!dados) return null
    const somaB = dados.banco.reduce((s, b) => s + b.valor, 0)
    const somaS = dados.sistema.reduce((s, x) => s + x.valor, 0)
    const conc = matches.length
    const pendB = dados.banco.filter(b => !matchByBanco.has(b.id)).length
    const pendS = dados.sistema.filter(s => !matchBySist.has(s.id)).length
    return { somaB, somaS, conc, pendB, pendS, difSaldo: parseFloat((somaB - somaS).toFixed(2)) }
  }, [dados, matches, matchByBanco, matchBySist])

  return (
    <div className="p-4 md:p-6 space-y-5">
      <p className="text-[13px] text-gray-500">
        Confirmação da conciliação: leia o <b>extrato do banco</b> (anexado nas tarefas) e o <b>extrato do AUTOSYSTEM</b>
        (lançamentos na conta corrente) lado a lado e ligue, linha a linha, o que foi baixado no sistema à linha do banco (D-Para).
      </p>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
          <select value={postoId} onChange={e => setPostoId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
            {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Conta bancária</label>
          <select value={contaId} onChange={e => setContaId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
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
          {/* Totais */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card label="Total banco" valor={money(totais.somaB)} cls="text-blue-700" />
            <Card label="Total sistema" valor={money(totais.somaS)} cls="text-indigo-700" />
            <Card label="Conciliados" valor={String(totais.conc)} cls="text-emerald-600" />
            <Card label="Pendente banco" valor={String(totais.pendB)} cls="text-amber-600" />
            <Card label="Pendente sistema" valor={String(totais.pendS)} cls="text-amber-600" />
          </div>

          {/* Ações */}
          <div className="flex items-center gap-3 flex-wrap">
            {sugeridos.size > 0 && (
              <button onClick={conciliarSugeridos} disabled={salvando}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                <Wand2 className="w-4 h-4" /> Conciliar sugeridos ({sugeridos.size})
              </button>
            )}
            {(selBanco || selSistema) && (
              <span className="text-[12px] text-gray-500">
                {selBanco && selSistema ? 'Clique numa linha do outro lado para ligar' : 'Selecione a linha correspondente do outro lado'}
              </span>
            )}
            {dados.arquivos.erro > 0 && (
              <span className="text-[12px] text-amber-600">⚠ {dados.arquivos.erro} arquivo(s) de extrato não puderam ser lidos</span>
            )}
            {salvando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          {/* D-Para: banco | sistema */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Coluna titulo="Extrato do banco" icone={<Building2 className="w-4 h-4 text-blue-500" />} vazio="Nenhuma linha do banco no período (extrato anexado?)">
              {dados.banco.map(b => {
                const asGrid = matchByBanco.get(b.id)
                const sug = sugeridos.has(b.id)
                return (
                  <Linha key={b.id} data={b.data} descricao={b.descricao} valor={b.valor}
                    estado={asGrid ? 'conciliado' : selBanco === b.id ? 'selecionado' : sug ? 'sugerido' : 'pendente'}
                    onClick={() => clickBanco(b.id)}
                    parceiro={asGrid ? dados.sistema.find(s => s.id === asGrid) : undefined}
                    onDeslink={asGrid ? () => deslink(b.id, asGrid) : undefined}
                  />
                )
              })}
            </Coluna>
            <Coluna titulo="Extrato do AUTOSYSTEM" icone={<Cpu className="w-4 h-4 text-indigo-500" />} vazio="Nenhum lançamento na conta no período">
              {dados.sistema.map(s => {
                const bId = matchBySist.get(s.id)
                const sug = sugBySist.has(s.id)
                return (
                  <Linha key={s.id} data={s.data} descricao={s.descricao} valor={s.valor}
                    estado={bId ? 'conciliado' : selSistema === s.id ? 'selecionado' : sug ? 'sugerido' : 'pendente'}
                    onClick={() => clickSistema(s.id)}
                    parceiro={bId ? dados.banco.find(b => b.id === bId) : undefined}
                    onDeslink={bId ? () => deslink(bId, s.id) : undefined}
                  />
                )
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
  const arr = Array.isArray(children) ? children : [children]
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        {icone}<span className="text-[13px] font-bold text-gray-700">{titulo}</span>
        <span className="ml-auto text-[11px] text-gray-400">{arr.filter(Boolean).length} linha(s)</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
        {arr.filter(Boolean).length ? children : <p className="px-4 py-8 text-center text-[12px] text-gray-400">{vazio}</p>}
      </div>
    </div>
  )
}

function Linha({ data, descricao, valor, estado, onClick, parceiro, onDeslink }: {
  data: string; descricao: string; valor: number
  estado: 'pendente' | 'sugerido' | 'selecionado' | 'conciliado'
  onClick: () => void
  parceiro?: { valor: number } | undefined
  onDeslink?: () => void
}) {
  const bg = estado === 'conciliado' ? 'bg-emerald-50' : estado === 'selecionado' ? 'bg-blue-100' : estado === 'sugerido' ? 'bg-amber-50' : 'hover:bg-gray-50'
  const pos = valor >= 0
  return (
    <div className={`px-4 py-2 flex items-center gap-3 text-[13px] cursor-pointer ${bg}`} onClick={estado === 'conciliado' ? undefined : onClick}>
      {estado === 'conciliado' ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        : estado === 'sugerido' ? <Link2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
        : <span className="w-4 h-4 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-[11px] w-[52px] flex-shrink-0">{dataBR(data)}</span>
          <span className="truncate text-gray-700">{descricao}</span>
        </div>
      </div>
      <span className={`font-semibold flex-shrink-0 ${pos ? 'text-emerald-700' : 'text-red-600'}`}>{money(valor)}</span>
      {estado === 'conciliado' && onDeslink && (
        <button onClick={e => { e.stopPropagation(); onDeslink() }} title="Desfazer conciliação"
          className="text-gray-300 hover:text-red-500 flex-shrink-0"><Link2Off className="w-3.5 h-3.5" /></button>
      )}
    </div>
  )
}
