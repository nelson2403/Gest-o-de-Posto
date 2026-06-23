'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/hooks/use-toast'
import {
  Loader2, AlertCircle, RefreshCw, Building2, ClipboardList, Trophy,
  DollarSign, Percent, Receipt, TrendingUp, Target, Users as UsersIcon,
} from 'lucide-react'
import type { Esquema } from '@/app/api/comissionamento/esquemas/route'
import { PostoCombobox } from './_components/PostoCombobox'

// ── Tipos locais (sem importar a engine pesada no client) ───────────────────

interface Posto { id: string; nome: string; codigo_empresa_externo: string | null }

interface AtingimentoDetalhe {
  meta_id:         string
  meta_nome:       string
  campo:           'faturamento' | 'quantidade' | 'margem' | 'mix'
  membro_id:       string
  vendedor_id:     string
  meta_individual: number
  realizado:       number
  atingimento:     number
  period_start:    string
  period_end:      string
}

interface VendedorResumo {
  vendedor_id:    string
  vendedor_nome:  string
  membro_id:      string | null
  vendas_count:   number
  quantidade:     number
  faturamento:    number
  custo:          number
  lucro_bruto:    number
  margem:         number
  comissao_total: number
  atingimentos:   AtingimentoDetalhe[]
}

interface CalcularResponse {
  postoId:           string
  esquemaId:         string
  dataIni:           string
  dataFim:           string
  totais: {
    qtdVendas:        number
    faturamento:      number
    custo:            number
    lucroBruto:       number
    margem:           number
    comissaoTotal:    number
    qtdRegrasAtivas:  number
    qtdRegrasCasaram: number
  }
  resumoPorVendedor: VendedorResumo[]
  atingimentos:      AtingimentoDetalhe[]
  qtdRegras:         number
  qtdMetas:          number
  qtdMembros:        number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

function fmtIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function defaultPeriodo() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return { dataIni: fmtIsoDate(ini), dataFim: fmtIsoDate(hoje) }
}

const CAMPO_LABEL: Record<AtingimentoDetalhe['campo'], string> = {
  faturamento: 'Faturamento', quantidade: 'Quantidade', margem: 'Margem', mix: 'Mix',
}

function valorPorCampo(v: number, campo: AtingimentoDetalhe['campo']): string {
  if (campo === 'faturamento') return fmtBRL(v)
  if (campo === 'margem')      return fmtPct(v)
  return fmtQtd(v)
}

// ── Componente ──────────────────────────────────────────────────────────────

