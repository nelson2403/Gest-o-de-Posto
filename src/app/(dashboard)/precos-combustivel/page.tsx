'use client'

import { useEffect, useState, useCallback } from 'react'
import { Fuel, Check, Loader2, RefreshCw, CreditCard, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { SeletorPostoAtivo } from '@/components/shared/SeletorPostoAtivo'
import { useAuthContext } from '@/contexts/AuthContext'

type Posto  = { id: string; nome: string }
type Preco  = { posto_id: string; produto: string; preco: number; atualizado_em: string | null; cartao_desconto_aplicado?: boolean | null }

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
  const { posto_ativo_id, setPostoAtivo } = useAuthContext()
  const [postos,   setPostos]   = useState<Posto[]>([])
  const [precos,   setPrecos]   = useState<Preco[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [cartaoPorPosto, setCartaoPorPosto] = useState<Record<string, boolean | null>>({})
  const [loading,  setLoading]  = useState(true)
  // Posto ativo vem do seletor global (home/cabeçalho); fallback ao 1º da lista
  const postoId = posto_ativo_id || postos[0]?.id || ''

  // valor digitado por produto e estado de salvamento
  const [valores,  setValores]  = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [salvo,    setSalvo]    = useState<Record<string, boolean>>({})

  // Questionário do cartão de desconto (modal ao lançar)
  const [quest, setQuest] = useState<{ produto: string; valor: number } | null>(null)
  const [temCartao, setTemCartao]     = useState<boolean | null>(null)
  const [aplicaProd, setAplicaProd]   = useState<boolean | null>(null)

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
      setCartaoPorPosto(d.cartao_por_posto ?? {})
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

  // Passo 1: valida o preço e abre o questionário do cartão de desconto
  function abrirQuestionario(produto: string) {
    const raw = (valores[produto] ?? '').replace(',', '.')
    const v = parseFloat(raw)
    if (isNaN(v) || v <= 0) { toast({ variant: 'destructive', title: 'Digite um preço válido' }); return }
    // Pré-preenche: "tem cartão?" lembrado do posto; "aplica?" do preço atual do produto
    const jaAplica = precos.find(p => p.posto_id === postoId && p.produto === produto)?.cartao_desconto_aplicado
    setTemCartao(cartaoPorPosto[postoId] ?? null)
    setAplicaProd(jaAplica ?? null)
    setQuest({ produto, valor: v })
  }

  // Passo 2: confirma e lança o preço junto das respostas do questionário
  async function confirmarLancamento() {
    if (!quest) return
    if (temCartao == null) { toast({ variant: 'destructive', title: 'Responda se o posto tem cartão de desconto' }); return }
    if (temCartao && aplicaProd == null) { toast({ variant: 'destructive', title: `Responda se o cartão vale para ${quest.produto}` }); return }
    const { produto, valor } = quest
    setSalvando(produto)
    try {
      const r = await fetch('/api/precos-frotas/gerente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posto_id: postoId, produto, preco: valor,
          tem_cartao_desconto: temCartao,
          cartao_desconto_aplicado: temCartao ? aplicaProd : null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPrecos(prev => {
        const idx = prev.findIndex(p => p.posto_id === postoId && p.produto === produto)
        if (idx >= 0) { const n = [...prev]; n[idx] = d.preco; return n }
        return [...prev, d.preco]
      })
      setCartaoPorPosto(prev => ({ ...prev, [postoId]: temCartao }))
      setValores(prev => ({ ...prev, [produto]: '' }))
      setSalvo(prev => ({ ...prev, [produto]: true }))
      setTimeout(() => setSalvo(prev => ({ ...prev, [produto]: false })), 2500)
      setQuest(null)
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

      {/* Posto ativo — sempre visível para não ter dúvida de onde está lançando */}
      <SeletorPostoAtivo
        postos={postos}
        value={postoId}
        onChange={setPostoAtivo}
        label="Lançando preços para"
      />

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
                    onKeyDown={e => { if (e.key === 'Enter') abrirQuestionario(produto) }}
                    placeholder="Novo preço (ex.: 5,899)"
                    className="w-full h-12 border border-gray-200 rounded-xl pl-9 pr-3 text-[15px] font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                  />
                </div>
                <button
                  onClick={() => abrirQuestionario(produto)}
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

      {/* Questionário do cartão de desconto */}
      {quest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => salvando ? null : setQuest(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-orange-500" />
                <h3 className="text-[14px] font-bold text-gray-900">Cartão de desconto</h3>
              </div>
              <button onClick={() => setQuest(null)} disabled={!!salvando} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-gray-500">
                Lançando <b>{quest.produto}</b> a <b>{quest.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3 })}</b>
              </p>

              {/* Pergunta 1 */}
              <div>
                <p className="text-[13px] font-semibold text-gray-800 mb-2">Este posto tem cartão de desconto?</p>
                <div className="flex gap-2">
                  {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(o => (
                    <button key={o.l} onClick={() => { setTemCartao(o.v); if (!o.v) setAplicaProd(null) }}
                      className={`flex-1 h-10 rounded-lg text-[13px] font-semibold border transition ${
                        temCartao === o.v ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                      }`}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pergunta 2 (só se tem cartão) */}
              {temCartao && (
                <div>
                  <p className="text-[13px] font-semibold text-gray-800 mb-2">O cartão de desconto é aplicado no <span className="text-orange-600">{quest.produto}</span>?</p>
                  <div className="flex gap-2">
                    {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(o => (
                      <button key={o.l} onClick={() => setAplicaProd(o.v)}
                        className={`flex-1 h-10 rounded-lg text-[13px] font-semibold border transition ${
                          aplicaProd === o.v ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                        }`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={() => setQuest(null)} disabled={!!salvando} className="h-10 px-4 text-[13px] text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarLancamento} disabled={!!salvando}
                className="h-10 px-5 text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Lançar preço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
