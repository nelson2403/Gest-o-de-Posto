'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Factory, RefreshCw, Plus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const fmtBRL = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

export default function ProducaoPage() {
  const [salgados, setSalgados] = useState<any[]>([])
  const [producoes, setProducoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [salgadoId, setSalgadoId] = useState('')
  const [qtd, setQtd] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [rs, rp] = await Promise.all([
      fetch('/api/pombal-massas/salgados').then(r => r.json()),
      fetch('/api/pombal-massas/producao').then(r => r.json()),
    ])
    setSalgados(rs.salgados ?? [])
    setProducoes(rp.producoes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function registrar() {
    if (!salgadoId || !parseFloat(qtd)) { toast({ variant: 'destructive', title: 'Escolha o salgado e a quantidade' }); return }
    setSalvando(true)
    try {
      const r = await fetch('/api/pombal-massas/producao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salgado_id: salgadoId, quantidade: parseFloat(qtd), data, observacao: obs || undefined }),
      })
      const j = await r.json()
      if (!r.ok) { toast({ variant: 'destructive', title: j.error ?? 'Erro' }); return }
      toast({ title: `Produção registrada — custo ${fmtBRL(j.custo_total)}` })
      setQtd(''); setObs('')
      carregar()
    } finally { setSalvando(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Produção — POMBAL MASSAS" description="Registre a produção: baixa os insumos (ficha) e soma ao estoque do salgado" />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Form */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Factory className="w-3.5 h-3.5" /> Nova produção</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Salgado</label>
              <select value={salgadoId} onChange={e => setSalgadoId(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">— selecione —</option>
                {salgados.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.unidade})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantidade</label>
              <input type="number" step="0.001" value={qtd} onChange={e => setQtd(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div className="md:col-span-3">
              <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)"
                className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <button onClick={registrar} disabled={salvando}
              className="flex items-center justify-center gap-1.5 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
              <Plus className="w-4 h-4" /> {salvando ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">O custo é calculado pela ficha técnica do salgado e os insumos saem do estoque automaticamente.</p>
        </div>

        {/* Histórico */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300">Produções recentes</div>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 text-orange-400 animate-spin" /></div>
          ) : producoes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Nenhuma produção registrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left px-5 py-2.5">Data</th>
                  <th className="text-left px-4 py-2.5">Salgado</th>
                  <th className="text-right px-4 py-2.5">Quantidade</th>
                  <th className="text-right px-5 py-2.5">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {producoes.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-5 py-2.5 text-gray-600">{fmtData(p.data)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{p.salgado?.nome ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(p.quantidade).toLocaleString('pt-BR')} {p.salgado?.unidade}</td>
                    <td className="px-5 py-2.5 text-right text-gray-700">{fmtBRL(p.custo_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
