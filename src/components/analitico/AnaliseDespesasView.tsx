'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'
import {
  Loader2, AlertCircle, TrendingDown, FileText, Boxes, Eye, EyeOff,
  Search, ChevronDown, ChevronRight, Folder, ArrowUp, ArrowDown,
  Building2, X,
} from 'lucide-react'
import type { Mascara } from '@/types/database.types'
import type {
  DrillItem, DrillLancamento, DrillLancamentosResponse,
} from '@/app/api/relatorios/dre/drill/route'
import type {
  AnaliseDespesasResponse, AnaliseDespesasLinha, AnaliseDespesasSubGrupo,
} from '@/app/api/relatorios/dre/analise-despesas/route'
import { AnaliseDespesasGraficos } from './AnaliseDespesasGraficos'

// Chave de expansão de um item (conta ou grupo de produto)
function keyDoItem(item: DrillItem): string {
  return item.tipo === 'conta'
    ? `conta:${item.codigo}`
    : `grupo:${item.grupo_grid}:${item.tipo_valor}`
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const fmtMes = (iso: string) => {
  const [y, m] = iso.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[Number(m) - 1]}/${y.slice(2)}`
}

// ── VariacaoBadge ──────────────────────────────────────────────────
//
// Mostra a variação % do mês atual em relação ao mês anterior. A
// magnitude (absoluta) é o que importa para análise de despesa, então
// usamos |atual| vs |anterior| — assim um saldo que vai de -1200 para
// -1000 é exibido como "↓ 16,7%" (despesa reduziu), mesmo que o número
// nominal tenha "subido" de -1200 para -1000.
//
// Convenção de cor pensada para despesas:
//   ↑ aumento  → vermelho (despesa cresceu)
//   ↓ redução  → verde     (despesa caiu)

function VariacaoBadge({ atual, anterior }: { atual: number; anterior: number }) {
  const absAtual = Math.abs(atual)
  const absAnt   = Math.abs(anterior)
  // Sem dados suficientes para comparar
  if (absAtual === 0 && absAnt === 0) return null
  if (absAnt === 0) {
    return (
      <span className="inline-flex items-center px-1 py-0 rounded text-[8.5px] font-semibold bg-gray-100 text-gray-500" title="Não havia movimento no mês anterior">
        novo
      </span>
    )
  }
  const diff = absAtual - absAnt
  const pct  = (diff / absAnt) * 100
  // Variações muito pequenas: omite ou marca como estável
  if (Math.abs(pct) < 0.5) {
    return (
      <span className="inline-flex items-center px-1 py-0 rounded text-[8.5px] font-medium bg-gray-50 text-gray-400" title="Variação inferior a 0,5%">
        ≈
      </span>
    )
  }
  const subiu = diff > 0
  const Icon  = subiu ? ArrowUp : ArrowDown
  const cor   = subiu ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8.5px] font-semibold', cor)}
      title={`Variação vs. mês anterior · ${subiu ? 'aumento' : 'redução'} absoluta de ${pct.toFixed(1).replace('.', ',')}%`}
    >
      <Icon className="w-2 h-2" />
      {Math.abs(pct).toFixed(1).replace('.', ',')}%
    </span>
  )
}

type PeriodoMeses = 1 | 3 | 6
const PERIODOS: { meses: PeriodoMeses; label: string }[] = [
  { meses: 1, label: '1 mês'  },
  { meses: 3, label: '3 meses' },
  { meses: 6, label: '6 meses' },
]

interface PostoOpt { id: string; nome: string; codigo_empresa_externo: string | null }

export function AnaliseDespesasView() {
  const supabase = createClient()

  // ── Filtros próprios (autônomos) ────────────────────────────
  const [mascaras, setMascaras]               = useState<Mascara[]>([])
  const [loadingMascaras, setLoadingMascaras] = useState(true)
  const [mascaraId, setMascaraId]             = useState<string | null>(null)
  const [periodo, setPeriodo]                 = useState<PeriodoMeses>(3)
  const [postos, setPostos]                   = useState<PostoOpt[]>([])
  // Multi-select de empresas (codigo_empresa_externo). Vazio = "todas".
  const [empresasSel, setEmpresasSel]         = useState<Set<string>>(new Set())
  const [empresaDropOpen, setEmpresaDropOpen] = useState(false)
  const empresaDropRef = useRef<HTMLDivElement>(null)
  // CSV das empresas selecionadas (para passar ao backend).
  // Quando vazio, o backend usa "todas".
  const empresasCsv = Array.from(empresasSel).join(',')
  const [refMesAno, setRefMesAno] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ── Resposta + UX ───────────────────────────────────────────
  const [resp, setResp]               = useState<AnaliseDespesasResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [erro, setErro]               = useState<string | null>(null)
  const [ocultarZerados, setOcultarZerados] = useState(true)

  // ── Expansão (sub-grupos + lançamentos) ─────────────────────
  // Sub-grupos começam RECOLHIDOS por default — o usuário clica para abrir.
  const [expandedSubs,  setExpandedSubs]  = useState<Set<string>>(new Set())
  const [expandedItens, setExpandedItens] = useState<Set<string>>(new Set())
  const [lancCache,     setLancCache]     = useState<Map<string, DrillLancamento[]>>(new Map())
  const [loadingLanc,   setLoadingLanc]   = useState<Set<string>>(new Set())
  const [errLanc,       setErrLanc]       = useState<Map<string, string>>(new Map())

  function toggleSub(linhaId: string) {
    setExpandedSubs(prev => {
      const n = new Set(prev)
      if (n.has(linhaId)) n.delete(linhaId); else n.add(linhaId)
      return n
    })
  }

  // Constrói URL de drill nível-lançamentos a partir da key do item
  function buildLancUrl(itemKey: string): string | null {
    const ref = `&ref=${refMesAno}`
    const emp = empresasCsv ? `&empresa=${empresasCsv}` : ''
    if (itemKey.startsWith('conta:')) {
      const codigo = itemKey.slice(6)
      return `/api/relatorios/dre/drill?mode=lancamentos&target=conta&codigo=${encodeURIComponent(codigo)}&periodo=${periodo}${ref}${emp}`
    }
    if (itemKey.startsWith('grupo:')) {
      const [, grupoGrid, tipoValor] = itemKey.split(':')
      return `/api/relatorios/dre/drill?mode=lancamentos&target=grupo&grupo_grid=${grupoGrid}&tipo_valor=${tipoValor}&periodo=${periodo}${ref}${emp}`
    }
    return null
  }

  async function toggleItem(itemKey: string) {
    if (expandedItens.has(itemKey)) {
      setExpandedItens(prev => { const n = new Set(prev); n.delete(itemKey); return n })
      return
    }
    // Expandindo: faz fetch se ainda não tem cache
    if (!lancCache.has(itemKey)) {
      const url = buildLancUrl(itemKey)
      if (!url) return
      setLoadingLanc(prev => new Set(prev).add(itemKey))
      setErrLanc(prev => { const n = new Map(prev); n.delete(itemKey); return n })
      try {
        const r = await fetch(url)
        const json = await r.json()
        if (!r.ok || json.error) {
          setErrLanc(prev => new Map(prev).set(itemKey, json.error ?? `Erro HTTP ${r.status}`))
        } else if (json.modo === 'lancamentos') {
          const data = json as DrillLancamentosResponse
          setLancCache(prev => new Map(prev).set(itemKey, data.lancamentos))
        }
      } catch (e) {
        setErrLanc(prev => new Map(prev).set(itemKey, e instanceof Error ? e.message : String(e)))
      } finally {
        setLoadingLanc(prev => { const n = new Set(prev); n.delete(itemKey); return n })
      }
    }
    setExpandedItens(prev => new Set(prev).add(itemKey))
  }

  // Carrega máscaras DRE
  useEffect(() => {
    let cancel = false
    supabase
      .from('mascaras')
      .select('*')
      .eq('tipo', 'dre')
      .order('nome')
      .then(({ data, error }) => {
        if (cancel) return
        if (error) {
          setErro(error.message)
          setLoadingMascaras(false)
          return
        }
        const ms = (data ?? []) as Mascara[]
        setMascaras(ms)
        if (ms.length > 0) setMascaraId(ms[0].id)
        setLoadingMascaras(false)
      })
    return () => { cancel = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega postos
  useEffect(() => {
    let cancel = false
    fetch('/api/postos')
      .then(r => r.json())
      .then(json => {
        if (cancel) return
        const lista = (json.postos ?? []) as PostoOpt[]
        setPostos(lista.filter(p => p.codigo_empresa_externo))
      })
      .catch(() => {})
    return () => { cancel = true }
  }, [])

  // Fecha o dropdown de empresas ao clicar fora
  useEffect(() => {
    if (!empresaDropOpen) return
    function onClick(e: MouseEvent) {
      if (empresaDropRef.current && !empresaDropRef.current.contains(e.target as Node)) {
        setEmpresaDropOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [empresaDropOpen])

  function toggleEmpresa(codigo: string) {
    setEmpresasSel(prev => {
      const n = new Set(prev)
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
      return n
    })
  }
  function selecionarTodas() { setEmpresasSel(new Set(postos.map(p => p.codigo_empresa_externo!))) }
  function limparEmpresas()   { setEmpresasSel(new Set()) }

  // Label do botão do multiselect
  const empresaLabel = empresasSel.size === 0
    ? 'Todas as empresas'
    : empresasSel.size === 1
      ? (postos.find(p => p.codigo_empresa_externo === Array.from(empresasSel)[0])?.nome ?? '1 empresa')
      : `${empresasSel.size} empresas selecionadas`

  async function gerar() {
    if (!mascaraId) return
    setLoading(true)
    setErro(null)
    // Reset expansão + cache de lançamentos (novos filtros = novos dados)
    setExpandedSubs(new Set())
    setExpandedItens(new Set())
    setLancCache(new Map())
    setLoadingLanc(new Set())
    setErrLanc(new Map())
    try {
      const params = new URLSearchParams({
        mascara_id: mascaraId,
        periodo:    String(periodo),
        ref:        refMesAno,
      })
      if (empresasCsv) params.set('empresa', empresasCsv)
      const r = await fetch(`/api/relatorios/dre/analise-despesas?${params}`)
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        setResp(null)
        return
      }
      setResp(json as AnaliseDespesasResponse)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Auto-gera ao mudar máscara
  useEffect(() => { if (mascaraId) gerar() }, [mascaraId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Filtros — barra flat sticky com blur; cola no topo ao rolar */}
      <div className="sticky top-0 z-20 -mx-3 md:-mx-6 px-3 md:px-6 pt-2 pb-3 flex flex-wrap items-end gap-2 border-b border-gray-200/80 bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 print:static print:bg-white print:backdrop-blur-none">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Máscara DRE
          </label>
          <select
            value={mascaraId ?? ''}
            onChange={(e) => setMascaraId(e.target.value || null)}
            disabled={loadingMascaras || !mascaras.length}
            className="w-full h-8 px-2 border border-gray-200 rounded-md text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {loadingMascaras
              ? <option>Carregando…</option>
              : !mascaras.length
                ? <option>Nenhuma máscara DRE cadastrada</option>
                : mascaras.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Período
          </label>
          <div className="inline-flex h-8 rounded-md border border-gray-200 bg-white overflow-hidden">
            {PERIODOS.map((p, idx) => (
              <button
                key={p.meses}
                onClick={() => setPeriodo(p.meses)}
                className={cn(
                  'px-2.5 text-[10.5px] font-medium transition-colors',
                  idx > 0 && 'border-l border-gray-200',
                  periodo === p.meses
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Mês de referência
          </label>
          <input
            type="month"
            value={refMesAno}
            onChange={(e) => setRefMesAno(e.target.value)}
            className="w-full h-8 px-2 border border-gray-200 rounded-md text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>

        <div className="min-w-[200px] relative" ref={empresaDropRef}>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Empresa{empresasSel.size > 0 && <span className="ml-1 text-amber-600 normal-case tracking-normal">({empresasSel.size})</span>}
          </label>
          <button
            type="button"
            onClick={() => setEmpresaDropOpen(o => !o)}
            className="w-full h-8 px-2 border border-gray-200 rounded-md text-[12px] bg-white flex items-center justify-between gap-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            <span className="flex items-center gap-1.5 truncate text-gray-700">
              <Building2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
              {empresaLabel}
            </span>
            <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform flex-shrink-0', empresaDropOpen && 'rotate-180')} />
          </button>
          {empresaDropOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
              {/* Atalhos */}
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100">
                <button
                  type="button"
                  onClick={selecionarTodas}
                  disabled={empresasSel.size === postos.length}
                  className="text-[10.5px] text-amber-600 hover:text-amber-700 font-medium disabled:text-gray-300 disabled:cursor-default"
                >
                  Selecionar todas
                </button>
                <span className="text-gray-300 text-[10.5px]">·</span>
                <button
                  type="button"
                  onClick={limparEmpresas}
                  disabled={empresasSel.size === 0}
                  className="text-[10.5px] text-gray-500 hover:text-gray-700 font-medium disabled:text-gray-300 disabled:cursor-default"
                >
                  Limpar
                </button>
                <span className="ml-auto text-[10px] text-gray-400">
                  {empresasSel.size === 0 ? 'Sem filtro' : `${empresasSel.size} / ${postos.length}`}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {postos.length === 0 ? (
                  <p className="px-3 py-3 text-[11.5px] text-gray-400 italic text-center">Nenhuma empresa</p>
                ) : (
                  postos.map(p => {
                    const cod = p.codigo_empresa_externo!
                    const sel = empresasSel.has(cod)
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors',
                          sel ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleEmpresa(cod)}
                          className="accent-amber-500 w-3.5 h-3.5 flex-shrink-0"
                        />
                        <span className={cn('text-[11.5px] truncate', sel ? 'text-amber-800 font-medium' : 'text-gray-700')}>
                          {p.nome}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={gerar}
          disabled={loading || !mascaraId}
          className="h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-[11.5px] font-semibold flex items-center gap-1.5"
        >
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Search className="w-3 h-3" />}
          Gerar
        </button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <p>{erro}</p>
        </div>
      )}

      {/* Estado vazio inicial */}
      {!resp && !loading && !erro && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-gray-400">
          <TrendingDown className="w-10 h-10 opacity-40" />
          <p className="text-[13px]">Selecione uma máscara e gere o relatório</p>
        </div>
      )}

      {/* Loading inicial */}
      {!resp && loading && (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[13px]">Carregando despesas…</span>
        </div>
      )}

      {/* Sem linhas marcadas */}
      {resp && resp.linhas.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-center">
          <TrendingDown className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-[13.5px] font-semibold text-amber-800">Nenhuma linha marcada como &quot;Análise de Despesas&quot;</p>
          <p className="text-[12px] text-amber-700 mt-1 max-w-md mx-auto">
            Abra a máscara DRE em <strong>Contábil → Máscaras → DRE</strong>, edite as linhas (Grupo) que devem aparecer aqui e marque a opção <strong>&quot;Usar em Análise de Despesas&quot;</strong>.
          </p>
        </div>
      )}

      {/* Tabela detalhada (parte superior) */}
      {resp && resp.linhas.length > 0 && (
        <div className="space-y-4">
          {/* Cabeçalho resumo */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
              Tabela detalhada · {resp.linhas.length} grupo{resp.linhas.length === 1 ? '' : 's'} · {resp.meses.length} mês{resp.meses.length === 1 ? '' : 'es'}
            </p>
            <button
              onClick={() => setOcultarZerados(o => !o)}
              className="text-[11.5px] text-gray-500 hover:text-gray-900 inline-flex items-center gap-1.5 print:hidden"
              title="Esconde subcontas/grupos sem movimento no período"
            >
              {ocultarZerados ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {ocultarZerados ? 'Ocultando zerados' : 'Mostrando todos'}
            </button>
          </div>

          {resp.linhas.map(linha => (
            <LinhaCard
              key={linha.linha_id}
              linha={linha}
              meses={resp.meses}
              ocultarZerados={ocultarZerados}
              expandedSubs={expandedSubs}
              expandedItens={expandedItens}
              lancCache={lancCache}
              loadingLanc={loadingLanc}
              errLanc={errLanc}
              onToggleSub={toggleSub}
              onToggleItem={toggleItem}
            />
          ))}
        </div>
      )}

      {/* Gráficos (parte inferior) — donut, 12 meses, despesa por empresa */}
      {resp && resp.linhas.length > 0 && (
        <AnaliseDespesasGraficos
          resp={resp}
          mascaraId={mascaraId}
          refMesAno={refMesAno}
          empresasCsv={empresasCsv}
          // Esconde o gráfico "por empresa" quando exatamente 1 empresa
          // está marcada — não faz sentido comparar com ela mesma.
          mostrarPorEmpresa={empresasSel.size !== 1}
        />
      )}
    </div>
  )
}

// ── Card de uma linha marcada ──────────────────────────────────────────
//
// Estrutura: cada linha marcada vira um card. Dentro do card:
//   • (opcional) itens_diretos da própria linha marcada — quando ela tem
//     mapeamentos seus.
//   • Lista de sub-grupos descendentes (DFS), cada um colapsável, com sua
//     tabela própria de itens (contas/grupos).
//
// O total do card = soma dos itens diretos + total de todos os sub-grupos.

interface DrillProps {
  expandedSubs:  Set<string>
  expandedItens: Set<string>
  lancCache:     Map<string, DrillLancamento[]>
  loadingLanc:   Set<string>
  errLanc:       Map<string, string>
  onToggleSub:   (linhaId: string) => void
  onToggleItem:  (itemKey: string) => void
}

interface LinhaCardProps extends DrillProps {
  linha:          AnaliseDespesasLinha
  meses:          string[]
  ocultarZerados: boolean
}

function LinhaCard({
  linha, meses, ocultarZerados,
  expandedSubs, expandedItens, lancCache, loadingLanc, errLanc, onToggleSub, onToggleItem,
}: LinhaCardProps) {
  const subGruposFiltrados = ocultarZerados
    ? linha.sub_grupos.filter(sg => Math.abs(sg.total) > 0.005 || sg.itens.length > 0)
    : linha.sub_grupos

  const itensDiretosFiltrados = ocultarZerados
    ? linha.itens_diretos.filter(it => Math.abs(it.total) > 0.005)
    : linha.itens_diretos
  const itensDiretosOrdenados = [...itensDiretosFiltrados].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  const temItensDiretos = itensDiretosOrdenados.length > 0
  const totalSubGrupos  = linha.sub_grupos.length
  const subOcultos      = totalSubGrupos - subGruposFiltrados.length

  // Sem nada para mostrar
  const vazio = totalSubGrupos === 0 && linha.itens_diretos.length === 0
  const tudoZerado = !vazio && subGruposFiltrados.length === 0 && !temItensDiretos

  return (
    <div className="rounded-xl bg-white border border-gray-200 overflow-hidden break-inside-avoid">
      {/* Header do card */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-amber-50/40 border-b border-amber-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <TrendingDown className="w-4 h-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-gray-900 truncate">{linha.linha_nome}</p>
            <p className="text-[10.5px] text-gray-500">
              {totalSubGrupos === 0
                ? 'Nenhum sub-grupo encontrado'
                : <>{totalSubGrupos} sub-grupo{totalSubGrupos === 1 ? '' : 's'}</>}
              {temItensDiretos && <> · {itensDiretosOrdenados.length} item{itensDiretosOrdenados.length === 1 ? '' : 's'} direto{itensDiretosOrdenados.length === 1 ? '' : 's'}</>}
              {ocultarZerados && subOcultos > 0 && <> · {subOcultos} oculto{subOcultos === 1 ? '' : 's'} (zerados)</>}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Total</p>
          <p className={cn('text-[18px] font-bold tabular-nums', linha.total >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
            {fmtBRL(linha.total)}
          </p>
        </div>
      </div>

      {/* Conteúdo */}
      {vazio ? (
        <p className="px-5 py-8 text-center text-[12.5px] text-gray-400 italic">
          A linha &quot;{linha.linha_nome}&quot; não possui sub-grupos nem mapeamentos próprios na máscara.
        </p>
      ) : tudoZerado ? (
        <p className="px-5 py-8 text-center text-[12.5px] text-gray-400 italic">
          Sem movimento no período (todos os sub-grupos zerados).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            {/* Cabeçalho com colunas mensais visíveis */}
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[10px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-semibold min-w-[260px] sticky left-0 bg-gray-50 z-10">
                  Sub-grupo / Conta
                </th>
                {meses.map(mes => (
                  <th key={mes} className="text-right px-3 py-2 font-semibold min-w-[110px]">
                    {fmtMes(mes)}
                  </th>
                ))}
                <th className="text-right px-4 py-2 font-semibold min-w-[120px] bg-gray-100">Total</th>
              </tr>
            </thead>

            <tbody>
              {/* Mapeamentos diretos da linha marcada (raros) */}
              {temItensDiretos && (
                <>
                  <tr className="bg-amber-50/30 border-y border-amber-100">
                    <td className="px-4 py-1.5 sticky left-0 bg-amber-50/40 z-10 text-[10.5px] uppercase tracking-wide text-amber-800 font-semibold">
                      Mapeamentos diretos
                    </td>
                    <td colSpan={meses.length + 1} />
                  </tr>
                  {itensDiretosOrdenados.map(item => {
                    const key = keyDoItem(item)
                    return (
                      <ItemRow
                        key={key}
                        item={item}
                        itemKey={key}
                        meses={meses}
                        paddingLeft={20}
                        aberto={expandedItens.has(key)}
                        loading={loadingLanc.has(key)}
                        lancs={lancCache.get(key)}
                        erro={errLanc.get(key)}
                        onToggle={() => onToggleItem(key)}
                      />
                    )
                  })}
                </>
              )}

              {/* Sub-grupos (cada um vira uma linha colapsável, com colunas mensais visíveis) */}
              {subGruposFiltrados.map(sg => (
                <SubGrupoRows
                  key={sg.linha_id}
                  sub={sg}
                  meses={meses}
                  ocultarZerados={ocultarZerados}
                  aberto={expandedSubs.has(sg.linha_id)}
                  onToggleSub={() => onToggleSub(sg.linha_id)}
                  expandedItens={expandedItens}
                  lancCache={lancCache}
                  loadingLanc={loadingLanc}
                  errLanc={errLanc}
                  onToggleItem={onToggleItem}
                />
              ))}

              {/* Linha de total geral do card */}
              <tr className="bg-amber-50 border-t-2 border-amber-200">
                <td className="px-4 py-2 font-bold text-amber-900 uppercase tracking-wide text-[10.5px] sticky left-0 bg-amber-50 z-10">
                  Total — {linha.linha_nome}
                </td>
                {linha.total_por_mes.map((v, idx) => {
                  const anterior = idx > 0 ? linha.total_por_mes[idx - 1] : 0
                  return (
                    <td key={idx} className={cn('px-3 py-2 text-right font-bold tabular-nums', v >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{v === 0 ? <span className="text-gray-300">—</span> : fmtBRL(v)}</span>
                        {idx > 0 && <VariacaoBadge atual={v} anterior={anterior} />}
                      </div>
                    </td>
                  )
                })}
                <td className={cn('px-4 py-2 text-right font-bold tabular-nums bg-amber-100', linha.total >= 0 ? 'text-emerald-800' : 'text-rose-800')}>
                  {fmtBRL(linha.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Sub-grupo (linha-filha descendente) — linhas de tabela ────────────

interface SubGrupoRowsProps {
  sub:            AnaliseDespesasSubGrupo
  meses:          string[]
  ocultarZerados: boolean
  aberto:         boolean
  onToggleSub:    () => void
  expandedItens:  Set<string>
  lancCache:      Map<string, DrillLancamento[]>
  loadingLanc:    Set<string>
  errLanc:        Map<string, string>
  onToggleItem:   (itemKey: string) => void
}

function SubGrupoRows({
  sub, meses, ocultarZerados, aberto, onToggleSub,
  expandedItens, lancCache, loadingLanc, errLanc, onToggleItem,
}: SubGrupoRowsProps) {
  const itensFiltrados = ocultarZerados
    ? sub.itens.filter(it => Math.abs(it.total) > 0.005)
    : sub.itens
  const itensOrdenados = [...itensFiltrados].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  const semItens = sub.itens.length === 0
  const indent = Math.min(sub.depth, 3) * 16  // indentação por nível

  // Linha-cabeçalho do sub-grupo — agora com colunas mensais já preenchidas
  // (chevron + nome + totais por mês visíveis no nível superior).
  return (
    <>
      <tr
        className={cn(
          'border-b border-gray-100 hover:bg-gray-50/80 transition-colors',
          aberto && 'bg-gray-50/60',
        )}
      >
        <td
          className="py-2 sticky left-0 bg-inherit z-10 cursor-pointer"
          style={{ paddingLeft: 16 + indent }}
          onClick={!semItens || sub.total !== 0 ? onToggleSub : undefined}
        >
          <div className="flex items-center gap-2">
            {semItens
              ? <Folder className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              : aberto
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
            <span className="text-[12px] font-semibold text-gray-800 truncate">{sub.linha_nome}</span>
            {sub.itens.length > 0 && (
              <span className="text-[10px] text-gray-400 font-normal">
                ({sub.itens.length} {sub.itens.length === 1 ? 'item' : 'itens'})
              </span>
            )}
          </div>
        </td>
        {sub.total_por_mes.map((v, idx) => {
          const anterior = idx > 0 ? sub.total_por_mes[idx - 1] : 0
          return (
            <td
              key={idx}
              className={cn(
                'px-3 py-2 text-right tabular-nums font-semibold',
                v === 0 ? 'text-gray-300' : v >= 0 ? 'text-emerald-700' : 'text-rose-600',
              )}
              onClick={!semItens || sub.total !== 0 ? onToggleSub : undefined}
            >
              <div className="flex items-center justify-end gap-1.5">
                <span>{v === 0 ? '—' : fmtBRL(v)}</span>
                {idx > 0 && <VariacaoBadge atual={v} anterior={anterior} />}
              </div>
            </td>
          )
        })}
        <td
          className={cn(
            'px-4 py-2 text-right tabular-nums font-bold bg-gray-50/80 cursor-pointer',
            sub.total >= 0 ? 'text-emerald-800' : 'text-rose-700',
          )}
          onClick={!semItens || sub.total !== 0 ? onToggleSub : undefined}
        >
          {sub.total === 0 ? <span className="text-gray-300">—</span> : fmtBRL(sub.total)}
        </td>
      </tr>

      {/* Linhas dos itens deste sub-grupo (só quando expandido) */}
      {aberto && !semItens && itensOrdenados.length === 0 && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={meses.length + 2} className="px-4 py-2 text-center text-[11px] text-gray-400 italic" style={{ paddingLeft: 28 + indent }}>
            Sem movimento no período (todos os itens zerados).
          </td>
        </tr>
      )}
      {aberto && !semItens && itensOrdenados.map(item => {
        const key = keyDoItem(item)
        return (
          <ItemRow
            key={key}
            item={item}
            itemKey={key}
            meses={meses}
            paddingLeft={28 + indent}
            aberto={expandedItens.has(key)}
            loading={loadingLanc.has(key)}
            lancs={lancCache.get(key)}
            erro={errLanc.get(key)}
            onToggle={() => onToggleItem(key)}
          />
        )
      })}
    </>
  )
}

interface ItemRowProps {
  item:        DrillItem
  itemKey:     string
  meses:       string[]
  paddingLeft: number
  aberto:      boolean
  loading:     boolean
  lancs?:      DrillLancamento[]
  erro?:       string
  onToggle:    () => void
}

function ItemRow({ item, itemKey, meses, paddingLeft, aberto, loading, lancs, erro, onToggle }: ItemRowProps) {
  const isConta = item.tipo === 'conta'
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50/60">
        <td className="py-1 bg-white z-10" style={{ paddingLeft }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 flex-shrink-0"
              title={aberto ? 'Recolher lançamentos' : 'Ver lançamentos'}
            >
              {loading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : aberto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            {isConta
              ? <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
              : <Boxes  className="w-3 h-3 text-gray-400 flex-shrink-0" />}
            <span className="text-[11.5px] text-gray-700 truncate" title={item.nome}>
              {isConta && <span className="text-gray-400 mr-1 font-mono">{(item as any).codigo}</span>}
              {item.nome}
              {!isConta && (
                <span className={cn(
                  'ml-1.5 text-[9px] font-semibold uppercase px-1 py-0.5 rounded',
                  item.tipo_valor === 'venda' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                )}>
                  {item.tipo_valor}
                </span>
              )}
            </span>
          </div>
        </td>
        {item.valoresPorMes.map((v, idx) => {
          const anterior = idx > 0 ? item.valoresPorMes[idx - 1] : 0
          return (
            <td key={idx} className={cn('px-3 py-1.5 text-right tabular-nums',
              v === 0 ? 'text-gray-300'
              : v >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
              <div className="flex items-center justify-end gap-1.5">
                <span>{v === 0 ? '—' : fmtBRL(v)}</span>
                {idx > 0 && <VariacaoBadge atual={v} anterior={anterior} />}
              </div>
            </td>
          )
        })}
        <td className={cn('px-4 py-1.5 text-right tabular-nums font-semibold bg-gray-50/60',
          item.total >= 0 ? 'text-emerald-800' : 'text-rose-700')}>
          {fmtBRL(item.total)}
        </td>
      </tr>

      {/* Lançamentos individuais (drill nível 2) */}
      {aberto && erro && (
        <tr className="border-b border-gray-100 bg-red-50">
          <td colSpan={meses.length + 2} className="px-4 py-2 text-[11px] text-red-700" style={{ paddingLeft: paddingLeft + 24 }}>
            <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
            <span className="font-semibold">Erro:</span> {erro}
          </td>
        </tr>
      )}
      {aberto && !erro && lancs && lancs.length === 0 && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={meses.length + 2} className="px-4 py-2 text-center text-[11px] text-gray-400 italic" style={{ paddingLeft: paddingLeft + 24 }}>
            Nenhum lançamento no período
          </td>
        </tr>
      )}
      {aberto && !erro && lancs && lancs.map((l, idx) => (
        <LancamentoRow
          key={`${itemKey}:${idx}`}
          lanc={l}
          meses={meses}
          paddingLeft={paddingLeft + 24}
        />
      ))}
    </>
  )
}

// ── Lançamento individual ───────────────────────────────────────────

function LancamentoRow({ lanc, meses, paddingLeft }: {
  lanc:        DrillLancamento
  meses:       string[]
  paddingLeft: number
}) {
  // O valor aparece na coluna do mês correspondente à data; nas demais fica em branco.
  const idxMes = meses.indexOf(lanc.data.slice(0, 7))
  return (
    <tr className="border-b border-gray-100 bg-blue-50/20 hover:bg-blue-50/40">
      <td className="py-1 bg-inherit" style={{ paddingLeft }}>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <FileText className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />
          {lanc.empresa_nome && (
            <span
              className="inline-flex items-center px-1 py-0.5 rounded text-[9.5px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide max-w-[140px] truncate flex-shrink-0"
              title={lanc.empresa_nome}
            >
              {lanc.empresa_nome}
            </span>
          )}
          <span className="truncate">
            {lanc.observacao && lanc.observacao.trim()
              ? lanc.observacao
              : <span className="italic text-gray-400">(sem observação)</span>}
          </span>
        </div>
      </td>
      {meses.map((_, i) => (
        <td key={i} className={cn('px-3 py-1 text-right tabular-nums text-[11px]',
          i === idxMes
            ? (lanc.valor < 0 ? 'text-rose-600' : 'text-gray-700')
            : 'text-gray-200')}>
          {i === idxMes ? fmtBRL(lanc.valor) : '—'}
        </td>
      ))}
      <td className={cn('px-4 py-1 text-right tabular-nums text-[11px] bg-gray-50/60',
        lanc.valor < 0 ? 'text-rose-700' : 'text-gray-600')}>
        {fmtBRL(lanc.valor)}
      </td>
    </tr>
  )
}
