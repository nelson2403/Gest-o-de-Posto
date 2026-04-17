'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'

interface Stats {
  pendentes: number
  trocasHoje: number
  trocasMes: number
  totalSolicitacoes: number
}

interface SolicitacaoBobina {
  id: string
  posto_id: string
  maquininha_id: string | null
  solicitado_por: string
  status: string
  criado_em: string
  postos?: { nome: string }
  maquininhas?: { numero_serie: string | null; modelo: string | null; adquirentes?: { nome: string } } | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: 'bg-yellow-100 text-yellow-800',
    atendida: 'bg-green-100 text-green-800',
    cancelada: 'bg-red-100 text-red-800',
    solicitado: 'bg-purple-100 text-purple-800',
  }
  const labels: Record<string, string> = {
    pendente: 'Pendente',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
    solicitado: 'Solicitado',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function StatCard({ title, value, color, icon }: { title: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

export default function BobbinasPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({ pendentes: 0, trocasHoje: 0, trocasMes: 0, totalSolicitacoes: 0 })
  const [recent, setRecent] = useState<SolicitacaoBobina[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const [pendentesRes, trocasHojeRes, trocasMesRes, totalRes, recentRes] = await Promise.all([
      supabase.from('solicitacoes_bobinas').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase.from('trocas_bobinas').select('*', { count: 'exact', head: true }).gte('data_troca', today.toISOString()),
      supabase.from('trocas_bobinas').select('*', { count: 'exact', head: true }).gte('data_troca', firstOfMonth.toISOString()),
      supabase.from('solicitacoes_bobinas').select('*', { count: 'exact', head: true }),
      supabase.from('solicitacoes_bobinas')
        .select('*, postos(nome), maquininhas(numero_serie, modelo, adquirentes(nome))')
        .order('criado_em', { ascending: false })
        .limit(5),
    ])

    setStats({
      pendentes: pendentesRes.count ?? 0,
      trocasHoje: trocasHojeRes.count ?? 0,
      trocasMes: trocasMesRes.count ?? 0,
      totalSolicitacoes: totalRes.count ?? 0,
    })
    setRecent((recentRes.data as SolicitacaoBobina[]) ?? [])
    setLoading(false)
  }

  return (
    <div className="animate-fade-in">
      <Header title="Bobinas" description="Gestão de bobinas e solicitações" />

      <div className="p-3 md:p-6 space-y-6">
        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                    <div className="space-y-2">
                      <div className="h-3 w-24 bg-gray-200 rounded" />
                      <div className="h-6 w-12 bg-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Solicitações Pendentes" value={stats.pendentes} color="bg-yellow-100"
                icon={<svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard title="Trocas Hoje" value={stats.trocasHoje} color="bg-green-100"
                icon={<svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard title="Trocas no Mês" value={stats.trocasMes} color="bg-blue-100"
                icon={<svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              />
              <StatCard title="Total de Solicitações" value={stats.totalSolicitacoes} color="bg-gray-100"
                icon={<svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
              />
            </div>

            {/* Atalhos */}
            <div className="flex flex-wrap gap-3">
              <Link href="/bobinas/solicitacoes" className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Solicitações
              </Link>
              <Link href="/bobinas/trocas" className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Trocas
              </Link>
              <Link href="/bobinas/estoque" className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                Estoque
              </Link>
            </div>

            {/* Solicitações recentes */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Solicitações Recentes</h2>
                <Link href="/bobinas/solicitacoes" className="text-sm text-orange-500 hover:text-orange-600 font-medium">
                  Ver todas
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  <p className="text-sm">Nenhuma solicitação encontrada</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Posto</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Maquininha</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitado por</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recent.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{formatDate(s.criado_em)}</td>
                          <td className="px-6 py-4 font-medium text-gray-900">{s.postos?.nome ?? '-'}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {s.maquininhas
                              ? `${s.maquininhas.modelo ?? 'Sem modelo'} · N/S: ${s.maquininhas.numero_serie ?? 'N/A'}${s.maquininhas.adquirentes ? ` · ${s.maquininhas.adquirentes.nome}` : ''}`
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">{s.solicitado_por}</td>
                          <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
