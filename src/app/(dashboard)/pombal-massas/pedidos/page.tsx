'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { ClipboardList, RefreshCw, Plus, X, Trash2, Check, Truck, Ban, ChefHat } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'

const fmtBRL = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataHora = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR') : '—'

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  solicitado:  { label: 'Solicitado',  cls: 'bg-blue-100 text-blue-700' },
  aprovado:    { label: 'Aprovado',    cls: 'bg-indigo-100 text-indigo-700' },
  em_producao: { label: 'Em produção', cls: 'bg-amber-100 text-amber-700' },
  entregue:    { label: 'Entregue',    cls: 'bg-emerald-100 text-emerald-700' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-gray-200 text-gray-500' },
}

export default function PedidosPage() {
  const { usuario, postos_gerente } = useAuthContext()
  const isGerente = usuario?.role === 'gerente'
  const isAdmin   = usuario?.role === 'master' || usuario?.role === 'adm_financeiro'
  // Precisa escolher a loja se for admin, ou gerente com mais de um posto
  const precisaSelecionarPosto = isAdmin || (isGerente && postos_gerente.length > 1)

  const [pedidos, setPedidos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState('')

  // Novo pedido
  const [novo, setNovo] = useState(false)
  const [salgados, setSalgados] = useState<any[]>([])
  const [postos, setPostos]     = useState<any[]>([])
  const [postoId, setPostoId]   = useState('')
  const [itens, setItens]       = useState<{ salgado_id: string; quantidade: number }[]>([])
  const [obs, setObs]           = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const url = filtro ? `/api/pombal-massas/pedidos?status=${filtro}` : '/api/pombal-massas/pedidos'
    const j = await fetch(url).then(r => r.json())
    setPedidos(j.pedidos ?? [])
    setLoading(false)
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])

  async function abrirNovo() {
    setNovo(true); setItens([{ salgado_id: '', quantidade: 0 }]); setObs(''); setPostoId('')
    const reqs: Promise<any>[] = [fetch('/api/pombal-massas/salgados').then(r => r.json())]
    if (precisaSelecionarPosto) reqs.push(fetch('/api/postos-mapeamento').then(r => r.json()))
    const [rs, rp] = await Promise.all(reqs)
    setSalgados(rs.salgados ?? [])
    if (rp) {
      const todos = rp.data ?? []
      // Gerente: só os postos dele; admin: todos
      setPostos(isGerente ? todos.filter((p: any) => postos_gerente.includes(p.id)) : todos)
    }
  }

  async function criarPedido() {
    const validos = itens.filter(i => i.salgado_id && Number(i.quantidade) > 0)
    if (!validos.length) { toast({ variant: 'destructive', title: 'Inclua ao menos um salgado' }); return }
    if (precisaSelecionarPosto && !postoId) { toast({ variant: 'destructive', title: 'Selecione a loja' }); return }
    setSalvando(true)
    try {
      const r = await fetch('/api/pombal-massas/pedidos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto_id: postoId || undefined, observacao: obs || undefined, itens: validos }),
      })
      const j = await r.json()
      if (!r.ok) { toast({ variant: 'destructive', title: j.error ?? 'Erro' }); return }
      toast({ title: 'Pedido enviado!' })
      setNovo(false); carregar()
    } finally { setSalvando(false) }
  }

  async function mudarStatus(pedido: any, status: string) {
    if (status === 'cancelado' && !confirm('Cancelar este pedido?')) return
    if (status === 'entregue' && !confirm('Confirmar entrega? Isso dá baixa no estoque dos salgados.')) return
    const r = await fetch(`/api/pombal-massas/pedidos/${pedido.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    const j = await r.json()
    if (!r.ok) { toast({ variant: 'destructive', title: j.error ?? 'Erro' }); return }
    toast({ title: 'Pedido atualizado' })
    carregar()
  }

  function totalPedido(p: any) {
    return (p.itens ?? []).reduce((s: number, it: any) => s + Number(it.quantidade || 0) * Number(it.preco_unitario || 0), 0)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Pedidos — POMBAL MASSAS"
        description={isGerente ? 'Solicite salgados para a sua loja' : 'Pedidos das lojas — aprove, produza e entregue'}
        actions={
          <button onClick={abrirNovo} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600">
            <Plus className="w-4 h-4" /> Novo Pedido
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Filtros de status */}
        <div className="flex gap-1.5 flex-wrap">
          {['', 'solicitado', 'aprovado', 'em_producao', 'entregue', 'cancelado'].map(s => (
            <button key={s} onClick={() => setFiltro(s)}
              className={`px-3 py-1.5 text-[12px] rounded-full font-medium transition-colors ${
                filtro === s ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}>
              {s === '' ? 'Todos' : STATUS_INFO[s].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 text-orange-400 animate-spin" /></div>
        ) : pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <ClipboardList className="w-10 h-10 text-gray-300" />
            <p className="text-sm">Nenhum pedido</p>
          </div>
        ) : pedidos.map(p => {
          const si = STATUS_INFO[p.status] ?? STATUS_INFO.solicitado
          return (
            <div key={p.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex-wrap">
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${si.cls}`}>{si.label}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{p.posto?.nome ?? '—'}</span>
                <span className="text-[12px] text-gray-400">{fmtDataHora(p.data_solicitacao)}</span>
                <span className="ml-auto font-bold text-gray-800 dark:text-gray-200">{fmtBRL(totalPedido(p))}</span>
              </div>
              <div className="px-5 py-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {(p.itens ?? []).map((it: any) => (
                    <span key={it.id} className="text-gray-700 dark:text-gray-300">
                      {Number(it.quantidade).toLocaleString('pt-BR')}× <span className="font-medium">{it.salgado?.nome}</span>
                    </span>
                  ))}
                </div>
                {p.observacao && <p className="text-[12px] text-gray-500 mt-2">Obs: {p.observacao}</p>}

                {/* Ações */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {isAdmin && p.status === 'solicitado' && (
                    <button onClick={() => mudarStatus(p, 'aprovado')} className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-indigo-500 text-white hover:bg-indigo-600"><Check className="w-3.5 h-3.5" /> Aprovar</button>
                  )}
                  {isAdmin && p.status === 'aprovado' && (
                    <button onClick={() => mudarStatus(p, 'em_producao')} className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600"><ChefHat className="w-3.5 h-3.5" /> Em produção</button>
                  )}
                  {isAdmin && p.status === 'em_producao' && (
                    <button onClick={() => mudarStatus(p, 'entregue')} className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"><Truck className="w-3.5 h-3.5" /> Marcar entregue</button>
                  )}
                  {p.status !== 'entregue' && p.status !== 'cancelado' && (
                    <button onClick={() => mudarStatus(p, 'cancelado')} className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"><Ban className="w-3.5 h-3.5" /> Cancelar</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal Novo Pedido */}
      {novo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Novo Pedido</h2>
              <button onClick={() => setNovo(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto">
              {precisaSelecionarPosto && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Loja (posto)</label>
                  <select value={postoId} onChange={e => setPostoId(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">— selecione a loja —</option>
                    {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              )}

              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Salgados</label>
              {itens.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select value={it.salgado_id} onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, salgado_id: e.target.value } : x))}
                    className="flex-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">— salgado —</option>
                    {salgados.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.unidade})</option>)}
                  </select>
                  <input type="number" step="0.001" value={it.quantidade || ''} placeholder="qtd"
                    onChange={e => setItens(p => p.map((x, i) => i === idx ? { ...x, quantidade: parseFloat(e.target.value) } : x))}
                    className="w-24 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <button onClick={() => setItens(p => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setItens(p => [...p, { salgado_id: '', quantidade: 0 }])}
                className="flex items-center gap-1 text-[13px] text-orange-600 font-medium hover:text-orange-700">
                <Plus className="w-4 h-4" /> Adicionar salgado
              </button>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 mt-2">Observação</label>
                <input value={obs} onChange={e => setObs(e.target.value)} placeholder="opcional"
                  className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setNovo(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
              <button onClick={criarPedido} disabled={salvando} className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">{salvando ? 'Enviando…' : 'Enviar Pedido'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
