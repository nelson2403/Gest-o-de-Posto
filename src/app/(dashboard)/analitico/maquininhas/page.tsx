'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils/cn'
import {
  Smartphone, TrendingUp, AlertCircle, Wrench,
  DollarSign, BarChart2, Percent, Package,
  TrendingDown, Search, Loader2, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { Role } from '@/types/database.types'
import type { DreRow } from '@/app/api/analise-externo/route'

// ── Abas ──────────────────────────────────────────────────────
type TabId = 'maquininhas' | 'dre' | 'alugueis'

const TABS_POR_ROLE: Partial<Record<Role, TabId[]>> = {
  master:         ['maquininhas', 'dre', 'alugueis'],
  adm_financeiro: ['maquininhas', 'dre', 'alugueis'],
}

// ── Tipos ─────────────────────────────────────────────────────
interface MaqRow {
  status: string; valor_aluguel: number | null; posto: string; adquirente: string; empresa: string
}
interface PostoMap { id: string; nome: string; codigo_empresa_externo: string | null }

// ── Constantes ────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { ativo: '#10b981', inativo: '#ef4444', manutencao: '#f59e0b', extraviada: '#6b7280' }
const STATUS_LABEL: Record<string, string>  = { ativo: 'Ativa', inativo: 'Inativa', manutencao: 'Manutenção', extraviada: 'Extraviada' }
const BAR_COLORS = ['#f97316','#3b82f6','#8b5cf6','#10b981','#ec4899','#14b8a6','#f59e0b','#6366f1']

// ── Helpers ───────────────────────────────────────────────────
const fmtBRL  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct  = (v: number) => `${(v ?? 0).toFixed(4).replace(/\.?0+$/, '')}%`
const fmtPct2 = (v: number) => `${(v ?? 0).toFixed(2)}%`

// ── Componentes compartilhados ────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, iconColor, iconBg }: {
  title: string; value: string; sub?: string
  icon: React.ElementType; iconColor: string; iconBg: string
}) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
            <p className="text-[22px] font-bold text-gray-900 mt-1 leading-none tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
          </div>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">{children}</h2>
}
function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('border-gray-200 shadow-sm', className)}>
      <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-[13px] font-semibold text-gray-700">{title}</CardTitle></CardHeader>
      <CardContent className="px-3 pb-4">{children}</CardContent>
    </Card>
  )
}
function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-[12px]">
      {label && <p className="font-semibold text-gray-700 mb-1.5 truncate max-w-[180px]">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ABA DRE (Análise de Taxas)
// ─────────────────────────────────────────────────────────────
function DreDivergenciaBadge({ real, esperada }: { real: number; esperada: number | null }) {
  if (esperada == null || esperada === 0) return <span className="text-gray-400 text-[11px]">—</span>
  const diff = real - esperada
  const abs  = Math.abs(diff)
  if (abs < 0.05) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="w-3 h-3" />{fmtPct(diff)}</span>
  if (abs < 0.3)  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><AlertTriangle className="w-3 h-3" />{diff > 0 ? '+' : ''}{fmtPct(diff)}</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertCircle className="w-3 h-3" />{diff > 0 ? '+' : ''}{fmtPct(diff)}</span>
}

function DreTab() {
  const supabase = createClient()
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(() => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`)
  const [dataFim,    setDataFim]    = useState(() => hoje.toISOString().slice(0, 10))
  const [postos,     setPostos]     = useState<PostoMap[]>([])
  const [postosSel,  setPostosSel]  = useState<string[]>([])
  const [busca,      setBusca]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)
  const [dados,      setDados]      = useState<DreRow[]>([])
  const [mostrarSel, setMostrarSel] = useState(false)

  useEffect(() => {
    supabase.from('postos').select('id, nome, codigo_empresa_externo').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setPostos(data as PostoMap[]) })
  }, [])

  const buscarDados = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const grids = postosSel.length > 0
        ? postos.filter(p => postosSel.includes(p.id) && p.codigo_empresa_externo).map(p => p.codigo_empresa_externo).join(',')
        : postos.filter(p => p.codigo_empresa_externo).map(p => p.codigo_empresa_externo).join(',')
      const params = new URLSearchParams({ dataInicio, dataFim })
      if (grids) params.set('empresaGrids', grids)
      const res  = await fetch(`/api/analise-externo?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setDados(json.data ?? [])
    } catch (e) { setErro(String(e)) }
    finally { setLoading(false) }
  }, [dataInicio, dataFim, postosSel, postos])

  const totais = useMemo(() => {
    const bruto    = dados.reduce((s, r) => s + r.valor_bruto_total, 0)
    const taxas    = dados.reduce((s, r) => s + r.valor_taxas_real, 0)
    const liq      = dados.reduce((s, r) => s + r.valor_liquido, 0)
    const cvs      = dados.reduce((s, r) => s + r.total_cvs, 0)
    const taxaEf   = bruto > 0 ? (taxas / bruto * 100) : 0
    const difTaxas = dados.reduce((s, r) => s + (r.valor_taxas_real - r.valor_taxas_esperado), 0)
    return { bruto, taxas, liq, cvs, taxaEf, difTaxas }
  }, [dados])

  const porPosto = useMemo(() => {
    const map: Record<string, { posto_nome: string; rows: DreRow[]; bruto: number; taxas: number; liq: number; cvs: number }> = {}
    dados.forEach(r => {
      if (!map[r.empresa_grid]) map[r.empresa_grid] = { posto_nome: r.posto_nome, rows: [], bruto: 0, taxas: 0, liq: 0, cvs: 0 }
      map[r.empresa_grid].rows.push(r)
      map[r.empresa_grid].bruto += r.valor_bruto_total
      map[r.empresa_grid].taxas += r.valor_taxas_real
      map[r.empresa_grid].liq   += r.valor_liquido
      map[r.empresa_grid].cvs   += r.total_cvs
    })
    return Object.values(map).sort((a, b) => a.posto_nome.localeCompare(b.posto_nome))
  }, [dados])

  const postosFiltrados = useMemo(() =>
    porPosto.filter(p => !busca || p.posto_nome.toLowerCase().includes(busca.toLowerCase()))
  , [porPosto, busca])

  const divergencias = useMemo(() =>
    dados
      .filter(r => r.taxa_esperada != null && r.taxa_esperada > 0)
      .map(r => ({ ...r, diff: r.taxa_efetiva - (r.taxa_esperada ?? 0) }))
      .filter(r => Math.abs(r.diff) >= 0.1)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5)
  , [dados])

  const togglePosto = (id: string) =>
    setPostosSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">Data início</p>
              <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-8 text-[13px] w-full" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">Data fim</p>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-8 text-[13px] w-full" />
            </div>
            <div className="space-y-1 relative col-span-2 sm:col-span-1">
              <p className="text-[11px] font-medium text-gray-500">
                Postos {postosSel.length > 0 && <span className="text-orange-500">({postosSel.length} sel.)</span>}
              </p>
              <Button variant="outline" size="sm" className="h-8 text-[12px] w-full sm:w-44 justify-between" onClick={() => setMostrarSel(v => !v)}>
                {postosSel.length === 0 ? 'Todos os postos' : `${postosSel.length} selecionados`}
                <span className="text-gray-400">▾</span>
              </Button>
              {mostrarSel && (
                <div className="absolute top-full left-0 z-50 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  <div className="p-2 border-b border-gray-100 flex gap-2">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setPostosSel([])}>Todos</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setPostosSel(postos.filter(p => p.codigo_empresa_externo).map(p => p.id))}>Nenhum</Button>
                  </div>
                  {postos.filter(p => p.codigo_empresa_externo).map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={postosSel.includes(p.id)} onChange={() => togglePosto(p.id)} className="rounded border-gray-300 text-orange-500" />
                      <span className="text-[12px] text-gray-700">{p.nome}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={buscarDados} disabled={loading} className="h-8 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5 mt-auto">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
            {dados.length > 0 && (
              <div className="relative mt-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input placeholder="Filtrar posto..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 pl-8 text-[12px] w-44" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {erro && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700"><strong>Erro:</strong> {erro}</div>}

      {!loading && dados.length === 0 && !erro && (
        <div className="text-center py-16 text-gray-400 text-[13px]">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Selecione o período e clique em <strong>Buscar</strong> para carregar a análise de taxas.
        </div>
      )}

      {dados.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard title="Receita Bruta"   value={fmtBRL(totais.bruto)}  icon={TrendingUp}   iconColor="text-emerald-600" iconBg="bg-emerald-100"
              sub={`${totais.cvs.toLocaleString('pt-BR')} transações`} />
            <KpiCard title="Total de Taxas"  value={fmtBRL(totais.taxas)}  icon={TrendingDown}  iconColor="text-red-600"     iconBg="bg-red-100"
              sub={`${fmtPct2(totais.taxaEf)} efetivo médio`} />
            <KpiCard title="Receita Líquida" value={fmtBRL(totais.liq)}    icon={DollarSign}    iconColor="text-blue-600"    iconBg="bg-blue-100"
              sub={`${(totais.liq / totais.bruto * 100).toFixed(1)}% do bruto`} />
            <KpiCard title="Taxa Efetiva"    value={fmtPct2(totais.taxaEf)} icon={Percent}      iconColor="text-purple-600"  iconBg="bg-purple-100" />
            <KpiCard title="Dif. de Taxas"   value={fmtBRL(Math.abs(totais.difTaxas))}
              icon={totais.difTaxas > 0 ? AlertTriangle : CheckCircle2}
              iconColor={totais.difTaxas > 5 ? 'text-red-600' : totais.difTaxas > 0 ? 'text-amber-600' : 'text-emerald-600'}
              iconBg={totais.difTaxas > 5 ? 'bg-red-100' : totais.difTaxas > 0 ? 'bg-amber-100' : 'bg-emerald-100'}
              sub={totais.difTaxas > 0 ? 'acima do esperado' : totais.difTaxas < 0 ? 'abaixo do esperado' : 'dentro do esperado'} />
          </div>

          {divergencias.length > 0 && (
            <div>
              <SectionTitle>Maiores Divergências de Taxa</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {divergencias.map((d, i) => (
                  <div key={i} className={cn('rounded-lg border p-3.5',
                    Math.abs(d.diff) >= 0.3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200')}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold text-gray-700 truncate max-w-[160px]">{d.posto_nome}</p>
                        <p className="text-[11px] text-gray-500 truncate max-w-[160px]">{d.produto}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Mês: {d.mes}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn('text-[16px] font-bold', d.diff > 0 ? 'text-red-600' : 'text-emerald-600')}>
                          {d.diff > 0 ? '+' : ''}{fmtPct(d.diff)}
                        </p>
                        <p className="text-[10px] text-gray-400">real: {fmtPct(d.taxa_efetiva)} / esp: {fmtPct(d.taxa_esperada ?? 0)}</p>
                        <p className="text-[11px] font-medium text-gray-600 mt-0.5">{fmtBRL(d.valor_bruto_total)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionTitle>DRE por Posto / Forma de Pagamento</SectionTitle>
            <div className="space-y-3">
              {postosFiltrados.map(p => (
                <Card key={p.posto_nome} className="border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-[13px] text-gray-800">{p.posto_nome}</span>
                    <div className="flex items-center gap-4 text-[12px]">
                      <span className="text-gray-500">Bruto: <span className="font-semibold text-gray-800">{fmtBRL(p.bruto)}</span></span>
                      <span className="text-gray-500">Taxas: <span className="font-semibold text-red-600">{fmtBRL(p.taxas)}</span></span>
                      <span className="text-gray-500">Líquido: <span className="font-semibold text-emerald-700">{fmtBRL(p.liq)}</span></span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-gray-100 bg-white">
                          <th className="text-left py-2 px-3 font-semibold text-gray-500">Mês</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-500">Forma de Pgto</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Trans.</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Receita Bruta</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Taxa Real</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Taxa Esp.</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Divergência</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Valor Taxas</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-500">Receita Líquida</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map((r, i) => (
                          <tr key={i} className={cn('border-b border-gray-50 hover:bg-gray-50/60', i % 2 === 0 && 'bg-white')}>
                            <td className="py-2 px-3 text-gray-500 font-mono">{r.mes}</td>
                            <td className="py-2 px-3 font-medium text-gray-700 max-w-[160px] truncate" title={r.produto}>{r.produto}</td>
                            <td className="py-2 px-3 text-right text-gray-600 font-mono">{r.total_cvs.toLocaleString('pt-BR')}</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-gray-800">{fmtBRL(r.valor_bruto_total)}</td>
                            <td className="py-2 px-3 text-right font-mono text-purple-700">{fmtPct(r.taxa_efetiva)}</td>
                            <td className="py-2 px-3 text-right font-mono text-gray-500">{r.taxa_esperada != null ? fmtPct(r.taxa_esperada) : '—'}</td>
                            <td className="py-2 px-3 text-right"><DreDivergenciaBadge real={r.taxa_efetiva} esperada={r.taxa_esperada} /></td>
                            <td className="py-2 px-3 text-right font-mono text-red-600">{fmtBRL(r.valor_taxas_real)}</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700">{fmtBRL(r.valor_liquido)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-semibold border-t border-gray-200">
                          <td className="py-2 px-3 text-gray-600" colSpan={2}>Total {p.posto_nome}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-700">{p.cvs.toLocaleString('pt-BR')}</td>
                          <td className="py-2 px-3 text-right font-mono text-gray-900">{fmtBRL(p.bruto)}</td>
                          <td className="py-2 px-3 text-right font-mono text-purple-800">{p.bruto > 0 ? fmtPct(p.taxas / p.bruto * 100) : '—'}</td>
                          <td colSpan={2} />
                          <td className="py-2 px-3 text-right font-mono text-red-700">{fmtBRL(p.taxas)}</td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-800">{fmtBRL(p.liq)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {postosFiltrados.length > 1 && (
            <Card className="border-orange-200 bg-orange-50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="font-bold text-[14px] text-gray-900">TOTAL GERAL</span>
                  <div className="flex items-center gap-6 text-[13px]">
                    <span className="text-gray-600">Bruto: <span className="font-bold text-gray-900 font-mono">{fmtBRL(totais.bruto)}</span></span>
                    <span className="text-gray-600">Taxa Efetiva: <span className="font-bold text-purple-700 font-mono">{fmtPct2(totais.taxaEf)}</span></span>
                    <span className="text-gray-600">Taxas: <span className="font-bold text-red-600 font-mono">{fmtBRL(totais.taxas)}</span></span>
                    <span className="text-gray-600">Líquido: <span className="font-bold text-emerald-700 font-mono">{fmtBRL(totais.liq)}</span></span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function MaquininhsAnaliticoPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [maqRows, setMaqRows] = useState<MaqRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tabAtiva, setTabAtiva] = useState<TabId>('maquininhas')

  useEffect(() => {
    supabase
      .from('maquininhas')
      .select('status, valor_aluguel, posto:postos(nome, empresa:empresas(nome)), adquirente:adquirentes(nome)')
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = (r: any) => ({ posto: r?.posto?.nome ?? '—', adquirente: r?.adquirente?.nome ?? '—', empresa: r?.posto?.empresa?.nome ?? '—' })
        setMaqRows((data ?? []).map(r => ({ status: r.status, valor_aluguel: r.valor_aluguel ?? null, ...b(r) })))
        setLoading(false)
      })
  }, [])

  // ── KPIs maquininhas ───────────────────────────────────────
  const total    = maqRows.length
  const ativas   = maqRows.filter(r => r.status === 'ativo').length
  const inativas = maqRows.filter(r => r.status === 'inativo').length
  const manut    = maqRows.filter(r => r.status === 'manutencao').length
  const extrav   = maqRows.filter(r => r.status === 'extraviada').length

  // ── KPIs aluguel ───────────────────────────────────────────
  const comAlug     = maqRows.filter(r => r.valor_aluguel !== null)
  const totalMensal = comAlug.reduce((s, r) => s + (r.valor_aluguel ?? 0), 0)
  const mediaAlug   = comAlug.length ? totalMensal / comAlug.length : 0

  // ── Gráficos ───────────────────────────────────────────────
  const pieData = useMemo(() =>
    Object.entries(maqRows.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc }, {}))
      .map(([status, count]) => ({ name: STATUS_LABEL[status] ?? status, value: count, status }))
  , [maqRows])

  const barAdqStatus = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    maqRows.forEach(r => { if (!map[r.adquirente]) map[r.adquirente] = {}; map[r.adquirente][r.status] = (map[r.adquirente][r.status] ?? 0) + 1 })
    return Object.entries(map).map(([adq, counts]) => ({ adq, ...counts }))
  }, [maqRows])

  const barPostoTop = useMemo(() => {
    const map: Record<string, number> = {}
    maqRows.forEach(r => { map[r.posto] = (map[r.posto] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([posto, total]) => ({ posto, total }))
  }, [maqRows])

  const barAlugAdq = useMemo(() => {
    const map: Record<string, number> = {}
    comAlug.forEach(r => { map[r.adquirente] = (map[r.adquirente] ?? 0) + (r.valor_aluguel ?? 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([adq, total]) => ({ adq, total }))
  }, [comAlug])

  const barAlugPosto = useMemo(() => {
    const map: Record<string, number> = {}
    comAlug.forEach(r => { map[r.posto] = (map[r.posto] ?? 0) + (r.valor_aluguel ?? 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([posto, total]) => ({ posto, total }))
  }, [comAlug])

  const tabsPermitidas: TabId[] = role ? (TABS_POR_ROLE[role] ?? []) : []
  const ALL_TABS = [
    { id: 'maquininhas' as TabId, label: 'Maquininhas',    icon: Smartphone },
    { id: 'dre'         as TabId, label: 'Análise de Taxa', icon: BarChart2  },
    { id: 'alugueis'    as TabId, label: 'Aluguéis',        icon: DollarSign },
  ]
  const TABS = ALL_TABS.filter(t => tabsPermitidas.includes(t.id))
  const tabAtivaEfetiva: TabId = TABS.find(t => t.id === tabAtiva)?.id ?? (TABS[0]?.id ?? 'maquininhas')

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }
  const gridProps = { stroke: '#f1f5f9', vertical: false }

  return (
    <div className="animate-fade-in">
      <Header title="Analítico — Maquininhas" description="Análise de maquininhas, taxas e aluguéis" />

      <div className="p-3 md:p-6 space-y-6">
        {/* Abas */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTabAtiva(id)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap',
                tabAtivaEfetiva === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* ── MAQUININHAS ── */}
        {tabAtivaEfetiva === 'maquininhas' && (
          <div className="space-y-6">
            {loading ? <div className="skeleton h-32 rounded-xl w-full" /> : (
              <>
                <SectionTitle>Visão Geral</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <KpiCard title="Total"       value={String(total)}    icon={Smartphone}  iconColor="text-blue-600"    iconBg="bg-blue-100" />
                  <KpiCard title="Ativas"      value={String(ativas)}   icon={TrendingUp}  iconColor="text-emerald-600" iconBg="bg-emerald-100"
                    sub={total ? `${((ativas / total) * 100).toFixed(1)}%` : undefined} />
                  <KpiCard title="Inativas"    value={String(inativas)} icon={AlertCircle} iconColor="text-red-600"     iconBg="bg-red-100" />
                  <KpiCard title="Manutenção"  value={String(manut)}    icon={Wrench}      iconColor="text-amber-600"   iconBg="bg-amber-100" />
                  <KpiCard title="Extraviadas" value={String(extrav)}   icon={Package}     iconColor="text-gray-600"    iconBg="bg-gray-100" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Distribuição por Status">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value"
                          label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {pieData.map((entry, i) => <Cell key={i} fill={STATUS_COLOR[entry.status] ?? '#94a3b8'} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Por Adquirente (status)">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={barAdqStatus} margin={{ left: -10, right: 10, top: 4, bottom: 20 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="adq" tick={tickStyle} angle={-20} textAnchor="end" interval={0} />
                        <YAxis tick={tickStyle} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {Object.entries(STATUS_LABEL).map(([key, label]) => (
                          <Bar key={key} dataKey={key} name={label} stackId="a" fill={STATUS_COLOR[key]}
                            radius={key === 'extraviada' ? [4,4,0,0] : undefined} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <ChartCard title={`Top ${barPostoTop.length} Postos por Quantidade`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barPostoTop} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
                      <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={tickStyle} allowDecimals={false} />
                      <YAxis dataKey="posto" type="category" tick={tickStyle} width={150} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="total" name="Maquininhas" fill="#f97316" radius={[0,4,4,0]}
                        label={{ position: 'right', fontSize: 11, fill: '#94a3b8' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </>
            )}
          </div>
        )}

        {/* ── ANÁLISE DE TAXA (DRE) ── */}
        {tabAtivaEfetiva === 'dre' && <DreTab />}

        {/* ── ALUGUÉIS ── */}
        {tabAtivaEfetiva === 'alugueis' && (
          <div className="space-y-6">
            <SectionTitle>Resumo de Aluguéis</SectionTitle>
            {comAlug.length === 0 ? (
              <Card className="border-gray-200"><CardContent className="p-8 text-center text-gray-400">Nenhuma maquininha com valor de aluguel cadastrado.</CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <KpiCard title="Total Mensal" value={fmtBRL(totalMensal)} icon={DollarSign} iconColor="text-emerald-600" iconBg="bg-emerald-100"
                    sub={`${(totalMensal * 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / ano`} />
                  <KpiCard title="Com Aluguel" value={String(comAlug.length)} icon={Smartphone} iconColor="text-blue-600" iconBg="bg-blue-100"
                    sub={`${((comAlug.length / total) * 100).toFixed(1)}% do total`} />
                  <KpiCard title="Média por Maquininha" value={fmtBRL(mediaAlug)} icon={BarChart2} iconColor="text-purple-600" iconBg="bg-purple-100" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Custo Total por Adquirente (R$/mês)">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={barAlugAdq} margin={{ left: -10, right: 20, top: 4, bottom: 20 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="adq" tick={tickStyle} angle={-15} textAnchor="end" interval={0} />
                        <YAxis tick={tickStyle} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
                        <Bar dataKey="total" name="Total Mensal" radius={[4,4,0,0]}>
                          {barAlugAdq.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Custo por Adquirente — Proporção">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={barAlugAdq} cx="50%" cy="50%" innerRadius={65} outerRadius={105} paddingAngle={3} dataKey="total" nameKey="adq"
                          label={({ name, percent }: { name?: string; percent?: number }) => `${(name ?? '').split(' ')[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {barAlugAdq.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <ChartCard title={`Top ${barAlugPosto.length} Postos — Custo Mensal de Aluguel`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barAlugPosto} layout="vertical" margin={{ left: 0, right: 60, top: 4, bottom: 4 }}>
                      <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={tickStyle} tickFormatter={v => `R$${v}`} />
                      <YAxis dataKey="posto" type="category" tick={tickStyle} width={150} />
                      <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
                      <Bar dataKey="total" name="Total Mensal" fill="#10b981" radius={[0,4,4,0]}
                        label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: (v: unknown) => fmtBRL(Number(v)) }} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
