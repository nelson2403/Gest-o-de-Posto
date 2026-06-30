'use client'

import { Fragment as FragmentRow, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  ArrowLeft, Building2, ClipboardList, Loader2, AlertCircle, RefreshCw,
  Printer, FileText, ChevronDown, ChevronRight, X, BarChart3, Wand2, Bug,
} from 'lucide-react'
import type { Esquema } from '@/app/api/comissionamento/esquemas/route'
import { PostoCombobox } from '../_components/PostoCombobox'

// ── Tipos locais (espelham o output do orchestrator) ────────────────────────

interface Posto { id: string; nome: string; codigo_empresa_externo: string | null }

// Modelo novo (migration 093+094): comissão agregada por (vendedor × regra)
type RegraCampo = 'faturamento' | 'quantidade' | 'lucro' | 'mix' | 'atingimento_meta'

interface ComissaoPorRegra {
  regra_id:             string
  regra_nome:           string
  prioridade:           number
  realizado_campo:      RegraCampo
  realizado_valor:      number
  realizado_qtd_vendas: number
  meta_referencia_id:   string | null
  meta_valor:           number | null
  atingimento_meta:     number | null
  base_campo:           RegraCampo
  base_valor:           number
  base_qtd_vendas:      number
  comissao:             number
  breakdown:            { base_descricao: string; modo: string; taxa: number } | null
}

interface ComissaoPorVendedor {
  vendedor_id:    string
  vendedor_nome:  string
  comissoes:      ComissaoPorRegra[]
  comissao_total: number
}

interface AtingimentoDetalhe {
  meta_id: string; meta_nome: string; campo: string
  membro_id: string; vendedor_id: string
  meta_individual: number; realizado: number; atingimento: number
}

interface VendedorResumo {
  vendedor_id: string; vendedor_nome: string; membro_id: string | null
  vendas_count: number; quantidade: number
  faturamento: number; custo: number; lucro_bruto: number; margem: number
  comissao_total: number
  atingimentos: AtingimentoDetalhe[]
}

interface CalcularResponse {
  postoId: string; esquemaId: string; dataIni: string; dataFim: string
  totais: {
    qtdVendas: number; faturamento: number; custo: number; lucroBruto: number; margem: number
    comissaoTotal: number; qtdRegrasAtivas: number; qtdRegrasCasaram: number
  }
  resumoPorVendedor:    VendedorResumo[]
  atingimentos:         AtingimentoDetalhe[]
  comissaoPorVendedor?: ComissaoPorVendedor[]
  qtdRegras: number; qtdMetas: number; qtdMembros: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const fmtData = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
const fmtIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
function defaultPeriodo() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return { dataIni: fmtIsoDate(ini), dataFim: fmtIsoDate(hoje) }
}

// ── Helpers do modelo novo (migration 093) ─────────────────────────────────
//
// O engine agregado devolve uma ComissaoPorVendedor por vendedor com a
// lista de regras que casaram. Aqui só formatamos cada linha para a
// tabela "Regras aplicadas" do expandido — sem agregações adicionais.

const CAMPO_LABEL: Record<RegraCampo, string> = {
  faturamento:      'Faturamento',
  quantidade:       'Quantidade',
  lucro:            'Lucro',
  mix:              'Mix',
  atingimento_meta: 'Atingimento',
}

