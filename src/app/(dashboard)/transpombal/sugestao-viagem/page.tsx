'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  Truck, User, Droplets, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, ArrowLeft, Package, Fuel,
  ChevronRight, ClipboardList, Pencil, X, Plus, Save,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Necessidade {
  posto_nome:       string
  posto_id:         string | null
  produto:          string
  capacidade_l:     number
  medida_l:         number | null
  pct_atual:        number | null
  volume_needed_l:  number
  volume_needed_m3: number
  urgencia:         'critico' | 'baixo'
}

interface ItemViagem {
  compartimento_idx: number
  capacidade_m3:     number
  posto_nome:        string
  posto_id:          string | null
  produto:           string
  volume_m3:         number
}

interface SugestaoViagem {
  veiculo: { id: string; placa: string; tipo: string; compartimentos: number[] }
  motorista?: { id: string; nome: string }
  itens:               ItemViagem[]
  volume_total_m3:     number
  capacidade_total_m3: number
  postos_atendidos:    string[]
}

interface DadosSugestao {
  data:                    string
  necessidades:            Necessidade[]
  sugestoes:               SugestaoViagem[]
  sem_caminhao:            Necessidade[]
  total_postos_urgentes:   number
  veiculos:                { id: string; placa: string; tipo: string; compartimentos: number[] }[]
  motoristas:              { id: string; nome: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PRODUTOS = ['G.C', 'G.A', 'D.C', 'D.S10', 'D.S15', 'E.T', 'G.R']

const PRODUTO_COLOR: Record<string, string> = {
  'G.C':    'bg-yellow-100 text-yellow-800 border-yellow-200',
  'G.A':    'bg-amber-100 text-amber-800 border-amber-200',
  'ETANOL': 'bg-green-100 text-green-800 border-green-200',
  'E.T':    'bg-green-100 text-green-800 border-green-200',
  'D.C':    'bg-blue-100 text-blue-800 border-blue-200',
  'D.S-10': 'bg-sky-100 text-sky-800 border-sky-200',
  'D.S10':  'bg-sky-100 text-sky-800 border-sky-200',
  'D.S-15': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'D.S15':  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'G.R':    'bg-red-100 text-red-800 border-red-200',
}

function produtoBadge(produto: string) {
  return PRODUTO_COLOR[produto] ?? 'bg-gray-100 text-gray-700 border-gray-200'
}

function fmtL(n: number) { return n.toLocaleString('pt-BR') + ' L' }
function fmtM3(n: number) { return n.toFixed(1) + ' m³' }

function PctBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-[11px]">sem medição</span>
  const color = pct < 20 ? 'bg-red-500' : pct < 40 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={cn('text-[11px] font-bold', pct < 20 ? 'text-red-600' : pct < 40 ? 'text-amber-600' : 'text-emerald-600')}>
        {pct}%
      </span>
    </div>
  )
}

// ── Modal de edição da viagem ─────────────────────────────────────────────────

interface ItemEditavel {
  produto:    string
  posto_nome: string
  volume_m3:  number
}

