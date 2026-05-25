'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  ArrowLeft, Save, Plus, Loader2, ClipboardList,
  Trash2, Pencil, AlertCircle, CheckCircle2,
  DollarSign, Hash, Layers, Package, FolderTree, Boxes, GitBranch, TrendingUp,
} from 'lucide-react'
import type { EsquemaStatus } from '@/app/api/comissionamento/esquemas/route'
import type { RegraStatus, ResultadoTipo, ResultadoModo } from '@/app/api/comissionamento/esquemas/[id]/regras/route'
import {
  type ConditionGroup, emptyRootGroup, parseCondicoes, summarizeGroup,
  hasIncomplete, isGroupEmpty,
} from '../../_lib/conditions'
import { ConditionBuilder } from '../../_components/ConditionBuilder'

interface Esquema {
  id:            string
  nome:          string
  descricao:     string
  status:        EsquemaStatus
  criado_em:     string
  atualizado_em: string
}

interface Regra {
  id:                    string
  esquema_id:            string
  nome:                  string
  descricao:             string
  status:                RegraStatus
  prioridade:            number
  condicoes:             Record<string, unknown>
  resultado_tipo:        ResultadoTipo
  resultado_modo:        ResultadoModo
  resultado_valor:       number
  resultado_base_valor:  number
  criado_em:             string
  atualizado_em:         string
}

const ESQUEMA_STATUS_LABEL: Record<EsquemaStatus, string> = {
  rascunho: 'Rascunho', ativo: 'Ativo', inativo: 'Inativo',
}
const REGRA_STATUS_LABEL: Record<RegraStatus, string> = {
  rascunho: 'Rascunho', ativo: 'Ativa', inativo: 'Inativa',
}
const REGRA_STATUS_CORES: Record<RegraStatus, string> = {
  rascunho: 'bg-amber-100 text-amber-700 border-amber-200',
  ativo:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  inativo:  'bg-gray-100 text-gray-600 border-gray-200',
}
// "Bases categóricas" usadas no modo `sobre` — qual variável a regra olha.
// O Map contém TODAS as bases historicamente válidas para que `fmtResultado`
// continue formatando regras antigas; o dropdown de SOBRE filtra para mostrar
// só Faturamento + Lucro Bruto (`BASES_SOBRE_PERMITIDAS`).
const BASE_LABEL: Record<ResultadoTipo, string> = {
  vendas_rs:         'o Faturamento',
  lucro_bruto:       'o Lucro Bruto',
  quantidade:        'a Quantidade',
  mix:               'o Mix',
  produto:           'o Produto',
  grupo_produto:     'o Grupo de Produto',
  subgrupo_produto:  'o Subgrupo de Produto',
}
const BASE_ICONE: Record<ResultadoTipo, React.ElementType> = {
  vendas_rs:         DollarSign,
  lucro_bruto:       TrendingUp,
  quantidade:        Hash,
  mix:               Layers,
  produto:           Package,
  grupo_produto:     Boxes,
  subgrupo_produto:  FolderTree,
}
const BASES_SOBRE_PERMITIDAS: ResultadoTipo[] = ['vendas_rs', 'lucro_bruto']

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const fmtNum = (v: number) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

// Frase humana do resultado da regra, conforme o modo escolhido.
//   sobre        → "7% sobre o Faturamento"
//   por_unidade  → "R$ 10,00 por unidade"
//   a_cada       → "R$ 100,00 a cada R$ 1.000,00"
function fmtResultado(r: { resultado_modo: ResultadoModo; resultado_tipo: ResultadoTipo; resultado_valor: number; resultado_base_valor: number }): string {
  const v = Number(r.resultado_valor)
  if (r.resultado_modo === 'sobre') {
    return `${fmtNum(v)}% sobre ${BASE_LABEL[r.resultado_tipo]}`
  }
  if (r.resultado_modo === 'por_unidade') {
    return `${fmtBRL(v)} por unidade`
  }
  // a_cada
  return `${fmtBRL(v)} a cada ${fmtBRL(Number(r.resultado_base_valor))}`
}