// Formata o valor agregado de acordo com o campo: R$ para fat./lucro,
// número simples para qtd/mix, % para atingimento_meta.
function fmtAgregado(valor: number, campo: RegraCampo): string {
  if (campo === 'faturamento' || campo === 'lucro') return fmtBRL(valor)
  if (campo === 'quantidade') return `${fmtQtd(valor)} un.`
  if (campo === 'atingimento_meta') return fmtPct(valor)
  return `${fmtQtd(valor)} produto${valor === 1 ? '' : 's'}`
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function ComissionamentoRelatoriosPage() {
  const { dataIni: iniDef, dataFim: fimDef } = defaultPeriodo()

  const [postos,    setPostos]    = useState<Posto[]>([])
  const [esquemas,  setEsquemas]  = useState<Esquema[]>([])
  const [postoId,   setPostoId]   = useState('')
  const [esquemaId, setEsquemaId] = useState('')
  const [dataIni,   setDataIni]   = useState(iniDef)
  const [dataFim,   setDataFim]   = useState(fimDef)

  const [data,    setData]    = useState<CalcularResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/postos').then(r => r.json()),
      fetch('/api/comissionamento/esquemas').then(r => r.json()),
    ]).then(([pResp, eResp]) => {
      const pList = ((pResp.postos ?? []) as Posto[])
        .filter(p => !!p.codigo_empresa_externo)
        .sort((a, b) => a.nome.localeCompare(b.nome))
      setPostos(pList)
      if (pList.length > 0) setPostoId(pList[0].id)

      const eList = (eResp.esquemas ?? []) as Esquema[]
      setEsquemas(eList)
    }).catch(() => toast({ variant: 'destructive', title: 'Erro ao carregar configuração' }))
  }, [])

  // Filtra esquemas pelo posto selecionado
  const esquemasDoPosto = useMemo(() => {
    if (!postoId) return [] as Esquema[]
    return esquemas.filter(e => !e.posto_ids || e.posto_ids.length === 0 || e.posto_ids.includes(postoId))
  }, [esquemas, postoId])

  useEffect(() => {
    if (esquemasDoPosto.length === 0) { setEsquemaId(''); return }
    if (!esquemasDoPosto.some(e => e.id === esquemaId)) {
      const ativo = esquemasDoPosto.find(e => e.status === 'ativo')
      setEsquemaId((ativo ?? esquemasDoPosto[0]).id)
    }
  }, [esquemasDoPosto, esquemaId])

  const apurar = useCallback(async () => {
    if (!postoId || !esquemaId || !dataIni || !dataFim) return
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams({
        posto_id: postoId, esquema_id: esquemaId,
        data_ini: dataIni, data_fim: dataFim,
        detalhe: '1',
      })
      const r = await fetch(`/api/comissionamento/calcular?${params}`)
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        setData(null)
        return
      }
      setData(json as CalcularResponse)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [postoId, esquemaId, dataIni, dataFim])

  useEffect(() => { if (postoId && esquemaId) apurar() }, [apurar, postoId, esquemaId])

  function toggleVendedor(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Modelo novo: comissões agregadas por vendedor (1 entrada por vendedor
  // que recebeu comissão). Indexamos por vendedor_id para drill no expandido.
  const comissaoPorVendedorMap = useMemo(() => {
    const map = new Map<string, ComissaoPorVendedor>()
    if (!data?.comissaoPorVendedor) return map
    for (const cv of data.comissaoPorVendedor) {
      map.set(cv.vendedor_id, cv)
    }
    return map
  }, [data])

  function abrirImpressao() {
    if (!postoId || !esquemaId) return
    const params = new URLSearchParams({
      posto_id: postoId, esquema_id: esquemaId,
      data_ini: dataIni, data_fim: dataFim,
      auto: '1',
    })
    window.open(`/comissionamento/relatorios/imprimir?${params}`, '_blank', 'noopener')
  }

  const postoSel   = postos.find(p => p.id === postoId)
  const esquemaSel = esquemas.find(e => e.id === esquemaId)

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Relatórios de Comissionamento"
        description="Apuração mensal, demonstrativos por vendedor e impressão A4"
        actions={
          <Link href="/comissionamento"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]">
            <ArrowLeft className="w-3.5 h-3.5" /> Comissionamento
          </Link>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5 bg-white/95 border-b border-gray-200/80 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-gray-400" />
          <PostoCombobox
            postos={postos}
            value={postoId}
            onChange={setPostoId}
            placeholder="Posto"
            className="min-w-[220px]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <Select value={esquemaId} onValueChange={setEsquemaId}>
            <SelectTrigger className="h-9 min-w-[200px]"><SelectValue placeholder="Esquema" /></SelectTrigger>
            <SelectContent>
              {esquemasDoPosto.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">Nenhum esquema para este posto</div>}
              {esquemasDoPosto.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome} {e.status !== 'ativo' && <span className="text-gray-400">({e.status})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <input
          type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-[12.5px]"
        />
        <span className="text-gray-400 text-[11px]">→</span>
        <input
          type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-[12.5px]"
        />

        <Button onClick={apurar} disabled={loading || !postoId || !esquemaId}
          variant="outline" className="h-9 gap-1.5 text-[12.5px]">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Atualizar
        </Button>

        <Button
          onClick={abrirImpressao}
          disabled={!data || data.resumoPorVendedor.length === 0}
          className="h-9 ml-auto gap-1.5 bg-gray-900 hover:bg-black text-white text-[12.5px]"
        >
          <Printer className="w-3.5 h-3.5" /> Versão imprimível
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {erro && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <p>{erro}</p>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-[13px]">Apurando comissões…</span>
          </div>
        )}

        {data && (
          <>
            {/* Cabeçalho do relatório */}
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <InfoBox titulo="Posto"        valor={postoSel?.nome ?? '—'} />
                  <InfoBox titulo="Esquema"      valor={esquemaSel?.nome ?? '—'} />
                  <InfoBox titulo="Período"      valor={`${fmtData(dataIni)} a ${fmtData(dataFim)}`} />
                  <InfoBox titulo="Vendas"       valor={`${fmtQtd(data.totais.qtdVendas)} linhas`} />
                  <InfoBox titulo="Faturamento"  valor={fmtBRL(data.totais.faturamento)} cor="blue" />
                  <InfoBox titulo="Lucro bruto"  valor={fmtBRL(data.totais.lucroBruto)}  cor="green" />
                  <InfoBox titulo="Margem"       valor={fmtPct(data.totais.margem)}      cor="purple" />
                  <InfoBox titulo="Comissão total" valor={fmtBRL(data.totais.comissaoTotal)} cor="orange" />
                </div>
              </CardContent>
            </Card>

            {/* Tabela de vendedores (expansível) */}
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    Demonstrativo por vendedor
                  </p>
                  <p className="text-[11.5px] text-gray-500">
                    {data.resumoPorVendedor.length} vendedor{data.resumoPorVendedor.length === 1 ? '' : 'es'} · clique para expandir
                  </p>
                </div>

                {data.resumoPorVendedor.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[12.5px] text-gray-400 italic">
                    Nenhuma venda no período
                  </p>
                ) : (
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="text-left  px-4 py-2.5">Vendedor</th>
                        <th className="text-right px-4 py-2.5 w-20">Vendas</th>
                        <th className="text-right px-4 py-2.5 w-28">Faturamento</th>
                        <th className="text-right px-4 py-2.5 w-28 hidden sm:table-cell">Lucro</th>
                        <th className="text-right px-4 py-2.5 w-20 hidden sm:table-cell">Margem</th>
                        <th className="text-right px-4 py-2.5 w-28">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.resumoPorVendedor.map(v => {
                        const aberto   = expandidos.has(v.vendedor_id)
                        const comissao = comissaoPorVendedorMap.get(v.vendedor_id) ?? null
                        return (
                          <RelatorioLinhaVendedor
                            key={v.vendedor_id}
                            v={v} comissao={comissao} aberto={aberto}
                            onToggle={() => toggleVendedor(v.vendedor_id)}
                            postoId={postoId}
                            esquemaId={esquemaId}
                            dataIni={dataIni}
                            dataFim={dataFim}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}

      </div>
    </div>
  )
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function InfoBox({ titulo, valor, cor }: { titulo: string; valor: string; cor?: 'blue' | 'green' | 'purple' | 'orange' }) {
  const cores: Record<NonNullable<typeof cor>, string> = {
    blue:   'text-blue-700',
    green:  'text-emerald-700',
    purple: 'text-purple-700',
    orange: 'text-orange-700',
  }
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-medium">{titulo}</p>
      <p className={cn('text-[14.5px] font-bold tabular-nums mt-0.5', cor ? cores[cor] : 'text-gray-900')}>
        {valor}
      </p>
    </div>
  )
}

interface RelatorioLinhaVendedorProps {
  v: VendedorResumo
  comissao: ComissaoPorVendedor | null
  aberto: boolean
  onToggle: () => void
  postoId: string
  esquemaId: string
  dataIni: string
  dataFim: string
}
function RelatorioLinhaVendedor({ v, comissao, aberto, onToggle, postoId, esquemaId, dataIni, dataFim }: RelatorioLinhaVendedorProps) {
  const regras = comissao?.comissoes ?? []
  // Ordena por comissão desc (maior contribuição primeiro)
  const regrasOrdenadas = useMemo(
    () => [...regras].sort((a, b) => b.comissao - a.comissao),
    [regras],
  )

  // Modal "Vendas por grupo / subgrupo / produto" — abertura sob demanda
  const [modalAberto, setModalAberto] = useState(false)

  // Diagnóstico do engine — mostra o que o motor vê para esse vendedor.
  const [diagAberto, setDiagAberto] = useState(false)
  const [diagData, setDiagData] = useState<unknown | null>(null)
  const [diagLoad, setDiagLoad] = useState(false)
  const [diagErr, setDiagErr] = useState<string | null>(null)
  async function diagnosticar() {
    setDiagAberto(true); setDiagLoad(true); setDiagErr(null); setDiagData(null)
    try {
      const q = new URLSearchParams({
        posto_id: postoId, esquema_id: esquemaId,
        data_ini: dataIni, data_fim: dataFim,
        vendedor_id: v.vendedor_id,
      })
      const r = await fetch(`/api/comissionamento/diagnostico-vendedor?${q}`)
      const json = await r.json()
      if (!r.ok || json.error) throw new Error(json.error ?? 'erro')
      setDiagData(json)
    } catch (e) {
      setDiagErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagLoad(false)
    }
  }

  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-orange-50/30 cursor-pointer"
      >
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            {aberto ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{v.vendedor_nome}</p>
              {!v.membro_id && <p className="text-[10.5px] text-amber-600 italic">não cadastrado em membros</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmtQtd(v.vendas_count)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-gray-800 font-medium">{fmtBRL(v.faturamento)}</td>
        <td className={cn('px-4 py-2 text-right tabular-nums hidden sm:table-cell', v.lucro_bruto >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
          {fmtBRL(v.lucro_bruto)}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-gray-600 hidden sm:table-cell">{fmtPct(v.margem)}</td>
        <td className="px-4 py-2 text-right tabular-nums font-bold text-orange-700">{fmtBRL(v.comissao_total)}</td>
      </tr>

      {aberto && (
        <tr>
          <td colSpan={6} className="bg-gray-50/40 px-4 py-3 border-y border-gray-100">
            {/* Atingimentos */}
            {v.atingimentos.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">Metas</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {v.atingimentos.map(a => {
                    const corTxt = a.atingimento >= 100 ? 'text-emerald-700' : a.atingimento >= 70 ? 'text-amber-700' : 'text-gray-600'
                    return (
                      <div key={a.meta_id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                        <span className="text-[12px] font-medium text-gray-800 truncate">{a.meta_nome}</span>
                        <span className={cn('text-[12px] font-bold tabular-nums', corTxt)}>{fmtPct(a.atingimento)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Regras aplicadas — colunas Realizado, Atingimento, Base, Comissão */}
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold flex items-center gap-1">
                <Wand2 className="w-3 h-3 text-gray-400" />
                Regras aplicadas ({regrasOrdenadas.length})
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={diagnosticar}
                  className="h-7 px-2.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-[11.5px] font-semibold flex items-center gap-1.5"
                  title="Mostra cargo no ctx, atingimentos e por que cada regra casou ou não"
                >
                  <Bug className="w-3 h-3" />
                  Diagnosticar
                </button>
                <button
                  onClick={() => setModalAberto(true)}
                  className="h-7 px-2.5 rounded-md border border-orange-200 text-orange-700 hover:bg-orange-50 text-[11.5px] font-semibold flex items-center gap-1.5"
                >
                  <BarChart3 className="w-3 h-3" />
                  Ver vendas por grupo
                </button>
              </div>
            </div>

            {regrasOrdenadas.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic py-2">
                Nenhuma regra casou para este vendedor.
              </p>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50">
                    <tr className="text-[10.5px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="text-left  px-3 py-1.5">Regra</th>
                      <th className="text-right px-3 py-1.5 w-32">Realizado</th>
                      <th className="text-right px-3 py-1.5 w-24">Atingim.</th>
                      <th className="text-right px-3 py-1.5 w-32">Base</th>
                      <th className="text-right px-3 py-1.5 w-28">Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {regrasOrdenadas.map(r => {
                      const corAtg = r.atingimento_meta == null ? 'text-gray-400'
                                    : r.atingimento_meta >= 100 ? 'text-emerald-700'
                                    : r.atingimento_meta >= 70  ? 'text-amber-700'
                                    : 'text-rose-600'
                      return (
                        <tr key={r.regra_id} className="hover:bg-orange-50/30">
                          <td className="px-3 py-1.5 text-gray-800 max-w-[360px] truncate" title={r.regra_nome}>
                            {r.regra_nome}
                            {r.breakdown && (
                              <p className="text-[10px] text-gray-400 truncate">{r.breakdown.base_descricao}</p>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">
                            {fmtAgregado(r.realizado_valor, r.realizado_campo)}
                            <p className="text-[10px] text-gray-400">{CAMPO_LABEL[r.realizado_campo]}</p>
                          </td>
                          <td className={cn('px-3 py-1.5 text-right tabular-nums font-semibold', corAtg)}>
                            {r.atingimento_meta == null
                              ? <span className="text-gray-400">—</span>
                              : fmtPct(r.atingimento_meta)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">
                            {fmtAgregado(r.base_valor, r.base_campo)}
                            <p className="text-[10px] text-gray-400">{CAMPO_LABEL[r.base_campo]}</p>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-bold text-orange-700">
                            {fmtBRL(r.comissao)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50/60 border-t border-gray-200">
                    <tr className="text-[11.5px]">
                      <td className="px-3 py-1.5 font-semibold text-gray-700" colSpan={4}>Total</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold text-orange-700">
                        {fmtBRL(v.comissao_total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}

      {modalAberto && (
        <VendasPorGrupoModal
          vendedorId={v.vendedor_id}
          vendedorNome={v.vendedor_nome}
          postoId={postoId}
          dataIni={dataIni}
          dataFim={dataFim}
          onClose={() => setModalAberto(false)}
        />
      )}

      {diagAberto && (
        <DiagnosticoModal
          vendedorNome={v.vendedor_nome}
          loading={diagLoad}
          erro={diagErr}
          data={diagData}
          onClose={() => setDiagAberto(false)}
        />
      )}
    </>
  )
}

// ── Modal: diagnóstico do engine para um vendedor ──────────────────────────
interface DiagnosticoModalProps {
  vendedorNome: string
  loading:  boolean
  erro:     string | null
  data:     unknown | null
  onClose:  () => void
}
function DiagnosticoModal({ vendedorNome, loading, erro, data, onClose }: DiagnosticoModalProps) {
  if (typeof document === 'undefined') return null
  type DiagData = {
    vendedor: {
      external_id: string; nome_membro: string | null; role_membro: string | null;
      tem_membro: boolean; qtd_vendas: number
    }
    contexto: { cargo_no_ctx: string }
    metas_no_periodo: Array<{
      id: string; nome: string; campo: string; valor_meta: number;
      atingimento_total: number | null; atingimento_vendedor: number | null;
      mix_detalhe?: {
        usa_grids:              boolean
        numerador_cadastrado:   string[]
        denominador_cadastrado: string[]
        numerador_grids:        number[]
        denominador_grids:      number[]
        qtd_numerador:          number
        qtd_denominador:        number
        realizado_pct:          number
        produtos_vendidos: Array<{ nome: string; grid: number; qtd: number; bate_num: boolean; bate_den: boolean }>
      }
    }>
    regras: Array<{
      regra_id: string; nome: string; ativa: boolean;
      meta_referencia_id: string | null; meta_referencia_nome: string | null;
      realizado_escopo: string; base_escopo: string;
      atingimento_resolvido: number | null;
      condicoes_avaliadas: Array<{ field: string; operator: string; value: unknown; resultado: boolean; valor_ctx: unknown; motivo?: string }>;
      casaria: boolean; motivo_geral: string
    }>
  }
  const d = data as DiagData | null
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
              <Bug className="w-3.5 h-3.5 text-blue-600" />
              Diagnóstico do engine
            </p>
            <p className="text-[11px] text-gray-500">{vendedorNome}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && <p className="text-[12px] text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Calculando…</p>}
          {erro && <p className="text-[12px] text-rose-700 bg-rose-50 px-3 py-2 rounded">{erro}</p>}
          {d && (
            <>
              {/* Cadastro */}
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Cadastro</p>
                <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-[12px] space-y-0.5">
                  <p><span className="text-gray-500">external_person_id:</span> <span className="font-mono">{d.vendedor.external_id}</span></p>
                  <p><span className="text-gray-500">Cadastrado em Membros:</span> {d.vendedor.tem_membro ? (
                    <span className="text-emerald-700 font-semibold">Sim — role = "{d.vendedor.role_membro}"</span>
                  ) : (
                    <span className="text-rose-700 font-semibold">NÃO (regras de cargo nunca casarão)</span>
                  )}</p>
                  <p><span className="text-gray-500">cargo no ctx:</span> <span className="font-mono font-bold">"{d.contexto.cargo_no_ctx}"</span></p>
                  <p><span className="text-gray-500">Vendas próprias no escopo:</span> {d.vendedor.qtd_vendas}</p>
                </div>
              </div>
              {/* Metas */}
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Metas no período</p>
                {d.metas_no_periodo.length === 0
                  ? <p className="text-[11.5px] text-rose-700 italic bg-rose-50 px-3 py-2 rounded">Nenhuma meta carregada — verifique período e posto.</p>
                  : (
                    <div className="border border-gray-200 rounded overflow-hidden">
                      <table className="w-full text-[11.5px]">
                        <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-500">
                          <tr><th className="text-left px-3 py-1.5">Meta</th><th className="px-3 py-1.5 w-16">Campo</th><th className="text-right px-3 py-1.5 w-20">Meta</th><th className="text-right px-3 py-1.5 w-24">Ating. total</th><th className="text-right px-3 py-1.5 w-24">Ating. vendedor</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {d.metas_no_periodo.map(m => (
                            <FragmentRow key={m.id}>
                              <tr>
                                <td className="px-3 py-1.5 text-gray-800">{m.nome}</td>
                                <td className="px-3 py-1.5 text-gray-500 font-mono text-[10.5px]">{m.campo}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{m.valor_meta}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{m.atingimento_total != null ? `${m.atingimento_total.toFixed(1)}%` : '—'}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{m.atingimento_vendedor != null ? `${m.atingimento_vendedor.toFixed(1)}%` : '—'}</td>
                              </tr>
                              {m.mix_detalhe && (
                                <tr>
                                  <td colSpan={5} className="bg-purple-50/30 px-3 py-2 border-t border-purple-100">
                                    <p className="text-[10.5px] uppercase tracking-wide text-purple-700 font-semibold mb-1">
                                      Detalhe mix · realizado = {m.mix_detalhe.qtd_numerador.toFixed(2)} / {m.mix_detalhe.qtd_denominador.toFixed(2)} × 100 = {m.mix_detalhe.realizado_pct.toFixed(2)}%
                                      <span className="ml-2 text-[10px] font-normal text-gray-600 normal-case">
                                        ({m.mix_detalhe.usa_grids ? 'comparando por grid' : 'comparando por nome (legado)'})
                                      </span>
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                                      <div>
                                        <p className="text-[10px] uppercase text-gray-500 mb-0.5">Numerador cadastrado</p>
                                        <p className="font-mono text-[10.5px] text-gray-700 break-words">{m.mix_detalhe.numerador_cadastrado.length === 0 ? '— vazio —' : m.mix_detalhe.numerador_cadastrado.join(' · ')}</p>
                                        {m.mix_detalhe.usa_grids && <p className="text-[9.5px] text-gray-400 mt-0.5">grids: {m.mix_detalhe.numerador_grids.join(', ')}</p>}
                                      </div>
                                      <div>
                                        <p className="text-[10px] uppercase text-gray-500 mb-0.5">Denominador cadastrado</p>
                                        <p className="font-mono text-[10.5px] text-gray-700 break-words">{m.mix_detalhe.denominador_cadastrado.length === 0 ? '— vazio —' : m.mix_detalhe.denominador_cadastrado.join(' · ')}</p>
                                        {m.mix_detalhe.usa_grids && <p className="text-[9.5px] text-gray-400 mt-0.5">grids: {m.mix_detalhe.denominador_grids.join(', ')}</p>}
                                      </div>
                                    </div>
                                    <p className="text-[10px] uppercase text-gray-500 mb-0.5">Produtos vendidos no período (top {m.mix_detalhe.produtos_vendidos.length})</p>
                                    <div className="max-h-40 overflow-y-auto rounded border border-purple-100 bg-white">
                                      <table className="w-full text-[10.5px]">
                                        <tbody>
                                          {m.mix_detalhe.produtos_vendidos.length === 0 && (
                                            <tr><td className="px-2 py-2 text-rose-700 italic">Nenhuma venda no período/filtro da meta</td></tr>
                                          )}
                                          {m.mix_detalhe.produtos_vendidos.map(p => (
                                            <tr key={p.grid} className={cn('border-b border-gray-50', (p.bate_num || p.bate_den) ? 'bg-emerald-50/40' : 'bg-white')}>
                                              <td className="px-2 py-0.5">
                                                <span className="font-mono">{p.nome}</span>
                                                <span className="text-gray-400 ml-1.5">#{p.grid}</span>
                                              </td>
                                              <td className="px-2 py-0.5 text-right tabular-nums w-20">{p.qtd.toFixed(2)}</td>
                                              <td className="px-2 py-0.5 w-16 text-center">
                                                {p.bate_num && <span className="text-emerald-700 font-bold" title="Casou com numerador">N</span>}
                                                {p.bate_den && <span className="text-blue-700 font-bold ml-1" title="Casou com denominador">D</span>}
                                                {!p.bate_num && !p.bate_den && <span className="text-gray-300">—</span>}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </FragmentRow>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
              {/* Regras */}
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Regras do esquema ({d.regras.length})</p>
                {d.regras.map(r => (
                  <div key={r.regra_id} className={cn('border rounded px-3 py-2 text-[11.5px] space-y-1', r.casaria ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">{r.nome}</p>
                      <span className={cn('px-2 py-0.5 rounded text-[10.5px] font-bold', r.casaria ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700')}>
                        {r.casaria ? 'CASARIA' : 'NÃO CASA'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600">{r.motivo_geral}</p>
                    <div className="text-[10.5px] text-gray-500 font-mono">
                      <span>meta_ref: {r.meta_referencia_nome ?? '—'}</span>
                      {' · '}
                      <span>realizado_escopo: {r.realizado_escopo}</span>
                      {' · '}
                      <span>atingimento resolvido: {r.atingimento_resolvido != null ? `${r.atingimento_resolvido.toFixed(1)}%` : 'null'}</span>
                    </div>
                    {r.condicoes_avaliadas.length > 0 && (
                      <ul className="space-y-0.5 mt-1">
                        {r.condicoes_avaliadas.map((c, i) => (
                          <li key={i} className={cn('px-2 py-1 rounded text-[10.5px] font-mono', c.resultado ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
                            {c.resultado ? '✓ ' : '✗ '}
                            {c.field} {c.operator} {String(c.value)} {' — ctx='}<b>{String(c.valor_ctx)}</b>
                            {c.motivo && <span className="block text-[10px] mt-0.5 opacity-80">{c.motivo}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Modal: Vendas por Grupo → Subgrupo → Produto (sem combustíveis) ─────────
//
// Aberto sob demanda a partir do bloco expandido do vendedor no relatório.
// Busca as vendas do vendedor no endpoint `/vendas-por-vendedor` (já filtrado
// para excluir combustíveis no servidor) e agrega por (Grupo → Subgrupo →
// Produto) em runtime para mostrar a árvore.

interface VendaSimples {
  produto_nome:     string
  grupo_produto:    string | null
  subgrupo_produto: string | null
  produto_tipo:     string | null
  quantidade:       number
  valor_total:      number
}

interface ProdutoAgg {
  produto:      string
  qtd:          number
  faturamento:  number
}
interface SubgrupoAgg {
  subgrupo:     string
  produtos:     ProdutoAgg[]
  qtd:          number
  faturamento:  number
}
interface GrupoAgg {
  grupo:        string
  subgrupos:    SubgrupoAgg[]
  qtd:          number
  faturamento:  number
}

function agregarPorGrupoSubgrupoProduto(vendas: VendaSimples[]): GrupoAgg[] {
  type Tmp = Map<string, Map<string, Map<string, ProdutoAgg>>>
  const map: Tmp = new Map()
  for (const v of vendas) {
    const g = v.grupo_produto?.trim()    || '(sem grupo)'
    const s = v.subgrupo_produto?.trim() || '(sem subgrupo)'
    const p = v.produto_nome
    if (!map.has(g))      map.set(g, new Map())
    if (!map.get(g)!.has(s)) map.get(g)!.set(s, new Map())
    const prodMap = map.get(g)!.get(s)!
    const ex = prodMap.get(p)
    if (ex) {
      ex.qtd         += v.quantidade
      ex.faturamento += v.valor_total
    } else {
      prodMap.set(p, { produto: p, qtd: v.quantidade, faturamento: v.valor_total })
    }
  }

  const grupos: GrupoAgg[] = []
  for (const [gName, subMap] of map) {
    const subgrupos: SubgrupoAgg[] = []
    for (const [sName, prodMap] of subMap) {
      const produtos = Array.from(prodMap.values()).sort((a, b) => b.faturamento - a.faturamento)
      subgrupos.push({
        subgrupo:    sName,
        produtos,
        qtd:         produtos.reduce((s, x) => s + x.qtd,         0),
        faturamento: produtos.reduce((s, x) => s + x.faturamento, 0),
      })
    }
    subgrupos.sort((a, b) => b.faturamento - a.faturamento)
    grupos.push({
      grupo:       gName,
      subgrupos,
      qtd:         subgrupos.reduce((s, x) => s + x.qtd,         0),
      faturamento: subgrupos.reduce((s, x) => s + x.faturamento, 0),
    })
  }
  grupos.sort((a, b) => b.faturamento - a.faturamento)
  return grupos
}

interface VendasPorGrupoModalProps {
  vendedorId:   string
  vendedorNome: string
  postoId:      string
  dataIni:      string
  dataFim:      string
  onClose:      () => void
}
function VendasPorGrupoModal({ vendedorId, vendedorNome, postoId, dataIni, dataFim, onClose }: VendasPorGrupoModalProps) {
  const [mounted, setMounted]   = useState(false)
  const [vendas,  setVendas]    = useState<VendaSimples[]>([])
  const [loading, setLoading]   = useState(true)
  const [erro,    setErro]      = useState<string | null>(null)
  const [abertos, setAbertos]   = useState<Set<string>>(new Set())  // grupos expandidos
  const [subAbertos, setSubAbertos] = useState<Set<string>>(new Set())  // chave: `${grupo}::${subgrupo}`

  // Esc fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { setMounted(true) }, [])

  // Fetch on mount
  useEffect(() => {
    const params = new URLSearchParams({
      posto_id:    postoId,
      data_ini:    dataIni,
      data_fim:    dataFim,
      vendedor_id: vendedorId,
      excluir_combustiveis: '1',
    })
    fetch(`/api/comissionamento/vendas-por-vendedor?${params}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setErro(json.error); return }
        setVendas((json.vendas ?? []) as VendaSimples[])
      })
      .catch(e => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [postoId, dataIni, dataFim, vendedorId])

  const grupos = useMemo(() => agregarPorGrupoSubgrupoProduto(vendas), [vendas])

  function toggleGrupo(g: string) {
    setAbertos(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g); else next.add(g)
      return next
    })
  }
  function toggleSub(key: string) {
    setSubAbertos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function expandirTudo() {
    setAbertos(new Set(grupos.map(g => g.grupo)))
    setSubAbertos(new Set(grupos.flatMap(g => g.subgrupos.map(s => `${g.grupo}::${s.subgrupo}`))))
  }
  function recolherTudo() { setAbertos(new Set()); setSubAbertos(new Set()) }

  const totalQtd      = grupos.reduce((s, g) => s + g.qtd,         0)
  const totalFat      = grupos.reduce((s, g) => s + g.faturamento, 0)

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-orange-600" />
            <div>
              <h3 className="text-[13.5px] font-semibold text-gray-800">Vendas por grupo de produto</h3>
              <p className="text-[11px] text-gray-500">{vendedorNome} <span className="text-gray-400">· sem combustíveis</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-[12.5px]">Carregando vendas…</span>
            </div>
          ) : erro ? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12.5px]">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{erro}</p>
            </div>
          ) : grupos.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic text-center py-8">Sem vendas (excluindo combustíveis) no período.</p>
          ) : (
            <>
              <div className="flex items-center justify-end gap-2 text-[10.5px] mb-1.5">
                <button onClick={expandirTudo} className="text-orange-600 hover:text-orange-700 font-medium">Expandir todos</button>
                <span className="text-gray-300">·</span>
                <button onClick={recolherTudo} className="text-gray-500 hover:text-gray-700 font-medium">Recolher todos</button>
              </div>

              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-gray-50">
                    <tr className="text-[10.5px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="text-left  px-3 py-2">Grupo / Subgrupo / Produto</th>
                      <th className="text-right px-3 py-2 w-24">Quantidade</th>
                      <th className="text-right px-3 py-2 w-32">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grupos.map(g => {
                      const openG = abertos.has(g.grupo)
                      return (
                        <FragmentRow key={g.grupo}>
                          <tr onClick={() => toggleGrupo(g.grupo)}
                            className="bg-gray-50/60 hover:bg-orange-50/30 cursor-pointer">
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                {openG ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                                <span className="font-semibold text-gray-800 truncate" title={g.grupo}>{g.grupo}</span>
                                <span className="text-[10px] text-gray-400 font-normal">
                                  ({g.subgrupos.length} subgrupo{g.subgrupos.length === 1 ? '' : 's'})
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-700">{fmtQtd(g.qtd)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-gray-900">{fmtBRL(g.faturamento)}</td>
                          </tr>

                          {openG && g.subgrupos.map(s => {
                            const subKey = `${g.grupo}::${s.subgrupo}`
                            const openS  = subAbertos.has(subKey)
                            return (
                              <FragmentRow key={subKey}>
                                <tr onClick={() => toggleSub(subKey)}
                                  className="bg-white hover:bg-orange-50/20 cursor-pointer">
                                  <td className="px-3 py-1 pl-9">
                                    <div className="flex items-center gap-1.5">
                                      {openS ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                      <span className="text-gray-700 truncate" title={s.subgrupo}>
                                        {s.subgrupo === '(sem subgrupo)'
                                          ? <span className="italic text-gray-400">{s.subgrupo}</span>
                                          : s.subgrupo}
                                      </span>
                                      <span className="text-[10px] text-gray-400">
                                        ({s.produtos.length} produto{s.produtos.length === 1 ? '' : 's'})
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-1 text-right tabular-nums text-gray-700">{fmtQtd(s.qtd)}</td>
                                  <td className="px-3 py-1 text-right tabular-nums font-semibold text-gray-800">{fmtBRL(s.faturamento)}</td>
                                </tr>

                                {openS && s.produtos.map(p => (
                                  <tr key={`${subKey}::${p.produto}`} className="hover:bg-orange-50/20">
                                    <td className="px-3 py-1 pl-14 text-gray-600 truncate max-w-[300px]" title={p.produto}>{p.produto}</td>
                                    <td className="px-3 py-1 text-right tabular-nums text-gray-600">{fmtQtd(p.qtd)}</td>
                                    <td className="px-3 py-1 text-right tabular-nums text-gray-700">{fmtBRL(p.faturamento)}</td>
                                  </tr>
                                ))}
                              </FragmentRow>
                            )
                          })}
                        </FragmentRow>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50/60 border-t border-gray-200">
                    <tr className="text-[12px]">
                      <td className="px-3 py-1.5 font-semibold text-gray-700">Total</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-700">{fmtQtd(totalQtd)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold text-gray-900">{fmtBRL(totalFat)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose}
            className="h-8 px-3 rounded border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-white">
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

