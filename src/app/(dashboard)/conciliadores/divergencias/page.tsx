'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Loader2, AlertCircle, X, Edit2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { DivergenciaItem } from '@/app/api/conciliadores/divergencias/route'

const PRIORIDADE_CORES: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
  urgente: {
    bg: 'bg-red-50 border-red-200',
    icon: <AlertTriangle className="w-4 h-4 text-red-600" />,
    label: 'Urgente',
  },
  alta: {
    bg: 'bg-orange-50 border-orange-200',
    icon: <AlertCircle className="w-4 h-4 text-orange-600" />,
    label: 'Alta',
  },
  media: {
    bg: 'bg-yellow-50 border-yellow-200',
    icon: <Clock className="w-4 h-4 text-yellow-600" />,
    label: 'Média',
  },
}

function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function DivergenciasPage() {
  const [divergencias, setDivergencias] = useState<DivergenciaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [selecionada, setSelecionada] = useState<DivergenciaItem | null>(null)
  const [filtroConciliador, setFiltroConciliador] = useState<string>('todos')
  const [userRole, setUserRole] = useState<string | null>(null)
  const divergenciasAnterioresRef = useRef<DivergenciaItem[]>([])

  // Carregar role do usuário
  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const r = await fetch('/api/user-info')
        if (r.ok) {
          const data = await r.json()
          setUserRole(data.role)
        }
      } catch (e) {
        console.error('Erro ao carregar role do usuário:', e)
      }
    }
    loadUserRole()
  }, [])

  const sincronizar = useCallback(async () => {
    try {
      console.log('[sincronizar] iniciando...')
      console.log('[sincronizar] URL:', window.location.origin + '/api/conciliadores/sincronizar')
      const r = await fetch('/api/conciliadores/sincronizar', { method: 'POST' })
      console.log('[sincronizar] resposta recebida:', r.status)

      const resultado = await r.json()
      console.log('[sincronizar] dados:', resultado)

      if (!r.ok) {
        console.error('[sincronizar] erro:', resultado.error)
        toast({
          title: '❌ Erro ao sincronizar',
          description: resultado.error ?? 'Verifique sua conexão'
        })
        return
      }

      console.log('[sincronizar] sucesso! Mostrando toast...')
      toast({
        title: '✅ Sincronização concluída',
        description: `${resultado.sincronizadas} verificada(s), ${resultado.resolvidas} resolvida(s)`
      })
    } catch (e: any) {
      console.error('[sincronizar] exceção:', e)
      toast({
        title: '❌ Erro de conexão',
        description: e.message
      })
    }
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await fetch('/api/conciliadores/divergencias')
      const d = await r.json()
      if (!r.ok) {
        setErro(d.error ?? 'Erro ao carregar')
        return
      }

      const novasDivergencias = d.divergencias ?? []

      // Detectar divergências resolvidas (que eram divergente e agora desapareceram)
      const resolvidas = divergenciasAnterioresRef.current.filter(
        antiga => antiga.extrato_status === 'divergente' &&
                  !novasDivergencias.some((nova: DivergenciaItem) => nova.id === antiga.id)
      )

      // Marcar resolvidas como concluídas automaticamente
      if (resolvidas.length > 0) {
        toast({
          title: '✅ Detectadas divergências resolvidas!',
          description: `${resolvidas.length} sendo concluída(s)...`
        })
        for (const div of resolvidas) {
          try {
            await fetch(`/api/conciliadores/divergencias/${div.id}/concluir`, {
              method: 'PATCH',
            })
          } catch (e) {
            console.error(`Erro ao concluir divergência ${div.id}:`, e)
          }
        }
        toast({
          title: '✅ Concluído!',
          description: `${resolvidas.length} divergência(s) marcada(s) como resolvida(s)`
        })
      } else if (divergenciasAnterioresRef.current.length > 0) {
        toast({
          title: 'ℹ️ Nenhuma divergência foi resolvida',
          description: 'As divergências ainda estão pendentes'
        })
      }

      divergenciasAnterioresRef.current = novasDivergencias
      setDivergencias(novasDivergencias)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Obter lista única de conciliadores
  const conciliadores = Array.from(
    new Set(divergencias
      .map(d => d.conciliador_responsavel)
      .filter((c): c is string => c != null)
    )
  ).sort()

  // Filtrar por conciliador selecionado
  const divergenciasFiltradas = filtroConciliador === 'todos'
    ? divergencias
    : divergencias.filter(d => d.conciliador_responsavel === filtroConciliador)

  const urgentes = divergenciasFiltradas.filter(d => d.prioridade === 'urgente')
  const altas = divergenciasFiltradas.filter(d => d.prioridade === 'alta')
  const medias = divergenciasFiltradas.filter(d => d.prioridade === 'media')
  const resolvidas = divergenciasFiltradas.filter(d => d.extrato_status === 'ok')

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900">Divergências — Conciliação</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {loading ? 'Carregando...' : `${divergenciasFiltradas.length} de ${divergencias.length} divergência${divergencias.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* BOTÃO DE TESTE */}
          <button
            onClick={() => alert('TESTE: Botão funcionando!')}
            className="h-9 px-2 bg-yellow-500 text-white rounded text-xs font-bold"
          >
            TESTE
          </button>

          {conciliadores.length > 0 && userRole !== 'operador_conciliador' && (
            <select
              value={filtroConciliador}
              onChange={(e) => setFiltroConciliador(e.target.value)}
              className="h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos os conciliadores</option>
              {conciliadores.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              console.log('[ATUALIZAR] Clicado! loading=', loading)
              console.log('[ATUALIZAR] Função sincronizar:', typeof sincronizar)
              if (loading) {
                console.warn('[ATUALIZAR] Botão desabilitado (loading=true)')
                alert('Aguarde... ainda carregando')
                return
              }
              console.log('[ATUALIZAR] Iniciando sincronização...')
              sincronizar().then(() => {
                console.log('[ATUALIZAR] sincronizar done')
                return carregar()
              }).then(() => {
                console.log('[ATUALIZAR] carregar done')
              }).catch((e: any) => {
                console.error('[ATUALIZAR] Erro:', e)
              })
            }}
            disabled={loading}
            className="flex items-center gap-1.5 h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando divergências...
        </div>
      )}

      {/* Conteúdo */}
      {!loading && !erro && (
        <div className="space-y-6">
          {/* Urgentes */}
          {urgentes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-sm font-bold text-red-700">Urgentes ({urgentes.length})</h2>
              </div>
              <div className="space-y-2">
                {urgentes.map(d => (
                  <DivergenciaCard key={d.id} item={d} onClick={() => setSelecionada(d)} />
                ))}
              </div>
            </div>
          )}

          {/* Altas */}
          {altas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <h2 className="text-sm font-bold text-orange-700">Alta Prioridade ({altas.length})</h2>
              </div>
              <div className="space-y-2">
                {altas.map(d => (
                  <DivergenciaCard key={d.id} item={d} onClick={() => setSelecionada(d)} />
                ))}
              </div>
            </div>
          )}

          {/* Médias */}
          {medias.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Clock className="w-5 h-5 text-yellow-600" />
                <h2 className="text-sm font-bold text-yellow-700">Média Prioridade ({medias.length})</h2>
              </div>
              <div className="space-y-2">
                {medias.map(d => (
                  <DivergenciaCard key={d.id} item={d} onClick={() => setSelecionada(d)} />
                ))}
              </div>
            </div>
          )}

          {/* Resolvidas */}
          {resolvidas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h2 className="text-sm font-bold text-green-700">Resolvidas ({resolvidas.length})</h2>
              </div>
              <div className="space-y-2">
                {resolvidas.map(d => (
                  <DivergenciaCard key={d.id} item={d} onClick={() => setSelecionada(d)} />
                ))}
              </div>
            </div>
          )}

          {/* Vazio */}
          {divergencias.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-6 text-center text-green-700">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Nenhuma divergência!</p>
              <p className="text-sm opacity-75">Todas as conciliações estão em dia.</p>
            </div>
          )}
        </div>
      )}

      {/* Drawer de detalhes */}
      {selecionada && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelecionada(null)}
          />

          {/* Drawer */}
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Detalhes da Divergência</h2>
              <button
                onClick={() => setSelecionada(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
              {/* Posto e Data */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase">Posto</p>
                <p className="text-sm font-medium text-gray-800 mt-1">{selecionada.posto_nome}</p>
              </div>

              {selecionada.conciliador_responsavel && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Conciliador Responsável</p>
                  <p className="text-sm font-medium text-blue-700 mt-1 bg-blue-50 px-2 py-1 rounded">
                    {selecionada.conciliador_responsavel}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase">Data da Conciliação</p>
                <p className="text-sm font-medium text-gray-800 mt-1">{fmtData(selecionada.data)}</p>
              </div>

              {/* Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Status</p>
                  <p className={`text-sm font-medium mt-1 ${
                    selecionada.extrato_status === 'divergente'
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {selecionada.extrato_status === 'divergente' ? 'Divergente' : 'Resolvida'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Tempo Pendente</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">
                    {selecionada.dias_pendente === 0 ? 'Hoje' : `${selecionada.dias_pendente} dia${selecionada.dias_pendente !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              {/* Valores */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Extrato Bancário:</span>
                  <span className="text-sm font-mono font-semibold text-gray-900">
                    {fmtMoeda(selecionada.extrato_movimento)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">AUTOSYSTEM:</span>
                  <span className="text-sm font-mono font-semibold text-gray-900">
                    {fmtMoeda(selecionada.extrato_saldo_externo)}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Diferença:</span>
                  <span className={`text-sm font-mono font-bold ${
                    selecionada.divergencia_valor && Math.abs(selecionada.divergencia_valor) > 0.02
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {fmtMoeda(selecionada.divergencia_valor)}
                  </span>
                </div>
              </div>

              {/* Responsável */}
              {selecionada.usuario_atribuido && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Responsável</p>
                  <p className="text-sm text-gray-800 mt-1">{selecionada.usuario_atribuido}</p>
                </div>
              )}

              {/* Prioridade */}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase">Prioridade</p>
                <div className="mt-1">
                  <span className={`inline-block text-[11px] font-semibold px-2 py-1 rounded-full ${
                    selecionada.prioridade === 'urgente'
                      ? 'bg-red-100 text-red-700'
                      : selecionada.prioridade === 'alta'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {PRIORIDADE_CORES[selecionada.prioridade].label}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer com botão de ação */}
            <div className="border-t border-gray-200 p-4 flex-shrink-0">
              <Link
                href={`/tarefas?id=${selecionada.id}`}
                className="w-full flex items-center justify-center gap-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Editar Tarefa
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DivergenciaCard({ item, onClick }: { item: DivergenciaItem; onClick: () => void }) {
  const cores = PRIORIDADE_CORES[item.prioridade] || PRIORIDADE_CORES.media

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg p-3 hover:shadow-md transition-all cursor-pointer ${cores.bg}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {cores.icon}
            <span className="text-[12px] font-semibold text-gray-700">{item.posto_nome}</span>
            {item.conciliador_responsavel && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {item.conciliador_responsavel}
              </span>
            )}
            <span className="text-[11px] text-gray-500 ml-auto">{fmtData(item.data)}</span>
          </div>
          <p className="text-[13px] font-medium text-gray-800 truncate">{item.titulo}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[12px] text-gray-600">
            <span>
              Extrato: <strong>{fmtMoeda(item.extrato_movimento)}</strong>
            </span>
            <span>
              AS: <strong>{fmtMoeda(item.extrato_saldo_externo)}</strong>
            </span>
            {item.divergencia_valor != null && (
              <span className="font-mono font-semibold text-red-600">
                Diferença: {fmtMoeda(Math.abs(item.divergencia_valor))}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 whitespace-nowrap flex-shrink-0">
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
            item.prioridade === 'urgente'
              ? 'bg-red-600 text-white'
              : item.prioridade === 'alta'
                ? 'bg-orange-600 text-white'
                : 'bg-yellow-600 text-white'
          }`}>
            {cores.label}
          </span>
          <span className="text-[11px] text-gray-500">
            {item.dias_pendente === 0
              ? 'Hoje'
              : item.dias_pendente === 1
                ? '1 dia'
                : `${item.dias_pendente} dias`}
          </span>
        </div>
      </div>
    </button>
  )
}
