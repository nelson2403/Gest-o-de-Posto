'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import type { Role } from '@/types/database.types'

interface PostoRow {
  id: string
  nome: string
  codigo_empresa_externo: string | null
}

interface EmpresaExterna {
  grid: string
  codigo: string
  nome: string
  ultimo_caixa_fechado: string | null
}

export default function ControleCaixasConfigPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const podeConfigurar = can(role ?? null, 'controle_caixas.configurar')

  const [loading,  setLoading]  = useState(true)
  const [postos,   setPostos]   = useState<PostoRow[]>([])
  const [empresas, setEmpresas] = useState<EmpresaExterna[]>([])
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})
  const [salvo,    setSalvo]    = useState<Record<string, boolean>>({})
  const [erros,    setErros]    = useState<Record<string, string>>({})
  const [busca,    setBusca]    = useState('')

  useEffect(() => {
    async function init() {
      const [postosRes, empRes] = await Promise.all([
        fetch('/api/postos-mapeamento'),
        fetch('/api/caixa-externo'),
      ])
      const postosJson = await postosRes.json()
      const empJson    = await empRes.json()

      const lista: PostoRow[] = postosJson.data ?? []
      setPostos(lista)

      const initEdit: Record<string, string> = {}
      for (const p of lista) initEdit[p.id] = p.codigo_empresa_externo ?? ''
      setEditando(initEdit)

      setEmpresas(empJson.data ?? [])
      setLoading(false)
    }
    init()
  }, [])

  async function salvar(postoId: string) {
    const valor = editando[postoId]?.trim() ?? ''
    setSalvando(p => ({ ...p, [postoId]: true }))
    setErros(p => ({ ...p, [postoId]: '' }))

    const res = await fetch('/api/postos-mapeamento', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posto_id: postoId, codigo_empresa_externo: valor || null }),
    })
    const json = await res.json()

    if (json.error) {
      setErros(p => ({ ...p, [postoId]: json.error }))
    } else {
      setPostos(prev => prev.map(p => p.id === postoId ? { ...p, codigo_empresa_externo: valor || null } : p))
      setSalvo(p => ({ ...p, [postoId]: true }))
      setTimeout(() => setSalvo(p => ({ ...p, [postoId]: false })), 2000)
    }
    setSalvando(p => ({ ...p, [postoId]: false }))
  }

  const gridsUsados = new Set(postos.map(p => p.codigo_empresa_externo).filter(Boolean))
  const empresasLivres = empresas.filter(e => !gridsUsados.has(e.grid))
  const postosFiltrados = postos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))

  if (!podeConfigurar) {
    return (
      <div className="animate-fade-in">
        <Header title="Configuração de Postos" description="Controle de Caixas" />
        <div className="p-3 md:p-6">
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">Você não tem permissão para acessar esta página.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header title="Configuração de Postos" description="Vincule cada posto ao banco externo" />

      <div className="p-3 md:p-6 space-y-5 max-w-3xl">

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-9 w-56 bg-gray-200 rounded ml-auto" />
                <div className="h-9 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-gray-500">
                Vincule cada posto do sistema ao nome correspondente no banco externo.
              </p>
            </div>

            {empresasLivres.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-blue-700 mb-1.5">
                  Empresas do banco externo ainda não vinculadas ({empresasLivres.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {empresasLivres.map(e => (
                    <span key={e.grid} className="inline-block bg-white border border-blue-200 text-blue-700 text-xs px-2 py-0.5 rounded-md">
                      {e.nome}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar posto..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="space-y-2">
              {postosFiltrados.map(posto => {
                const valor = editando[posto.id] ?? ''
                const mudou = valor.trim() !== (posto.codigo_empresa_externo ?? '')
                const erro  = erros[posto.id]
                const ok    = salvo[posto.id]
                const busy  = salvando[posto.id]
                const empresaAtual = empresas.find(e => e.grid === posto.codigo_empresa_externo)

                return (
                  <div key={posto.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{posto.nome}</p>
                        {empresaAtual && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            → {empresaAtual.nome}
                            {empresaAtual.ultimo_caixa_fechado && (
                              <span className="text-gray-400 ml-1">
                                (último caixa: {empresaAtual.ultimo_caixa_fechado.split('-').reverse().join('/')})
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={valor}
                          onChange={e => setEditando(p => ({ ...p, [posto.id]: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white max-w-[260px]"
                        >
                          <option value="">— sem vínculo —</option>
                          {posto.codigo_empresa_externo && (
                            <option value={posto.codigo_empresa_externo}>
                              {empresaAtual?.nome ?? posto.codigo_empresa_externo}
                            </option>
                          )}
                          {empresasLivres.map(e => (
                            <option key={e.grid} value={e.grid}>{e.nome}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => salvar(posto.id)}
                          disabled={!mudou || busy}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                            ok
                              ? 'bg-emerald-100 text-emerald-700'
                              : mudou && !busy
                              ? 'bg-orange-500 hover:bg-orange-600 text-white'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {busy ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : ok ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Salvo
                            </>
                          ) : 'Salvar'}
                        </button>
                      </div>
                    </div>
                    {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
