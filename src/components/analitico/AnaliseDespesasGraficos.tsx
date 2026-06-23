'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { Loader2, AlertCircle, PieChart as PieIcon, TrendingDown, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { AnaliseDespesasResponse } from '@/app/api/relatorios/dre/analise-despesas/route'
import type {
  AnaliseDespesasGraficosResponse, GraficoSubgrupo,
} from '@/app/api/relatorios/dre/analise-despesas/graficos/route'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtBRL2 = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const fmtMes = (iso: string) => {
  const [y, m] = iso.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[Number(m) - 1]}/${y.slice(2)}`
}

// Paleta consistente — tons de âmbar/quente para a temática de despesas + neutros
const CORES = [
  '#f59e0b', '#fb923c', '#f87171', '#a78bfa',
  '#60a5fa', '#34d399', '#facc15', '#ec4899',
  '#94a3b8', '#fbbf24', '#22d3ee', '#c084fc',
]

interface Props {
  // Resposta do endpoint principal — usada pelo donut (já temos os dados)
  resp:               AnaliseDespesasResponse | null
  mascaraId:          string | null
  refMesAno:          string
  empresasCsv:        string                    // CSV de codigos selecionados (vazio = todas)
  mostrarPorEmpresa:  boolean                   // esconde o 3º gráfico quando apenas 1 empresa marcada
}

export function AnaliseDespesasGraficos({ resp, mascaraId, refMesAno, empresasCsv, mostrarPorEmpresa }: Props) {
  const [dados,   setDados]   = useState<AnaliseDespesasGraficosResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState<string | null>(null)

  // Sub-grupo selecionado no 3º gráfico (despesa por empresa)
  const [subSel,  setSubSel]  = useState<string>('')

  // Fetch dos dados de 12 meses + por empresa quando mascaraId/ref mudar
  useEffect(() => {
    if (!mascaraId) { setDados(null); return }
    let cancel = false
    setLoading(true)
    setErro(null)
    const params = new URLSearchParams({ mascara_id: mascaraId, ref: refMesAno })
    if (empresasCsv) params.set('empresa', empresasCsv)
    fetch(`/api/relatorios/dre/analise-despesas/graficos?${params}`)
      .then(async r => {
        const json = await r.json()
        if (cancel) return
        if (!r.ok || json.error) {
          setErro(json.error ?? `Erro HTTP ${r.status}`)
          setDados(null)
          return
        }
        setDados(json as AnaliseDespesasGraficosResponse)
      })
      .catch(e => { if (!cancel) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [mascaraId, refMesAno, empresasCsv])

  // Inicializa sub-grupo selecionado quando dados chegarem
  useEffect(() => {
    if (dados && dados.por_empresa.length > 0 && !subSel) {
      setSubSel(dados.por_empresa[0].linha_id)
    }
  }, [dados, subSel])

  // ── Dados do donut (vem do endpoint principal, sem fetch novo) ──
  const dadosDonut = useMemo(() => {
    if (!resp) return [] as { name: string; value: number; abs: number }[]
    // Achata todos os sub-grupos de TODAS as linhas marcadas
    const itens: { name: string; value: number; abs: number }[] = []
    for (const linha of resp.linhas) {
      for (const sg of linha.sub_grupos) {
        if (Math.abs(sg.total) < 0.005) continue
        itens.push({
          name:  resp.linhas.length > 1 ? `${linha.linha_nome} · ${sg.linha_nome}` : sg.linha_nome,
          value: Math.abs(sg.total),   // pie chart precisa de valor positivo
          abs:   sg.total,
        })
      }
    }
    return itens.sort((a, b) => b.value - a.value)
  }, [resp])

  const totalDonut = dadosDonut.reduce((s, i) => s + i.value, 0)

  // ── Dados do gráfico de 12 meses ──
  const dadosMeses = useMemo(() => {
    if (!dados) return [] as { mes: string; label: string; total: number }[]
    return dados.ultimos_12_meses.map(m => ({
      mes:   m.mes,
      label: fmtMes(m.mes),
      total: Math.abs(m.total),
    }))
  }, [dados])

  // ── Gráfico por empresa (filtrado por sub-grupo) ──
  const subSelInfo: GraficoSubgrupo | null = useMemo(() => {
    if (!dados || !subSel) return null
    return dados.por_empresa.find(s => s.linha_id === subSel) ?? null
  }, [dados, subSel])

  const dadosEmpresa = useMemo(() => {
    if (!subSelInfo) return [] as { nome: string; total: number }[]
    return subSelInfo.por_empresa.map(e => ({
      nome:  e.empresa_nome,
      total: Math.abs(e.total),
    }))
  }, [subSelInfo])

  return (
    <div className="space-y-3">
      <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-semibold">
        Visão gráfica
      </p>

      {erro && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[12px]">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
          <p>{erro}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ── Donut: distribuição por sub-grupo ── */}
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <PieIcon className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-[12px] font-semibold text-gray-800">Distribuição por sub-grupo</p>
          </div>
          {dadosDonut.length === 0 ? (
            <p className="text-[11.5px] text-gray-400 italic text-center py-10">
              Sem dados de sub-grupo para o período.
            </p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={dadosDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {dadosDonut.map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    formatter={(v) => fmtBRL2(Number(v))}
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10.5 }}
                    iconType="circle"
                    iconSize={8}
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {dadosDonut.length > 0 && (
            <p className="text-[10.5px] text-gray-500 text-center mt-1">
              Total: <strong className="text-gray-800">{fmtBRL2(totalDonut)}</strong> em {dadosDonut.length} sub-grupo{dadosDonut.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {/* ── Linha 12 meses ── */}
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-[12px] font-semibold text-gray-800">Últimos 12 meses</p>
          </div>
          {loading && !dados ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[11.5px]">Carregando…</span>
            </div>
          ) : dadosMeses.length === 0 ? (
            <p className="text-[11.5px] text-gray-400 italic text-center py-10">Sem dados.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={dadosMeses} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => fmtBRL(Number(v))} width={70} />
                  <RTooltip
                    formatter={(v) => fmtBRL2(Number(v))}
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                    labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Por empresa (com filtro de sub-grupo) ── */}
        {mostrarPorEmpresa && (
        <div className="rounded-lg bg-white border border-gray-200 p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <p className="text-[12px] font-semibold text-gray-800">Despesa por empresa</p>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Sub-grupo</label>
              <select
                value={subSel}
                onChange={(e) => setSubSel(e.target.value)}
                disabled={!dados || dados.por_empresa.length === 0}
                className="h-7 px-2 border border-gray-200 rounded-md text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:bg-gray-50 disabled:text-gray-400 min-w-[200px]"
              >
                {(!dados || dados.por_empresa.length === 0)
                  ? <option>Sem dados</option>
                  : dados.por_empresa.map(s => (
                    <option key={s.linha_id} value={s.linha_id}>{s.linha_nome}</option>
                  ))}
              </select>
            </div>
          </div>

          {loading && !dados ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[11.5px]">Carregando…</span>
            </div>
          ) : !dados || dados.por_empresa.length === 0 ? (
            <p className="text-[11.5px] text-gray-400 italic text-center py-10">
              Sem dados de sub-grupos por empresa para esta máscara.
            </p>
          ) : dadosEmpresa.length === 0 ? (
            <p className="text-[11.5px] text-gray-400 italic text-center py-10">
              O sub-grupo selecionado não tem movimento nas empresas no período.
            </p>
          ) : (
            <div style={{ width: '100%', height: Math.max(200, dadosEmpresa.length * 28 + 40) }}>
              <ResponsiveContainer>
                <BarChart
                  layout="vertical"
                  data={dadosEmpresa}
                  margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                >
                  <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => fmtBRL(Number(v))} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fontSize: 10.5, fill: '#475569' }}
                    width={140}
                  />
                  <RTooltip
                    formatter={(v) => fmtBRL2(Number(v))}
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                    labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <Bar dataKey="total" fill="#fb923c" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {subSelInfo && (
            <p className="text-[10.5px] text-gray-500 mt-1">
              Total <strong className="text-gray-800">{subSelInfo.linha_nome}</strong>: <strong className="text-gray-800">{fmtBRL2(Math.abs(subSelInfo.total))}</strong> em {dadosEmpresa.length} empresa{dadosEmpresa.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
