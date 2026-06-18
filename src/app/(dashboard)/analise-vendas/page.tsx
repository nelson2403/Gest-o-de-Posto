'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  TrendingUp, TrendingDown, DollarSign, Percent,
  Fuel, Receipt, Building2, ChevronDown, ChevronRight,
  Loader2, AlertTriangle, RefreshCw, BarChart2,
  ArrowUpRight, ArrowDownRight, Minus,
  Wrench, ShoppingBag, FolderTree,
} from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'
import type { VendaAnaliseProduto, VendaCombustivelMes } from '@/lib/autosystem'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Posto {
  id:                     string
  nome:                   string
  codigo_empresa_externo: string | null
  conveniencia?:          boolean | null
}

interface AnaliseData {
  kpis: { venda: number; custo: number; lucro: number; margem: number }
  porProduto: VendaAnaliseProduto[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtBRL  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct  = (v: number) => `${v.toFixed(1)}%`
const fmtQtd  = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtData = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const fmtIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Default: primeiro dia do mês corrente até hoje
function defaultPeriodo() {
  const hoje  = new Date()
  const ini   = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return { dataIni: fmtIsoDate(ini), dataFim: fmtIsoDate(hoje) }
}

// Para uma janela [dataIni, dataFim], computa a janela equivalente do mês
// anterior (mesmos dias do calendário, mês − 1). Quando o dia não existe no
// mês anterior (ex.: 31/03 → 31/02 não existe), faz o clamp pro último dia.
function periodoMesAnterior(dataIni: string, dataFim: string): { ini: string; fim: string } {
  const clampPrev = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number)
    const novoMes = m - 1
    const ano     = novoMes < 1 ? y - 1 : y
    const mesIdx  = novoMes < 1 ? 11    : novoMes - 1
    const ultDia  = new Date(ano, mesIdx + 1, 0).getDate()
    const dia     = Math.min(d, ultDia)
    return fmtIsoDate(new Date(ano, mesIdx, dia))
  }
  return { ini: clampPrev(dataIni), fim: clampPrev(dataFim) }
}

// Categorização baseada no AUTOSYSTEM:
//   • Combustíveis  = produto.tipo === 'C'
//   • Conveniência  = produto.tipo !== 'C' E grupo_produto.nome casa "conveniência"
//   • Automotivos   = produto.tipo !== 'C' E grupo_produto.nome NÃO é de conveniência
const CONVENIENCIA_REGEX = /conveni[eê]ncia/i
const isGrupoConveniencia = (g: string | null) => !!g && CONVENIENCIA_REGEX.test(g)

const isCombustivel  = (p: VendaAnaliseProduto) => p.tipo === 'C'
const isConveniencia = (p: VendaAnaliseProduto) => p.tipo !== 'C' && isGrupoConveniencia(p.grupo_nome)
const isAutomotivo   = (p: VendaAnaliseProduto) => p.tipo !== 'C' && !isGrupoConveniencia(p.grupo_nome)

type SubAba = 'combustiveis' | 'automotivos' | 'conveniencia'
const SUB_ABAS: { id: SubAba; label: string; icon: React.ElementType; filter: (p: VendaAnaliseProduto) => boolean }[] = [
  { id: 'combustiveis',  label: 'Combustíveis', icon: Fuel,        filter: isCombustivel  },
  { id: 'automotivos',   label: 'Automotivos',  icon: Wrench,      filter: isAutomotivo   },
  { id: 'conveniencia',  label: 'Conveniência', icon: ShoppingBag, filter: isConveniencia },
]

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface VariacaoInfo {
  // Valor do KPI no mês anterior, pra calcular variação. Quando null, a
  // comparação é considerada "não aplicável" (ex.: sem dados anteriores).
  anterior:        number | null
  atual:           number
  // Quando true, valores maiores são melhores (verde quando sobe).
  // Pra "margem" e similares isso é true; pra custos ou desvios seria false.
  maiorMelhor:     boolean
  // Pra valores em R$ ou litros, mostramos a diferença formatada também.
  formatarValor?:  (v: number) => string
}

interface KpiCardProps {
  title:     string
  value:     string
  sub?:      string
  icon:      React.ElementType
  cor:       'blue' | 'orange' | 'green' | 'rose' | 'purple'
  variacao?: VariacaoInfo
}

const KPI_CORES: Record<KpiCardProps['cor'], { bg: string; texto: string }> = {
  blue:   { bg: 'bg-blue-50',    texto: 'text-blue-600'    },
  orange: { bg: 'bg-orange-50',  texto: 'text-orange-600'  },
  green:  { bg: 'bg-emerald-50', texto: 'text-emerald-600' },
  rose:   { bg: 'bg-rose-50',    texto: 'text-rose-600'    },
  purple: { bg: 'bg-purple-50',  texto: 'text-purple-600'  },
}

