'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import {
  Plus, Pencil, Trash2, Archive, Loader2, ArrowDownToLine,
  ArrowUpFromLine, ArrowLeftRight, AlertTriangle, Package,
  RefreshCw, ChevronDown,
} from 'lucide-react'
import type { UcProduto, UcMovimento, UcMovimentoTipo, Posto, Role } from '@/types/database.types'

// ─── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIAS = ['Limpeza', 'Material de Escritório', 'Ferramentas', 'EPI', 'Manutenção', 'Higiene', 'Outros']
const UNIDADES   = ['un', 'cx', 'pct', 'kg', 'g', 'L', 'mL', 'm', 'rolo', 'par']

const TIPO_CONFIG: Record<UcMovimentoTipo, { label: string; color: string; icon: React.ElementType }> = {
  entrada:      { label: 'Entrada',      color: 'bg-emerald-100 text-emerald-700', icon: ArrowDownToLine },
  transferencia:{ label: 'Transferência', color: 'bg-blue-100 text-blue-700',      icon: ArrowLeftRight },
  saida:        { label: 'Saída',         color: 'bg-red-100 text-red-700',         icon: ArrowUpFromLine },
}

function fmt(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtQtd(v: number, un: string) {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${un}`
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

const EMPTY_PRODUTO = { nome: '', categoria: '', unidade: 'un', preco_unitario: '', estoque_minimo: '0', ativo: true }
const EMPTY_MOVIMENTO = { tipo: 'entrada' as UcMovimentoTipo, produto_id: '', quantidade: '', valor_unitario: '', posto_id: '', observacoes: '', data: new Date().toISOString().slice(0, 10) }

// ─── Tipo de aba ───────────────────────────────────────────────────────────────
type Tab = 'saldo' | 'movimentacoes' | 'produtos'

// ─── Componente principal ──────────────────────────────────────────────────────
export default function UsoConsumoPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const canLancar   = can(role ?? null, 'uso_consumo.lancar')
  const canProdutos = can(role ?? null, 'uso_consumo.produtos')

  const [tab, setTab] = useState<Tab>('saldo')

  const [produtos,    setProdutos]    = useState<UcProduto[]>([])
  const [movimentos,  setMovimentos]  = useState<UcMovimento[]>([])
  const [postos,      setPostos]      = useState<Posto[]>([])
  const [loading,     setLoading]     = useState(true)

  // Produto form
  const [openProduto,   setOpenProduto]   = useState(false)
  const [openDelProd,   setOpenDelProd]   = useState(false)
  const [selProduto,    setSelProduto]    = useState<UcProduto | null>(null)
  const [formProduto,   setFormProduto]   = useState(EMPTY_PRODUTO)
  const [savingProd,    setSavingProd]    = useState(false)
  const [deletingProd,  setDeletingProd]  = useState(false)

  // Movimento form
  const [openMov,      setOpenMov]      = useState(false)
  const [openDelMov,   setOpenDelMov]   = useState(false)
  const [selMov,       setSelMov]       = useState<UcMovimento | null>(null)
  const [formMov,      setFormMov]      = useState(EMPTY_MOVIMENTO)
  const [savingMov,    setSavingMov]    = useState(false)
  const [deletingMov,  setDeletingMov]  = useState(false)

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroPosto,     setFiltroPosto]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('uc_produtos').select('*').order('nome'),
      supabase.from('uc_movimentos')
        .select('*, produto:uc_produtos(id, nome, unidade, categoria), posto:postos(id, nome), usuario:usuarios(nome)')
        .order('data', { ascending: false })
        .order('criado_em', { ascending: false })
        .limit(500),
    ])
    if (p) setProdutos(p as UcProduto[])
    if (m) setMovimentos(m as UcMovimento[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    supabase.from('postos').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setPostos(data as Posto[]) })
  }, [load])

  // ── Cálculo de saldo por produto ─────────────────────────────────────────────
  const saldos = useMemo(() => {
    const map: Record<string, { entrada: number; saida: number; transferido: number; valorTotal: number }> = {}
    for (const m of movimentos) {
      if (!map[m.produto_id]) map[m.produto_id] = { entrada: 0, saida: 0, transferido: 0, valorTotal: 0 }
      const s = map[m.produto_id]
      if (m.tipo === 'entrada')       { s.entrada     += m.quantidade; s.valorTotal += m.quantidade * (m.valor_unitario ?? 0) }
      if (m.tipo === 'transferencia') { s.transferido += m.quantidade }
      if (m.tipo === 'saida')         { s.saida       += m.quantidade }
    }
    return map
  }, [movimentos])

  // ── Handlers: Produto ─────────────────────────────────────────────────────────
  function openCriarProduto() {
    setSelProduto(null)
    setFormProduto(EMPTY_PRODUTO)
    setOpenProduto(true)
  }
  function openEditarProduto(p: UcProduto) {
    setSelProduto(p)
    setFormProduto({
      nome:           p.nome,
      categoria:      p.categoria ?? '',
      unidade:        p.unidade,
      preco_unitario: p.preco_unitario?.toString() ?? '',
      estoque_minimo: p.estoque_minimo.toString(),
      ativo:          p.ativo,
    })
    setOpenProduto(true)
  }
  async function salvarProduto() {
    if (!formProduto.nome.trim()) { toast({ variant: 'destructive', title: 'Nome obrigatório' }); return }
    setSavingProd(true)
    const payload = {
      nome:           formProduto.nome.trim(),
      categoria:      formProduto.categoria || null,
      unidade:        formProduto.unidade,
      preco_unitario: formProduto.preco_unitario ? Number(formProduto.preco_unitario) : null,
      estoque_minimo: Number(formProduto.estoque_minimo) || 0,
      ativo:          formProduto.ativo,
      empresa_id:     usuario?.empresa_id,
    }
    const { error } = selProduto
      ? await supabase.from('uc_produtos').update(payload).eq('id', selProduto.id)
      : await supabase.from('uc_produtos').insert(payload)
    if (error) toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
    else { toast({ title: selProduto ? 'Produto atualizado!' : 'Produto criado!' }); setOpenProduto(false); load() }
    setSavingProd(false)
  }
  async function excluirProduto() {
    if (!selProduto) return
    setDeletingProd(true)
    const { error } = await supabase.from('uc_produtos').delete().eq('id', selProduto.id)
    if (error) toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    else { toast({ title: 'Produto excluído!' }); setOpenDelProd(false); load() }
    setDeletingProd(false)
  }

  // ── Handlers: Movimento ───────────────────────────────────────────────────────
  function openNovoMov(tipo?: UcMovimentoTipo) {
    setFormMov({ ...EMPTY_MOVIMENTO, tipo: tipo ?? 'entrada', data: new Date().toISOString().slice(0, 10) })
    setOpenMov(true)
  }
  async function salvarMovimento() {
    if (!formMov.produto_id) { toast({ variant: 'destructive', title: 'Selecione o produto' }); return }
    if (!formMov.quantidade || Number(formMov.quantidade) <= 0) { toast({ variant: 'destructive', title: 'Quantidade inválida' }); return }
    if (formMov.tipo === 'transferencia' && !formMov.posto_id) { toast({ variant: 'destructive', title: 'Selecione o posto de destino' }); return }
    setSavingMov(true)
    const { error } = await supabase.from('uc_movimentos').insert({
      produto_id:    formMov.produto_id,
      tipo:          formMov.tipo,
      quantidade:    Number(formMov.quantidade),
      valor_unitario: formMov.valor_unitario ? Number(formMov.valor_unitario) : null,
      posto_id:      formMov.tipo === 'transferencia' ? formMov.posto_id || null : null,
      observacoes:   formMov.observacoes.trim() || null,
      usuario_id:    usuario?.id,
      data:          formMov.data,
      empresa_id:    usuario?.empresa_id,
    })
    if (error) toast({ variant: 'destructive', title: 'Erro ao registrar', description: error.message })
    else { toast({ title: 'Movimento registrado!' }); setOpenMov(false); load() }
    setSavingMov(false)
  }
  async function excluirMovimento() {
    if (!selMov) return
    setDeletingMov(true)
    const { error } = await supabase.from('uc_movimentos').delete().eq('id', selMov.id)
    if (error) toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
    else { toast({ title: 'Movimento excluído!' }); setOpenDelMov(false); load() }
    setDeletingMov(false)
  }

  // ── Dados filtrados ───────────────────────────────────────────────────────────
  const produtosFiltrados = useMemo(() =>
    produtos.filter(p => !filtroCategoria || p.categoria === filtroCategoria)
  , [produtos, filtroCategoria])

  const movFiltrados = useMemo(() =>
    movimentos.filter(m =>
      (!filtroPosto || m.posto_id === filtroPosto || (filtroPosto === '__sem__' && !m.posto_id))
    )
  , [movimentos, filtroPosto])

  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort() as string[]

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <Header
        title="Uso e Consumo"
        description="Estoque de materiais internos — entradas, transferências e saldos"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9 text-[13px] gap-1.5" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            {canLancar && (
              <Button onClick={() => openNovoMov()} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Novo Lançamento
              </Button>
            )}
          </div>
        }
      />

      <div className="p-3 md:p-6 space-y-4">

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { key: 'saldo',         label: 'Saldo Atual' },
            { key: 'movimentacoes', label: 'Movimentações' },
            { key: 'produtos',      label: 'Produtos' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Aba: Saldo ──────────────────────────────────────────────────── */}
        {tab === 'saldo' && (
          <div className="space-y-4">
            {/* Filtro categoria */}
            <div className="flex items-center gap-2">
              <select
                value={filtroCategoria}
                onChange={e => setFiltroCategoria(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30"
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : produtosFiltrados.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-[14px] font-semibold text-gray-700">Nenhum produto cadastrado</p>
                {canProdutos && (
                  <button onClick={() => setTab('produtos')} className="mt-2 text-[12px] text-orange-500 hover:underline">
                    Cadastrar produto →
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {produtosFiltrados.map(p => {
                  const s = saldos[p.id] ?? { entrada: 0, saida: 0, transferido: 0, valorTotal: 0 }
                  const saldo = s.entrada - s.transferido - s.saida
                  const abaixoMin = saldo <= p.estoque_minimo && p.estoque_minimo > 0
                  const precoUnit = p.preco_unitario
                  return (
                    <div
                      key={p.id}
                      className={`bg-white border rounded-xl p-4 shadow-sm ${abaixoMin ? 'border-orange-300' : 'border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-[13px] font-semibold text-gray-900 leading-tight">{p.nome}</p>
                          {p.categoria && (
                            <span className="text-[10px] text-gray-400 uppercase tracking-wide">{p.categoria}</span>
                          )}
                        </div>
                        {abaixoMin && (
                          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-gray-500">Saldo matriz</span>
                          <span className={`text-[15px] font-bold tabular-nums ${saldo < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {fmtQtd(Math.max(saldo, 0), p.unidade)}
                          </span>
                        </div>
                        {p.estoque_minimo > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-gray-400">Mín. {fmtQtd(p.estoque_minimo, p.unidade)}</span>
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${abaixoMin ? 'bg-orange-400' : 'bg-emerald-400'}`}
                                style={{ width: `${Math.min((saldo / p.estoque_minimo) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="pt-1 border-t border-gray-100 grid grid-cols-3 gap-1 text-[10px] text-gray-400">
                          <div className="text-center">
                            <p className="font-medium text-emerald-600 text-[12px]">{s.entrada.toLocaleString('pt-BR')}</p>
                            <p>Entradas</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-blue-600 text-[12px]">{s.transferido.toLocaleString('pt-BR')}</p>
                            <p>Enviados</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-red-500 text-[12px]">{s.saida.toLocaleString('pt-BR')}</p>
                            <p>Saídas</p>
                          </div>
                        </div>
                        {precoUnit && saldo > 0 && (
                          <p className="text-[11px] text-gray-400 text-right">
                            ≈ {fmt(saldo * precoUnit)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Aba: Movimentações ───────────────────────────────────────────── */}
        {tab === 'movimentacoes' && (
          <div className="space-y-3">
            {/* Filtros + ações rápidas */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                value={filtroPosto}
                onChange={e => setFiltroPosto(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-700 shadow-sm focus:outline-none"
              >
                <option value="">Todos os postos / Matriz</option>
                {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                <option value="__sem__">Apenas Matriz</option>
              </select>

              {canLancar && (
                <div className="flex gap-1.5">
                  {(['entrada', 'transferencia', 'saida'] as UcMovimentoTipo[]).map(t => {
                    const cfg = TIPO_CONFIG[t]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={t}
                        onClick={() => openNovoMov(t)}
                        className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium border transition-colors ${cfg.color} border-transparent hover:opacity-80`}
                      >
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : movFiltrados.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
                <Archive className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-[13px] text-gray-500">Nenhuma movimentação registrada</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] md:text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Data</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Tipo</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Produto</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Qtd</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Posto</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Observações</th>
                        <th className="w-10 py-2.5 px-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {movFiltrados.map(m => {
                        const cfg = TIPO_CONFIG[m.tipo]
                        const Icon = cfg.icon
                        return (
                          <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="py-2 px-4 text-gray-500 whitespace-nowrap">{fmtDate(m.data)}</td>
                            <td className="py-2 px-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color}`}>
                                <Icon className="w-2.5 h-2.5" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="py-2 px-4 font-medium text-gray-800">{m.produto?.nome ?? '—'}</td>
                            <td className="py-2 px-4 text-right tabular-nums text-gray-800 whitespace-nowrap">
                              {fmtQtd(m.quantidade, m.produto?.unidade ?? '')}
                            </td>
                            <td className="py-2 px-4 text-gray-500">{m.posto?.nome ?? '—'}</td>
                            <td className="py-2 px-4 text-gray-400 max-w-[200px] truncate">{m.observacoes ?? '—'}</td>
                            <td className="py-2 px-4">
                              {canLancar && (
                                <button
                                  onClick={() => { setSelMov(m); setOpenDelMov(true) }}
                                  className="text-gray-300 hover:text-red-500 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Aba: Produtos ────────────────────────────────────────────────── */}
        {tab === 'produtos' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              {canProdutos && (
                <Button onClick={openCriarProduto} className="h-9 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Novo Produto
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando...
              </div>
            ) : produtos.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-[13px] text-gray-500">Nenhum produto cadastrado</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] md:text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Produto</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Categoria</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Unid.</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Preço Unit.</th>
                        <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Estoque Mín.</th>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-[10px] uppercase tracking-wide">Status</th>
                        <th className="w-16 py-2.5 px-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {produtos.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-2 px-4 font-medium text-gray-800">{p.nome}</td>
                          <td className="py-2 px-4 text-gray-500">{p.categoria ?? '—'}</td>
                          <td className="py-2 px-4 text-gray-500">{p.unidade}</td>
                          <td className="py-2 px-4 text-right tabular-nums text-gray-700">{fmt(p.preco_unitario)}</td>
                          <td className="py-2 px-4 text-right tabular-nums text-gray-500">
                            {p.estoque_minimo > 0 ? fmtQtd(p.estoque_minimo, p.unidade) : '—'}
                          </td>
                          <td className="py-2 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {p.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            {canProdutos && (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => openEditarProduto(p)}
                                  className="text-gray-300 hover:text-blue-500 transition-colors"
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setSelProduto(p); setOpenDelProd(true) }}
                                  className="text-gray-300 hover:text-red-500 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialog: Produto ──────────────────────────────────────────────────── */}
      <Dialog open={openProduto} onOpenChange={o => { if (!savingProd) setOpenProduto(o) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selProduto ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nome *</Label>
              <Input value={formProduto.nome} onChange={e => setFormProduto(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Sabão em Pó" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Categoria</Label>
                <Select value={formProduto.categoria} onValueChange={v => setFormProduto(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Unidade *</Label>
                <Select value={formProduto.unidade} onValueChange={v => setFormProduto(p => ({ ...p, unidade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Preço unitário (R$)</Label>
                <Input type="number" min="0" step="0.01" value={formProduto.preco_unitario} onChange={e => setFormProduto(p => ({ ...p, preco_unitario: e.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Estoque mínimo</Label>
                <Input type="number" min="0" step="0.001" value={formProduto.estoque_minimo} onChange={e => setFormProduto(p => ({ ...p, estoque_minimo: e.target.value }))} placeholder="0" />
              </div>
            </div>
            {selProduto && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ativo_prod" checked={formProduto.ativo} onChange={e => setFormProduto(p => ({ ...p, ativo: e.target.checked }))} className="w-4 h-4 accent-orange-500" />
                <Label htmlFor="ativo_prod" className="text-[12px] text-gray-600">Produto ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenProduto(false)} disabled={savingProd}>Cancelar</Button>
            <Button onClick={salvarProduto} disabled={savingProd} className="bg-orange-500 hover:bg-orange-600 min-w-[90px]">
              {savingProd ? <Loader2 className="w-4 h-4 animate-spin" /> : selProduto ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Movimento ────────────────────────────────────────────────── */}
      <Dialog open={openMov} onOpenChange={o => { if (!savingMov) setOpenMov(o) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {formMov.tipo === 'entrada' && <ArrowDownToLine className="w-4 h-4 text-emerald-500" />}
              {formMov.tipo === 'transferencia' && <ArrowLeftRight className="w-4 h-4 text-blue-500" />}
              {formMov.tipo === 'saida' && <ArrowUpFromLine className="w-4 h-4 text-red-500" />}
              {TIPO_CONFIG[formMov.tipo].label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Tipo */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {(['entrada', 'transferencia', 'saida'] as UcMovimentoTipo[]).map(t => {
                const cfg = TIPO_CONFIG[t]
                return (
                  <button
                    key={t}
                    onClick={() => setFormMov(f => ({ ...f, tipo: t }))}
                    className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-all ${
                      formMov.tipo === t ? cfg.color + ' shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Produto *</Label>
              <Select value={formMov.produto_id} onValueChange={v => setFormMov(f => ({ ...f, produto_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {produtos.filter(p => p.ativo).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} ({p.unidade})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Quantidade *</Label>
                <Input
                  type="number" min="0.001" step="0.001"
                  value={formMov.quantidade}
                  onChange={e => setFormMov(f => ({ ...f, quantidade: e.target.value }))}
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Valor unit. (R$)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={formMov.valor_unitario}
                  onChange={e => setFormMov(f => ({ ...f, valor_unitario: e.target.value }))}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            </div>

            {formMov.tipo === 'transferencia' && (
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Posto de destino *</Label>
                <Select value={formMov.posto_id} onValueChange={v => setFormMov(f => ({ ...f, posto_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                  <SelectContent>
                    {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Data</Label>
              <Input type="date" value={formMov.data} onChange={e => setFormMov(f => ({ ...f, data: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observações</Label>
              <Textarea
                value={formMov.observacoes}
                onChange={e => setFormMov(f => ({ ...f, observacoes: e.target.value }))}
                placeholder="Nota fiscal, fornecedor, motivo..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMov(false)} disabled={savingMov}>Cancelar</Button>
            <Button onClick={salvarMovimento} disabled={savingMov} className="bg-orange-500 hover:bg-orange-600 min-w-[100px]">
              {savingMov ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelProd}
        onOpenChange={o => { if (!deletingProd) setOpenDelProd(o) }}
        title="Excluir produto"
        description={`Excluir "${selProduto?.nome}"? Esta ação não pode ser desfeita.`}
        onConfirm={excluirProduto}
        loading={deletingProd}
      />

      <ConfirmDialog
        open={openDelMov}
        onOpenChange={o => { if (!deletingMov) setOpenDelMov(o) }}
        title="Excluir movimentação"
        description="Excluir este lançamento? O saldo será recalculado automaticamente."
        onConfirm={excluirMovimento}
        loading={deletingMov}
      />
    </div>
  )
}
