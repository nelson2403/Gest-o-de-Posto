'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { can } from '@/lib/utils/permissions'
import type { Role } from '@/types/database.types'

interface PostoRow {
  id: string
  nome: string
  codigo_empresa_externo: string | null
}

interface UsuarioPostos {
  id: string
  nome: string
  postoIds: string[]
}

interface CaixaRow {
  grid: string
  codigo: string
  nome: string
  ultimo_caixa_fechado: string | null
}

interface PostoStatus {
  posto: PostoRow
  ultimoCaixa: string | null
  diasAtras: number | null
  status: 'em_dia' | 'atencao' | 'atrasado' | 'sem_mapeamento' | 'sem_dados'
}

function diffDias(dataISO: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const ref = new Date(dataISO + 'T12:00:00')
  ref.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - ref.getTime()) / 86_400_000)
}

function calcStatus(dias: number | null, semMapeamento: boolean): PostoStatus['status'] {
  if (semMapeamento) return 'sem_mapeamento'
  if (dias === null) return 'sem_dados'
  if (dias <= 1) return 'em_dia'
  if (dias <= 3) return 'atencao'
  return 'atrasado'
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_CONFIG = {
  em_dia:         { label: 'Em dia',          bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  atencao:        { label: 'Atenção',         bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  atrasado:       { label: 'Atrasado',        bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  sem_mapeamento: { label: 'Não configurado', bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400'    },
  sem_dados:      { label: 'Sem dados',       bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400'    },
}

function StatusBadge({ status }: { status: PostoStatus['status'] }) {
  const c = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function SummaryCard({ label, value, color, icon, onClick, active }: {
  label: string; value: number; color: string; icon: React.ReactNode
  onClick?: () => void; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-3 md:p-5 flex items-center gap-3 w-full text-left transition-all ${
        active ? 'border-gray-400 ring-2 ring-gray-200' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
        <p className="text-lg md:text-2xl font-bold text-gray-900 leading-tight mt-0.5 truncate">{value}</p>
      </div>
    </button>
  )
}

type FilterStatus = 'todos' | PostoStatus['status']

export default function ControleCaixasPage() {
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  const podeConfigurar = can(role ?? null, 'controle_caixas.configurar')
  const isConciliador  = role === 'operador_conciliador' || role === 'operador_caixa'

  const [loading,      setLoading]      = useState(true)
  const [extError,     setExtError]     = useState<string | null>(null)
  const [lastSync,     setLastSync]     = useState<string | null>(null)
  const [lista,        setLista]        = useState<PostoStatus[]>([])
  const [usuariosMap,  setUsuariosMap]  = useState<UsuarioPostos[]>([])
  const [busca,        setBusca]        = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  const [dataInicio,   setDataInicio]   = useState('')
  const [dataFim,      setDataFim]      = useState('')
  const [ordenacao,    setOrdenacao]    = useState<'status' | 'nome' | 'data_asc' | 'data_desc'>('status')

  const carregarDados = useCallback(async () => {
    setLoading(true)
    setExtError(null)

    const [postosRes, caixaRes, usuariosRes, postosJunctionRes, recorrentesRes] = await Promise.all([
      fetch('/api/postos-mapeamento'),
      fetch('/api/caixa-externo'),
      // Busca todos os usuários ativos com posto vinculado (fallback: posto_fechamento_id)
      supabase.from('usuarios').select('id, nome, posto_fechamento_id').eq('ativo', true).order('nome'),
      // Busca todos os vínculos da junction table (múltiplos postos por operador)
      supabase.from('usuario_postos_caixa').select('usuario_id, posto_id, usuario:usuarios(id, nome, ativo)'),
      // Busca conciliadores via tarefas_recorrentes
      supabase.from('tarefas_recorrentes').select('usuario_id, posto_id, usuario:usuarios(id, nome)').eq('ativo', true).not('posto_id', 'is', null).not('usuario_id', 'is', null),
    ])

    const postosJson = await postosRes.json()
    const caixaJson  = await caixaRes.json()

    const postos: PostoRow[] = postosJson.data ?? []
    const caixas: CaixaRow[] = caixaJson.data  ?? []

    if (caixaJson.error) setExtError(caixaJson.error)

    const caixaMap = new Map<string, CaixaRow>()
    for (const c of caixas) caixaMap.set(c.grid, c)

    const resultado: PostoStatus[] = postos.map(posto => {
      if (!posto.codigo_empresa_externo) {
        return { posto, ultimoCaixa: null, diasAtras: null, status: 'sem_mapeamento' }
      }
      const caixa = caixaMap.get(posto.codigo_empresa_externo)
      if (!caixa) {
        return { posto, ultimoCaixa: null, diasAtras: null, status: 'sem_dados' }
      }
      const dias = caixa.ultimo_caixa_fechado ? diffDias(caixa.ultimo_caixa_fechado) : null
      return { posto, ultimoCaixa: caixa.ultimo_caixa_fechado, diasAtras: dias, status: calcStatus(dias, false) }
    })

    // Monta mapa usuário → postos
    const uMap = new Map<string, { nome: string; postoIds: string[] }>()

    // 1. Junction table (múltiplos postos por operador_caixa) — fonte primária
    for (const j of postosJunctionRes.data ?? []) {
      const u = j.usuario as unknown as { id: string; nome: string; ativo: boolean } | null
      if (!u?.ativo) continue
      if (!uMap.has(j.usuario_id)) uMap.set(j.usuario_id, { nome: u.nome, postoIds: [] })
      uMap.get(j.usuario_id)!.postoIds.push(j.posto_id as string)
    }

    // 2. Fallback: posto_fechamento_id para quem ainda não está na junction table
    for (const u of usuariosRes.data ?? []) {
      if (u.posto_fechamento_id && !uMap.has(u.id)) {
        uMap.set(u.id, { nome: u.nome, postoIds: [u.posto_fechamento_id] })
      }
    }

    // 3. Conciliadores via tarefas_recorrentes
    for (const r of recorrentesRes.data ?? []) {
      const uid = r.usuario_id as string
      const uNome = (r.usuario as unknown as { nome: string } | null)?.nome ?? ''
      if (!uMap.has(uid)) uMap.set(uid, { nome: uNome, postoIds: [] })
      uMap.get(uid)!.postoIds.push(r.posto_id as string)
    }

    setUsuariosMap(
      Array.from(uMap.entries())
        .map(([id, v]) => ({ id, nome: v.nome, postoIds: [...new Set(v.postoIds)] }))
        .sort((a, b) => a.nome.localeCompare(b.nome))
    )

    setLista(resultado)
    setLastSync(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => { carregarDados() }, [carregarDados])

  const totais = {
    total:      lista.length,
    em_dia:     lista.filter(p => p.status === 'em_dia').length,
    atencao:    lista.filter(p => p.status === 'atencao').length,
    atrasado:   lista.filter(p => p.status === 'atrasado').length,
  }

  const filtrada = lista
    .filter(p => {
      if (filterStatus !== 'todos' && filterStatus !== 'sem_mapeamento') {
        if (p.status !== filterStatus) return false
      }
      if (filterStatus === 'sem_mapeamento') {
        if (p.status !== 'sem_mapeamento' && p.status !== 'sem_dados') return false
      }
      if (busca && !p.posto.nome.toLowerCase().includes(busca.toLowerCase())) return false
      if (dataInicio && p.ultimoCaixa && p.ultimoCaixa < dataInicio) return false
      if (dataFim   && p.ultimoCaixa && p.ultimoCaixa > dataFim)    return false
      if ((dataInicio || dataFim) && !p.ultimoCaixa) return false
      return true
    })
    .sort((a, b) => {
      if (ordenacao === 'nome') return a.posto.nome.localeCompare(b.posto.nome)
      if (ordenacao === 'data_asc') {
        if (!a.ultimoCaixa) return 1
        if (!b.ultimoCaixa) return -1
        return a.ultimoCaixa.localeCompare(b.ultimoCaixa)
      }
      if (ordenacao === 'data_desc') {
        if (!a.ultimoCaixa) return 1
        if (!b.ultimoCaixa) return -1
        return b.ultimoCaixa.localeCompare(a.ultimoCaixa)
      }
      const ordem: Record<PostoStatus['status'], number> = {
        atrasado: 0, atencao: 1, em_dia: 2, sem_dados: 3, sem_mapeamento: 4,
      }
      const d = ordem[a.status] - ordem[b.status]
      return d !== 0 ? d : a.posto.nome.localeCompare(b.posto.nome)
    })

  function limparFiltros() {
    setBusca(''); setFilterStatus('todos'); setDataInicio(''); setDataFim(''); setOrdenacao('status')
  }

  const temFiltroAtivo = busca || filterStatus !== 'todos' || dataInicio || dataFim || ordenacao !== 'status'

  return (
    <div className="animate-fade-in">
      <Header
        title="Controle de Caixas"
        description="Situação dos fechamentos por posto"
        actions={
          podeConfigurar ? (
            <Link
              href="/controle-caixas/configuracoes"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="btn-text">Configurar Postos</span>
            </Link>
          ) : undefined
        }
      />

      <div className="p-3 md:p-6 space-y-5">

        {loading ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 animate-pulse">
                  <div className="w-11 h-11 bg-gray-200 rounded-xl flex-shrink-0" />
                  <div className="space-y-2">
                    <div className="h-2.5 w-20 bg-gray-200 rounded" />
                    <div className="h-6 w-8 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-4 w-24 bg-gray-200 rounded ml-auto" />
                  <div className="h-6 w-20 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Cabeçalho — oculto para conciliador/fechador */}
            {!isConciliador && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  {lastSync && (
                    <p className="text-xs text-gray-400">Atualizado às {formatHora(lastSync)}</p>
                  )}
                </div>
                <button
                  onClick={carregarDados}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Atualizar
                </button>
              </div>
            )}

            {!isConciliador && extError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">Não foi possível conectar ao banco externo</p>
                  <p className="text-xs text-red-500 mt-0.5">{extError}</p>
                </div>
              </div>
            )}

            {/* Cards + filtros + tabela — ocultos para conciliador/fechador */}
            {!isConciliador && <><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Total de Postos" value={totais.total} color="bg-blue-100"
                active={filterStatus === 'todos'} onClick={() => setFilterStatus('todos')}
                icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
              />
              <SummaryCard label="Em dia (≤ 1 dia)" value={totais.em_dia} color="bg-emerald-100"
                active={filterStatus === 'em_dia'} onClick={() => setFilterStatus(filterStatus === 'em_dia' ? 'todos' : 'em_dia')}
                icon={<svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <SummaryCard label="Atenção (2–3 dias)" value={totais.atencao} color="bg-amber-100"
                active={filterStatus === 'atencao'} onClick={() => setFilterStatus(filterStatus === 'atencao' ? 'todos' : 'atencao')}
                icon={<svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
              />
              <SummaryCard label="Atrasado (4+ dias)" value={totais.atrasado} color="bg-red-100"
                active={filterStatus === 'atrasado'} onClick={() => setFilterStatus(filterStatus === 'atrasado' ? 'todos' : 'atrasado')}
                icon={<svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
            </div>

            {/* Barra de filtros */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex flex-col gap-2">
                <div className="relative w-full">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar posto..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as FilterStatus)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="todos">Todos os status</option>
                    <option value="em_dia">Em dia</option>
                    <option value="atencao">Atenção</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="sem_mapeamento">Não configurados</option>
                  </select>
                  <select
                    value={ordenacao}
                    onChange={e => setOrdenacao(e.target.value as typeof ordenacao)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="status">Situação</option>
                    <option value="nome">Nome</option>
                    <option value="data_desc">Mais recente</option>
                    <option value="data_asc">Mais antigo</option>
                  </select>
                </div>
                {temFiltroAtivo && (
                  <button onClick={limparFiltros} className="text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-left">
                    Limpar filtros
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-gray-500 font-medium">Último caixa entre:</span>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                  <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 w-full" />
                </div>
                {(dataInicio || dataFim) && (
                  <button onClick={() => { setDataInicio(''); setDataFim('') }} className="text-xs text-gray-400 hover:text-gray-700">
                    ✕ limpar datas
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 px-1">
              {filtrada.length} {filtrada.length === 1 ? 'posto' : 'postos'} encontrados
            </p>

            {/* Tabela */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {filtrada.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">
                  Nenhum posto encontrado com os filtros aplicados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Posto</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Último Caixa Fechado</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dias em Aberto</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtrada.map(({ posto, ultimoCaixa, diasAtras, status }) => (
                        <tr key={posto.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-900">{posto.nome}</p>
                          </td>
                          <td className="px-5 py-4 text-gray-700 font-medium">
                            {formatData(ultimoCaixa)}
                          </td>
                          <td className="px-5 py-4">
                            {diasAtras === null ? (
                              <span className="text-gray-400">—</span>
                            ) : diasAtras === 0 ? (
                              <span className="text-emerald-600 font-medium">Hoje</span>
                            ) : diasAtras === 1 ? (
                              <span className="text-emerald-600 font-medium">1 dia</span>
                            ) : (
                              <span className={`font-medium ${diasAtras <= 3 ? 'text-amber-600' : 'text-red-600'}`}>
                                {diasAtras} dias
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {status === 'sem_mapeamento' && podeConfigurar ? (
                              <Link
                                href="/controle-caixas/configuracoes"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium underline-offset-2 hover:underline"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Configurar
                              </Link>
                            ) : (
                              <StatusBadge status={status} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div></>}

            {/* ── Por Usuário ── */}
            {usuariosMap.length > 0 && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Postos por Responsável</p>
                <div className="space-y-4">
                  {usuariosMap.filter(u => !isConciliador || u.id === usuario?.id).map(u => {
                    const postosDoUsuario = lista.filter(p => u.postoIds.includes(p.posto.id))
                    const initials = u.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

                    const contadores = {
                      em_dia:   postosDoUsuario.filter(p => p.status === 'em_dia').length,
                      atencao:  postosDoUsuario.filter(p => p.status === 'atencao').length,
                      atrasado: postosDoUsuario.filter(p => p.status === 'atrasado').length,
                    }

                    return (
                      <div key={u.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        {/* Cabeçalho do usuário */}
                        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold text-gray-900">{u.nome}</p>
                            <p className="text-[12px] text-gray-400">{postosDoUsuario.length} posto(s) vinculado(s)</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {contadores.em_dia} em dia
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              {contadores.atencao} atenção
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-red-100 text-red-700 px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              {contadores.atrasado} atrasado
                            </span>
                          </div>
                        </div>

                        {/* Tabela de postos */}
                        {postosDoUsuario.length === 0 ? (
                          <p className="text-[13px] text-gray-400 text-center py-6 italic">Nenhum posto vinculado.</p>
                        ) : (
                          <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Posto</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Último Caixa</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Dias em Aberto</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Situação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {postosDoUsuario.map(({ posto, ultimoCaixa, diasAtras, status }) => (
                                <tr key={posto.id} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="px-6 py-3.5">
                                    <p className="font-medium text-gray-900">{posto.nome}</p>
                                  </td>
                                  <td className="px-6 py-3.5 text-gray-700 font-medium">
                                    {formatData(ultimoCaixa)}
                                  </td>
                                  <td className="px-6 py-3.5">
                                    {diasAtras === null ? (
                                      <span className="text-gray-400">—</span>
                                    ) : diasAtras === 0 ? (
                                      <span className="text-emerald-600 font-medium">Hoje</span>
                                    ) : diasAtras === 1 ? (
                                      <span className="text-emerald-600 font-medium">1 dia</span>
                                    ) : (
                                      <span className={`font-medium ${diasAtras <= 3 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {diasAtras} dias
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-3.5">
                                    <StatusBadge status={status} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
