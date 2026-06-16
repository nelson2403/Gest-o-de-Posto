'use client'

import { useEffect, useState, useCallback } from 'react'
import { Fuel, Check, Loader2, RefreshCw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

type Posto  = { id: string; nome: string }
type Preco  = { posto_id: string; produto: string; preco: number; atualizado_em: string | null }

const PROD_CORES: Record<string, string> = {
  'Gasolina Comum':     'bg-yellow-100 text-yellow-700',
  'Gasolina Aditivada': 'bg-orange-100 text-orange-700',
  'Etanol':             'bg-green-100 text-green-700',
  'Diesel Comum':       'bg-blue-100 text-blue-700',
  'Diesel S-10':        'bg-indigo-100 text-indigo-700',
  'GNV':                'bg-purple-100 text-purple-700',
}

function fmtPreco(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3 })
}

export default function PrecosCombustivelPage() {
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [precos,   setPrecos]   = useState<Preco[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [postoId,  setPostoId]  = useState('')
  const [loading,  setLoading]  = useState(true)

  // valor digitado por produto e estado de salvamento
  const [valores,  setValores]  = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [salvo,    setSalvo]    = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/precos-frotas/gerente')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      const lista: Posto[] = d.postos ?? []
      setPostos(lista)
      setPrecos(d.precos ?? [])
      setProdutos(d.produtos ?? [])
      setPostoId(prev => prev || (lista[0]?.id ?? ''))
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function precoAtual(produto: string): number | null {
    const p = precos.find(x => x.posto_id === postoId && x.produto === produto)
    return p ? p.preco : null
  }

  async function salvar(produto: string) {
    const raw = (valores[produto] ?? '').replace(',', '.')
    const v = parseFloat(raw)
    if (isNaN(v) || v <= 0) { toast({ variant: 'destructive', title: 'Digite um preço válido' }); return }
    setSalvando(produto)
    try {
      const r = await fetch('/api/precos-frotas/gerente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto_id: postoId, produto, preco: v }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPrecos(prev => {
        const idx = prev.findIndex(p => p.posto_id === postoId && p.produto === produto)
        if (idx >= 0) { const n = [...prev]; n[idx] = d.preco; return n }
        return [...prev, d.preco]
      })
      setValores(prev => ({ ...prev, [produto]: '' }))
      setSalvo(prev => ({ ...prev, [produto]: true }))
      setTimeout(() => setSalvo(prev => ({ ...prev, [produto]: false })), 2500)
      toast({ title: 'Preço lançado!', description: 'Vai aparecer como pendência para atualização nos portais.' })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e.message })
    } finally {
      setSalvando(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
    </div>
  )

  if (!postos.length) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-400 text-sm">
        Nenhum posto vinculado ao seu usuário.
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-[16px] md:text-[18px] font-bold text-gray-900">Preços de Combustível</h1>
            <p className="text-[12px] text-gray-400">Lance o preço novo quando trocar no posto</p>
          </div>
        </div>
        <button onClick={carregar} className="flex items-center gap-1.5 h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Seletor de posto (quando tem mais de um) */}
      {postos.length > 1 && (
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Posto</label>
          <select
            value={postoId}
            onChange={e => setPostoId(e.target.value)}
            className="w-full h-11 border border-gray-200 rounded-xl px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-400/30"
          >
            {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}

      {/* Lista de combustíveis */}
      <div className="space-y-3">
        {produtos.map(produto => {
          const atual = precoAtual(produto)
          return (
            <div key={produto} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[13px] font-semibold px-2.5 py-1 rounded-full ${PROD_CORES[produto] ?? 'bg-gray-100 text-gray-700'}`}>
                  {produto}
                </span>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Preço atual</p>
                  <p className="text-[15px] font-bold text-gray-800 font-mono">{fmtPreco(atual)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[14px]">R$</span>
                  <input
                    type="number" step="0.001" min="0" inputMode="decimal"
                    value={valores[produto] ?? ''}
                    onChange={e => setValores(prev => ({ ...prev, [produto]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') salvar(produto) }}
                    placeholder="Novo preço (ex.: 5,899)"
                    className="w-full h-12 border border-gray-200 rounded-xl pl-9 pr-3 text-[15px] font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                  />
                </div>
                <button
                  onClick={() => salvar(produto)}
                  disabled={salvando === produto || !(valores[produto] ?? '').trim()}
                  className={`h-12 px-5 rounded-xl text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors ${
                    salvo[produto] ? 'bg-green-500 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {salvando === produto
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : salvo[produto]
                      ? <><Check className="w-4 h-4" /> Salvo</>
                      : 'Lançar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[12px] text-gray-400 text-center px-4">
        Ao lançar um preço, ele entra como <strong>pendência</strong> para o financeiro atualizar nos portais de frotas.
      </p>
    </div>
  )
}
