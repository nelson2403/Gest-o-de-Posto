'use client'

import { useEffect, useRef, useState, useCallback, use } from 'react'
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
  Trash2, Pencil, Copy, AlertCircle, CheckCircle2, ListChecks,
  DollarSign, Hash, Layers, Package, FolderTree, Boxes, GitBranch, TrendingUp,
  Building2, Filter, X, ChevronDown, ChevronUp, Target,
} from 'lucide-react'
import type { EsquemaStatus } from '@/app/api/comissionamento/esquemas/route'
import type { RegraStatus, ResultadoTipo, ResultadoModo } from '@/app/api/comissionamento/esquemas/[id]/regras/route'
import {
  type ConditionGroup, emptyRootGroup, parseCondicoes, summarizeGroup,
  hasIncomplete, isGroupEmpty,
} from '../../_lib/conditions'
import { ConditionBuilder } from '../../_components/ConditionBuilder'
import { ProdutoMultiSelect } from '../../_components/ProdutoMultiSelect'

interface Esquema {
  id:            string
  nome:          string
  descricao:     string
  status:        EsquemaStatus
  criado_em:     string
  atualizado_em: string
  product_filters?: ProductFilter[]
}

interface ProductFilter {
  tipo:    'produto' | 'grupo_produto' | 'subgrupo_produto' | 'produto_tipo'
  valores: string[]
  modo:    'incluir' | 'excluir'
}

const PRODUTO_TIPOS: { value: string; label: string }[] = [
  { value: 'C', label: 'Combustível' },
  { value: 'M', label: 'Mercadoria / Loja' },
  { value: 'K', label: 'Kit' },
  { value: 'S', label: 'Serviço' },
  { value: 'P', label: 'Outro (P)' },
]

const FILTRO_TIPO_LABEL: Record<ProductFilter['tipo'], string> = {
  produto:           'Produto',
  grupo_produto:     'Grupo de Produto',
  subgrupo_produto:  'Subgrupo de Produto',
  produto_tipo:      'Tipo de Produto',
}

interface Posto { id: string; nome: string; codigo_empresa_externo: string | null }
interface AsItem { grid: number; codigo: number; nome: string; grupo?: number }

// ── Abas da página ──────────────────────────────────────────────────────────
type SAba = 'geral' | 'postos' | 'filtros' | 'regras'
interface AbaDef {
  id:    SAba
  label: string
  icon:  React.ElementType
  desc:  string  // tooltip/aria
}
const ABAS: AbaDef[] = [
  { id: 'geral',   label: 'Geral',    icon: ClipboardList, desc: 'Nome, status e descrição do esquema'        },
  { id: 'postos',  label: 'Postos',   icon: Building2,     desc: 'Postos onde este esquema é aplicado'         },
  { id: 'filtros', label: 'Filtros',  icon: Filter,        desc: 'Filtros de produto que restringem o escopo'  },
  { id: 'regras',  label: 'Regras',   icon: GitBranch,     desc: 'Regras de cálculo da comissão'               },
]

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
  escopo_tipo:           EscopoTipoUI | null
  escopo_valor:          string
  meta_referencia_id:    string | null
  meta_referencia_nome:  string | null
  checklist_template_referencia_id: string | null
  realizado_filtros:     ProductFilter[]
  realizado_campo:       RegraCampo
  base_filtros:          ProductFilter[]
  base_campo:            RegraCampo
  realizado_escopo:      RegraEscopo
  base_escopo:           RegraEscopo
  criado_em:             string
  atualizado_em:         string
}

// ── Escopo da ação (ENTÃO) — LEGADO; substituído por base_filtros
export type EscopoTipoUI = 'produto' | 'grupo_produto' | 'subgrupo_produto'
const ESCOPO_LABEL: Record<EscopoTipoUI, string> = {
  produto:          'Produto',
  grupo_produto:    'Grupo',
  subgrupo_produto: 'Subgrupo',
}

// Campo somado no realizado e na base (migration 093 + 094)
export type RegraCampo = 'faturamento' | 'quantidade' | 'lucro' | 'mix' | 'atingimento_meta'

// Escopo da agregação (migration 127). 'vendedor' = como hoje; 'todos' =
// agrega sobre o posto inteiro (regras de gerente).
export type RegraEscopo = 'vendedor' | 'todos'
const CAMPO_LABEL: Record<RegraCampo, string> = {
  faturamento:      'Faturamento',
  quantidade:       'Quantidade',
  lucro:            'Lucro Bruto',
  mix:              'Mix (produtos distintos)',
  atingimento_meta: 'Atingimento de meta (%)',
}
const CAMPO_ICONE: Record<RegraCampo, React.ElementType> = {
  faturamento:      DollarSign,
  quantidade:       Hash,
  lucro:            TrendingUp,
  mix:              Layers,
  atingimento_meta: Target,
}

