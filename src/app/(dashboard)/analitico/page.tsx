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
  TrendingDown, Search, Loader2, AlertTriangle, CheckCircle2, FileBarChart,
  Scale, Megaphone, Wallet, ShoppingCart, ReceiptText, Truck, Clock,
} from 'lucide-react'
import { RelatoriosGerenciaisTab } from '@/components/analitico/RelatoriosGerenciaisTab'
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { Role } from '@/types/database.types'
import type { DreRow } from '@/app/api/analise-externo/route'

// ── Abas visíveis por perfil ───────────────────────────────────
type TabId =
  | 'maquininhas' | 'relatorios'
  | 'fiscal' | 'contas_pagar' | 'marketing' | 'compras' | 'contas_receber' | 'transpombal'

const TABS_POR_ROLE: Partial<Record<Role, TabId[]>> = {
  master:           ['relatorios', 'maquininhas', 'contas_receber', 'fiscal', 'contas_pagar', 'marketing', 'compras', 'transpombal'],
  adm_financeiro:   ['relatorios', 'maquininhas', 'contas_receber'],
  adm_fiscal:       ['fiscal'],
  adm_marketing:    ['marketing'],
  adm_transpombal:  ['transpombal', 'compras'],
  adm_contas_pagar: ['contas_pagar'],
}

// ── Tipos internos ────────────────────────────────────────────
interface MaqRow {
  status: string; valor_aluguel: number | null; posto: string; adquirente: string; empresa: string
}
interface PostoMap { id: string; nome: string; codigo_empresa_externo: string | null }

// ── Cores ─────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = { ativo: '#10b981', inativo: '#ef4444', manutencao: '#f59e0b', extraviada: '#6b7280' }
const STATUS_LABEL: Record<string, string>  = { ativo: 'Ativa', inativo: 'Inativa', manutencao: 'Manutenção', extraviada: 'Extraviada' }
const BAR_COLORS = ['#f97316','#3b82f6','#8b5cf6','#10b981','#ec4899','#14b8a6','#f59e0b','#6366f1']

// ── Helpers ───────────────────────────────────────────────────
const fmtBRL  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct  = (v: number) => `${(v ?? 0).toFixed(4).replace(/\.?0+$/, '')}%`
const fmtPct2 = (v: number) => `${(v ?? 0).toFixed(2)}%`

