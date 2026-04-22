'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Header } from '@/components/layout/Header'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  Truck, Plus, RefreshCw, ChevronDown, X, Check, Pencil, Trash2,
  Calendar, MapPin, Package, User, Hash, Fuel, ChevronRight,
  AlertCircle, Clock, CheckCircle2, XCircle, Layers, Settings,
  Phone, Save, ArrowRight, BarChart3, TrendingUp,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Motorista = { id: string; nome: string; telefone: string | null; ativo: boolean }
type Veiculo   = { id: string; placa: string; tipo: string; compartimentos: number[]; ativo: boolean }

type Item = {
  id?: string
  ordem: number
  capacidade_m3: number
  produto: string
  posto_nome: string
  numero_pedido: string
  status: string
}

type Carregamento = {
  id: string
  data_carregamento: string
  origem: string
  motorista_id: string | null
  motorista_nome: string | null
  motorista: { id: string; nome: string } | null
  placas: string[]
  status: string
  observacoes: string | null
  itens: Item[]
  criado_em: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PRODUTOS = ['G.C', 'G.A', 'D.C', 'D.S10', 'E.T', 'G.R', 'D.S15']
const PRODUTO_CORES: Record<string, string> = {
  'G.C':  'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300',
  'G.A':  'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
  'D.C':  'bg-green-100  text-green-800  dark:bg-green-500/20  dark:text-green-300',
  'D.S10':'bg-blue-100   text-blue-800   dark:bg-blue-500/20   dark:text-blue-300',
  'D.S15':'bg-sky-100    text-sky-800    dark:bg-sky-500/20    dark:text-sky-300',
  'E.T':  'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300',
  'G.R':  'bg-red-100    text-red-800    dark:bg-red-500/20    dark:text-red-300',
}

const STATUS_CONFIG = {
  planejado:  { label: 'Planejado',   icon: Clock,         cls: 'bg-gray-100   text-gray-700   dark:bg-gray-700   dark:text-gray-300'   },
  carregando: { label: 'Carregando',  icon: Package,       cls: 'bg-blue-100   text-blue-700   dark:bg-blue-500/20 dark:text-blue-300'   },
  a_caminho:  { label: 'A Caminho',   icon: Truck,         cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' },
  entregue:   { label: 'Entregue',    icon: CheckCircle2,  cls: 'bg-green-100  text-green-700  dark:bg-green-500/20 dark:text-green-300'  },
  cancelado:  { label: 'Cancelado',   icon: XCircle,       cls: 'bg-red-100    text-red-700    dark:bg-red-500/20   dark:text-red-300'    },
}

const ORIGENS = ['CAXIAS', 'OUTRO']

function fmtData(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtDataInput(iso: string) { return iso?.slice(0, 10) ?? '' }

function nomeMotoristaCar(c: Carregamento) {
  return c.motorista?.nome ?? c.motorista_nome ?? '—'
}

function volumeTotal(itens: Item[]) {
  return itens.reduce((s, i) => s + (i.capacidade_m3 ?? 0), 0)
}

// ─── Badge de produto ─────────────────────────────────────────────────────────

function ProdutoBadge({ produto }: { produto: string }) {
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
      PRODUTO_CORES[produto] ?? 'bg-gray-100 text-gray-700'
    )}>
      {produto}
    </span>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.planejado
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', cfg.cls)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ─── Modal de Carregamento ────────────────────────────────────────────────────

function ModalCarregamento({
  onClose, onSave, motoristas, veiculos, postoNomes, inicial,
}: {
  onClose: () => void
  onSave:  (data: any) => Promise<void>
  motoristas: Motorista[]
  veiculos:   Veiculo[]
  postoNomes: string[]
  inicial?: Carregamento | null
}) {
  const editando = !!inicial

  const [data,          setData]          = useState(fmtDataInput(inicial?.data_carregamento ?? new Date().toISOString().slice(0, 10)))
  const [origem,        setOrigem]        = useState(inicial?.origem ?? 'CAXIAS')
  const [motoristaId,   setMotoristaId]   = useState(inicial?.motorista_id ?? '')
  const [motoristaNome, setMotoristaNome] = useState(inicial?.motorista_nome ?? '')
  const [placasSel,     setPlacasSel]     = useState<string[]>(inicial?.placas ?? [])
  const [placasInput,   setPlacasInput]   = useState(inicial?.placas?.join(' / ') ?? '')
  const [statusCar,     setStatusCar]     = useState(inicial?.status ?? 'planejado')
  const [obs,           setObs]           = useState(inicial?.observacoes ?? '')
  const [itens,         setItens]         = useState<Omit<Item, 'id'>[]>(
    inicial?.itens?.map(i => ({
      ordem:         i.ordem,
      capacidade_m3: i.capacidade_m3,
      produto:       i.produto,
      posto_nome:    i.posto_nome,
      numero_pedido: i.numero_pedido ?? '',
      status:        i.status,
    })) ?? []
  )
  const [saving, setSaving] = useState(false)

  // Compartimentos disponíveis das placas selecionadas
  const placasSelecionadas = placasSel.length > 0
    ? placasSel
    : placasInput.split(/[\s,/]+/).map(p => p.trim().toUpperCase()).filter(Boolean)
  const veiculosSelecionados = veiculos.filter(v => placasSelecionadas.includes(v.placa))
  const compartimentosDisponiveis = veiculosSelecionados.flatMap(v => v.compartimentos).sort((a, b) => b - a)
  const volumeUsado = itens.reduce((s, i) => s + i.capacidade_m3, 0)
  const volumeCapacidade = compartimentosDisponiveis.reduce((s, c) => s + c, 0)

  function addItem() {
    setItens(prev => [...prev, { ordem: prev.length, capacidade_m3: 5, produto: 'G.C', posto_nome: '', numero_pedido: '', status: 'pendente' }])
  }

  function removeItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i })))
  }

  function updateItem(idx: number, field: string, value: any) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  async function handleSave() {
    if (!data) { toast({ variant: 'destructive', title: 'Data obrigatória' }); return }
    setSaving(true)
    try {
      const placas = placasSel.length > 0
        ? placasSel
        : placasInput.split(/[\s,/]+/).map(p => p.trim().toUpperCase()).filter(Boolean)
      await onSave({
        data_carregamento: data,
        origem,
        motorista_id:  motoristaId || null,
        motorista_nome: !motoristaId ? (motoristaNome || null) : null,
        placas,
        status: statusCar,
        observacoes: obs || null,
        itens: itens.map((it, i) => ({ ...it, ordem: i })),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Truck className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="font-bold text-[15px] text-gray-900 dark:text-gray-100">
              {editando ? 'Editar Carregamento' : 'Novo Carregamento'}
            </h2>
            <p className="text-[11px] text-gray-400">Transpombal — distribuição de combustível</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Dados principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Origem</label>
              <select value={origem} onChange={e => setOrigem(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30">
                {ORIGENS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Status</label>
              <select value={statusCar} onChange={e => setStatusCar(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30">
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Motorista</label>
              <select value={motoristaId} onChange={e => setMotoristaId(e.target.value)}
                className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30">
                <option value="">— digitar nome —</option>
                {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              {!motoristaId && (
                <input value={motoristaNome} onChange={e => setMotoristaNome(e.target.value)} placeholder="Nome do motorista"
                  className="mt-1 w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none" />
              )}
            </div>
          </div>

          {/* Placas + Compartimentos */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-gray-500">Placas (cavalinho / carretas)</label>
            {veiculos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {veiculos.map(v => {
                  const sel = placasSel.includes(v.placa)
                  return (
                    <button key={v.id} type="button"
                      onClick={() => setPlacasSel(prev => sel ? prev.filter(p => p !== v.placa) : [...prev, v.placa])}
                      className={cn(
                        'flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all',
                        sel ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-orange-300'
                      )}>
                      <span className="font-mono font-bold text-[13px]">{v.placa}</span>
                      <span className={cn('text-[10px] mt-0.5', sel ? 'text-orange-100' : 'text-gray-400')}>
                        {v.tipo} · {v.compartimentos.length > 0 ? v.compartimentos.map(c => `${c}m³`).join('+') : 'sem comp.'}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <input value={placasInput} onChange={e => setPlacasInput(e.target.value.toUpperCase())}
                placeholder="ex: TOO1F54 / SGG9D63 / SGG9D61"
                className="w-full px-3 py-2 text-[13px] font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30" />
            )}
            {compartimentosDisponiveis.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-gray-500 font-medium">Compartimentos registrados:</span>
                {compartimentosDisponiveis.map((c, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[11px] font-mono font-bold text-gray-700 dark:text-gray-300">
                    {c}m³
                  </span>
                ))}
                <span className="text-[11px] text-orange-600 font-semibold ml-1">Total: {volumeCapacidade}m³</span>
              </div>
            )}
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-500" />
                Itens do Carregamento
                <span className="text-[11px] font-normal text-gray-400">
                  ({itens.length} {itens.length === 1 ? 'item' : 'itens'} · {volumeUsado}m³
                  {volumeCapacidade > 0 && <> / {volumeCapacidade}m³</>})
                </span>
              </span>
              <button onClick={addItem}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500 text-white text-[12px] font-medium hover:bg-orange-600 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>

            {/* Barra de uso da capacidade */}
            {volumeCapacidade > 0 && (
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', volumeUsado > volumeCapacidade ? 'bg-red-500' : 'bg-orange-400')}
                  style={{ width: `${Math.min(100, (volumeUsado / volumeCapacidade) * 100)}%` }}
                />
              </div>
            )}

            {itens.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                Nenhum item adicionado. Clique em "Adicionar" para incluir compartimentos.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-16">m³</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Produto</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Posto</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-32">Nº Pedido</th>
                      {editando && <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Status</th>}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {itens.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-1.5">
                          <input type="number" value={item.capacidade_m3} min={1} max={50} step={0.5}
                            onChange={e => updateItem(idx, 'capacidade_m3', parseFloat(e.target.value) || 0)}
                            className="w-14 px-2 py-1 text-center font-mono rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={item.produto} onChange={e => updateItem(idx, 'produto', e.target.value)}
                            className="w-full px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-[12px]">
                            {PRODUTOS.map(p => <option key={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          {postoNomes.length > 0 ? (
                            <select value={item.posto_nome} onChange={e => updateItem(idx, 'posto_nome', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-[12px]">
                              <option value="">— Posto —</option>
                              {postoNomes.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          ) : (
                            <input value={item.posto_nome} onChange={e => updateItem(idx, 'posto_nome', e.target.value.toUpperCase())}
                              placeholder="Nome do posto"
                              className="w-full px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none uppercase" />
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <input value={item.numero_pedido} onChange={e => updateItem(idx, 'numero_pedido', e.target.value)}
                            placeholder="Pedido"
                            className="w-full px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none font-mono" />
                        </td>
                        {editando && (
                          <td className="px-3 py-1.5 text-center">
                            <select value={item.status} onChange={e => updateItem(idx, 'status', e.target.value)}
                              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-[11px]">
                              <option value="pendente">Pendente</option>
                              <option value="entregue">Entregue</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </td>
                        )}
                        <td className="px-2 py-1.5">
                          <button onClick={() => removeItem(idx)} className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
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

          {/* Observações */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Observações opcionais..."
              className="w-full px-3 py-2 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <span className="text-[12px] text-gray-400">
            {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {volumeUsado}m³ total
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:text-gray-800 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white text-[13px] font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editando ? 'Salvar Alterações' : 'Criar Carregamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card de Carregamento ─────────────────────────────────────────────────────

function CardCarregamento({
  car, onEdit, onDelete, onStatusChange,
}: {
  car: Carregamento
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (id: string, status: string) => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [mudandoStatus, setMudandoStatus] = useState(false)
  const volume = volumeTotal(car.itens)

  const postos = [...new Set(car.itens.map(i => i.posto_nome))].filter(Boolean)
  const produtosUnicos = [...new Set(car.itens.map(i => i.produto))]

  const itensPendentes = car.itens.filter(i => i.status === 'pendente').length
  const itensEntregues = car.itens.filter(i => i.status === 'entregue').length
  const pctEntregue = car.itens.length > 0 ? Math.round((itensEntregues / car.itens.length) * 100) : 0

  const PROX_STATUS: Record<string, string> = {
    planejado: 'carregando',
    carregando: 'a_caminho',
    a_caminho: 'entregue',
    entregue: 'planejado',
    cancelado: 'planejado',
  }

  async function avancarStatus() {
    const proximo = PROX_STATUS[car.status]
    if (!proximo) return
    setMudandoStatus(true)
    await onStatusChange(car.id, proximo)
    setMudandoStatus(false)
  }

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden shadow-sm transition-all',
      car.status === 'cancelado' ? 'border-red-200 dark:border-red-900/40 opacity-60' :
      car.status === 'entregue'  ? 'border-green-200 dark:border-green-900/40' :
      car.status === 'a_caminho' ? 'border-orange-200 dark:border-orange-900/40' :
      'border-gray-200 dark:border-gray-800'
    )}>
      {/* Header do card */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Ícone status */}
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
          car.status === 'entregue' ? 'bg-green-100 dark:bg-green-500/20' :
          car.status === 'a_caminho' ? 'bg-orange-100 dark:bg-orange-500/20' :
          car.status === 'carregando' ? 'bg-blue-100 dark:bg-blue-500/20' :
          'bg-gray-100 dark:bg-gray-800'
        )}>
          <Truck className={cn('w-5 h-5',
            car.status === 'entregue' ? 'text-green-600' :
            car.status === 'a_caminho' ? 'text-orange-600' :
            car.status === 'carregando' ? 'text-blue-600' :
            'text-gray-500'
          )} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Linha 1: motorista + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[14px] text-gray-900 dark:text-gray-100">{nomeMotoristaCar(car)}</span>
            <StatusBadge status={car.status} />
          </div>
          {/* Linha 2: data, origem, placas */}
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Calendar className="w-3 h-3" /> {fmtData(car.data_carregamento)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <MapPin className="w-3 h-3" /> {car.origem}
            </span>
            <span className="text-[11px] font-mono text-gray-500">{car.placas.join(' / ')}</span>
          </div>
          {/* Linha 3: resumo */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[11px] text-gray-600 font-medium">{volume}m³</span>
            <span className="text-[11px] text-gray-400">·</span>
            <span className="text-[11px] text-gray-500">{car.itens.length} compartimentos</span>
            <span className="text-[11px] text-gray-400">·</span>
            <span className="text-[11px] text-gray-500">{postos.length} {postos.length === 1 ? 'posto' : 'postos'}</span>
            <div className="flex gap-1 flex-wrap">
              {produtosUnicos.map(p => <ProdutoBadge key={p} produto={p} />)}
            </div>
          </div>
          {/* Barra de progresso */}
          {car.itens.length > 0 && car.status !== 'planejado' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 max-w-[120px] h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', pctEntregue === 100 ? 'bg-green-500' : 'bg-orange-400')}
                  style={{ width: `${pctEntregue}%` }} />
              </div>
              <span className="text-[10px] text-gray-400">{itensEntregues}/{car.itens.length} entregue{itensEntregues !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {car.status !== 'cancelado' && car.status !== 'entregue' && (
            <button onClick={avancarStatus} disabled={mudandoStatus}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-[11px] font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap">
              {mudandoStatus ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              {STATUS_CONFIG[PROX_STATUS[car.status] as keyof typeof STATUS_CONFIG]?.label ?? ''}
            </button>
          )}
          <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpandido(v => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expandido && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Tabela expandida */}
      {expandido && car.itens.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <th className="text-center px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase w-12">#</th>
                <th className="text-left   px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase w-16">m³</th>
                <th className="text-left   px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase w-20">Produto</th>
                <th className="text-left   px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Posto</th>
                <th className="text-left   px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase w-32">Nº Pedido</th>
                <th className="text-center px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {[...car.itens].sort((a, b) => a.ordem - b.ordem).map((item, idx) => (
                <tr key={idx} className={cn('transition-colors',
                  item.status === 'entregue' ? 'bg-green-50/40 dark:bg-green-500/5' :
                  item.status === 'cancelado' ? 'opacity-40' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/30'
                )}>
                  <td className="px-3 py-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800 dark:text-gray-200">{item.capacidade_m3}m³</td>
                  <td className="px-3 py-2"><ProdutoBadge produto={item.produto} /></td>
                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">{item.posto_nome}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{item.numero_pedido || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                      item.status === 'entregue' ? 'bg-green-100 text-green-700' :
                      item.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    )}>
                      {item.status === 'entregue' ? <Check className="w-2.5 h-2.5" /> :
                       item.status === 'cancelado' ? <X className="w-2.5 h-2.5" /> :
                       <Clock className="w-2.5 h-2.5" />}
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
                <td colSpan={2} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 dark:text-gray-400">
                  Total: {volume}m³
                </td>
                <td colSpan={4} className="px-3 py-1.5 text-[11px] text-gray-400">
                  {postos.join(' · ')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Aba Frota ────────────────────────────────────────────────────────────────

function AbaFrota({ veiculos, motoristas, onRefresh }: {
  veiculos: Veiculo[]; motoristas: Motorista[]; onRefresh: () => void
}) {
  const [novaPlaca,      setNovaPlaca]      = useState('')
  const [novoTipo,       setNovoTipo]       = useState('carreta')
  const [novoComps,      setNovoComps]      = useState('')
  const [novoMotorista,  setNovoMotorista]  = useState('')
  const [novoTel,        setNovoTel]        = useState('')
  const [savingV,        setSavingV]        = useState(false)
  const [savingM,        setSavingM]        = useState(false)

  async function addVeiculo() {
    if (!novaPlaca.trim()) return
    setSavingV(true)
    try {
      const compartimentos = novoComps.split(/[\s,]+/).map(Number).filter(n => n > 0)
      const res = await fetch('/api/transpombal/veiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: novaPlaca.toUpperCase(), tipo: novoTipo, compartimentos }),
      })
      if (!res.ok) { const j = await res.json(); toast({ variant: 'destructive', title: j.error }); return }
      toast({ title: `Veículo ${novaPlaca.toUpperCase()} cadastrado!` })
      setNovaPlaca(''); setNovoComps(''); setNovoTipo('carreta')
      onRefresh()
    } finally { setSavingV(false) }
  }

  async function addMotorista() {
    if (!novoMotorista.trim()) return
    setSavingM(true)
    try {
      const res = await fetch('/api/transpombal/motoristas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoMotorista.toUpperCase(), telefone: novoTel || null }),
      })
      if (!res.ok) { const j = await res.json(); toast({ variant: 'destructive', title: j.error }); return }
      toast({ title: `Motorista ${novoMotorista.toUpperCase()} cadastrado!` })
      setNovoMotorista(''); setNovoTel('')
      onRefresh()
    } finally { setSavingM(false) }
  }

  async function inativarVeiculo(id: string) {
    await fetch('/api/transpombal/veiculos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ativo: false }),
    })
    onRefresh()
  }

  async function inativarMotorista(id: string) {
    await fetch('/api/transpombal/motoristas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ativo: false }),
    })
    onRefresh()
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Veículos */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Truck className="w-4 h-4 text-orange-500" /> Veículos cadastrados
        </h3>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {veiculos.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray-400">Nenhum veículo cadastrado</div>
          ) : veiculos.map(v => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
              <div>
                <p className="font-mono font-bold text-[13px] text-gray-800 dark:text-gray-200">{v.placa}</p>
                <p className="text-[11px] text-gray-400">{v.tipo} · {v.compartimentos.length > 0 ? v.compartimentos.map(c => `${c}m³`).join(', ') : 'sem compartimentos'}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {v.compartimentos.length > 0 && (
                  <span className="text-[11px] text-orange-600 font-semibold">{v.compartimentos.reduce((a,b)=>a+b,0)}m³</span>
                )}
                <button onClick={() => inativarVeiculo(v.id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* Adicionar veículo */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
          <p className="text-[12px] font-semibold text-gray-600 dark:text-gray-400">Adicionar veículo</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={novaPlaca} onChange={e => setNovaPlaca(e.target.value.toUpperCase())} placeholder="Placa"
              className="px-3 py-1.5 text-[12px] font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none uppercase" />
            <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)}
              className="px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none">
              <option value="cavalinho">Cavalinho</option>
              <option value="carreta">Carreta</option>
            </select>
          </div>
          <input value={novoComps} onChange={e => setNovoComps(e.target.value)} placeholder="Compartimentos em m³ (ex: 7 5 5 8 5)"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none" />
          <button onClick={addVeiculo} disabled={savingV || !novaPlaca.trim()}
            className="w-full py-2 bg-orange-500 text-white text-[12px] font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {savingV ? 'Salvando...' : '+ Adicionar Veículo'}
          </button>
        </div>
      </div>

      {/* Motoristas */}
      <div className="space-y-3">
        <h3 className="text-[13px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <User className="w-4 h-4 text-orange-500" /> Motoristas cadastrados
        </h3>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {motoristas.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray-400">Nenhum motorista cadastrado</div>
          ) : motoristas.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 text-[11px] font-bold flex-shrink-0">
                {m.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="font-semibold text-[13px] text-gray-800 dark:text-gray-200">{m.nome}</p>
                {m.telefone && <p className="text-[11px] text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" />{m.telefone}</p>}
              </div>
              <button onClick={() => inativarMotorista(m.id)} className="ml-auto w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        {/* Adicionar motorista */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
          <p className="text-[12px] font-semibold text-gray-600 dark:text-gray-400">Adicionar motorista</p>
          <input value={novoMotorista} onChange={e => setNovoMotorista(e.target.value.toUpperCase())} placeholder="Nome completo"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none uppercase" />
          <input value={novoTel} onChange={e => setNovoTel(e.target.value)} placeholder="Telefone (opcional)"
            className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none" />
          <button onClick={addMotorista} disabled={savingM || !novoMotorista.trim()}
            className="w-full py-2 bg-orange-500 text-white text-[12px] font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {savingM ? 'Salvando...' : '+ Adicionar Motorista'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function TranspombalPage() {
  const hoje = new Date().toISOString().slice(0, 10)
  const [aba,             setAba]             = useState<'carregamentos' | 'frota'>('carregamentos')
  const [carregamentos,   setCarregamentos]   = useState<Carregamento[]>([])
  const [motoristas,      setMotoristas]      = useState<Motorista[]>([])
  const [veiculos,        setVeiculos]        = useState<Veiculo[]>([])
  const [postoNomes,      setPostoNomes]      = useState<string[]>([])
  const [loading,         setLoading]         = useState(true)
  const [dataIni,         setDataIni]         = useState(hoje)
  const [dataFim,         setDataFim]         = useState(hoje)
  const [filtroStatus,    setFiltroStatus]    = useState('todos')
  const [modalAberto,     setModalAberto]     = useState(false)
  const [editando,        setEditando]        = useState<Carregamento | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ data_ini: dataIni, data_fim: dataFim })
      if (filtroStatus !== 'todos') params.set('status', filtroStatus)
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`/api/transpombal/carregamentos?${params}`),
        fetch('/api/transpombal/motoristas'),
        fetch('/api/transpombal/veiculos'),
        fetch('/api/tanques'),
      ])
      const [j1, j2, j3, j4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()])
      setCarregamentos(j1.carregamentos ?? [])
      setMotoristas(j2.motoristas ?? [])
      setVeiculos(j3.veiculos ?? [])
      setPostoNomes(Object.keys(j4.porPosto ?? {}).sort())
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao carregar dados' })
    } finally {
      setLoading(false)
    }
  }, [dataIni, dataFim, filtroStatus])

  useEffect(() => { carregar() }, [carregar])

  async function handleSalvarCarregamento(data: any) {
    if (editando) {
      const res = await fetch(`/api/transpombal/carregamentos/${editando.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!res.ok) { const j = await res.json(); toast({ variant: 'destructive', title: j.error }); throw new Error(j.error) }
      toast({ title: 'Carregamento atualizado!' })
    } else {
      const res = await fetch('/api/transpombal/carregamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      if (!res.ok) { const j = await res.json(); toast({ variant: 'destructive', title: j.error }); throw new Error(j.error) }
      toast({ title: 'Carregamento criado!' })
    }
    setEditando(null)
    await carregar()
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/transpombal/carregamentos/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast({ variant: 'destructive', title: 'Erro ao excluir' }); return }
    toast({ title: 'Carregamento excluído' })
    setConfirmDelete(null)
    await carregar()
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/transpombal/carregamentos/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    setCarregamentos(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  // KPIs
  const totalVolume     = carregamentos.filter(c => c.status !== 'cancelado').reduce((s, c) => s + volumeTotal(c.itens), 0)
  const totalPlanejados = carregamentos.filter(c => c.status === 'planejado').length
  const totalACaminho   = carregamentos.filter(c => c.status === 'a_caminho' || c.status === 'carregando').length
  const totalEntregues  = carregamentos.filter(c => c.status === 'entregue').length

  // Agrupar por data
  const porData: Record<string, Carregamento[]> = {}
  for (const c of carregamentos) {
    if (!porData[c.data_carregamento]) porData[c.data_carregamento] = []
    porData[c.data_carregamento].push(c)
  }
  const datas = Object.keys(porData).sort((a, b) => b.localeCompare(a))

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Transpombal — Frota e Carregamentos"
        description="Controle de distribuição de combustível e gestão da frota"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={carregar} className="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 transition-colors">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
            <button onClick={() => { setEditando(null); setModalAberto(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-[13px] font-semibold rounded-xl hover:bg-orange-600 transition-colors">
              <Plus className="w-4 h-4" /> Novo Carregamento
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-5">

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {([['carregamentos', 'Carregamentos', Truck], ['frota', 'Frota & Motoristas', Settings]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setAba(key as any)}
              className={cn('flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                aba === key ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {aba === 'carregamentos' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Volume Total',   value: `${totalVolume}m³`,           icon: BarChart3,    color: 'bg-blue-50   border-blue-100   dark:bg-blue-500/10   dark:border-blue-500/20', text: 'text-blue-700 dark:text-blue-300'   },
                { label: 'Planejados',     value: String(totalPlanejados),       icon: Clock,        color: 'bg-gray-50   border-gray-200   dark:bg-gray-800     dark:border-gray-700',      text: 'text-gray-700 dark:text-gray-300'   },
                { label: 'Em Trânsito',    value: String(totalACaminho),         icon: Truck,        color: 'bg-orange-50 border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20', text: 'text-orange-700 dark:text-orange-300' },
                { label: 'Entregues',      value: String(totalEntregues),        icon: CheckCircle2, color: 'bg-green-50  border-green-100  dark:bg-green-500/10  dark:border-green-500/20',  text: 'text-green-700 dark:text-green-300'  },
              ].map(({ label, value, icon: Icon, color, text }) => (
                <div key={label} className={cn('rounded-xl border p-4 flex items-center gap-3', color)}>
                  <Icon className={cn('w-6 h-6 flex-shrink-0', text)} />
                  <div>
                    <p className="text-[11px] text-gray-500 font-medium">{label}</p>
                    <p className={cn('text-[20px] font-bold', text)}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">De</span>
                <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
                  className="px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Até</span>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Status</span>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                  className="px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none">
                  <option value="todos">Todos</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {/* Atalhos de data */}
              <div className="flex gap-1 ml-auto">
                {[
                  { label: 'Hoje', fn: () => { setDataIni(hoje); setDataFim(hoje) } },
                  { label: '7 dias', fn: () => { const d = new Date(); d.setDate(d.getDate()-6); setDataIni(d.toISOString().slice(0,10)); setDataFim(hoje) } },
                  { label: 'Mês', fn: () => { const n = new Date(); setDataIni(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setDataFim(hoje) } },
                ].map(({ label, fn }) => (
                  <button key={label} onClick={fn} className="px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-orange-300 hover:text-orange-600 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de carregamentos agrupada por data */}
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-[13px]">Carregando...</span>
              </div>
            ) : carregamentos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <Truck className="w-10 h-10 opacity-20" />
                <p className="text-[13px]">Nenhum carregamento encontrado para este período.</p>
                <button onClick={() => { setEditando(null); setModalAberto(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-[13px] font-semibold rounded-xl hover:bg-orange-600 transition-colors">
                  <Plus className="w-4 h-4" /> Criar primeiro carregamento
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {datas.map(data => (
                  <div key={data}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                      <span className="text-[11px] text-gray-400">{porData[data].length} {porData[data].length === 1 ? 'carregamento' : 'carregamentos'}</span>
                    </div>
                    <div className="space-y-3">
                      {porData[data].map(car => (
                        <CardCarregamento
                          key={car.id}
                          car={car}
                          onEdit={() => { setEditando(car); setModalAberto(true) }}
                          onDelete={() => setConfirmDelete(car.id)}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {aba === 'frota' && (
          <AbaFrota veiculos={veiculos} motoristas={motoristas} onRefresh={carregar} />
        )}
      </div>

      {/* Modal de carregamento */}
      {modalAberto && (
        <ModalCarregamento
          onClose={() => { setModalAberto(false); setEditando(null) }}
          onSave={handleSalvarCarregamento}
          motoristas={motoristas}
          veiculos={veiculos}
          postoNomes={postoNomes}
          inicial={editando}
        />
      )}

      {/* Confirmar exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="font-bold text-[15px] text-gray-900 dark:text-gray-100 mb-1">Excluir carregamento?</h3>
            <p className="text-[13px] text-gray-500 mb-5">Todos os itens serão removidos permanentemente.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 text-[13px] border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2 text-[13px] bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