interface MetaResumo {
  id:           string
  nome:         string
  campo:        string
  period_start: string
  period_end:   string
  posto_id:     string
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
function fmtResultado(r: {
  resultado_modo: ResultadoModo
  resultado_tipo: ResultadoTipo
  resultado_valor: number
  resultado_base_valor: number
  // Modelo novo (migration 093)
  base_campo?: RegraCampo
  base_filtros?: ProductFilter[]
  // Legado (cai para esses se base_campo não existir)
  escopo_tipo?: EscopoTipoUI | null
  escopo_valor?: string
}): string {
  const v = Number(r.resultado_valor)

  // Resumo dos filtros da base — só mostra se há filtros configurados
  const filtrosTxt = (() => {
    const fs = r.base_filtros ?? []
    if (fs.length === 0) {
      // Fallback legado: usar escopo_tipo/escopo_valor se preenchidos
      if (r.escopo_tipo && r.escopo_valor?.trim()) {
        return ` de ${ESCOPO_LABEL[r.escopo_tipo]} "${r.escopo_valor.trim()}"`
      }
      return ''
    }
    const partes = fs.slice(0, 2).map(f => {
      const tipoLabel = FILTRO_TIPO_LABEL[f.tipo] ?? f.tipo
      const vals = (f.valores ?? []).slice(0, 2).join(', ')
      const sufixo = (f.valores ?? []).length > 2 ? ', …' : ''
      const verbo = f.modo === 'excluir' ? '≠' : '='
      return `${tipoLabel} ${verbo} ${vals}${sufixo}`
    })
    const extra = fs.length > 2 ? ` (+${fs.length - 2})` : ''
    return ` — ${partes.join(' E ')}${extra}`
  })()

  // Nome da base preferindo base_campo (modelo novo)
  const baseNome = r.base_campo
    ? CAMPO_LABEL[r.base_campo].toLowerCase()
    : BASE_LABEL[r.resultado_tipo]

  if (r.resultado_modo === 'fixo') {
    // No modo fixo a base é ignorada — não anexamos filtrosTxt.
    return `${fmtBRL(v)} fixo`
  }
  if (r.resultado_modo === 'sobre') {
    return `${fmtNum(v)}% sobre ${baseNome}${filtrosTxt}`
  }
  if (r.resultado_modo === 'por_unidade') {
    return `${fmtBRL(v)} por unidade${filtrosTxt}`
  }
  // a_cada
  return `${fmtBRL(v)} a cada ${fmtBRL(Number(r.resultado_base_valor))}${filtrosTxt}`
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

  // Aba ativa (UX em abas)
  const [abaAtiva, setAbaAtiva] = useState<SAba>('geral')

  // Postos vinculados (N:N)
  const [postos,         setPostos]         = useState<Posto[]>([])
  const [postosVinc,     setPostosVinc]     = useState<Set<string>>(new Set())
  const [salvandoPostos, setSalvandoPostos] = useState(false)
  const [postosDirty,    setPostosDirty]    = useState(false)

  // Filtros de produto
  const [filtros,        setFiltros]        = useState<ProductFilter[]>([])
  const [filtrosDirty,   setFiltrosDirty]   = useState(false)
  const [salvandoFiltros,setSalvandoFiltros]= useState(false)
  const [gruposAS,       setGruposAS]       = useState<AsItem[]>([])
  const [subgruposAS,    setSubgruposAS]    = useState<AsItem[]>([])

  // Metas disponíveis para referenciar em condições de atingimento.
  // Carregadas dos postos vinculados ao esquema (filtra por posto_id).
  const [metasDisponiveis, setMetasDisponiveis] = useState<MetaResumo[]>([])
  // Templates de checklist disponíveis para condições de pontuacao_checklist.
  const [checklistTemplates, setChecklistTemplates] = useState<Array<{ id: string; nome: string }>>([])
  useEffect(() => {
    fetch('/api/comissionamento/checklists/templates')
      .then(r => r.json())
      .then(d => setChecklistTemplates((d.templates ?? []).filter((t: { ativo: boolean }) => t.ativo).map((t: { id: string; nome: string }) => ({ id: t.id, nome: t.nome }))))
      .catch(() => {})
  }, [])

  // Formulário inline de regra (substituiu o antigo Dialog)
  const [regraFormOpen, setRegraFormOpen] = useState(false)
  const [regraEditando, setRegraEditando] = useState<Regra | null>(null)
  const regraFormRef    = useRef<HTMLDivElement>(null)
  const [regraForm,     setRegraForm] = useState({
    nome:                  '',
    descricao:             '',
    status:                'rascunho' as RegraStatus,
    prioridade:            1,
    resultado_modo:        'sobre' as ResultadoModo,
    resultado_tipo:        'vendas_rs' as ResultadoTipo,  // só usado em modo 'sobre'
    resultado_valor:       0,
    resultado_base_valor:  0,                              // só usado em modo 'a_cada'
    escopo_tipo:           null as EscopoTipoUI | null,    // LEGADO
    escopo_valor:          '',                             // LEGADO
    meta_referencia_id:    null as string | null,          // fornece valor_meta para atingimento
    meta_referencia_nome:  null as string | null,          // referência dinâmica por nome
    checklist_template_referencia_id: null as string | null,  // fornece pontuacao_checklist no ctx
    realizado_filtros:     [] as ProductFilter[],          // SE — filtros do realizado
    realizado_campo:       'faturamento' as RegraCampo,    // SE — dimensão do realizado
    base_filtros:          [] as ProductFilter[],          // ENTÃO — filtros da base
    base_campo:            'faturamento' as RegraCampo,    // ENTÃO — dimensão da base
    realizado_escopo:      'vendedor' as RegraEscopo,      // SE — vendedor ou agregado posto
    base_escopo:           'vendedor' as RegraEscopo,      // ENTÃO — idem
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
      setFiltros(Array.isArray(esq.product_filters) ? esq.product_filters : [])
      setFiltrosDirty(false)
      setPostosVinc(new Set(Array.isArray(json.posto_ids) ? json.posto_ids : []))
      setPostosDirty(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  // Carrega postos e lookup AUTOSYSTEM uma vez
  useEffect(() => {
    fetch('/api/postos').then(r => r.json()).then(json => {
      const lista = ((json.postos ?? []) as Posto[]).sort((a, b) => a.nome.localeCompare(b.nome))
      setPostos(lista)
    }).catch(() => {})
    fetch('/api/comissionamento/grupos-as').then(r => r.json()).then(json => {
      setGruposAS(json.grupos ?? [])
      setSubgruposAS(json.subgrupos ?? [])
    }).catch(() => {})
  }, [])

  // Carrega metas dos postos vinculados sempre que mudar a lista de postos
  // vinculados ao esquema. As metas alimentam o select de "Meta de referência"
  // do editor de regra. Roda só quando postosVinc tem itens — evita um GET
  // monstro sem filtro caso o esquema ainda não tenha postos.
  useEffect(() => {
    if (postosVinc.size === 0) { setMetasDisponiveis([]); return }
    // Carrega metas em paralelo para cada posto vinculado e funde a lista
    const calls = Array.from(postosVinc).map(pid =>
      fetch(`/api/comissionamento/metas?posto_id=${pid}`).then(r => r.json()).then(j => (j.metas ?? []) as MetaResumo[])
    )
    Promise.all(calls).then(results => {
      const flat = results.flat()
      // Dedup por id e ordena por nome
      const map = new Map<string, MetaResumo>()
      for (const m of flat) if (!map.has(m.id)) map.set(m.id, m)
      setMetasDisponiveis(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)))
    }).catch(() => setMetasDisponiveis([]))
  }, [postosVinc])

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

  // ── Postos vinculados: salvar ─────────────────────────────────────────────
  async function salvarPostos() {
    setSalvandoPostos(true)
    try {
      const r = await fetch(`/api/comissionamento/esquemas/${id}/postos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto_ids: Array.from(postosVinc) }),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      toast({ title: 'Postos vinculados', description: `${json.total} posto${json.total === 1 ? '' : 's'}` })
      setPostosDirty(false)
    } finally {
      setSalvandoPostos(false)
    }
  }
  function togglePosto(pid: string) {
    setPostosVinc(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid); else next.add(pid)
      return next
    })
    setPostosDirty(true)
  }

  // ── Filtros de produto: salvar ────────────────────────────────────────────
  async function salvarFiltros() {
    setSalvandoFiltros(true)
    try {
      // Sanitiza: remove filtros sem valores
      const limpos = filtros
        .filter(f => f.valores && f.valores.length > 0)
        .map(f => ({ tipo: f.tipo, valores: f.valores, modo: f.modo }))
      const r = await fetch(`/api/comissionamento/esquemas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_filters: limpos }),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro', description: json.error })
        return
      }
      toast({ title: 'Filtros salvos', description: `${limpos.length} filtro${limpos.length === 1 ? '' : 's'} aplicado${limpos.length === 1 ? '' : 's'}` })
      setEsquema(json.esquema)
      setFiltros(Array.isArray(json.esquema?.product_filters) ? json.esquema.product_filters : [])
      setFiltrosDirty(false)
    } finally {
      setSalvandoFiltros(false)
    }
  }
  function addFiltro() {
    setFiltros(prev => [...prev, { tipo: 'grupo_produto', valores: [], modo: 'incluir' }])
    setFiltrosDirty(true)
  }
  function removeFiltro(idx: number) {
    setFiltros(prev => prev.filter((_, i) => i !== idx))
    setFiltrosDirty(true)
  }
  function updateFiltro(idx: number, patch: Partial<ProductFilter>) {
    setFiltros(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
    setFiltrosDirty(true)
  }

  // ── Regra: formulário inline (criar ou editar) ────────────────────────────
  function resetarRegraForm(novaPrioridade?: number) {
    setRegraEditando(null)
    setRegraForm({
      nome:                  '',
      descricao:             '',
      status:                'rascunho',
      prioridade:            novaPrioridade ?? regras.length + 1,
      resultado_modo:        'sobre',
      resultado_tipo:        'vendas_rs',
      resultado_valor:       0,
      resultado_base_valor:  0,
      escopo_tipo:           null,
      escopo_valor:          '',
      meta_referencia_id:    null,
      meta_referencia_nome:  null,
      checklist_template_referencia_id: null,
      realizado_filtros:     [],
      realizado_campo:       'faturamento',
      base_filtros:          [],
      base_campo:            'faturamento',
      realizado_escopo:      'vendedor',
      base_escopo:           'vendedor',
      condicoes:             emptyRootGroup(),
    })
  }

  function abrirNovaRegra() {
    resetarRegraForm()
    setAbaAtiva('regras')
    setRegraFormOpen(true)
    // Scroll suave após render
    setTimeout(() => regraFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
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
      escopo_tipo:           (r.escopo_tipo ?? null) as EscopoTipoUI | null,
      escopo_valor:          r.escopo_valor ?? '',
      meta_referencia_id:    r.meta_referencia_id ?? null,
      meta_referencia_nome:  (r as unknown as { meta_referencia_nome?: string | null }).meta_referencia_nome ?? null,
      checklist_template_referencia_id: (r as unknown as { checklist_template_referencia_id?: string | null }).checklist_template_referencia_id ?? null,
      realizado_filtros:     Array.isArray(r.realizado_filtros) ? r.realizado_filtros : [],
      realizado_campo:       (r.realizado_campo ?? 'faturamento') as RegraCampo,
      base_filtros:          Array.isArray(r.base_filtros) ? r.base_filtros : [],
      base_campo:            (r.base_campo ?? 'faturamento') as RegraCampo,
      realizado_escopo:      (r.realizado_escopo ?? 'vendedor') as RegraEscopo,
      base_escopo:           (r.base_escopo ?? 'vendedor') as RegraEscopo,
      condicoes:             parseCondicoes(r.condicoes),
    })
    setAbaAtiva('regras')
    setRegraFormOpen(true)
    setTimeout(() => regraFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  function cancelarRegra() {
    setRegraFormOpen(false)
    resetarRegraForm()
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
      // Após salvar: fecha o form e volta ao modo "nova"
      setRegraFormOpen(false)
      resetarRegraForm()
      await carregar()
    } finally {
      setSalvandoRegra(false)
    }
  }

  async function duplicarRegra(r: Regra) {
    const resp = await fetch(`/api/comissionamento/regras/${r.id}/duplicar`, { method: 'POST' })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao duplicar', description: json.error })
      return
    }
    toast({ title: 'Regra duplicada', description: 'A cópia entra como rascunho. Revise antes de ativar.' })
    await carregar()
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

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 flex-shrink-0">
        <nav className="flex gap-1 overflow-x-auto scrollbar-none" aria-label="Seções do esquema">
          {(ABAS as AbaDef[]).map(({ id, label, icon: Icon, desc }) => {
            const ativa = abaAtiva === id
            const dirty = (id === 'postos' && postosDirty) || (id === 'filtros' && filtrosDirty)
            const contador =
              id === 'postos'  ? postosVinc.size :
              id === 'filtros' ? filtros.length  :
              id === 'regras'  ? regras.length   :
              null
            return (
              <button
                key={id}
                onClick={() => setAbaAtiva(id)}
                title={desc}
                aria-current={ativa ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  ativa
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {contador != null && (
                  <span
                    className={cn(
                      'text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums',
                      ativa ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {contador}
                  </span>
                )}
                {dirty && (
                  <span
                    title="Alterações não salvas nesta aba"
                    className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-0.5"
                  />
                )}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">

        {/* ── Aba: Geral ── */}
        {abaAtiva === 'geral' && (
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
        )}

        {/* ── Aba: Postos vinculados ── */}
        {abaAtiva === 'postos' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-800">Postos vinculados</p>
                <p className="text-[11.5px] text-gray-500">
                  Define em quais postos este esquema aparece na seleção.{' '}
                  <strong>Nenhum selecionado</strong> = vale para todos os postos.
                </p>
              </div>
            </div>
            <Button
              onClick={salvarPostos}
              disabled={!postosDirty || salvandoPostos}
              className="gap-2 bg-gray-900 hover:bg-black text-white text-[12.5px]"
            >
              {salvandoPostos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar vínculos
            </Button>
          </div>

          {postos.length === 0 ? (
            <p className="text-[12.5px] text-gray-400 italic">Nenhum posto cadastrado.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {postos.map(p => {
                const sel = postosVinc.has(p.id)
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors',
                      sel ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => togglePosto(p.id)}
                      className="accent-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[12px] text-gray-700 truncate">{p.nome}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
        )}

        {/* ── Aba: Filtros de produto (escopo) ── */}
        {abaAtiva === 'filtros' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Filter className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-800">Filtros de produto (escopo)</p>
                <p className="text-[11.5px] text-gray-500">
                  Restringe quais vendas o esquema avalia. Múltiplos filtros combinam por <strong>E</strong>.
                  Vendas fora do escopo saem com comissão zero.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={addFiltro} variant="outline" className="gap-1.5 text-[12.5px]">
                <Plus className="w-3.5 h-3.5" /> Adicionar filtro
              </Button>
              <Button
                onClick={salvarFiltros}
                disabled={!filtrosDirty || salvandoFiltros}
                className="gap-2 bg-gray-900 hover:bg-black text-white text-[12.5px]"
              >
                {salvandoFiltros ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar filtros
              </Button>
            </div>
          </div>

          {filtros.length === 0 ? (
            <p className="text-[12.5px] text-gray-400 italic">Sem filtros — todas as vendas do posto entram na avaliação.</p>
          ) : (
            <div className="space-y-3">
              {filtros.map((f, idx) => (
                <FiltroProdutoLinha
                  key={idx}
                  filtro={f}
                  gruposAS={gruposAS}
                  subgruposAS={subgruposAS}
                  onChange={(patch) => updateFiltro(idx, patch)}
                  onRemove={() => removeFiltro(idx)}
                />
              ))}
            </div>
          )}
        </div>
        )}

        {/* ── Aba: Regras de cálculo ── */}
        {abaAtiva === 'regras' && (
        <div className="space-y-4">

          {/* ── Form inline de nova/editar regra (colapsável) ─────────────── */}
          <div ref={regraFormRef} className={cn(
            'bg-white rounded-xl border overflow-hidden transition-colors',
            regraEditando ? 'border-blue-300' : regraFormOpen ? 'border-orange-300' : 'border-gray-200',
          )}>
            {/* Header colapsável */}
            <button
              type="button"
              onClick={() => regraFormOpen ? cancelarRegra() : abrirNovaRegra()}
              className={cn(
                'w-full flex items-center gap-3 px-5 py-3 text-left transition-colors',
                regraEditando ? 'bg-blue-50/60 hover:bg-blue-100/60' :
                regraFormOpen ? 'bg-orange-50/60 hover:bg-orange-100/60' :
                                'bg-gray-50/40 hover:bg-gray-100/60',
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                regraEditando ? 'bg-blue-100 text-blue-600' :
                regraFormOpen ? 'bg-orange-100 text-orange-600' :
                                'bg-gray-100 text-gray-500',
              )}>
                {regraEditando ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-gray-900">
                  {regraEditando
                    ? <>Editando regra: <span className="text-blue-700">{regraEditando.nome}</span></>
                    : regraFormOpen
                      ? 'Nova regra'
                      : 'Criar nova regra'}
                </p>
                <p className="text-[11.5px] text-gray-500 mt-0.5">
                  {regraEditando
                    ? 'Altere os campos abaixo e salve para atualizar a regra.'
                    : regraFormOpen
                      ? 'Defina condições (SE) e ação (ENTÃO). Status pode ser ajustado depois.'
                      : 'Clique para abrir o formulário com SE/ENTÃO.'}
                </p>
              </div>
              {regraEditando && (
                <span className="text-[11px] text-gray-500 italic mr-2">Cancelar edição</span>
              )}
              {regraFormOpen
                ? <ChevronUp   className="w-4 h-4 text-gray-400 flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            </button>

            {/* Corpo do form — só renderiza quando aberto */}
            {regraFormOpen && (
              <RegraForm
                regraForm={regraForm}
                setRegraForm={setRegraForm}
                regraEditando={regraEditando}
                salvando={salvandoRegra}
                onCancel={cancelarRegra}
                onSave={salvarRegra}
                gruposAS={gruposAS}
                subgruposAS={subgruposAS}
                metas={metasDisponiveis}
                checklistTemplates={checklistTemplates}
              />
            )}
          </div>

          {/* ── Lista de regras existentes ─────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-gray-900">Regras de cálculo</p>
              <p className="text-[11.5px] text-gray-500 mt-0.5">
                Menor prioridade aplica primeiro. Clique no status para alternar.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {regras.length} regra{regras.length === 1 ? '' : 's'}
            </span>
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
                              onClick={() => duplicarRegra(r)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Duplicar (nova regra em rascunho, herda todos os campos)"
                            >
                              <Copy className="w-3.5 h-3.5" />
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
        )}
      </div>

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

// ── FiltroProdutoLinha ──────────────────────────────────────────────────────

interface FiltroProdutoLinhaProps {
  filtro:      ProductFilter
  gruposAS:    AsItem[]
  subgruposAS: AsItem[]
  onChange:    (patch: Partial<ProductFilter>) => void
  onRemove:    () => void
}
function FiltroProdutoLinha({ filtro, gruposAS, subgruposAS, onChange, onRemove }: FiltroProdutoLinhaProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-[180px]">
          <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Tipo</Label>
          <Select
            value={filtro.tipo}
            onValueChange={(v) => onChange({ tipo: v as ProductFilter['tipo'], valores: [] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="produto">{FILTRO_TIPO_LABEL.produto}</SelectItem>
              <SelectItem value="grupo_produto">{FILTRO_TIPO_LABEL.grupo_produto}</SelectItem>
              <SelectItem value="subgrupo_produto">{FILTRO_TIPO_LABEL.subgrupo_produto}</SelectItem>
              <SelectItem value="produto_tipo">{FILTRO_TIPO_LABEL.produto_tipo}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Modo</Label>
          <Select value={filtro.modo} onValueChange={(v) => onChange({ modo: v as ProductFilter['modo'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="incluir">Incluir apenas</SelectItem>
              <SelectItem value="excluir">Excluir</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <button
            onClick={onRemove}
            title="Remover filtro"
            className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <FiltroValoresInput
          tipo={filtro.tipo}
          valores={filtro.valores}
          onChange={(v) => onChange({ valores: v })}
          gruposAS={gruposAS}
          subgruposAS={subgruposAS}
        />
      </div>
    </div>
  )
}

interface FiltroValoresInputProps {
  tipo:        ProductFilter['tipo']
  valores:     string[]
  onChange:    (v: string[]) => void
  gruposAS:    AsItem[]
  subgruposAS: AsItem[]
}
function FiltroValoresInput({ tipo, valores, onChange, gruposAS, subgruposAS }: FiltroValoresInputProps) {
  if (tipo === 'produto_tipo') {
    return (
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Tipos de produto</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {PRODUTO_TIPOS.map(t => {
            const sel = valores.includes(t.value)
            return (
              <label key={t.value} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => onChange(sel ? valores.filter(x => x !== t.value) : [...valores, t.value])}
                  className="accent-orange-500 w-3.5 h-3.5"
                />
                <span className="text-[12px] text-gray-700">{t.label}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  if (tipo === 'grupo_produto' || tipo === 'subgrupo_produto') {
    const lista = (tipo === 'grupo_produto' ? gruposAS : subgruposAS).slice().sort((a, b) => a.nome.localeCompare(b.nome))
    return (
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
          {tipo === 'grupo_produto' ? 'Grupos' : 'Subgrupos'} ({valores.length} selecionado{valores.length === 1 ? '' : 's'})
        </Label>
        <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg bg-white p-1.5 space-y-0.5">
          {lista.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] text-gray-400 italic">Nenhum {tipo === 'grupo_produto' ? 'grupo' : 'subgrupo'} encontrado no AUTOSYSTEM</p>
          )}
          {lista.map(g => {
            const sel = valores.includes(g.nome)
            return (
              <label key={g.grid} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => onChange(sel ? valores.filter(x => x !== g.nome) : [...valores, g.nome])}
                  className="accent-orange-500 w-3.5 h-3.5"
                />
                <span className="text-[12px] text-gray-700 truncate">{g.nome}</span>
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  // produto: multi-select com busca no AUTOSYSTEM
  return <ProdutoMultiSelect valores={valores} onChange={onChange} />
}

// ── RegraForm ───────────────────────────────────────────────────────────────
// Formulário inline (antes era um Dialog). Aceita o estado já gerenciado
// pelo componente pai para evitar duplicação de lógica de salvar/validar.

interface RegraFormState {
  nome:                  string
  descricao:             string
  status:                RegraStatus
  prioridade:            number
  resultado_modo:        ResultadoModo
  resultado_tipo:        ResultadoTipo
  resultado_valor:       number
  resultado_base_valor:  number
  escopo_tipo:           EscopoTipoUI | null
  escopo_valor:          string
  meta_referencia_id:    string | null
  meta_referencia_nome:  string | null
  checklist_template_referencia_id: string | null
  realizado_filtros:     ProductFilter[]
  realizado_campo:       RegraCampo
  base_filtros:          ProductFilter[]
  base_campo:            RegraCampo
  realizado_escopo:      RegraEscopo
  base_escopo:           RegraEscopo
  condicoes:             ConditionGroup
}

interface RegraFormProps {
  regraForm:     RegraFormState
  setRegraForm:  React.Dispatch<React.SetStateAction<RegraFormState>>
  regraEditando: { id: string; nome: string } | null
  salvando:      boolean
  onCancel:      () => void
  onSave:        () => void
  gruposAS:      AsItem[]
  subgruposAS:   AsItem[]
  metas:         MetaResumo[]
  checklistTemplates: Array<{ id: string; nome: string }>
}

function RegraForm({ regraForm, setRegraForm, regraEditando, salvando, onCancel, onSave, gruposAS, subgruposAS, metas, checklistTemplates }: RegraFormProps) {
  return (
    <div className="px-4 py-4 border-t border-gray-200 space-y-4 bg-white">

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
        <div className="p-3 space-y-3">
          {/* Filtros do REALIZADO + Campo — define quais vendas entram no
              cálculo do realizado e o que é somado para o atingimento. */}
          <FiltrosERealizadoBox
            filtros={regraForm.realizado_filtros}
            setFiltros={(f) => setRegraForm(s => ({ ...s, realizado_filtros: f }))}
            campo={regraForm.realizado_campo}
            setCampo={(c) => setRegraForm(s => ({ ...s, realizado_campo: c }))}
            escopo={regraForm.realizado_escopo}
            setEscopo={(e) => setRegraForm(s => ({ ...s, realizado_escopo: e }))}
            gruposAS={gruposAS}
            subgruposAS={subgruposAS}
            titulo="Filtros do realizado"
            descricao="Quais vendas entram no cálculo do realizado da meta de referência. Vazio = todas."
            borderColor="border-blue-200"
            campoLabel="Campo somado"
          />

          <ConditionBuilder
            value={regraForm.condicoes}
            onChange={(g) => setRegraForm(f => ({ ...f, condicoes: g }))}
            nomesDeMeta={Array.from(new Set(metas.map(m => m.nome))).sort()}
          />

          {/* Meta de referência — 2 modos:
              (a) específica → meta_referencia_id (trava a regra num mês)
              (b) dinâmica por nome → meta_referencia_nome (regra vale
                  todos os meses; engine resolve a meta certa no cálculo) */}
          {(() => {
            const modo: 'nenhuma' | 'especifica' | 'nome' =
              regraForm.meta_referencia_id ? 'especifica'
              : regraForm.meta_referencia_nome ? 'nome'
              : 'nenhuma'
            const nomesUnicos = Array.from(new Set(metas.map(m => m.nome))).sort()
            const ativa = modo !== 'nenhuma'
            return (
              <div className={cn(
                'rounded-lg border bg-white p-3',
                ativa ? 'border-blue-300' : 'border-dashed border-gray-200',
              )}>
                <div className="flex items-start gap-2">
                  <Target className={cn('w-3.5 h-3.5 mt-0.5', ativa ? 'text-blue-600' : 'text-gray-400')} />
                  <div className="flex-1 min-w-0">
                    <Label className="text-[11px] font-semibold text-gray-700 block mb-1">
                      Meta de referência para <code className="font-mono text-[10.5px] bg-gray-100 px-1 rounded">atingimento_meta</code>
                    </Label>

                    {/* Seletor de modo — radio buttons compactos */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <ModoBtn ativo={modo === 'nenhuma'} onClick={() => setRegraForm(f => ({ ...f, meta_referencia_id: null, meta_referencia_nome: null }))}>
                        Sem referência
                      </ModoBtn>
                      <ModoBtn ativo={modo === 'especifica'} onClick={() => setRegraForm(f => ({ ...f, meta_referencia_nome: null, meta_referencia_id: f.meta_referencia_id ?? (metas[0]?.id ?? null) }))}>
                        Meta específica (fixa)
                      </ModoBtn>
                      <ModoBtn ativo={modo === 'nome'} onClick={() => setRegraForm(f => ({ ...f, meta_referencia_id: null, meta_referencia_nome: f.meta_referencia_nome ?? (nomesUnicos[0] ?? null) }))}>
                        Por nome (dinâmica)
                      </ModoBtn>
                    </div>

                    {/* Descrição contextual */}
                    <p className="text-[10.5px] text-gray-500 mb-2">
                      {modo === 'nenhuma' && 'Usa a meta atribuída à venda (fallback). Não funciona para metas de checklist ou quando as vendas ficam fora do filtro da meta.'}
                      {modo === 'especifica' && (
                        <>Trava a regra numa meta específica. <b>Atenção:</b> ao rodar o relatório de outros meses, essa meta pode não estar no período e a regra deixa de casar.</>
                      )}
                      {modo === 'nome' && (
                        <>O engine procura toda vez a meta com esse nome no posto do cálculo cujo período cobre o intervalo. A mesma regra vale pra vários meses — basta cadastrar a meta nova mantendo o nome.</>
                      )}
                    </p>

                    {modo === 'especifica' && (
                      <Select
                        value={regraForm.meta_referencia_id ?? ''}
                        onValueChange={(v) => setRegraForm(f => ({ ...f, meta_referencia_id: v || null }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione a meta..." /></SelectTrigger>
                        <SelectContent>
                          {metas.length === 0 ? (
                            <div className="px-3 py-2 text-[11.5px] text-gray-400 italic">
                              Nenhuma meta nos postos vinculados a este esquema
                            </div>
                          ) : metas.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex items-center gap-2">
                                <Target className="w-3 h-3 text-blue-500" />
                                {m.nome}
                                <span className="text-[10px] text-gray-400">· {m.campo} · {m.period_start} → {m.period_end}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {modo === 'nome' && (
                      <Select
                        value={regraForm.meta_referencia_nome ?? ''}
                        onValueChange={(v) => setRegraForm(f => ({ ...f, meta_referencia_nome: v || null }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione o nome da meta..." /></SelectTrigger>
                        <SelectContent>
                          {nomesUnicos.length === 0 ? (
                            <div className="px-3 py-2 text-[11.5px] text-gray-400 italic">
                              Cadastre uma meta primeiro para poder escolher o nome
                            </div>
                          ) : nomesUnicos.map(n => (
                            <SelectItem key={n} value={n}>
                              <span className="flex items-center gap-2">
                                <Target className="w-3 h-3 text-blue-500" />
                                {n}
                                <span className="text-[10px] text-gray-400">
                                  · {metas.filter(m => m.nome === n).length} meta{metas.filter(m => m.nome === n).length === 1 ? '' : 's'} cadastrada{metas.filter(m => m.nome === n).length === 1 ? '' : 's'}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Template de referência do checklist — fornece pontuacao_checklist */}
          <div className={cn(
            'rounded-lg border bg-white p-3',
            regraForm.checklist_template_referencia_id ? 'border-orange-300' : 'border-dashed border-gray-200',
          )}>
            <div className="flex items-start gap-2">
              <ListChecks className={cn('w-3.5 h-3.5 mt-0.5', regraForm.checklist_template_referencia_id ? 'text-orange-600' : 'text-gray-400')} />
              <div className="flex-1 min-w-0">
                <Label className="text-[11px] font-semibold text-gray-700 block mb-1">
                  Template de referência para <code className="font-mono text-[10.5px] bg-gray-100 px-1 rounded">pontuacao_checklist</code>
                </Label>
                <p className="text-[10.5px] text-gray-500 mb-2">
                  Quando preenchido, condições de <b>pontuação do checklist</b> usam a soma dos pontos das aplicações deste template no período (posto atual). Sem template a condição sempre resulta falsa.
                </p>
                <Select
                  value={regraForm.checklist_template_referencia_id ?? '__none'}
                  onValueChange={(v) => setRegraForm(f => ({ ...f, checklist_template_referencia_id: v === '__none' ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sem template (não usa pontuacao_checklist)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">
                      <span className="text-gray-500">Sem template</span>
                    </SelectItem>
                    {checklistTemplates.length === 0 ? (
                      <div className="px-3 py-2 text-[11.5px] text-gray-400 italic">
                        Nenhum template ativo — <Link href="/comissionamento/checklists" className="underline">cadastre um</Link>
                      </div>
                    ) : checklistTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <ListChecks className="w-3 h-3 text-orange-500" />
                          {t.nome}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
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
          {/* Seletor de modo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-1 bg-white border border-gray-200 rounded-lg">
            {([
              { id: 'sobre',       label: 'Sobre',        sub: '% sobre uma base'             },
              { id: 'por_unidade', label: 'Por unidade',  sub: 'R$ por unidade vendida'       },
              { id: 'a_cada',      label: 'A cada',       sub: 'R$ a cada faixa de venda'     },
              { id: 'fixo',        label: 'Valor fixo',   sub: 'R$ fixo (ignora a base)'      },
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
                  type="number" step="0.01" min={0}
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
                  type="number" step="0.01" min={0}
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
                  type="number" step="0.01" min={0}
                  value={regraForm.resultado_valor}
                  onChange={e => setRegraForm(f => ({ ...f, resultado_valor: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <span className="pb-2.5 text-[12.5px] text-gray-500">a cada</span>
              <div className="w-40">
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Faixa (R$)</Label>
                <Input
                  type="number" step="0.01" min={0.01}
                  value={regraForm.resultado_base_valor}
                  onChange={e => setRegraForm(f => ({ ...f, resultado_base_valor: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <span className="pb-2.5 text-[12.5px] text-gray-500">faturados</span>
            </div>
          )}

          {regraForm.resultado_modo === 'fixo' && (
            <div className="flex flex-wrap items-end gap-2 bg-white border border-gray-200 rounded-lg p-3">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-emerald-100 text-emerald-700 font-bold text-[12px]">R$</span>
              <div className="w-40">
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Valor (R$)</Label>
                <Input
                  type="number" step="0.01" min={0}
                  value={regraForm.resultado_valor}
                  onChange={e => setRegraForm(f => ({ ...f, resultado_valor: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <span className="pb-2.5 text-[12.5px] text-gray-500">fixo (paga este valor quando o SE for atendido)</span>
            </div>
          )}

          {/* Filtros da BASE + Campo — define quais vendas entram na base
              do cálculo da comissão. No modo 'fixo' a base é ignorada
              (a comissão é o valor direto), então omitimos esses controles. */}
          {regraForm.resultado_modo !== 'fixo' && (
            <FiltrosERealizadoBox
              filtros={regraForm.base_filtros}
              setFiltros={(f) => setRegraForm(s => ({ ...s, base_filtros: f }))}
              campo={regraForm.base_campo}
              setCampo={(c) => setRegraForm(s => ({ ...s, base_campo: c }))}
              escopo={regraForm.base_escopo}
              setEscopo={(e) => setRegraForm(s => ({ ...s, base_escopo: e }))}
              gruposAS={gruposAS}
              subgruposAS={subgruposAS}
              titulo="Filtros da base do cálculo"
              descricao="Quais vendas entram na base. Vazio = todas. Combinação com o Campo decide o agregado sobre o qual a regra aplica."
              borderColor="border-emerald-200"
              campoLabel="Campo agregado na base"
            />
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

      {/* ── Ações ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" onClick={onCancel} disabled={salvando} className="text-[12.5px]">
          {regraEditando ? 'Cancelar edição' : 'Fechar'}
        </Button>
        <Button onClick={onSave} disabled={salvando} className="gap-2 bg-gray-900 hover:bg-black text-white text-[12.5px]">
          {salvando
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : (regraEditando ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />)}
          {regraEditando ? 'Salvar alterações' : 'Criar regra'}
        </Button>
      </div>
    </div>
  )
}

// ── EscopoRegraInput ────────────────────────────────────────────────────────
//
// Card opcional dentro do painel ENTÃO que permite restringir em qual
// produto/grupo/subgrupo a regra se aplica. Quando preenchido, equivale a
// uma condição implícita: a venda só recebe a comissão se o campo
// correspondente bater (case-insensitive) com o valor escolhido.

interface EscopoRegraInputProps {
  tipo:        EscopoTipoUI | null
  valor:       string
  onChange:    (tipo: EscopoTipoUI | null, valor: string) => void
  gruposAS:    AsItem[]
  subgruposAS: AsItem[]
}

function EscopoRegraInput({ tipo, valor, onChange, gruposAS, subgruposAS }: EscopoRegraInputProps) {
  const [produtoBusca,    setProdutoBusca]    = useState('')
  const [produtosLista,   setProdutosLista]   = useState<{ grid: number; nome: string }[]>([])
  const [produtoLoading,  setProdutoLoading]  = useState(false)
  const [produtoOpen,     setProdutoOpen]     = useState(false)
  const produtoWrapRef = useRef<HTMLDivElement>(null)

  // Quando o tipo é 'produto', busca no AUTOSYSTEM com debounce de 300ms.
  useEffect(() => {
    if (tipo !== 'produto' || !produtoOpen) return
    setProdutoLoading(true)
    let cancelled = false
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (produtoBusca.trim()) params.set('busca', produtoBusca.trim())
      fetch(`/api/comissionamento/produtos-as?${params}`)
        .then(r => r.json())
        .then(json => { if (!cancelled) setProdutosLista(json.produtos ?? []) })
        .catch(() => { if (!cancelled) setProdutosLista([]) })
        .finally(() => { if (!cancelled) setProdutoLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [tipo, produtoBusca, produtoOpen])

  // Click-outside fecha o dropdown de produto
  useEffect(() => {
    if (!produtoOpen) return
    function onClick(e: MouseEvent) {
      if (produtoWrapRef.current && !produtoWrapRef.current.contains(e.target as Node)) setProdutoOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [produtoOpen])

  // Sincroniza a busca interna com o valor externo quando muda o tipo
  useEffect(() => {
    if (tipo === 'produto') setProdutoBusca(valor)
  }, [tipo, valor])

  const ativo = tipo !== null

  return (
    <div className={cn(
      'rounded-lg border bg-white overflow-hidden transition-colors',
      ativo ? 'border-emerald-300' : 'border-dashed border-gray-200',
    )}>
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <Filter className={cn('w-3.5 h-3.5', ativo ? 'text-emerald-600' : 'text-gray-400')} />
        <p className="text-[11.5px] font-semibold text-gray-700 flex-1">
          Aplicar somente em
          <span className="text-gray-400 font-normal ml-1.5">(opcional — restringe o cálculo a um produto/grupo/subgrupo)</span>
        </p>
        {ativo && (
          <button
            type="button"
            onClick={() => onChange(null, '')}
            className="text-[10.5px] text-gray-500 hover:text-rose-600 inline-flex items-center gap-0.5"
            title="Remover escopo (aplicar a tudo)"
          >
            <X className="w-3 h-3" /> remover
          </button>
        )}
      </div>

      <div className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-4">
          <Label className="text-[10.5px] uppercase tracking-wide text-gray-500 mb-1.5 block">Tipo</Label>
          <Select
            value={tipo ?? '__none'}
            onValueChange={(v) => {
              if (v === '__none') onChange(null, '')
              else                onChange(v as EscopoTipoUI, '')
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">
                <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-gray-400" /> Sem escopo (aplica a tudo)</span>
              </SelectItem>
              <SelectItem value="produto">
                <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Produto específico</span>
              </SelectItem>
              <SelectItem value="grupo_produto">
                <span className="flex items-center gap-2"><Boxes className="w-3.5 h-3.5" /> Grupo de produto</span>
              </SelectItem>
              <SelectItem value="subgrupo_produto">
                <span className="flex items-center gap-2"><FolderTree className="w-3.5 h-3.5" /> Subgrupo de produto</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {tipo !== null && (
          <div className="md:col-span-8">
            <Label className="text-[10.5px] uppercase tracking-wide text-gray-500 mb-1.5 block">
              {tipo === 'produto' ? 'Produto' : tipo === 'grupo_produto' ? 'Grupo' : 'Subgrupo'}
            </Label>

            {tipo === 'grupo_produto' && (
              <Select value={valor || '__none'} onValueChange={v => onChange(tipo, v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(selecione)</SelectItem>
                  {gruposAS.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(g => (
                    <SelectItem key={g.grid} value={g.nome}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {tipo === 'subgrupo_produto' && (
              <Select value={valor || '__none'} onValueChange={v => onChange(tipo, v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o subgrupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(selecione)</SelectItem>
                  {subgruposAS.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(s => (
                    <SelectItem key={s.grid} value={s.nome}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {tipo === 'produto' && (
              <div ref={produtoWrapRef} className="relative">
                <Input
                  value={produtoBusca}
                  onChange={e => { setProdutoBusca(e.target.value); setProdutoOpen(true); onChange(tipo, e.target.value) }}
                  onFocus={() => setProdutoOpen(true)}
                  placeholder="Digite para buscar… (ex.: GASOLINA)"
                />
                {produtoOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                    {produtoLoading ? (
                      <div className="px-3 py-3 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div>
                    ) : produtosLista.length === 0 ? (
                      <p className="px-3 py-3 text-[11.5px] text-gray-400 italic text-center">
                        {produtoBusca.trim() ? 'Nada encontrado' : 'Digite para buscar…'}
                      </p>
                    ) : (
                      produtosLista.map(p => (
                        <button
                          key={p.grid}
                          type="button"
                          onClick={() => { setProdutoBusca(p.nome); onChange(tipo, p.nome); setProdutoOpen(false) }}
                          className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-emerald-50/60"
                        >
                          {p.nome}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {ativo && valor.trim() && (
        <p className="px-3 pb-2 text-[10.5px] text-emerald-700">
          A regra só vai casar em vendas onde <strong>{ESCOPO_LABEL[tipo!]}</strong> = <code className="font-mono">{valor.trim()}</code>.
        </p>
      )}
    </div>
  )
}

// ── FiltrosERealizadoBox ───────────────────────────────────────────────────
//
// Box reutilizável que renderiza uma lista de ProductFilter + um select de
// "campo agregado" (faturamento/quantidade/lucro/mix). Usado em DOIS lugares
// no editor de regra:
//
//   • Painel SE — define os filtros do REALIZADO da meta (calcula
//     atingimento agregando o "campo" das vendas que passarem nos filtros).
//   • Painel ENTÃO — define os filtros da BASE da comissão.

interface FiltrosERealizadoBoxProps {
  filtros:      ProductFilter[]
  setFiltros:   (f: ProductFilter[]) => void
  campo:        RegraCampo
  setCampo:     (c: RegraCampo) => void
  escopo:       RegraEscopo
  setEscopo:    (e: RegraEscopo) => void
  gruposAS:     AsItem[]
  subgruposAS:  AsItem[]
  titulo:       string
  descricao:    string
  borderColor:  string  // ex.: 'border-blue-200' ou 'border-emerald-200'
  campoLabel:   string
}

function FiltrosERealizadoBox(props: FiltrosERealizadoBoxProps) {
  const { filtros, setFiltros, campo, setCampo, escopo, setEscopo,
          gruposAS, subgruposAS, titulo, descricao, borderColor, campoLabel } = props

  function addFiltro() {
    setFiltros([...filtros, { tipo: 'grupo_produto', valores: [], modo: 'incluir' }])
  }
  function updateFiltro(idx: number, patch: Partial<ProductFilter>) {
    setFiltros(filtros.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }
  function removeFiltro(idx: number) {
    setFiltros(filtros.filter((_, i) => i !== idx))
  }

  const CampoIcone = CAMPO_ICONE[campo]
  const escopoTodos = escopo === 'todos'

  return (
    <div className={cn('rounded-lg border bg-white p-3', borderColor)}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] font-semibold text-gray-800">{titulo}</p>
          <p className="text-[10.5px] text-gray-500">{descricao}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addFiltro}
          className="text-[11px] h-7 gap-1 flex-shrink-0"
        >
          <Plus className="w-3 h-3" /> Adicionar filtro
        </Button>
      </div>

      {filtros.length === 0 ? (
        <p className="text-[11.5px] text-gray-400 italic py-1.5">
          Sem filtros — {escopoTodos ? 'todas as vendas do posto' : 'todas as vendas do vendedor'} entram.
        </p>
      ) : (
        <div className="space-y-2">
          {filtros.map((f, idx) => (
            <FiltroProdutoLinha
              key={idx}
              filtro={f}
              gruposAS={gruposAS}
              subgruposAS={subgruposAS}
              onChange={(patch) => updateFiltro(idx, patch)}
              onRemove={() => removeFiltro(idx)}
            />
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-5">
          <Label className="text-[10.5px] uppercase tracking-wide text-gray-500 mb-1 block">{campoLabel}</Label>
          <Select value={campo} onValueChange={(v) => setCampo(v as RegraCampo)}>
            <SelectTrigger>
              <SelectValue>
                <span className="inline-flex items-center gap-2">
                  <CampoIcone className="w-3.5 h-3.5 text-gray-500" />
                  {CAMPO_LABEL[campo]}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(['faturamento','quantidade','lucro','mix','atingimento_meta'] as RegraCampo[]).map(c => {
                const Icone = CAMPO_ICONE[c]
                return (
                  <SelectItem key={c} value={c}>
                    <span className="inline-flex items-center gap-2">
                      <Icone className="w-3.5 h-3.5" />
                      {CAMPO_LABEL[c]}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Escopo de agregação — vendedor (default) ou todos (gerente) */}
        <div className="md:col-span-7">
          <Label className="text-[10.5px] uppercase tracking-wide text-gray-500 mb-1 block">Calcular sobre</Label>
          <div className="flex items-center gap-1 p-1 bg-gray-50 border border-gray-200 rounded-md">
            <button
              type="button"
              onClick={() => setEscopo('vendedor')}
              className={cn(
                'flex-1 px-2 h-7 text-[11.5px] rounded',
                !escopoTodos ? 'bg-white text-gray-800 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Vendas do vendedor
            </button>
            <button
              type="button"
              onClick={() => setEscopo('todos')}
              className={cn(
                'flex-1 px-2 h-7 text-[11.5px] rounded',
                escopoTodos ? 'bg-white text-gray-800 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Vendas de TODOS os vendedores
            </button>
          </div>
          {escopoTodos && (
            <p className="text-[10px] text-amber-700 mt-1">
              ⚠ Agrega sobre o posto inteiro. Use para regras de gerente / supervisor que não vendem mas comissionam sobre o resultado do time.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Botão pill compacto usado no seletor de modo da Meta de referência.
function ModoBtn({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 rounded-md border text-[11.5px] font-semibold transition-colors',
        ativo
          ? 'bg-blue-600 text-white border-blue-700'
          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700',
      )}
    >
      {children}
    </button>
  )
}
