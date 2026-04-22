'use client'

import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils/cn'
import { Loader2, Save, RefreshCw, Droplets } from 'lucide-react'
import type { Role } from '@/types/database.types'

interface Tanque {
  id: string
  posto_nome: string
  bandeira: string
  produto: string
  capacidade_litros: number
  ordem: number
  medida_litros: number | null
}

const PRODUTO_CONFIG: Record<string, { label: string; bg: string; text: string; bar: string }> = {
  'G.C':    { label: 'Gasolina Comum',    bg: 'bg-yellow-50',  text: 'text-yellow-800',  bar: 'bg-yellow-400' },
  'G.A':    { label: 'Gasolina Aditivada',bg: 'bg-amber-50',   text: 'text-amber-800',   bar: 'bg-amber-400'  },
  'ETANOL': { label: 'Etanol',            bg: 'bg-green-50',   text: 'text-green-800',   bar: 'bg-green-500'  },
  'E.T':    { label: 'Etanol',            bg: 'bg-green-50',   text: 'text-green-800',   bar: 'bg-green-500'  },
  'D.C':    { label: 'Diesel Comum',      bg: 'bg-blue-50',    text: 'text-blue-800',    bar: 'bg-blue-500'   },
  'D.S-10': { label: 'Diesel S-10',       bg: 'bg-sky-50',     text: 'text-sky-800',     bar: 'bg-sky-500'    },
  'D.S10':  { label: 'Diesel S-10',       bg: 'bg-sky-50',     text: 'text-sky-800',     bar: 'bg-sky-500'    },
  'G.R':    { label: 'Gasolina Racing',   bg: 'bg-red-50',     text: 'text-red-800',     bar: 'bg-red-500'    },
}

function getProdutoCfg(produto: string) {
  return PRODUTO_CONFIG[produto] ?? { label: produto, bg: 'bg-gray-50', text: 'text-gray-700', bar: 'bg-gray-400' }
}

function fmtLitros(n: number) {
  return n.toLocaleString('pt-BR') + ' L'
}

function barColor(pct: number) {
  if (pct < 20) return 'bg-red-500'
  if (pct < 40) return 'bg-amber-400'
  return 'bg-emerald-500'
}