function ModalEditarViagem({
  sugestao, veiculos, motoristas, postoNomes, onSave, onClose,
}: {
  sugestao:   SugestaoViagem
  veiculos:   DadosSugestao['veiculos']
  motoristas: DadosSugestao['motoristas']
  postoNomes: string[]
  onSave:     (s: SugestaoViagem) => void
  onClose:    () => void
}) {
  const [veiculoId,   setVeiculoId]   = useState(sugestao.veiculo.id)
  const [motoristaId, setMotoristaId] = useState(sugestao.motorista?.id ?? '')
  const [itens,       setItens]       = useState<ItemEditavel[]>(
    sugestao.itens.map(i => ({ produto: i.produto, posto_nome: i.posto_nome, volume_m3: i.volume_m3 }))
  )

  const veiculoSel = veiculos.find(v => v.id === veiculoId) ?? sugestao.veiculo
  const motoristaSel = motoristas.find(m => m.id === motoristaId)

  const capacidadeTotal = veiculoSel.compartimentos.reduce((s, c) => s + c, 0)
  const volumeUsado     = itens.reduce((s, i) => s + i.volume_m3, 0)

  function addItem() {
    setItens(prev => [...prev, { produto: 'G.C', posto_nome: '', volume_m3: 5 }])
  }

  function removeItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof ItemEditavel, value: string | number) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function handleSave() {
    const itensFiltrados = itens.filter(i => i.posto_nome.trim())
    if (itensFiltrados.length === 0) {
      toast({ variant: 'destructive', title: 'Adicione ao menos um item com posto definido' })
      return
    }

    // Reconstrói o objeto SugestaoViagem com os dados editados
    const novosItens: ItemViagem[] = itensFiltrados.map((it, idx) => ({
      compartimento_idx: idx,
      capacidade_m3:     veiculoSel.compartimentos[idx] ?? it.volume_m3,
      posto_nome:        it.posto_nome,
      posto_id:          null,
      produto:           it.produto,
      volume_m3:         it.volume_m3,
    }))

    const novasSugestao: SugestaoViagem = {
      veiculo:             veiculoSel,
      motorista:           motoristaSel ? { id: motoristaSel.id, nome: motoristaSel.nome } : undefined,
      itens:               novosItens,
      volume_total_m3:     Math.round(itensFiltrados.reduce((s, i) => s + i.volume_m3, 0) * 10) / 10,
      capacidade_total_m3: capacidadeTotal,
      postos_atendidos:    [...new Set(itensFiltrados.map(i => i.posto_nome))],
    }

    onSave(novasSugestao)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Pencil className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="font-bold text-[15px] text-gray-900">Editar Viagem</h2>
            <p className="text-[11px] text-gray-400">Ajuste o caminhão, motorista e itens</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Veículo e motorista */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Caminhão</label>
              <select value={veiculoId} onChange={e => setVeiculoId(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30">
                {veiculos.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.tipo} ({v.compartimentos.map(c => `${c}m³`).join('+')} = {v.compartimentos.reduce((a,b)=>a+b,0)}m³)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Motorista</label>
              <select value={motoristaId} onChange={e => setMotoristaId(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30">
                <option value="">— Sem motorista —</option>
                {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Compartimentos do veículo selecionado */}
          {veiculoSel.compartimentos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center text-[11px] text-gray-500">
              <span className="font-semibold">Compartimentos:</span>
              {veiculoSel.compartimentos.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-gray-100 font-mono font-bold text-gray-700">
                  C{i+1}: {c}m³
                </span>
              ))}
              <span className="text-orange-600 font-semibold ml-1">Total: {capacidadeTotal}m³</span>
            </div>
          )}

          {/* Barra de capacidade */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500">Uso da capacidade</span>
              <span className={cn('text-[12px] font-bold', volumeUsado > capacidadeTotal ? 'text-red-600' : 'text-orange-600')}>
                {fmtM3(volumeUsado)} / {fmtM3(capacidadeTotal)}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', volumeUsado > capacidadeTotal ? 'bg-red-500' : 'bg-orange-400')}
                style={{ width: `${Math.min(100, capacidadeTotal > 0 ? (volumeUsado / capacidadeTotal) * 100 : 0)}%` }}
              />
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-gray-700">Itens da carga</span>
              <button onClick={addItem}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500 text-white text-[12px] font-medium hover:bg-orange-600">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-gray-400 border border-dashed border-gray-200 rounded-xl">
                Nenhum item. Clique em "Adicionar" para incluir.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Produto</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Posto</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-20">Vol (m³)</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {itens.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-3 py-1.5">
                          <select value={item.produto} onChange={e => updateItem(idx, 'produto', e.target.value)}
                            className="w-full px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none text-[12px]">
                            {PRODUTOS.map(p => <option key={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          {postoNomes.length > 0 ? (
                            <select value={item.posto_nome} onChange={e => updateItem(idx, 'posto_nome', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none text-[12px]">
                              <option value="">— Posto —</option>
                              {postoNomes.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          ) : (
                            <input value={item.posto_nome} onChange={e => updateItem(idx, 'posto_nome', e.target.value)}
                              placeholder="Nome do posto"
                              className="w-full px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none uppercase text-[12px]" />
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="number" value={item.volume_m3} min={0.5} max={50} step={0.5}
                            onChange={e => updateItem(idx, 'volume_m3', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-center font-mono rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => removeItem(idx)}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          <span className="text-[12px] text-gray-400">
            {itens.filter(i => i.posto_nome).length} item{itens.filter(i => i.posto_nome).length !== 1 ? 'ns' : ''} · {fmtM3(volumeUsado)}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:text-gray-800 transition-colors">Cancelar</button>
            <button onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white text-[13px] font-semibold rounded-xl hover:bg-orange-600 transition-colors">
              <Save className="w-4 h-4" /> Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Componente: Card da viagem sugerida ───────────────────────────────────────

function CardViagem({
  sugestao, idx, onEditar, onCriarCarregamento,
}: {
  sugestao:            SugestaoViagem
  idx:                 number
  onEditar:            () => void
  onCriarCarregamento: (s: SugestaoViagem) => void
}) {
  const ocupacao = sugestao.capacidade_total_m3 > 0
    ? Math.round((sugestao.volume_total_m3 / sugestao.capacidade_total_m3) * 100)
    : 0

  // Agrupa itens por posto
  const porPosto = sugestao.itens.reduce<Record<string, ItemViagem[]>>((acc, item) => {
    if (!acc[item.posto_nome]) acc[item.posto_nome] = []
    acc[item.posto_nome].push(item)
    return acc
  }, {})

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Cabeçalho do caminhão */}
      <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Truck className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-900">{sugestao.veiculo.placa}</p>
            <p className="text-[11px] text-gray-400 capitalize">{sugestao.veiculo.tipo}</p>
          </div>
        </div>

        {sugestao.motorista && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
            <User className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[12px] font-semibold text-blue-700">{sugestao.motorista.nome}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Ocupação do caminhão */}
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Carregamento</p>
            <p className="text-[13px] font-bold text-gray-700">
              {fmtM3(sugestao.volume_total_m3)} / {fmtM3(sugestao.capacidade_total_m3)}
            </p>
          </div>
          <div className="w-16">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', ocupacao > 90 ? 'bg-orange-500' : 'bg-emerald-500')}
                style={{ width: `${Math.min(100, ocupacao)}%` }}
              />
            </div>
            <p className="text-[10px] text-center text-gray-500 mt-0.5">{ocupacao}%</p>
          </div>
          {/* Botão editar */}
          <button onClick={onEditar}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-colors"
            title="Editar viagem">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compartimentos */}
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Compartimentos ({sugestao.veiculo.compartimentos.length})
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {sugestao.veiculo.compartimentos.map((cap, i) => {
            const item = sugestao.itens.find(it => it.compartimento_idx === i)
            return (
              <div
                key={i}
                className={cn(
                  'flex flex-col items-center rounded-lg border px-2.5 py-1.5 min-w-[52px]',
                  item ? produtoBadge(item.produto) : 'bg-gray-50 border-gray-200 text-gray-400'
                )}
              >
                <span className="text-[9px] font-semibold uppercase">C{i + 1}</span>
                <span className="text-[12px] font-bold">{cap}m³</span>
                {item && (
                  <>
                    <span className="text-[9px] font-semibold mt-0.5">{item.produto}</span>
                    <span className="text-[9px] opacity-70">{fmtM3(item.volume_m3)}</span>
                  </>
                )}
                {!item && <span className="text-[9px]">livre</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Postos a visitar */}
      <div className="px-5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {sugestao.postos_atendidos.length} posto{sugestao.postos_atendidos.length !== 1 ? 's' : ''} a visitar
        </p>
        <div className="space-y-2">
          {Object.entries(porPosto).map(([posto, itens]) => (
            <div key={posto} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="text-[13px] font-semibold text-gray-800 truncate">{posto}</span>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {itens.map((item, j) => (
                  <div key={j} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-medium', produtoBadge(item.produto))}>
                    <Droplets className="w-2.5 h-2.5" />
                    {item.produto} — {fmtM3(item.volume_m3)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ação */}
      <div className="px-5 pb-4 flex gap-2">
        <button onClick={onEditar}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-semibold hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors">
          <Pencil className="w-4 h-4" /> Editar
        </button>
        <button
          onClick={() => onCriarCarregamento(sugestao)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
        >
          <Truck className="w-4 h-4" />
          Criar Carregamento
        </button>
      </div>
    </div>
  )
}

// ── Página Principal ───────────────────────────────────────────────────────────

export default function SugestaoViagemPage() {
  const router = useRouter()
  const [dados,      setDados]      = useState<DadosSugestao | null>(null)
  const [sugestoes,  setSugestoes]  = useState<SugestaoViagem[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null)

  // nomes de postos para o select do modal
  const postoNomes = [...new Set(
    (dados?.necessidades ?? []).map(n => n.posto_nome)
  )].sort()

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/transpombal/sugestao-viagem')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDados(json)
      setSugestoes(json.sugestoes ?? [])
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar sugestão', description: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function handleSalvarEdicao(idx: number, novasSugestao: SugestaoViagem) {
    setSugestoes(prev => prev.map((s, i) => i === idx ? novasSugestao : s))
    toast({ title: 'Viagem atualizada!' })
  }

  function criarCarregamento(sugestao: SugestaoViagem) {
    const itens = sugestao.itens.map(i => ({
      posto_nome:    i.posto_nome,
      posto_id:      i.posto_id,
      produto:       i.produto,
      capacidade_m3: i.volume_m3,
    }))

    sessionStorage.setItem('sugestao_carregamento', JSON.stringify({
      placa:          sugestao.veiculo.placa,
      motorista_id:   sugestao.motorista?.id ?? null,
      motorista_nome: sugestao.motorista?.nome ?? '',
      itens,
    }))
    toast({ title: 'Abrindo formulário de carregamento...' })
    router.push('/transpombal')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    )
  }

  const criticos = dados?.necessidades.filter(n => n.urgencia === 'critico') ?? []
  const baixos   = dados?.necessidades.filter(n => n.urgencia === 'baixo')   ?? []
  const postosUrgentes = [...new Set(dados?.necessidades.map(n => n.posto_nome) ?? [])]

  return (
    <div className="animate-fade-in">
      <Header
        title="Sugestão de Viagem"
        description="Distribuição automática de combustível por caminhão"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/transpombal"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">
              <ArrowLeft className="w-3.5 h-3.5" /> Transpombal
            </Link>
            <button onClick={carregar} disabled={loading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
            </button>
          </div>
        }
      />

      <div className="p-3 md:p-6 space-y-6">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-red-600">{criticos.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Tanques críticos (&lt;20%)</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-amber-600">{baixos.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Tanques baixos (20–40%)</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-orange-600">{postosUrgentes.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Postos que precisam</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-blue-600">{sugestoes.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Viagens sugeridas</p>
          </div>
        </div>

        {/* ── Postos que precisam ── */}
        {(dados?.necessidades.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-[13px] font-semibold text-gray-800">Postos que precisam de combustível</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Posto</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Produto</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600 text-right">Atual</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600 min-w-[120px]">Nível</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600 text-right">Necessário</th>
                    <th className="px-3 py-2.5 font-semibold text-gray-600 text-right">Em m³</th>
                  </tr>
                </thead>
                <tbody>
                  {dados?.necessidades.map((n, i) => (
                    <tr key={i} className={cn(
                      'border-b border-gray-50 last:border-0',
                      n.urgencia === 'critico' ? 'bg-red-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                    )}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {n.urgencia === 'critico' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                          <span className="font-semibold text-gray-800">{n.posto_nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', produtoBadge(n.produto))}>
                          {n.produto}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {n.medida_l !== null ? fmtL(n.medida_l) : '—'}
                      </td>
                      <td className="px-3 py-2.5 min-w-[120px]">
                        <PctBar pct={n.pct_atual} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                        {fmtL(n.volume_needed_l)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-bold text-orange-600">{fmtM3(n.volume_needed_m3)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Sugestões de viagem ── */}
        {sugestoes.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-orange-500" />
              <h2 className="text-[14px] font-bold text-gray-800">Viagens sugeridas</h2>
              <span className="text-[11px] text-gray-400">— clique em Editar para ajustar antes de criar</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {sugestoes.map((s, i) => (
                <CardViagem
                  key={i}
                  sugestao={s}
                  idx={i}
                  onEditar={() => setEditandoIdx(i)}
                  onCriarCarregamento={criarCarregamento}
                />
              ))}
            </div>
          </div>
        ) : !loading && (dados?.necessidades.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <CheckCircle2 className="w-12 h-12 opacity-30" />
            <p className="text-[14px] font-medium">Todos os tanques estão acima de 40%</p>
            <p className="text-[12px]">Nenhuma viagem necessária no momento</p>
          </div>
        ) : null}

        {/* ── Postos sem caminhão disponível ── */}
        {(dados?.sem_caminhao.length ?? 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-[13px] font-semibold text-amber-800">
                {dados!.sem_caminhao.length} entrega{dados!.sem_caminhao.length !== 1 ? 's' : ''} sem caminhão disponível
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {dados!.sem_caminhao.map((n, i) => (
                <span key={i} className="px-2.5 py-1 bg-white border border-amber-200 rounded-lg text-[11px] font-medium text-amber-700">
                  {n.posto_nome} · {n.produto} ({fmtM3(n.volume_needed_m3)})
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center">
          Baseado nas medições de hoje. Tanques sem medição ou abaixo de 40% da capacidade são incluídos.
        </p>
      </div>

      {/* Modal de edição */}
      {editandoIdx !== null && dados && (
        <ModalEditarViagem
          sugestao={sugestoes[editandoIdx]}
          veiculos={dados.veiculos}
          motoristas={dados.motoristas}
          postoNomes={postoNomes}
          onSave={(nova) => handleSalvarEdicao(editandoIdx, nova)}
          onClose={() => setEditandoIdx(null)}
        />
      )}
    </div>
  )
}