function VariacaoChip({ info }: { info: VariacaoInfo }) {
  if (info.anterior == null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-medium">
        <Minus className="w-2.5 h-2.5" />
        Sem dados do mês anterior
      </span>
    )
  }
  const diff = info.atual - info.anterior
  const pct  = info.anterior !== 0 ? (diff / Math.abs(info.anterior)) * 100 : 0
  const subiu     = diff > 0
  const desceu    = diff < 0
  const positivo  = info.maiorMelhor ? subiu : desceu
  const negativo  = info.maiorMelhor ? desceu : subiu
  const cor       = positivo ? 'text-emerald-600 bg-emerald-50' :
                    negativo ? 'text-rose-600 bg-rose-50'       :
                               'text-gray-500 bg-gray-100'
  const Icon      = subiu ? ArrowUpRight : desceu ? ArrowDownRight : Minus
  const sinal     = pct >= 0 ? '+' : ''
  const fmtPctVal = `${sinal}${pct.toFixed(1)}%`
  const fmtDiff   = info.formatarValor
    ? `${sinal}${info.formatarValor(Math.abs(diff))}`
    : null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded',
        cor,
      )}
      title={`Mês anterior: ${info.formatarValor ? info.formatarValor(info.anterior) : info.anterior.toLocaleString('pt-BR')}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {fmtPctVal}
      {fmtDiff && <span className="opacity-70 font-normal">({fmtDiff})</span>}
    </span>
  )
}

function KpiCard({ title, value, sub, icon: Icon, cor, variacao }: KpiCardProps) {
  const c = KPI_CORES[cor]
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
              {title}
            </p>
            <p className="text-[18px] sm:text-[22px] font-bold text-gray-900 mt-1 leading-none tabular-nums">
              {value}
            </p>
            {variacao && (
              <div className="mt-1.5">
                <VariacaoChip info={variacao} />
              </div>
            )}
            {sub && (
              <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1.5">{sub}</p>
            )}
          </div>
          <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0', c.bg)}>
            <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', c.texto)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AnaliseVendasPage() {
  const { dataIni: iniDefault, dataFim: fimDefault } = defaultPeriodo()

  const [postos,         setPostos]         = useState<Posto[]>([])
  const [postoIds,       setPostoIds]       = useState<Set<string>>(new Set())
  const [dropOpen,       setDropOpen]       = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dataIni,        setDataIni]        = useState(iniDefault)
  const [dataFim,        setDataFim]        = useState(fimDefault)

  const [data,           setData]           = useState<AnaliseData | null>(null)
  const [dataPrev,       setDataPrev]       = useState<AnaliseData | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [erro,           setErro]           = useState<string | null>(null)
  const [subAba,         setSubAba]         = useState<SubAba>('combustiveis')

  // ── Gráfico Combustíveis (12 meses) ───────────────────────────────────
  const [combustivelId,   setCombustivelId]   = useState<number | null>(null)  // null = todos
  const [historico,       setHistorico]       = useState<VendaCombustivelMes[]>([])
  const [loadingChart,    setLoadingChart]    = useState(false)
  const [erroChart,       setErroChart]       = useState<string | null>(null)

  // Carrega postos (com codigo_empresa_externo) e seleciona todos por default
  useEffect(() => {
    const sb = createClient()
    sb.from('postos')
      .select('id, nome, codigo_empresa_externo, conveniencia')
      .not('codigo_empresa_externo', 'is', null)
      .order('nome')
      .then(({ data }) => {
        const lista = (data ?? []) as Posto[]
        setPostos(lista)
        setPostoIds(new Set(lista.map(p => p.id)))
      })
  }, [])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!dropOpen) return
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [dropOpen])

  // Carrega análise (período atual + mês anterior em paralelo)
  const carregar = useCallback(async () => {
    if (postoIds.size === 0 || !dataIni || !dataFim) {
      setData(null)
      setDataPrev(null)
      return
    }
    const empresaIds = postos
      .filter(p => postoIds.has(p.id) && p.codigo_empresa_externo)
      .map(p => p.codigo_empresa_externo!)
      .join(',')
    if (!empresaIds) {
      setErro('Nenhum posto selecionado possui código de empresa AUTOSYSTEM.')
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const prev = periodoMesAnterior(dataIni, dataFim)

      const fetchPeriodo = async (ini: string, fim: string): Promise<AnaliseData | null> => {
        // `breakdown=empresa` faz a API quebrar `porProduto` em linhas por
        // (produto, empresa). A página re-agrega por produto p/ as visões
        // que precisam de uma linha por produto (Combustíveis/Automotivos),
        // e usa o breakdown na árvore de Conveniência com múltiplas empresas.
        const params = new URLSearchParams({ empresaIds, dataIni: ini, dataFim: fim, breakdown: 'empresa' })
        const res    = await fetch(`/api/analise-vendas?${params}`)
        const json   = await res.json()
        if (!res.ok || json.error) throw new Error(json.error ?? `Erro HTTP ${res.status}`)
        return json as AnaliseData
      }

      const [atual, anterior] = await Promise.all([
        fetchPeriodo(dataIni, dataFim),
        fetchPeriodo(prev.ini, prev.fim).catch(() => null),  // anterior é opcional
      ])
      setData(atual)
      setDataPrev(anterior)
    } catch (e: any) {
      setErro(e.message ?? 'Erro inesperado')
      setData(null)
      setDataPrev(null)
    } finally {
      setLoading(false)
    }
  }, [postos, postoIds, dataIni, dataFim])

  // Auto-fetch ao mudar filtros (após postos carregados)
  useEffect(() => {
    if (postos.length === 0) return
    carregar()
  }, [carregar, postos.length])

  // Buscar histórico de 12 meses do gráfico de combustíveis.
  // Período da requisição: últimos 12 meses calendário terminando no mês de
  // `dataFim` do dashboard — independente de qual mês ele esteja olhando.
  const carregarHistorico = useCallback(async () => {
    if (subAba !== 'combustiveis' || postoIds.size === 0 || !dataFim) {
      setHistorico([])
      return
    }
    const empresaIds = postos
      // Histórico de combustíveis: ignora lojas de conveniência (sem combustível)
      .filter(p => postoIds.has(p.id) && p.codigo_empresa_externo && !p.conveniencia)
      .map(p => p.codigo_empresa_externo!)
      .join(',')
    if (!empresaIds) return

    // Calcula janela de 12 meses calendário (ex.: dataFim 2026-05-31 →
    // dataIni = 2025-06-01)
    const [yF, mF] = dataFim.split('-').map(Number)
    const inicioMesFim = new Date(yF, (mF - 1), 1)
    const inicio12     = new Date(inicioMesFim.getFullYear(), inicioMesFim.getMonth() - 11, 1)
    const histIni      = fmtIsoDate(inicio12)
    const histFim      = dataFim

    setLoadingChart(true)
    setErroChart(null)
    try {
      const params = new URLSearchParams({ empresaIds, dataIni: histIni, dataFim: histFim })
      if (combustivelId) params.set('produtoId', String(combustivelId))
      const res  = await fetch(`/api/analise-vendas/combustiveis-historico?${params}`)
      const json = await res.json()
      if (!res.ok || json.error) {
        setErroChart(json.error ?? `Erro HTTP ${res.status}`)
        setHistorico([])
      } else {
        setHistorico(json.porMes ?? [])
      }
    } catch (e: any) {
      setErroChart(e.message ?? 'Erro inesperado')
    } finally {
      setLoadingChart(false)
    }
  }, [subAba, postos, postoIds, dataFim, combustivelId])

  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  // ── Métricas derivadas ──────────────────────────────────────────────────
  function calcMetricas(d: AnaliseData | null) {
    if (!d) return null
    const { venda, custo, lucro, margem } = d.kpis
    const litros = d.porProduto
      .filter(p => isCombustivel(p))
      .reduce((s, p) => s + (p.qtd ?? 0), 0)
    const ticketMedio = litros > 0 ? venda / litros : 0
    return { venda, custo, lucro, margem, litros, ticketMedio }
  }
  const metricas    = useMemo(() => calcMetricas(data),     [data])
  const metricasPrv = useMemo(() => calcMetricas(dataPrev), [dataPrev])

  // Produtos filtrados pela aba ativa + agregados (totais da aba)
  // `porProduto` agora vem com breakdown por empresa (uma linha por
  // produto×empresa). `produtosAbaRaw` mantém essas linhas para a árvore
  // de Conveniência com múltiplas empresas; `produtosAba` agrega tudo
  // numa linha por produto (Combustíveis flat, Automotivos tree, KPIs da aba).
  const abaConfig = SUB_ABAS.find(a => a.id === subAba)!
  const produtosAbaRaw = useMemo(() => {
    if (!data) return []
    return data.porProduto.filter(p => abaConfig.filter(p))
  }, [data, abaConfig])

  const produtosAba = useMemo(() => {
    const map = new Map<number, VendaAnaliseProduto>()
    for (const p of produtosAbaRaw) {
      const ex = map.get(p.produto)
      if (ex) {
        ex.qtd            = (ex.qtd ?? 0) + (p.qtd ?? 0)
        ex.venda          += p.venda
        ex.custo          += p.custo
        ex.total_desconto += p.total_desconto ?? 0
      } else {
        map.set(p.produto, { ...p, empresa_id: null })
      }
    }
    // Re-calcula derivados a partir dos somatórios
    return Array.from(map.values())
      .map(p => ({
        ...p,
        preco_medio:    (p.qtd ?? 0) > 0 ? p.venda / (p.qtd as number) : 0,
        custo_unitario: (p.qtd ?? 0) > 0 ? p.custo / (p.qtd as number) : 0,
      }))
      .sort((a, b) => b.venda - a.venda)
  }, [produtosAbaRaw])

  const totaisAba = useMemo(() => {
    const venda = produtosAba.reduce((s, p) => s + p.venda, 0)
    const custo = produtosAba.reduce((s, p) => s + p.custo, 0)
    const qtd   = produtosAba.reduce((s, p) => s + (p.qtd ?? 0), 0)
    const lucro = venda - custo
    const margem = venda > 0 ? (lucro / venda) * 100 : 0
    return { venda, custo, qtd, lucro, margem, qtdProdutos: produtosAba.length }
  }, [produtosAba])

  // Tree (grupo → produto) usada na aba Automotivos
  const produtosPorGrupo = useMemo(() => {
    const map = new Map<string, VendaAnaliseProduto[]>()
    for (const p of produtosAba) {
      const grupo = p.grupo_nome?.trim() || '(sem grupo)'
      if (!map.has(grupo)) map.set(grupo, [])
      map.get(grupo)!.push(p)
    }
    const grupos = Array.from(map.entries()).map(([nome, produtos]) => {
      const venda  = produtos.reduce((s, p) => s + p.venda, 0)
      const custo  = produtos.reduce((s, p) => s + p.custo, 0)
      const qtd    = produtos.reduce((s, p) => s + (p.qtd ?? 0), 0)
      const lucro  = venda - custo
      const margem = venda > 0 ? (lucro / venda) * 100 : 0
      const ordenado = [...produtos].sort((a, b) => b.venda - a.venda)
      return { nome, produtos: ordenado, venda, custo, qtd, lucro, margem }
    })
    grupos.sort((a, b) => b.venda - a.venda)
    return grupos
  }, [produtosAba])

  // Mapa rápido: codigo_empresa_externo (number) → nome do posto.
  // Usado pela árvore de Conveniência em modo multi-empresa.
  const postoNomePorEmpresaId = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of postos) {
      if (!p.codigo_empresa_externo) continue
      const id = Number(p.codigo_empresa_externo)
      if (!isNaN(id)) map.set(id, p.nome)
    }
    return map
  }, [postos])

  const conveMulti = subAba === 'conveniencia' && postoIds.size > 1

  function agregarProds(produtos: VendaAnaliseProduto[]) {
    const venda  = produtos.reduce((s, p) => s + p.venda, 0)
    const custo  = produtos.reduce((s, p) => s + p.custo, 0)
    const qtd    = produtos.reduce((s, p) => s + (p.qtd ?? 0), 0)
    const lucro  = venda - custo
    const margem = venda > 0 ? (lucro / venda) * 100 : 0
    return { venda, custo, qtd, lucro, margem }
  }

  // Conveniência — modo single empresa: Subgrupo → Produto
  const conveSubgrupos = useMemo(() => {
    if (subAba !== 'conveniencia' || conveMulti) return []
    const subMap = new Map<string, VendaAnaliseProduto[]>()
    for (const p of produtosAba) {
      const sub = p.subgrupo_nome?.trim() || '(sem subgrupo)'
      if (!subMap.has(sub)) subMap.set(sub, [])
      subMap.get(sub)!.push(p)
    }
    const subgrupos = Array.from(subMap.entries()).map(([nome, prods]) => {
      const ordenado = [...prods].sort((a, b) => b.venda - a.venda)
      return { nome, produtos: ordenado, ...agregarProds(prods) }
    })
    subgrupos.sort((a, b) => b.venda - a.venda)
    return subgrupos
  }, [subAba, conveMulti, produtosAba])

  // Conveniência — modo multi empresa: Empresa → Subgrupo → Produto.
  // Usa `produtosAbaRaw` (linhas per-empresa-produto) e agrega só por
  // (empresa, subgrupo, produto) — sem cross-empresa.
  const conveEmpresas = useMemo(() => {
    if (subAba !== 'conveniencia' || !conveMulti) return []
    type Subgrupo = { nome: string; produtos: VendaAnaliseProduto[] }
    const empresaMap = new Map<number, Map<string, Map<number, VendaAnaliseProduto>>>()
    for (const p of produtosAbaRaw) {
      const eid = p.empresa_id ?? 0
      const sub = p.subgrupo_nome?.trim() || '(sem subgrupo)'
      if (!empresaMap.has(eid)) empresaMap.set(eid, new Map())
      const subMap = empresaMap.get(eid)!
      if (!subMap.has(sub)) subMap.set(sub, new Map())
      const prodMap = subMap.get(sub)!
      const ex = prodMap.get(p.produto)
      if (ex) {
        ex.qtd            = (ex.qtd ?? 0) + (p.qtd ?? 0)
        ex.venda          += p.venda
        ex.custo          += p.custo
        ex.total_desconto += p.total_desconto ?? 0
      } else {
        prodMap.set(p.produto, { ...p })
      }
    }
    const empresas = Array.from(empresaMap.entries()).map(([empresaId, subMap]) => {
      const subgrupos: (Subgrupo & ReturnType<typeof agregarProds>)[] = Array.from(subMap.entries()).map(([nome, prodMap]) => {
        const prods = Array.from(prodMap.values()).sort((a, b) => b.venda - a.venda)
        return { nome, produtos: prods, ...agregarProds(prods) }
      })
      subgrupos.sort((a, b) => b.venda - a.venda)
      const todosProds = subgrupos.flatMap(s => s.produtos)
      const nomeEmpresa = postoNomePorEmpresaId.get(empresaId) ?? `Empresa ${empresaId}`
      return { empresaId, nome: nomeEmpresa, subgrupos, qtdProdutos: todosProds.length, ...agregarProds(todosProds) }
    })
    empresas.sort((a, b) => b.venda - a.venda)
    return empresas
  }, [subAba, conveMulti, produtosAbaRaw, postoNomePorEmpresaId])

  // Estados de expansão.
  //   - `gruposAbertos`: top-level. Em Automotivos é o nome do grupo; em
  //     Conveniência single é o nome do subgrupo; em Conveniência multi é
  //     o id da empresa (stringificado).
  //   - `subgruposAbertos`: 2º nível, usado apenas na Conveniência multi
  //     (chave = `${empresaId}::${subgrupo}`).
  const [gruposAbertos, setGruposAbertos]       = useState<Set<string>>(new Set())
  const [subgruposAbertos, setSubgruposAbertos] = useState<Set<string>>(new Set())
  function toggleGrupo(chave: string) {
    setGruposAbertos(prev => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave); else next.add(chave)
      return next
    })
  }
  function toggleSubgrupo(chave: string) {
    setSubgruposAbertos(prev => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave); else next.add(chave)
      return next
    })
  }
  function expandirTodos() {
    if (subAba === 'conveniencia') {
      if (conveMulti) {
        const empresas    = conveEmpresas.map(e => String(e.empresaId))
        const empSubs     = conveEmpresas.flatMap(e => e.subgrupos.map(s => `${e.empresaId}::${s.nome}`))
        setGruposAbertos(new Set(empresas))
        setSubgruposAbertos(new Set(empSubs))
      } else {
        setGruposAbertos(new Set(conveSubgrupos.map(s => s.nome)))
        setSubgruposAbertos(new Set())
      }
    } else {
      setGruposAbertos(new Set(produtosPorGrupo.map(g => g.nome)))
      setSubgruposAbertos(new Set())
    }
  }
  function recolherTodos() {
    setGruposAbertos(new Set())
    setSubgruposAbertos(new Set())
  }

  // Combustíveis disponíveis (para o seletor do gráfico) — dedup por produto
  // pois `porProduto` vem com breakdown por empresa.
  const combustiveisDisponiveis = useMemo(() => {
    if (!data) return []
    const map = new Map<number, VendaAnaliseProduto>()
    for (const p of data.porProduto) {
      if (p.tipo !== 'C') continue
      const ex = map.get(p.produto)
      if (ex) ex.venda += p.venda
      else    map.set(p.produto, { ...p })
    }
    return Array.from(map.values()).sort((a, b) => b.venda - a.venda)
  }, [data])

  // Prepara série do gráfico: 12 meses preenchidos (zera meses sem venda),
  // calcula lucro = venda - custo e variação mês-a-mês em litros.
  const chartData = useMemo(() => {
    if (!dataFim) return []
    // Lista de 12 meses YYYY-MM terminando no mês de dataFim
    const [yF, mF] = dataFim.split('-').map(Number)
    const meses: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(yF, (mF - 1) - i, 1)
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const map = new Map(historico.map(h => [h.mes, h]))
    const MES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return meses.map((mes, i) => {
      const h     = map.get(mes)
      const litros = h?.litros ?? 0
      const venda  = h?.venda  ?? 0
      const custo  = h?.custo  ?? 0
      const lucro  = venda - custo
      // Lucro bruto por litro (R$/L) — null quando não houve litros
      const lucroPorLitro = litros > 0 ? lucro / litros : 0
      // Variação em litros vs. mês anterior do array
      let variacao: number | null = null
      if (i > 0) {
        const ant = map.get(meses[i - 1])
        const antL = ant?.litros ?? 0
        if (antL > 0) variacao = ((litros - antL) / antL) * 100
        else if (litros > 0) variacao = 100
      }
      const [y, m] = mes.split('-').map(Number)
      const label  = `${MES_LABEL[m - 1]}/${String(y).slice(2)}`
      return { mes, label, litros, venda, custo, lucro, lucroPorLitro, variacao }
    })
  }, [historico, dataFim])

  const contagemPorAba = useMemo(() => {
    const out: Record<SubAba, number> = { combustiveis: 0, automotivos: 0, conveniencia: 0 }
    if (!data) return out
    // Dedup por produto — `porProduto` vem com breakdown por empresa.
    const visto = new Set<number>()
    for (const p of data.porProduto) {
      if (visto.has(p.produto)) continue
      visto.add(p.produto)
      for (const a of SUB_ABAS) {
        if (a.filter(p)) { out[a.id]++; break }
      }
    }
    return out
  }, [data])

  // ── Label do botão multi-select ─────────────────────────────────────────
  const empresasLabel = useMemo(() => {
    if (postoIds.size === 0) return 'Selecione empresas'
    if (postoIds.size === postos.length) return `Todas (${postos.length})`
    if (postoIds.size === 1) {
      const p = postos.find(x => postoIds.has(x.id))
      return p?.nome ?? '1 empresa'
    }
    return `${postoIds.size} empresas`
  }, [postos, postoIds])

  function toggleAll() {
    if (postoIds.size === postos.length) setPostoIds(new Set())
    else setPostoIds(new Set(postos.map(p => p.id)))
  }

  function togglePosto(id: string) {
    setPostoIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header + Filtros (mesma div) ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-2 min-h-[52px] bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200/80 dark:border-gray-800 flex-shrink-0">
        {/* Título + descrição */}
        <div className="flex-1 min-w-[160px]">
          <h1 className="text-[14px] md:text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">
            Análise de Vendas
          </h1>
          <p className="hidden sm:block text-[11px] text-gray-400 dark:text-gray-500 leading-tight truncate">
            Dashboard de KPIs do período
          </p>
        </div>

        {/* Filtros — inline */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">

          {/* Multi-select de empresas */}
          <div className="relative" ref={dropRef}>
            <button
              type="button"
              onClick={() => setDropOpen(o => !o)}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white shadow-sm text-[12.5px] text-left flex items-center justify-between gap-2 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-orange-400/30"
              title="Selecionar empresas"
            >
              <span className="flex items-center gap-1.5 truncate text-gray-700">
                <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {empresasLabel}
              </span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0', dropOpen && 'rotate-180')} />
            </button>
            {dropOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-2 min-w-[280px] max-h-72 overflow-y-auto">
                <button
                  onClick={toggleAll}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors',
                    postoIds.size === postos.length
                      ? 'bg-orange-50 text-orange-600'
                      : 'hover:bg-gray-50 text-gray-700',
                  )}
                >
                  {postoIds.size === postos.length ? '✓ Todas selecionadas' : 'Selecionar todas'}
                </button>
                <div className="h-px bg-gray-100 my-1.5" />
                {postos.map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={postoIds.has(p.id)}
                      onChange={() => togglePosto(p.id)}
                      className="accent-orange-500 w-3.5 h-3.5"
                    />
                    <span className="text-[12.5px] text-gray-700 truncate">
                      {p.nome}
                      {p.conveniencia && <span className="ml-1.5 text-[10px] text-amber-600">(conv.)</span>}
                    </span>
                  </label>
                ))}
                {postos.length === 0 && (
                  <p className="px-3 py-3 text-[12px] text-gray-400 italic">Nenhum posto com código AUTOSYSTEM</p>
                )}
              </div>
            )}
          </div>

          {/* Datas De → Até */}
          <input
            type="date"
            value={dataIni}
            onChange={e => setDataIni(e.target.value)}
            title="Data inicial"
            className="h-9 px-2.5 rounded-lg border border-gray-200 bg-white shadow-sm text-[12.5px] focus:outline-none focus:ring-2 focus:ring-orange-400/30"
          />
          <span className="text-gray-400 text-[11px]">→</span>
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            title="Data final"
            className="h-9 px-2.5 rounded-lg border border-gray-200 bg-white shadow-sm text-[12.5px] focus:outline-none focus:ring-2 focus:ring-orange-400/30"
          />

          {/* Atualizar */}
          <button
            onClick={carregar}
            disabled={loading || postoIds.size === 0}
            className="h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12.5px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* ── Erro ── */}
        {erro && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Erro ao carregar</p>
              <p className="text-[12px] opacity-80">{erro}</p>
            </div>
            <button onClick={carregar} className="text-[12px] font-medium underline">Tentar novamente</button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-[13px]">Carregando dados do AUTOSYSTEM…</span>
          </div>
        )}

        {/* ── Empty (postos não carregados) ── */}
        {!loading && !erro && !data && postos.length > 0 && postoIds.size === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <Building2 className="w-6 h-6 text-orange-300" />
            </div>
            <p className="text-[13px] font-medium text-gray-500">Selecione ao menos uma empresa</p>
          </div>
        )}

        {/* ── KPIs ── */}
        {!loading && data && metricas && (
          <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              title="Litros vendidos"
              value={fmtQtd(metricas.litros) + ' L'}
              icon={Fuel}
              cor="blue"
              sub={metricas.litros > 0 ? 'Combustíveis identificados' : 'Sem combustível no período'}
              variacao={{
                anterior:      metricasPrv?.litros ?? null,
                atual:         metricas.litros,
                maiorMelhor:   true,
                formatarValor: v => `${fmtQtd(v)} L`,
              }}
            />
            <KpiCard
              title="Faturamento"
              value={fmtBRL(metricas.venda)}
              icon={DollarSign}
              cor="orange"
              sub="Soma das vendas"
              variacao={{
                anterior:      metricasPrv?.venda ?? null,
                atual:         metricas.venda,
                maiorMelhor:   true,
                formatarValor: fmtBRL,
              }}
            />
            <KpiCard
              title="Lucro Bruto"
              value={fmtBRL(metricas.lucro)}
              icon={metricas.lucro >= 0 ? TrendingUp : TrendingDown}
              cor={metricas.lucro >= 0 ? 'green' : 'rose'}
              sub={metricas.lucro >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
              variacao={{
                anterior:      metricasPrv?.lucro ?? null,
                atual:         metricas.lucro,
                maiorMelhor:   true,
                formatarValor: fmtBRL,
              }}
            />
            <KpiCard
              title="Margem Bruta"
              value={fmtPct(metricas.margem)}
              icon={Percent}
              cor="purple"
              sub={`sobre R$ ${(metricas.venda / 1000).toFixed(0)}k faturado`}
              variacao={{
                anterior:      metricasPrv?.margem ?? null,
                atual:         metricas.margem,
                maiorMelhor:   true,
                formatarValor: v => `${v.toFixed(1)} p.p.`,
              }}
            />
            <KpiCard
              title="Ticket Médio"
              value={metricas.litros > 0 ? fmtBRL(metricas.ticketMedio) : '—'}
              icon={Receipt}
              cor="rose"
              sub={metricas.litros > 0 ? 'Preço médio por litro' : 'Disponível com combustíveis'}
              variacao={metricas.litros > 0 ? {
                anterior:      (metricasPrv?.ticketMedio && metricasPrv.litros > 0) ? metricasPrv.ticketMedio : null,
                atual:         metricas.ticketMedio,
                maiorMelhor:   true,
                formatarValor: fmtBRL,
              } : undefined}
            />
          </div>

          {/* ── Abas: Combustíveis / Automotivos / Conveniência ── */}
          <div>
            <div className="flex flex-wrap gap-1 border-b border-gray-200">
              {SUB_ABAS.map(({ id, label, icon: Icon }) => {
                const ativo = subAba === id
                const qtd   = contagemPorAba[id]
                return (
                  <button
                    key={id}
                    onClick={() => setSubAba(id)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                      ativo
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-900',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    <span className={cn(
                      'text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full',
                      ativo ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {qtd}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Mini-KPIs da aba (sub-totais) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <MiniKpi
                title={`${abaConfig.label} — ${totaisAba.qtdProdutos} produto${totaisAba.qtdProdutos === 1 ? '' : 's'}`}
                value={fmtBRL(totaisAba.venda)}
                sub="Faturamento"
                cor="orange"
              />
              <MiniKpi title="Custo" value={fmtBRL(totaisAba.custo)} sub="Total no período" cor="gray" />
              <MiniKpi
                title="Lucro Bruto"
                value={fmtBRL(totaisAba.lucro)}
                sub={`Margem ${fmtPct(totaisAba.margem)}`}
                cor={totaisAba.lucro >= 0 ? 'green' : 'rose'}
              />
              <MiniKpi
                title="Quantidade"
                value={`${fmtQtd(totaisAba.qtd)}${subAba === 'combustiveis' ? ' L' : ' un'}`}
                sub={subAba === 'combustiveis' ? 'Litros vendidos' : 'Unidades vendidas'}
                cor="blue"
              />
            </div>

            {/* Tabela / Tree de produtos da aba */}
            <Card className="border-gray-200 shadow-sm mt-4">
              <CardContent className="p-0">
                {/* Aba Conveniência: 1 empresa → Subgrupo → Produto; multi empresas → Empresa → Subgrupo → Produto */}
                {subAba === 'conveniencia' ? (
                  conveMulti ? (
                    /* ── Multi empresa: Empresa → Subgrupo → Produto ── */
                    <>
                      {conveEmpresas.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                          <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                            <FolderTree className="w-3.5 h-3.5 text-gray-400" />
                            {conveEmpresas.length} empresa{conveEmpresas.length === 1 ? '' : 's'} ·{' '}
                            {conveEmpresas.reduce((s, e) => s + e.subgrupos.length, 0)} subgrupo{conveEmpresas.reduce((s, e) => s + e.subgrupos.length, 0) === 1 ? '' : 's'} ·{' '}
                            {produtosAba.length} produto{produtosAba.length === 1 ? '' : 's'}
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button onClick={expandirTodos} className="text-orange-600 hover:text-orange-700 font-medium">Expandir todos</button>
                            <span className="text-gray-300">·</span>
                            <button onClick={recolherTodos} className="text-gray-500 hover:text-gray-700 font-medium">Recolher todos</button>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-[12.5px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left  px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Empresa / Subgrupo / Produto</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Qtd</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-32">Faturamento</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Custo</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Lucro</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20">Margem</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 hidden lg:table-cell">Preço méd</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 hidden lg:table-cell">Custo méd</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 hidden lg:table-cell">Lucro un.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {conveEmpresas.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-gray-400 italic">
                                  Sem produtos de conveniência no período selecionado
                                </td>
                              </tr>
                            ) : conveEmpresas.map(e => {
                              const empKey   = String(e.empresaId)
                              const empOpen  = gruposAbertos.has(empKey)
                              const corE     = e.margem >= 20 ? 'text-emerald-600' : e.margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                              return (
                                <Fragment key={empKey}>
                                  <tr
                                    onClick={() => toggleGrupo(empKey)}
                                    className="bg-gray-100/70 hover:bg-gray-100 cursor-pointer border-y border-gray-200/70"
                                  >
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-2">
                                        {empOpen
                                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
                                        <Building2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                        <span className="font-bold text-gray-800 truncate">{e.nome}</span>
                                        <span className="text-[10.5px] text-gray-400 font-normal">
                                          ({e.subgrupos.length} subgrupo{e.subgrupos.length === 1 ? '' : 's'} · {e.qtdProdutos} produto{e.qtdProdutos === 1 ? '' : 's'})
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold">{fmtQtd(e.qtd)}</td>
                                    <td className="px-4 py-2 text-right text-gray-900 tabular-nums font-bold">{fmtBRL(e.venda)}</td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold hidden sm:table-cell">{fmtBRL(e.custo)}</td>
                                    <td className={cn('px-4 py-2 text-right tabular-nums font-bold hidden sm:table-cell', e.lucro >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                                      {fmtBRL(e.lucro)}
                                    </td>
                                    <td className={cn('px-4 py-2 text-right tabular-nums font-bold', corE)}>{fmtPct(e.margem)}</td>
                                    {/* Médias ponderadas — ratios sobre os totais agregados da empresa */}
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold hidden lg:table-cell">
                                      {e.qtd > 0 ? fmtBRL(e.venda / e.qtd) : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums hidden lg:table-cell">
                                      {e.qtd > 0 ? fmtBRL(e.custo / e.qtd) : '—'}
                                    </td>
                                    <td className={cn('px-4 py-2 text-right tabular-nums font-semibold hidden lg:table-cell', e.lucro >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                                      {e.qtd > 0 ? fmtBRL(e.lucro / e.qtd) : '—'}
                                    </td>
                                  </tr>

                                  {empOpen && e.subgrupos.map(s => {
                                    const subKey  = `${e.empresaId}::${s.nome}`
                                    const subOpen = subgruposAbertos.has(subKey)
                                    const corS    = s.margem >= 20 ? 'text-emerald-600' : s.margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                                    return (
                                      <Fragment key={subKey}>
                                        <tr
                                          onClick={() => toggleSubgrupo(subKey)}
                                          className="bg-gray-50/40 hover:bg-gray-100/50 cursor-pointer"
                                        >
                                          <td className="px-4 py-1.5 pl-10">
                                            <div className="flex items-center gap-2">
                                              {subOpen
                                                ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                                              <span className="font-semibold text-gray-700 truncate">{s.nome}</span>
                                              <span className="text-[10.5px] text-gray-400 font-normal">
                                                ({s.produtos.length} produto{s.produtos.length === 1 ? '' : 's'})
                                              </span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-1.5 text-right text-gray-700 tabular-nums font-medium">{fmtQtd(s.qtd)}</td>
                                          <td className="px-4 py-1.5 text-right text-gray-800 tabular-nums font-semibold">{fmtBRL(s.venda)}</td>
                                          <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(s.custo)}</td>
                                          <td className={cn('px-4 py-1.5 text-right tabular-nums font-semibold hidden sm:table-cell', s.lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                            {fmtBRL(s.lucro)}
                                          </td>
                                          <td className={cn('px-4 py-1.5 text-right tabular-nums font-semibold', corS)}>{fmtPct(s.margem)}</td>
                                          <td className="px-4 py-1.5 text-right text-gray-700 tabular-nums font-medium hidden lg:table-cell">
                                            {s.qtd > 0 ? fmtBRL(s.venda / s.qtd) : '—'}
                                          </td>
                                          <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden lg:table-cell">
                                            {s.qtd > 0 ? fmtBRL(s.custo / s.qtd) : '—'}
                                          </td>
                                          <td className={cn('px-4 py-1.5 text-right tabular-nums font-medium hidden lg:table-cell', s.lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                            {s.qtd > 0 ? fmtBRL(s.lucro / s.qtd) : '—'}
                                          </td>
                                        </tr>

                                        {subOpen && s.produtos.map(p => {
                                          const lucro  = p.venda - p.custo
                                          const margem = p.venda > 0 ? (lucro / p.venda) * 100 : 0
                                          const corMP  = margem >= 20 ? 'text-emerald-600' : margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                                          return (
                                            <tr key={`${e.empresaId}-${p.produto}`} className="hover:bg-orange-50/30 transition-colors">
                                              <td className="px-4 py-1.5 text-gray-700 max-w-[280px] truncate pl-16">
                                                {p.produto_nome}
                                              </td>
                                              <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums">{fmtQtd(p.qtd ?? 0)}</td>
                                              <td className="px-4 py-1.5 text-right text-gray-800 tabular-nums">{fmtBRL(p.venda)}</td>
                                              <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(p.custo)}</td>
                                              <td className={cn('px-4 py-1.5 text-right tabular-nums hidden sm:table-cell', lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                                {fmtBRL(lucro)}
                                              </td>
                                              <td className={cn('px-4 py-1.5 text-right tabular-nums font-semibold', corMP)}>{fmtPct(margem)}</td>
                                              <td className="px-4 py-1.5 text-right text-gray-700 tabular-nums hidden lg:table-cell">
                                                {(p.qtd ?? 0) > 0 ? fmtBRL(p.venda / (p.qtd as number)) : '—'}
                                              </td>
                                              <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden lg:table-cell">
                                                {(p.qtd ?? 0) > 0 ? fmtBRL(p.custo / (p.qtd as number)) : '—'}
                                              </td>
                                              <td className={cn('px-4 py-1.5 text-right tabular-nums hidden lg:table-cell', lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                                {(p.qtd ?? 0) > 0 ? fmtBRL(lucro / (p.qtd as number)) : '—'}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </Fragment>
                                    )
                                  })}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    /* ── Single empresa: Subgrupo → Produto ── */
                    <>
                      {conveSubgrupos.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                          <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                            <FolderTree className="w-3.5 h-3.5 text-gray-400" />
                            {conveSubgrupos.length} subgrupo{conveSubgrupos.length === 1 ? '' : 's'} · {produtosAba.length} produto{produtosAba.length === 1 ? '' : 's'}
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button onClick={expandirTodos} className="text-orange-600 hover:text-orange-700 font-medium">Expandir todos</button>
                            <span className="text-gray-300">·</span>
                            <button onClick={recolherTodos} className="text-gray-500 hover:text-gray-700 font-medium">Recolher todos</button>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-[12.5px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left  px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Subgrupo / Produto</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Qtd</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-32">Faturamento</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Custo</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Lucro</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20">Margem</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 hidden lg:table-cell">Preço méd</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 hidden lg:table-cell">Custo méd</th>
                              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 hidden lg:table-cell">Lucro un.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {conveSubgrupos.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-gray-400 italic">
                                  Sem produtos de conveniência no período selecionado
                                </td>
                              </tr>
                            ) : conveSubgrupos.map(s => {
                              const isOpen = gruposAbertos.has(s.nome)
                              const corM   = s.margem >= 20 ? 'text-emerald-600' : s.margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                              return (
                                <Fragment key={s.nome}>
                                  <tr
                                    onClick={() => toggleGrupo(s.nome)}
                                    className="bg-gray-50/60 hover:bg-gray-100/60 cursor-pointer border-y border-gray-200/70"
                                  >
                                    <td className="px-4 py-2">
                                      <div className="flex items-center gap-2">
                                        {isOpen
                                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
                                        <span className="font-bold text-gray-800 truncate">{s.nome}</span>
                                        <span className="text-[10.5px] text-gray-400 font-normal">
                                          ({s.produtos.length} produto{s.produtos.length === 1 ? '' : 's'})
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold">{fmtQtd(s.qtd)}</td>
                                    <td className="px-4 py-2 text-right text-gray-900 tabular-nums font-bold">{fmtBRL(s.venda)}</td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold hidden sm:table-cell">{fmtBRL(s.custo)}</td>
                                    <td className={cn('px-4 py-2 text-right tabular-nums font-bold hidden sm:table-cell', s.lucro >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                                      {fmtBRL(s.lucro)}
                                    </td>
                                    <td className={cn('px-4 py-2 text-right tabular-nums font-bold', corM)}>{fmtPct(s.margem)}</td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold hidden lg:table-cell">
                                      {s.qtd > 0 ? fmtBRL(s.venda / s.qtd) : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums hidden lg:table-cell">
                                      {s.qtd > 0 ? fmtBRL(s.custo / s.qtd) : '—'}
                                    </td>
                                    <td className={cn('px-4 py-2 text-right tabular-nums font-semibold hidden lg:table-cell', s.lucro >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                                      {s.qtd > 0 ? fmtBRL(s.lucro / s.qtd) : '—'}
                                    </td>
                                  </tr>

                                  {isOpen && s.produtos.map(p => {
                                    const lucro  = p.venda - p.custo
                                    const margem = p.venda > 0 ? (lucro / p.venda) * 100 : 0
                                    const corMP  = margem >= 20 ? 'text-emerald-600' : margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                                    return (
                                      <tr key={p.produto} className="hover:bg-orange-50/30 transition-colors">
                                        <td className="px-4 py-1.5 text-gray-700 max-w-[280px] truncate pl-12">
                                          {p.produto_nome}
                                        </td>
                                        <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums">{fmtQtd(p.qtd ?? 0)}</td>
                                        <td className="px-4 py-1.5 text-right text-gray-800 tabular-nums">{fmtBRL(p.venda)}</td>
                                        <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(p.custo)}</td>
                                        <td className={cn('px-4 py-1.5 text-right tabular-nums hidden sm:table-cell', lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                          {fmtBRL(lucro)}
                                        </td>
                                        <td className={cn('px-4 py-1.5 text-right tabular-nums font-semibold', corMP)}>{fmtPct(margem)}</td>
                                        <td className="px-4 py-1.5 text-right text-gray-700 tabular-nums hidden lg:table-cell">
                                          {(p.qtd ?? 0) > 0 ? fmtBRL(p.venda / (p.qtd as number)) : '—'}
                                        </td>
                                        <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden lg:table-cell">
                                          {(p.qtd ?? 0) > 0 ? fmtBRL(p.custo / (p.qtd as number)) : '—'}
                                        </td>
                                        <td className={cn('px-4 py-1.5 text-right tabular-nums hidden lg:table-cell', lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                          {(p.qtd ?? 0) > 0 ? fmtBRL(lucro / (p.qtd as number)) : '—'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                ) : subAba === 'automotivos' ? (
                  <>
                    {/* Barra de ações da tree */}
                    {produtosPorGrupo.length > 0 && (
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                          <FolderTree className="w-3.5 h-3.5 text-gray-400" />
                          {produtosPorGrupo.length} grupo{produtosPorGrupo.length === 1 ? '' : 's'} · {produtosAba.length} produto{produtosAba.length === 1 ? '' : 's'}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <button onClick={expandirTodos} className="text-orange-600 hover:text-orange-700 font-medium">Expandir todos</button>
                          <span className="text-gray-300">·</span>
                          <button onClick={recolherTodos} className="text-gray-500 hover:text-gray-700 font-medium">Recolher todos</button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left  px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Grupo / Produto</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Qtd</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-32">Faturamento</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Custo</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Lucro</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20">Margem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {produtosPorGrupo.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-gray-400 italic">
                                Sem produtos automotivos no período selecionado
                              </td>
                            </tr>
                          ) : produtosPorGrupo.map(g => {
                            const isOpen      = gruposAbertos.has(g.nome)
                            const corMargem   = g.margem >= 20 ? 'text-emerald-600' : g.margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                            return (
                              <Fragment key={g.nome}>
                                {/* Linha do grupo (clicável) */}
                                <tr
                                  onClick={() => toggleGrupo(g.nome)}
                                  className="bg-gray-50/60 hover:bg-gray-100/60 cursor-pointer border-y border-gray-200/70"
                                >
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                      {isOpen
                                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
                                      <span className="font-bold text-gray-800 truncate">{g.nome}</span>
                                      <span className="text-[10.5px] text-gray-400 font-normal">
                                        ({g.produtos.length} produto{g.produtos.length === 1 ? '' : 's'})
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold">{fmtQtd(g.qtd)}</td>
                                  <td className="px-4 py-2 text-right text-gray-900 tabular-nums font-bold">{fmtBRL(g.venda)}</td>
                                  <td className="px-4 py-2 text-right text-gray-700 tabular-nums font-semibold hidden sm:table-cell">{fmtBRL(g.custo)}</td>
                                  <td className={cn('px-4 py-2 text-right tabular-nums font-bold hidden sm:table-cell', g.lucro >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                                    {fmtBRL(g.lucro)}
                                  </td>
                                  <td className={cn('px-4 py-2 text-right tabular-nums font-bold', corMargem)}>{fmtPct(g.margem)}</td>
                                </tr>

                                {/* Produtos do grupo */}
                                {isOpen && g.produtos.map(p => {
                                  const lucro    = p.venda - p.custo
                                  const margem   = p.venda > 0 ? (lucro / p.venda) * 100 : 0
                                  const corMP    = margem >= 20 ? 'text-emerald-600' : margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                                  return (
                                    <tr key={p.produto} className="hover:bg-orange-50/30 transition-colors">
                                      <td className="px-4 py-1.5 text-gray-700 max-w-[280px] truncate pl-12">
                                        {p.produto_nome}
                                      </td>
                                      <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums">{fmtQtd(p.qtd ?? 0)}</td>
                                      <td className="px-4 py-1.5 text-right text-gray-800 tabular-nums">{fmtBRL(p.venda)}</td>
                                      <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(p.custo)}</td>
                                      <td className={cn('px-4 py-1.5 text-right tabular-nums hidden sm:table-cell', lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                        {fmtBRL(lucro)}
                                      </td>
                                      <td className={cn('px-4 py-1.5 text-right tabular-nums font-semibold', corMP)}>{fmtPct(margem)}</td>
                                    </tr>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  /* Combustíveis / Conveniência: tabela plana (como antes) */
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left  px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Produto</th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Qtd</th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-32">Faturamento</th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Custo</th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 hidden sm:table-cell">Lucro</th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20">Margem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {produtosAba.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-gray-400 italic">
                              Sem produtos nesta categoria no período selecionado
                            </td>
                          </tr>
                        ) : produtosAba.map(p => {
                          const lucro  = p.venda - p.custo
                          const margem = p.venda > 0 ? (lucro / p.venda) * 100 : 0
                          const corMargem = margem >= 20 ? 'text-emerald-600' : margem >= 10 ? 'text-amber-600' : 'text-rose-500'
                          return (
                            <tr key={p.produto} className="hover:bg-orange-50/30 transition-colors">
                              <td className="px-4 py-2 text-gray-800 font-medium max-w-[280px] truncate">{p.produto_nome}</td>
                              <td className="px-4 py-2 text-right text-gray-600 tabular-nums">{fmtQtd(p.qtd ?? 0)}</td>
                              <td className="px-4 py-2 text-right text-gray-800 tabular-nums font-medium">{fmtBRL(p.venda)}</td>
                              <td className="px-4 py-2 text-right text-gray-600 tabular-nums hidden sm:table-cell">{fmtBRL(p.custo)}</td>
                              <td className={cn('px-4 py-2 text-right tabular-nums font-medium hidden sm:table-cell', lucro >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
                                {fmtBRL(lucro)}
                              </td>
                              <td className={cn('px-4 py-2 text-right tabular-nums font-semibold', corMargem)}>{fmtPct(margem)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Gráfico Combustíveis: 12 meses (barra = litros, linha = lucro) ── */}
            {subAba === 'combustiveis' && (
              <Card className="border-gray-200 shadow-sm mt-4">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Header + seletor de combustível */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800">Evolução de litros e lucro bruto</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Últimos 12 meses · variação sobre o mês anterior
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-gray-500 font-medium">Combustível</label>
                      <select
                        value={combustivelId ?? ''}
                        onChange={e => setCombustivelId(e.target.value ? Number(e.target.value) : null)}
                        className="h-9 px-3 rounded-lg border border-gray-200 bg-white shadow-sm text-[12.5px] focus:outline-none focus:ring-2 focus:ring-orange-400/30 min-w-[180px]"
                      >
                        <option value="">Todos os combustíveis</option>
                        {combustiveisDisponiveis.map(p => (
                          <option key={p.produto} value={p.produto}>{p.produto_nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Estado de carregamento / erro / gráfico */}
                  {loadingChart ? (
                    <div className="h-72 flex items-center justify-center text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : erroChart ? (
                    <div className="h-72 flex items-center justify-center text-rose-600 text-[12px]">
                      <AlertTriangle className="w-4 h-4 mr-1.5" />
                      {erroChart}
                    </div>
                  ) : chartData.every(d => d.litros === 0 && d.lucroPorLitro === 0) ? (
                    <div className="h-72 flex items-center justify-center text-gray-400 text-[13px]">
                      Sem dados de combustíveis nos últimos 12 meses
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={chartData} margin={{ top: 28, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis
                          yAxisId="litros"
                          tick={{ fontSize: 10 }}
                          tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                        />
                        <YAxis
                          yAxisId="lucroLitro"
                          orientation="right"
                          tick={{ fontSize: 10 }}
                          tickFormatter={v => `R$ ${v.toFixed(2)}/L`}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar
                          yAxisId="litros"
                          dataKey="litros"
                          name="Litros vendidos"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={48}
                        >
                          <LabelList dataKey="variacao" content={VariacaoLabel} />
                        </Bar>
                        <Line
                          yAxisId="lucroLitro"
                          dataKey="lucroPorLitro"
                          name="Lucro bruto / litro"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#10b981' }}
                          activeDot={{ r: 5 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Tooltip customizada do gráfico ──────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as {
    litros: number; lucro: number; venda: number; custo: number
    lucroPorLitro: number; variacao: number | null
  }
  const fmtRS = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-[12px]">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-gray-500">Litros:</span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {row.litros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-500">Lucro / L:</span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {fmtRS(row.lucroPorLitro)}
          </span>
        </div>
        <div className="text-gray-400 text-[11px] pt-1 border-t border-gray-100 space-y-0.5">
          <p>Lucro total: <span className="text-gray-600">{fmtRS(row.lucro)}</span></p>
          <p>Venda: <span className="text-gray-600">{fmtRS(row.venda)}</span></p>
        </div>
        {row.variacao != null && (
          <div className="text-[11px] text-gray-500">
            Variação litros vs. mês anterior:
            <span className={cn('ml-1 font-semibold', row.variacao >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              {row.variacao >= 0 ? '+' : ''}{row.variacao.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Label que aparece acima de cada barra com a % de variação vs mês anterior.
function VariacaoLabel(props: any) {
  const { x, y, width, value } = props
  if (value == null) return null
  const variacao = value as number
  const fill = variacao >= 0 ? '#059669' : '#dc2626'
  const sinal = variacao >= 0 ? '↑' : '↓'
  const texto = `${sinal} ${Math.abs(variacao).toFixed(0)}%`
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
      fill={fill}
    >
      {texto}
    </text>
  )
}

// ── Mini KPI usado nos sub-totais da aba ────────────────────────────────────

function MiniKpi({ title, value, sub, cor }: {
  title: string
  value: string
  sub?:  string
  cor:   'orange' | 'green' | 'rose' | 'blue' | 'gray'
}) {
  const cores: Record<typeof cor, { bg: string; valor: string }> = {
    orange: { bg: 'bg-orange-50',  valor: 'text-orange-700'  },
    green:  { bg: 'bg-emerald-50', valor: 'text-emerald-700' },
    rose:   { bg: 'bg-rose-50',    valor: 'text-rose-700'    },
    blue:   { bg: 'bg-blue-50',    valor: 'text-blue-700'    },
    gray:   { bg: 'bg-gray-50',    valor: 'text-gray-700'    },
  }
  const c = cores[cor]
  return (
    <div className={cn('rounded-xl border border-gray-200 p-3', c.bg)}>
      <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-medium truncate">{title}</p>
      <p className={cn('text-[17px] font-bold tabular-nums leading-tight mt-0.5', c.valor)}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
