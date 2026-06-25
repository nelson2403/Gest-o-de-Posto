'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, ChevronDown, ChevronUp, ExternalLink, Fuel, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Posto      = { id: string; nome: string }
type Preco      = { id: string; posto_id: string; produto: string; preco: number; atualizado_em: string }
type Portal     = { id: string; nome: string; url: string | null; ativo: boolean }
type Status     = { portal_id: string; posto_id: string; produto: string; preco_no_portal: number | null; atualizado_em: string | null }
type Vinculacao = { portal_id: string; posto_id: string }

const PRODUTOS = ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel Comum', 'Diesel S-10', 'GNV']
const PROD_CORES: Record<string, string> = {
  'Gasolina Comum':     'bg-yellow-100 text-yellow-800',
  'Gasolina Aditivada': 'bg-orange-100 text-orange-800',
  'Etanol':             'bg-green-100 text-green-800',
  'Diesel Comum':       'bg-blue-100 text-blue-800',
  'Diesel S-10':        'bg-indigo-100 text-indigo-800',
  'GNV':                'bg-purple-100 text-purple-800',
}

function fmtPreco(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3 })
}

function isAtualizado(
  portal_id: string, posto_id: string, produto: string,
  precoAtual: number | undefined, statusList: Status[]
): boolean {
  const s = statusList.find(x => x.portal_id === portal_id && x.posto_id === posto_id && x.produto === produto)
  if (!s || s.preco_no_portal == null || !precoAtual) return false
  return Math.abs(s.preco_no_portal - precoAtual) < 0.001
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PrecosFrotasPage() {
  const [postos,      setPostos]      = useState<Posto[]>([])
  const [precos,      setPrecos]      = useState<Preco[]>([])
  const [portais,     setPortais]     = useState<Portal[]>([])
  const [status,      setStatus]      = useState<Status[]>([])
  const [vinculacoes, setVinculacoes] = useState<Vinculacao[]>([])
  const [loading,     setLoading]     = useState(true)
  const [aba,         setAba]         = useState<'status' | 'precos' | 'portais'>('status')
  const [filtroPosto,  setFiltroPosto]  = useState<string>('')   // '' = todos
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendentes' | 'ok'>('todos')

  const [editando,  setEditando]  = useState<{ posto_id: string; produto: string } | null>(null)
  const [editValor, setEditValor] = useState('')
  const [salvando,  setSalvando]  = useState(false)

  const [novoPortal,     setNovoPortal]     = useState(false)
  const [nomePortal,     setNomePortal]     = useState('')
  const [urlPortal,      setUrlPortal]      = useState('')
  const [salvandoPortal, setSalvandoPortal] = useState(false)

  const [marcando,         setMarcando]         = useState<string | null>(null)
  const [expandidoPostos,  setExpandidoPostos]  = useState<string | null>(null)
  const [vinculando,       setVinculando]       = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/precos-frotas')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPostos(d.postos      ?? [])
      setPrecos(d.precos      ?? [])
      setPortais(d.portais    ?? [])
      setStatus(d.status      ?? [])
      setVinculacoes(d.vinculacoes ?? [])
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Postos vinculados a um portal
  function postosDoPortal(portal_id: string): Posto[] {
    const ids = vinculacoes.filter(v => v.portal_id === portal_id).map(v => v.posto_id)
    return postos.filter(p => ids.includes(p.id))
  }

  // Postos NÃO vinculados a um portal
  function postosDisponiveis(portal_id: string): Posto[] {
    const ids = vinculacoes.filter(v => v.portal_id === portal_id).map(v => v.posto_id)
    return postos.filter(p => !ids.includes(p.id))
  }

  // ── Vincular/desvincular posto ─────────────────────────────────────────────
  async function vincularPosto(portal_id: string, posto_id: string) {
    setVinculando(portal_id + posto_id)
    try {
      await fetch(`/api/precos-frotas/portais/${portal_id}/postos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto_id }),
      })
      setVinculacoes(prev => [...prev, { portal_id, posto_id }])
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao vincular posto' })
    } finally { setVinculando(null) }
  }

  async function desvincularPosto(portal_id: string, posto_id: string) {
    setVinculando(portal_id + posto_id)
    try {
      await fetch(`/api/precos-frotas/portais/${portal_id}/postos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto_id }),
      })
      setVinculacoes(prev => prev.filter(v => !(v.portal_id === portal_id && v.posto_id === posto_id)))
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao desvincular posto' })
    } finally { setVinculando(null) }
  }

  // ── Salvar preço ────────────────────────────────────────────────────────────
  async function salvarPreco() {
    if (!editando) return
    const v = parseFloat(editValor.replace(',', '.'))
    if (isNaN(v) || v <= 0) { toast({ variant: 'destructive', title: 'Valor inválido' }); return }
    setSalvando(true)
    try {
      const r = await fetch('/api/precos-frotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto_id: editando.posto_id, produto: editando.produto, preco: v }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPrecos(prev => {
        const idx = prev.findIndex(p => p.posto_id === editando!.posto_id && p.produto === editando!.produto)
        if (idx >= 0) { const n = [...prev]; n[idx] = d.preco; return n }
        return [...prev, d.preco]
      })
      setEditando(null)
      toast({ title: 'Preço salvo!' })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e.message })
    } finally { setSalvando(false) }
  }

  // ── Marcar portal (todos os postos vinculados) ──────────────────────────────
  async function marcarPortal(portal_id: string, apenasDesatualizados = false) {
    const postosVinculados = postosDoPortal(portal_id)
    if (!postosVinculados.length) {
      toast({ title: 'Nenhum posto vinculado a este portal' }); return
    }
    const itens = postosVinculados.flatMap(posto =>
      PRODUTOS.flatMap(produto => {
        const pc = precos.find(p => p.posto_id === posto.id && p.produto === produto)
        if (!pc) return []
        if (apenasDesatualizados && isAtualizado(portal_id, posto.id, produto, pc.preco, status)) return []
        return [{ posto_id: posto.id, produto, preco: pc.preco }]
      })
    )
    if (!itens.length) { toast({ title: 'Todos os preços já estão atualizados' }); return }

    const key = portal_id + (apenasDesatualizados ? '_pend' : '')
    setMarcando(key)
    try {
      const r = await fetch(`/api/precos-frotas/portais/${portal_id}/marcar-atualizado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      await carregar()
      toast({ title: 'Marcado como atualizado!', description: `${d.atualizados} item(s)` })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message })
    } finally { setMarcando(null) }
  }

  function contarPendentes(portal_id: string) {
    const postosV = postosDoPortal(portal_id)
    let total = 0, pendente = 0
    for (const posto of postosV) {
      for (const produto of PRODUTOS) {
        const pc = precos.find(p => p.posto_id === posto.id && p.produto === produto)
        if (!pc) continue
        total++
        if (!isAtualizado(portal_id, posto.id, produto, pc.preco, status)) pendente++
      }
    }
    return { total, pendente, postosVinculados: postosV.length }
  }

  // Pendentes de um posto específico dentro de um portal
  function postoStatusInfo(portal_id: string, posto_id: string) {
    let total = 0, pend = 0
    for (const produto of PRODUTOS) {
      const pc = precos.find(p => p.posto_id === posto_id && p.produto === produto)
      if (!pc) continue
      total++
      if (!isAtualizado(portal_id, posto_id, produto, pc.preco, status)) pend++
    }
    return { total, pend }
  }

  // Resumo global (para a notificação no topo)
  const resumo = portais.reduce(
    (acc, portal) => {
      const { total, pendente, postosVinculados } = contarPendentes(portal.id)
      if (postosVinculados > 0) {
        acc.totalItens += total
        acc.pendentes  += pendente
        if (pendente > 0) acc.portaisPendentes++
      }
      return acc
    },
    { totalItens: 0, pendentes: 0, portaisPendentes: 0 },
  )

  // ── Criar portal ────────────────────────────────────────────────────────────
  async function criarPortal() {
    if (!nomePortal.trim()) return
    setSalvandoPortal(true)
    try {
      const r = await fetch('/api/precos-frotas/portais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomePortal, url: urlPortal }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPortais(prev => [...prev, d.portal].sort((a, b) => a.nome.localeCompare(b.nome)))
      setNovoPortal(false); setNomePortal(''); setUrlPortal('')
      toast({ title: 'Portal criado!' })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message })
    } finally { setSalvandoPortal(false) }
  }

  async function removerPortal(id: string) {
    try {
      await fetch('/api/precos-frotas/portais', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setPortais(prev => prev.filter(p => p.id !== id))
      setVinculacoes(prev => prev.filter(v => v.portal_id !== id))
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover portal' })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
            <Fuel className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900">Preços — Portais de Frotas</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">{portais.length} portais · {postos.length} postos</p>
          </div>
        </div>
        <button onClick={carregar} className="flex items-center gap-1.5 h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Notificação de pendências */}
      {portais.length > 0 && (
        resumo.pendentes > 0 ? (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-[18px] h-[18px] text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-orange-800">
                {resumo.pendentes} preço{resumo.pendentes !== 1 ? 's' : ''} pendente{resumo.pendentes !== 1 ? 's' : ''} para alterar nos portais
              </p>
              <p className="text-[11px] text-orange-600/80">
                em {resumo.portaisPendentes} portal{resumo.portaisPendentes !== 1 ? 'is' : ''} · {resumo.totalItens - resumo.pendentes} de {resumo.totalItens} já atualizados
              </p>
            </div>
            {(aba !== 'status' || filtroStatus !== 'pendentes') && (
              <button onClick={() => { setAba('status'); setFiltroStatus('pendentes') }}
                className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[12px] font-medium flex items-center gap-1.5 flex-shrink-0">
                Ver pendentes
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCheck className="w-[18px] h-[18px] text-green-600" />
            </div>
            <p className="text-[13px] font-semibold text-green-800">
              Tudo atualizado — nenhum preço pendente nos portais 🎉
            </p>
          </div>
        )
      )}

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'status',  label: 'Status dos Portais' },
          { key: 'precos',  label: 'Editar Preços' },
          { key: 'portais', label: 'Gerenciar Portais' },
        ] as const).map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              aba === a.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Filtro por posto (abas de dados) */}
      {aba !== 'portais' && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[12px] font-medium text-gray-500">Posto:</label>
          <select
            value={filtroPosto}
            onChange={e => setFiltroPosto(e.target.value)}
            className="h-9 border border-gray-200 rounded-lg px-3 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400/30 min-w-[220px]"
          >
            <option value="">Todos os postos</option>
            {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          {filtroPosto && (
            <button onClick={() => setFiltroPosto('')}
              className="flex items-center gap-1 h-9 px-2.5 text-[12px] text-gray-500 hover:text-gray-700">
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          )}

          {aba === 'status' && (
            <div className="flex items-center gap-1 sm:ml-auto bg-gray-100 rounded-lg p-0.5">
              {([
                { key: 'todos',     label: 'Todos' },
                { key: 'pendentes', label: 'Só pendentes' },
                { key: 'ok',        label: 'Atualizados' },
              ] as const).map(o => (
                <button key={o.key} onClick={() => setFiltroStatus(o.key)}
                  className={`px-3 h-8 rounded-md text-[12px] font-medium transition-colors ${
                    filtroStatus === o.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {o.label}{o.key === 'pendentes' && resumo.pendentes > 0 ? ` (${resumo.pendentes})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: Status dos Portais ─────────────────────────────────────────── */}
      {aba === 'status' && (
        <div className="space-y-4">
          {portais.length === 0 && (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400 text-sm">
              Nenhum portal cadastrado. Vá em <strong>Gerenciar Portais</strong> para adicionar.
            </div>
          )}
          {portais.map(portal => {
            const { total, pendente, postosVinculados } = contarPendentes(portal.id)
            const tudo_ok = total > 0 && pendente === 0
            const postosV = postosDoPortal(portal.id)
              .filter(p => !filtroPosto || p.id === filtroPosto)
              .filter(p => {
                if (filtroStatus === 'todos') return true
                const { pend } = postoStatusInfo(portal.id, p.id)
                return filtroStatus === 'pendentes' ? pend > 0 : pend === 0
              })
            // Com filtro ativo, esconde portais sem postos correspondentes
            if ((filtroPosto || filtroStatus !== 'todos') && postosV.length === 0) return null

            return (
              <div key={portal.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className={`flex items-center justify-between px-4 py-3 border-b ${tudo_ok ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    {tudo_ok
                      ? <CheckCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <div className="w-4 h-4 rounded-full border-2 border-orange-400 flex-shrink-0" />
                    }
                    <span className="text-[13px] font-bold text-gray-800">{portal.nome}</span>
                    {portal.url && (
                      <a href={portal.url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5">
                        <ExternalLink className="w-3 h-3" /> Abrir
                      </a>
                    )}
                    {postosVinculados === 0
                      ? <span className="text-[11px] text-gray-400 italic">Nenhum posto vinculado</span>
                      : <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          tudo_ok ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {tudo_ok ? `✓ Tudo atualizado` : `${pendente} de ${total} pendente${pendente !== 1 ? 's' : ''}`}
                        </span>
                    }
                    <span className="text-[11px] text-gray-400">{postosVinculados} posto{postosVinculados !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {!tudo_ok && pendente > 0 && (
                      <button onClick={() => marcarPortal(portal.id, true)}
                        disabled={!!marcando}
                        className="flex items-center gap-1.5 h-8 px-3 border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg text-[12px] font-medium disabled:opacity-50">
                        {marcando === portal.id + '_pend' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Marcar pendentes
                      </button>
                    )}
                    <button onClick={() => marcarPortal(portal.id)}
                      disabled={!!marcando || postosVinculados === 0}
                      className="flex items-center gap-1.5 h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[12px] font-medium disabled:opacity-50">
                      {marcando === portal.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                      Marcar todos
                    </button>
                  </div>
                </div>

                {postosV.length === 0 ? (
                  <div className="px-4 py-4 text-[12px] text-gray-400 italic text-center">
                    Vá em <strong>Gerenciar Portais</strong> para vincular postos a este portal.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase">
                          <th className="text-left px-4 py-2 font-medium">Posto</th>
                          {PRODUTOS.map(p => (
                            <th key={p} className="text-center px-3 py-2 font-medium whitespace-nowrap">{p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {postosV.map((posto, pi) => (
                          <tr key={posto.id} className={pi % 2 === 0 ? '' : 'bg-gray-50/50'}>
                            <td className="px-4 py-2.5 text-gray-700 font-medium whitespace-nowrap">{posto.nome}</td>
                            {PRODUTOS.map(produto => {
                              const pc = precos.find(p => p.posto_id === posto.id && p.produto === produto)
                              if (!pc) return <td key={produto} className="px-3 py-2.5 text-center"><span className="text-gray-200">—</span></td>
                              const ok = isAtualizado(portal.id, posto.id, produto, pc.preco, status)
                              const st = status.find(x => x.portal_id === portal.id && x.posto_id === posto.id && x.produto === produto)
                              return (
                                <td key={produto} className="px-3 py-2.5 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`font-mono font-semibold ${ok ? 'text-green-700' : 'text-orange-600'}`}>
                                      {fmtPreco(pc.preco)}
                                    </span>
                                    {ok
                                      ? <span className="text-green-500 text-[10px] flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> OK</span>
                                      : <span className="text-orange-400 text-[10px]">
                                          {st?.preco_no_portal != null ? `Portal: ${fmtPreco(st.preco_no_portal)}` : 'Não atualizado'}
                                        </span>
                                    }
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── ABA: Editar Preços ──────────────────────────────────────────────── */}
      {aba === 'precos' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-[12px] text-gray-500">Clique em um preço para editar. Ao salvar, os portais ficam marcados como desatualizados.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase">
                  <th className="text-left px-4 py-2.5 font-medium">Posto</th>
                  {PRODUTOS.map(p => (
                    <th key={p} className="text-center px-3 py-2.5 font-medium whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${PROD_CORES[p] || 'bg-gray-100 text-gray-600'}`}>{p}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {postos.filter(p => !filtroPosto || p.id === filtroPosto).map((posto, pi) => (
                  <tr key={posto.id} className={pi % 2 === 0 ? '' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800 text-[12px] whitespace-nowrap">{posto.nome}</td>
                    {PRODUTOS.map(produto => {
                      const pc = precos.find(p => p.posto_id === posto.id && p.produto === produto)
                      const isEdit = editando?.posto_id === posto.id && editando?.produto === produto
                      return (
                        <td key={produto} className="px-2 py-1.5 text-center">
                          {isEdit ? (
                            <div className="flex items-center gap-1 justify-center">
                              <input autoFocus type="number" step="0.001" min="0"
                                value={editValor} onChange={e => setEditValor(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') salvarPreco(); if (e.key === 'Escape') setEditando(null) }}
                                className="w-24 text-center border border-orange-300 rounded px-1.5 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                              />
                              <button onClick={salvarPreco} disabled={salvando}
                                className="p-1 bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50">
                                {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              </button>
                              <button onClick={() => setEditando(null)} className="p-1 border border-gray-200 hover:bg-gray-100 rounded">
                                <X className="w-3 h-3 text-gray-400" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditando({ posto_id: posto.id, produto }); setEditValor(pc ? String(pc.preco) : '') }}
                              className="w-full font-mono text-[12px] px-2 py-1.5 rounded hover:bg-orange-50 hover:text-orange-700 transition-colors text-gray-700">
                              {pc ? fmtPreco(pc.preco) : <span className="text-gray-300 text-[11px]">+ Adicionar</span>}
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ABA: Gerenciar Portais ──────────────────────────────────────────── */}
      {aba === 'portais' && (
        <div className="space-y-3">
          {novoPortal ? (
            <div className="bg-white border border-orange-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
              <input placeholder="Nome do portal" value={nomePortal} onChange={e => setNomePortal(e.target.value)}
                className="flex-1 min-w-[180px] h-9 border border-gray-200 rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
              <input placeholder="URL (opcional)" value={urlPortal} onChange={e => setUrlPortal(e.target.value)}
                className="flex-1 min-w-[220px] h-9 border border-gray-200 rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
              <button onClick={criarPortal} disabled={salvandoPortal || !nomePortal.trim()}
                className="h-9 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[13px] font-medium disabled:opacity-50 flex items-center gap-1.5">
                {salvandoPortal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Salvar
              </button>
              <button onClick={() => { setNovoPortal(false); setNomePortal(''); setUrlPortal('') }}
                className="h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          ) : (
            <button onClick={() => setNovoPortal(true)}
              className="flex items-center gap-2 h-9 px-4 border border-dashed border-orange-300 text-orange-600 rounded-lg text-[13px] hover:bg-orange-50 transition-colors">
              <Plus className="w-4 h-4" /> Adicionar Portal
            </button>
          )}

          <div className="space-y-3">
            {portais.map((portal, i) => {
              const postosV    = postosDoPortal(portal.id)
              const disponiveis = postosDisponiveis(portal.id)
              const aberto      = expandidoPostos === portal.id

              return (
                <div key={portal.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Header */}
                  <div className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-bold text-gray-800">{portal.nome}</span>
                      {portal.url && (
                        <a href={portal.url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5">
                          <ExternalLink className="w-3 h-3" />{portal.url}
                        </a>
                      )}
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {postosV.length} posto{postosV.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandidoPostos(aberto ? null : portal.id)}
                        className="flex items-center gap-1.5 h-8 px-3 border border-gray-300 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100">
                        {aberto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {aberto ? 'Fechar' : 'Gerenciar postos'}
                      </button>
                      <button onClick={() => removerPortal(portal.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Painel de postos (expand) */}
                  {aberto && (
                    <div className="border-t border-gray-100 p-4 space-y-3">
                      {/* Postos vinculados */}
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Postos vinculados</p>
                        {postosV.length === 0
                          ? <p className="text-[12px] text-gray-400 italic">Nenhum posto vinculado ainda.</p>
                          : (
                            <div className="flex flex-wrap gap-2">
                              {postosV.map(posto => (
                                <div key={posto.id} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                                  <span className="text-[12px] text-orange-800 font-medium">{posto.nome}</span>
                                  <button
                                    onClick={() => desvincularPosto(portal.id, posto.id)}
                                    disabled={vinculando === portal.id + posto.id}
                                    className="text-orange-400 hover:text-red-500 transition-colors disabled:opacity-50">
                                    {vinculando === portal.id + posto.id
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <X className="w-3 h-3" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )
                        }
                      </div>

                      {/* Postos disponíveis para vincular */}
                      {disponiveis.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Adicionar posto</p>
                          <div className="flex flex-wrap gap-2">
                            {disponiveis.map(posto => (
                              <button
                                key={posto.id}
                                onClick={() => vincularPosto(portal.id, posto.id)}
                                disabled={vinculando === portal.id + posto.id}
                                className="flex items-center gap-1.5 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 text-[12px] text-gray-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-50">
                                {vinculando === portal.id + posto.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Plus className="w-3 h-3" />}
                                {posto.nome}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
