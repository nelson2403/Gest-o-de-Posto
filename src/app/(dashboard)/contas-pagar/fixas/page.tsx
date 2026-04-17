'use client'

import { useEffect, useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import { can } from '@/lib/utils/permissions'
import { useAuthContext } from '@/contexts/AuthContext'
import type { Role } from '@/types/database.types'
import {
  Plus, Loader2, RefreshCw, Pencil, CheckCircle2, AlertTriangle,
  Clock, Zap, ChevronDown, ChevronUp, Wallet, Search,
  GitCompare, CircleCheck, CircleMinus, HelpCircle, MapPin,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS: Record<string, { label: string; color: string }> = {
  energia:       { label: 'Energia Elétrica',  color: 'bg-yellow-100 text-yellow-800' },
  agua:          { label: 'Água e Esgoto',      color: 'bg-blue-100 text-blue-800' },
  internet:      { label: 'Internet / Link',    color: 'bg-cyan-100 text-cyan-800' },
  aluguel:       { label: 'Aluguel',            color: 'bg-purple-100 text-purple-800' },
  telefone:      { label: 'Telefone',           color: 'bg-violet-100 text-violet-800' },
  gas:           { label: 'Gás',                color: 'bg-orange-100 text-orange-800' },
  seguro:        { label: 'Seguro',             color: 'bg-teal-100 text-teal-800' },
  contabilidade: { label: 'Contabilidade',      color: 'bg-indigo-100 text-indigo-800' },
  folha:         { label: 'Folha de Pagamento', color: 'bg-pink-100 text-pink-800' },
  manutencao:    { label: 'Manutenção',         color: 'bg-amber-100 text-amber-800' },
  outro:         { label: 'Outro',              color: 'bg-gray-100 text-gray-700' },
}

const STATUS_COMP: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  previsto:  { label: 'Previsto',  cls: 'bg-blue-100 text-blue-700 border-blue-200',    icon: Clock },
  pago:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  atraso:    { label: 'Atraso',    cls: 'bg-red-100 text-red-700 border-red-200',       icon: AlertTriangle },
  cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500 border-gray-200',    icon: Clock },
}

// Status no AutoSystem: foi lançado? foi pago?
const STATUS_AS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  encontrado:     { label: 'Lançado no AS',     cls: 'bg-blue-100 text-blue-700 border-blue-200',     icon: CircleCheck },
  encontrado_pago:{ label: 'Lançado e Pago AS', cls: 'bg-green-100 text-green-700 border-green-200',  icon: CircleCheck },
  divergente:     { label: 'Valor divergente',  cls: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle },
  nao_encontrado: { label: 'Não lançado no AS', cls: 'bg-red-100 text-red-700 border-red-200',         icon: CircleMinus },
}

const TOLERANCIA = 0.05

