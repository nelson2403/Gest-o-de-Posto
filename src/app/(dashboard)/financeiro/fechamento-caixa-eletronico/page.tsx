'use client'

import { useState } from 'react'
import { Calendar, Download, Eye } from 'lucide-react'

interface Fechamento {
  id: string
  data: string
  posto_nome: string
  operador_nome: string
  turno?: string
  total_diferenca: number
  criado_em: string
}

export default function ConsultaFechamentoCaixaPage() {
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault()
    if (!dataInicial || !dataFinal) {
      setErro('Informe data inicial e final')
      return
    }

    setLoading(true)
    setErro('')
    try {
      const res = await fetch(`/api/caixa/fechamentos?data_ini=${dataInicial}&data_fim=${dataFinal}`)
      const json = await res.json()

      if (!res.ok) {
        setErro(json.error ?? 'Erro ao buscar')
        setFechamentos([])
        return
      }

      setFechamentos(json.fechamentos ?? [])
    } catch (e: any) {
      setErro(e.message)
      setFechamentos([])
    } finally {
      setLoading(false)
    }
  }

  function fmtData(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
  }

  function fmtMoeda(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fechamento de Caixa Eletrônico</h1>
        <p className="text-sm text-gray-500 mt-1">Consulte os fechamentos de caixa registrados</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <form onSubmit={handleBuscar} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Data Inicial</label>
              <input
                type="date"
                value={dataInicial}
                onChange={e => setDataInicial(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Data Final</label>
              <input
                type="date"
                value={dataFinal}
                onChange={e => setDataFinal(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-700 hover:bg-red-800 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}
        </form>
      </div>

      {/* Resultados */}
      {fechamentos.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Data</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Posto</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Operador</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Turno</th>
                  <th className="text-right px-6 py-3 font-semibold text-gray-700">Diferença</th>
                  <th className="text-center px-6 py-3 font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {fechamentos.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">{fmtData(f.data)}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{f.posto_nome}</td>
                    <td className="px-6 py-4 text-gray-700">{f.operador_nome}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <span className="capitalize text-xs bg-gray-100 px-2 py-1 rounded">
                        {f.turno || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-semibold ${Math.abs(f.total_diferenca) < 0.01 ? 'text-emerald-600' : f.total_diferenca > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                        {fmtMoeda(f.total_diferenca)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Visualizar detalhes"
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm text-gray-600">
            <span>{fechamentos.length} resultado(s)</span>
            <button className="inline-flex items-center gap-2 text-red-700 hover:text-red-800 font-medium">
              <Download className="w-4 h-4" />
              Exportar
            </button>
          </div>
        </div>
      ) : !loading && dataInicial && dataFinal ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum fechamento encontrado para este período</p>
        </div>
      ) : null}
    </div>
  )
}