const BANDEIRA_BADGE: Record<string, string> = {
  'BR':            'bg-blue-100 text-blue-700',
  'SHELL':         'bg-yellow-100 text-yellow-700',
  'SHELL/IPIRANGA':'bg-orange-100 text-orange-700',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function TanquesPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const isGerente = role === 'gerente'
  const isAdmin   = role === 'master' || role === 'admin'

  const [data,        setData]        = useState(today())
  const [postoFiltro, setPostoFiltro] = useState('')
  const [postoNomes,  setPostoNomes]  = useState<string[]>([])
  const [porPosto,    setPorPosto]    = useState<Record<string, Tanque[]>>({})
  const [medicoes,    setMedicoes]    = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)

  const carregar = useCallback(async (d: string, posto?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ data: d })
      if (posto) params.set('posto_nome', posto)
      const res  = await fetch(`/api/tanques?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setPorPosto(json.porPosto ?? {})
      const nomes = Object.keys(json.porPosto ?? {}).sort()
      setPostoNomes(nomes)
      if (!isGerente && !posto && nomes.length && !postoFiltro) setPostoFiltro(nomes[0])

      // Inicializa medições com valores salvos
      const med: Record<string, string> = {}
      for (const t of json.tanques ?? []) {
        if (t.medida_litros !== null) med[t.id] = String(t.medida_litros)
      }
      setMedicoes(med)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: err.message })
    } finally {
      setLoading(false)
    }
  }, [isGerente, postoFiltro])

  useEffect(() => { carregar(data) }, [data])

  async function salvar() {
    const postoAtual = isGerente ? postoNomes[0] : postoFiltro
    if (!postoAtual) return

    const tanquesAtual = porPosto[postoAtual] ?? []
    const payload = tanquesAtual.map(t => ({
      tanque_id:     t.id,
      posto_nome:    t.posto_nome,
      medida_litros: medicoes[t.id] !== undefined && medicoes[t.id] !== ''
        ? parseInt(medicoes[t.id], 10)
        : null,
    }))

    setSaving(true)
    try {
      const res = await fetch('/api/tanques/medicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, medicoes: payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Medições salvas!', description: `${json.saved} tanques registrados.` })
      carregar(data, postoAtual)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const postoAtual = isGerente ? postoNomes[0] : postoFiltro
  const tanquesVisiveis = postoAtual ? (porPosto[postoAtual] ?? []) : []

  // KPIs do posto atual
  const totalCap  = tanquesVisiveis.reduce((s, t) => s + t.capacidade_litros, 0)
  const totalMed  = tanquesVisiveis.reduce((s, t) => s + (parseInt(medicoes[t.id] ?? '') || (t.medida_litros ?? 0)), 0)
  const pctGeral  = totalCap > 0 ? Math.round((totalMed / totalCap) * 100) : 0
  const semMedicao = tanquesVisiveis.filter(t => !medicoes[t.id] && t.medida_litros === null).length

  return (
    <div className="animate-fade-in">
      <Header
        title="Medição de Tanques"
        description={postoAtual ? `Posto: ${postoAtual}` : 'Selecione um posto'}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="h-8 px-2 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <button
              onClick={() => carregar(data, postoAtual)}
              disabled={loading}
              className="h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
            <button
              onClick={salvar}
              disabled={saving || loading || !postoAtual}
              className="h-8 px-4 flex items-center gap-1.5 text-[12px] font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          </div>
        }
      />

      <div className="p-3 md:p-6 space-y-5">

        {/* Seletor de posto — somente admin/master */}
        {isAdmin && postoNomes.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {postoNomes.map(nome => (
              <button
                key={nome}
                onClick={() => { setPostoFiltro(nome); carregar(data, nome) }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors',
                  postoFiltro === nome
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                )}
              >
                {nome}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando tanques…</span>
          </div>
        ) : !postoAtual ? (
          <div className="text-center py-20 text-gray-400 text-sm">Nenhum posto encontrado para sua conta.</div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Capacidade Total</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{fmtLitros(totalCap)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Estoque Medido</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{fmtLitros(totalMed)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Nível Geral</p>
                <p className={cn('text-xl font-bold mt-0.5', pctGeral < 20 ? 'text-red-600' : pctGeral < 40 ? 'text-amber-500' : 'text-emerald-600')}>
                  {pctGeral}%
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">Sem Medição</p>
                <p className={cn('text-xl font-bold mt-0.5', semMedicao > 0 ? 'text-red-600' : 'text-emerald-600')}>
                  {semMedicao} tanque{semMedicao !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Cards de tanques */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tanquesVisiveis.map(tanque => {
                const cfg     = getProdutoCfg(tanque.produto)
                const raw     = medicoes[tanque.id]
                const medVal  = raw !== undefined && raw !== '' ? parseInt(raw, 10) : (tanque.medida_litros ?? 0)
                const pct     = tanque.capacidade_litros > 0 ? Math.min(100, Math.round((medVal / tanque.capacidade_litros) * 100)) : 0
                const temValor = raw !== undefined && raw !== '' || tanque.medida_litros !== null

                return (
                  <div key={tanque.id} className={cn('rounded-xl border shadow-sm overflow-hidden', cfg.bg, 'border-gray-200')}>
                    {/* Header do tanque */}
                    <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold', cfg.text, 'bg-white/70')}>
                          <Droplets className="w-3 h-3" />
                          {tanque.produto}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">{cfg.label}</p>
                      </div>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', BANDEIRA_BADGE[tanque.bandeira] ?? 'bg-gray-100 text-gray-600')}>
                        {tanque.bandeira}
                      </span>
                    </div>

                    {/* Capacidade */}
                    <div className="px-4 pb-2">
                      <p className="text-[11px] text-gray-400">Capacidade: <span className="font-semibold text-gray-600">{fmtLitros(tanque.capacidade_litros)}</span></p>
                    </div>

                    {/* Barra de progresso */}
                    <div className="px-4 pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-gray-400">Nível</span>
                        <span className={cn('text-[11px] font-bold', temValor ? (pct < 20 ? 'text-red-600' : pct < 40 ? 'text-amber-500' : 'text-emerald-600') : 'text-gray-300')}>
                          {temValor ? `${pct}%` : '—'}
                        </span>
                      </div>
                      <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-300', temValor ? barColor(pct) : 'bg-gray-200')}
                          style={{ width: temValor ? `${pct}%` : '0%' }}
                        />
                      </div>
                    </div>

                    {/* Input de medição */}
                    <div className="px-4 pb-4 pt-1">
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1">Medição (litros)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={tanque.capacidade_litros}
                          step={100}
                          value={medicoes[tanque.id] ?? (tanque.medida_litros !== null ? String(tanque.medida_litros) : '')}
                          onChange={e => setMedicoes(prev => ({ ...prev, [tanque.id]: e.target.value }))}
                          placeholder="0"
                          className="flex-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                        />
                        <span className="text-[11px] text-gray-400 shrink-0">L</span>
                      </div>
                      {medVal > tanque.capacidade_litros && (
                        <p className="text-[10px] text-red-500 mt-1">Valor maior que a capacidade</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