export default function ComissionamentoDashboardPage() {
  const { dataIni: iniDef, dataFim: fimDef } = defaultPeriodo()

  const [postos,   setPostos]   = useState<Posto[]>([])
  const [esquemas, setEsquemas] = useState<Esquema[]>([])
  const [postoId,   setPostoId]   = useState<string>('')
  const [esquemaId, setEsquemaId] = useState<string>('')
  const [dataIni,   setDataIni]   = useState(iniDef)
  const [dataFim,   setDataFim]   = useState(fimDef)

  const [data,    setData]    = useState<CalcularResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  // ── Carrega postos + esquemas uma vez ─────────────────────────────────────
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

      const eList = ((eResp.esquemas ?? []) as Esquema[]).filter(e => e.status === 'ativo')
      setEsquemas(eList)
    }).catch(() => toast({ variant: 'destructive', title: 'Erro ao carregar configuração' }))
  }, [])

  // Filtra esquemas vinculados ao posto selecionado (escolhe auto o primeiro)
  const esquemasDoPosto = useMemo(() => {
    if (!postoId) return [] as Esquema[]
    return esquemas.filter(e => !e.posto_ids || e.posto_ids.length === 0 || e.posto_ids.includes(postoId))
  }, [esquemas, postoId])

  useEffect(() => {
    // se o esquema atual não pertence mais à lista do posto, seleciona o primeiro
    if (esquemasDoPosto.length === 0) { setEsquemaId(''); return }
    if (!esquemasDoPosto.some(e => e.id === esquemaId)) {
      setEsquemaId(esquemasDoPosto[0].id)
    }
  }, [esquemasDoPosto, esquemaId])

  // ── Calcula ───────────────────────────────────────────────────────────────
  const calcular = useCallback(async () => {
    if (!postoId || !esquemaId || !dataIni || !dataFim) return
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams({
        posto_id: postoId, esquema_id: esquemaId, data_ini: dataIni, data_fim: dataFim,
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

  useEffect(() => { if (postoId && esquemaId) calcular() }, [calcular, postoId, esquemaId])

  // ── Atingimento agregado por meta (média ponderada por meta individual) ──
  const metasAgregadas = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { meta_nome: string; campo: AtingimentoDetalhe['campo']; total_meta: number; total_realizado: number; vendedores: number }>()
    for (const a of data.atingimentos) {
      const cur = map.get(a.meta_id) ?? {
        meta_nome: a.meta_nome, campo: a.campo, total_meta: 0, total_realizado: 0, vendedores: 0,
      }
      cur.total_meta      += a.meta_individual
      cur.total_realizado += a.realizado
      cur.vendedores      += 1
      map.set(a.meta_id, cur)
    }
    return Array.from(map.entries()).map(([id, m]) => ({
      meta_id:        id,
      meta_nome:      m.meta_nome,
      campo:          m.campo,
      total_meta:     m.total_meta,
      total_realizado: m.total_realizado,
      vendedores:     m.vendedores,
      atingimento:    m.total_meta > 0 ? (m.total_realizado / m.total_meta) * 100 : 0,
    })).sort((a, b) => b.atingimento - a.atingimento)
  }, [data])

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Comissionamento"
        description="Visão geral de comissões, vendas e atingimento de metas"
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
              {esquemasDoPosto.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">Nenhum esquema ativo para este posto</div>}
              {esquemasDoPosto.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
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

        <Button
          onClick={calcular}
          disabled={loading || !postoId || !esquemaId}
          className="h-9 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[12.5px]"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Recalcular
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {erro && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Erro ao calcular</p>
              <p className="text-[12px] opacity-80">{erro}</p>
            </div>
            <button onClick={calcular} className="text-[12px] font-medium underline">Tentar novamente</button>
          </div>
        )}

        {esquemas.length === 0 && !loading && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[13px]">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>Nenhum esquema ativo. Crie e ative um esquema em <strong>Comissionamento → Esquemas</strong> antes de calcular.</p>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-[13px]">Calculando comissões…</span>
          </div>
        )}

        {data && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard
                title="Comissão total"
                value={fmtBRL(data.totais.comissaoTotal)}
                sub={`${data.totais.qtdRegrasCasaram}/${data.totais.qtdRegrasAtivas} regras casaram`}
                icon={Trophy} cor="orange"
              />
              <KpiCard
                title="Faturamento"
                value={fmtBRL(data.totais.faturamento)}
                sub={`${fmtQtd(data.totais.qtdVendas)} vendas`}
                icon={DollarSign} cor="blue"
              />
              <KpiCard
                title="Lucro bruto"
                value={fmtBRL(data.totais.lucroBruto)}
                sub={`Margem ${fmtPct(data.totais.margem)}`}
                icon={TrendingUp} cor="green"
              />
              <KpiCard
                title="Comissão / Faturamento"
                value={data.totais.faturamento > 0
                  ? fmtPct((data.totais.comissaoTotal / data.totais.faturamento) * 100)
                  : '—'}
                sub="Custo de comissão"
                icon={Percent} cor="purple"
              />
              <KpiCard
                title="Vendedores ativos"
                value={fmtQtd(data.resumoPorVendedor.length)}
                sub={`${data.qtdMembros} membros · ${data.qtdMetas} metas`}
                icon={UsersIcon} cor="rose"
              />
            </div>

            {/* Top vendedores */}
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-gray-900">Vendedores</p>
                  <p className="text-[11.5px] text-gray-500">
                    Ordenado por comissão total
                  </p>
                </div>
                {data.resumoPorVendedor.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[12.5px] text-gray-400 italic">
                    Nenhuma venda no período
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
                          <th className="text-left  px-4 py-2.5">Vendedor</th>
                          <th className="text-right px-4 py-2.5 w-20">Vendas</th>
                          <th className="text-right px-4 py-2.5 w-28">Faturamento</th>
                          <th className="text-right px-4 py-2.5 w-28 hidden sm:table-cell">Lucro</th>
                          <th className="text-right px-4 py-2.5 w-20 hidden sm:table-cell">Margem</th>
                          <th className="text-right px-4 py-2.5 w-28">Comissão</th>
                          <th className="text-right px-4 py-2.5 w-24 hidden md:table-cell">Atingim.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.resumoPorVendedor
                          .sort((a, b) => b.comissao_total - a.comissao_total)
                          .map(v => {
                            const atingMedio = v.atingimentos.length > 0
                              ? v.atingimentos.reduce((s, a) => s + a.atingimento, 0) / v.atingimentos.length
                              : null
                            return (
                              <tr key={v.vendedor_id} className="hover:bg-orange-50/30">
                                <td className="px-4 py-2">
                                  <p className="font-semibold text-gray-900 truncate">{v.vendedor_nome}</p>
                                  {!v.membro_id && (
                                    <p className="text-[10.5px] text-amber-600 italic">não cadastrado em membros</p>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmtQtd(v.vendas_count)}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-gray-800 font-medium">{fmtBRL(v.faturamento)}</td>
                                <td className={cn('px-4 py-2 text-right tabular-nums hidden sm:table-cell', v.lucro_bruto >= 0 ? 'text-emerald-700' : 'text-rose-600')}>
                                  {fmtBRL(v.lucro_bruto)}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums text-gray-600 hidden sm:table-cell">{fmtPct(v.margem)}</td>
                                <td className="px-4 py-2 text-right tabular-nums font-bold text-orange-700">{fmtBRL(v.comissao_total)}</td>
                                <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell">
                                  {atingMedio == null
                                    ? <span className="text-gray-300">—</span>
                                    : <span className={cn(
                                        atingMedio >= 100 ? 'text-emerald-600' : atingMedio >= 70 ? 'text-amber-600' : 'text-gray-600',
                                        'font-semibold',
                                      )}>{fmtPct(atingMedio)}</span>
                                  }
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Metas — atingimento agregado */}
            {metasAgregadas.length > 0 && (
              <Card className="border-gray-200 shadow-sm">
                <CardContent className="p-0">
                  <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-emerald-500" />
                      Metas
                    </p>
                    <p className="text-[11.5px] text-gray-500">
                      {metasAgregadas.length} meta{metasAgregadas.length === 1 ? '' : 's'} ativa{metasAgregadas.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                    {metasAgregadas.map(m => {
                      const corPct = m.atingimento >= 100 ? 'bg-emerald-500'
                                  : m.atingimento >= 70  ? 'bg-amber-500'
                                  : 'bg-gray-300'
                      const corTxt = m.atingimento >= 100 ? 'text-emerald-700'
                                  : m.atingimento >= 70  ? 'text-amber-700'
                                  : 'text-gray-600'
                      return (
                        <div key={m.meta_id} className="border border-gray-200 rounded-xl p-3 bg-gray-50/30">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px] font-semibold text-gray-900 truncate">{m.meta_nome}</p>
                              <p className="text-[10.5px] text-gray-500 mt-0.5">{CAMPO_LABEL[m.campo]} · {m.vendedores} vendedor{m.vendedores === 1 ? '' : 'es'}</p>
                            </div>
                            <span className={cn('text-[13px] font-bold tabular-nums', corTxt)}>{fmtPct(m.atingimento)}</span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={cn('h-full transition-all', corPct)} style={{ width: `${Math.min(m.atingimento, 100)}%` }} />
                          </div>
                          <p className="text-[10.5px] text-gray-500 mt-1.5 tabular-nums">
                            {valorPorCampo(m.total_realizado, m.campo)} / {valorPorCampo(m.total_meta, m.campo)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

      </div>
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string
  value: string
  sub:   string
  icon:  React.ElementType
  cor:   'orange' | 'blue' | 'green' | 'purple' | 'rose'
}
const KPI_CORES: Record<KpiCardProps['cor'], { bg: string; texto: string }> = {
  orange: { bg: 'bg-orange-50',  texto: 'text-orange-600'  },
  blue:   { bg: 'bg-blue-50',    texto: 'text-blue-600'    },
  green:  { bg: 'bg-emerald-50', texto: 'text-emerald-600' },
  purple: { bg: 'bg-purple-50',  texto: 'text-purple-600'  },
  rose:   { bg: 'bg-rose-50',    texto: 'text-rose-600'    },
}

function KpiCard({ title, value, sub, icon: Icon, cor }: KpiCardProps) {
  const c = KPI_CORES[cor]
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide truncate">{title}</p>
            <p className="text-[18px] sm:text-[22px] font-bold text-gray-900 mt-1 leading-none tabular-nums">{value}</p>
            <p className="text-[10.5px] text-gray-400 mt-1.5">{sub}</p>
          </div>
          <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0', c.bg)}>
            <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', c.texto)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