export default function EsquemaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [esquema, setEsquema]    = useState<Esquema | null>(null)
  const [regras,  setRegras]     = useState<Regra[]>([])
  const [loading, setLoading]    = useState(true)
  const [erro,    setErro]       = useState<string | null>(null)

  // Estado de edição do esquema
  const [nome,       setNome]       = useState('')
  const [descricao,  setDescricao]  = useState('')
  const [status,     setStatus]     = useState<EsquemaStatus>('rascunho')
  const [salvando,   setSalvando]   = useState(false)

  // Diálogo regra
  const [regraDialogOpen, setRegraDialogOpen] = useState(false)
  const [regraEditando,   setRegraEditando]   = useState<Regra | null>(null)
  const [regraForm,       setRegraForm]       = useState({
    nome:                  '',
    descricao:             '',
    status:                'rascunho' as RegraStatus,
    prioridade:            1,
    resultado_modo:        'sobre' as ResultadoModo,
    resultado_tipo:        'vendas_rs' as ResultadoTipo,  // só usado em modo 'sobre'
    resultado_valor:       0,
    resultado_base_valor:  0,                              // só usado em modo 'a_cada'
    condicoes:             emptyRootGroup() as ConditionGroup,
  })
  const [salvandoRegra, setSalvandoRegra] = useState(false)
  const [excluindoRegra, setExcluindoRegra] = useState<Regra | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const r = await fetch(`/api/comissionamento/esquemas/${id}`)
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        return
      }
      const esq = json.esquema as Esquema
      setEsquema(esq)
      setRegras(json.regras ?? [])
      setNome(esq.nome)
      setDescricao(esq.descricao)
      setStatus(esq.status)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  // ── Esquema: salvar alterações ────────────────────────────────────────────
  async function salvarEsquema() {
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    setSalvando(true)
    try {
      const r = await fetch(`/api/comissionamento/esquemas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao, status }),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: json.error })
        return
      }
      toast({ title: 'Esquema atualizado' })
      setEsquema(json.esquema)
    } finally {
      setSalvando(false)
    }
  }

  // ── Regra: abrir diálogo (criar ou editar) ────────────────────────────────
  function abrirCriarRegra() {
    setRegraEditando(null)
    setRegraForm({
      nome:                  '',
      descricao:             '',
      status:                'rascunho',
      prioridade:            regras.length + 1,
      resultado_modo:        'sobre',
      resultado_tipo:        'vendas_rs',
      resultado_valor:       0,
      resultado_base_valor:  0,
      condicoes:             emptyRootGroup(),
    })
    setRegraDialogOpen(true)
  }

  function abrirEditarRegra(r: Regra) {
    setRegraEditando(r)
    setRegraForm({
      nome:                  r.nome,
      descricao:             r.descricao,
      status:                r.status,
      prioridade:            r.prioridade,
      resultado_modo:        r.resultado_modo ?? 'sobre',
      resultado_tipo:        r.resultado_tipo,
      resultado_valor:       Number(r.resultado_valor),
      resultado_base_valor:  Number(r.resultado_base_valor ?? 0),
      condicoes:             parseCondicoes(r.condicoes),
    })
    setRegraDialogOpen(true)
  }

  async function salvarRegra() {
    if (!regraForm.nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    if (hasIncomplete(regraForm.condicoes)) {
      toast({
        variant: 'destructive',
        title: 'Condições incompletas',
        description: 'Toda condição precisa de campo, operador e valor preenchidos.',
      })
      return
    }
    setSalvandoRegra(true)
    try {
      const url    = regraEditando
        ? `/api/comissionamento/regras/${regraEditando.id}`
        : `/api/comissionamento/esquemas/${id}/regras`
      const method = regraEditando ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regraForm),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      toast({ title: regraEditando ? 'Regra atualizada' : 'Regra criada', description: regraForm.nome })
      setRegraDialogOpen(false)
      await carregar()
    } finally {
      setSalvandoRegra(false)
    }
  }

  async function confirmarExcluirRegra() {
    if (!excluindoRegra) return
    const r = await fetch(`/api/comissionamento/regras/${excluindoRegra.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: json.error })
      return
    }
    toast({ title: 'Regra excluída' })
    setExcluindoRegra(null)
    await carregar()
  }

  async function toggleStatusRegra(r: Regra) {
    const novoStatus: RegraStatus = r.status === 'ativo' ? 'inativo' : 'ativo'
    const resp = await fetch(`/api/comissionamento/regras/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    })
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}))
      toast({ variant: 'destructive', title: 'Erro', description: json.error })
      return
    }
    setRegras(prev => prev.map(x => x.id === r.id ? { ...x, status: novoStatus } : x))
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Carregando esquema..." />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (erro || !esquema) {
    return (
      <div className="flex flex-col min-h-full">
        <Header
          title="Esquema não encontrado"
          actions={
            <Link
              href="/comissionamento/esquemas"
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Link>
          }
        />
        <div className="p-6">
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>{erro ?? 'Esquema não encontrado'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title={esquema.nome}
        description={`Esquema · ${ESQUEMA_STATUS_LABEL[esquema.status]} · ${regras.length} regra${regras.length === 1 ? '' : 's'}`}
        actions={
          <Link
            href="/comissionamento/esquemas"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Esquemas
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* Card de edição do esquema */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-[13px] font-semibold text-gray-800">Informações do esquema</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EsquemaStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Descrição</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={salvarEsquema} disabled={salvando} className="gap-2 bg-gray-900 hover:bg-black text-white">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar alterações
            </Button>
          </div>
        </div>

        {/* Lista de regras */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-[14px] font-bold text-gray-900">Regras de cálculo</p>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Cada regra define quando e quanto comissionar. Menor prioridade aplica primeiro.
              </p>
            </div>
            <Button onClick={abrirCriarRegra} className="gap-1.5 bg-gray-900 hover:bg-black text-white text-[13px]">
              <Plus className="w-3.5 h-3.5" /> Nova regra
            </Button>
          </div>

          {regras.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <ClipboardList className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-[13px] font-medium text-gray-700">Nenhuma regra criada</p>
              <p className="text-[12px] text-gray-500 mt-1">Adicione a primeira regra para definir como esse esquema calcula comissões.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="text-left  px-4 py-2.5 w-16">Pri.</th>
                    <th className="text-left  px-4 py-2.5">Nome</th>
                    <th className="text-left  px-4 py-2.5 w-44">Resultado</th>
                    <th className="text-center px-4 py-2.5 w-28">Status</th>
                    <th className="text-right px-4 py-2.5 w-28">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {regras.map(r => {
                    const ResIcon = r.resultado_modo === 'sobre' ? BASE_ICONE[r.resultado_tipo]
                                  : r.resultado_modo === 'por_unidade' ? Hash
                                  : DollarSign
                    const cond = parseCondicoes(r.condicoes)
                    const resumoCond = isGroupEmpty(cond) ? null : summarizeGroup(cond)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 font-mono text-gray-500 tabular-nums">{r.prioridade}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{r.nome}</p>
                          {r.descricao && <p className="text-[11px] text-gray-500 truncate">{r.descricao}</p>}
                          {resumoCond ? (
                            <p
                              className="mt-1 inline-flex items-start gap-1 text-[10.5px] text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 max-w-full"
                              title={resumoCond}
                            >
                              <GitBranch className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-gray-400" />
                              <span className="truncate">{resumoCond}</span>
                            </p>
                          ) : (
                            <p className="mt-1 text-[10.5px] text-gray-400 italic">Aplica em qualquer venda</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="inline-flex items-center gap-1.5 text-[12px] text-gray-700" title={fmtResultado(r)}>
                            <ResIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="font-semibold">{fmtResultado(r)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggleStatusRegra(r)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors cursor-pointer',
                              REGRA_STATUS_CORES[r.status],
                              'hover:brightness-95',
                            )}
                          >
                            {r.status === 'ativo' && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {REGRA_STATUS_LABEL[r.status]}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <button
                              onClick={() => abrirEditarRegra(r)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setExcluindoRegra(r)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Diálogo criar/editar regra */}
      <Dialog open={regraDialogOpen} onOpenChange={setRegraDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {regraEditando ? <Pencil className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-orange-500" />}
              {regraEditando ? 'Editar regra' : 'Nova regra'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">

            {/* ── Identificação da regra (linha compacta) ───────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
                <Input
                  value={regraForm.nome}
                  onChange={e => setRegraForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex.: 2% sobre venda à vista"
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Prioridade</Label>
                <Input
                  type="number"
                  min={1}
                  value={regraForm.prioridade}
                  onChange={e => setRegraForm(f => ({ ...f, prioridade: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Status</Label>
                <Select
                  value={regraForm.status}
                  onValueChange={(v) => setRegraForm(f => ({ ...f, status: v as RegraStatus }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="ativo">Ativa</SelectItem>
                    <SelectItem value="inativo">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── SE (condições) ────────────────────────────────────────── */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-100/60 border-b border-blue-200">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-600 text-white text-[11px] font-bold">SE</span>
                <p className="text-[12.5px] font-semibold text-blue-900">as condições abaixo forem confirmadas:</p>
                {!isGroupEmpty(regraForm.condicoes) && (
                  <span className="ml-auto text-[10.5px] text-blue-700 italic truncate max-w-[40%]" title={summarizeGroup(regraForm.condicoes)}>
                    {summarizeGroup(regraForm.condicoes)}
                  </span>
                )}
              </div>
              <div className="p-3">
                <ConditionBuilder
                  value={regraForm.condicoes}
                  onChange={(g) => setRegraForm(f => ({ ...f, condicoes: g }))}
                />
              </div>
            </div>

            {/* ── ENTÃO (ação / comissão) ───────────────────────────────── */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-100/60 border-b border-emerald-200">
                <span className="inline-flex items-center justify-center px-1.5 h-6 rounded-md bg-emerald-600 text-white text-[11px] font-bold">ENTÃO</span>
                <p className="text-[12.5px] font-semibold text-emerald-900">faça isso:</p>
                <span className="ml-auto text-[10.5px] text-emerald-700 italic truncate max-w-[50%]" title={fmtResultado(regraForm)}>
                  {fmtResultado(regraForm)}
                </span>
              </div>

              <div className="p-3 space-y-3">
                {/* Seletor de modo — 3 abas */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-white border border-gray-200 rounded-lg">
                  {([
                    { id: 'sobre',       label: 'Sobre',        sub: '% sobre uma base'             },
                    { id: 'por_unidade', label: 'Por unidade',  sub: 'R$ por unidade vendida'       },
                    { id: 'a_cada',      label: 'A cada',       sub: 'R$ a cada faixa de venda'     },
                  ] as { id: ResultadoModo; label: string; sub: string }[]).map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRegraForm(f => ({ ...f, resultado_modo: m.id }))}
                      className={cn(
                        'flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-md text-left transition-colors',
                        regraForm.resultado_modo === m.id
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      <span className="text-[12px] font-bold">{m.label}</span>
                      <span className={cn('text-[10px]', regraForm.resultado_modo === m.id ? 'text-emerald-100' : 'text-gray-400')}>
                        {m.sub}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Inputs dinâmicos por modo */}
                {regraForm.resultado_modo === 'sobre' && (
                  <div className="flex flex-wrap items-end gap-2 bg-white border border-gray-200 rounded-lg p-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-emerald-100 text-emerald-700 font-bold text-[14px]">%</span>
                    <div className="w-32">
                      <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Valor (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={regraForm.resultado_valor}
                        onChange={e => setRegraForm(f => ({ ...f, resultado_valor: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <span className="pb-2.5 text-[12.5px] text-gray-500">sobre</span>
                    <div className="min-w-[200px] flex-1">
                      <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Base</Label>
                      <Select
                        value={BASES_SOBRE_PERMITIDAS.includes(regraForm.resultado_tipo) ? regraForm.resultado_tipo : 'vendas_rs'}
                        onValueChange={(v) => setRegraForm(f => ({ ...f, resultado_tipo: v as ResultadoTipo }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BASES_SOBRE_PERMITIDAS.map(tipo => {
                            const Icone = BASE_ICONE[tipo]
                            return (
                              <SelectItem key={tipo} value={tipo}>
                                <span className="flex items-center gap-2">
                                  <Icone className="w-3.5 h-3.5" />
                                  {/* "o Faturamento" → mostro só a parte significativa no select */}
                                  {BASE_LABEL[tipo].replace(/^(o|a) /, '')}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {regraForm.resultado_modo === 'por_unidade' && (
                  <div className="flex flex-wrap items-end gap-2 bg-white border border-gray-200 rounded-lg p-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-emerald-100 text-emerald-700 font-bold text-[12px]">R$</span>
                    <div className="w-40">
                      <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={regraForm.resultado_valor}
                        onChange={e => setRegraForm(f => ({ ...f, resultado_valor: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <span className="pb-2.5 text-[12.5px] text-gray-500">por unidade vendida</span>
                  </div>
                )}

                {regraForm.resultado_modo === 'a_cada' && (
                  <div className="flex flex-wrap items-end gap-2 bg-white border border-gray-200 rounded-lg p-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-emerald-100 text-emerald-700 font-bold text-[12px]">R$</span>
                    <div className="w-40">
                      <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={regraForm.resultado_valor}
                        onChange={e => setRegraForm(f => ({ ...f, resultado_valor: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <span className="pb-2.5 text-[12.5px] text-gray-500">a cada</span>
                    <div className="w-40">
                      <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Faixa (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0.01}
                        value={regraForm.resultado_base_valor}
                        onChange={e => setRegraForm(f => ({ ...f, resultado_base_valor: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <span className="pb-2.5 text-[12.5px] text-gray-500">faturados</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Descrição (opcional) ──────────────────────────────────── */}
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Observações</Label>
              <Textarea
                value={regraForm.descricao}
                onChange={e => setRegraForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Comentários adicionais sobre essa regra (opcional)..."
                rows={2}
              />
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRegraDialogOpen(false)} disabled={salvandoRegra}>Cancelar</Button>
            <Button onClick={salvarRegra} disabled={salvandoRegra} className="gap-2 bg-gray-900 hover:bg-black text-white">
              {salvandoRegra
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : (regraEditando ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />)}
              {regraEditando ? 'Salvar alterações' : 'Criar regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão regra */}
      <Dialog open={!!excluindoRegra} onOpenChange={(o) => !o && setExcluindoRegra(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" /> Excluir regra
            </DialogTitle>
          </DialogHeader>
          {excluindoRegra && (
            <p className="text-[13.5px] text-gray-700 py-2">
              Excluir a regra <strong>{excluindoRegra.nome}</strong>? Esta ação é permanente.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindoRegra(null)}>Cancelar</Button>
            <Button onClick={confirmarExcluirRegra} className="bg-red-600 hover:bg-red-700 text-white gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