const EMPTY_FIXA = {
  posto_id: '', descricao: '', categoria: '',
  fornecedor_nome: '', valor_estimado: '', dia_vencimento: '',
}
const EMPTY_PAGO = {
  valor_pago: '', data_pagamento: new Date().toISOString().slice(0, 10),
  documento: '', obs: '',
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FixasPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined

  const hoje = new Date()
  const competenciaAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  const [postos, setPostos]               = useState<any[]>([])
  const [fixas, setFixas]                 = useState<any[]>([])
  const [competencias, setComps]          = useState<any[]>([])
  const [selectedPosto, setSelectedPosto] = useState('__all__')  // '__all__' = todos
  const [competencia, setCompetencia]     = useState(competenciaAtual)
  const [tab, setTab]                     = useState<'fixas' | 'mes'>('mes')
  const [loading, setLoading]             = useState(false)
  const [openFixa, setOpenFixa]           = useState(false)
  const [openPago, setOpenPago]           = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [formFixa, setFormFixa]           = useState(EMPTY_FIXA)
  const [formPago, setFormPago]           = useState(EMPTY_PAGO)
  const [editFixa, setEditFixa]           = useState<any | null>(null)
  const [replicarTodos, setReplicarTodos] = useState(false)
  const [gerarMesAuto, setGerarMesAuto]   = useState(true)

  const [filtroParceiro, setFiltroParceiro] = useState('')
  const [expanded, setExpanded]             = useState<Set<string>>(new Set())

  const [comparando, setComparando] = useState(false)
  const [modoComparar, setModoComparar] = useState(false)
  const [marcandoId, setMarcandoId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/postos').then(r => r.json()).then(d => setPostos(d.postos ?? []))
  }, [])

  const postoAtual = selectedPosto === '__all__' ? null : selectedPosto

  async function loadFixas() {
    const url = postoAtual
      ? `/api/contas-pagar/fixas?posto_id=${postoAtual}`
      : '/api/contas-pagar/fixas'
    const res  = await fetch(url)
    const json = await res.json()
    setFixas(json.fixas ?? [])
  }

  async function loadComps() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ competencia })
      if (postoAtual) params.set('posto_id', postoAtual)
      const res  = await fetch(`/api/contas-pagar/competencias?${params}`)
      const json = await res.json()
      setComps(json.competencias ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    loadFixas()
    loadComps()
    setTitulosASMap({})
    setModoComparar(false)
  }, [selectedPosto, competencia])

  // ── Comparar com AutoSystem (por posto) ──────────────────────────────────────
  const [titulosASMap, setTitulosASMap] = useState<Record<string, any[]>>({})  // postoId → titulos

  async function handleComparar() {
    setComparando(true)
    setModoComparar(false)
    try {
      const postosIds = postoAtual
        ? [postoAtual]
        : [...new Set(competencias.map((c: any) => c.posto_id))] as string[]

      const [ano, mes] = competencia.split('-')
      const ini = `${ano}-${mes}-01`
      const fim = new Date(Number(ano), Number(mes), 0).toISOString().slice(0, 10)

      const novoMap: Record<string, any[]> = {}
      const updates: Array<{ id: string; payload: any }> = []

      for (const pid of postosIds) {
        const params = new URLSearchParams({ posto_id: pid, vencto_ini: ini, vencto_fim: fim, situacao: 'todas' })
        const res  = await fetch(`/api/contas-pagar/titulos-as?${params}`)
        const json = await res.json()
        if (!res.ok) continue

        const titulos: any[] = json.titulos ?? []
        novoMap[pid] = titulos

        const compsPostо = competencias.filter((c: any) => c.posto_id === pid)
        const usados = new Set<number>()

        for (const c of compsPostо) {
          const val = Number(c.valor_previsto)
          const fornNome = (c.cp_contas_fixas?.cp_fornecedores?.nome ?? '').toLowerCase()

          const matchIdx = titulos.findIndex((t, i) => {
            if (usados.has(i)) return false
            const diff = Math.abs(t.valor - val)
            const pct  = val > 0 ? diff / val : diff
            if (pct > TOLERANCIA) return false
            if (fornNome.length > 2) {
              const nomeAS = (t.pessoa_nome ?? '').toLowerCase()
              return nomeAS.includes(fornNome) || fornNome.includes(nomeAS)
            }
            return true
          })

          let status_as: string
          let situacao_as: string | null = null
          let movto_mlid = null
          let valor_autosystem = null

          if (matchIdx === -1) {
            status_as = 'nao_encontrado'
          } else {
            usados.add(matchIdx)
            const match = titulos[matchIdx]
            movto_mlid      = match.mlid
            valor_autosystem = match.valor
            situacao_as     = match.situacao  // 'pago', 'a_vencer', 'em_atraso'
            const diff      = Math.abs(match.valor - val)
            if (diff > 0.01) status_as = 'divergente'
            else status_as = match.situacao === 'pago' ? 'encontrado_pago' : 'encontrado'
          }

          updates.push({ id: c.id, payload: { status_as, situacao_as, movto_mlid, valor_autosystem } })
        }
      }

      setTitulosASMap(novoMap)

      // Salva em batch
      await Promise.all(updates.map(({ id, payload }) =>
        fetch(`/api/contas-pagar/competencias/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      ))

      await loadComps()
      setModoComparar(true)

      const enc  = updates.filter(u => u.payload.status_as?.startsWith('encontrado')).length
      const nenc = updates.filter(u => u.payload.status_as === 'nao_encontrado').length
      const div  = updates.filter(u => u.payload.status_as === 'divergente').length
      toast({
        title: 'Comparação concluída',
        description: [
          enc > 0  ? `${enc} lançado(s) no AS` : '',
          div > 0  ? `${div} com valor divergente` : '',
          nenc > 0 ? `${nenc} não lançado(s)` : '',
        ].filter(Boolean).join(' · '),
        variant: nenc > 0 || div > 0 ? 'destructive' : 'default',
      })
    } finally {
      setComparando(false)
    }
  }

  // ── Marcar conferido ─────────────────────────────────────────────────────────
  async function handleConferido(id: string, conferido: boolean) {
    setMarcandoId(id)
    try {
      await fetch(`/api/contas-pagar/competencias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferido }),
      })
      setComps(prev => prev.map(c => c.id === id ? { ...c, conferido } : c))
    } finally {
      setMarcandoId(null)
    }
  }

  // ── Gerar mês (todos os postos se __all__) ───────────────────────────────────
  async function handleGerar() {
    if (!competencia) return
    setGenerating(true)
    try {
      if (postoAtual) {
        const res  = await fetch('/api/contas-pagar/competencias', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competencia, posto_id: postoAtual }),
        })
        const json = await res.json()
        if (!res.ok) return toast({ title: json.error, variant: 'destructive' })
        toast({ title: `${json.geradas} competência(s) geradas` })
      } else {
        // Gera para todos os postos
        let total = 0
        for (const p of postos) {
          const res  = await fetch('/api/contas-pagar/competencias', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competencia, posto_id: p.id }),
          })
          const json = await res.json()
          if (res.ok) total += json.geradas ?? 0
        }
        toast({ title: `${total} competência(s) geradas para todos os postos` })
      }
      loadComps()
    } finally { setGenerating(false) }
  }

  // ── Salvar conta fixa (com opção de replicar) ────────────────────────────────
  async function handleSaveFixa() {
    if (!formFixa.posto_id || !formFixa.descricao || !formFixa.categoria || !formFixa.valor_estimado || !formFixa.dia_vencimento)
      return toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' })
    setSaving(true)
    try {
      const postosAlvo: string[] = replicarTodos
        ? postos.map(p => p.id)
        : [formFixa.posto_id]

      let criadas = 0
      for (const pid of postosAlvo) {
        const url    = editFixa && !replicarTodos ? `/api/contas-pagar/fixas/${editFixa.id}` : '/api/contas-pagar/fixas'
        const method = editFixa && !replicarTodos ? 'PATCH' : 'POST'
        const res    = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formFixa, posto_id: pid }),
        })
        if (res.ok) criadas++
      }

      // Gera competência automaticamente se solicitado
      if (gerarMesAuto && !editFixa) {
        for (const pid of postosAlvo) {
          await fetch('/api/contas-pagar/competencias', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competencia, posto_id: pid }),
          })
        }
      }

      toast({ title: replicarTodos ? `Conta criada para ${criadas} postos!` : editFixa ? 'Conta atualizada!' : 'Conta criada!' })
      setOpenFixa(false); setEditFixa(null); setFormFixa(EMPTY_FIXA); setReplicarTodos(false)
      loadFixas(); loadComps()
    } finally { setSaving(false) }
  }

  async function handleMarcarPago(id: string) {
    if (!formPago.valor_pago) return toast({ title: 'Valor pago é obrigatório', variant: 'destructive' })
    setSaving(true)
    try {
      const res  = await fetch(`/api/contas-pagar/competencias/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pago', ...formPago }),
      })
      const json = await res.json()
      if (!res.ok) return toast({ title: json.error, variant: 'destructive' })
      toast({ title: 'Marcado como pago!' })
      setOpenPago(null); setFormPago(EMPTY_PAGO)
      loadComps()
    } finally { setSaving(false) }
  }

  // ── Filtros e agrupamentos ────────────────────────────────────────────────────
  const competenciasFiltradas = useMemo(() => {
    if (!filtroParceiro.trim()) return competencias
    const q = filtroParceiro.toLowerCase()
    return competencias.filter(c => {
      const forn = (c.cp_contas_fixas?.cp_fornecedores?.nome ?? '').toLowerCase()
      const desc = (c.cp_contas_fixas?.descricao ?? '').toLowerCase()
      return forn.includes(q) || desc.includes(q)
    })
  }, [competencias, filtroParceiro])

  // Agrupamento: posto → itens (para visão "todos os postos")
  const porPosto = useMemo(() => {
    if (selectedPosto !== '__all__') return null
    const map = new Map<string, { postoNome: string; items: any[] }>()
    for (const c of competenciasFiltradas) {
      const pid  = c.posto_id as string
      const nome = c.postos?.nome ?? 'Sem posto'
      if (!map.has(pid)) map.set(pid, { postoNome: nome, items: [] })
      map.get(pid)!.items.push(c)
    }
    return Array.from(map.entries())
      .map(([postoId, v]) => ({ postoId, ...v }))
      .sort((a, b) => a.postoNome.localeCompare(b.postoNome))
  }, [competenciasFiltradas, selectedPosto])

  // Agrupamento: categoria → itens (para visão posto único)
  const porCategoria = useMemo(() => {
    if (selectedPosto === '__all__') return []
    const map = new Map<string, any[]>()
    for (const c of competenciasFiltradas) {
      const cat = c.cp_contas_fixas?.categoria ?? 'outro'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(c)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [competenciasFiltradas, selectedPosto])

  const totalPrevisto = competenciasFiltradas.reduce((s, c) => s + Number(c.valor_previsto), 0)
  const totalPago     = competenciasFiltradas.filter(c => c.status === 'pago').reduce((s, c) => s + Number(c.valor_pago ?? c.valor_previsto), 0)
  const emAtraso      = competenciasFiltradas.filter(c => c.em_atraso).length
  const conferidos    = competenciasFiltradas.filter(c => c.conferido).length
  const naoLancados   = modoComparar ? competenciasFiltradas.filter(c => c.status_as === 'nao_encontrado').length : 0

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // ── Render de item de competência (reutilizado em ambos os modos) ─────────────
  function ItemComp({ c }: { c: any }) {
    const sCfg    = c.em_atraso ? STATUS_COMP.atraso : (STATUS_COMP[c.status] ?? STATUS_COMP.previsto)
    const asCfg   = c.status_as ? STATUS_AS_CFG[c.status_as] : null
    const isMarcando = marcandoId === c.id

    return (
      <div className={cn(
        'flex items-start justify-between px-4 py-3 gap-3 transition-colors',
        c.em_atraso && 'bg-red-50/40',
        c.conferido && 'bg-green-50/20',
      )}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {c.conferido && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
            <p className="text-[13px] font-medium text-gray-700 truncate">
              {c.cp_contas_fixas?.descricao ?? '—'}
            </p>
            {c.cp_contas_fixas?.categoria && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium hidden sm:inline-flex',
                CATEGORIAS[c.cp_contas_fixas.categoria]?.color ?? 'bg-gray-100 text-gray-600')}>
                {CATEGORIAS[c.cp_contas_fixas.categoria]?.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <p className="text-[11px] text-gray-400">
              Vence: {fmtDate(c.data_vencimento)}
            </p>
            {c.cp_contas_fixas?.cp_fornecedores?.nome && (
              <span className="text-[11px] text-gray-500 font-medium">
                {c.cp_contas_fixas.cp_fornecedores.nome}
              </span>
            )}
          </div>
          {/* Resultado da comparação AS */}
          {modoComparar && c.status_as && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {asCfg && (
                <Badge variant="outline" className={cn('text-[10px] h-5', asCfg.cls)}>
                  <asCfg.icon className="w-2.5 h-2.5 mr-1" />
                  {asCfg.label}
                </Badge>
              )}
              {c.valor_autosystem != null && c.status_as !== 'nao_encontrado' && (
                <span className="text-[11px] text-gray-500">
                  AS: {fmtBRL(Number(c.valor_autosystem))}
                  {c.status_as === 'divergente' && (
                    <span className="text-orange-600 font-semibold ml-1">
                      (dif: {fmtBRL(Math.abs(Number(c.valor_autosystem) - Number(c.valor_previsto)))})
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          <div className="text-right mr-1">
            <p className="text-[13px] font-semibold text-gray-700">{fmtBRL(Number(c.valor_previsto))}</p>
            {c.status === 'pago' && c.valor_pago && (
              <p className="text-[11px] text-emerald-600">Pago: {fmtBRL(Number(c.valor_pago))}</p>
            )}
          </div>

          <Badge variant="outline" className={cn('text-[11px]', sCfg.cls)}>
            <sCfg.icon className="w-3 h-3 mr-1" />
            {c.em_atraso ? 'Atraso' : sCfg.label}
          </Badge>

          {c.status !== 'pago' && can(role ?? null, 'contas_pagar.marcar_pago') && (
            <Button size="sm" variant="outline"
              className="h-7 text-[11px] gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => { setOpenPago(c.id); setFormPago({ ...EMPTY_PAGO, valor_pago: String(c.valor_previsto) }) }}>
              <CheckCircle2 className="w-3 h-3" /> Pagar
            </Button>
          )}

          <Button size="sm" variant="outline" disabled={isMarcando}
            className={cn('h-7 text-[11px] gap-1',
              c.conferido
                ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-50'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50')}
            onClick={() => handleConferido(c.id, !c.conferido)}>
            {isMarcando
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : c.conferido
                ? <><CheckCircle2 className="w-3 h-3" /> OK</>
                : <><HelpCircle className="w-3 h-3" /> Conferir</>}
          </Button>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <Header title="Despesas Fixas" subtitle="Controle mensal por posto" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Filtros topo */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-[12px] text-gray-500 mb-1 block">Posto</Label>
              <Select value={selectedPosto} onValueChange={setSelectedPosto}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os postos</SelectItem>
                  {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {tab === 'mes' && (
              <>
                <div>
                  <Label className="text-[12px] text-gray-500 mb-1 block">Competência</Label>
                  <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="h-9 text-[13px] w-36" />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <Label className="text-[12px] text-gray-500 mb-1 block">Filtrar fornecedor / descrição</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input value={filtroParceiro} onChange={e => setFiltroParceiro(e.target.value)}
                      placeholder="Ex: COPEL, Aluguel..." className="h-9 text-[13px] pl-8" />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant={tab === 'mes' ? 'default' : 'outline'}
                onClick={() => setTab('mes')} className="h-9 text-[12px]">Mês atual</Button>
              <Button size="sm" variant={tab === 'fixas' ? 'default' : 'outline'}
                onClick={() => setTab('fixas')} className="h-9 text-[12px]">Cadastro</Button>
            </div>
          </div>
        </div>

        {tab === 'mes' ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Previsto', value: fmtBRL(totalPrevisto), color: 'text-blue-700' },
                { label: 'Pago', value: fmtBRL(totalPago), color: 'text-emerald-600' },
                { label: 'Em atraso', value: String(emAtraso), color: emAtraso > 0 ? 'text-red-600' : 'text-gray-400', bg: emAtraso > 0 ? 'bg-red-50 border-red-200' : '' },
                { label: `Conferidos (${competenciasFiltradas.length})`, value: `${conferidos}/${competenciasFiltradas.length}`, color: conferidos > 0 ? 'text-green-600' : 'text-gray-400', bg: conferidos === competenciasFiltradas.length && competenciasFiltradas.length > 0 ? 'bg-green-50 border-green-200' : '' },
              ].map(k => (
                <div key={k.label} className={cn('rounded-xl border shadow-sm p-3 text-center bg-white border-gray-100', k.bg)}>
                  <p className={cn('text-xl font-bold', k.color)}>{k.value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* KPI de não lançados (só após comparar) */}
            {modoComparar && naoLancados > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="text-[13px] text-red-700 font-medium">
                  {naoLancados} despesa(s) ainda não lançada(s) no AutoSystem neste período
                </span>
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[12px] text-gray-500">
                {competenciasFiltradas.length} conta(s)
                {selectedPosto === '__all__' && ` em ${new Set(competenciasFiltradas.map((c: any) => c.posto_id)).size} posto(s)`}
                {filtroParceiro && ' (filtrado)'}
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => { loadFixas(); loadComps() }} disabled={loading}
                  className="h-8 gap-1.5 text-[12px]">
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                </Button>
                {can(role ?? null, 'contas_pagar.gerar_mes') && (
                  <Button size="sm" variant="outline" onClick={handleGerar} disabled={generating}
                    className="h-8 gap-1.5 text-[12px]">
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
                    Gerar mês{selectedPosto === '__all__' ? ' (todos)' : ''}
                  </Button>
                )}
                {competencias.length > 0 && (
                  <Button size="sm" onClick={handleComparar} disabled={comparando}
                    className={cn('h-8 gap-1.5 text-[12px]', modoComparar ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600')}>
                    {comparando
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparando...</>
                      : <><GitCompare className="w-3.5 h-3.5" /> {modoComparar ? 'Recomparar' : 'Comparar com AutoSystem'}</>}
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : competenciasFiltradas.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-[13px]">{competencias.length === 0 ? 'Nenhuma competência gerada.' : 'Nenhum resultado para o filtro.'}</p>
                {competencias.length === 0 && <p className="text-[11px] mt-1">Clique em "Gerar mês" para criar as competências.</p>}
              </div>
            ) : selectedPosto === '__all__' ? (
              /* ── Vista todos os postos: accordion por posto ── */
              <div className="space-y-3">
                {porPosto!.map(grupo => {
                  const isOpen     = expanded.has(grupo.postoId)
                  const atrasados  = grupo.items.filter((c: any) => c.em_atraso).length
                  const pagos      = grupo.items.filter((c: any) => c.status === 'pago').length
                  const confGrupo  = grupo.items.filter((c: any) => c.conferido).length
                  const naoLanc    = modoComparar ? grupo.items.filter((c: any) => c.status_as === 'nao_encontrado').length : 0
                  const subtotal   = grupo.items.reduce((s: number, c: any) => s + Number(c.valor_previsto), 0)

                  return (
                    <div key={grupo.postoId} className={cn(
                      'bg-white rounded-xl border overflow-hidden shadow-sm',
                      atrasados > 0 ? 'border-red-200' : 'border-gray-100',
                    )}>
                      <button
                        onClick={() => toggleExpand(grupo.postoId)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-3.5 h-3.5 text-orange-600" />
                          </div>
                          <span className="font-semibold text-[13px] text-gray-800">{grupo.postoNome}</span>
                          <span className="text-[11px] text-gray-400">{grupo.items.length} conta(s)</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className="text-[12px] font-semibold text-gray-600">{fmtBRL(subtotal)}</span>
                          {atrasados > 0 && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              {atrasados} atrasada(s)
                            </span>
                          )}
                          {pagos > 0 && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              {pagos} pago(s)
                            </span>
                          )}
                          {naoLanc > 0 && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                              {naoLanc} não lançado(s)
                            </span>
                          )}
                          {confGrupo > 0 && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              {confGrupo}/{grupo.items.length} conferido(s)
                            </span>
                          )}
                          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {grupo.items.map((c: any) => <ItemComp key={c.id} c={c} />)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* ── Vista posto único: accordion por categoria ── */
              <div className="space-y-3">
                {porCategoria.map(([cat, items]) => {
                  const cfg       = CATEGORIAS[cat] ?? CATEGORIAS.outro
                  const isOpen    = expanded.has(cat)
                  const subtotal  = items.reduce((s, c) => s + Number(c.valor_previsto), 0)
                  const pagosCat  = items.filter(c => c.status === 'pago').length
                  const atrasoCat = items.filter(c => c.em_atraso).length
                  const confCat   = items.filter(c => c.conferido).length

                  return (
                    <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <button
                        onClick={() => toggleExpand(cat)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full', cfg.color)}>
                            {cfg.label}
                          </span>
                          <span className="text-[12px] text-gray-500">{items.length} conta(s)</span>
                          {atrasoCat > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                              <AlertTriangle className="w-3 h-3" /> {atrasoCat} em atraso
                            </span>
                          )}
                          {confCat > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> {confCat} conferido(s)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[12px] font-semibold text-gray-700">{fmtBRL(subtotal)}</p>
                            <p className="text-[10px] text-gray-400">{pagosCat}/{items.length} pago(s)</p>
                          </div>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {items.map((c: any) => <ItemComp key={c.id} c={c} />)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          /* ── Tab Cadastro ── */
          <>
            <div className="flex justify-end">
              {can(role ?? null, 'contas_pagar.fixas.edit') && (
                <Button size="sm"
                  onClick={() => {
                    setEditFixa(null)
                    setFormFixa({ ...EMPTY_FIXA, posto_id: postoAtual ?? postos[0]?.id ?? '' })
                    setReplicarTodos(false)
                    setGerarMesAuto(true)
                    setOpenFixa(true)
                  }}
                  className="h-9 bg-orange-500 hover:bg-orange-600 gap-1.5 text-[13px]">
                  <Plus className="w-3.5 h-3.5" /> Nova Conta Fixa
                </Button>
              )}
            </div>

            {fixas.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-[13px]">Nenhuma conta fixa cadastrada</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {selectedPosto === '__all__' && (
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Posto</th>
                      )}
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Descrição</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Categoria</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Fornecedor</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Valor Est.</th>
                      <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Dia Vcto</th>
                      <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ativo</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {fixas.map((f: any) => {
                      const catCfg = CATEGORIAS[f.categoria] ?? CATEGORIAS.outro
                      return (
                        <tr key={f.id} className={cn('hover:bg-gray-50/50', !f.ativo && 'opacity-50')}>
                          {selectedPosto === '__all__' && (
                            <td className="px-4 py-2.5 text-gray-500 text-[12px]">{f.postos?.nome ?? '—'}</td>
                          )}
                          <td className="px-4 py-2.5 font-medium text-gray-700">{f.descricao}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', catCfg.color)}>{catCfg.label}</span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{f.cp_fornecedores?.nome || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-700">{fmtBRL(Number(f.valor_estimado))}</td>
                          <td className="px-4 py-2.5 text-center text-gray-600">Dia {f.dia_vencimento}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium',
                              f.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                              {f.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {can(role ?? null, 'contas_pagar.fixas.edit') && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-600"
                                onClick={() => {
                                  setEditFixa(f)
                                  setFormFixa({
                                    posto_id: f.posto_id, descricao: f.descricao,
                                    categoria: f.categoria, fornecedor_nome: f.cp_fornecedores?.nome ?? '',
                                    valor_estimado: String(f.valor_estimado), dia_vencimento: String(f.dia_vencimento),
                                  })
                                  setReplicarTodos(false)
                                  setOpenFixa(true)
                                }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal nova/editar conta fixa ── */}
      <Dialog open={openFixa} onOpenChange={open => { if (!saving) setOpenFixa(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editFixa ? 'Editar Conta Fixa' : 'Nova Conta Fixa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Posto *</Label>
              <Select value={formFixa.posto_id} onValueChange={v => setFormFixa(p => ({ ...p, posto_id: v }))}
                disabled={replicarTodos || !!editFixa}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Descrição *</Label>
              <Input value={formFixa.descricao} onChange={e => setFormFixa(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Energia Elétrica" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Categoria *</Label>
              <Select value={formFixa.categoria} onValueChange={v => setFormFixa(p => ({ ...p, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIAS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Fornecedor</Label>
              <Input value={formFixa.fornecedor_nome} onChange={e => setFormFixa(p => ({ ...p, fornecedor_nome: e.target.value }))} placeholder="Nome do fornecedor" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Valor estimado (R$) *</Label>
                <Input type="number" step="0.01" value={formFixa.valor_estimado}
                  onChange={e => setFormFixa(p => ({ ...p, valor_estimado: e.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Dia de vencimento *</Label>
                <Input type="number" min="1" max="31" value={formFixa.dia_vencimento}
                  onChange={e => setFormFixa(p => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 10" />
              </div>
            </div>

            {/* Opções extras — só na criação */}
            {!editFixa && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={replicarTodos}
                    onChange={e => setReplicarTodos(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <div>
                    <p className="text-[12px] font-medium text-gray-700">Replicar para todos os postos</p>
                    <p className="text-[11px] text-gray-400">Cria esta conta fixa para todos os {postos.length} postos cadastrados</p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={gerarMesAuto}
                    onChange={e => setGerarMesAuto(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <div>
                    <p className="text-[12px] font-medium text-gray-700">Gerar competência de {competencia} automaticamente</p>
                    <p className="text-[11px] text-gray-400">Cria o lançamento já para o mês atual</p>
                  </div>
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenFixa(false); setEditFixa(null); setReplicarTodos(false) }} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFixa} disabled={saving} className="bg-orange-500 hover:bg-orange-600 min-w-[80px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editFixa ? 'Salvar' : replicarTodos ? `Criar para ${postos.length} postos` : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal marcar pago ── */}
      <Dialog open={!!openPago} onOpenChange={open => { if (!saving && !open) setOpenPago(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Marcar como Pago
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Valor pago (R$) *</Label>
                <Input type="number" step="0.01" value={formPago.valor_pago}
                  onChange={e => setFormPago(p => ({ ...p, valor_pago: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Data do pagamento</Label>
                <Input type="date" value={formPago.data_pagamento}
                  onChange={e => setFormPago(p => ({ ...p, data_pagamento: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Nº Documento</Label>
              <Input value={formPago.documento} onChange={e => setFormPago(p => ({ ...p, documento: e.target.value }))}
                placeholder="NF, boleto, comprovante..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Observação</Label>
              <Input value={formPago.obs} onChange={e => setFormPago(p => ({ ...p, obs: e.target.value }))}
                placeholder="Opcional..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPago(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => openPago && handleMarcarPago(openPago)} disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 min-w-[80px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