// ── Componentes reutilizáveis ─────────────────────────────────
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
// DRE (Análise de Taxas) — usado dentro do grupo Maquininhas
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

  return (
    <div className="space-y-5">
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
            <KpiCard title="Receita Bruta"   value={fmtBRL(totais.bruto)}   icon={TrendingUp}   iconColor="text-emerald-600" iconBg="bg-emerald-100"
              sub={`${totais.cvs.toLocaleString('pt-BR')} transações`} />
            <KpiCard title="Total de Taxas"  value={fmtBRL(totais.taxas)}   icon={TrendingDown}  iconColor="text-red-600"     iconBg="bg-red-100"
              sub={`${fmtPct2(totais.taxaEf)} efetivo médio`} />
            <KpiCard title="Receita Líquida" value={fmtBRL(totais.liq)}     icon={DollarSign}    iconColor="text-blue-600"    iconBg="bg-blue-100"
              sub={`${(totais.liq / totais.bruto * 100).toFixed(1)}% do bruto`} />
            <KpiCard title="Taxa Efetiva"    value={fmtPct2(totais.taxaEf)} icon={Percent}       iconColor="text-purple-600"  iconBg="bg-purple-100" />
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

// ─────────────────────────────────────────────────────────────
// ABA MAQUININHAS — agrupa Maquininhas + DRE + Aluguéis
// ─────────────────────────────────────────────────────────────
type MaqSubTab = 'graficos' | 'dre' | 'alugueis'

function MaquininhsGroupTab() {
  const supabase = createClient()
  const [subTab,   setSubTab]   = useState<MaqSubTab>('graficos')
  const [maqRows,  setMaqRows]  = useState<MaqRow[]>([])
  const [loading,  setLoading]  = useState(true)

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

  const total    = maqRows.length
  const ativas   = maqRows.filter(r => r.status === 'ativo').length
  const inativas = maqRows.filter(r => r.status === 'inativo').length
  const manut    = maqRows.filter(r => r.status === 'manutencao').length
  const extrav   = maqRows.filter(r => r.status === 'extraviada').length
  const comAlug     = maqRows.filter(r => r.valor_aluguel !== null)
  const totalMensal = comAlug.reduce((s, r) => s + (r.valor_aluguel ?? 0), 0)
  const mediaAlug   = comAlug.length ? totalMensal / comAlug.length : 0

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

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }
  const gridProps = { stroke: '#f1f5f9', vertical: false }

  const SUB_TABS: { id: MaqSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'graficos', label: 'Maquininhas',    icon: Smartphone },
    { id: 'dre',      label: 'Análise de Taxa', icon: BarChart2  },
    { id: 'alugueis', label: 'Aluguéis',        icon: DollarSign },
  ]

  return (
    <div className="space-y-5">
      {/* Sub-tabs secundários */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-all whitespace-nowrap border-b-2 -mb-px',
              subTab === id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Gráficos de Maquininhas ── */}
      {subTab === 'graficos' && (
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

      {/* ── Análise de Taxa (DRE) ── */}
      {subTab === 'dre' && <DreTab />}

      {/* ── Aluguéis ── */}
      {subTab === 'alugueis' && (
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
  )
}

// ─────────────────────────────────────────────────────────────
// ABA CONTAS A RECEBER
// ─────────────────────────────────────────────────────────────
function ContasReceberTab() {
  const hoje = new Date()
  const [dataIni, setDataIni] = useState(() => `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`)
  const [dataFim, setDataFim] = useState(() => hoje.toISOString().slice(0,10))
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string|null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [resumo,  setResumo]  = useState<any[]>([])

  const buscar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const params = new URLSearchParams({ data_ini: dataIni, data_fim: dataFim })
      const res  = await fetch(`/api/contas-receber/formas?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResumo(json.resumo ?? [])
    } catch(e) { setErro(String(e)) }
    finally { setLoading(false) }
  }, [dataIni, dataFim])

  useEffect(() => { buscar() }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recebidos     = resumo.filter((r: any) => r.pago)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendentes     = resumo.filter((r: any) => !r.pago)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalRecebido = recebidos.reduce((s: number, r: any) => s + r.valor_total, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPendente = pendentes.reduce((s: number, r: any) => s + r.valor_total, 0)

  const porPosto = useMemo(() => {
    const map: Record<string, { recebido: number; pendente: number }> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of resumo as any[]) {
      if (!map[r.posto_nome]) map[r.posto_nome] = { recebido: 0, pendente: 0 }
      if (r.pago) map[r.posto_nome].recebido += r.valor_total
      else        map[r.posto_nome].pendente += r.valor_total
    }
    return Object.entries(map)
      .map(([posto, v]) => ({ posto, ...v }))
      .sort((a, b) => (b.recebido + b.pendente) - (a.recebido + a.pendente))
      .slice(0, 12)
  }, [resumo])

  const porGrupo = useMemo(() => {
    const map: Record<string, { recebido: number; pendente: number }> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of resumo as any[]) {
      const g = r.grupo ?? r.conta_nome ?? '—'
      if (!map[g]) map[g] = { recebido: 0, pendente: 0 }
      if (r.pago) map[g].recebido += r.valor_total
      else        map[g].pendente += r.valor_total
    }
    return Object.entries(map)
      .map(([grupo, v]) => ({ grupo, ...v }))
      .sort((a, b) => (b.recebido + b.pendente) - (a.recebido + a.pendente))
  }, [resumo])

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }

  return (
    <div className="space-y-5">
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">Data início</p>
              <Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="h-8 text-[13px]" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">Data fim</p>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-8 text-[13px]" />
            </div>
            <Button onClick={buscar} disabled={loading} className="h-8 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5 mt-auto">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700"><strong>Erro:</strong> {erro}</div>}
      {loading && <div className="text-center py-16 text-gray-400 text-[13px]"><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />Carregando...</div>}

      {!loading && resumo.length === 0 && !erro && (
        <div className="text-center py-16 text-gray-400 text-[13px]">
          <ReceiptText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Clique em <strong>Buscar</strong> para carregar contas a receber.
        </div>
      )}

      {!loading && resumo.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard title="Total Recebido" value={fmtBRL(totalRecebido)} icon={CheckCircle2} iconColor="text-emerald-600" iconBg="bg-emerald-100"
              sub={`${recebidos.length} lançamentos`} />
            <KpiCard title="A Receber" value={fmtBRL(totalPendente)} icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-100"
              sub={`${pendentes.length} títulos`} />
            <KpiCard title="Total Geral" value={fmtBRL(totalRecebido + totalPendente)} icon={ReceiptText} iconColor="text-blue-600" iconBg="bg-blue-100"
              sub={`${resumo.length} registros`} />
            <KpiCard title="% Recebido"
              value={totalRecebido + totalPendente > 0 ? fmtPct2(totalRecebido / (totalRecebido + totalPendente) * 100) : '—'}
              icon={TrendingUp} iconColor="text-purple-600" iconBg="bg-purple-100" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Recebimentos por Posto (Top 12)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porPosto} margin={{ left: -10, right: 10, top: 4, bottom: 50 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="posto" tick={tickStyle} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={tickStyle} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="recebido" name="Recebido"  fill="#10b981" stackId="a" />
                  <Bar dataKey="pendente" name="A Receber" fill="#f59e0b" stackId="a" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Por Grupo de Conta">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porGrupo} margin={{ left: -10, right: 10, top: 4, bottom: 50 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="grupo" tick={tickStyle} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={tickStyle} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="recebido" name="Recebido"  fill="#3b82f6" stackId="a" />
                  <Bar dataKey="pendente" name="A Receber" fill="#8b5cf6" stackId="a" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <ChartCard title="Resumo por Posto">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
                    <th className="text-right py-2 px-3 font-semibold text-emerald-600">Recebido</th>
                    <th className="text-right py-2 px-3 font-semibold text-amber-600">A Receber</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500">Total</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500">% Rec.</th>
                  </tr>
                </thead>
                <tbody>
                  {porPosto.map((p, i) => {
                    const tot = p.recebido + p.pendente
                    return (
                      <tr key={i} className={cn('border-b border-gray-50', i % 2 === 0 && 'bg-gray-50/50')}>
                        <td className="py-2 px-3 font-medium text-gray-700">{p.posto}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">{fmtBRL(p.recebido)}</td>
                        <td className="py-2 px-3 text-right font-mono text-amber-600">{fmtBRL(p.pendente)}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-800 font-semibold">{fmtBRL(tot)}</td>
                        <td className="py-2 px-3 text-right font-mono text-purple-600">{tot > 0 ? fmtPct2(p.recebido / tot * 100) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ABA FISCAL
// ─────────────────────────────────────────────────────────────
function FiscalTab() {
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string|null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dados,   setDados]   = useState<any>(null)

  useEffect(() => {
    fetch('/api/fiscal/painel')
      .then(r => r.json())
      .then(json => { if (json.error) throw new Error(json.error); setDados(json) })
      .catch(e => setErro(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-400 text-[13px]"><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />Carregando painel fiscal...</div>
  if (erro) return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700">Erro: {erro}</div>
  if (!dados) return null

  const { totais, pendentes_gerente, aguardando_fiscal, boletos_vencendo, boletos_vencidos } = dados
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sumValor = (arr: any[]) => (arr ?? []).reduce((s: number, r: any) => s + (r.valor_as ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Pend. Gerente"  value={String(totais.pendentes_gerente)} icon={AlertCircle}   iconColor="text-amber-600"  iconBg="bg-amber-100"  sub={fmtBRL(sumValor(pendentes_gerente))} />
        <KpiCard title="Aguard. Fiscal" value={String(totais.aguardando_fiscal)} icon={Clock}          iconColor="text-blue-600"   iconBg="bg-blue-100"   sub={fmtBRL(sumValor(aguardando_fiscal))} />
        <KpiCard title="Vencendo (7d)"  value={String(totais.boletos_vencendo)}  icon={AlertTriangle}  iconColor="text-orange-600" iconBg="bg-orange-100" sub={fmtBRL(sumValor(boletos_vencendo))} />
        <KpiCard title="Vencidos"       value={String(totais.boletos_vencidos)}  icon={AlertCircle}   iconColor="text-red-600"    iconBg="bg-red-100"    sub={fmtBRL(sumValor(boletos_vencidos))} />
        <KpiCard title="Sem Boleto"     value={String(totais.sem_boleto)}        icon={FileBarChart}  iconColor="text-gray-600"   iconBg="bg-gray-100" />
      </div>

      {(boletos_vencidos ?? []).length > 0 && (
        <div>
          <SectionTitle>Boletos Vencidos — Ação Urgente</SectionTitle>
          <Card className="border-red-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-red-50 border-b border-red-100">
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Fornecedor</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">Valor</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">Vencimento</th>
                </tr></thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(boletos_vencidos as any[]).slice(0,30).map((r: any, i: number) => (
                    <tr key={i} className={cn('border-b border-red-50', i%2===0 && 'bg-white')}>
                      <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{r.postos?.nome ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-700 font-medium truncate max-w-[200px]">{r.fornecedor_nome}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-red-700">{fmtBRL(r.valor_as ?? 0)}</td>
                      <td className="py-2 px-3 text-right font-mono text-red-600">{r.boleto_vencimento ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {(boletos_vencendo ?? []).length > 0 && (
        <div>
          <SectionTitle>Vencendo nos Próximos 7 Dias</SectionTitle>
          <Card className="border-amber-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-amber-50 border-b border-amber-100">
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Fornecedor</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">Valor</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">Vencimento</th>
                </tr></thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(boletos_vencendo as any[]).map((r: any, i: number) => (
                    <tr key={i} className={cn('border-b border-amber-50', i%2===0 && 'bg-white')}>
                      <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{r.postos?.nome ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-700 font-medium truncate max-w-[200px]">{r.fornecedor_nome}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-amber-700">{fmtBRL(r.valor_as ?? 0)}</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-600">{r.boleto_vencimento ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {(pendentes_gerente ?? []).length > 0 && (
        <div>
          <SectionTitle>Pendentes de Aprovação (Gerente)</SectionTitle>
          <Card className="border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">Fornecedor</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">Valor</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">Emissão</th>
                </tr></thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(pendentes_gerente as any[]).slice(0,30).map((r: any, i: number) => (
                    <tr key={i} className={cn('border-b border-gray-50', i%2===0 && 'bg-gray-50/30')}>
                      <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{r.postos?.nome ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-700 font-medium truncate max-w-[200px]">{r.fornecedor_nome}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-gray-800">{fmtBRL(r.valor_as ?? 0)}</td>
                      <td className="py-2 px-3 text-right font-mono text-gray-500">{r.data_emissao ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {totais.pendentes_gerente === 0 && totais.boletos_vencidos === 0 && totais.boletos_vencendo === 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-emerald-700">Tudo em dia — nenhum boleto vencido ou pendente urgente.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ABA CONTAS A PAGAR
// ─────────────────────────────────────────────────────────────
function ContasPagarTab() {
  const hoje = new Date()
  const [dataIni, setDataIni] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10))
  const [dataFim, setDataFim] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10))
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string|null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dados,   setDados]   = useState<any>(null)

  const buscar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const params = new URLSearchParams({ vencto_ini: dataIni, vencto_fim: dataFim })
      const res  = await fetch(`/api/analitico/contas-pagar?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setDados(json)
    } catch(e) { setErro(String(e)) }
    finally { setLoading(false) }
  }, [dataIni, dataFim])

  useEffect(() => { buscar() }, [])

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postos: any[] = dados?.postos ?? []
  const totais = dados?.totais ?? { total: 0, a_vencer: 0, em_atraso: 0, pago: 0, qt: 0, qt_atraso: 0 }

  return (
    <div className="space-y-5">
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">Vencto início</p>
              <Input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="h-8 text-[13px]" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-500">Vencto fim</p>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-8 text-[13px]" />
            </div>
            <Button onClick={buscar} disabled={loading} className="h-8 bg-orange-500 hover:bg-orange-600 text-[13px] gap-1.5 mt-auto">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700"><strong>Erro:</strong> {erro}</div>}
      {loading && <div className="text-center py-16 text-gray-400 text-[13px]"><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />Carregando...</div>}

      {!loading && dados && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard title="Total Período" value={fmtBRL(totais.total)}     icon={Wallet}        iconColor="text-blue-600"    iconBg="bg-blue-100"    sub={`${totais.qt} títulos`} />
            <KpiCard title="A Vencer"      value={fmtBRL(totais.a_vencer)}  icon={Clock}          iconColor="text-amber-600"  iconBg="bg-amber-100" />
            <KpiCard title="Em Atraso"     value={fmtBRL(totais.em_atraso)} icon={AlertCircle}   iconColor="text-red-600"    iconBg="bg-red-100"
              sub={totais.qt_atraso > 0 ? `${totais.qt_atraso} títulos` : undefined} />
            <KpiCard title="Já Pago"       value={fmtBRL(totais.pago)}      icon={CheckCircle2}  iconColor="text-emerald-600" iconBg="bg-emerald-100" />
          </div>

          {postos.length > 0 && (
            <>
              <ChartCard title="Contas a Pagar por Posto">
                <ResponsiveContainer width="100%" height={Math.max(240, postos.length * 40)}>
                  <BarChart data={postos.slice(0,15)} layout="vertical" margin={{ left: 0, right: 80, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={tickStyle} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <YAxis dataKey="posto_nome" type="category" tick={tickStyle} width={160} />
                    <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="pago"      name="Pago"      fill="#10b981" stackId="a" />
                    <Bar dataKey="a_vencer"  name="A Vencer"  fill="#f59e0b" stackId="a" />
                    <Bar dataKey="em_atraso" name="Em Atraso" fill="#ef4444" stackId="a" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Detalhamento por Posto">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
                      <th className="text-right py-2 px-3 font-semibold text-emerald-600">Pago</th>
                      <th className="text-right py-2 px-3 font-semibold text-amber-600">A Vencer</th>
                      <th className="text-right py-2 px-3 font-semibold text-red-600">Em Atraso</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Total</th>
                    </tr></thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {postos.map((p: any, i: number) => (
                        <tr key={i} className={cn('border-b border-gray-50', i%2===0 && 'bg-gray-50/40')}>
                          <td className="py-2 px-3 font-medium text-gray-700">{p.posto_nome}</td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700">{fmtBRL(p.pago)}</td>
                          <td className="py-2 px-3 text-right font-mono text-amber-600">{fmtBRL(p.a_vencer)}</td>
                          <td className="py-2 px-3 text-right font-mono text-red-600">{fmtBRL(p.em_atraso)}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-gray-800">{fmtBRL(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}
          {postos.length === 0 && (
            <Card className="border-gray-200"><CardContent className="p-8 text-center text-gray-400">Nenhum título encontrado para o período.</CardContent></Card>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ABA MARKETING
// ─────────────────────────────────────────────────────────────
function MarketingTab() {
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string|null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [saldo,   setSaldo]   = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [acoes,   setAcoes]   = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/marketing/saldo').then(r => r.json()),
      fetch('/api/marketing/acoes?status=aberta').then(r => r.json()),
    ]).then(([s, a]) => {
      if (s.error) throw new Error(s.error)
      setSaldo(s.saldo ?? [])
      setAcoes(a.acoes ?? [])
    }).catch(e => setErro(String(e)))
    .finally(() => setLoading(false))
  }, [])

  const totais = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gastoMensal  = saldo.reduce((s: number, r: any) => s + (r.gasto_mensal_patrocinio ?? 0) + (r.gasto_mensal_acoes ?? 0), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limiteMensal = saldo.reduce((s: number, r: any) => s + (r.limite_mensal ?? 0), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gastoAnual   = saldo.reduce((s: number, r: any) => s + (r.gasto_anual_patrocinio ?? 0), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limiteAnual  = saldo.reduce((s: number, r: any) => s + (r.limite_anual ?? 0), 0)
    return { gastoMensal, limiteMensal, gastoAnual, limiteAnual, saldoMensal: limiteMensal - gastoMensal }
  }, [saldo])

  const barData = useMemo(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saldo.map((r: any) => ({
      posto: r.posto_nome,
      'Gasto Mês':  +(((r.gasto_mensal_patrocinio ?? 0) + (r.gasto_mensal_acoes ?? 0))).toFixed(2),
      'Limite Mês': +(r.limite_mensal ?? 0).toFixed(2),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).sort((a: any, b: any) => b['Gasto Mês'] - a['Gasto Mês'])
  , [saldo])

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }

  if (loading) return <div className="text-center py-16 text-gray-400 text-[13px]"><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />Carregando marketing...</div>
  if (erro) return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700">Erro: {erro}</div>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Gasto Mensal"  value={fmtBRL(totais.gastoMensal)}  icon={TrendingDown}  iconColor="text-red-600"     iconBg="bg-red-100"
          sub={`de ${fmtBRL(totais.limiteMensal)} limite`} />
        <KpiCard title="Saldo Mensal"  value={fmtBRL(totais.saldoMensal)}  icon={Wallet}
          iconColor={totais.saldoMensal >= 0 ? 'text-emerald-600' : 'text-red-600'}
          iconBg={totais.saldoMensal >= 0 ? 'bg-emerald-100' : 'bg-red-100'} />
        <KpiCard title="Gasto Anual"   value={fmtBRL(totais.gastoAnual)}   icon={BarChart2}     iconColor="text-purple-600"  iconBg="bg-purple-100"
          sub={`de ${fmtBRL(totais.limiteAnual)} limite`} />
        <KpiCard title="Ações Abertas" value={String(acoes.length)}         icon={Megaphone}     iconColor="text-pink-600"    iconBg="bg-pink-100" />
      </div>

      {barData.length > 0 && (
        <ChartCard title="Gasto vs Limite Mensal por Posto">
          <ResponsiveContainer width="100%" height={Math.max(260, barData.length * 36)}>
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 80, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={tickStyle} tickFormatter={v => `R$${v}`} />
              <YAxis dataKey="posto" type="category" tick={tickStyle} width={160} />
              <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Gasto Mês"  fill="#ec4899" radius={[0,3,3,0]} />
              <Bar dataKey="Limite Mês" fill="#f9a8d4" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title="Saldo por Posto (Mês Atual)">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
              <th className="text-right py-2 px-3 font-semibold text-pink-600">Patrocínio</th>
              <th className="text-right py-2 px-3 font-semibold text-purple-600">Ações</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-500">Limite</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-500">Saldo</th>
            </tr></thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {saldo.map((r: any, i: number) => {
                const gasto  = (r.gasto_mensal_patrocinio ?? 0) + (r.gasto_mensal_acoes ?? 0)
                const saldoR = (r.limite_mensal ?? 0) - gasto
                return (
                  <tr key={i} className={cn('border-b border-gray-50', i%2===0 && 'bg-gray-50/40')}>
                    <td className="py-2 px-3 font-medium text-gray-700">{r.posto_nome}</td>
                    <td className="py-2 px-3 text-right font-mono text-pink-700">{fmtBRL(r.gasto_mensal_patrocinio ?? 0)}</td>
                    <td className="py-2 px-3 text-right font-mono text-purple-700">{fmtBRL(r.gasto_mensal_acoes ?? 0)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-600">{fmtBRL(r.limite_mensal ?? 0)}</td>
                    <td className={cn('py-2 px-3 text-right font-mono font-semibold', saldoR >= 0 ? 'text-emerald-700' : 'text-red-600')}>{fmtBRL(saldoR)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {acoes.length > 0 && (
        <div>
          <SectionTitle>Ações Abertas ({acoes.length})</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {acoes.slice(0,12).map((a: any, i: number) => (
              <Card key={i} className="border-gray-200 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{a.titulo}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Data: {a.data_acao ?? '—'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{a.marketing_acao_postos?.length ?? 0} postos participantes</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ABA COMPRAS
// ─────────────────────────────────────────────────────────────
function ComprasTab() {
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string|null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dados,   setDados]   = useState<any[]>([])

  useEffect(() => {
    fetch('/api/estoque/conveniencia')
      .then(r => r.json())
      .then(json => { if (json.error) throw new Error(json.error); setDados(json.dados ?? []) })
      .catch(e => setErro(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const totais = useMemo(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    valorTotal: dados.reduce((s: number, d: any) => s + (d.total_valor ?? 0), 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalItens: dados.reduce((s: number, d: any) => s + (d.total_itens ?? 0), 0),
    postos: dados.length,
  }), [dados])

  const barData = useMemo(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dados.map((d: any) => ({ posto: d.posto_nome, valor: +(d.total_valor ?? 0).toFixed(2) }))
      .sort((a: any, b: any) => b.valor - a.valor)
  , [dados])

  const tickStyle = { fontSize: 11, fill: '#94a3b8' }

  if (loading) return <div className="text-center py-16 text-gray-400 text-[13px]"><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />Carregando estoque...</div>
  if (erro) return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700">Erro: {erro}</div>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Valor Total Estoque" value={fmtBRL(totais.valorTotal)} icon={DollarSign} iconColor="text-emerald-600" iconBg="bg-emerald-100" />
        <KpiCard title="Total de Itens"      value={totais.totalItens.toLocaleString('pt-BR')} icon={Package} iconColor="text-blue-600" iconBg="bg-blue-100" />
        <KpiCard title="Postos com Estoque"  value={String(totais.postos)} icon={ShoppingCart} iconColor="text-purple-600" iconBg="bg-purple-100" />
      </div>
      {barData.length > 0 && (
        <ChartCard title="Valor do Estoque por Posto (Conveniência)">
          <ResponsiveContainer width="100%" height={Math.max(220, barData.length * 38)}>
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 90, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={tickStyle} tickFormatter={v => `R$${(v/1000).toFixed(1)}k`} />
              <YAxis dataKey="posto" type="category" tick={tickStyle} width={160} />
              <Tooltip content={<CustomTooltip formatter={fmtBRL} />} />
              <Bar dataKey="valor" name="Valor em Estoque" fill="#8b5cf6" radius={[0,4,4,0]}
                label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: (v: unknown) => fmtBRL(Number(v)) }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
      <ChartCard title="Detalhamento por Posto">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left py-2 px-3 font-semibold text-gray-500">Posto</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-500">Itens</th>
              <th className="text-right py-2 px-3 font-semibold text-purple-600">Valor Estoque</th>
              <th className="text-right py-2 px-3 font-semibold text-gray-500">Subgrupos</th>
            </tr></thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {dados.map((d: any, i: number) => (
                <tr key={i} className={cn('border-b border-gray-50', i%2===0 && 'bg-gray-50/40')}>
                  <td className="py-2 px-3 font-medium text-gray-700">{d.posto_nome}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-600">{(d.total_itens ?? 0).toLocaleString('pt-BR')}</td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-purple-700">{fmtBRL(d.total_valor ?? 0)}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{d.subgrupos?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ABA TRANSPOMBAL
// ─────────────────────────────────────────────────────────────
function TranspombalTab() {
  const [loading,       setLoading]       = useState(true)
  const [erro,          setErro]          = useState<string|null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [veiculos,      setVeiculos]      = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [carregamentos, setCarregamentos] = useState<any[]>([])

  useEffect(() => {
    const hoje = new Date()
    const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10)
    const fim  = hoje.toISOString().slice(0,10)
    Promise.all([
      fetch('/api/transpombal/veiculos').then(r => r.json()),
      fetch(`/api/transpombal/carregamentos?data_ini=${ini}&data_fim=${fim}`).then(r => r.json()),
    ]).then(([v, c]) => {
      setVeiculos(v.veiculos ?? [])
      setCarregamentos(c.carregamentos ?? [])
    }).catch(e => setErro(String(e)))
    .finally(() => setLoading(false))
  }, [])

  const STATUS_CARR_COLOR: Record<string,string> = { planejado: '#3b82f6', em_rota: '#f59e0b', entregue: '#10b981', cancelado: '#6b7280' }
  const STATUS_CARR_LABEL: Record<string,string> = { planejado: 'Planejado', em_rota: 'Em Rota', entregue: 'Entregue', cancelado: 'Cancelado' }

  const statsCar = useMemo(() => {
    const map: Record<string, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    carregamentos.forEach((c: any) => { map[c.status] = (map[c.status] ?? 0) + 1 })
    return Object.entries(map).map(([status, count]) => ({ name: STATUS_CARR_LABEL[status] ?? status, value: count, status }))
  }, [carregamentos])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itensPendentes = carregamentos.flatMap((c: any) => (c.itens ?? []).filter((it: any) => it.status === 'pendente')).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itensEntregues = carregamentos.flatMap((c: any) => (c.itens ?? []).filter((it: any) => it.status === 'entregue')).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m3Total = carregamentos.flatMap((c: any) => c.itens ?? []).reduce((s: number, it: any) => s + (it.capacidade_m3 ?? 0), 0)

  if (loading) return <div className="text-center py-16 text-gray-400 text-[13px]"><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />Carregando Transpombal...</div>
  if (erro) return <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-[13px] text-red-700">Erro: {erro}</div>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Veículos Ativos"       value={String(veiculos.length)}    icon={Truck}        iconColor="text-blue-600"    iconBg="bg-blue-100" />
        <KpiCard title="Carregamentos no Mês"  value={String(carregamentos.length)} icon={Package}    iconColor="text-orange-600"  iconBg="bg-orange-100" />
        <KpiCard title="Itens Pendentes"       value={String(itensPendentes)}     icon={Clock}        iconColor="text-amber-600"   iconBg="bg-amber-100" />
        <KpiCard title="Itens Entregues"       value={String(itensEntregues)}     icon={CheckCircle2} iconColor="text-emerald-600" iconBg="bg-emerald-100"
          sub={m3Total > 0 ? `${m3Total.toFixed(0)} m³ total` : undefined} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {statsCar.length > 0 && (
          <ChartCard title="Carregamentos por Status (Mês Atual)">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statsCar} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={4} dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0)*100).toFixed(0)}%`}
                  labelLine={false}>
                  {statsCar.map((entry, i) => <Cell key={i} fill={STATUS_CARR_COLOR[entry.status] ?? BAR_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {veiculos.length > 0 && (
          <ChartCard title="Frota por Tipo">
            <div className="pt-4 space-y-2">
              {Object.entries(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                veiculos.reduce((acc: Record<string,number>, v: any) => { acc[v.tipo ?? 'outro'] = (acc[v.tipo ?? 'outro'] ?? 0) + 1; return acc }, {})
              ).map(([tipo, count], i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[12px] text-gray-600 w-24 capitalize">{tipo}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${(count / veiculos.length) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-700 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <SectionTitle>Placas Cadastradas</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {veiculos.map((v: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
                    <Truck className="w-3 h-3" />{v.placa}
                  </span>
                ))}
              </div>
            </div>
          </ChartCard>
        )}
      </div>
      {carregamentos.length > 0 && (
        <ChartCard title="Últimos Carregamentos do Mês">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-2 px-3 font-semibold text-gray-500">Data</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-500">Origem</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-500">Motorista</th>
                <th className="text-left py-2 px-3 font-semibold text-gray-500">Status</th>
                <th className="text-right py-2 px-3 font-semibold text-gray-500">Itens</th>
                <th className="text-right py-2 px-3 font-semibold text-gray-500">m³</th>
              </tr></thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {carregamentos.slice(0,20).map((c: any, i: number) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const m3 = (c.itens ?? []).reduce((s: number, it: any) => s + (it.capacidade_m3 ?? 0), 0)
                  return (
                    <tr key={i} className={cn('border-b border-gray-50', i%2===0 && 'bg-gray-50/40')}>
                      <td className="py-2 px-3 font-mono text-gray-600">{c.data_carregamento}</td>
                      <td className="py-2 px-3 text-gray-700">{c.origem ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-600 truncate max-w-[140px]">{c.motorista?.nome ?? c.motorista_nome ?? '—'}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: (STATUS_CARR_COLOR[c.status] ?? '#374151') + '20', color: STATUS_CARR_COLOR[c.status] ?? '#374151' }}>
                          {STATUS_CARR_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-gray-600">{(c.itens ?? []).length}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-gray-700">{m3.toFixed(0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function AnaliticoPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const [tabAtiva, setTabAtiva] = useState<TabId>('maquininhas')

  const ALL_TABS = [
    { id: 'relatorios'    as TabId, label: 'Rel. Gerenciais',   icon: FileBarChart },
    { id: 'maquininhas'   as TabId, label: 'Maquininhas',       icon: Smartphone   },
    { id: 'contas_receber' as TabId, label: 'Contas a Receber', icon: ReceiptText  },
    { id: 'fiscal'        as TabId, label: 'Fiscal',            icon: Scale        },
    { id: 'contas_pagar'  as TabId, label: 'Contas a Pagar',    icon: Wallet       },
    { id: 'marketing'     as TabId, label: 'Marketing',         icon: Megaphone    },
    { id: 'compras'       as TabId, label: 'Compras',           icon: ShoppingCart },
    { id: 'transpombal'   as TabId, label: 'Transpombal',       icon: Truck        },
  ]

  const tabsPermitidas: TabId[] = role ? (TABS_POR_ROLE[role] ?? []) : []
  const TABS = ALL_TABS.filter(t => tabsPermitidas.includes(t.id))
  const tabAtivaEfetiva: TabId = TABS.find(t => t.id === tabAtiva)?.id ?? (TABS[0]?.id ?? 'maquininhas')

  return (
    <div className="animate-fade-in">
      <Header title="Analítico" description="Painéis analíticos por setor" />

      <div className="p-3 md:p-6 space-y-6">
        {/* Abas principais */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTabAtiva(id)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap',
                tabAtivaEfetiva === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {tabAtivaEfetiva === 'relatorios'     && <RelatoriosGerenciaisTab />}
        {tabAtivaEfetiva === 'maquininhas'    && <MaquininhsGroupTab />}
        {tabAtivaEfetiva === 'contas_receber' && <ContasReceberTab />}
        {tabAtivaEfetiva === 'fiscal'         && <FiscalTab />}
        {tabAtivaEfetiva === 'contas_pagar'   && <ContasPagarTab />}
        {tabAtivaEfetiva === 'marketing'      && <MarketingTab />}
        {tabAtivaEfetiva === 'compras'        && <ComprasTab />}
        {tabAtivaEfetiva === 'transpombal'    && <TranspombalTab />}
      </div>
    </div>
  )
}
