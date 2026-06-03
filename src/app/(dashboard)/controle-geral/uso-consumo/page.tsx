'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2, RefreshCw, Download, FileText } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { UsosConsumoItem } from '@/app/api/fiscal/uso-consumo/route'

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function UsosConsumoPage() {
  const [dados, setDados] = useState<UsosConsumoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [totalGasto, setTotalGasto] = useState(0)
  const [filtroPostoId, setFiltroPostoId] = useState<string>('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await fetch('/api/fiscal/uso-consumo')
      const d = await r.json()
      if (!r.ok) {
        setErro(d.error ?? 'Erro ao carregar')
        return
      }
      setDados(d.dados ?? [])
      setTotalGasto(d.total_gasto ?? 0)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Filtrar dados por posto
  const dadosFiltrados = filtroPostoId === 'todos'
    ? dados
    : dados.filter(d => d.posto_nome === filtroPostoId)

  // Calcular total gasto apenas dos dados filtrados
  const totalGastoFiltrado = dadosFiltrados.reduce((sum, d) => sum + d.nf_valor, 0)

  // Obter lista única de postos
  const postos = Array.from(
    new Set(dados.map(d => d.posto_nome))
  ).sort()

  const exportarCSV = () => {
    const headers = ['ID', 'Título', 'Empresa', 'Posto', 'Data NF', 'Valor NF', 'Manifesto AS', 'Diferença', 'Fornecedor', 'Gerente', 'Respondida em']
    const rows = dadosFiltrados.map(d => [
      d.id,
      d.titulo,
      d.empresa_nome,
      d.posto_nome,
      d.data_nf,
      d.nf_valor.toString(),
      d.manifestacao_as.toString(),
      d.diferenca.toString(),
      d.fornecedor || '—',
      d.gerente_respondeu,
      d.respondida_em,
    ])

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `uso-consumo-${new Date().toISOString().slice(0, 10)}.csv`)
    link.click()
  }

  return (
    <div className="space-y-6">
      <Header
        title="Controle de Uso e Consumo"
        description="Acompanhe todas as despesas marcadas como uso e consumo"
      />

      <div className="px-4 md:px-6 space-y-5">
        {/* Filtro por Posto */}
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-semibold text-gray-700">Filtrar por Posto:</label>
          <select
            value={filtroPostoId}
            onChange={(e) => setFiltroPostoId(e.target.value)}
            className="h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos os Postos</option>
            {postos.map(posto => (
              <option key={posto} value={posto}>{posto}</option>
            ))}
          </select>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-[11px] text-gray-500 uppercase font-semibold">
              {filtroPostoId === 'todos' ? 'Total de Notas' : `Notas - ${filtroPostoId}`}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{dadosFiltrados.length}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4">
            <p className="text-[11px] text-emerald-700 uppercase font-semibold">
              {filtroPostoId === 'todos' ? 'Total Gasto' : `Total Gasto - ${filtroPostoId}`}
            </p>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{fmtMoeda(totalGastoFiltrado)}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={carregar}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              onClick={exportarCSV}
              disabled={dados.length === 0}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {erro}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando despesas...
          </div>
        )}

        {/* Tabela */}
        {!loading && !erro && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {dadosFiltrados.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>{dados.length === 0 ? 'Nenhuma nota marcada como "Uso e Consumo"' : 'Nenhuma nota encontrada para este filtro'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-[12px]">Data</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-[12px]">Fornecedor</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-[12px]">Posto</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-[12px]">Empresa</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-[12px]">Valor NF</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-[12px]">Manifesto AS</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-[12px]">Diferença</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-[12px]">Gerente</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700 text-[12px]">NF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dadosFiltrados.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-[12px] text-gray-600">{fmtData(d.data_nf)}</td>
                        <td className="px-4 py-3 text-[12px] text-gray-800 font-medium">{d.fornecedor || '—'}</td>
                        <td className="px-4 py-3 text-[12px] text-gray-700">{d.posto_nome}</td>
                        <td className="px-4 py-3 text-[12px] text-gray-700">{d.empresa_nome}</td>
                        <td className="px-4 py-3 text-[12px] text-right font-semibold text-gray-900">
                          {fmtMoeda(d.nf_valor)}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-right text-gray-700">
                          {fmtMoeda(d.manifestacao_as)}
                        </td>
                        <td className={`px-4 py-3 text-[12px] text-right font-semibold ${
                          d.diferenca > 0.02 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {fmtMoeda(d.diferenca)}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-700">{d.gerente_respondeu}</td>
                        <td className="px-4 py-3 text-center">
                          {d.nf_url && (
                            <a
                              href={d.nf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              📄
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
