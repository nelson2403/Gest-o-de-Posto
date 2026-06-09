'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Plus, Pencil, Trash2, X, Croissant, RefreshCw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Salgado {
  id: string
  nome: string
  unidade: string
  preco_venda: number
  custo: number
  estoque: number
  ativo: boolean
}

const UNIDADES = ['un', 'cento', 'kg']

const fmtBRL = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function SalgadosPage() {
  const [lista, setLista]   = useState<Salgado[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<Partial<Salgado> | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/pombal-massas/salgados')
    const j = await r.json()
    setLista(j.salgados ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function salvar() {
    if (!modal?.nome?.trim()) { toast({ variant: 'destructive', title: 'Informe o nome' }); return }
    setSalvando(true)
    try {
      const editando = !!modal.id
      const url = editando ? `/api/pombal-massas/salgados/${modal.id}` : '/api/pombal-massas/salgados'
      const r = await fetch(url, {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modal),
      })
      const j = await r.json()
      if (!r.ok) { toast({ variant: 'destructive', title: j.error ?? 'Erro ao salvar' }); return }
      toast({ title: editando ? 'Salgado atualizado' : 'Salgado criado' })
      setModal(null)
      carregar()
    } finally { setSalvando(false) }
  }

  async function excluir(s: Salgado) {
    if (!confirm(`Excluir "${s.nome}"?`)) return
    const r = await fetch(`/api/pombal-massas/salgados/${s.id}`, { method: 'DELETE' })
    if (!r.ok) { const j = await r.json(); toast({ variant: 'destructive', title: j.error ?? 'Erro' }); return }
    toast({ title: 'Salgado excluído' })
    carregar()
  }

  function margem(s: Salgado) {
    if (!s.preco_venda) return '—'
    const m = ((s.preco_venda - s.custo) / s.preco_venda) * 100
    return `${m.toFixed(1)}%`
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Salgados — POMBAL MASSAS"
        description="Cadastro de salgados (produtos finais), custo, preço de venda e estoque"
        actions={
          <button onClick={() => setModal({ unidade: 'un' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600">
            <Plus className="w-4 h-4" /> Novo Salgado
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 text-orange-400 animate-spin" /></div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <Croissant className="w-10 h-10 text-gray-300" />
            <p className="text-sm">Nenhum salgado cadastrado</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left px-4 py-3">Salgado</th>
                  <th className="text-center px-4 py-3">Unidade</th>
                  <th className="text-right px-4 py-3">Custo</th>
                  <th className="text-right px-4 py-3">Preço Venda</th>
                  <th className="text-right px-4 py-3">Margem</th>
                  <th className="text-right px-4 py-3">Estoque</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {lista.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{s.nome}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{s.unidade}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtBRL(s.custo)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-gray-200">{fmtBRL(s.preco_venda)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{margem(s)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(s.estoque).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setModal(s)} className="p-1.5 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => excluir(s)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{modal.id ? 'Editar Salgado' : 'Novo Salgado'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                <input autoFocus value={modal.nome ?? ''} onChange={e => setModal(m => ({ ...m, nome: e.target.value }))}
                  placeholder="Ex: Coxinha"
                  className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unidade</label>
                  <select value={modal.unidade ?? 'un'} onChange={e => setModal(m => ({ ...m, unidade: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Estoque atual</label>
                  <input type="number" step="0.001" value={modal.estoque ?? ''} onChange={e => setModal(m => ({ ...m, estoque: parseFloat(e.target.value) }))}
                    className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Custo (R$)</label>
                  <input type="number" step="0.01" value={modal.custo ?? ''} onChange={e => setModal(m => ({ ...m, custo: parseFloat(e.target.value) }))}
                    className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Preço de venda (R$)</label>
                  <input type="number" step="0.01" value={modal.preco_venda ?? ''} onChange={e => setModal(m => ({ ...m, preco_venda: parseFloat(e.target.value) }))}
                    className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setModal(null)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
