'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Matching {
  conta_id: string
  boleto_id: string
  fornecedor: string
  valor: number
  vencimento: string
  status_conta: string
  status_boleto: string
  conciliado: boolean
}

export default function ConferenciaBoletoPage() {
  const [matching, setMatching] = useState<Matching[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    contas_totais: 0,
    boletos_totais: 0,
    nao_conciliadas: 0
  })

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/contas-pagar/matching-boletos')
      const d = await r.json()
      setMatching(d.matching ?? [])
      setStats({
        total: d.total ?? 0,
        contas_totais: d.contas_totais ?? 0,
        boletos_totais: d.boletos_totais ?? 0,
        nao_conciliadas: d.nao_conciliadas ?? 0
      })
    } catch (e: any) {
      toast({ title: '❌ Erro ao carregar', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const percentualConciliacao = stats.contas_totais > 0
    ? Math.round((stats.total / stats.contas_totais) * 100)
    : 0

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="space-y-6">
      <Header
        title="Conferência de Boletos"
        description="Matching automático entre Contas a Pagar e Boletos Fiscais"
      />

      <div className="px-4 md:px-6 space-y-5">
        {/* Cards de resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4">
            <p className="text-[11px] text-emerald-700 uppercase font-semibold">Conciliadas</p>
            <p className="text-3xl font-bold text-emerald-900 mt-1">{stats.total}</p>
            <p className="text-[11px] text-emerald-600 mt-1">{percentualConciliacao}% das contas</p>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
            <p className="text-[11px] text-red-700 uppercase font-semibold">Não Conciliadas</p>
            <p className="text-3xl font-bold text-red-900 mt-1">{stats.nao_conciliadas}</p>
            <p className="text-[11px] text-red-600 mt-1">Sem boleto correspondente</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
            <p className="text-[11px] text-blue-700 uppercase font-semibold">Contas a Pagar</p>
            <p className="text-3xl font-bold text-blue-900 mt-1">{stats.contas_totais}</p>
            <p className="text-[11px] text-blue-600 mt-1">Total no sistema</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
            <p className="text-[11px] text-purple-700 uppercase font-semibold">Boletos</p>
            <p className="text-3xl font-bold text-purple-900 mt-1">{stats.boletos_totais}</p>
            <p className="text-[11px] text-purple-600 mt-1">Totais no painel fiscal</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-gray-700">Taxa de Conciliação</span>
            <span className="text-[13px] font-bold text-gray-900">{percentualConciliacao}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${percentualConciliacao}%` }}
            />
          </div>
        </div>

        {/* Botão de atualizar */}
        <div className="flex justify-end">
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Carregando...' : 'Atualizar'}
          </button>
        </div>

        {/* Tabela de contas conciliadas */}
        {!loading && matching.length > 0 && (
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Contas Conciliadas ({matching.length})
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">Fornecedor</th>
                      <th className="px-4 py-2.5 text-right font-medium text-gray-600">Valor</th>
                      <th className="px-4 py-2.5 text-center font-medium text-gray-600">Vencimento</th>
                      <th className="px-4 py-2.5 text-center font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {matching.slice(0, 20).map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700">{m.fornecedor}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">
                          {fmtBRL(m.valor)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-gray-600">{fmtData(m.vencimento)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            <CheckCircle2 className="w-3 h-3" />
                            OK
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matching.length > 20 && (
                <div className="px-4 py-2 bg-gray-50 text-[11px] text-gray-500 border-t border-gray-200">
                  Mostrando 20 de {matching.length} contas conciliadas
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aviso: contas não conciliadas */}
        {!loading && stats.nao_conciliadas > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-[13px] font-medium text-red-900 flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" />
              {stats.nao_conciliadas} contas sem boleto correspondente
            </p>
            <p className="text-[12px] text-red-700">
              Essas contas precisam de um boleto fiscal anexado ou têm divergências de:
              fornecedor, valor ou data de vencimento.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
